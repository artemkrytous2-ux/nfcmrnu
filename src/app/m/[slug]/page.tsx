import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicMenu } from "@/components/public-menu";
import { listPublishedVenueSlugs, loadVenuePwaMetadata } from "@/lib/venue-pwa";

export async function generateStaticParams() {
  const slugs = await listPublishedVenueSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const venue = await loadVenuePwaMetadata(slug);
  if (!venue) {
    return {
      title: "Меню — NFCMENU",
      description: "Публичное меню заведения.",
    };
  }

  const apple = venue.iconPath
    ? [{ url: `/m/${venue.slug}/apple-icon`, sizes: "180x180", type: "image/png" }]
    : [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }];
  const icon = venue.iconPath
    ? [
        { url: `/m/${venue.slug}/icon`, sizes: "512x512", type: "image/jpeg" },
        { url: `/m/${venue.slug}/icon`, sizes: "192x192", type: "image/jpeg" },
      ]
    : [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ];

  return {
    title: venue.title,
    description: "Публичное меню заведения.",
    applicationName: venue.title,
    manifest: `/m/${venue.slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: venue.title,
      statusBarStyle: "black",
    },
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
    icons: { icon, apple },
  };
}

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
  if (slug === "salonkrasotidemo") return <SalonPlaceholder />;
  return <PublicMenu key={slug} slug={slug} />;
}

function SalonPlaceholder() {
  return (
    <main className="home flex min-h-full flex-1 items-center px-5 py-16">
      <div className="mx-auto w-full max-w-lg text-center">
        <span className="mx-auto block h-0.5 w-8 rounded-full bg-accent" aria-hidden="true" />
        <h1 className="mt-6 text-[28px] leading-none font-extrabold tracking-[-0.03em] text-foreground uppercase sm:text-[36px]">
          Пока в разработке
        </h1>
        <p className="mt-4 text-[15px] leading-6 text-muted">
          Мы готовим решение для салонов красоты. Совсем скоро здесь появится демонстрация.
        </p>
      </div>
    </main>
  );
}
