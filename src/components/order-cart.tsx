"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatPrice, type Dish, type Venue } from "@/lib/menu";
import {
  availableChannels,
  buildOrderMessage,
  messengerLink,
  cartCount,
  cartTotal,
  channelLabel,
  formatPhone,
  lineTotal,
  phoneDigits,
  venueContacts,
  type CartLine,
  type OrderChannel,
  type Pickup,
} from "@/lib/order";

const pickupOptions: { id: Pickup; label: string }[] = [
  { id: "now", label: "Сейчас" },
  { id: "soon", label: "Через 30 мин" },
  { id: "time", label: "Ко времени" },
];

export function OrderCart({
  dishes,
  venue,
  quantities,
  onQuantity,
  onClear,
  callHref = "",
}: {
  dishes: Dish[];
  venue: Venue;
  quantities: Record<string, number>;
  onQuantity: (id: string, quantity: number) => void;
  onClear: () => void;
  callHref?: string;
}) {
  const [pickup, setPickup] = useState<Pickup>("now");
  const [pickupTime, setPickupTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [channel, setChannel] = useState<OrderChannel | "">("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [barHidden, setBarHidden] = useState(false);

  const channels = availableChannels(venue.channels, venue.orderEnabled !== false);
  const lines = useMemo<CartLine[]>(() => {
    return dishes.flatMap((dish) => {
      const quantity = quantities[dish.id] ?? 0;
      if (!dish.visible || quantity <= 0) return [];
      return [{ id: dish.id, name: dish.name, price: dish.price, quantity }];
    });
  }, [quantities, dishes]);

  const count = cartCount(lines);
  const total = cartTotal(lines);

  useEffect(() => {
    if (channel && !channels.includes(channel)) setChannel("");
  }, [channel, channels]);

  useEffect(() => {
    const target = document.getElementById("order");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setBarHidden(entry.isIntersecting),
      { threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const showOrder = () => {
    document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = () => {
    if (lines.length === 0) {
      setError("Добавьте хотя бы одно блюдо");
      return;
    }
    if (!name.trim()) {
      setError("Напишите, как к вам обращаться");
      return;
    }
    if (phoneDigits(phone).length < 11) {
      setError("Введите телефон полностью");
      return;
    }
    if (pickup === "time" && !pickupTime) {
      setError("Укажите время, к которому собрать заказ");
      return;
    }
    if (!channel) {
      setError(channels.length === 0 ? "Заведение ещё не подключило отправку заказа" : "Выберите Telegram или MAX");
      return;
    }

    const text = buildOrderMessage({
      venueName: venue.name,
      lines,
      total,
      pickup,
      pickupTime,
      name,
      phone,
      comment,
      channel,
      destinationPhone: venue.orderPhone,
    });
    setError("");
    setMessage(text);
    const link = messengerLink(channel, venue.orderPhone, text);
    const opened = window.open(link, "_blank", "noopener,noreferrer");
    if (!opened) window.location.assign(link);
  };

  return (
    <>
      <section id="order" className="mt-8 scroll-mt-4 rounded-[22px] bg-card p-4">
        <h2 className="text-[17px] font-medium">Ваш заказ</h2>

        {lines.length === 0 ? (
          <div className="menu-cart-line mt-4 rounded-2xl border border-dashed px-4 py-5 text-sm leading-6 text-muted">
            Пока ничего не выбрано — нажмите «+» у блюда в меню выше, и оно появится здесь.{" "}
            <button type="button" onClick={() => document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" })} className="font-medium text-accent">
              К меню ↑
            </button>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{line.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatPrice(line.price)} · {formatPrice(lineTotal(line))}
                  </p>
                </div>
                <Quantity
                  value={line.quantity}
                  onChange={(quantity) => onQuantity(line.id, quantity)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="menu-on-accent mt-4 flex items-center justify-between rounded-2xl bg-accent px-4 py-3.5">
          <span className="text-sm font-medium">Итого</span>
          <span className="text-sm font-semibold">{formatPrice(total)}</span>
        </div>

        <div className="mt-6">
          <p className="text-sm">Когда заберёте</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pickupOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPickup(option.id)}
                className={pill(pickup === option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {pickup === "time" ? (
            <input
              type="time"
              value={pickupTime}
              onChange={(event) => setPickupTime(event.target.value)}
              className={`${inputClass} mt-3`}
            />
          ) : null}
        </div>

        <label className="mt-5 grid gap-2 text-sm">
          Имя
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Как к вам обращаться"
            className={inputClass}
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm">
          Телефон
          <input
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            placeholder="+7 900 000-00-00"
            className={inputClass}
          />
        </label>
        <label className="mt-4 grid gap-2 text-sm">
          Комментарий
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Необязательно"
            className="min-h-24 w-full resize-y rounded-2xl border border-transparent bg-background px-4 py-3 text-[15px] outline-none placeholder:text-muted/80 focus:border-accent/60"
          />
        </label>

        <div className="mt-5">
          <p className="text-sm">Куда отправить заказ</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Личное сообщение в выбранный мессенджер, на номер заведения.
          </p>
          {channels.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-muted">
              Заведение пока не включило Telegram или MAX.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {channels.map((item) => (
                <button key={item} type="button" onClick={() => setChannel(item)} className={pill(channel === item)}>
                  {channelLabel[item]}
                </button>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="menu-danger mt-4 text-sm">{error}</p> : null}
        <button
          type="button"
          onClick={submit}
          className="menu-on-accent mt-5 flex h-14 w-full items-center justify-center rounded-full bg-accent text-[17px] font-semibold"
        >
          Отправить заказ
        </button>
        {callHref ? (
          <a
            href={callHref}
            className="mt-3 flex h-14 w-full items-center justify-center rounded-full border border-line bg-card text-[17px] font-semibold text-foreground"
          >
            Позвонить
          </a>
        ) : null}

        {message ? (
          <div className="mt-5 rounded-2xl border border-line bg-background p-4">
            <p className="text-sm text-accent">Сообщение для {channel ? channelLabel[channel] : "отправки"} готово</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Мессенджер открыт с этим текстом. В Telegram это чат номера {venue.orderPhone}. В MAX текст уже набран, чат выбирается в приложении.
            </p>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6">{message}</pre>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(message)}
                className="h-11 rounded-full border border-line px-4 text-sm"
              >
                Скопировать
              </button>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setMessage("");
                  setComment("");
                }}
                className="h-11 rounded-full border border-line px-4 text-sm"
              >
                Новый заказ
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-5 text-xs leading-5 text-muted">
          Адрес: {venueContacts(venue)}
          {channels.includes("telegram") ? " · Telegram" : ""}
          {channels.includes("max") ? " · MAX" : ""}
        </p>
      </section>

      {count > 0 && !barHidden ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 px-4 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={showOrder}
            className="menu-on-accent mx-auto flex h-14 w-full max-w-[440px] items-center justify-between rounded-2xl bg-accent px-5"
          >
            <span className="text-sm font-medium">
              {count} {countLabel(count)} · Оформить заказ
            </span>
            <span className="text-sm font-semibold">{formatPrice(total)}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

export function AddDishButton({
  quantity,
  onAdd,
  onChange,
  appearance = "stepper",
}: {
  quantity: number;
  onAdd: () => void;
  onChange: (quantity: number) => void;
  appearance?: "plus" | "stepper";
}) {
  if (appearance === "plus" || quantity <= 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        aria-label={quantity > 0 ? `В заказе ${quantity}. Добавить ещё` : "Добавить в заказ"}
        className="menu-on-accent grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold"
      >
        {appearance === "plus" && quantity > 0 ? quantity : <Plus className="size-4" />}
      </button>
    );
  }

  return <Quantity value={quantity} onChange={onChange} />;
}

function Quantity({ value, onChange }: { value: number; onChange: (quantity: number) => void }) {
  return (
    <div className="flex h-10 items-center rounded-full border border-line bg-background">
      <button type="button" aria-label="Уменьшить" onClick={() => onChange(value - 1)} className="grid size-10 place-items-center">
        <Minus className="size-3.5" />
      </button>
      <span className="w-6 text-center text-sm">{value}</span>
      <button type="button" aria-label="Увеличить" onClick={() => onChange(value + 1)} className="grid size-10 place-items-center">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function pill(active: boolean) {
  return `h-11 rounded-full px-4 text-sm ${
    active ? "menu-on-accent bg-accent font-semibold" : "bg-background text-foreground"
  }`;
}

const inputClass =
  "h-[52px] w-full rounded-2xl border border-transparent bg-background px-4 text-[15px] outline-none placeholder:text-muted/80 focus:border-accent/60";

function countLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
}
