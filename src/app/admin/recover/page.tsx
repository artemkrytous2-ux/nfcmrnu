import type { Metadata } from "next";
import { PasswordRecover } from "@/components/password-recover";

export const metadata: Metadata = {
  title: "Восстановление пароля — NFCMENU",
  description: "Письмо со ссылкой для нового пароля кабинета NFCMENU.",
};

export default function RecoverPasswordPage() {
  return (
    <div className="home min-h-full">
      <PasswordRecover />
    </div>
  );
}
