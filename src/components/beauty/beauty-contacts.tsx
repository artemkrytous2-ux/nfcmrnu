import { Clock, MapPin, Phone } from "lucide-react";
import type { Venue } from "@/lib/menu";

export function beautyPhoneHref(phone: string) {
  const value = phone.trim();
  const href = value.replace(/[^\d+]/g, "");
  return /\d/.test(href) ? `tel:${href}` : "";
}

export function beautyRouteUrl(address: string) {
  const value = address.trim();
  if (!value) return "";
  return `https://yandex.ru/maps/?text=${encodeURIComponent(value)}`;
}

export function BeautyContacts({ venue }: { venue: Venue }) {
  const address = venue.address.trim();
  const phone = venue.phone.trim();
  const hours = venue.hours;
  const hoursVisible = hours.trim().length > 0;
  const phoneHref = beautyPhoneHref(phone);
  const routeUrl = beautyRouteUrl(address);
  if (!address && !phoneHref && !hoursVisible) return null;

  return (
    <section className="mt-8 sm:mt-10">
      <h2 className="font-display text-xl leading-none font-medium tracking-[-0.03em] text-foreground sm:text-2xl">
        Контакты
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {address ? (
          <li className="rounded-[18px] border border-line bg-card px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-muted">
              <MapPin className="size-4 text-accent" aria-hidden="true" />
              Адрес
            </p>
            <p className="mt-1 text-sm leading-5 text-foreground">{address}</p>
            {routeUrl ? (
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-sm text-accent"
              >
                Построить маршрут
              </a>
            ) : null}
          </li>
        ) : null}
        {phoneHref ? (
          <li className="rounded-[18px] border border-line bg-card px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-muted">
              <Phone className="size-4 text-accent" aria-hidden="true" />
              Телефон
            </p>
            <a href={phoneHref} className="mt-1 inline-flex text-sm text-foreground">
              {phone}
            </a>
          </li>
        ) : null}
        {hoursVisible ? (
          <li className="rounded-[18px] border border-line bg-card px-4 py-3 sm:col-span-2">
            <p className="flex items-center gap-2 text-xs text-muted">
              <Clock className="size-4 text-accent" aria-hidden="true" />
              График работы
            </p>
            <p className="mt-1 text-sm leading-5 whitespace-pre-line text-foreground">{hours}</p>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
