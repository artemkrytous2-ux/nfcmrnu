"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthFrame, authPrimaryButton } from "@/components/auth-frame";
import { PasswordField } from "@/components/password-field";
import { getSupabase } from "@/lib/supabase";
import { establishRecoverySession } from "@/lib/password-recovery";

export function PasswordReset() {
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    void establishRecoverySession()
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
  }, []);

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
    const { error: updateError } = await getSupabase().auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      setError("Не удалось сохранить пароль. Запросите ссылку ещё раз.");
      return;
    }
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
          Ссылка недействительна или устарела. Запросите письмо ещё раз.
        </p>
        <Link href="/admin/recover" className={`${authPrimaryButton} mt-6`}>
          Запросить ссылку
        </Link>
      </AuthFrame>
    );
  }

  if (done) {
    return (
      <AuthFrame title="Пароль обновлён">
        <p className="text-[15px] leading-6 text-muted">Теперь можно войти в кабинет с новым паролем.</p>
        <Link href="/admin" className={`${authPrimaryButton} mt-6`}>
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
