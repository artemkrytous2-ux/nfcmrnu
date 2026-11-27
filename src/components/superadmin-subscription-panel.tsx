"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type SubscriptionSummary = {
  subscriptionId?: string;
  planCode: string | null;
  startsAt?: string;
  endsAt: string;
  status: string;
  daysRemaining: number;
  statusLabel: string;
  source?: string;
};

type HistoryEvent = {
  id: string;
  action: string;
  planCode: string | null;
  prevEndsAt: string | null;
  newEndsAt: string;
  newStatus: string;
  source: string;
  notes: string;
  createdAt: string;
};

type Props = {
  businessId: string;
  businessName: string;
  initial?: {
    planCode: string | null;
    endsAt: string;
    status: string;
    daysRemaining: number;
    statusLabel: string;
  } | null;
  authorized: (
    path: string,
    init?: RequestInit,
  ) => Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; message: string }>;
  onChanged?: () => void;
};

const actionLabel: Record<string, string> = {
  assign: "Назначение",
  extend: "Продление",
  set_ends_at: "Ручная дата",
};

const planLabel: Record<string, string> = {
  month_990: "1 месяц · 990 ₽",
  months6_5490: "6 месяцев · 5 490 ₽",
};

export function SuperadminSubscriptionPanel({
  businessId,
  businessName,
  initial,
  authorized,
  onChanged,
}: Props) {
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(initial ?? null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [action, setAction] = useState<"assign" | "extend" | "set_ends_at">("extend");
  const [planCode, setPlanCode] = useState<"month_990" | "months6_5490">("month_990");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await authorized(`/api/superadmin/businesses/${businessId}/subscription`);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError("");
    const sub = result.payload.subscription;
    setSubscription(sub && typeof sub === "object" ? (sub as SubscriptionSummary) : null);
    const rows = Array.isArray(result.payload.events) ? result.payload.events : [];
    setEvents(rows.filter(isHistoryEvent));
  }, [authorized, businessId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");

    if (action === "extend" && !subscription?.endsAt) {
      setPending(false);
      setError("Обновите данные подписки перед продлением.");
      await load();
      return;
    }

    const result = await authorized(`/api/superadmin/businesses/${businessId}/subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        planCode: action === "set_ends_at" ? undefined : planCode,
        endsAt:
          action === "set_ends_at" && endsAt
            ? new Date(endsAt).toISOString()
            : undefined,
        expectedEndsAt: action === "extend" ? subscription?.endsAt : undefined,
        notes,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      if (result.message.toLowerCase().includes("изменился") || result.message.toLowerCase().includes("обновите")) {
        await load();
      }
      return;
    }

    const sub = result.payload.subscription;
    const newEnds =
      sub && typeof sub === "object" && typeof (sub as { endsAt?: unknown }).endsAt === "string"
        ? formatDate((sub as { endsAt: string }).endsAt)
        : "";

    if (result.payload.alreadyApplied === true) {
      setNotice("Операция уже была применена ранее. Повторного продления не было.");
    } else if (action === "extend") {
      setNotice(newEnds ? `Подписка продлена до ${newEnds}.` : "Подписка успешно продлена.");
    } else if (action === "assign") {
      setNotice(newEnds ? `Подписка назначена до ${newEnds}.` : "Подписка успешно назначена.");
    } else {
      setNotice(newEnds ? `Дата окончания установлена: ${newEnds}.` : "Дата окончания обновлена.");
    }
    setNotes("");
    await load();
    onChanged?.();
  };

  return (
    <div className="pb-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm text-accent"
      >
        {open ? "Скрыть подписку" : "Подписка и срок"}
        {subscription ? ` · ${subscription.statusLabel} · ${subscription.daysRemaining} дн.` : ""}
      </button>

      {open ? (
        <div className="mt-3 rounded-2xl border border-line bg-background p-4">
          <p className="text-sm text-muted">{businessName}</p>
          {subscription ? (
            <p className="mt-2 text-[15px] leading-6">
              {subscription.statusLabel}
              {" · "}
              {subscription.planCode ? planLabel[subscription.planCode] ?? subscription.planCode : "без тарифа"}
              {" · до "}
              {formatDate(subscription.endsAt)}
              {" · осталось "}
              {subscription.daysRemaining} дн.
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">Активной подписки нет.</p>
          )}

          <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm">
              <span className="text-muted">Действие</span>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as typeof action)}
                className="h-11 rounded-2xl border border-line bg-card px-3 text-[15px]"
              >
                <option value="assign">Назначить новую</option>
                <option value="extend">Продлить</option>
                <option value="set_ends_at">Установить дату окончания</option>
              </select>
            </label>

            {action !== "set_ends_at" ? (
              <label className="grid gap-2 text-sm">
                <span className="text-muted">Тариф</span>
                <select
                  value={planCode}
                  onChange={(event) => setPlanCode(event.target.value as typeof planCode)}
                  className="h-11 rounded-2xl border border-line bg-card px-3 text-[15px]"
                >
                  <option value="month_990">1 месяц · 990 ₽</option>
                  <option value="months6_5490">6 месяцев · 5 490 ₽</option>
                </select>
              </label>
            ) : (
              <label className="grid gap-2 text-sm">
                <span className="text-muted">Дата окончания</span>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  className="h-11 rounded-2xl border border-line bg-card px-3 text-[15px]"
                  required
                />
              </label>
            )}

            <label className="grid gap-2 text-sm">
              <span className="text-muted">Комментарий</span>
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
                className="h-11 rounded-2xl border border-line bg-card px-3 text-[15px]"
              />
            </label>

            {error ? (
              <p className="text-sm text-accent" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="text-sm text-muted" role="status">
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={
                pending || (action === "extend" && !subscription?.endsAt)
              }
              className="h-11 rounded-full bg-accent px-4 text-sm font-medium text-[#062117] disabled:opacity-60"
            >
              {pending
                ? action === "extend"
                  ? "Продлеваем…"
                  : "Сохраняем…"
                : action === "extend"
                  ? "Продлить"
                  : "Применить"}
            </button>
          </form>

          <div className="mt-5">
            <h4 className="text-[13px] font-semibold tracking-[0.04em] text-muted uppercase">История</h4>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Пока нет записей.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {events.map((event) => (
                  <li key={event.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                    <p className="font-medium">
                      {actionLabel[event.action] ?? event.action}
                      {event.planCode ? ` · ${planLabel[event.planCode] ?? event.planCode}` : ""}
                    </p>
                    <p className="mt-1 text-muted">
                      до {formatDate(event.newEndsAt)} · {formatDate(event.createdAt)}
                    </p>
                    {event.notes ? <p className="mt-1 text-muted">{event.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isHistoryEvent(row: unknown): row is HistoryEvent {
  if (!row || typeof row !== "object") return false;
  const value = row as Record<string, unknown>;
  return typeof value.id === "string" && typeof value.action === "string" && typeof value.newEndsAt === "string";
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
