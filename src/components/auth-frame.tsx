import type { ReactNode } from "react";
import Link from "next/link";

export function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-10 sm:px-8 sm:py-16">
      <Link href="/" className="text-[15px] font-extrabold tracking-[0.04em] text-accent uppercase">
        NFCMENU
      </Link>
      <h1 className="mt-8 text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em]">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export const authFieldClass =
  "h-12 w-full rounded-2xl border border-line bg-background px-4 text-[15px] text-foreground outline-none placeholder:text-muted/70 focus:border-accent";

export const authPrimaryButton =
  "home-cta inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-medium disabled:opacity-60";

export const authSecondaryLink =
  "inline-flex h-12 w-full items-center justify-center rounded-full border border-line px-6 text-sm font-medium text-foreground";
