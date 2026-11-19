"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminPanel } from "@/components/admin-panel";
import { businessKindChoices, type BusinessKind } from "@/lib/business-kind";
import { getSupabase } from "@/lib/supabase";

type Business = {
  id: string;
  name: string;
  slug: string;
  status: string;
  hasOwner: boolean;
  isBlocked: boolean;
  isArchived: boolean;
};

const statusLabel: Record<string, string> = {
  draft: "Черновик",
  demo: "Демо",
  active: "Рабочее",
};

export function SuperadminHome() {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [siteKind, setSiteKind] = useState<BusinessKind>("food");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<{ id: string; kind: "archive" | "delete" | "owner" | "status" } | null>(null);
  const [actionError, setActionError] = useState("");
  const [slugConfirm, setSlugConfirm] = useState<Record<string, string>>({});
  const [openedId, setOpenedId] = useState<string | null>(null);

  const load = async () => {
    const result = await authorized("/api/superadmin/businesses");
    if (!result.ok) {
      setLoadError(result.message);
      setBusinesses(null);
      return;
    }
    const rows = Array.isArray(result.payload.businesses) ? result.payload.businesses : null;
    if (!rows || rows.some((row) => !isBusiness(row))) {
      setLoadError("Не удалось загрузить заведения");
      setBusinesses(null);
      return;
    }
    setLoadError("");
    setBusinesses(rows);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await authorized("/api/superadmin/businesses");
      if (!active) return;
      if (!result.ok) {
        setLoadError(result.message);
        return;
      }
      const rows = Array.isArray(result.payload.businesses) ? result.payload.businesses : null;
      if (!rows || rows.some((row) => !isBusiness(row))) {
        setLoadError("Не удалось загрузить заведения");
        return;
      }
      setBusinesses(rows);
    })();
    return () => {
      active = false;
    };
  }, []);

  const createDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setFormError("");
    setPending(true);
    const result = await authorized("/api/superadmin/businesses", {
      method: "POST",
      body: JSON.stringify({ name, slug, kind: siteKind }),
    });
    setPending(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setName("");
    setSlug("");
    setSiteKind("food");
    setNotice("Черновик создан");
    await load();
  };

  const changeArchive = async (id: string, archived: boolean) => {
    setActionError("");
    setAction({ id, kind: "archive" });
    const result = await authorized(`/api/superadmin/businesses/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ archived }),
    });
    setAction(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    await load();
  };

  const removeForever = async (business: Business) => {
    if ((slugConfirm[business.id] ?? "") !== business.slug) {
      setActionError("Адрес страницы не совпадает");
      return;
    }
    setActionError("");
    setAction({ id: business.id, kind: "delete" });
    const result = await authorized(`/api/superadmin/businesses/${business.id}/permanent`, {
      method: "POST",
      body: JSON.stringify({ slug: business.slug }),
    });
    setAction(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    setSlugConfirm((current) => {
      const next = { ...current };
      delete next[business.id];
      return next;
    });
    await load();
  };

  const changeStatus = async (business: Business, status: "demo" | "active") => {
    const change = statusChange(business);
    if (!change || change.status !== status) return;
    if (!window.confirm(change.confirm)) return;
    setActionError("");
    setAction({ id: business.id, kind: "status" });
    const result = await authorized(`/api/superadmin/businesses/${business.id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    setAction(null);
    if (!result.ok) {
      setActionError(result.message);
      return;
    }
    await load();
  };

  const assignOwner = async (id: string, email: string, password: string) => {
    setActionError("");
    setAction({ id, kind: "owner" });
    const result = await authorized(`/api/superadmin/businesses/${id}/owner`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAction(null);
    if (!result.ok) return result.message;
    await load();
    return null;
  };

  if (openedId) {
    return (
      <div>
        <div className="mx-auto flex w-full max-w-6xl px-5 pt-8 sm:px-8">
          <button
            type="button"
            onClick={() => setOpenedId(null)}
            className="inline-flex h-9 items-center rounded-full border border-line px-3 text-xs text-muted"
          >
            К списку
          </button>
        </div>
        <AdminPanel businessId={openedId} access="superadmin" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 sm:px-8 sm:py-12">
      <div>
        <p className="text-xs font-medium tracking-[0.22em] text-accent uppercase">Администратор</p>
        <h1 className="font-display mt-2 text-4xl leading-none">Заведения</h1>
      </div>

      <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
        <h2 className="font-display text-3xl leading-none">Создать заведение</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Создаётся черновик без владельца. Публичная страница при этом не открывается.
        </p>
        <form onSubmit={createDraft} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Название</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Адрес страницы</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nazvanie-zavedeniya"
              className={fieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="text-muted">Тип сайта</span>
            <select
              value={siteKind}
              onChange={(event) => setSiteKind(event.target.value as BusinessKind)}
              className={fieldClass}
            >
              {businessKindChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.title}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            {formError ? (
              <p className="mb-3 text-sm text-accent" role="alert">
                {formError}
              </p>
            ) : null}
            {notice ? <p className="mb-3 text-sm text-muted">{notice}</p> : null}
            <button
              type="submit"
              disabled={pending}
              className="h-12 rounded-full bg-accent px-5 text-sm font-medium text-[#062117] disabled:opacity-60"
            >
              {pending ? "Создаём…" : "Создать заведение"}
            </button>
          </div>
        </form>
      </section>

      {businesses === null && !loadError ? (
        <div className="h-40 animate-pulse rounded-3xl bg-card" />
      ) : null}
      {loadError ? (
        <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
          <p className="text-sm text-accent" role="alert">
            {loadError}
          </p>
        </section>
      ) : null}
      {businesses ? (
        <div className="grid gap-8">
          {actionError ? (
            <p className="text-sm text-accent" role="alert">
              {actionError}
            </p>
          ) : null}
          <BusinessSection
            title="Черновики"
            businesses={businesses.filter((business) => business.status === "draft" && !business.isArchived)}
            action={action}
            onOpen={setOpenedId}
            onArchive={(id) => void changeArchive(id, true)}
            onStatus={(business, status) => void changeStatus(business, status)}
            onAssignOwner={assignOwner}
          />
          <BusinessSection
            title="Демо"
            businesses={businesses.filter((business) => business.status === "demo" && !business.isArchived)}
            action={action}
            onOpen={setOpenedId}
            onArchive={(id) => void changeArchive(id, true)}
            onStatus={(business, status) => void changeStatus(business, status)}
            onAssignOwner={assignOwner}
          />
          <BusinessSection
            title="Рабочие"
            businesses={businesses.filter((business) => business.status === "active" && !business.isArchived)}
            action={action}
            onOpen={setOpenedId}
            onArchive={(id) => void changeArchive(id, true)}
            onStatus={(business, status) => void changeStatus(business, status)}
            onAssignOwner={assignOwner}
          />
          <BusinessSection
            title="Архив"
            businesses={businesses.filter((business) => business.isArchived)}
            action={action}
            slugConfirm={slugConfirm}
            onSlugConfirm={(id, value) => setSlugConfirm((current) => ({ ...current, [id]: value }))}
            onOpen={setOpenedId}
            onRestore={(id) => void changeArchive(id, false)}
            onRemove={(business) => void removeForever(business)}
            onAssignOwner={assignOwner}
          />
        </div>
      ) : null}
    </div>
  );
}

async function authorized(path: string, init?: RequestInit) {
  let token = "";
  try {
    const supabase = getSupabase();
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) {
      return { ok: false as const, message: "Сессия не подтверждена. Войдите снова." };
    }
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData.session?.access_token ?? "";
  } catch {
    return { ok: false as const, message: "Не удалось проверить доступ. Обновите страницу." };
  }
  if (!token) return { ok: false as const, message: "Сессия не подтверждена. Войдите снова." };

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false as const, message: "Не удалось связаться с сервером. Попробуйте снова." };
  }

  const payload = (await response.json().catch(() => null)) as {
    status?: string;
    message?: string;
    businesses?: unknown;
    business?: unknown;
  } | null;
  if (!response.ok || !payload) {
    const creating = init?.method === "POST" && path === "/api/superadmin/businesses";
    return {
      ok: false as const,
      message: payload?.message || (creating ? "Не удалось создать заведение" : failureMessage(payload?.status)),
    };
  }
  return { ok: true as const, payload };
}

function failureMessage(status: string | undefined) {
  if (status === "anonymous") return "Сессия не подтверждена. Войдите снова.";
  if (status === "forbidden") return "Доступ запрещён";
  return "Не удалось загрузить заведения";
}

function statusChange(business: Business): { status: "demo" | "active"; label: string; confirm: string } | null {
  if (business.isBlocked || business.isArchived) return null;
  if (business.status === "draft") {
    return {
      status: "demo",
      label: "В демо",
      confirm: `Перевести «${business.name}» в демо? Страница станет публичной, меню сохранится, заказы кассиру отправляться не будут.`,
    };
  }
  if (business.status === "demo") {
    return {
      status: "active",
      label: "Сделать рабочим",
      confirm: `Перевести «${business.name}» в рабочие? Заказы смогут отправляться через Telegram и MAX.`,
    };
  }
  if (business.status === "active") {
    return {
      status: "demo",
      label: "Вернуть в демо",
      confirm: `Вернуть «${business.name}» в демо? Публичная страница останется, заказы отключатся.`,
    };
  }
  return null;
}

function isBusiness(value: unknown): value is Business {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Business>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.slug === "string" &&
    typeof row.status === "string" &&
    typeof row.hasOwner === "boolean" &&
    typeof row.isBlocked === "boolean" &&
    typeof row.isArchived === "boolean"
  );
}

function BusinessSection({
  title,
  businesses,
  action,
  slugConfirm,
  onSlugConfirm,
  onOpen,
  onArchive,
  onRestore,
  onRemove,
  onStatus,
  onAssignOwner,
}: {
  title: string;
  businesses: Business[];
  action: { id: string; kind: "archive" | "delete" | "owner" | "status" } | null;
  slugConfirm?: Record<string, string>;
  onSlugConfirm?: (id: string, value: string) => void;
  onOpen: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onRemove?: (business: Business) => void;
  onStatus?: (business: Business, status: "demo" | "active") => void;
  onAssignOwner?: (id: string, email: string, password: string) => Promise<string | null>;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="font-display text-3xl leading-none">{title}</h2>
      {businesses.length === 0 ? <p className="text-sm text-muted">Пока пусто</p> : null}
      <ul className="grid gap-3">
        {businesses.map((business) => (
          <BusinessCard
            key={business.id}
            business={business}
            action={action}
            typedSlug={slugConfirm?.[business.id] ?? ""}
            onSlugConfirm={onSlugConfirm}
            onOpen={onOpen}
            onArchive={onArchive}
            onRestore={onRestore}
            onRemove={onRemove}
            onStatus={onStatus}
            onAssignOwner={onAssignOwner}
          />
        ))}
      </ul>
    </section>
  );
}

function BusinessCard({
  business,
  action,
  typedSlug,
  onSlugConfirm,
  onOpen,
  onArchive,
  onRestore,
  onRemove,
  onStatus,
  onAssignOwner,
}: {
  business: Business;
  action: { id: string; kind: "archive" | "delete" | "owner" | "status" } | null;
  typedSlug: string;
  onSlugConfirm?: (id: string, value: string) => void;
  onOpen: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onRemove?: (business: Business) => void;
  onStatus?: (business: Business, status: "demo" | "active") => void;
  onAssignOwner?: (id: string, email: string, password: string) => Promise<string | null>;
}) {
  const [note, setNote] = useState("");
  const [noteTone, setNoteTone] = useState<"muted" | "accent">("muted");
  const busy = action?.id === business.id;
  const archiving = busy && action?.kind === "archive";
  const deleting = busy && action?.kind === "delete";
  const savingStatus = busy && action?.kind === "status";
  const statusTarget = statusChange(business);
  const published = isPublic(business);

  const showNote = (message: string, tone: "muted" | "accent") => {
    setNoteTone(tone);
    setNote(message);
  };

  const openSite = () => {
    if (!published) {
      showNote(
        business.status === "draft"
          ? "Публичная страница скрыта. Сначала переведите заведение в демо."
          : "Публичная страница скрыта, пока заведение заблокировано или находится в архиве.",
        "accent",
      );
      return;
    }
    window.open(publicUrl(business.slug), "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl(business.slug));
      showNote("Ссылка скопирована", "muted");
    } catch {
      showNote("Не удалось скопировать ссылку", "accent");
    }
  };

  return (
    <li className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-2xl leading-none sm:text-3xl">{business.name}</h3>
        <span className="rounded-full border border-accent/40 px-2.5 py-1 text-[11px] tracking-[0.14em] text-accent uppercase">
          {statusLabel[business.status] ?? business.status}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-muted">/{business.slug}</p>
      <p className="mt-2 text-xs text-muted sm:text-sm">
        Владелец: {business.hasOwner ? "назначен" : "не назначен"}
        {" · "}
        Блокировка: {business.isBlocked ? "да" : "нет"}
      </p>
      {business.isBlocked && !business.isArchived ? (
        <p className="mt-2 text-xs text-accent">Заблокированное заведение нельзя активировать.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onStatus && statusTarget ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(business, statusTarget.status)}
            className={accentButton}
          >
            {savingStatus ? "Сохраняем…" : statusTarget.label}
          </button>
        ) : null}
        <button type="button" onClick={openSite} className={quietButton}>
          Открыть сайт
        </button>
        <button type="button" onClick={() => void copyLink()} className={quietButton}>
          Копировать ссылку
        </button>
        {business.hasOwner ? (
          <button
            type="button"
            onClick={() => window.open("/admin", "_blank", "noopener,noreferrer")}
            className={quietButton}
          >
            Кабинет владельца
          </button>
        ) : null}
        <button type="button" onClick={() => onOpen(business.id)} className={quietButton}>
          Открыть
        </button>
        {onArchive ? (
          <button type="button" disabled={busy} onClick={() => onArchive(business.id)} className={quietButton}>
            {archiving ? "Сохраняем…" : "В архив"}
          </button>
        ) : null}
        {onRestore ? (
          <button type="button" disabled={busy} onClick={() => onRestore(business.id)} className={quietButton}>
            {archiving ? "Сохраняем…" : "Восстановить"}
          </button>
        ) : null}
      </div>
      {note ? (
        <p className={`mt-3 text-sm ${noteTone === "accent" ? "text-accent" : "text-muted"}`} role="status">
          {note}
        </p>
      ) : null}
      {!business.hasOwner && onAssignOwner ? (
        <OwnerAssignForm
          busy={busy && action?.kind === "owner"}
          onSubmit={(email, password) => onAssignOwner(business.id, email, password)}
        />
      ) : null}
      {onRemove && onSlugConfirm ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-2 text-sm">
            <span className="text-muted">Введите адрес страницы, чтобы удалить навсегда</span>
            <input
              value={typedSlug}
              onChange={(event) => onSlugConfirm(business.id, event.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              className={fieldClass}
            />
          </label>
          <button
            type="button"
            disabled={busy || typedSlug !== business.slug}
            onClick={() => onRemove(business)}
            className="h-12 rounded-full border border-line px-5 text-sm text-accent disabled:opacity-60"
          >
            {deleting ? "Удаляем…" : "Удалить навсегда"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function isPublic(business: Business) {
  return (business.status === "demo" || business.status === "active") && !business.isBlocked && !business.isArchived;
}

function publicUrl(slug: string) {
  return `${window.location.origin}/m/${slug}`;
}

function OwnerAssignForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (email: string, password: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setEmail("");
    setPassword("");
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const message = await onSubmit(email, password);
    if (message) {
      setError(message);
      return;
    }
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className="mt-5 inline-flex h-9 items-center rounded-full border border-line px-3 text-xs text-muted disabled:opacity-60"
      >
        Назначить владельца
      </button>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2 text-sm">
        <span className="text-muted">Email владельца</span>
        <input
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span className="text-muted">Пароль</span>
        <input
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
      </label>
      {error ? (
        <p className="text-sm text-accent sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-full bg-accent px-5 text-sm font-medium text-[#062117] disabled:opacity-60"
        >
          {busy ? "Создаём…" : "Создать аккаунт и назначить"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={close}
          className="h-12 rounded-full border border-line px-5 text-sm text-muted disabled:opacity-60"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

const quietButton =
  "inline-flex h-9 items-center justify-center rounded-full border border-line px-3 text-xs text-muted disabled:opacity-60";
const accentButton =
  "inline-flex h-9 items-center justify-center rounded-full bg-accent px-3 text-xs font-medium text-[#062117] disabled:opacity-60";
const fieldClass =
  "h-12 w-full rounded-2xl border border-line bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60";
