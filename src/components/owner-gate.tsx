"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { AdminPanel } from "@/components/admin-panel";
import { authFieldClass, authPrimaryButton, authSecondaryLink } from "@/components/auth-frame";
import { PasswordField } from "@/components/password-field";
import { getSupabase } from "@/lib/supabase";

type Phase = "checking" | "signedOut" | "checkingBusiness" | "ready" | "missing" | "error";

export function OwnerGate() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
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
        setUserId(null);
        setBusinessId(null);
        setAccountEmail("");
        setPhase("signedOut");
        return;
      }

      setAccountEmail(session.user.email ?? "");
      if (signedInUserId.current === session.user.id) return;

      signedInUserId.current = session.user.id;
      setUserId(session.user.id);
      setPhase("checkingBusiness");
      window.setTimeout(() => {
        if (active) void loadBusiness(session.user.id);
      }, 0);
    };

    const loadBusiness = async (ownerId: string) => {
      const current = ++request;
      const { data, error } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", ownerId)
        .maybeSingle();

      if (!active || current !== request) return;
      const foundId = data && typeof data.id === "string" ? data.id : null;
      if (error || (data && !foundId)) {
        setBusinessId(null);
        setGateError("Не удалось проверить заведение. Обновите страницу.");
        setPhase("error");
        return;
      }

      setGateError("");
      setBusinessId(foundId);
      setPhase(foundId ? "ready" : "missing");
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
    await getSupabase().auth.signOut();
    setPassword("");
    setPending(false);
  };

  if (phase === "checking" || phase === "checkingBusiness") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="h-12 w-56 animate-pulse rounded-2xl bg-card" />
        <div className="mt-6 h-40 animate-pulse rounded-3xl bg-card" />
      </div>
    );
  }

  if (phase === "error" && !userId) {
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
              Вход в личный кабинет
            </h1>
            <form onSubmit={signIn} className="mt-6 grid gap-4">
              <label className="grid gap-2 text-[15px]" htmlFor="owner-email">
                <span className="text-muted">Электронная почта</span>
                <input
                  id="owner-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={authFieldClass}
                />
              </label>
              <PasswordField
                id="owner-password"
                label="Пароль"
                value={password}
                autoComplete="current-password"
                onChange={setPassword}
              />
              {formError ? (
                <p className="text-[15px] text-accent" role="alert">
                  {formError}
                </p>
              ) : null}
              <button type="submit" disabled={pending} className={authPrimaryButton}>
                {pending ? "Входим…" : "Войти"}
              </button>
              <button type="button" className="justify-self-center text-[15px] text-muted">
                Забыли пароль?
              </button>
            </form>
            <Link href="/#tariffs" className={`${authSecondaryLink} mt-4`}>
              Подключить NFCMENU
            </Link>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div>
      {phase === "ready" && userId && businessId ? (
        <AdminPanel businessId={businessId} accountEmail={accountEmail} onSignOut={() => void signOut()} />
      ) : (
        <div className="mx-auto flex w-full max-w-xl items-center justify-end px-4 pt-5 sm:px-6">
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-line px-3 text-xs text-muted disabled:opacity-60"
          >
            Выйти
          </button>
        </div>
      )}
      {phase === "missing" ? (
        <div className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
          <section className="rounded-3xl border border-line bg-card p-6 sm:p-8">
            <h1 className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">Заведение пока не создано</h1>
            <p className="mt-4 max-w-xl text-[15px] leading-6 text-muted">
              Аккаунт найден, но администратор NFCMENU ещё не привязал к нему заведение. Когда
              заведение появится, кабинет откроется после повторного входа.
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
