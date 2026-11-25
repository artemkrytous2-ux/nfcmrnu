"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MenuBoard } from "@/components/menu-board";
import { menuThemeClass } from "@/lib/menu-theme";
import { loadPersonalDemo } from "@/lib/personal-demo-storage";
import { getSupabase } from "@/lib/supabase";
import type { MenuState } from "@/lib/menu";
import type { MenuTheme } from "@/lib/menu-theme";

type Phase = "checking" | "signedOut" | "ready" | "error";

export function DemoPreview() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [theme, setTheme] = useState<MenuTheme>("warm");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        const supabase = getSupabase();
        const { data: userData, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !userData.user?.id) {
          setPhase("signedOut");
          return;
        }

        const loaded = loadPersonalDemo(userData.user.id);
        if (!active) return;
        if (!loaded.ok) {
          setMessage(loaded.message);
          setPhase("error");
          return;
        }

        setMenu(loaded.value.menu);
        setTheme(loaded.value.theme);
        setPhase("ready");
      } catch {
        if (!active) return;
        setMessage("Не удалось открыть предпросмотр.");
        setPhase("error");
      }
    };

    void boot();
    return () => {
      active = false;
    };
  }, []);

  if (phase === "checking") {
    return (
      <div className="mx-auto w-full max-w-[440px] px-4 py-10">
        <div className="h-8 w-40 animate-pulse rounded-full bg-card" />
        <div className="mt-6 h-40 animate-pulse rounded-[22px] bg-card" />
      </div>
    );
  }

  if (phase === "signedOut") {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16">
        <section className="rounded-3xl border border-line bg-card p-6">
          <h1 className="text-xl font-extrabold tracking-[-0.03em]">Нужен вход</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Предпросмотр персональной демоверсии доступен только после входа.
          </p>
          <Link
            href="/try"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-[#062117]"
          >
            Перейти к демо
          </Link>
        </section>
      </div>
    );
  }

  if (phase === "error" || !menu) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16">
        <section className="rounded-3xl border border-line bg-card p-6">
          <p className="text-sm text-accent" role="alert">
            {message || "Не удалось загрузить демоданные."}
          </p>
          <Link href="/try" className="mt-5 inline-flex text-sm text-muted">
            Вернуться в редактор
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={`guest min-h-full ${menuThemeClass(theme)}`}>
      <div className="mx-auto flex w-full max-w-[440px] items-center justify-between gap-3 px-4 pt-4">
        <p className="text-[11px] font-medium tracking-[0.14em] text-accent uppercase">Демо · не опубликовано</p>
        <Link href="/try" className="text-xs text-muted">
          В редактор
        </Link>
      </div>
      <MenuBoard menu={menu} ready cartScope={`personal-demo:${menu.venue.name}`} />
    </div>
  );
}
