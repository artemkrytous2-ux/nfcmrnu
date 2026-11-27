import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

const TITLE_MAX = 120;
const BODY_MAX = 4000;

type MessageRow = {
  id: string;
  business_id: string;
  title: string;
  body: string;
  broadcast_id: string | null;
  created_by: string;
  created_at: string;
  read_at: string | null;
};

/** История сообщений суперадмина. */
export async function GET(request: Request) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

  let query = access.supabase
    .from("business_messages")
    .select("id, business_id, title, body, broadcast_id, created_by, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (businessId) {
    if (!uuidOk(businessId)) {
      return Response.json({ ok: false, status: "invalid", message: "Некорректное заведение" }, { status: 400 });
    }
    query = query.eq("business_id", businessId);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    return Response.json(
      {
        ok: false,
        status: "error",
        message: tableHint(error?.message),
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    messages: (data as MessageRow[]).map(toMessage),
  });
}

/** Отправка личного или массового внутреннего сообщения. */
export async function POST(request: Request) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
    businessId?: unknown;
    toAll?: unknown;
  } | null;

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  const toAll = body?.toAll === true;
  const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";

  if (!title || title.length > TITLE_MAX) {
    return Response.json(
      { ok: false, status: "invalid", message: "Заголовок обязателен и не длиннее 120 символов" },
      { status: 400 },
    );
  }
  if (!text || text.length > BODY_MAX) {
    return Response.json(
      { ok: false, status: "invalid", message: "Текст обязателен и не длиннее 4000 символов" },
      { status: 400 },
    );
  }
  if (!toAll && !uuidOk(businessId)) {
    return Response.json(
      { ok: false, status: "invalid", message: "Укажите заведение или отправку всем" },
      { status: 400 },
    );
  }

  const { data: userData } = await access.supabase.auth.getUser();
  const createdBy = userData.user?.id;
  if (!createdBy) {
    return Response.json({ ok: false, status: "anonymous" }, { status: 401 });
  }

  let targets: string[] = [];
  if (toAll) {
    const { data: businesses, error } = await access.supabase
      .from("businesses")
      .select("id")
      .eq("is_archived", false);
    if (error || !Array.isArray(businesses)) {
      return Response.json({ ok: false, status: "error", message: "Не удалось загрузить заведения" }, { status: 500 });
    }
    targets = businesses.map((row) => row.id as string).filter(Boolean);
    if (targets.length === 0) {
      return Response.json({ ok: false, status: "invalid", message: "Нет заведений для рассылки" }, { status: 400 });
    }
  } else {
    const { data: business, error } = await access.supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .maybeSingle();
    if (error || !business?.id) {
      return Response.json({ ok: false, status: "invalid", message: "Заведение не найдено" }, { status: 404 });
    }
    targets = [business.id as string];
  }

  const broadcastId = toAll ? crypto.randomUUID() : null;
  const rows = targets.map((id) => ({
    business_id: id,
    title,
    body: text,
    broadcast_id: broadcastId,
    created_by: createdBy,
  }));

  const { data, error } = await access.supabase
    .from("business_messages")
    .insert(rows)
    .select("id, business_id, title, body, broadcast_id, created_by, created_at, read_at");

  if (error || !Array.isArray(data)) {
    return Response.json(
      {
        ok: false,
        status: "error",
        message: tableHint(error?.message) || "Не удалось отправить сообщение",
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    sent: data.length,
    broadcastId,
    messages: (data as MessageRow[]).map(toMessage),
  });
}

function toMessage(row: MessageRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    title: row.title,
    body: row.body,
    broadcastId: row.broadcast_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    readAt: row.read_at,
    unread: row.read_at == null,
  };
}

function uuidOk(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function tableHint(message?: string) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("business_messages") || text.includes("schema cache") || text.includes("does not exist")) {
    return "Таблица сообщений ещё не подключена. Примените supabase/safe-migrations/53-business-messages.sql.";
  }
  return message || "Ошибка сервера";
}
