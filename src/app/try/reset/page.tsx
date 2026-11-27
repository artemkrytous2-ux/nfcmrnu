import type { Metadata } from "next";
import { PasswordReset } from "@/components/password-reset";
import { TRY_RESET_PATH } from "@/lib/password-recovery";

export const metadata: Metadata = {
  title: "Новый пароль — NFCMENU",
  description: "Установка нового пароля пробного аккаунта NFCMENU.",
};

export default function TryResetPasswordPage() {
  return (
    <div className="home min-h-full">
      <PasswordReset
        resetPath={TRY_RESET_PATH}
        recoverHref="/try/recover"
        loginHref="/try"
        successMessage="Теперь можно войти в пробный аккаунт со старой почтой и новым паролем."
      />
    </div>
  );
}
