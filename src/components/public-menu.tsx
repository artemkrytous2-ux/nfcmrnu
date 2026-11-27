"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MenuBoard } from "@/components/menu-board";
import { menuTheme, menuThemeClass } from "@/lib/menu-theme";
import type { PublicMenuData } from "@/lib/public-menu";
import { usePublicMenu } from "@/lib/use-public-menu";

const BeautySite = dynamic(
  () => import("@/components/beauty/beauty-site").then((mod) => ({ default: mod.BeautySite })),
  {
    ssr: true,
    loading: () => (
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-8 sm:py-8">
        <div className="aspect-[2/1] animate-pulse rounded-[18px] bg-card" />
      </div>
    ),
  },
);

const VenueInstallPrompt = dynamic(
  () =>
    import("@/components/venue-install-prompt").then((mod) => ({
      default: mod.VenueInstallPrompt,
    })),
  { ssr: false },
);

export function PublicMenu({ slug, initial }: { slug: string; initial: PublicMenuData }) {
  // Meaningful fallback so PPR/SSR HTML already contains the menu instead of a pulse shell.
  // useSearchParams() must stay inside Suspense; preview theme is optional.
  return (
    <Suspense fallback={<PublicMenuView slug={slug} initial={initial} preview={null} />}>
      <PublicMenuWithPreview slug={slug} initial={initial} />
    </Suspense>
  );
}

function PublicMenuWithPreview({ slug, initial }: { slug: string; initial: PublicMenuData }) {
  const preview = useSearchParams().get("theme");
  return <PublicMenuView slug={slug} initial={initial} preview={preview} />;
}

function PublicMenuView({
  slug,
  initial,
  preview,
}: {
  slug: string;
  initial: PublicMenuData;
  preview: string | null;
}) {
  const { menu, theme, kind, ready, unavailable, promptEnabled } = usePublicMenu(slug, initial);
  const shown = preview === null ? theme : menuTheme(preview);

  return (
    <div className={`guest ${menuThemeClass(shown)} min-h-full`}>
      {ready && menu && !unavailable && promptEnabled ? (
        <VenueInstallPrompt slug={slug} enabled={promptEnabled} />
      ) : null}
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
