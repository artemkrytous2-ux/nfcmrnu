import { formatPrice, type OrderChannels, type Venue } from "@/lib/menu";

export type CartLine = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export type Pickup = "now" | "soon" | "time";

export type OrderChannel = "telegram" | "max";

export type OrderDraft = {
  venueName: string;
  lines: CartLine[];
  total: number;
  pickup: Pickup;
  pickupTime: string;
  name: string;
  phone: string;
  comment: string;
  channel: OrderChannel;
  destinationPhone: string;
};

export const CART_STORAGE_KEY = "nfcmenu.cart.v1";

const pickupLabel: Record<Pickup, string> = {
  now: "Сейчас",
  soon: "Через 30 мин",
  time: "Ко времени",
};

export const channelLabel: Record<OrderChannel, string> = {
  telegram: "Telegram",
  max: "MAX",
};

export function lineTotal(line: CartLine) {
  return line.price * line.quantity;
}

export function cartCount(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function cartTotal(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  let normalized = digits;
  if (normalized.startsWith("8")) normalized = `7${normalized.slice(1)}`;
  if (!normalized.startsWith("7")) normalized = `7${normalized}`;
  normalized = normalized.slice(0, 11);
  const rest = normalized.slice(1);
  let result = "+7";
  if (rest.length > 0) result += ` ${rest.slice(0, 3)}`;
  if (rest.length > 3) result += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) result += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) result += `-${rest.slice(8, 10)}`;
  return result;
}

export function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Ссылка tel: по номеру заведения. Пустая строка, если цифр нет. */
export function venuePhoneHref(phone: string) {
  const value = phone.trim();
  const href = value.replace(/[^\d+]/g, "");
  return /\d/.test(href) ? `tel:${href}` : "";
}

export function availableChannels(channels: OrderChannels): OrderChannel[] {
  const list: OrderChannel[] = [];
  if (channels.telegram) list.push("telegram");
  if (channels.max) list.push("max");
  return list;
}

export function buildOrderMessage(order: OrderDraft) {
  const when = order.pickup === "time" ? `Ко времени ${order.pickupTime}` : pickupLabel[order.pickup];
  const items = order.lines
    .map(
      (line) =>
        `${line.name} — ${line.quantity} × ${formatPrice(line.price)} = ${formatPrice(lineTotal(line))}`,
    )
    .join("\n");
  const comment = order.comment.trim() ? order.comment.trim() : "нет";

  return [
    order.venueName,
    "Новый заказ",
    "",
    items,
    "",
    `Итого: ${formatPrice(order.total)}`,
    `Когда: ${when}`,
    "",
    `Имя: ${order.name.trim()}`,
    `Телефон: ${order.phone.trim()}`,
    `Комментарий: ${comment}`,
    `Куда отправить: личные сообщения ${order.destinationPhone}, ${channelLabel[order.channel]}`,
  ].join("\n");
}

export function messengerLink(channel: OrderChannel, phone: string, message: string) {
  const text = encodeURIComponent(message);
  const digits = phone.replace(/\D/g, "");
  if (channel === "telegram") {
    return `https://t.me/+${digits}?text=${text}`;
  }
  return `https://max.ru/:share?text=${text}`;
}

export function venueContacts(venue: Venue) {
  return [venue.address, venue.phone].filter(Boolean).join(" · ");
}
