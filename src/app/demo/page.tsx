import type { Metadata } from "next";
import { DemoMenu } from "@/components/demo-menu";

export const metadata: Metadata = {
  title: "Шаурма №1 — NFCMENU",
  description: "Публичное меню заведения «Шаурма №1»: категории, блюда, цены и контакты.",
};

export default function DemoPage() {
  return (
    <div className="guest menu-theme-default min-h-full">
      <DemoMenu />
    </div>
  );
}
