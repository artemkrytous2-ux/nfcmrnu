/** Тарифы активации демоверсии. Суммы и сроки задаёт только сервер. */

export const ACTIVATION_PLAN_CODES = ["month_990", "months6_5490"] as const;

export type ActivationPlanCode = (typeof ACTIVATION_PLAN_CODES)[number];

export type ActivationContactChannel = "phone" | "telegram" | "whatsapp" | "max";

/** Состав тарифа 990 ₽ — как на главной странице (subscriptionBenefits). */
export const MONTH_PLAN_BENEFITS = [
  "Персональный сайт",
  "Кабинет владельца",
  "Самостоятельное управление",
  "Индивидуальное оформление приложения",
] as const;

/** Дополнительно к 990 ₽ — только для тарифа на 6 месяцев. */
export const SIX_MONTH_EXTRA_BENEFITS = [
  "Заполнение сайта под ключ — до 20 блюд",
  "Оформление сайта под стиль заведения",
  "Первоначальная настройка сайта специалистом",
] as const;

export const ACTIVATION_SUPPORT_CONTACTS = {
  phoneDisplay: "+7 914 737-48-09",
  phoneHref: "tel:+79147374809",
  telegramHref: "https://t.me/artuomk",
  whatsappHref: "https://wa.me/79147374809",
  maxHref: "https://max.ru/u/f9LHodD0cOJblGfb1i6KzFSMNOMyvKYypuwiKX9oOsdXQq9KDcnh_bUYopU",
} as const;

export type ActivationPlan = {
  code: ActivationPlanCode;
  title: string;
  priceLabel: string;
  periodLabel: string;
  amountRub: number;
  durationMonths: number;
  benefits: readonly string[];
  extraBenefits: readonly string[];
};

export const ACTIVATION_PLANS: Record<ActivationPlanCode, ActivationPlan> = {
  month_990: {
    code: "month_990",
    title: "Ежемесячный",
    priceLabel: "990 ₽",
    periodLabel: "в месяц",
    amountRub: 990,
    durationMonths: 1,
    benefits: MONTH_PLAN_BENEFITS,
    extraBenefits: [],
  },
  months6_5490: {
    code: "months6_5490",
    title: "На 6 месяцев",
    priceLabel: "5 490 ₽",
    periodLabel: "за 6 месяцев",
    amountRub: 5490,
    durationMonths: 6,
    benefits: MONTH_PLAN_BENEFITS,
    extraBenefits: SIX_MONTH_EXTRA_BENEFITS,
  },
};

export function isActivationPlanCode(value: unknown): value is ActivationPlanCode {
  return value === "month_990" || value === "months6_5490";
}

/** Серверная фиксация тарифа: клиентскую сумму и срок не доверяем. */
export function resolveActivationPlan(code: ActivationPlanCode) {
  const plan = ACTIVATION_PLANS[code];
  return {
    plan_code: plan.code,
    plan_amount_rub: plan.amountRub,
    plan_duration_months: plan.durationMonths,
  };
}

export function isActivationContactChannel(value: unknown): value is ActivationContactChannel {
  return value === "phone" || value === "telegram" || value === "whatsapp" || value === "max";
}

export function supportHrefForChannel(channel: ActivationContactChannel) {
  if (channel === "phone") return ACTIVATION_SUPPORT_CONTACTS.phoneHref;
  if (channel === "telegram") return ACTIVATION_SUPPORT_CONTACTS.telegramHref;
  if (channel === "whatsapp") return ACTIVATION_SUPPORT_CONTACTS.whatsappHref;
  return ACTIVATION_SUPPORT_CONTACTS.maxHref;
}

/** Приводит номер к формату заявки: +79991234567 */
export function toActivationContactPhone(value: string): string | null {
  const trimmed = value.trim();
  if (/^\+[1-9][0-9]{7,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let normalized = digits;
  if (normalized.startsWith("8") && normalized.length === 11) {
    normalized = `7${normalized.slice(1)}`;
  }
  if (!normalized.startsWith("7") && normalized.length === 10) {
    normalized = `7${normalized}`;
  }
  if (normalized.length < 8 || normalized.length > 15) return null;
  if (normalized.startsWith("0")) return null;

  const phone = `+${normalized}`;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}

const cyrillicMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function slugFromVenueName(name: string, fallbackSeed: string) {
  const lowered = name.trim().toLowerCase();
  let out = "";
  for (const char of lowered) {
    if (cyrillicMap[char] !== undefined) out += cyrillicMap[char];
    else if (/[a-z0-9]/.test(char)) out += char;
    else if (/\s|-|_/.test(char)) out += "-";
  }
  out = out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  if (out.length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out)) return out;

  const seed = fallbackSeed.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "demo";
  return `demo-${seed}`;
}
