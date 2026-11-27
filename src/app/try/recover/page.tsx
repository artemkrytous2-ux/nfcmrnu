import type { Metadata } from "next";
import { PasswordRecover } from "@/components/password-recover";
import { TRY_RESET_PATH } from "@/lib/password-recovery";

export const metadata: Metadata = {
  title: "Восстановление пароля — NFCMENU",
  description: "Письмо со ссылкой для нового пароля пробного аккаунта NFCMENU.",
};

export default function TryRecoverPasswordPage() {
  return (
    <div className="home min-h-full">
      <PasswordRecover
        resetPath={TRY_RESET_PATH}
        loginHref="/try"
        description="Укажите почту пробного аккаунта. Если она есть в NFCMENU, придёт письмо со ссылкой для нового пароля."
        successMessage="Если для этой почты есть аккаунт, мы отправили письмо со ссылкой. Проверьте почту и перейдите по ссылке, чтобы задать новый пароль."
      />
    </div>
  );
}
