"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authFieldClass, authPrimaryButton, authSecondaryLink } from "@/components/auth-frame";
import { DemoEditor } from "@/components/demo-editor";
import { PasswordField } from "@/components/password-field";
import { isExistingAccountError, validateOwnerAccount } from "@/lib/owner-account";
import { getSupabase } from "@/lib/supabase";

type Phase = "checking" | "signedOut" | "checkingBusiness" | "demoReady" | "redirecting" | "error";
type Mode = "login" | "register";

export function TryGate() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [demoUserId, setDemoUserId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [gateError, setGateError] = useState("");
  const [pending, setPending] = useState(false);
  const signedInUserId = useRef<string | null>(null);
  const businessRequest = useRef(0);

  useEffect(() => {
    let active = true;
    let supabase;
    try {
      supabase = getSupabase();
    } catch {
      setGateError("Supabase не настроен. Проверьте .env.local и перезапустите приложение.");
      setPhase("error");
      return;
    }

    const applyAuthenticated = async (session: Session) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (userError || !userData.user || userData.user.id !== session.user.id) {
        signedInUserId.current = null;
        setAccountEmail("");
        setGateError("Сессия не подтверждена. Войдите снова.");
        setPhase("signedOut");
        return;
      }

      setAccountEmail(userData.user.email ?? session.user.email ?? "");
      if (signedInUserId.current === userData.user.id) return;

      signedInUserId.current = userData.user.id;
      setPhase("checkingBusiness");
      void loadBusiness(userData.user.id);
    };

    const applySession = (session: Session | null) => {
      if (!active) return;
      if (!session?.user?.id) {
        signedInUserId.current = null;
        setDemoUserId(null);
        setAccountEmail("");
        setGateError("");
        setPhase("signedOut");
        return;
      }
      void applyAuthenticated(session);
    };

    const loadBusiness = async (ownerId: string) => {
      const current = ++businessRequest.current;
      const { data, error } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", ownerId)
        .maybeSingle();

      if (!active || current !== businessRequest.current) return;

      const foundId = data && typeof data.id === "string" ? data.id : null;
      if (error || (data && !foundId)) {
        setGateError("Не удалось проверить заведение. Обновите страницу.");
        setPhase("error");
        return;
      }

      setGateError("");
      if (foundId) {
        setDemoUserId(null);
        setPhase("redirecting");
        router.replace("/admin");
        return;
      }

      setDemoUserId(ownerId);
      setPhase("demoReady");
    };

    const boot = async () => {
      const linked = await establishTrySession();
      if (!active) return;
      if (linked) {
        const { data } = await supabase.auth.getSession();
        applySession(data.session);
        return;
      }
      const { data } = await supabase.auth.getSession();
      applySession(data.session);
    };

    void boot();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [router]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = validateOwnerAccount(email, password);
    if (typeof account === "string") {
      setFormError(tryAccountMessage(account));
      setFormNotice("");
      return;
    }

    setPending(true);
    setFormError("");
    setFormNotice("");
    const { error } = await getSupabase().auth.signInWithPassword({
      email: account.email,
      password,
    });
    setPending(false);

    if (error) {
      setFormError(authFormError(error.message, "login"));
      return;
    }
    setPassword("");
  };

  const signUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = validateOwnerAccount(email, password);
    if (typeof account === "string") {
      setFormError(tryAccountMessage(account));
      setFormNotice("");
      return;
    }

    setPending(true);
    setFormError("");
    setFormNotice("");

    const { data, error } = await getSupabase().auth.signUp({
      email: account.email,
      password,
      options: {
        emailRedirectTo: tryRedirectUrl(),
      },
    });
    setPending(false);

    if (error) {
      setFormError(authFormError(error.message, "register", error));
      return;
    }

    const identities = data.user?.identities;
    if (data.user && Array.isArray(identities) && identities.length === 0) {
      setFormError("Такая почта уже зарегистрирована. Войдите в аккаунт.");
      setMode("login");
      return;
    }

    if (!data.session) {
      setPassword("");
      setFormNotice(
        "Аккаунт создан. Подтвердите почту по ссылке из письма, затем войдите. Заведение при регистрации не создаётся.",
      );
      setMode("login");
      return;
    }

    setPassword("");
  };

  const signOut = async () => {
    setPending(true);
    await getSupabase().auth.signOut();
    setPassword("");
    setFormNotice("");
    setPending(false);
  };

  if (phase === "checking" || phase === "checkingBusiness" || phase === "redirecting") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="h-12 w-56 animate-pulse rounded-2xl bg-card" />
        <div className="mt-6 h-40 animate-pulse rounded-3xl bg-card" />
        {phase === "redirecting" ? (
          <p className="mt-4 text-sm text-muted">У вас уже есть заведение — открываем кабинет…</p>
        ) : null}
      </div>
    );
  }

  if (phase === "error" && !signedInUserId.current) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16 sm:px-8">
        <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
          <p className="text-sm text-accent" role="alert">
            {gateError}
          </p>
          <Link href="/" className={`${authSecondaryLink} mt-6`}>
            На главную
          </Link>
        </section>
      </div>
    );
  }

  if (phase === "signedOut") {
    return (
      <div className="min-h-dvh w-full">
        <div className="flex min-h-dvh w-full items-center justify-center px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <section className="w-full max-w-md rounded-3xl border border-line bg-card px-5 py-6 sm:px-8 sm:py-8">
            <Link href="/" className="text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">
              NFCMENU
            </Link>
            <h1 className="mt-6 text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] text-foreground">
              {mode === "register" ? "Попробовать бесплатно" : "Вход в демо"}
            </h1>
            <p className="mt-3 text-[15px] leading-6 text-muted">
              {mode === "register"
                ? "Создайте аккаунт, чтобы открыть персональную демоверсию. Настоящее заведение при регистрации не создаётся."
                : "Войдите в аккаунт, чтобы продолжить персональную демоверсию."}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-full border border-line p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setFormError("");
                  setFormNotice("");
                }}
                className={`h-10 rounded-full text-sm font-medium transition-colors ${
                  mode === "register" ? "bg-accent text-[#062117]" : "text-muted"
                }`}
              >
                Регистрация
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setFormError("");
                  setFormNotice("");
                }}
                className={`h-10 rounded-full text-sm font-medium transition-colors ${
                  mode === "login" ? "bg-accent text-[#062117]" : "text-muted"
                }`}
              >
                Вход
              </button>
            </div>

            <form onSubmit={mode === "register" ? signUp : signIn} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-[15px]" htmlFor="try-email">
                <span className="text-muted">Электронная почта</span>
                <input
                  id="try-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={authFieldClass}
                  style={{ fontSize: "16px" }}
                />
              </label>
              <PasswordField
                id="try-password"
                label="Пароль"
                value={password}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                onChange={setPassword}
              />
              {formError ? (
                <p className="text-[15px] text-accent" role="alert">
                  {formError}
                </p>
              ) : null}
              {formNotice ? (
                <p className="text-[15px] text-muted" role="status">
                  {formNotice}
                </p>
              ) : null}
              {mode === "register" ? (
                <p className="rounded-2xl border border-accent/40 bg-accent/10 px-3 py-3 text-[13px] leading-5 text-foreground">
                  После регистрации на вашу почту придёт письмо от Supabase для подтверждения email. Откройте
                  письмо и перейдите по ссылке, чтобы активировать аккаунт и начать пользоваться бесплатной
                  демоверсией NFCMENU.
                </p>
              ) : null}
              <button type="submit" disabled={pending} className={authPrimaryButton}>
                {pending
                  ? mode === "register"
                    ? "Создаём…"
                    : "Входим…"
                  : mode === "register"
                    ? "Создать аккаунт"
                    : "Войти"}
              </button>
            </form>

            <Link href="/admin" className={`${authSecondaryLink} mt-4`}>
              Уже есть заведение? Войти в кабинет
            </Link>
            <Link href="/" className="mt-3 inline-flex justify-center text-[15px] text-muted">
              На главную
            </Link>
          </section>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
          <p className="text-sm text-accent" role="alert">
            {gateError}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-4 inline-flex h-10 items-center rounded-full border border-line px-4 text-sm"
          >
            Выйти
          </button>
        </section>
      </div>
    );
  }

  if (phase === "demoReady" && demoUserId) {
    return (
      <DemoEditor
        userId={demoUserId}
        accountEmail={accountEmail}
        onSignOut={() => void signOut()}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <div className="h-12 w-56 animate-pulse rounded-2xl bg-card" />
      <div className="mt-6 h-40 animate-pulse rounded-3xl bg-card" />
    </div>
  );
}

function tryRedirectUrl() {
  return `${window.location.origin}/try`;
}

/** Подтверждение почты / PKCE: клиент создан с detectSessionInUrl=false, поэтому разбираем URL вручную. */
async function establishTrySession() {
  if (typeof window === "undefined") return false;
  const supabase = getSupabase();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    window.history.replaceState({}, "", "/try");
    return !error;
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    window.history.replaceState({}, "", "/try");
    return !error;
  }

  return false;
}

function tryAccountMessage(message: string) {
  if (message.includes("от 8 до 72")) return "Пароль должен быть от 8 до 72 символов";
  if (message.includes("корректную почту")) return "Введите корректную электронную почту";
  return "Введите почту и пароль";
}

function authFormError(
  message: string,
  mode: Mode,
  error?: { message?: string; code?: string; status?: number },
) {
  if (error && isExistingAccountError(error)) {
    return "Такая почта уже зарегистрирована. Войдите в аккаунт.";
  }
  const text = message.toLowerCase();
  if (text.includes("invalid login")) return "Неверная почта или пароль";
  if (text.includes("email not confirmed")) {
    return "Почта ещё не подтверждена. Откройте ссылку из письма и войдите снова.";
  }
  if (text.includes("already") && text.includes("registered")) {
    return "Такая почта уже зарегистрирована. Войдите в аккаунт.";
  }
  if (text.includes("password") && (text.includes("weak") || text.includes("least"))) {
    return "Пароль слишком простой. Используйте не менее 8 символов.";
  }
  if (text.includes("rate") || text.includes("too many")) {
    return "Слишком много попыток. Подождите немного и повторите.";
  }
  return mode === "register"
    ? "Не удалось создать аккаунт. Проверьте почту и пароль."
    : "Не удалось войти. Проверьте почту и пароль.";
}
