"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createId,
  SUB_DESCRIPTION_MAX,
  type Dish,
  type MenuState,
  type Venue,
} from "@/lib/menu";
import { menuThemes, type MenuTheme } from "@/lib/menu-theme";
import { formatPhone, phoneDigits } from "@/lib/order";
import {
  loadPersonalDemo,
  PERSONAL_DEMO_CHANGE_EVENT,
  preparePersonalDemoImage,
  resetPersonalDemo,
  savePersonalDemo,
  type PersonalDemoState,
} from "@/lib/personal-demo-storage";
import { PERSONAL_DEMO_TEMPLATE_VERSION } from "@/lib/personal-demo-template";
import type { OwnerSettings } from "@/lib/use-owner-menu";
import { cashierPhoneError } from "@/lib/use-owner-menu";

type ProductInput = {
  id: string | null;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  visible: boolean;
};

export function usePersonalDemoMenu(userId: string) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [theme, setTheme] = useState<MenuTheme>("warm");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const activeUserId = useRef(userId.trim());

  const refresh = useCallback(() => {
    const id = activeUserId.current;
    const loaded = loadPersonalDemo(id);
    if (!loaded.ok) {
      setMenu(null);
      setError(loaded.message);
      setReady(true);
      return;
    }
    setMenu(loaded.value.menu);
    setTheme(loaded.value.theme);
    setError("");
    setReady(true);
  }, []);

  useEffect(() => {
    activeUserId.current = userId.trim();
    setReady(false);
    refresh();

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== activeUserId.current) return;
      refresh();
    };
    const onStorage = (event: StorageEvent) => {
      const key = `nfcmenu.personal-demo.v1:${activeUserId.current}`;
      if (event.key === key) refresh();
    };

    window.addEventListener(PERSONAL_DEMO_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PERSONAL_DEMO_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId, refresh]);

  const persist = useCallback(
    (nextMenu: MenuState, nextTheme: MenuTheme = theme) => {
      const id = activeUserId.current;
      const result = savePersonalDemo(id, {
        userId: id,
        updatedAt: new Date().toISOString(),
        templateVersion: PERSONAL_DEMO_TEMPLATE_VERSION,
        theme: nextTheme,
        menu: nextMenu,
      });
      if (!result.ok) {
        return { ok: false as const, message: result.message, code: result.code };
      }
      setMenu(result.value.menu);
      setTheme(result.value.theme);
      setError("");
      return { ok: true as const, value: result.value };
    },
    [theme],
  );

  const saveSettings = async (settings: OwnerSettings) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    const orderPhoneError = cashierPhoneError(settings.orderPhone, "Введите номер телефона кассира");
    if (orderPhoneError) {
      return { ok: false as const, field: "orderPhone" as const, message: orderPhoneError };
    }

    const name = settings.name.trim();
    const description = settings.description.trim();
    const subDescription = settings.subDescription.slice(0, SUB_DESCRIPTION_MAX);
    const address = settings.address.trim();
    const hours = settings.hours.trim();
    const phone = optionalPhone(settings.phone);
    if (!phone.ok) return { ok: false as const, message: "Введите телефон заведения полностью." };
    if (name.length < 1 || name.length > 120) {
      return { ok: false as const, message: "Введите название заведения, не длиннее 120 символов." };
    }
    if (description.length > 2000) return { ok: false as const, message: "Описание слишком длинное." };
    if (address.length > 300) return { ok: false as const, message: "Адрес слишком длинный." };
    if (hours.length > 120) return { ok: false as const, message: "Часы работы слишком длинные." };

    const orderEnabled = settings.orderEnabled !== false;
    const venue: Venue = {
      ...menu.venue,
      name,
      description,
      subDescription,
      address,
      phone: phone.value,
      hours,
      orderPhone: formatPhone(settings.orderPhone.trim()),
      channels: {
        telegram: orderEnabled && settings.telegram === true,
        max: orderEnabled && settings.max === true,
      },
      orderEnabled,
      callButtonEnabled: settings.callButtonEnabled === true,
    };

    const saved = persist({ ...menu, venue });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const };
  };

  const saveTheme = async (next: MenuTheme) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    if (!menuThemes.includes(next)) {
      return { ok: false as const, message: "Выберите оформление из списка." };
    }
    const saved = persist(menu, next);
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const };
  };

  const addCategory = async (name: string) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    const title = name.trim();
    if (!title) return { ok: false as const, message: "Введите название новой категории" };
    if (title.length > 80) return { ok: false as const, message: "Название категории не длиннее 80 символов." };
    const id = createId();
    const saved = persist({
      ...menu,
      categories: [...menu.categories, { id, name: title }],
    });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const, id };
  };

  const renameCategory = async (categoryId: string, name: string) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    const title = name.trim();
    if (!title) return { ok: false as const, message: "Введите название категории" };
    if (title.length > 80) return { ok: false as const, message: "Название категории не длиннее 80 символов." };
    if (!menu.categories.some((category) => category.id === categoryId)) {
      return { ok: false as const, message: "Категория не найдена." };
    }
    const saved = persist({
      ...menu,
      categories: menu.categories.map((category) =>
        category.id === categoryId ? { ...category, name: title } : category,
      ),
    });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const };
  };

  const deleteCategory = async (categoryId: string) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    if (menu.dishes.some((dish) => dish.categoryId === categoryId)) {
      return { ok: false as const, message: "Сначала удалите или перенесите блюда из этой категории." };
    }
    const saved = persist({
      ...menu,
      categories: menu.categories.filter((category) => category.id !== categoryId),
    });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const };
  };

  const saveProduct = async (input: ProductInput) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    const name = input.name.trim();
    const description = input.description.trim();
    if (!name) return { ok: false as const, message: "Введите название блюда" };
    if (name.length > 120) return { ok: false as const, message: "Название блюда не длиннее 120 символов." };
    if (description.length > 2000) return { ok: false as const, message: "Описание слишком длинное." };
    if (!Number.isInteger(input.price) || input.price < 0) {
      return { ok: false as const, message: input.price < 0 ? "Цена не может быть отрицательной." : "Введите цену целым числом рублей." };
    }
    if (input.price > 1_000_000) return { ok: false as const, message: "Цена не больше 1 000 000 ₽." };
    if (!menu.categories.some((category) => category.id === input.categoryId)) {
      return { ok: false as const, message: "Выберите категорию" };
    }

    if (!input.id) {
      const dish: Dish = {
        id: createId(),
        categoryId: input.categoryId,
        name,
        description,
        price: input.price,
        image: "",
        visible: input.visible !== false,
      };
      const saved = persist({ ...menu, dishes: [...menu.dishes, dish] });
      if (!saved.ok) return { ok: false as const, message: saved.message };
      return { ok: true as const, dish };
    }

    if (!menu.dishes.some((dish) => dish.id === input.id)) {
      return { ok: false as const, message: "Блюдо не найдено." };
    }
    const dishes = menu.dishes.map((dish) =>
      dish.id === input.id
        ? {
            ...dish,
            categoryId: input.categoryId,
            name,
            description,
            price: input.price,
            visible: input.visible !== false,
          }
        : dish,
    );
    const saved = persist({ ...menu, dishes });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    const dish = saved.value.menu.dishes.find((item) => item.id === input.id);
    if (!dish) return { ok: false as const, message: "Не удалось сохранить блюдо." };
    return { ok: true as const, dish };
  };

  const setProductVisible = async (productId: string, visible: boolean) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    if (!menu.dishes.some((dish) => dish.id === productId)) {
      return { ok: false as const, message: "Блюдо не найдено." };
    }
    const dishes = menu.dishes.map((dish) => (dish.id === productId ? { ...dish, visible } : dish));
    const saved = persist({ ...menu, dishes });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const, visible };
  };

  const deleteProduct = async (productId: string) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    const saved = persist({
      ...menu,
      dishes: menu.dishes.filter((dish) => dish.id !== productId),
    });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const };
  };

  const setProductPhoto = async (productId: string, file: File) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    if (!menu.dishes.some((dish) => dish.id === productId)) {
      return { ok: false as const, message: "Сначала сохраните блюдо, затем добавьте фото." };
    }
    const prepared = await preparePersonalDemoImage(file);
    if (!prepared.ok) return { ok: false as const, message: prepared.message };
    const dishes = menu.dishes.map((dish) =>
      dish.id === productId ? { ...dish, image: prepared.value } : dish,
    );
    const saved = persist({ ...menu, dishes });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const, path: prepared.value };
  };

  const deleteProductPhoto = async (productId: string) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    const current = menu.dishes.find((dish) => dish.id === productId);
    if (!current) return { ok: false as const, message: "Блюдо не найдено." };
    if (!current.image) return { ok: false as const, message: "У блюда нет фотографии." };
    const dishes = menu.dishes.map((dish) => (dish.id === productId ? { ...dish, image: "" } : dish));
    const saved = persist({ ...menu, dishes });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const };
  };

  const setBannerPhoto = async (file: File) => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    const prepared = await preparePersonalDemoImage(file);
    if (!prepared.ok) return { ok: false as const, message: prepared.message };
    const saved = persist({
      ...menu,
      venue: { ...menu.venue, banner: prepared.value },
    });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const, path: prepared.value };
  };

  const deleteBannerPhoto = async () => {
    if (!menu) return { ok: false as const, message: "Демо ещё не загружено." };
    if (!menu.venue.banner) return { ok: false as const, message: "У заведения нет баннера." };
    const saved = persist({
      ...menu,
      venue: { ...menu.venue, banner: "" },
    });
    if (!saved.ok) return { ok: false as const, message: saved.message };
    return { ok: true as const };
  };

  const resetDemo = async () => {
    const result = resetPersonalDemo(activeUserId.current);
    if (!result.ok) return { ok: false as const, message: result.message };
    setMenu(result.value.menu);
    setTheme(result.value.theme);
    setError("");
    return { ok: true as const, value: result.value as PersonalDemoState };
  };

  return {
    menu,
    theme,
    ready,
    error,
    saveSettings,
    saveTheme,
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
    resetDemo,
  };
}

function optionalPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, value: "" };
  const formatted = formatPhone(trimmed);
  if (formatted.length > 40 || phoneDigits(formatted).length < 11) {
    return { ok: false as const, value: "" };
  }
  return { ok: true as const, value: formatted };
}
