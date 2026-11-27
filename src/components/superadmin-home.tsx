"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MoreHorizontal } from "lucide-react";
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

type ActivationRequest = {
  id: string;
  userId: string;
  planCode: string;
  planAmountRub: number;
  planDurationMonths: number;
  desiredSlug: string;
  contactPhone: string;
  preferredContact: string | null;
  mediaStatus?: "pending" | "ready" | "failed";
  venueName: string;
  status: string;
  errorMessage: string;
  businessId: string | null;
  createdAt: string;
};

const statusLabel: Record<string, string> = {
  draft: "Черновик",
  demo: "Демо",
  active: "Рабочее",
};

const activationStatusLabel: Record<string, string> = {
  pending: "Ожидает",
  processing: "В обработке",
  activated: "Активирована",
  failed: "Ошибка",
  cancelled: "Отменена",
};

const preferredContactLabel: Record<string, string> = {
  phone: "Звонок",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  max: "MAX",
};

export function SuperadminHome() {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [activationRequests, setActivationRequests] = useState<ActivationRequest[] | null>(null);
  const [activationError, setActivationError] = useState("");
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
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState("");
  const [activateNotice, setActivateNotice] = useState("");

  const loadActivationRequests = async () => {
    setActivationError("");
    setActivationRequests(null);
    const result = await authorized("/api/superadmin/activation-requests");
    if (!result.ok) {
      setActivationError(result.message);
      setActivationRequests(null);
      return;
    }
    const rows = Array.isArray(result.payload.requests) ? result.payload.requests : null;
    if (!rows || rows.some((row) => !isActivationRequest(row))) {
      setActivationError("Не удалось загрузить заявки на активацию");
      setActivationRequests(null);
      return;
    }
    setActivationError("");
    setActivationRequests(rows);
  };

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
    await loadActivationRequests();
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

      const activation = await authorized("/api/superadmin/activation-requests");
      if (!active) return;
      if (!activation.ok) {
        setActivationError(activation.message);
        setActivationRequests(null);
        return;
      }
      const activationRows = Array.isArray(activation.payload.requests) ? activation.payload.requests : null;
      if (!activationRows || activationRows.some((row) => !isActivationRequest(row))) {
        setActivationError("Не удалось загрузить заявки на активацию");
        setActivationRequests(null);
        return;
      }
      setActivationError("");
      setActivationRequests(activationRows);
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

  const confirmAndActivate = async (request: ActivationRequest) => {
    const venue = request.venueName || "заведение";
    const confirmed = window.confirm(
      `Оплата проверена?\n\n«${venue}» · ${request.planAmountRub.toLocaleString("ru-RU")} ₽ / ${request.planDurationMonths} мес.\nТелефон: ${request.contactPhone}\nАдрес: ${request.desiredSlug}\n\nПодтвердить оплату и активировать кабинет клиента?`,
    );
    if (!confirmed) return;

    setActivateError("");
    setActivateNotice("");
    setActivatingId(request.id);
    const result = await authorized(`/api/superadmin/activation-requests/${request.id}/activate`, {
      method: "POST",
      body: JSON.stringify({ paymentConfirmed: true }),
    });
    setActivatingId(null);
    if (!result.ok) {
      setActivateError(result.message);
      await loadActivationRequests();
      return;
    }

    const businessId =
      result.payload && typeof result.payload.businessId === "string" ? result.payload.businessId : "";
    const slugValue =
      result.payload && typeof result.payload.slug === "string" ? result.payload.slug : request.desiredSlug;
    const already =
      result.payload && typeof result.payload.alreadyActivated === "boolean"
        ? result.payload.alreadyActivated
        : false;
    setActivateNotice(
      already
        ? `Заявка уже была активирована ранее · /${slugValue}`
        : `Оплата подтверждена, заведение активировано · /${slugValue}${businessId ? ` · id ${businessId}` : ""}`,
    );
    await load();
  };

  if (openedId) {
    return (
      <div>
        <div className="mx-auto flex w-full max-w-6xl px-5 pt-5 sm:px-8">
          <button
            type="button"
            onClick={() => setOpenedId(null)}
            className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm text-foreground"
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
        <h1 className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">Заведения</h1>
      </div>

      <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
        <h2 className="text-xl font-extrabold tracking-[-0.03em]">Заявки на активацию</h2>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted">
          Заявки из персональной демоверсии. После ручной проверки оплаты нажмите «Подтвердить оплату и
          активировать» — демо перенесётся в кабинет клиента без повторного заполнения.
        </p>
        {activationError ? (
          <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
            <p className="text-sm text-foreground" role="alert">
              {activationError}
            </p>
            <button
              type="button"
              onClick={() => void loadActivationRequests()}
              className="mt-3 inline-flex h-10 items-center rounded-full border border-line bg-background px-4 text-sm"
            >
              Повторить загрузку
            </button>
          </div>
        ) : null}
        {activateError ? (
          <p className="mt-4 text-sm text-accent" role="alert">
            {activateError}
          </p>
        ) : null}
        {activateNotice ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {activateNotice}
          </p>
        ) : null}
        {!activationError && activationRequests === null ? (
          <div className="mt-4 h-24 animate-pulse rounded-2xl bg-background" />
        ) : null}
        {!activationError && activationRequests && activationRequests.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Пока нет заявок.</p>
        ) : null}
        {!activationError && activationRequests && activationRequests.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {activationRequests.map((request) => {
              const canActivate =
                request.status === "pending" ||
                request.status === "failed" ||
                request.status === "processing";
              return (
                <article key={request.id} className="rounded-2xl border border-line bg-background px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-semibold text-foreground">
                        {request.venueName || "Без названия"}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {request.planAmountRub.toLocaleString("ru-RU")} ₽ · {request.planDurationMonths} мес. ·{" "}
                        {request.desiredSlug}
                      </p>
                    </div>
                    <p className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                      {activationStatusLabel[request.status] ?? request.status}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-foreground">
                    <p>
                      Телефон:{" "}
                      <a href={`tel:${request.contactPhone}`} className="text-accent">
                        {request.contactPhone}
                      </a>
                    </p>
                    <p className="text-muted">
                      Связь:{" "}
                      {request.preferredContact
                        ? preferredContactLabel[request.preferredContact] ?? request.preferredContact
                        : "не указан"}
                      {" · "}
                      {new Date(request.createdAt).toLocaleString("ru-RU")}
                      {request.mediaStatus ? ` · фото: ${request.mediaStatus}` : null}
                    </p>
                    {request.businessId ? (
                      <p className="text-muted">Заведение: {request.businessId}</p>
                    ) : null}
                    {request.errorMessage ? (
                      <p className="text-accent">Ошибка: {request.errorMessage}</p>
                    ) : null}
                  </div>
                  {canActivate ? (
                    <button
                      type="button"
                      disabled={activatingId !== null}
                      onClick={() => void confirmAndActivate(request)}
                      className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-[#062117] disabled:opacity-60"
                    >
                      {activatingId === request.id
                        ? "Активируем…"
                        : request.status === "failed" || request.status === "processing"
                          ? "Повторить активацию"
                          : "Подтвердить оплату и активировать"}
                    </button>
                  ) : null}
                  {request.status === "activated" && request.desiredSlug ? (
                    <p className="mt-3 text-sm text-muted">
                      Активировано ·{" "}
                      <a href={`/${request.desiredSlug}`} className="text-accent">
                        /{request.desiredSlug}
                      </a>
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
        <h2 className="text-xl font-extrabold tracking-[-0.03em]">Создать заведение</h2>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted">
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
              className="home-cta h-12 rounded-full px-5 text-sm font-medium disabled:opacity-60"
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
    ok?: boolean;
    status?: string;
    message?: string;
    businesses?: unknown;
    business?: unknown;
    requests?: unknown;
    businessId?: unknown;
    slug?: unknown;
    subscriptionId?: unknown;
    alreadyActivated?: unknown;
    requestId?: unknown;
  } | null;
  const activating =
    init?.method === "POST" && path.includes("/activation-requests/") && path.endsWith("/activate");
  if (!response.ok || !payload || (activating && payload.ok !== true)) {
    const creating = init?.method === "POST" && path === "/api/superadmin/businesses";
    const loadingActivation = path === "/api/superadmin/activation-requests";
    return {
      ok: false as const,
      message:
        payload?.message ||
        (creating
          ? "Не удалось создать заведение"
          : activating
            ? "Не удалось активировать заявку"
            : loadingActivation
              ? failureMessage(payload?.status, "activation")
              : failureMessage(payload?.status, "businesses")),
    };
  }
  return { ok: true as const, payload };
}

function failureMessage(status: string | undefined, kind: "businesses" | "activation" = "businesses") {
  if (status === "anonymous") return "Сессия не подтверждена. Войдите снова.";
  if (status === "forbidden") return "Доступ запрещён";
  if (kind === "activation") return "Не удалось загрузить заявки на активацию";
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

function isActivationRequest(value: unknown): value is ActivationRequest {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ActivationRequest>;
  return (
    typeof row.id === "string" &&
    typeof row.userId === "string" &&
    typeof row.planCode === "string" &&
    typeof row.planAmountRub === "number" &&
    typeof row.planDurationMonths === "number" &&
    typeof row.desiredSlug === "string" &&
    typeof row.contactPhone === "string" &&
    typeof row.venueName === "string" &&
    typeof row.status === "string" &&
    typeof row.errorMessage === "string" &&
    typeof row.createdAt === "string" &&
    (row.preferredContact === null ||
      row.preferredContact === undefined ||
      typeof row.preferredContact === "string") &&
    (row.mediaStatus === undefined ||
      row.mediaStatus === "pending" ||
      row.mediaStatus === "ready" ||
      row.mediaStatus === "failed") &&
    (row.businessId === null || row.businessId === undefined || typeof row.businessId === "string")
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
      <h2 className="text-[15px] font-extrabold tracking-[0.04em] text-muted uppercase">{title}</h2>
      {businesses.length === 0 ? <p className="text-sm text-muted">Пока пусто</p> : null}
      {businesses.length > 0 ? (
      <ul className="rounded-3xl border border-line bg-card px-4 sm:px-5">
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
      ) : null}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"owner" | "delete" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const run = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-extrabold tracking-[-0.03em]">{business.name}</h3>
          <p className="truncate text-[13px] text-muted">
            /{business.slug}
            {" · "}
            {statusLabel[business.status] ?? business.status}
            {business.isBlocked ? " · заблокировано" : ""}
            {business.hasOwner ? "" : " · без владельца"}
          </p>
        </div>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label={`Действия: ${business.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-card"
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-30 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-1">
              <MenuItem onClick={() => run(() => onOpen(business.id))}>Открыть</MenuItem>
              {business.hasOwner ? (
                <MenuItem onClick={() => run(() => onOpen(business.id))}>Кабинет владельца</MenuItem>
              ) : null}
              <MenuItem onClick={() => run(openSite)}>Открыть сайт</MenuItem>
              <MenuItem onClick={() => run(() => void copyLink())}>Копировать ссылку</MenuItem>
              {onStatus && statusTarget ? (
                <MenuItem disabled={busy} onClick={() => run(() => onStatus(business, statusTarget.status))}>
                  {savingStatus ? "Сохраняем…" : statusTarget.label}
                </MenuItem>
              ) : null}
              {onArchive ? (
                <MenuItem disabled={busy} onClick={() => run(() => onArchive(business.id))}>
                  {archiving ? "Сохраняем…" : "В архив"}
                </MenuItem>
              ) : null}
              {onRestore ? (
                <MenuItem disabled={busy} onClick={() => run(() => onRestore(business.id))}>
                  {archiving ? "Сохраняем…" : "Восстановить"}
                </MenuItem>
              ) : null}
              {!business.hasOwner && onAssignOwner ? (
                <MenuItem onClick={() => run(() => setPanel("owner"))}>Назначить владельца</MenuItem>
              ) : null}
              {onRemove && onSlugConfirm ? (
                <MenuItem onClick={() => run(() => setPanel("delete"))}>Удалить навсегда</MenuItem>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {business.isBlocked && !business.isArchived ? (
        <p className="pb-3 text-[13px] text-accent">Заблокированное заведение нельзя активировать.</p>
      ) : null}
      {note ? (
        <p className={`pb-3 text-[13px] ${noteTone === "accent" ? "text-accent" : "text-muted"}`} role="status">
          {note}
        </p>
      ) : null}
      {panel === "owner" && !business.hasOwner && onAssignOwner ? (
        <OwnerAssignForm
          busy={busy && action?.kind === "owner"}
          onCancel={() => setPanel(null)}
          onSubmit={(email, password) => onAssignOwner(business.id, email, password)}
        />
      ) : null}
      {panel === "delete" && onRemove && onSlugConfirm ? (
        <div className="grid gap-3 pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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

function MenuItem({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-foreground hover:bg-background disabled:opacity-60"
    >
      {children}
    </button>
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
  onCancel,
}: {
  busy: boolean;
  onSubmit: (email: string, password: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const close = () => {
    setEmail("");
    setPassword("");
    setError("");
    onCancel();
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

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3 pb-4 sm:grid-cols-2">
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
          className="home-cta h-12 rounded-full px-5 text-sm font-medium disabled:opacity-60"
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

const fieldClass =
  "h-12 w-full rounded-2xl border border-line bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60";
