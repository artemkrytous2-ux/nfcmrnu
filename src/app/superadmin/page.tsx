import type { Metadata } from "next";
import { SuperadminGate } from "@/components/superadmin-gate";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Администратор — NFCMENU",
  description: "Отдельный вход администратора NFCMENU.",
  applicationName: "NFCMENU Admin",
  manifest: "/superadmin/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "NFCMENU Admin",
    statusBarStyle: "black",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/admin-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/admin-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/admin-180.png", sizes: "180x180", type: "image/png" }],
  },
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
