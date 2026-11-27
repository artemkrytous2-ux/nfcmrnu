import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserRequest, userRequestDenied } from "@/lib/user-request-server";

type MessageRow = {
  id: string;
  business_id: string;
  title: string;
  body: string;
  broadcast_id: string | null;
  created_at: string;
  read_at: string | null;
};

/** Сообщения текущего заведения владельца. */
export async function GET(request: Request) {
  const access = await requireUserRequest(request);
  if (!access.ok) return userRequestDenied(access);

  const businessId = await ownBusinessId(access.supabase, access.user.id);
  if (!businessId) {
    return Response.json({ ok: false, status: "missing", message: "Заведение не найдено" }, { status: 404 });
  }

  const { data, error } = await access.supabase
    .from("business_messages")
    .select("id, business_id, title, body, broadcast_id, created_at, read_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);

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

  const messages = (data as MessageRow[]).map(toMessage);
  return Response.json({
    ok: true,
    businessId,
    unreadCount: messages.filter((row) => row.unread).length,
    messages,
  });
}

/** Отметить сообщение прочитанным. */
export async function PATCH(request: Request) {
  const access = await requireUserRequest(request);
  if (!access.ok) return userRequestDenied(access);

  const body = (await request.json().catch(() => null)) as { messageId?: unknown } | null;
  const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
  if (!uuidOk(messageId)) {
    return Response.json({ ok: false, status: "invalid", message: "Некорректное сообщение" }, { status: 400 });
  }

  const businessId = await ownBusinessId(access.supabase, access.user.id);
  if (!businessId) {
    return Response.json({ ok: false, status: "missing", message: "Заведение не найдено" }, { status: 404 });
  }

  const readAt = new Date().toISOString();
  const { data, error } = await access.supabase
    .from("business_messages")
    .update({ read_at: readAt })
    .eq("id", messageId)
    .eq("business_id", businessId)
    .is("read_at", null)
    .select("id, business_id, title, body, broadcast_id, created_at, read_at")
    .maybeSingle();

  if (error) {
    return Response.json(
      { ok: false, status: "error", message: tableHint(error.message) },
      { status: 500 },
    );
  }

  if (!data) {
    const existing = await access.supabase
      .from("business_messages")
      .select("id, business_id, title, body, broadcast_id, created_at, read_at")
      .eq("id", messageId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!existing.data) {
      return Response.json({ ok: false, status: "invalid", message: "Сообщение не найдено" }, { status: 404 });
    }
    return Response.json({ ok: true, message: toMessage(existing.data as MessageRow) });
  }

  return Response.json({ ok: true, message: toMessage(data as MessageRow) });
}

async function ownBusinessId(supabase: SupabaseClient, ownerId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data?.id || typeof data.id !== "string") return null;
  return data.id;
}

function toMessage(row: MessageRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    title: row.title,
    body: row.body,
    broadcastId: row.broadcast_id,
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
