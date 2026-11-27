import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070807",
};

export const metadata: Metadata = {
  title: "NFCMENU",
  description:
    "Цифровое меню для кафе и ресторанов. Гость открывает страницу заведения, владелец управляет блюдами в кабинете.",
  appleWebApp: {
    capable: true,
    title: "NFCMENU",
    statusBarStyle: "black",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
