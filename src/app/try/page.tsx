import type { Metadata } from "next";
import { TryGate } from "@/components/try-gate";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Попробовать бесплатно — NFCMENU",
  description:
    "Персональная демоверсия NFCMENU: регистрация или вход без создания настоящего заведения.",
};

export default function TryPage() {
  return (
    <div className="home">
      <SiteShell bare>
        <TryGate />
      </SiteShell>
    </div>
  );
}
