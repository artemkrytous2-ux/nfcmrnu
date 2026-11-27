"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  ACTIVATION_PLANS,
  ACTIVATION_SUPPORT_CONTACTS,
  supportHrefForChannel,
  toActivationContactPhone,
  type ActivationContactChannel,
  type ActivationPlanCode,
} from "@/lib/activation-plans";
import {
  removeActivationMediaFolder,
  uploadActivationDemoMedia,
  type ActivationMediaPaths,
} from "@/lib/activation-media";
import { formatPhone } from "@/lib/order";
import { loadPersonalDemo, type PersonalDemoState } from "@/lib/personal-demo-storage";
import { getSupabase } from "@/lib/supabase";

type ExistingRequest = {
  id: string;
  planCode: ActivationPlanCode;
  planAmountRub: number;
  status: string;
  contactPhone: string;
  mediaStatus?: "pending" | "ready" | "failed";
  mediaPaths?: ActivationMediaPaths;
  createdAt: string;
};

const plans = [ACTIVATION_PLANS.month_990, ACTIVATION_PLANS.months6_5490] as const;

const contactButtons: { channel: ActivationContactChannel; label: string }[] = [
  { channel: "phone", label: "Позвонить" },
  { channel: "telegram", label: "Telegram" },
  { channel: "whatsapp", label: "WhatsApp" },
  { channel: "max", label: "MAX" },
];

const statusLabel: Record<string, string> = {
  pending: "Ожидает проверки",
  processing: "В обработке",
  activated: "Активирована",
  failed: "Ошибка переноса",
  cancelled: "Отменена",
};

const REPLACE_INCOMPLETE_MESSAGE =
  "Предыдущая заявка отменена, но новая не создалась. Нажмите ещё раз, чтобы отправить заявку";

export function DemoPlanCards({ userId }: { userId: string }) {
  const titleId = useId();
  const [openPlan, setOpenPlan] = useState<ActivationPlanCode | null>(null);
  const [phone, setPhone] = useState("");
  const [busyChannel, setBusyChannel] = useState<ActivationContactChannel | null>(null);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [existing, setExisting] = useState<ExistingRequest | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [pendingReplace, setPendingReplace] = useState<ExistingRequest | null>(null);
  const [replaceArmed, setReplaceArmed] = useState(false);
  const [cleanupRequestId, setCleanupRequestId] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const refreshRequests = useCallback(async () => {
    setLoadState("loading");
    setLoadError("");
    const result = await authorizedJson("/api/try/activation-requests");
    if (!result.ok) {
      setLoadState("error");
      setLoadError(result.message);
      setExisting(null);
      return;
    }
    const open = result.requests.find((row) => row.status === "pending" || row.status === "processing");
    setExisting(open ?? null);
    if (open?.contactPhone) setPhone(formatPhone(open.contactPhone));
    setLoadState("ready");
  }, []);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    if (!openPlan) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [openPlan]);

  const plan = openPlan ? ACTIVATION_PLANS[openPlan] : null;

  const runCleanup = async (oldRequestId: string) => {
    setCleanupBusy(true);
    const result = await cleanupOldMedia(oldRequestId);
    setCleanupBusy(false);
    if (!result.ok) {
      setCleanupRequestId(oldRequestId);
      setWarning(
        result.message +
          " Новая заявка сохранена. Можно повторить очистку старых фото отдельно.",
      );
      return false;
    }
    setCleanupRequestId(null);
    setWarning("");
    return true;
  };

  const submitAndContact = async (channel: ActivationContactChannel) => {
    setError("");
    setNotice("");
    setWarning("");
    setPendingReplace(null);

    const normalized = toActivationContactPhone(phone);
    if (!normalized) {
      setError("Укажите телефон в формате +7 999 123-45-67");
      return;
    }
    if (!openPlan) return;

    if (existing?.status === "processing") {
      setError("Заявка уже в обработке. Дождитесь решения администратора.");
      return;
    }

    const demo = loadPersonalDemo(userId);
    if (!demo.ok) {
      setError(demo.message || "Не удалось прочитать демоверсию");
      return;
    }

    const shouldReplace = replaceArmed;
    setBusyChannel(channel);
    setBusyLabel("Сохраняем заявку…");

    const created = await authorizedJson("/api/try/activation-requests", {
      method: "POST",
      body: JSON.stringify({
        planCode: openPlan,
        contactPhone: normalized,
        preferredContact: channel,
        replacePending: shouldReplace,
        demoState: compactDemoState(demo.value),
      }),
    });

    if (!created.ok) {
      setBusyChannel(null);
      setBusyLabel("");
      if (created.status === "plan_conflict" && created.request) {
        setReplaceArmed(false);
        setPendingReplace(created.request);
        setError(created.message);
        return;
      }
      if (created.status === "replace_incomplete") {
        setReplaceArmed(false);
        setExisting(null);
        setError(REPLACE_INCOMPLETE_MESSAGE);
        return;
      }
      setError(created.message);
      return;
    }

    setReplaceArmed(false);
    const request = created.request;
    setExisting(request);

    setBusyLabel("Загружаем фотографии…");
    const media = await finalizeMedia(request, demo.value, channel);
    setBusyChannel(null);
    setBusyLabel("");

    if (!media.ok) {
      setExisting(media.request ?? request);
      setError(media.message);
      return;
    }

    setExisting(media.request);

    if (created.replaced && created.cancelledRequestId) {
      setBusyLabel("Очищаем старые фото…");
      const cleaned = await runCleanup(created.cancelledRequestId);
      setBusyLabel("");
      setNotice(
        cleaned
          ? "Тариф обновлён, заявка и фотографии сохранены. Открываем способ связи."
          : "Тариф обновлён и заявка сохранена. Открываем способ связи.",
      );
    } else {
      setNotice("Заявка и фотографии сохранены. Открываем способ связи.");
    }

    openContact(channel);
  };

  return (
    <section id="demo-tariffs" className="scroll-mt-24">
      <div>
        <h2 className="text-[22px] leading-none font-extrabold tracking-[-0.03em]">Тарифы NFCMENU</h2>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          Выберите тариф, посмотрите состав и оставьте заявку. Связь в мессенджере не заменяет сохранение заявки.
        </p>
      </div>

      {loadState === "loading" ? (
        <div className="mt-4 h-16 animate-pulse rounded-2xl bg-card" />
      ) : null}

      {loadState === "error" ? (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
          <p className="text-sm text-foreground" role="alert">
            {loadError || "Не удалось загрузить заявки"}
          </p>
          <button
            type="button"
            onClick={() => void refreshRequests()}
            className="mt-3 inline-flex h-10 items-center rounded-full border border-line bg-card px-4 text-sm"
          >
            Повторить загрузку
          </button>
        </div>
      ) : null}

      {loadState === "ready" && existing ? (
        <p className="mt-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
          Заявка: {statusLabel[existing.status] ?? existing.status}
          {" · "}
          {existing.planAmountRub.toLocaleString("ru-RU")} ₽
          {" · "}
          {new Date(existing.createdAt).toLocaleString("ru-RU")}
          {existing.mediaStatus === "failed" ? " · фото загружены частично" : null}
        </p>
      ) : null}

      {loadState === "ready" && !existing ? (
        <p className="mt-4 text-sm text-muted">Открытых заявок пока нет.</p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {plans.map((item) => (
          <article
            key={item.code}
            className={`flex flex-col rounded-3xl border px-5 py-6 sm:px-6 ${
              item.code === "months6_5490" ? "border-accent/40 bg-accent/10" : "border-line bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-medium tracking-[0.08em] text-muted uppercase">{item.title}</h3>
              {item.code === "months6_5490" ? (
                <p className="text-[12px] font-semibold tracking-[0.06em] text-accent uppercase">Выгодно</p>
              ) : null}
            </div>
            <p className="mt-5 text-[36px] leading-none font-extrabold tracking-[-0.04em]">{item.priceLabel}</p>
            <p className="mt-2 text-sm text-muted">{item.periodLabel}</p>
            <ul className="mt-5 space-y-2.5 border-t border-line/80 pt-5 text-[14px] leading-5 text-foreground">
              {item.benefits.slice(0, 3).map((benefit) => (
                <li key={benefit} className="flex gap-2.5">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span>{benefit}</span>
                </li>
              ))}
              {item.extraBenefits.length > 0 ? (
                <li className="flex gap-2.5 font-semibold text-accent">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span>+ настройка под ключ и оформление</span>
                </li>
              ) : null}
            </ul>
            <button
              type="button"
              onClick={() => {
                setOpenPlan(item.code);
                setError("");
                setNotice("");
                setWarning("");
                setPendingReplace(null);
                setReplaceArmed(false);
              }}
              className="home-cta mt-6 inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-medium"
            >
              Подробнее
            </button>
          </article>
        ))}
      </div>

      {plan && openPlan ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 bg-black/55"
            onClick={() => setOpenPlan(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-background sm:mx-4 sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
              <div>
                <p className="text-[12px] font-medium tracking-[0.08em] text-muted uppercase">{plan.title}</p>
                <h3 id={titleId} className="mt-1 text-[24px] leading-none font-extrabold tracking-[-0.03em]">
                  {plan.priceLabel}
                </h3>
                <p className="mt-1 text-sm text-muted">{plan.periodLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenPlan(null)}
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3 text-xs text-muted"
              >
                Закрыть
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <p className="text-[13px] font-medium tracking-[0.08em] text-muted uppercase">Состав тарифа</p>
              <ul className="mt-3 space-y-2.5 text-[15px] leading-6">
                {plan.benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-3">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              {plan.extraBenefits.length > 0 ? (
                <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-4">
                  <p className="text-[13px] font-semibold tracking-[0.06em] text-accent uppercase">
                    Дополнительно в этом тарифе
                  </p>
                  <ul className="mt-3 space-y-2.5 text-[15px] leading-6">
                    {plan.extraBenefits.map((benefit) => (
                      <li key={benefit} className="flex gap-3 font-medium">
                        <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-6 border-t border-line pt-5">
                <p className="text-[13px] font-medium tracking-[0.08em] text-muted uppercase">
                  Подключить тариф / Связаться с нами
                </p>
                <p className="mt-2 text-sm leading-5 text-muted">
                  Укажите телефон. Сначала сохраняем заявку и фотографии, затем открываем способ связи.
                </p>
                <label className="mt-4 grid gap-2 text-sm">
                  <span className="text-muted">Ваш телефон</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(formatPhone(event.target.value))}
                    placeholder="+7 999 123-45-67"
                    className="h-12 w-full rounded-2xl border border-line bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-accent/60"
                    style={{ fontSize: "16px" }}
                  />
                </label>

                {error ? (
                  <p className="mt-3 text-sm text-accent" role="alert">
                    {error}
                  </p>
                ) : null}
                {warning ? (
                  <p className="mt-3 text-sm text-muted" role="status">
                    {warning}
                  </p>
                ) : null}
                {notice ? (
                  <p className="mt-3 text-sm text-muted" role="status">
                    {notice}
                  </p>
                ) : null}

                {pendingReplace ? (
                  <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
                    <p className="text-sm text-foreground">
                      Сейчас сохранена заявка на {pendingReplace.planAmountRub.toLocaleString("ru-RU")} ₽. Заменить её
                      на тариф {plan.priceLabel}? Старая заявка будет отменена.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyChannel !== null}
                        onClick={() => {
                          setReplaceArmed(true);
                          setPendingReplace(null);
                          setError("");
                          setNotice(
                            `Подтверждено: при отправке заявка будет заменена на ${plan.priceLabel}. Выберите способ связи.`,
                          );
                        }}
                        className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-medium text-[#062117] disabled:opacity-60"
                      >
                        Сменить тариф
                      </button>
                      <button
                        type="button"
                        disabled={busyChannel !== null}
                        onClick={() => {
                          setPendingReplace(null);
                          setReplaceArmed(false);
                          setError("");
                          setNotice("");
                          setOpenPlan(pendingReplace.planCode);
                        }}
                        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm disabled:opacity-60"
                      >
                        Оставить {pendingReplace.planAmountRub.toLocaleString("ru-RU")} ₽
                      </button>
                    </div>
                  </div>
                ) : null}

                {replaceArmed ? (
                  <p className="mt-3 text-sm text-muted" role="status">
                    Смена тарифа подтверждена. Выберите способ связи ниже.
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {contactButtons.map((item) => (
                    <button
                      key={item.channel}
                      type="button"
                      disabled={busyChannel !== null || loadState === "error"}
                      onClick={() => void submitAndContact(item.channel)}
                      className={`inline-flex h-12 items-center justify-center rounded-full px-3 text-sm font-medium disabled:opacity-60 ${
                        item.channel === "phone"
                          ? "bg-accent text-[#062117]"
                          : "border border-line bg-card text-foreground"
                      }`}
                    >
                      {busyChannel === item.channel ? busyLabel || "Сохраняем…" : item.label}
                    </button>
                  ))}
                </div>

                {existing?.status === "pending" && existing.mediaStatus === "failed" ? (
                  <button
                    type="button"
                    disabled={busyChannel !== null}
                    onClick={() =>
                      void retryMedia(
                        existing,
                        userId,
                        setBusyChannel,
                        setBusyLabel,
                        setError,
                        setNotice,
                        setExisting,
                      )
                    }
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full border border-line px-4 text-sm disabled:opacity-60"
                  >
                    Догрузить фотографии
                  </button>
                ) : null}

                {cleanupRequestId ? (
                  <button
                    type="button"
                    disabled={cleanupBusy || busyChannel !== null}
                    onClick={() => void runCleanup(cleanupRequestId)}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full border border-line px-4 text-sm disabled:opacity-60"
                  >
                    {cleanupBusy ? "Очищаем…" : "Повторить очистку старых фото"}
                  </button>
                ) : null}

                <p className="mt-3 text-[12px] leading-5 text-muted">
                  Телефон поддержки: {ACTIVATION_SUPPORT_CONTACTS.phoneDisplay}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

async function finalizeMedia(
  request: ExistingRequest,
  state: PersonalDemoState,
  channel: ActivationContactChannel,
): Promise<{ ok: true; request: ExistingRequest } | { ok: false; message: string; request?: ExistingRequest }> {
  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return { ok: false, message: "Не удалось подключить хранилище фотографий" };
  }

  const uploaded = await uploadActivationDemoMedia(
    supabase,
    request.id,
    state,
    request.mediaPaths,
  );

  const patchBody = {
    requestId: request.id,
    preferredContact: channel,
    mediaStatus: uploaded.ok ? ("ready" as const) : ("failed" as const),
    bannerPath: uploaded.bannerPath,
    dishImages: uploaded.dishImages,
    pwaIconPath: uploaded.pwaIconPath,
    demoState: compactDemoState(state),
  };

  const patched = await authorizedJson("/api/try/activation-requests", {
    method: "PATCH",
    body: JSON.stringify(patchBody),
  });

  if (!uploaded.ok) {
    return {
      ok: false,
      message: uploaded.message,
      request: patched.ok ? patched.request : undefined,
    };
  }

  if (!patched.ok || !patched.request) {
    return {
      ok: false,
      message: patched.ok ? "Не удалось сохранить пути фотографий" : patched.message,
    };
  }

  return { ok: true, request: patched.request };
}

async function retryMedia(
  existing: ExistingRequest | null,
  userId: string,
  setBusyChannel: (value: ActivationContactChannel | null) => void,
  setBusyLabel: (value: string) => void,
  setError: (value: string) => void,
  setNotice: (value: string) => void,
  setExisting: (value: ExistingRequest | null) => void,
) {
  if (!existing || existing.status !== "pending") return;
  setError("");
  setNotice("");
  const demo = loadPersonalDemo(userId);
  if (!demo.ok) {
    setError(demo.message || "Не удалось прочитать демоверсию");
    return;
  }
  setBusyChannel("phone");
  setBusyLabel("Догружаем фотографии…");
  const media = await finalizeMedia(existing, demo.value, "phone");
  setBusyChannel(null);
  setBusyLabel("");
  if (!media.ok) {
    setError(media.message);
    if (media.request) setExisting(media.request);
    return;
  }
  setExisting(media.request);
  setNotice("Фотографии заявки сохранены.");
}

async function cleanupOldMedia(oldRequestId: string) {
  try {
    const supabase = getSupabase();
    return await removeActivationMediaFolder(supabase, oldRequestId);
  } catch {
    return { ok: false as const, message: "Не удалось удалить фотографии старой заявки" };
  }
}

function openContact(channel: ActivationContactChannel) {
  const href = supportHrefForChannel(channel);
  if (channel === "phone") {
    window.location.href = href;
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function compactDemoState(state: PersonalDemoState): PersonalDemoState {
  return {
    userId: state.userId,
    updatedAt: state.updatedAt,
    templateVersion: state.templateVersion,
    theme: state.theme,
    menu: {
      ...state.menu,
      venue: {
        ...state.menu.venue,
        banner: stripDataUrl(state.menu.venue.banner),
      },
      dishes: state.menu.dishes.map((dish) => ({
        ...dish,
        image: stripDataUrl(dish.image),
      })),
    },
  };
}

function stripDataUrl(value: string) {
  return value.trim().toLowerCase().startsWith("data:image") ? "" : value;
}

async function authorizedJson(
  path: string,
  init?: RequestInit,
): Promise<
  | {
      ok: true;
      requests: ExistingRequest[];
      request: ExistingRequest;
      reused?: boolean;
      replaced?: boolean;
      cancelledRequestId?: string | null;
    }
  | {
      ok: false;
      message: string;
      status?: string;
      request?: ExistingRequest;
      cancelledRequestId?: string | null;
    }
> {
  let token = "";
  try {
    const supabase = getSupabase();
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) {
      return { ok: false, status: "anonymous", message: "Сессия не подтверждена. Войдите снова." };
    }
    const { data: sessionData } = await supabase.auth.getSession();
    token = sessionData.session?.access_token ?? "";
  } catch {
    return { ok: false, status: "error", message: "Не удалось проверить доступ. Обновите страницу." };
  }
  if (!token) return { ok: false, status: "anonymous", message: "Сессия не подтверждена. Войдите снова." };

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
    return { ok: false, status: "network", message: "Нет связи с сервером. Проверьте интернет и попробуйте снова." };
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    status?: string;
    message?: string;
    requests?: ExistingRequest[];
    request?: ExistingRequest;
    reused?: boolean;
    replaced?: boolean;
    cancelledRequestId?: string | null;
  } | null;

  if (!response.ok || !payload?.ok) {
    return {
      ok: false,
      status: payload?.status || (response.status === 401 ? "anonymous" : "error"),
      message:
        payload?.message ||
        (response.status === 401 ? "Сессия не подтверждена. Войдите снова." : "Не удалось выполнить запрос"),
      request: payload?.request,
      cancelledRequestId: payload?.cancelledRequestId,
    };
  }

  return {
    ok: true,
    requests: Array.isArray(payload.requests) ? payload.requests : [],
    request: payload.request as ExistingRequest,
    reused: payload.reused,
    replaced: payload.replaced,
    cancelledRequestId: payload.cancelledRequestId,
  };
}
