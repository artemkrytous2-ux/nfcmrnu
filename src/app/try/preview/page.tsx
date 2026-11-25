import type { Metadata } from "next";
import { DemoPreview } from "@/components/demo-preview";

export const metadata: Metadata = {
  title: "Предпросмотр демо — NFCMENU",
  description: "Локальный предпросмотр персональной демоверсии. Не является публичной страницей заведения.",
  robots: { index: false, follow: false },
};

export default function TryPreviewPage() {
  return (
    <div className="home min-h-full">
      <DemoPreview />
    </div>
  );
}
