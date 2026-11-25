import {
  readImageFile,
  SUB_DESCRIPTION_MAX,
  type Category,
  type Dish,
  type MenuState,
  type Venue,
} from "@/lib/menu";
import { menuTheme, menuThemes, type MenuTheme } from "@/lib/menu-theme";
import { MAX_MENU_PHOTO_BYTES } from "@/lib/photos";
import {
  createPersonalDemoMenu,
  PERSONAL_DEMO_TEMPLATE_VERSION,
  personalDemoDefaultTheme,
} from "@/lib/personal-demo-template";

/** Префикс ключа. Полный ключ всегда содержит userId — общий nfcmenu.menu.v1 не используется. */
export const PERSONAL_DEMO_KEY_PREFIX = "nfcmenu.personal-demo.v1:";

export const PERSONAL_DEMO_CHANGE_EVENT = "nfcmenu-personal-demo";

/** Мягкий лимит JSON в символах (~4 МБ), чтобы оставить запас до квоты браузера. */
export const PERSONAL_DEMO_MAX_PAYLOAD_CHARS = 4_000_000;

/** Лимит одной data URL (после сжатия), символы строки. */
export const PERSONAL_DEMO_MAX_DATA_URL_CHARS = 1_200_000;

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PersonalDemoState = {
  userId: string;
  updatedAt: string;
  templateVersion: number;
  theme: MenuTheme;
  menu: MenuState;
};

export type PersonalDemoErrorCode = "userid" | "invalid" | "quota" | "unavailable" | "image";

export type PersonalDemoResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; code: PersonalDemoErrorCode };

export function isPersonalDemoUserId(value: string): boolean {
  return userIdPattern.test(value.trim());
}

export function personalDemoStorageKey(userId: string): string | null {
  const id = userId.trim();
  if (!isPersonalDemoUserId(id)) return null;
  return `${PERSONAL_DEMO_KEY_PREFIX}${id}`;
}

export function createPersonalDemoState(userId: string): PersonalDemoState | null {
  const id = userId.trim();
  if (!isPersonalDemoUserId(id)) return null;
  return {
    userId: id,
    updatedAt: new Date().toISOString(),
    templateVersion: PERSONAL_DEMO_TEMPLATE_VERSION,
    theme: personalDemoDefaultTheme(),
    menu: createPersonalDemoMenu(),
  };
}

/**
 * Загружает демо пользователя. При отсутствии ключа создаёт шаблон и сохраняет его.
 * Повреждённые данные заменяются шаблоном (приложение не падает).
 */
export function loadPersonalDemo(userId: string): PersonalDemoResult<PersonalDemoState> {
  const id = userId.trim();
  if (!isPersonalDemoUserId(id)) {
    return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };
  }

  const storage = readStorage();
  if (!storage) {
    const fresh = createPersonalDemoState(id);
    if (!fresh) return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };
    return { ok: true, value: fresh };
  }

  const key = personalDemoStorageKey(id);
  if (!key) return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      const fresh = createPersonalDemoState(id);
      if (!fresh) return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };
      const saved = writeState(storage, key, fresh);
      if (!saved.ok) return saved;
      return { ok: true, value: fresh };
    }

    const parsed = normalizePersonalDemoState(JSON.parse(raw), id);
    if (!parsed) {
      const fresh = createPersonalDemoState(id);
      if (!fresh) return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };
      const saved = writeState(storage, key, fresh);
      if (!saved.ok) return { ok: true, value: fresh };
      return { ok: true, value: fresh };
    }

    return { ok: true, value: parsed };
  } catch {
    const fresh = createPersonalDemoState(id);
    if (!fresh) return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };
    try {
      writeState(storage, key, fresh);
    } catch {
      /* ignore rewrite errors; still return usable template */
    }
    return { ok: true, value: fresh };
  }
}

/**
 * Сохраняет демо только для переданного userId.
 * Поле state.userId должно совпадать — иначе отказ (изоляция аккаунтов).
 */
export function savePersonalDemo(
  userId: string,
  state: PersonalDemoState | { menu: MenuState; theme?: MenuTheme; templateVersion?: number },
): PersonalDemoResult<PersonalDemoState> {
  const id = userId.trim();
  if (!isPersonalDemoUserId(id)) {
    return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };
  }

  if ("userId" in state && typeof state.userId === "string" && state.userId.trim() !== id) {
    return {
      ok: false,
      message: "Нельзя сохранить демоданные другого пользователя.",
      code: "userid",
    };
  }

  const menu = normalizeMenuState(state.menu);
  if (!menu) {
    return { ok: false, message: "Демоданные повреждены и не сохранены.", code: "invalid" };
  }

  const theme = menuTheme("theme" in state ? state.theme : personalDemoDefaultTheme());
  const next: PersonalDemoState = {
    userId: id,
    updatedAt: new Date().toISOString(),
    templateVersion:
      "templateVersion" in state && typeof state.templateVersion === "number"
        ? state.templateVersion
        : PERSONAL_DEMO_TEMPLATE_VERSION,
    theme,
    menu,
  };

  const imageError = validateMenuImages(next.menu);
  if (imageError) return imageError;

  const storage = readStorage();
  if (!storage) {
    return { ok: false, message: "Локальное хранилище недоступно в этом окружении.", code: "unavailable" };
  }

  const key = personalDemoStorageKey(id);
  if (!key) return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };

  const written = writeState(storage, key, next);
  if (!written.ok) return written;

  dispatchChange(id);
  return { ok: true, value: next };
}

/** Сброс к исходному шаблону текущего пользователя. Данные других userId не затрагиваются. */
export function resetPersonalDemo(userId: string): PersonalDemoResult<PersonalDemoState> {
  const fresh = createPersonalDemoState(userId);
  if (!fresh) {
    return { ok: false, message: "Некорректный идентификатор пользователя.", code: "userid" };
  }
  return savePersonalDemo(userId, fresh);
}

/**
 * Готовит изображение для демо: JPEG data URL без Supabase Storage.
 * Учитывает лимит файла и длины data URL.
 */
export async function preparePersonalDemoImage(file: File): Promise<PersonalDemoResult<string>> {
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, message: "Выберите изображение.", code: "image" };
  }
  if (file.size > MAX_MENU_PHOTO_BYTES) {
    return { ok: false, message: "Фото больше 5 МБ. Выберите другое.", code: "image" };
  }

  try {
    const dataUrl = await readImageFile(file);
    if (!isAllowedImageRef(dataUrl)) {
      return { ok: false, message: "Не удалось подготовить изображение.", code: "image" };
    }
    if (dataUrl.length > PERSONAL_DEMO_MAX_DATA_URL_CHARS) {
      return {
        ok: false,
        message: "Изображение слишком большое для демо. Выберите файл поменьше.",
        code: "image",
      };
    }
    return { ok: true, value: dataUrl };
  } catch {
    return { ok: false, message: "Не удалось подготовить изображение.", code: "image" };
  }
}

export function normalizePersonalDemoState(raw: unknown, expectedUserId: string): PersonalDemoState | null {
  const id = expectedUserId.trim();
  if (!isPersonalDemoUserId(id) || !isRecord(raw)) return null;
  if (typeof raw.userId !== "string" || raw.userId.trim() !== id) return null;

  const menu = normalizeMenuState(raw.menu);
  if (!menu) return null;

  const theme =
    typeof raw.theme === "string" && menuThemes.includes(raw.theme as MenuTheme)
      ? (raw.theme as MenuTheme)
      : personalDemoDefaultTheme();

  const templateVersion =
    typeof raw.templateVersion === "number" && Number.isFinite(raw.templateVersion)
      ? Math.max(1, Math.floor(raw.templateVersion))
      : PERSONAL_DEMO_TEMPLATE_VERSION;

  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim() ? raw.updatedAt : new Date().toISOString();

  if (validateMenuImages(menu)) return null;

  return {
    userId: id,
    updatedAt,
    templateVersion,
    theme,
    menu,
  };
}

function normalizeMenuState(raw: unknown): MenuState | null {
  if (!isRecord(raw) || !Array.isArray(raw.categories) || !Array.isArray(raw.dishes)) {
    return null;
  }

  const categories = raw.categories.flatMap((item): Category[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    const name = item.name.trim();
    if (!name) return [];
    return [{ id: item.id, name: name.slice(0, 80) }];
  });
  if (categories.length === 0) return null;
  const categoryIds = new Set(categories.map((category) => category.id));

  const dishes = raw.dishes.flatMap((item): Dish[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.categoryId !== "string" ||
      !categoryIds.has(item.categoryId)
    ) {
      return [];
    }
    const name = item.name.trim();
    if (!name) return [];
    const price = Number(item.price);
    const image = typeof item.image === "string" ? item.image.trim() : "";
    if (image && !isAllowedImageRef(image)) return [];
    return [
      {
        id: item.id,
        categoryId: item.categoryId,
        name: name.slice(0, 120),
        description: typeof item.description === "string" ? item.description.trim().slice(0, 2000) : "",
        price: Number.isFinite(price) && price >= 0 ? Math.min(1_000_000, Math.round(price)) : 0,
        image,
        visible: item.visible !== false,
      },
    ];
  });

  const venueRaw = isRecord(raw.venue) ? raw.venue : {};
  const channelsRaw = isRecord(venueRaw.channels) ? venueRaw.channels : {};
  const fallback = createPersonalDemoMenu().venue;
  const banner = typeof venueRaw.banner === "string" ? venueRaw.banner.trim() : "";
  if (banner && !isAllowedImageRef(banner)) return null;

  const venue: Venue = {
    name:
      typeof venueRaw.name === "string" && venueRaw.name.trim()
        ? venueRaw.name.trim().slice(0, 120)
        : fallback.name,
    description:
      typeof venueRaw.description === "string" ? venueRaw.description.slice(0, 2000) : fallback.description,
    subDescription:
      typeof venueRaw.subDescription === "string"
        ? venueRaw.subDescription.slice(0, SUB_DESCRIPTION_MAX)
        : fallback.subDescription,
    address: typeof venueRaw.address === "string" ? venueRaw.address.slice(0, 300) : fallback.address,
    phone: typeof venueRaw.phone === "string" ? venueRaw.phone.slice(0, 40) : fallback.phone,
    hours: typeof venueRaw.hours === "string" ? venueRaw.hours.slice(0, 120) : fallback.hours,
    orderPhone:
      typeof venueRaw.orderPhone === "string" && venueRaw.orderPhone.replace(/\D/g, "").length >= 11
        ? venueRaw.orderPhone.trim().slice(0, 40)
        : fallback.orderPhone,
    banner,
    channels: {
      telegram: channelsRaw.telegram !== false,
      max: channelsRaw.max !== false,
    },
    orderEnabled: venueRaw.orderEnabled !== false,
    callButtonEnabled: venueRaw.callButtonEnabled === true,
  };

  return { venue, categories, dishes };
}

function validateMenuImages(menu: MenuState): PersonalDemoResult<never> | null {
  const refs = [menu.venue.banner, ...menu.dishes.map((dish) => dish.image)].filter(Boolean);
  for (const ref of refs) {
    if (!isAllowedImageRef(ref)) {
      return { ok: false, message: "В демо допустимы только HTTPS-ссылки или data URL.", code: "image" };
    }
    if (ref.startsWith("data:") && ref.length > PERSONAL_DEMO_MAX_DATA_URL_CHARS) {
      return {
        ok: false,
        message: "Изображение слишком большое для демо. Выберите файл поменьше.",
        code: "image",
      };
    }
  }
  return null;
}

function isAllowedImageRef(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("data:image/")) return true;
  if (trimmed.startsWith("https://")) return true;
  return false;
}

function writeState(
  storage: Storage,
  key: string,
  state: PersonalDemoState,
): PersonalDemoResult<PersonalDemoState> {
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch {
    return { ok: false, message: "Не удалось подготовить демоданные к сохранению.", code: "invalid" };
  }

  if (json.length > PERSONAL_DEMO_MAX_PAYLOAD_CHARS) {
    return {
      ok: false,
      message:
        "Демоданные слишком большие для сохранения в браузере. Уменьшите фотографии или сбросьте демо.",
      code: "quota",
    };
  }

  try {
    storage.setItem(key, json);
    return { ok: true, value: state };
  } catch (error) {
    if (isQuotaError(error)) {
      return {
        ok: false,
        message:
          "Не хватает места в хранилище браузера. Удалите лишние фото в демо или освободите место и попробуйте снова.",
        code: "quota",
      };
    }
    return { ok: false, message: "Не удалось сохранить демоданные.", code: "unavailable" };
  }
}

function readStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dispatchChange(userId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PERSONAL_DEMO_CHANGE_EVENT, { detail: { userId } }));
}

function isQuotaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  const code = "code" in error && typeof error.code === "number" ? error.code : 0;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
