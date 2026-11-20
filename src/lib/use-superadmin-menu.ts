"use client";

import { useEffect, useRef, useState } from "react";
import { businessKind, type BusinessKind } from "@/lib/business-kind";
import type { Dish, MenuState } from "@/lib/menu";
import { readImageBlob } from "@/lib/menu";
import { menuTheme, type MenuTheme } from "@/lib/menu-theme";
import { MAX_MENU_PHOTO_BYTES } from "@/lib/photos";
import { pwaNameFromValue, readSquareIconBlob } from "@/lib/pwa-settings";
import { getSupabase } from "@/lib/supabase";
import type { OwnerSettings, OwnerSite } from "@/lib/use-owner-menu";
import { cashierPhoneError } from "@/lib/use-owner-menu";

type VenuePayload = {
  name: string;
  description: string;
  address: string;
  phone: string;
  hours: string;
  orderPhone: string;
  banner: string;
  telegram: boolean;
  max: boolean;
};

export function useSuperadminMenu(businessId: string) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [kind, setKind] = useState<BusinessKind>("food");
  const [theme, setTheme] = useState<MenuTheme>("default");
  const [themeStorage, setThemeStorage] = useState<"ready" | "missing">("ready");
  const [site, setSite] = useState<OwnerSite | null>(null);
  const [pwaName, setPwaName] = useState("");
  const [pwaIcon, setStoredPwaIcon] = useState("");
  const [pwaStorage, setPwaStorage] = useState<"ready" | "missing">("ready");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const menuStamp = useRef(0);

  useEffect(() => {
    if (!businessId) {
      setMenu(null);
      setKind("food");
      setTheme("default");
      setThemeStorage("ready");
      setSite(null);
      setPwaName("");
      setStoredPwaIcon("");
      setPwaStorage("ready");
      setError("");
      setReady(true);
      return;
    }
    let active = true;
    const stamp = menuStamp.current;
    const load = async () => {
      setReady(false);
      setError("");
      setMenu(null);
      setKind("food");
      setTheme("default");
      setThemeStorage("ready");
      setSite(null);
      setPwaName("");
      setStoredPwaIcon("");
      setPwaStorage("ready");
      const result = await editorGet(businessId);
      if (!active || stamp !== menuStamp.current) return;
      if (!result.ok || !isMenuPayload(result.payload)) {
        setError(result.ok ? "Не удалось загрузить меню. Обновите страницу." : result.message);
        setReady(true);
        return;
      }
      setMenu(menuFromPayload(result.payload));
      setKind(businessKind(result.payload.kind));
      setTheme(menuTheme(result.payload.theme));
      setThemeStorage(result.payload.themeStorage === "missing" ? "missing" : "ready");
      setSite(isSite(result.payload.site) ? result.payload.site : null);
      const pwa = readPwa(result.payload.pwa);
      setPwaName(pwa.name);
      setStoredPwaIcon(pwa.icon);
      setPwaStorage(pwa.storage);
      setReady(true);
    };
    void load().catch(() => {
      if (!active) return;
      setMenu(null);
      setError("Не удалось загрузить меню. Обновите страницу.");
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [businessId]);

  const saveSettings = async (settings: OwnerSettings) => {
    const orderPhoneError = cashierPhoneError(settings.orderPhone);
    if (orderPhoneError) return { ok: false as const, field: "orderPhone" as const, message: orderPhoneError };
    const result = await editorPost(businessId, { action: "settings", ...settings });
    if (!result.ok || !isVenue(result.payload.venue)) {
      return { ok: false as const, message: result.ok ? "Не удалось сохранить настройки." : result.message };
    }
    const saved = result.payload.venue;
    setMenu((current) =>
      current ? { ...current, venue: venueState(saved, current.venue.banner) } : current,
    );
    return { ok: true as const };
  };

  const saveTheme = async (next: MenuTheme) => {
    if (themeStorage === "missing") {
      return { ok: false as const, message: "Сохранение оформления пока недоступно. Обновление базы ещё не применено." };
    }
    const result = await editorPost(businessId, { action: "theme", theme: next });
    const saved = menuTheme(result.payload.theme);
    if (!result.ok || saved !== next) {
      return { ok: false as const, message: result.message || "Не удалось сохранить оформление." };
    }
    setTheme(saved);
    return { ok: true as const };
  };

  const addCategory = async (name: string) => {
    const result = await editorPost(businessId, { action: "addCategory", name });
    const id = typeof result.payload?.id === "string" ? result.payload.id : "";
    const savedName = typeof result.payload?.name === "string" ? result.payload.name : "";
    if (!result.ok || !id) return { ok: false as const, message: result.message || "Не удалось добавить категорию." };
    setMenu((current) =>
      current ? { ...current, categories: [...current.categories, { id, name: savedName }] } : current,
    );
    return { ok: true as const, id };
  };

  const renameCategory = async (categoryId: string, name: string) => {
    const result = await editorPost(businessId, { action: "renameCategory", categoryId, name });
    const savedName = typeof result.payload?.name === "string" ? result.payload.name : "";
    if (!result.ok || !savedName) return { ok: false as const, message: result.message || "Не удалось сохранить категорию." };
    setMenu((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((category) =>
              category.id === categoryId ? { ...category, name: savedName } : category,
            ),
          }
        : current,
    );
    return { ok: true as const };
  };

  const deleteCategory = async (categoryId: string) => {
    const result = await editorPost(businessId, { action: "deleteCategory", categoryId });
    if (!result.ok) return { ok: false as const, message: result.message };
    setMenu((current) =>
      current ? { ...current, categories: current.categories.filter((category) => category.id !== categoryId) } : current,
    );
    return { ok: true as const };
  };

  const saveProduct = async (input: {
    id: string | null;
    name: string;
    description: string;
    price: number;
    categoryId: string;
    visible: boolean;
  }) => {
    const result = await editorPost(businessId, { action: "saveProduct", ...input });
    if (!result.ok || !isDish(result.payload.dish)) {
      return { ok: false as const, message: result.message || "Не удалось сохранить блюдо." };
    }
    const dish = result.payload.dish;
    setMenu((current) => {
      if (!current) return current;
      const exists = current.dishes.some((item) => item.id === dish.id);
      return {
        ...current,
        dishes: exists ? current.dishes.map((item) => (item.id === dish.id ? dish : item)) : [...current.dishes, dish],
      };
    });
    return { ok: true as const, dish };
  };

  const setProductVisible = async (productId: string, visible: boolean) => {
    const result = await editorPost(businessId, { action: "setVisible", productId, visible });
    if (!result.ok || result.payload.visible !== visible) {
      return { ok: false as const, message: result.message || "Не удалось изменить видимость блюда." };
    }
    menuStamp.current += 1;
    setMenu((current) =>
      current
        ? { ...current, dishes: current.dishes.map((dish) => (dish.id === productId ? { ...dish, visible } : dish)) }
        : current,
    );
    return { ok: true as const, visible };
  };

  const deleteProduct = async (productId: string) => {
    const result = await editorPost(businessId, { action: "deleteProduct", productId });
    if (!result.ok) return { ok: false as const, message: result.message };
    setMenu((current) =>
      current ? { ...current, dishes: current.dishes.filter((dish) => dish.id !== productId) } : current,
    );
    return { ok: true as const };
  };

  const setProductPhoto = async (productId: string, file: File) => {
    const uploaded = await sendPhoto(businessId, "product", file, productId);
    if (!uploaded.ok) return uploaded;
    menuStamp.current += 1;
    setMenu((current) =>
      current
        ? { ...current, dishes: current.dishes.map((dish) => (dish.id === productId ? { ...dish, image: uploaded.path } : dish)) }
        : current,
    );
    return { ok: true as const, path: uploaded.path };
  };

  const deleteProductPhoto = async (productId: string) => {
    const result = await editorPost(businessId, { action: "deletePhoto", kind: "product", productId });
    if (!result.ok) return { ok: false as const, message: result.message };
    menuStamp.current += 1;
    setMenu((current) =>
      current
        ? { ...current, dishes: current.dishes.map((dish) => (dish.id === productId ? { ...dish, image: "" } : dish)) }
        : current,
    );
    return { ok: true as const };
  };

  const setBannerPhoto = async (file: File) => {
    const uploaded = await sendPhoto(businessId, "banner", file);
    if (!uploaded.ok) return uploaded;
    menuStamp.current += 1;
    setMenu((current) => (current ? { ...current, venue: { ...current.venue, banner: uploaded.path } } : current));
    return { ok: true as const, path: uploaded.path };
  };

  const savePwaName = async (name: string) => {
    const result = await editorPost(businessId, { action: "pwa", name });
    if (!result.ok) return { ok: false as const, message: result.message };
    const saved = pwaNameFromValue(result.payload.name);
    setPwaName(saved);
    return { ok: true as const };
  };

  const setPwaIcon = async (file: File) => {
    const uploaded = await sendPwaIcon(businessId, file);
    if (!uploaded.ok) return uploaded;
    setStoredPwaIcon(uploaded.path);
    return { ok: true as const, path: uploaded.path };
  };

  const deletePwaIcon = async () => {
    const result = await editorPost(businessId, { action: "deletePhoto", kind: "pwa-icon" });
    if (!result.ok) return { ok: false as const, message: result.message };
    setStoredPwaIcon("");
    return { ok: true as const };
  };

  const deleteBannerPhoto = async () => {
    const result = await editorPost(businessId, { action: "deletePhoto", kind: "banner" });
    if (!result.ok) return { ok: false as const, message: result.message };
    menuStamp.current += 1;
    setMenu((current) => (current ? { ...current, venue: { ...current.venue, banner: "" } } : current));
    return { ok: true as const };
  };

  return {
    menu,
    kind,
    theme,
    themeStorage,
    site,
    saveTheme,
    ready,
    error,
    saveSettings,
    addCategory,
    renameCategory,
    deleteCategory,
    saveProduct,
    setProductVisible,
    deleteProduct,
    setProductPhoto,
    deleteProductPhoto,
    setBannerPhoto,
    deleteBannerPhoto,
    pwaName,
    pwaIcon,
    pwaStorage,
    savePwaName,
    setPwaIcon,
    deletePwaIcon,
  };
}

async function editorGet(businessId: string) {
  return requestJson(`/api/superadmin/businesses/${businessId}/editor`);
}

async function editorPost(businessId: string, body: unknown) {
  return requestJson(`/api/superadmin/businesses/${businessId}/editor`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function sendPhoto(businessId: string, kind: "product" | "banner", file: File, productId?: string) {
  let blob: Blob;
  try {
    blob = await readImageBlob(file);
  } catch {
    return { ok: false as const, message: "Не удалось использовать это фото. Попробуйте другой файл." };
  }
  if (blob.size > MAX_MENU_PHOTO_BYTES) return { ok: false as const, message: "Фото больше 5 МБ. Выберите другое." };
  const form = new FormData();
  form.set("kind", kind);
  if (productId) form.set("productId", productId);
  form.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
  const result = await requestJson(`/api/superadmin/businesses/${businessId}/photos`, { method: "POST", body: form });
  const path = typeof result.payload?.path === "string" ? result.payload.path : "";
  if (!result.ok || !path) {
    return { ok: false as const, message: result.message || "Не удалось загрузить фотографию." };
  }
  return { ok: true as const, path };
}

async function sendPwaIcon(businessId: string, file: File) {
  let blob: Blob;
  try {
    blob = await readSquareIconBlob(file);
  } catch {
    return { ok: false as const, message: "Не удалось использовать это изображение. Выберите другое." };
  }
  if (blob.size > MAX_MENU_PHOTO_BYTES) return { ok: false as const, message: "Иконка больше 5 МБ. Выберите другое изображение." };
  const form = new FormData();
  form.set("kind", "pwa-icon");
  form.set("file", new File([blob], "icon.jpg", { type: "image/jpeg" }));
  const result = await requestJson(`/api/superadmin/businesses/${businessId}/photos`, { method: "POST", body: form });
  const path = typeof result.payload?.path === "string" ? result.payload.path : "";
  if (!result.ok || !path) {
    return { ok: false as const, message: result.message || "Не удалось загрузить иконку." };
  }
  return { ok: true as const, path };
}

async function requestJson(path: string, init?: RequestInit) {
  const token = await accessToken();
  if (!token) return { ok: false as const, message: "Сессия не подтверждена. Войдите снова.", payload: {} as Payload };
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false as const, message: "Не удалось связаться с сервером. Попробуйте снова.", payload: {} as Payload };
  }
  const payload = ((await response.json().catch(() => null)) ?? {}) as Payload;
  if (!response.ok || payload.ok === false) {
    return { ok: false as const, message: payload.message || "Не удалось сохранить изменения.", payload };
  }
  return { ok: true as const, message: "", payload };
}

async function accessToken() {
  const supabase = getSupabase();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

function menuFromPayload(payload: MenuPayload): MenuState {
  return {
    venue: venueState(payload.venue, payload.venue.banner),
    categories: payload.categories,
    dishes: payload.dishes,
  };
}

function venueState(venue: VenuePayload, banner: string): MenuState["venue"] {
  return {
    name: venue.name,
    description: venue.description,
    address: venue.address,
    phone: venue.phone,
    hours: venue.hours,
    orderPhone: venue.orderPhone,
    banner,
    channels: { telegram: venue.telegram, max: venue.max },
  };
}

function isMenuPayload(payload: Payload): payload is MenuPayload {
  return isVenue(payload.venue) && Array.isArray(payload.categories) && Array.isArray(payload.dishes);
}

function isVenue(value: unknown): value is VenuePayload {
  if (!value || typeof value !== "object") return false;
  const venue = value as Partial<VenuePayload>;
  return typeof venue.name === "string" && typeof venue.telegram === "boolean" && typeof venue.max === "boolean";
}

function isSite(value: unknown): value is OwnerSite {
  if (!value || typeof value !== "object") return false;
  const site = value as Partial<OwnerSite>;
  return (
    typeof site.slug === "string" &&
    typeof site.published === "boolean" &&
    typeof site.status === "string" &&
    typeof site.blocked === "boolean" &&
    typeof site.archived === "boolean"
  );
}

function isDish(value: unknown): value is Dish {
  if (!value || typeof value !== "object") return false;
  const dish = value as Partial<Dish>;
  return typeof dish.id === "string" && typeof dish.name === "string" && typeof dish.categoryId === "string";
}

type Payload = {
  ok?: boolean;
  message?: string;
  venue?: unknown;
  categories?: unknown;
  dishes?: unknown;
  id?: unknown;
  name?: unknown;
  dish?: unknown;
  visible?: unknown;
  path?: unknown;
  kind?: unknown;
  theme?: unknown;
  themeStorage?: unknown;
  site?: unknown;
  pwa?: unknown;
};

type MenuPayload = {
  venue: VenuePayload;
  categories: MenuState["categories"];
  dishes: Dish[];
  kind?: unknown;
  theme?: unknown;
  themeStorage?: unknown;
  site?: unknown;
  pwa?: unknown;
};

function readPwa(value: unknown) {
  if (!value || typeof value !== "object") return { name: "", icon: "", storage: "ready" as const };
  const pwa = value as { name?: unknown; icon?: unknown; storage?: unknown };
  return {
    name: pwaNameFromValue(pwa.name),
    icon: typeof pwa.icon === "string" ? pwa.icon : "",
    storage: pwa.storage === "missing" ? ("missing" as const) : ("ready" as const),
  };
}
