import {
  ACTIVATION_PLANS,
  isActivationPlanCode,
  type ActivationPlanCode,
} from "@/lib/activation-plans";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionPaymentSource = "manual" | "robokassa";
export type SubscriptionChangeAction = "assign" | "extend" | "set_ends_at";

export type ApplySubscriptionChangeInput = {
  admin: SupabaseClient;
  businessId: string;
  action: SubscriptionChangeAction;
  /** Нужен для assign и extend. */
  planCode?: ActivationPlanCode;
  /** Нужен для set_ends_at. */
  endsAt?: Date | string;
  /**
   * Ожидаемый текущий ends_at (optimistic lock).
   * Обязателен для ручного extend без activation_request_id / payment_external_id.
   * Для Robokassa/активации с ключом идемпотентности можно не передавать.
   */
  expectedEndsAt?: Date | string;
  source: SubscriptionPaymentSource;
  paymentProvider?: string;
  paymentExternalId?: string;
  activationRequestId?: string;
  notes?: string;
  actorUserId?: string | null;
};

export type ApplySubscriptionChangeResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      subscriptionId: string;
      eventId: string;
      businessId: string;
      action: SubscriptionChangeAction;
      startsAt: string;
      endsAt: string;
      status: "active" | "expired" | "cancelled";
      planCode: ActivationPlanCode | null;
      daysRemaining: number;
    }
  | {
      ok: false;
      status: "invalid" | "conflict" | "error";
      message: string;
    };

type SubscriptionRow = {
  id: string;
  business_id: string;
  plan_code: string;
  plan_amount_rub: number;
  plan_duration_months: number;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string;
  payment_provider: string;
  payment_external_id: string;
  activation_request_id: string | null;
  notes: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const subscriptionSelect =
  "id, business_id, plan_code, plan_amount_rub, plan_duration_months, starts_at, ends_at, status, source, payment_provider, payment_external_id, activation_request_id, notes";

/**
 * Единый серверный механизм изменения срока подписки.
 * Сейчас — суперадмин вручную; позже — Robokassa с тем же API (source='robokassa').
 * Действия разделены: assign / extend / set_ends_at. Повтор заявки или платежа идемпотентен.
 */
export async function applySubscriptionChange(
  input: ApplySubscriptionChangeInput,
): Promise<ApplySubscriptionChangeResult> {
  if (!uuidPattern.test(input.businessId)) {
    return { ok: false, status: "invalid", message: "Некорректное заведение" };
  }
  if (input.source !== "manual" && input.source !== "robokassa") {
    return { ok: false, status: "invalid", message: "Некорректный источник" };
  }
  if (input.action !== "assign" && input.action !== "extend" && input.action !== "set_ends_at") {
    return { ok: false, status: "invalid", message: "Некорректное действие" };
  }

  const paymentExternalId = clip(input.paymentExternalId ?? "", 120);
  const activationRequestId =
    typeof input.activationRequestId === "string" && uuidPattern.test(input.activationRequestId)
      ? input.activationRequestId
      : null;

  const idempotent = await findIdempotentResult(input.admin, input.businessId, {
    activationRequestId,
    paymentExternalId,
  });
  if (idempotent) return idempotent;

  const business = await input.admin
    .from("businesses")
    .select("id")
    .eq("id", input.businessId)
    .maybeSingle();
  if (business.error) {
    return { ok: false, status: "error", message: "Не удалось проверить заведение" };
  }
  if (!business.data?.id) {
    return { ok: false, status: "invalid", message: "Заведение не найдено" };
  }

  try {
    if (input.action === "assign") return await runAssign(input, activationRequestId, paymentExternalId);
    if (input.action === "extend") return await runExtend(input, activationRequestId, paymentExternalId);
    return await runSetEndsAt(input, activationRequestId, paymentExternalId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось изменить подписку";
    const again = await findIdempotentResult(input.admin, input.businessId, {
      activationRequestId,
      paymentExternalId,
    });
    if (again) return again;
    return { ok: false, status: "error", message };
  }
}

async function runAssign(
  input: ApplySubscriptionChangeInput,
  activationRequestId: string | null,
  paymentExternalId: string,
): Promise<ApplySubscriptionChangeResult> {
  if (!isActivationPlanCode(input.planCode)) {
    return { ok: false, status: "invalid", message: "Укажите тариф 1 или 6 месяцев" };
  }
  const plan = ACTIVATION_PLANS[input.planCode];

  const active = await loadActiveSubscription(input.admin, input.businessId);
  if (active) {
    return {
      ok: false,
      status: "conflict",
      message: "У заведения уже есть активная подписка. Используйте продление или ручную дату.",
    };
  }

  const startsAt = new Date();
  const endsAt = addMonths(startsAt, plan.durationMonths);
  const notes = clip(input.notes ?? "", 2000);

  const { data, error } = await input.admin
    .from("business_subscriptions")
    .insert({
      business_id: input.businessId,
      plan_code: plan.code,
      plan_amount_rub: plan.amountRub,
      plan_duration_months: plan.durationMonths,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "active",
      source: input.source,
      payment_provider: clip(
        input.paymentProvider ?? (input.source === "robokassa" ? "robokassa" : ""),
        40,
      ),
      payment_external_id: paymentExternalId,
      activation_request_id: activationRequestId,
      notes,
    })
    .select(subscriptionSelect)
    .maybeSingle();

  if (error || !data) {
    const again = await findIdempotentResult(input.admin, input.businessId, {
      activationRequestId,
      paymentExternalId,
    });
    if (again) return again;
    throw new Error(error?.message?.includes("business_subscriptions_one_active")
      ? "У заведения уже есть активная подписка"
      : "Не удалось назначить подписку");
  }

  const row = data as SubscriptionRow;
  const eventId = await insertEvent(input.admin, {
    businessId: input.businessId,
    subscription: row,
    action: "assign",
    planCode: plan.code,
    prev: null,
    source: input.source,
    paymentProvider: row.payment_provider,
    paymentExternalId,
    activationRequestId,
    actorUserId: input.actorUserId ?? null,
    notes,
  });

  return successFromRow(row, "assign", eventId, false);
}

async function runExtend(
  input: ApplySubscriptionChangeInput,
  activationRequestId: string | null,
  paymentExternalId: string,
): Promise<ApplySubscriptionChangeResult> {
  if (!isActivationPlanCode(input.planCode)) {
    return { ok: false, status: "invalid", message: "Укажите тариф продления 1 или 6 месяцев" };
  }
  const plan = ACTIVATION_PLANS[input.planCode];
  const active = await loadActiveSubscription(input.admin, input.businessId);
  if (!active) {
    return {
      ok: false,
      status: "conflict",
      message: "Нет активной подписки для продления. Сначала назначьте подписку.",
    };
  }

  const hasIdempotencyKey = Boolean(activationRequestId || paymentExternalId);
  const expectedEndsAt = parseEndsAt(input.expectedEndsAt);

  // Ручное продление без ключа платежа/заявки — только с optimistic lock по ends_at.
  if (!hasIdempotencyKey && !expectedEndsAt) {
    return {
      ok: false,
      status: "invalid",
      message: "Укажите текущую дату окончания подписки и обновите данные перед продлением",
    };
  }

  if (expectedEndsAt) {
    const activeEndsMs = new Date(active.ends_at).getTime();
    if (Number.isNaN(activeEndsMs) || activeEndsMs !== expectedEndsAt.getTime()) {
      return {
        ok: false,
        status: "conflict",
        message: "Срок подписки уже изменился. Обновите информацию и повторите продление.",
      };
    }
  }

  const now = new Date();
  const currentEnds = new Date(active.ends_at);
  const base = currentEnds.getTime() > now.getTime() ? currentEnds : now;
  const endsAt = addMonths(base, plan.durationMonths);
  const notes = clip(input.notes ?? "", 2000);

  // Атомарно: UPDATE только если ends_at всё ещё равен прочитанному (защита от параллельных запросов).
  const { data, error } = await input.admin
    .from("business_subscriptions")
    .update({
      plan_code: plan.code,
      plan_amount_rub: plan.amountRub,
      plan_duration_months: plan.durationMonths,
      ends_at: endsAt.toISOString(),
      status: "active",
      source: input.source,
      payment_provider: clip(
        input.paymentProvider ?? active.payment_provider ?? (input.source === "robokassa" ? "robokassa" : ""),
        40,
      ),
      payment_external_id: paymentExternalId || active.payment_external_id || "",
      notes: notes || active.notes || "",
      ...(activationRequestId && !active.activation_request_id
        ? { activation_request_id: activationRequestId }
        : {}),
    })
    .eq("id", active.id)
    .eq("status", "active")
    .eq("ends_at", active.ends_at)
    .select(subscriptionSelect)
    .maybeSingle();

  if (error || !data) {
    const again = await findIdempotentResult(input.admin, input.businessId, {
      activationRequestId,
      paymentExternalId,
    });
    if (again) return again;

    const latest = await loadActiveSubscription(input.admin, input.businessId);
    if (latest && latest.ends_at !== active.ends_at) {
      return {
        ok: false,
        status: "conflict",
        message: "Срок подписки уже изменился. Обновите информацию и повторите продление.",
      };
    }
    throw new Error("Не удалось продлить подписку");
  }

  const row = data as SubscriptionRow;
  const eventId = await insertEvent(input.admin, {
    businessId: input.businessId,
    subscription: row,
    action: "extend",
    planCode: plan.code,
    prev: active,
    source: input.source,
    paymentProvider: row.payment_provider,
    paymentExternalId,
    activationRequestId,
    actorUserId: input.actorUserId ?? null,
    notes,
  });

  return successFromRow(row, "extend", eventId, false);
}

async function runSetEndsAt(
  input: ApplySubscriptionChangeInput,
  activationRequestId: string | null,
  paymentExternalId: string,
): Promise<ApplySubscriptionChangeResult> {
  const endsAt = parseEndsAt(input.endsAt);
  if (!endsAt) {
    return { ok: false, status: "invalid", message: "Укажите корректную дату окончания" };
  }

  let active = await loadActiveSubscription(input.admin, input.businessId);
  const now = new Date();
  const status = endsAt.getTime() > now.getTime() ? "active" : "expired";
  const notes = clip(input.notes ?? "", 2000);

  if (!active) {
    const planCode: ActivationPlanCode = isActivationPlanCode(input.planCode) ? input.planCode : "month_990";
    const plan = ACTIVATION_PLANS[planCode];
    const startsAt = new Date(Math.min(now.getTime(), endsAt.getTime() - 60_000));
    if (endsAt.getTime() <= startsAt.getTime()) {
      return { ok: false, status: "invalid", message: "Дата окончания должна быть позже начала" };
    }

    const { data, error } = await input.admin
      .from("business_subscriptions")
      .insert({
        business_id: input.businessId,
        plan_code: plan.code,
        plan_amount_rub: plan.amountRub,
        plan_duration_months: plan.durationMonths,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status,
        source: input.source,
        payment_provider: clip(input.paymentProvider ?? "", 40),
        payment_external_id: paymentExternalId,
        activation_request_id: activationRequestId,
        notes,
      })
      .select(subscriptionSelect)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Не удалось установить дату подписки");
    }
    active = data as SubscriptionRow;
    const eventId = await insertEvent(input.admin, {
      businessId: input.businessId,
      subscription: active,
      action: "set_ends_at",
      planCode: plan.code,
      prev: null,
      source: input.source,
      paymentProvider: active.payment_provider,
      paymentExternalId,
      activationRequestId,
      actorUserId: input.actorUserId ?? null,
      notes,
    });
    return successFromRow(active, "set_ends_at", eventId, false);
  }

  if (endsAt.getTime() <= new Date(active.starts_at).getTime()) {
    return { ok: false, status: "invalid", message: "Дата окончания должна быть позже начала подписки" };
  }

  const { data, error } = await input.admin
    .from("business_subscriptions")
    .update({
      ends_at: endsAt.toISOString(),
      status,
      notes: notes || active.notes || "",
    })
    .eq("id", active.id)
    .select(subscriptionSelect)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Не удалось обновить дату окончания");
  }

  const row = data as SubscriptionRow;
  const eventId = await insertEvent(input.admin, {
    businessId: input.businessId,
    subscription: row,
    action: "set_ends_at",
    planCode: isActivationPlanCode(row.plan_code) ? row.plan_code : null,
    prev: active,
    source: input.source,
    paymentProvider: row.payment_provider,
    paymentExternalId,
    activationRequestId,
    actorUserId: input.actorUserId ?? null,
    notes,
  });

  return successFromRow(row, "set_ends_at", eventId, false);
}

async function findIdempotentResult(
  admin: SupabaseClient,
  businessId: string,
  keys: { activationRequestId: string | null; paymentExternalId: string },
): Promise<ApplySubscriptionChangeResult | null> {
  if (keys.activationRequestId) {
    const byRequest = await admin
      .from("business_subscription_events")
      .select("id, subscription_id, action, new_starts_at, new_ends_at, new_status, plan_code, business_id")
      .eq("activation_request_id", keys.activationRequestId)
      .maybeSingle();
    if (!byRequest.error && byRequest.data?.subscription_id) {
      return successFromEvent(byRequest.data, true);
    }
    const sub = await admin
      .from("business_subscriptions")
      .select(subscriptionSelect)
      .eq("activation_request_id", keys.activationRequestId)
      .maybeSingle();
    if (sub.data) {
      const row = sub.data as SubscriptionRow;
      if (row.business_id !== businessId) {
        return {
          ok: false,
          status: "conflict",
          message: "Эта заявка уже связана с другим заведением",
        };
      }
      return successFromRow(row, "assign", "", true);
    }
  }

  if (keys.paymentExternalId) {
    const byPayment = await admin
      .from("business_subscription_events")
      .select("id, subscription_id, action, new_starts_at, new_ends_at, new_status, plan_code, business_id")
      .eq("payment_external_id", keys.paymentExternalId)
      .maybeSingle();
    if (!byPayment.error && byPayment.data?.subscription_id) {
      return successFromEvent(byPayment.data, true);
    }
    const sub = await admin
      .from("business_subscriptions")
      .select(subscriptionSelect)
      .eq("payment_external_id", keys.paymentExternalId)
      .maybeSingle();
    if (sub.data) {
      const row = sub.data as SubscriptionRow;
      if (row.business_id !== businessId) {
        return {
          ok: false,
          status: "conflict",
          message: "Этот платёж уже привязан к другому заведению",
        };
      }
      return successFromRow(row, "extend", "", true);
    }
  }

  return null;
}

async function loadActiveSubscription(admin: SupabaseClient, businessId: string) {
  const { data, error } = await admin
    .from("business_subscriptions")
    .select(subscriptionSelect)
    .eq("business_id", businessId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Не удалось проверить активную подписку");
  return (data as SubscriptionRow | null) ?? null;
}

async function insertEvent(
  admin: SupabaseClient,
  args: {
    businessId: string;
    subscription: SubscriptionRow;
    action: SubscriptionChangeAction;
    planCode: ActivationPlanCode | null;
    prev: SubscriptionRow | null;
    source: SubscriptionPaymentSource;
    paymentProvider: string;
    paymentExternalId: string;
    activationRequestId: string | null;
    actorUserId: string | null;
    notes: string;
  },
) {
  const plan = args.planCode ? ACTIVATION_PLANS[args.planCode] : null;
  const { data, error } = await admin
    .from("business_subscription_events")
    .insert({
      business_id: args.businessId,
      subscription_id: args.subscription.id,
      action: args.action,
      plan_code: plan?.code ?? null,
      plan_amount_rub: plan?.amountRub ?? null,
      plan_duration_months: plan?.durationMonths ?? null,
      prev_starts_at: args.prev?.starts_at ?? null,
      prev_ends_at: args.prev?.ends_at ?? null,
      prev_status: args.prev?.status ?? null,
      new_starts_at: args.subscription.starts_at,
      new_ends_at: args.subscription.ends_at,
      new_status: args.subscription.status,
      source: args.source,
      payment_provider: clip(args.paymentProvider, 40),
      payment_external_id: args.paymentExternalId,
      activation_request_id: args.activationRequestId,
      actor_user_id: args.actorUserId,
      notes: clip(args.notes, 2000),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return "";
    }
    const text = error.message.toLowerCase();
    if (text.includes("business_subscription_events") || text.includes("schema cache") || text.includes("does not exist")) {
      throw new Error(
        "История подписок ещё не подключена. Примените supabase/safe-migrations/54-subscription-events.sql.",
      );
    }
    throw new Error("Не удалось записать историю подписки");
  }
  return typeof data?.id === "string" ? data.id : "";
}

function successFromRow(
  row: SubscriptionRow,
  action: SubscriptionChangeAction,
  eventId: string,
  alreadyApplied: boolean,
): ApplySubscriptionChangeResult {
  return {
    ok: true,
    alreadyApplied,
    subscriptionId: row.id,
    eventId,
    businessId: row.business_id,
    action,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: normalizeStatus(row.status),
    planCode: isActivationPlanCode(row.plan_code) ? row.plan_code : null,
    daysRemaining: daysRemaining(row.ends_at),
  };
}

function successFromEvent(
  event: {
    id: string;
    subscription_id: string;
    action: string;
    new_starts_at: string;
    new_ends_at: string;
    new_status: string;
    plan_code: string | null;
    business_id: string;
  },
  alreadyApplied: boolean,
): ApplySubscriptionChangeResult {
  const action =
    event.action === "assign" || event.action === "extend" || event.action === "set_ends_at"
      ? event.action
      : "assign";
  return {
    ok: true,
    alreadyApplied,
    subscriptionId: event.subscription_id,
    eventId: event.id,
    businessId: event.business_id,
    action,
    startsAt: event.new_starts_at,
    endsAt: event.new_ends_at,
    status: normalizeStatus(event.new_status),
    planCode: isActivationPlanCode(event.plan_code) ? event.plan_code : null,
    daysRemaining: daysRemaining(event.new_ends_at),
  };
}

export function daysRemaining(endsAt: string | Date) {
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const ms = end.getTime() - Date.now();
  if (Number.isNaN(end.getTime())) return 0;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function subscriptionStatusLabel(status: string, endsAt: string) {
  if (status === "cancelled") return "Отменена";
  if (status === "expired" || daysRemaining(endsAt) <= 0) return "Истекла";
  return "Активна";
}

function normalizeStatus(status: string): "active" | "expired" | "cancelled" {
  if (status === "expired" || status === "cancelled") return status;
  return "active";
}

function parseEndsAt(value: Date | string | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function addSubscriptionMonths(date: Date, months: number) {
  return addMonths(date, months);
}

function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

export async function loadBusinessSubscriptionSummary(admin: SupabaseClient, businessId: string) {
  const { data: active } = await admin
    .from("business_subscriptions")
    .select(subscriptionSelect)
    .eq("business_id", businessId)
    .eq("status", "active")
    .maybeSingle();
  if (active) {
    const row = active as SubscriptionRow;
    return {
      subscriptionId: row.id,
      planCode: isActivationPlanCode(row.plan_code) ? row.plan_code : null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: daysRemaining(row.ends_at) > 0 ? ("active" as const) : ("expired" as const),
      daysRemaining: daysRemaining(row.ends_at),
      source: row.source,
    };
  }

  const { data: latest } = await admin
    .from("business_subscriptions")
    .select(subscriptionSelect)
    .eq("business_id", businessId)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return null;
  const row = latest as SubscriptionRow;
  return {
    subscriptionId: row.id,
    planCode: isActivationPlanCode(row.plan_code) ? row.plan_code : null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: normalizeStatus(row.status === "active" && daysRemaining(row.ends_at) <= 0 ? "expired" : row.status),
    daysRemaining: daysRemaining(row.ends_at),
    source: row.source,
  };
}
