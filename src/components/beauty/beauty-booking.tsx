"use client";

import { useEffect, useId, useRef, useState } from "react";
import { beautyPhoneHref } from "@/components/beauty/beauty-contacts";
import type { Venue } from "@/lib/menu";
import {
  availableChannels,
  channelLabel,
  messengerLink,
  phoneDigits,
  type OrderChannel,
} from "@/lib/order";

const telegramPhoneLength = 11;

function bookingMessage(venueName: string) {
  const name = venueName.trim();
  return name ? `${name}\nЗдравствуйте! Хочу записаться.` : "Здравствуйте! Хочу записаться.";
}

export function beautyWriteLinks(venue: Venue): { channel: OrderChannel; href: string }[] {
  const message = bookingMessage(venue.name);
  const links: { channel: OrderChannel; href: string }[] = [];
  for (const channel of availableChannels(venue.channels, venue.orderEnabled !== false)) {
    if (channel === "telegram" && phoneDigits(venue.orderPhone).length < telegramPhoneLength) continue;
    links.push({ channel, href: messengerLink(channel, venue.orderPhone, message) });
  }
  return links;
}

export function BeautyBooking({ venue }: { venue: Venue }) {
  const phoneHref = beautyPhoneHref(venue.phone);
  const links = beautyWriteLinks(venue);
  if (!phoneHref && links.length === 0) return null;

  return (
    <section className="mt-8 sm:mt-10">
      <h2 className="font-display text-xl leading-none font-medium tracking-[-0.03em] text-foreground sm:text-2xl">
        Запишитесь к нам
      </h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {phoneHref ? (
          <a
            href={phoneHref}
            className="menu-on-accent inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold sm:w-auto sm:min-w-56"
          >
            Позвонить и записаться
          </a>
        ) : null}
        {links.length === 1 ? (
          <a
            href={links[0].href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line bg-card px-5 text-sm font-semibold text-foreground sm:w-auto sm:min-w-56"
          >
            Написать
          </a>
        ) : null}
        {links.length > 1 ? <WriteMenu links={links} /> : null}
      </div>
    </section>
  );
}

function WriteMenu({ links }: { links: { channel: OrderChannel; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line bg-card px-5 text-sm font-semibold text-foreground sm:min-w-56"
      >
        Написать
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-[22px] border border-line bg-card p-1.5"
        >
          {links.map((link) => (
            <a
              key={link.channel}
              role="menuitem"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block rounded-[16px] px-4 py-3 text-sm text-foreground"
            >
              {channelLabel[link.channel]}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
