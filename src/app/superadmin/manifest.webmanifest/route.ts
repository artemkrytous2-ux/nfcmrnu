const manifest = {
  id: "/superadmin",
  name: "NFCMENU Admin",
  short_name: "Admin",
  description: "Панель супер-администратора NFCMENU.",
  start_url: "/superadmin",
  scope: "/superadmin",
  display: "standalone",
  background_color: "#070807",
  theme_color: "#070807",
  icons: [
    {
      src: "/icons/admin-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/admin-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/admin-180.png",
      sizes: "180x180",
      type: "image/png",
      purpose: "any",
    },
  ],
} as const;

export function GET() {
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
