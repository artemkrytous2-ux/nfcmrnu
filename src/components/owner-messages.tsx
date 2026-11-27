"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

type OwnerMessage = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  unread: boolean;
};

const COLLAPSE_KEY = "nfcmenu.owner.messages.collapsed";

function readCollapsedPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsedPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

export function OwnerMessages() {
  const [messages, setMessages] = useState<OwnerMessage[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
    setReady(true);
  }, []);

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

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      writeCollapsedPreference(next);
      return next;
    });
  };

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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={ready ? !collapsed : true}
          aria-controls="owner-messages-panel"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-accent">
            <Mail className="size-4" aria-hidden="true" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold tracking-[0.04em] text-muted uppercase">
              Сообщения
            </span>
            {!collapsed ? (
              <span className="mt-1 block text-sm text-muted">Внутренние уведомления NFCMENU. Не SMS.</span>
            ) : null}
          </span>
          {unreadCount > 0 ? (
            <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-accent px-2 text-xs font-semibold text-[#062117]">
              {unreadCount}
            </span>
          ) : null}
          <span
            className={`grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform ${
              collapsed ? "" : "rotate-180"
            }`}
            aria-hidden="true"
          >
            <ChevronDown className="size-4" strokeWidth={1.75} />
          </span>
        </button>
      </div>

      {!collapsed ? (
        <div id="owner-messages-panel" className="mt-4">
          {error ? (
            <p className="text-sm text-accent" role="alert">
              {error}
            </p>
          ) : null}

          {messages === null ? (
            <div className="h-20 animate-pulse rounded-2xl bg-background" />
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted">Пока нет сообщений.</p>
          ) : (
            <ul className="grid gap-3">
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
        </div>
      ) : null}
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
