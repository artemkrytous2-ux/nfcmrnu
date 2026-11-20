"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { SuperadminHome } from "@/components/superadmin-home";
import { authFieldClass, authPrimaryButton } from "@/components/auth-frame";
import { getSupabase } from "@/lib/supabase";

type Phase = "checking" | "signedOut" | "allowed" | "denied" | "error";

type SessionStatus = "superadmin" | "forbidden" | "anonymous" | "error";

export function SuperadminGate() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [gateError, setGateError] = useState("");
  const [pending, setPending] = useState(false);
  const signedInUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let request = 0;
    let supabase;
    try {
      supabase = getSupabase();
    } catch {
      setGateError("Supabase не настроен. Проверьте .env.local и перезапустите приложение.");
      setPhase("error");
      return;
    }

    const applySession = (session: Session | null) => {
      if (!active) return;
      if (!session) {
        signedInUserId.current = null;
        setAccountEmail("");
        setPhase("signedOut");
        return;
      }

      setAccountEmail(session.user.email ?? "");
      if (signedInUserId.current === session.user.id) return;

      signedInUserId.current = session.user.id;
      setPhase("checking");
      window.setTimeout(() => {
        if (active) void confirmAccess(++request);
      }, 0);
    };

    const confirmAccess = async (current: number) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!active || current !== request) return;
      if (userError || !userData.user) {
        signedInUserId.current = null;
        setAccountEmail("");
        setPhase("signedOut");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!active || current !== request) return;
      if (!token) {
        signedInUserId.current = null;
        setPhase("signedOut");
        return;
      }

      let response: Response;
      try {
        response = await fetch("/api/superadmin/session", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
      } catch {
        if (!active || current !== request) return;
        setGateError("Не удалось проверить доступ. Обновите страницу.");
        setPhase("error");
        return;
      }

      const payload = (await response.json().catch(() => null)) as { status?: SessionStatus } | null;
      if (!active || current !== request) return;

      if (payload?.status === "superadmin") {
        setGateError("");
        setPhase("allowed");
        return;
      }
      if (payload?.status === "forbidden") {
        setGateError("");
        setPhase("denied");
        return;
      }
      if (payload?.status === "anonymous") {
        signedInUserId.current = null;
        setPhase("signedOut");
        return;
      }

      setGateError("Не удалось проверить доступ. Обновите страницу.");
      setPhase("error");
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail || !password) {
      setFormError("Введите почту и пароль");
      return;
    }

    setPending(true);
    setFormError("");
    const { error } = await getSupabase().auth.signInWithPassword({
      email: nextEmail,
      password,
    });
    setPending(false);

    if (error) setFormError(loginError(error.message));
    else setPassword("");
  };

  const signOut = async () => {
    setPending(true);
    signedInUserId.current = null;
    await getSupabase().auth.signOut();
    setPassword("");
    setPending(false);
  };

  if (phase === "checking") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="h-12 w-56 animate-pulse rounded-2xl bg-card" />
        <div className="mt-6 h-40 animate-pulse rounded-3xl bg-card" />
      </div>
    );
  }

  if (phase === "error" && !accountEmail) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16 sm:px-8">
        <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
          <p className="text-sm text-accent" role="alert">
            {gateError}
          </p>
        </section>
      </div>
    );
  }

  if (phase === "signedOut") {
    return (
      <div className="min-h-dvh w-full overflow-y-auto">
        <div className="flex min-h-dvh w-full items-center justify-center px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <section className="w-full max-w-md rounded-3xl border border-line bg-card px-5 py-6 sm:px-8 sm:py-8">
            <Link href="/" className="text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">
              NFCMENU
            </Link>
            <h1 className="mt-6 text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] text-foreground">
              Вход для администратора
            </h1>
            <p className="mt-4 text-[15px] leading-6 text-muted">
              Страница только для администратора NFCMENU. Регистрации на сайте нет.
            </p>
            <form onSubmit={signIn} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-[15px]">
                <span className="text-muted">Электронная почта</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={authFieldClass}
                />
              </label>
              <label className="grid gap-2 text-[15px]">
                <span className="text-muted">Пароль</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={authFieldClass}
                />
              </label>
              {formError ? (
                <p className="text-sm text-accent" role="alert">
                  {formError}
                </p>
              ) : null}
              <button type="submit" disabled={pending} className={authPrimaryButton}>
                {pending ? "Входим…" : "Войти"}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link href="/" className="shrink-0 text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">
            NFCMENU
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[13px] text-muted">{accountEmail || "Администратор"}</p>
            <button
              type="button"
              onClick={signOut}
              disabled={pending}
              className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3 text-[13px] text-foreground disabled:opacity-60"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>
      {phase === "allowed" ? <SuperadminHome /> : null}
      {phase === "denied" ? (
        <div className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
          <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
            <h1 className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">Доступ запрещён</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-6 text-muted">
              Этот аккаунт не является администратором NFCMENU.
            </p>
          </section>
        </div>
      ) : null}
      {phase === "error" ? (
        <div className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
          <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
            <p className="text-sm text-accent" role="alert">
              {gateError}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function loginError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("invalid login")) return "Неверная почта или пароль";
  if (text.includes("email not confirmed")) return "Почта ещё не подтверждена";
  return "Не удалось войти. Проверьте почту и пароль.";
}
