import type { Metadata } from "next";
import { PasswordReset } from "@/components/password-reset";

export const metadata: Metadata = {
  title: "Новый пароль — NFCMENU",
  description: "Установка нового пароля кабинета NFCMENU.",
};

export default function ResetPasswordPage() {
  return (
    <div className="home min-h-full">
      <PasswordReset />
    </div>
  );
}
