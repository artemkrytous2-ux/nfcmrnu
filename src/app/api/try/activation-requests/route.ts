import {
  buildActivationDemoPayload,
  mediaPathsFromPayload,
  mediaStatusFromPayload,
  sanitizeImageRef,
  type ActivationMediaStatus,
} from "@/lib/activation-demo-payload";
import {
  isActivationContactChannel,
  isActivationPlanCode,
  resolveActivationPlan,
  slugFromVenueName,
  toActivationContactPhone,
  type ActivationContactChannel,
  type ActivationPlanCode,
} from "@/lib/activation-plans";
import type { PersonalDemoState } from "@/lib/personal-demo-storage";
import { requireUserRequest, userRequestDenied } from "@/lib/user-request-server";
import type { SupabaseClient } from "@supabase/supabase-js";

type RequestRow = {
  id: string;
  plan_code: string;
  plan_amount_rub: number;
  plan_duration_months: number;
  desired_slug: string;
  contact_phone: string;
  status: string;
  demo_payload: unknown;
  error_message: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
};

const requestSelect =
  "id, plan_code, plan_amount_rub, plan_duration_months, desired_slug, contact_phone, status, demo_payload, error_message, created_at, updated_at, activated_at";

export async function GET(request: Request) {
  const access = await requireUserRequest(request);
  if (!access.ok) return userRequestDenied(access);

  const { data, error } = await access.supabase
    .from("activation_requests")
    .select(requestSelect)
    .eq("user_id", access.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json(
      {
        ok: false,
        status: classifyDbError(error.message, error.code),
        message: tableMissingMessage(error.message),
      },
      { status: statusCodeForDb(error.message, error.code) },
    );
  }

  return Response.json({
    ok: true,
    requests: Array.isArray(data) ? data.map(toPublicRequest) : [],
  });
}

export async function POST(request: Request) {
  const access = await requireUserRequest(request);
  if (!access.ok) return userRequestDenied(access);

  const body = (await request.json().catch(() => null)) as {
    planCode?: unknown;
    contactPhone?: unknown;
    preferredContact?: unknown;
    demoState?: unknown;
    replacePending?: unknown;
  } | null;

  if (!isActivationPlanCode(body?.planCode)) {
    return Response.json({ ok: false, status: "invalid", message: "Выберите тариф" }, { status: 400 });
  }

  const phone = typeof body?.contactPhone === "string" ? toActivationContactPhone(body.contactPhone) : null;
  if (!phone) {
    return Response.json(
      { ok: false, status: "invalid", message: "Укажите телефон в формате +79991234567" },
      { status: 400 },
    );
  }

  const preferredContact = parsePreferredContact(body?.preferredContact);
  if (body?.preferredContact != null && preferredContact === undefined) {
    return Response.json(
      { ok: false, status: "invalid", message: "Некорректный способ связи" },
      { status: 400 },
    );
  }

  const demoState = resolveDemoState(body?.demoState, access.user.id);
  if (!demoState) {
    return Response.json(
      { ok: false, status: "invalid", message: "Не удалось прочитать демоверсию" },
      { status: 400 },
    );
  }

  const replacePending = body?.replacePending === true;
  const plan = resolveActivationPlan(body.planCode);

  const open = await loadOpenRequest(access.supabase, access.user.id);
  if (!open.ok) {
    return Response.json(
      { ok: false, status: open.status, message: open.message },
      { status: open.httpStatus },
    );
  }

  let cancelledRequestId: string | null = null;

  if (open.row) {
    if (open.row.status === "processing") {
      return Response.json(
        {
          ok: false,
          status: "conflict",
          message: "Заявка уже в обработке. Дождитесь решения администратора.",
          request: toPublicRequest(open.row),
        },
        { status: 409 },
      );
    }

    if (open.row.plan_code === plan.plan_code) {
      return Response.json({
        ok: true,
        reused: true,
        request: toPublicRequest(open.row),
      });
    }

    if (!replacePending) {
      return Response.json(
        {
          ok: false,
          status: "plan_conflict",
          message: `У вас уже есть заявка на ${open.row.plan_amount_rub} ₽. Подтвердите смену тарифа.`,
          request: toPublicRequest(open.row),
        },
        { status: 409 },
      );
    }

    const cancelled = await access.supabase
      .from("activation_requests")
      .update({ status: "cancelled", error_message: "" })
      .eq("id", open.row.id)
      .eq("user_id", access.user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (cancelled.error || !cancelled.data) {
      return Response.json(
        {
          ok: false,
          status: "conflict",
          message: "Не удалось сменить тариф: заявка уже обрабатывается или недоступна.",
        },
        { status: 409 },
      );
    }

    cancelledRequestId = open.row.id;
  }

  const desiredSlug = slugFromVenueName(demoState.menu.venue.name, access.user.id);
  const demoPayload = buildActivationDemoPayload(demoState, preferredContact ?? null, {
    mediaStatus: "pending",
  });

  const insertRow = {
    user_id: access.user.id,
    demo_payload: demoPayload,
    plan_code: plan.plan_code,
    plan_amount_rub: plan.plan_amount_rub,
    plan_duration_months: plan.plan_duration_months,
    desired_slug: desiredSlug,
    contact_phone: phone,
    status: "pending" as const,
    error_message: "",
  };

  let inserted = await access.supabase
    .from("activation_requests")
    .insert(insertRow)
    .select(requestSelect)
    .maybeSingle();

  // После успешного cancel один безопасный повтор INSERT, без возврата старой заявки в pending.
  if ((inserted.error || !inserted.data) && cancelledRequestId) {
    inserted = await access.supabase
      .from("activation_requests")
      .insert(insertRow)
      .select(requestSelect)
      .maybeSingle();
  }

  if (inserted.error || !inserted.data) {
    if (cancelledRequestId) {
      return Response.json(
        {
          ok: false,
          status: "replace_incomplete",
          message:
            "Предыдущая заявка отменена, но новая не создалась. Нажмите ещё раз, чтобы отправить заявку",
          cancelledRequestId,
        },
        { status: 409 },
      );
    }
    const message = insertErrorMessage(inserted.error?.message, inserted.error?.code);
    const status = classifyDbError(inserted.error?.message, inserted.error?.code);
    return Response.json(
      { ok: false, status, message },
      { status: statusCodeForDb(inserted.error?.message, inserted.error?.code) },
    );
  }

  return Response.json({
    ok: true,
    reused: false,
    replaced: Boolean(cancelledRequestId),
    cancelledRequestId,
    request: toPublicRequest(inserted.data as RequestRow),
  });
}

/** Обновляет пути медиа в demo_payload после загрузки в activation-media. */
export async function PATCH(request: Request) {
  const access = await requireUserRequest(request);
  if (!access.ok) return userRequestDenied(access);

  const body = (await request.json().catch(() => null)) as {
    requestId?: unknown;
    preferredContact?: unknown;
    mediaStatus?: unknown;
    bannerPath?: unknown;
    dishImages?: unknown;
    pwaIconPath?: unknown;
    demoState?: unknown;
  } | null;

  const requestId = typeof body?.requestId === "string" ? body.requestId.trim().toLowerCase() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId)) {
    return Response.json({ ok: false, status: "invalid", message: "Некорректная заявка" }, { status: 400 });
  }

  const preferredContact = parsePreferredContact(body?.preferredContact);
  if (body?.preferredContact != null && preferredContact === undefined) {
    return Response.json(
      { ok: false, status: "invalid", message: "Некорректный способ связи" },
      { status: 400 },
    );
  }

  const mediaStatus: ActivationMediaStatus =
    body?.mediaStatus === "ready" || body?.mediaStatus === "failed" || body?.mediaStatus === "pending"
      ? body.mediaStatus
      : "pending";

  const { data: row, error: loadError } = await access.supabase
    .from("activation_requests")
    .select(requestSelect)
    .eq("id", requestId)
    .eq("user_id", access.user.id)
    .maybeSingle();

  if (loadError) {
    return Response.json(
      {
        ok: false,
        status: classifyDbError(loadError.message, loadError.code),
        message: tableMissingMessage(loadError.message),
      },
      { status: statusCodeForDb(loadError.message, loadError.code) },
    );
  }
  if (!row || (row as RequestRow).status !== "pending") {
    return Response.json(
      { ok: false, status: "conflict", message: "Медиа можно обновить только у заявки в статусе pending" },
      { status: 409 },
    );
  }

  const current = row as RequestRow;
  const demoState =
    resolveDemoState(body?.demoState, access.user.id) ??
    demoStateFromPayload(current.demo_payload, access.user.id);
  if (!demoState) {
    return Response.json(
      { ok: false, status: "invalid", message: "Не удалось прочитать демоверсию" },
      { status: 400 },
    );
  }

  const dishImages =
    body?.dishImages && typeof body.dishImages === "object" && !Array.isArray(body.dishImages)
      ? Object.fromEntries(
          Object.entries(body.dishImages as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
            .map(([id, path]) => [id, sanitizeImageRef(path, requestId)]),
        )
      : {};

  const existingPreferred = preferredContactFromPayload(current.demo_payload);
  const demoPayload = buildActivationDemoPayload(demoState, preferredContact ?? existingPreferred, {
    requestId,
    bannerPath: typeof body?.bannerPath === "string" ? body.bannerPath : undefined,
    dishImages,
    pwaIconPath: typeof body?.pwaIconPath === "string" ? body.pwaIconPath : undefined,
    mediaStatus,
  });

  const { data, error } = await access.supabase
    .from("activation_requests")
    .update({ demo_payload: demoPayload })
    .eq("id", requestId)
    .eq("user_id", access.user.id)
    .eq("status", "pending")
    .select(requestSelect)
    .maybeSingle();

  if (error || !data) {
    return Response.json(
      {
        ok: false,
        status: "invalid",
        message: error?.message?.includes("data:image")
          ? "В заявку нельзя сохранять data URL изображений"
          : "Не удалось обновить фотографии заявки",
      },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, request: toPublicRequest(data as RequestRow) });
}

async function loadOpenRequest(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("activation_requests")
    .select(requestSelect)
    .eq("user_id", userId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      status: classifyDbError(error.message, error.code),
      message: tableMissingMessage(error.message),
      httpStatus: statusCodeForDb(error.message, error.code),
    };
  }

  return { ok: true as const, row: (data as RequestRow | null) ?? null };
}

function resolveDemoState(raw: unknown, userId: string): PersonalDemoState | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as PersonalDemoState;
  if (
    candidate.userId === userId &&
    candidate.menu &&
    typeof candidate.menu === "object" &&
    Array.isArray(candidate.menu.dishes) &&
    Array.isArray(candidate.menu.categories) &&
    candidate.menu.venue &&
    typeof candidate.menu.venue.name === "string"
  ) {
    return candidate;
  }
  return null;
}

function demoStateFromPayload(payload: unknown, userId: string): PersonalDemoState | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as {
    theme?: PersonalDemoState["theme"];
    templateVersion?: number;
    menu?: PersonalDemoState["menu"];
  };
  if (!row.menu || typeof row.menu !== "object") return null;
  return {
    userId,
    updatedAt: new Date().toISOString(),
    templateVersion: typeof row.templateVersion === "number" ? row.templateVersion : 1,
    theme: row.theme ?? "warm",
    menu: row.menu,
  };
}

function toPublicRequest(row: RequestRow) {
  return {
    id: row.id,
    planCode: row.plan_code as ActivationPlanCode,
    planAmountRub: row.plan_amount_rub,
    planDurationMonths: row.plan_duration_months,
    desiredSlug: row.desired_slug,
    contactPhone: row.contact_phone,
    preferredContact: preferredContactFromPayload(row.demo_payload),
    mediaStatus: mediaStatusFromPayload(row.demo_payload),
    mediaPaths: mediaPathsFromPayload(row.demo_payload, row.id),
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activatedAt: row.activated_at,
  };
}

function preferredContactFromPayload(payload: unknown): ActivationContactChannel | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { preferredContact?: unknown }).preferredContact;
  return isActivationContactChannel(value) ? value : null;
}

function parsePreferredContact(value: unknown): ActivationContactChannel | null | undefined {
  if (value == null) return null;
  if (isActivationContactChannel(value)) return value;
  return undefined;
}

function tableMissingMessage(message: string) {
  const text = message.toLowerCase();
  if (text.includes("activation_requests") || text.includes("does not exist") || text.includes("schema cache")) {
    return "Таблица заявок ещё не подключена. Примените supabase/activation-requests.sql.";
  }
  return "Не удалось загрузить заявки";
}

function insertErrorMessage(message?: string, code?: string) {
  if (code === "42P01" || code === "PGRST205") {
    return "Таблица заявок ещё не подключена. Примените supabase/activation-requests.sql.";
  }
  if (code === "23505") {
    return "У вас уже есть открытая заявка на подключение";
  }
  if (message?.includes("У вас уже есть заведение")) {
    return "У вас уже есть заведение NFCMENU";
  }
  if (message?.toLowerCase().includes("activation_requests")) {
    return "Таблица заявок ещё не подключена. Примените supabase/activation-requests.sql.";
  }
  return "Не удалось сохранить заявку";
}

function classifyDbError(message?: string, code?: string) {
  if (code === "42P01" || code === "PGRST205") return "unavailable";
  const text = (message ?? "").toLowerCase();
  if (text.includes("does not exist") || text.includes("schema cache") || text.includes("activation_requests")) {
    return "unavailable";
  }
  return "error";
}

function statusCodeForDb(message?: string, code?: string) {
  return classifyDbError(message, code) === "unavailable" ? 503 : 500;
}
