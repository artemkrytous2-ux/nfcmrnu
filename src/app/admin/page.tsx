import type { Metadata } from "next";
import { OwnerGate } from "@/components/owner-gate";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Кабинет — NFCMENU",
  description: "Кабинет владельца: блюда, цены, фотографии и категории меню.",
};

export default function AdminPage() {
  return (
    <div className="home">
      <SiteShell bare>
        <OwnerGate />
      </SiteShell>
    </div>
  );
}
