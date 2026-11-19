import Link from "next/link";
import { productSections } from "@/lib/sections";

type SectionHref = (typeof productSections)[number]["href"];

export function SiteShell({
  children,
  current,
  bare = false,
}: {
  children: React.ReactNode;
  current?: SectionHref;
  bare?: boolean;
}) {
  if (bare) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-md border border-accent/40 text-[11px] font-semibold tracking-[0.16em] text-accent">
              N
            </span>
            <span className="text-sm font-semibold tracking-[0.22em]">
              NFCMENU
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {productSections.map((section) => {
              const active = section.href === current;
              return (
                <Link
                  key={section.href}
                  href={section.label === "Демо" && current === "/admin" ? "/m/nfcmenu-demo" : section.href}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>NFCMENU</p>
          <p>Локальная версия для заведений общепита</p>
        </div>
      </footer>
    </div>
  );
}
