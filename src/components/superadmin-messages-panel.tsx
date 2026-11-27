"use client";

import { useEffect, useState, type FormEvent } from "react";

type BusinessOption = { id: string; name: string; slug: string };

type Props = {
  businesses: BusinessOption[];
  authorized: (
    path: string,
    init?: RequestInit,
  ) => Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; message: string }>;
};

export function SuperadminMessagesPanel({ businesses, authorized }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"one" | "all">("one");
  const [businessId, setBusinessId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!businessId && businesses[0]?.id) setBusinessId(businesses[0].id);
  }, [businesses, businessId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const result = await authorized("/api/superadmin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        toAll: mode === "all",
        businessId: mode === "one" ? businessId : undefined,
      }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const sent = typeof result.payload.sent === "number" ? result.payload.sent : 0;
    setNotice(mode === "all" ? `Отправлено заведениям: ${sent}` : "Сообщение отправлено");
    setTitle("");
    setBody("");
  };

  return (
    <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <h2 className="text-[15px] font-extrabold tracking-[0.04em] text-muted uppercase">Сообщения заведениям</h2>
      <p className="mt-2 text-sm text-muted">Внутренние уведомления в кабинете владельца. Не SMS.</p>

      <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4">
        <div className="grid grid-cols-2 gap-2 rounded-full border border-line p-1">
          <button
            type="button"
            onClick={() => setMode("one")}
            className={`h-10 rounded-full text-sm font-medium ${
              mode === "one" ? "bg-accent text-[#062117]" : "text-muted"
            }`}
          >
            Одному
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`h-10 rounded-full text-sm font-medium ${
              mode === "all" ? "bg-accent text-[#062117]" : "text-muted"
            }`}
          >
            Всем
          </button>
        </div>

        {mode === "one" ? (
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Заведение</span>
            <select
              value={businessId}
              onChange={(event) => setBusinessId(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-background px-4 text-[15px]"
            >
              {businesses.length === 0 ? <option value="">Нет заведений</option> : null}
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name} /{business.slug}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="grid gap-2 text-sm">
          <span className="text-muted">Заголовок</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            className="h-12 rounded-2xl border border-line bg-background px-4 text-[15px]"
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="text-muted">Текст</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4000}
            rows={4}
            className="rounded-2xl border border-line bg-background px-4 py-3 text-[15px]"
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
          disabled={pending || !title.trim() || !body.trim() || (mode === "one" && !businessId)}
          className="home-cta inline-flex h-12 items-center justify-center rounded-full text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Отправляем…" : "Отправить"}
        </button>
      </form>
    </section>
  );
}
