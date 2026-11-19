"use client";

import { useSearchParams } from "next/navigation";
import { BeautySite } from "@/components/beauty/beauty-site";
import { MenuBoard } from "@/components/menu-board";
import { menuTheme, menuThemeClass } from "@/lib/menu-theme";
import { usePublicMenu } from "@/lib/use-public-menu";

export function PublicMenu({ slug }: { slug: string }) {
  const { menu, theme, kind, ready, unavailable } = usePublicMenu(slug);
  const preview = useSearchParams().get("theme");
  const shown = preview === null ? theme : menuTheme(preview);

  return (
    <div className={`guest ${menuThemeClass(shown)} min-h-full`}>
      {!ready ? (
        <MenuBoard menu={null} ready={false} cartScope={slug} />
      ) : unavailable || !menu ? (
        <div className="mx-auto w-full max-w-[440px] px-4 pt-16 pb-28">
          <p className="text-[22px] leading-none font-extrabold tracking-[-0.03em] uppercase">Меню недоступно</p>
        </div>
      ) : kind === "beauty" ? (
        <BeautySite menu={menu} />
      ) : (
        <MenuBoard menu={menu} ready cartScope={slug} />
      )}
    </div>
  );
}
