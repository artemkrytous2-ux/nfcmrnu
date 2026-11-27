"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthFrame, authPrimaryButton } from "@/components/auth-frame";
import { PasswordField } from "@/components/password-field";
import { getSupabase } from "@/lib/supabase";
import {
  OWNER_RESET_PATH,
  assertPasswordRecoverySession,
  clearPasswordRecoveryConfirmation,
  establishRecoverySession,
} from "@/lib/password-recovery";

type PasswordResetProps = {
  resetPath?: string;
  recoverHref?: string;
  loginHref?: string;
  successMessage?: string;
};

export function PasswordReset({
  resetPath = OWNER_RESET_PATH,
  recoverHref = "/admin/recover",
  loginHref = "/admin",
  successMessage = "Теперь можно войти в кабинет с новым паролем.",
}: PasswordResetProps) {
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    void establishRecoverySession(resetPath)
      .then((ok) => {
        if (!active) return;
        setValid(ok);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setValid(false);
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, [resetPath]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Пароль должен быть не короче 8 символов");
      return;
    }
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    setPending(true);
    setError("");

    const recoveryOk = await assertPasswordRecoverySession();
    if (!recoveryOk) {
      setPending(false);
      setValid(false);
      setError("Ссылка недействительна или устарела. Запросите письмо ещё раз.");
      return;
    }

    const { error: updateError } = await getSupabase().auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      const text = updateError.message.toLowerCase();
      if (text.includes("expired") || text.includes("session") || text.includes("auth")) {
        setError("Ссылка истекла или сессия недействительна. Запросите письмо ещё раз.");
        setValid(false);
      } else if (text.includes("password") && (text.includes("weak") || text.includes("least"))) {
        setError("Пароль слишком простой. Используйте не менее 8 символов.");
      } else {
        setError("Не удалось сохранить пароль. Запросите ссылку ещё раз.");
      }
      return;
    }

    clearPasswordRecoveryConfirmation();
    await getSupabase().auth.signOut();
    setPending(false);
    setDone(true);
  };

  if (!ready) {
    return (
      <AuthFrame title="Новый пароль">
        <p className="text-[15px] leading-6 text-muted">Проверяем ссылку…</p>
      </AuthFrame>
    );
  }

  if (!valid) {
    return (
      <AuthFrame title="Новый пароль">
        <p className="text-[15px] leading-6 text-muted">
          Ссылка недействительна или устарела, либо открыта без письма восстановления. Запросите новую
          ссылку, чтобы задать пароль.
        </p>
        <Link href={recoverHref} className={`${authPrimaryButton} mt-6`}>
          Запросить ссылку
        </Link>
      </AuthFrame>
    );
  }

  if (done) {
    return (
      <AuthFrame title="Пароль обновлён">
        <p className="text-[15px] leading-6 text-muted">{successMessage}</p>
        <Link href={loginHref} className={`${authPrimaryButton} mt-6`}>
          Войти
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Новый пароль">
      <form onSubmit={(event) => void submit(event)} className="grid gap-4">
        <PasswordField
          id="new-password"
          label="Новый пароль"
          value={password}
          autoComplete="new-password"
          onChange={setPassword}
        />
        <PasswordField
          id="confirm-password"
          label="Повторите пароль"
          value={confirm}
          autoComplete="new-password"
          onChange={setConfirm}
        />
        {error ? (
          <p className="text-[15px] text-accent" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={authPrimaryButton}>
          {pending ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </AuthFrame>
  );
}
