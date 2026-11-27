"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type OwnerMessage = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  unread: boolean;
};

export function OwnerMessages() {
  const [messages, setMessages] = useState<OwnerMessage[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    const result = await ownerAuthorized("/api/owner/messages");
    if (!result.ok) {
      setError(result.message);
      setMessages([]);
      setUnreadCount(0);
      return;
    }
    const rows = Array.isArray(result.payload.messages) ? result.payload.messages : [];
    const parsed = rows.filter(isOwnerMessage);
    setMessages(parsed);
    setUnreadCount(
      typeof result.payload.unreadCount === "number"
        ? result.payload.unreadCount
        : parsed.filter((row) => row.unread).length,
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (messageId: string) => {
    setPendingId(messageId);
    const result = await ownerAuthorized("/api/owner/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    setPendingId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await load();
  };

  return (
    <section className="mt-6 rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-extrabold tracking-[0.04em] text-muted uppercase">Сообщения</h2>
        {unreadCount > 0 ? (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-2 text-xs font-semibold text-[#062117]">
            {unreadCount}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted">Внутренние уведомления NFCMENU. Не SMS.</p>

      {error ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          {error}
        </p>
      ) : null}

      {messages === null ? (
        <div className="mt-4 h-20 animate-pulse rounded-2xl bg-background" />
      ) : messages.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Пока нет сообщений.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`rounded-2xl border px-4 py-3 ${
                message.unread ? "border-accent/40 bg-accent/10" : "border-line bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tracking-[-0.02em]">
                    {message.unread ? "Новое · " : ""}
                    {message.title}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">{formatDate(message.createdAt)}</p>
                </div>
                {message.unread ? (
                  <button
                    type="button"
                    disabled={pendingId === message.id}
                    onClick={() => void markRead(message.id)}
                    className="shrink-0 rounded-full border border-accent/40 px-3 py-1.5 text-xs text-accent disabled:opacity-60"
                  >
                    {pendingId === message.id ? "…" : "Прочитано"}
                  </button>
                ) : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-6 text-foreground">{message.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function ownerAuthorized(path: string, init?: RequestInit) {
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false as const, message: "Войдите снова" };

    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !payload || payload.ok !== true) {
      return {
        ok: false as const,
        message:
          typeof payload?.message === "string"
            ? payload.message
            : "Не удалось загрузить сообщения",
      };
    }
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, message: "Не удалось загрузить сообщения" };
  }
}

function isOwnerMessage(row: unknown): row is OwnerMessage {
  if (!row || typeof row !== "object") return false;
  const value = row as Record<string, unknown>;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.unread === "boolean"
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
