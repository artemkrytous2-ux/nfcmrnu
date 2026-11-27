import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

export const OWNER_RESET_PATH = "/admin/reset";
export const TRY_RESET_PATH = "/try/reset";

/** Подтверждённый user id recovery-сессии в рамках текущей загрузки страницы. */
let confirmedRecoveryUserId: string | null = null;
/** Общий bootstrap, чтобы React Strict Mode не обменивал один code дважды. */
let recoveryBootstrap: Promise<boolean> | null = null;

export function recoveryRedirectUrl(resetPath: string = OWNER_RESET_PATH) {
  return `${window.location.origin}${resetPath}`;
}

export async function requestPasswordReset(
  email: string,
  resetPath: string = OWNER_RESET_PATH,
) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: recoveryRedirectUrl(resetPath),
  });
  if (!error) return { ok: true as const };
  const text = error.message.toLowerCase();
  // Не раскрываем, есть ли аккаунт с такой почтой.
  if (text.includes("not found") || text.includes("no user")) return { ok: true as const };
  if (text.includes("rate") || text.includes("too many") || text.includes("limit")) {
    return { ok: false as const, limited: true as const };
  }
  return { ok: false as const, limited: false as const };
}

export function clearPasswordRecoveryConfirmation() {
  confirmedRecoveryUserId = null;
  recoveryBootstrap = null;
}

export function isPasswordRecoveryConfirmed() {
  return Boolean(confirmedRecoveryUserId);
}

function hasAuthCallbackError(url: URL, hash: URLSearchParams) {
  const error =
    url.searchParams.get("error") ||
    url.searchParams.get("error_code") ||
    hash.get("error") ||
    hash.get("error_code");
  return Boolean(error);
}

function callbackType(url: URL, hash: URLSearchParams) {
  return hash.get("type") || url.searchParams.get("type");
}

function markRecovery(userId: string) {
  confirmedRecoveryUserId = userId;
}

async function readCurrentUserId(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) return null;
  return data.user.id;
}

/**
 * Ждём событие PASSWORD_RECOVERY от Supabase Auth (официальный сигнал recovery-сессии).
 * Подписка ставится до обмена code / setSession, чтобы не пропустить синхронный notify.
 */
function waitForPasswordRecovery(
  supabase: SupabaseClient,
  timeoutMs = 8000,
): {
  promise: Promise<Session | null>;
  cancel: () => void;
} {
  let settled = false;
  let timer: number | undefined;
  let subscription: { unsubscribe: () => void } | undefined;

  const promise = new Promise<Session | null>((resolve) => {
    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      subscription?.unsubscribe();
      resolve(session);
    };

    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user?.id) {
        finish(session);
      }
    });
    subscription = data.subscription;
    timer = window.setTimeout(() => finish(null), timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      subscription?.unsubscribe();
    },
  };
}

async function exchangePkceRecovery(supabase: SupabaseClient, code: string) {
  const wait = waitForPasswordRecovery(supabase);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const redirectType =
    data && "redirectType" in data ? (data as { redirectType?: string | null }).redirectType : null;

  if (error) {
    wait.cancel();
    return false;
  }

  // Supabase помечает PKCE recovery через redirectType из verifier (`…/recovery`).
  if (redirectType === "recovery") {
    wait.cancel();
    const userId = data.user?.id ?? (await readCurrentUserId(supabase));
    if (!userId) return false;
    markRecovery(userId);
    return true;
  }

  const recoverySession = await wait.promise;
  if (recoverySession?.user?.id) {
    markRecovery(recoverySession.user.id);
    return true;
  }

  // Сессия могла появиться от другого типа callback (signup и т.п.) — не считаем recovery.
  return false;
}

async function setImplicitRecoverySession(
  supabase: SupabaseClient,
  accessToken: string,
  refreshToken: string,
) {
  // type=recovery уже проверен вызывающим кодом по hash/query callback.
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return false;

  const userId = data.user?.id ?? (await readCurrentUserId(supabase));
  if (!userId) return false;
  markRecovery(userId);
  return true;
}

async function bootstrapRecoverySession(resetPath: string) {
  const supabase = getSupabase();
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  if (hasAuthCallbackError(url, hash)) {
    window.history.replaceState({}, "", resetPath);
    return false;
  }

  const code = url.searchParams.get("code");
  if (code) {
    const ok = await exchangePkceRecovery(supabase, code);
    window.history.replaceState({}, "", resetPath);
    return ok;
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    if (callbackType(url, hash) !== "recovery") {
      window.history.replaceState({}, "", resetPath);
      return false;
    }
    const ok = await setImplicitRecoverySession(supabase, accessToken, refreshToken);
    window.history.replaceState({}, "", resetPath);
    return ok;
  }

  // Обычная сессия через getSession() НЕ подтверждает восстановление.
  return false;
}

/**
 * Подтверждает recovery-сессию только по callback из письма Supabase Auth.
 * Обычный login/session без recovery-токена сюда не проходит.
 */
export async function establishRecoverySession(resetPath: string = OWNER_RESET_PATH) {
  if (confirmedRecoveryUserId) {
    const userId = await readCurrentUserId(getSupabase());
    if (userId && userId === confirmedRecoveryUserId) return true;
    confirmedRecoveryUserId = null;
  }

  const url = new URL(window.location.href);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hasCallback = Boolean(
    url.searchParams.get("code") || (hash.get("access_token") && hash.get("refresh_token")),
  );

  if (!hasCallback) {
    return false;
  }

  if (!recoveryBootstrap) {
    recoveryBootstrap = bootstrapRecoverySession(resetPath).then((ok) => {
      if (!ok) recoveryBootstrap = null;
      return ok;
    });
  }

  return recoveryBootstrap;
}

/** Перед updateUser: сессия всё ещё принадлежит подтверждённому recovery-пользователю. */
export async function assertPasswordRecoverySession() {
  if (!confirmedRecoveryUserId) return false;
  const userId = await readCurrentUserId(getSupabase());
  return Boolean(userId && userId === confirmedRecoveryUserId);
}
