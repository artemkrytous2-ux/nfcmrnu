"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthFrame, authFieldClass, authPrimaryButton } from "@/components/auth-frame";
import { requestPasswordReset } from "@/lib/password-recovery";

export function PasswordRecover() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail) {
      setError("Введите почту");
      setMessage("");
      return;
    }

    setPending(true);
    setError("");
    setMessage("");
    const result = await requestPasswordReset(nextEmail);
    setPending(false);
    if (!result.ok) {
      setError(
        result.limited
          ? "Слишком много попыток. Подождите и попробуйте снова."
          : "Не удалось отправить письмо. Попробуйте позже.",
      );
      return;
    }
    setMessage("Если для этой почты есть кабинет, мы отправили письмо со ссылкой.");
  };

  return (
    <AuthFrame title="Восстановление пароля">
      <p className="text-[15px] leading-6 text-muted">
        Укажите почту кабинета. Если она есть в NFCMENU, придёт письмо со ссылкой для нового пароля.
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-4">
        <label className="grid gap-2 text-[15px]" htmlFor="recover-email">
          <span className="text-muted">Почта</span>
          <input
            id="recover-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={authFieldClass}
          />
        </label>
        {error ? (
          <p className="text-[15px] text-accent" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-[15px] leading-6 text-muted" role="status">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={authPrimaryButton}>
          {pending ? "Отправляем…" : "Отправить ссылку"}
        </button>
      </form>
      <Link href="/admin" className="mt-4 inline-flex text-[15px] text-muted">
        Вернуться ко входу
      </Link>
    </AuthFrame>
  );
}
