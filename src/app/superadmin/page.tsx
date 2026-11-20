import type { Metadata } from "next";
import { SuperadminGate } from "@/components/superadmin-gate";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Администратор — NFCMENU",
  description: "Отдельный вход администратора NFCMENU.",
};

export default function SuperadminPage() {
  return (
    <div className="home">
      <SiteShell bare>
        <SuperadminGate />
      </SiteShell>
    </div>
  );
}
