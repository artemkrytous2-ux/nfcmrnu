import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicMenu } from "@/components/public-menu";

export const metadata: Metadata = {
  title: "Меню — NFCMENU",
  description: "Публичное меню заведения.",
};

export default function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="guest menu-theme-default min-h-full">
          <div className="mx-auto w-full max-w-[440px] px-4 pt-5">
            <div className="h-6 w-40 animate-pulse rounded-full bg-card" />
            <div className="mt-3 h-36 animate-pulse rounded-[22px] bg-card" />
          </div>
        </div>
      }
    >
      <SlugMenu params={params} />
    </Suspense>
  );
}

async function SlugMenu({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicMenu key={slug} slug={slug} />;
}
