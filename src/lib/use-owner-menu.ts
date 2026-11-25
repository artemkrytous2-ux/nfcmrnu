"use client";

import { useEffect, useRef, useState } from "react";
import { readImageBlob, SUB_DESCRIPTION_MAX, type Dish, type MenuState, type Venue } from "@/lib/menu";
import { businessKind, isMissingKindColumn, type BusinessKind } from "@/lib/business-kind";
import { cabinetCopy } from "@/lib/cabinet-copy";
import { isMissingThemeColumn, menuTheme, menuThemes, type MenuTheme } from "@/lib/menu-theme";
import { formatPhone, phoneDigits } from "@/lib/order";
import { isOwnedPhotoPath, MAX_MENU_PHOTO_BYTES, MENU_PHOTOS_BUCKET, photoObjectPath } from "@/lib/photos";
import { isMissingPwaColumn, pwaNameFromValue, readSquareIconBlob, reportPwaIconError, storedPwaName } from "@/lib/pwa-settings";
import { getSupabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnerSettings = {
  name: string;
  description: string;
  subDescription: string;
  address: string;
  phone: string;
  hours: string;
  orderPhone: string;
  telegram: boolean;
  max: boolean;
  orderEnabled: boolean;
  callButtonEnabled: boolean;
};

type BusinessRow = {
  id: string;
  name: string;
  description: string;
  sub_description?: string | null;
  address: string;
  phone: string;
  hours: string;
  order_phone: string;
  banner_path: string;
  telegram_enabled: boolean;
  max_enabled: boolean;
  order_enabled?: boolean;
  call_button_enabled?: boolean;
  slug: string;
  status: string;
  is_published: boolean;
  is_blocked: boolean;
  is_archived: boolean;
};

export type OwnerSite = {
  slug: string;
  published: boolean;
  status: string;
  blocked: boolean;
  archived: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
};

type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  image_path: string;
  is_visible: boolean;
  sort_order: number;
};

type ProductInput = {
  id: string | null;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  visible: boolean;
};

export function useOwnerMenu(businessId: string) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [site, setSite] = useState<OwnerSite | null>(null);
  const [theme, setTheme] = useState<MenuTheme>("default");
  const [themeStorage, setThemeStorage] = useState<"ready" | "missing">("ready");
  const [kind, setKind] = useState<BusinessKind>("food");
  const [pwaName, setPwaName] = useState("");
  const [pwaIcon, setStoredPwaIcon] = useState("");
  const [pwaStorage, setPwaStorage] = useState<"ready" | "missing">("ready");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const menuStamp = useRef(0);
  const copy = cabinetCopy(kind);

  useEffect(() => {
    let active = true;
    const stamp = menuStamp.current;

    const load = async () => {
      setReady(false);
      setError("");
      setMenu(null);
      setKind("food");
      setPwaName("");
      setStoredPwaIcon("");
      setPwaStorage("ready");

      const supabase = getSupabase();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;
      if (!active) return;
      if (userError || !user) {
        setError("Сессия не подтверждена. Войдите снова.");
        setReady(true);
        return;
      }

      const loaded = await loadOwnedBusiness(supabase, businessId, user.id);

      if (!active) return;
      const venue = loaded.venue;
      const businessError = loaded.error;
      if (businessError || !venue || venue.id !== businessId) {
        setError("Не удалось загрузить заведение. Обновите страницу.");
        setReady(true);
        return;
      }

      const [categoriesResult, productsResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("business_id", venue.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, category_id, name, description, price, image_path, is_visible, sort_order")
          .eq("business_id", venue.id)
          .order("sort_order", { ascending: true }),
      ]);

      if (!active || stamp !== menuStamp.current) return;
      if (categoriesResult.error || productsResult.error) {
        setError(copy.loadFailed);
        setReady(true);
        return;
      }

      const categories = ((categoriesResult.data ?? []) as CategoryRow[])
        .filter((category) => category.id && category.name.trim())
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
        .map((category) => ({ id: category.id, name: category.name.trim() }));
      const categoryIds = new Set(categories.map((category) => category.id));

      const dishes = ((productsResult.data ?? []) as ProductRow[])
        .filter((product) => product.id && product.name.trim() && categoryIds.has(product.category_id))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
        .map((product) => ({
          id: product.id,
          categoryId: product.category_id,
          name: product.name.trim(),
          description: product.description?.trim() ?? "",
          price: Number.isFinite(Number(product.price)) ? Math.round(Number(product.price)) : 0,
          image: product.image_path ?? "",
          visible: product.is_visible !== false,
        }));

      if (!active || stamp !== menuStamp.current) return;
      setSite({
        slug: venue.slug ?? "",
        published: venue.is_published === true,
        status: venue.status ?? "",
        blocked: venue.is_blocked === true,
        archived: venue.is_archived === true,
      });
      setTheme(loaded.theme);
      setThemeStorage(loaded.storage);
      setKind(loaded.kind);
      setPwaName(loaded.pwaName);
      setStoredPwaIcon(loaded.pwaIcon);
      setPwaStorage(loaded.pwaStorage);
      setMenu({
        venue: venueFromRow(venue, venue.banner_path ?? ""),
        categories,
        dishes,
      });
      setReady(true);
    };

    void load().catch(() => {
      if (!active) return;
      setMenu(null);
      setError(copy.loadFailed);
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [businessId]);

  const saveSettings = async (settings: OwnerSettings) => {
    const orderPhoneError = cashierPhoneError(settings.orderPhone, copy.cashierPhoneRequired);
    if (orderPhoneError) {
      return { ok: false as const, field: "orderPhone" as const, message: orderPhoneError };
    }

    const checked = validateSettings(settings, copy);
    if (!checked.ok) return checked;

    const supabase = getSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return { ok: false as const, message: "Сессия не подтверждена. Войдите снова." };
    }

    const { data, error: saveError } = await supabase
      .from("businesses")
      .update({
        name: checked.values.name,
        description: checked.values.description,
        sub_description: checked.values.subDescription,
        address: checked.values.address,
        phone: checked.values.phone,
        hours: checked.values.hours,
        order_phone: checked.values.orderPhone,
        telegram_enabled: checked.values.telegram,
        max_enabled: checked.values.max,
        order_enabled: checked.values.orderEnabled,
        call_button_enabled: checked.values.callButtonEnabled,
      })
      .eq("id", businessId)
      .eq("owner_id", userData.user.id)
      .select(
        "id, name, description, sub_description, address, phone, hours, order_phone, telegram_enabled, max_enabled, order_enabled, call_button_enabled",
      )
      .maybeSingle();

    const saved = data as BusinessRow | null;
    if (saveError || !saved || saved.id !== businessId) {
      return { ok: false as const, message: "Не удалось сохранить настройки. Проверьте поля и попробуйте снова." };
    }

    setMenu((current) =>
      current
        ? {
            ...current,
            venue: venueFromRow(saved, current.venue.banner),
          }
        : current,
    );

    return { ok: true as const };
  };

  const saveTheme = async (next: MenuTheme) => {
    if (!menuThemes.includes(next)) {
      return { ok: false as const, message: "Выберите оформление из списка." };
    }
    if (themeStorage === "missing") {
      return {
        ok: false as const,
        message: "Сохранение оформления пока недоступно. Обновление базы ещё не применено.",
      };
    }

    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const { data, error: saveError } = await owned.supabase
      .from("businesses")
      .update({ theme: next })
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .select("id, theme")
      .maybeSingle();
    if (saveError && isMissingThemeColumn(saveError)) {
      setThemeStorage("missing");
      return {
        ok: false as const,
        message: "Сохранение оформления пока недоступно. Обновление базы ещё не применено.",
      };
    }
    if (saveError || data?.id !== owned.businessId || menuTheme(data?.theme) !== next) {
      return { ok: false as const, message: "Не удалось сохранить оформление." };
    }

    setTheme(next);
    return { ok: true as const };
  };

  const addCategory = async (name: string) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const title = name.trim();
    if (!title) return { ok: false as const, message: copy.newCategoryNameRequired };
    if (title.length > 80) return { ok: false as const, message: copy.categoryNameTooLong };

    const { data: latest, error: orderError } = await owned.supabase
      .from("categories")
      .select("sort_order")
      .eq("business_id", owned.businessId)
      .order("sort_order", { ascending: false })
      .limit(1);
    if (orderError) return { ok: false as const, message: copy.addCategoryFailed };

    const currentOrder = latest?.[0]?.sort_order;
    const sortOrder = typeof currentOrder === "number" ? currentOrder + 1 : 0;
    const { data, error } = await owned.supabase
      .from("categories")
      .insert({ business_id: owned.businessId, name: title, sort_order: sortOrder })
      .select("id, name, sort_order")
      .maybeSingle();
    const created = data as CategoryRow | null;
    if (error || !created?.id) return { ok: false as const, message: copy.addCategoryFailed };

    setMenu((current) =>
      current
        ? { ...current, categories: [...current.categories, { id: created.id, name: created.name.trim() }] }
        : current,
    );
    return { ok: true as const, id: created.id };
  };

  const renameCategory = async (categoryId: string, name: string) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const title = name.trim();
    if (!title) return { ok: false as const, message: copy.categoryNameRequired };
    if (title.length > 80) return { ok: false as const, message: copy.categoryNameTooLong };

    const { data, error } = await owned.supabase
      .from("categories")
      .update({ name: title })
      .eq("id", categoryId)
      .eq("business_id", owned.businessId)
      .select("id, name")
      .maybeSingle();
    if (error || !data || data.id !== categoryId) {
      return { ok: false as const, message: copy.saveCategoryFailed };
    }

    setMenu((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((category) =>
              category.id === categoryId ? { ...category, name: data.name.trim() } : category,
            ),
          }
        : current,
    );
    return { ok: true as const };
  };

  const deleteCategory = async (categoryId: string) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const { count: categoryCount, error: countError } = await owned.supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("business_id", owned.businessId);
    if (countError || categoryCount === null) {
      return { ok: false as const, message: copy.deleteCategoryFailed };
    }
    if (categoryCount <= 1) {
      return {
        ok: false as const,
        message: copy.lastCategory,
      };
    }

    const { count: productCount, error: productError } = await owned.supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", owned.businessId)
      .eq("category_id", categoryId);
    if (productError || productCount === null) {
      return { ok: false as const, message: copy.deleteCategoryFailed };
    }
    if (productCount > 0) {
      return { ok: false as const, message: copy.categoryHasItems };
    }

    const { data, error } = await owned.supabase
      .from("categories")
      .delete()
      .eq("id", categoryId)
      .eq("business_id", owned.businessId)
      .select("id");
    if (error || !data?.some((row) => row.id === categoryId)) {
      return { ok: false as const, message: copy.deleteCategoryFailed };
    }

    setMenu((current) =>
      current
        ? { ...current, categories: current.categories.filter((category) => category.id !== categoryId) }
        : current,
    );
    return { ok: true as const };
  };

  const saveProduct = async (input: ProductInput) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const name = input.name.trim();
    const description = input.description.trim();
    const price = input.price;
    if (!name) return { ok: false as const, message: copy.itemNameRequired };
    if (name.length > 120) return { ok: false as const, message: copy.itemNameTooLong };
    if (description.length > 2000) return { ok: false as const, message: "Описание слишком длинное." };
    if (!Number.isInteger(price) || price < 0) {
      return { ok: false as const, message: price < 0 ? copy.priceNegative : copy.priceInteger };
    }
    if (price > 1_000_000) return { ok: false as const, message: copy.priceTooHigh };
    if (input.id && !isUuid(input.id)) return { ok: false as const, message: copy.saveItemFailed };

    const { data: category, error: categoryError } = await owned.supabase
      .from("categories")
      .select("id")
      .eq("id", input.categoryId)
      .eq("business_id", owned.businessId)
      .maybeSingle();
    if (categoryError || !category || category.id !== input.categoryId) {
      return { ok: false as const, message: copy.chooseOwnCategory };
    }

    const values = {
      category_id: category.id,
      name,
      description,
      price,
      is_visible: input.visible,
    };

    if (!input.id) {
      const { data: latest, error: orderError } = await owned.supabase
        .from("products")
        .select("sort_order")
        .eq("business_id", owned.businessId)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (orderError) return { ok: false as const, message: copy.saveItemFailed };

      const currentOrder = latest?.[0]?.sort_order;
      const sortOrder = typeof currentOrder === "number" ? currentOrder + 1 : 0;
      const { data, error } = await owned.supabase
        .from("products")
        .insert({ ...values, business_id: owned.businessId, sort_order: sortOrder })
        .select("id, category_id, name, description, price, image_path, is_visible, sort_order")
        .maybeSingle();
      const created = data as ProductRow | null;
      if (error || !created?.id) return { ok: false as const, message: productErrorMessage(error, copy) };
      const dish = dishFromRow(created);
      setMenu((current) => (current ? { ...current, dishes: [...current.dishes, dish] } : current));
      return { ok: true as const, dish };
    }

    const { data, error } = await owned.supabase
      .from("products")
      .update(values)
      .eq("id", input.id)
      .eq("business_id", owned.businessId)
      .select("id, category_id, name, description, price, image_path, is_visible, sort_order")
      .maybeSingle();
    const saved = data as ProductRow | null;
    if (error || !saved || saved.id !== input.id) return { ok: false as const, message: productErrorMessage(error, copy) };
    const dish = dishFromRow(saved);
    setMenu((current) =>
      current
        ? { ...current, dishes: current.dishes.map((item) => (item.id === dish.id ? dish : item)) }
        : current,
    );
    return { ok: true as const, dish };
  };

  const setProductVisible = async (productId: string, visible: boolean) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;
    if (!isUuid(productId)) return { ok: false as const, message: copy.visibilityFailed };

    const { data, error } = await owned.supabase
      .from("products")
      .update({ is_visible: visible })
      .eq("id", productId)
      .eq("business_id", owned.businessId)
      .select("id, is_visible")
      .maybeSingle();
    if (error) return { ok: false as const, message: copy.visibilityFailed };

    let savedVisible = asVisible(data?.is_visible);
    if (!data || data.id !== productId || savedVisible === null) {
      const confirmed = await owned.supabase
        .from("products")
        .select("id, is_visible")
        .eq("id", productId)
        .eq("business_id", owned.businessId)
        .maybeSingle();
      savedVisible = asVisible(confirmed.data?.is_visible);
      if (confirmed.error || confirmed.data?.id !== productId || savedVisible === null) {
        return { ok: false as const, message: copy.visibilityFailed };
      }
    }
    if (savedVisible !== visible) {
      return { ok: false as const, message: copy.visibilityFailed };
    }

    menuStamp.current += 1;
    setMenu((current) =>
      current
        ? {
            ...current,
            dishes: current.dishes.map((dish) => (dish.id === productId ? { ...dish, visible: savedVisible } : dish)),
          }
        : current,
    );
    return { ok: true as const, visible: savedVisible };
  };

  const deleteProduct = async (productId: string) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;
    if (!isUuid(productId)) return { ok: false as const, message: copy.deleteItemFailed };

    const { data, error } = await owned.supabase
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("business_id", owned.businessId)
      .select("id");
    if (error || !data?.some((row) => row.id === productId)) {
      return { ok: false as const, message: copy.deleteItemFailed };
    }

    setMenu((current) =>
      current ? { ...current, dishes: current.dishes.filter((dish) => dish.id !== productId) } : current,
    );
    return { ok: true as const };
  };

  const setProductPhoto = async (productId: string, file: File) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;
    if (!isUuid(productId)) return { ok: false as const, message: copy.saveBeforePhoto };

    const { data: existing, error: readError } = await owned.supabase
      .from("products")
      .select("id, image_path")
      .eq("id", productId)
      .eq("business_id", owned.businessId)
      .maybeSingle();
    const previous = typeof existing?.image_path === "string" ? existing.image_path : "";
    if (readError || !existing || existing.id !== productId) {
      logPhotoDiagnostic(
        "product-photo",
        "product_lookup",
        readError ?? { message: "Услуга этого заведения не возвращена. Проверьте product_id и business_id." },
      );
      return { ok: false as const, message: "Не удалось загрузить фотографию." };
    }

    const path = photoObjectPath(owned.businessId, "products", `${productId}-${Date.now()}.jpg`);
    if (!path) return { ok: false as const, message: "Не удалось загрузить фотографию." };

    const uploaded = await uploadJpeg(owned.supabase, path, file, "Не удалось загрузить фотографию.");
    if (!uploaded.ok) {
      if (uploaded.error) logPhotoDiagnostic("product-photo", "storage_upload", uploaded.error);
      return { ok: false as const, message: uploaded.message };
    }

    const { data, error } = await owned.supabase
      .from("products")
      .update({ image_path: path })
      .eq("id", productId)
      .eq("business_id", owned.businessId)
      .select("id, image_path")
      .maybeSingle();
    if (error || data?.id !== productId || data.image_path !== path) {
      if (error) {
        logPhotoDiagnostic("product-photo", "database_update", error);
      } else if (!data) {
        logPhotoDiagnostic("product-photo", "database_update", {
          message: "Строка не была возвращена. Проверьте фильтры id и business_id и RLS.",
        });
      } else if (data.image_path !== path) {
        logPhotoDiagnostic("product-photo", "database_update", {
          message: "Строка возвращена, но image_path отличается от отправленного пути.",
        });
      } else {
        logPhotoDiagnostic("product-photo", "database_update", {
          message: "Строка возвращена, но id не совпал с услугой.",
        });
      }
      await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([path]);
      return { ok: false as const, message: "Не удалось загрузить фотографию." };
    }

    if (previous && previous !== path && isOwnedPhotoPath(previous, owned.businessId, "products")) {
      await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([previous]);
    }

    menuStamp.current += 1;
    setMenu((current) =>
      current
        ? {
            ...current,
            dishes: current.dishes.map((dish) => (dish.id === productId ? { ...dish, image: path } : dish)),
          }
        : current,
    );
    return { ok: true as const, path };
  };

  const deleteProductPhoto = async (productId: string) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;
    if (!isUuid(productId)) return { ok: false as const, message: "Не удалось удалить фотографию." };

    const { data: existing, error: readError } = await owned.supabase
      .from("products")
      .select("id, image_path")
      .eq("id", productId)
      .eq("business_id", owned.businessId)
      .maybeSingle();
    const previous = typeof existing?.image_path === "string" ? existing.image_path : "";
    if (readError || !existing || existing.id !== productId) {
      return { ok: false as const, message: "Не удалось удалить фотографию." };
    }
    if (!previous) return { ok: false as const, message: copy.noItemPhoto };
    if (!isOwnedPhotoPath(previous, owned.businessId, "products")) {
      return { ok: false as const, message: "Не удалось удалить фотографию." };
    }

    const removed = await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([previous]);
    if (removed.error) return { ok: false as const, message: "Не удалось удалить фотографию." };

    const { data, error } = await owned.supabase
      .from("products")
      .update({ image_path: "" })
      .eq("id", productId)
      .eq("business_id", owned.businessId)
      .select("id, image_path")
      .maybeSingle();
    if (error || data?.id !== productId || data.image_path !== "") {
      return { ok: false as const, message: "Не удалось удалить фотографию." };
    }

    menuStamp.current += 1;
    setMenu((current) =>
      current
        ? {
            ...current,
            dishes: current.dishes.map((dish) => (dish.id === productId ? { ...dish, image: "" } : dish)),
          }
        : current,
    );
    return { ok: true as const };
  };

  const setBannerPhoto = async (file: File) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const { data: existing, error: readError } = await owned.supabase
      .from("businesses")
      .select("id, banner_path")
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .maybeSingle();
    const previous = typeof existing?.banner_path === "string" ? existing.banner_path : "";
    if (readError || !existing || existing.id !== owned.businessId) {
      return { ok: false as const, message: "Не удалось загрузить баннер." };
    }

    const path = photoObjectPath(owned.businessId, "banner", `banner-${Date.now()}.jpg`);
    if (!path) return { ok: false as const, message: "Не удалось загрузить баннер." };

    const uploaded = await uploadJpeg(owned.supabase, path, file, "Не удалось загрузить баннер.");
    if (!uploaded.ok) {
      if (uploaded.error) logPhotoDiagnostic("banner", "storage_upload", uploaded.error);
      return { ok: false as const, message: uploaded.message };
    }

    const { data, error } = await owned.supabase
      .from("businesses")
      .update({ banner_path: path })
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .select("id, banner_path")
      .maybeSingle();
    const savedBanner = data?.banner_path;
    if (error || data?.id !== owned.businessId || savedBanner !== path) {
      if (error) {
        logPhotoDiagnostic("banner", "database_update", error);
      } else if (!data) {
        logPhotoDiagnostic("banner", "database_update", {
          message: "Строка не была возвращена. Проверьте фильтры id и owner_id и RLS.",
        });
      } else if (savedBanner !== path) {
        logPhotoDiagnostic("banner", "database_update", {
          message: "Строка возвращена, но banner_path отличается от отправленного пути.",
        });
      } else {
        logPhotoDiagnostic("banner", "database_update", {
          message: "Строка возвращена, но id не совпал с заведением владельца.",
        });
      }
      await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([path]);
      return { ok: false as const, message: "Не удалось загрузить баннер." };
    }

    if (previous && previous !== path && isOwnedPhotoPath(previous, owned.businessId, "banner")) {
      await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([previous]);
    }

    menuStamp.current += 1;
    setMenu((current) =>
      current ? { ...current, venue: { ...current.venue, banner: path } } : current,
    );
    return { ok: true as const, path };
  };

  const deleteBannerPhoto = async () => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const { data: existing, error: readError } = await owned.supabase
      .from("businesses")
      .select("id, banner_path")
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .maybeSingle();
    const previous = typeof existing?.banner_path === "string" ? existing.banner_path : "";
    if (readError || !existing || existing.id !== owned.businessId) {
      return { ok: false as const, message: "Не удалось удалить баннер." };
    }
    if (!previous) return { ok: false as const, message: "У заведения нет баннера." };
    if (!isOwnedPhotoPath(previous, owned.businessId, "banner")) {
      return { ok: false as const, message: "Не удалось удалить баннер." };
    }

    const removed = await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([previous]);
    if (removed.error) return { ok: false as const, message: "Не удалось удалить баннер." };

    const { data, error } = await owned.supabase
      .from("businesses")
      .update({ banner_path: "" })
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .select("id, banner_path")
      .maybeSingle();
    if (error || data?.id !== owned.businessId || data?.banner_path !== "") {
      return { ok: false as const, message: "Не удалось удалить баннер." };
    }

    menuStamp.current += 1;
    setMenu((current) =>
      current ? { ...current, venue: { ...current.venue, banner: "" } } : current,
    );
    return { ok: true as const };
  };

  const savePwaName = async (name: string) => {
    const checked = storedPwaName(name);
    if (!checked.ok) return checked;
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const { data, error } = await owned.supabase
      .from("businesses")
      .update({ pwa_name: checked.name })
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .select("id, pwa_name")
      .maybeSingle();
    if (error && isMissingPwaColumn(error)) {
      return { ok: false as const, message: "Сохранение приложения пока недоступно. Обновление базы ещё не применено." };
    }
    const savedName = pwaNameFromValue(data?.pwa_name);
    if (error || data?.id !== owned.businessId || savedName !== (checked.name ?? "")) {
      return { ok: false as const, message: "Не удалось сохранить название приложения." };
    }
    setPwaName(savedName);
    return { ok: true as const };
  };

  const setPwaIcon = async (file: File) => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const { data: existing, error: readError } = await owned.supabase
      .from("businesses")
      .select("id, pwa_icon_path")
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .maybeSingle();
    const previous = typeof existing?.pwa_icon_path === "string" ? existing.pwa_icon_path : "";
    if (readError && isMissingPwaColumn(readError)) {
      return { ok: false as const, message: "Сохранение приложения пока недоступно. Обновление базы ещё не применено." };
    }
    if (readError || !existing || existing.id !== owned.businessId) {
      return { ok: false as const, message: "Не удалось загрузить иконку." };
    }

    const path = photoObjectPath(owned.businessId, "pwa-icon", `icon-${Date.now()}.jpg`);
    if (!path) return { ok: false as const, message: "Не удалось загрузить иконку." };

    let blob: Blob;
    try {
      blob = await readSquareIconBlob(file);
    } catch {
      return { ok: false as const, message: "Не удалось использовать это изображение. Выберите другое." };
    }
    if (blob.size > MAX_MENU_PHOTO_BYTES) {
      return { ok: false as const, message: "Иконка больше 5 МБ. Выберите другое изображение." };
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const uploaded = await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (uploaded.error) {
      return {
        ok: false as const,
        message: reportPwaIconError("storage_upload", uploaded.error, { path }),
      };
    }

    const { data, error } = await owned.supabase
      .from("businesses")
      .update({ pwa_icon_path: path })
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .select("id, pwa_icon_path")
      .maybeSingle();
    if (error || data?.id !== owned.businessId || data?.pwa_icon_path !== path) {
      await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([path]);
      if (error && isMissingPwaColumn(error)) {
        return { ok: false as const, message: "Сохранение приложения пока недоступно. Обновление базы ещё не применено." };
      }
      return {
        ok: false as const,
        message: reportPwaIconError("database_update", error, {
          path,
          saved: typeof data?.pwa_icon_path === "string" ? data.pwa_icon_path : "",
          id: data?.id ?? "",
        }),
      };
    }
    if (previous && previous !== path && isOwnedPhotoPath(previous, owned.businessId, "pwa-icon")) {
      await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([previous]);
    }
    setStoredPwaIcon(path);
    return { ok: true as const, path };
  };

  const deletePwaIcon = async () => {
    const owned = await ownedBusiness(businessId);
    if (!owned.ok) return owned;

    const { data: existing, error: readError } = await owned.supabase
      .from("businesses")
      .select("id, pwa_icon_path")
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .maybeSingle();
    const previous = typeof existing?.pwa_icon_path === "string" ? existing.pwa_icon_path : "";
    if (readError && isMissingPwaColumn(readError)) {
      return { ok: false as const, message: "Сохранение приложения пока недоступно. Обновление базы ещё не применено." };
    }
    if (readError || !existing || existing.id !== owned.businessId) {
      return { ok: false as const, message: "Не удалось удалить иконку." };
    }
    if (!previous) return { ok: false as const, message: "Своей иконки пока нет." };
    if (!isOwnedPhotoPath(previous, owned.businessId, "pwa-icon")) {
      return { ok: false as const, message: "Не удалось удалить иконку." };
    }

    const removed = await owned.supabase.storage.from(MENU_PHOTOS_BUCKET).remove([previous]);
    if (removed.error) return { ok: false as const, message: "Не удалось удалить иконку." };

    const { data, error } = await owned.supabase
      .from("businesses")
      .update({ pwa_icon_path: null })
      .eq("id", owned.businessId)
      .eq("owner_id", owned.userId)
      .select("id, pwa_icon_path")
      .maybeSingle();
    if (error || data?.id !== owned.businessId || data?.pwa_icon_path) {
      return { ok: false as const, message: "Не удалось удалить иконку." };
    }
    setStoredPwaIcon("");
    return { ok: true as const };
  };

  return {
    menu,
    site,
    theme,
    themeStorage,
    kind,
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

const ownerBusinessColumnsBase =
  "id, name, description, address, phone, hours, order_phone, banner_path, telegram_enabled, max_enabled, slug, status, is_published, is_blocked, is_archived";

async function loadOwnedBusiness(supabase: SupabaseClient, businessId: string, userId: string) {
  let includeTheme = true;
  let includeKind = true;
  let includePwa = true;
  let includeOrderCall = true;
  let includeSubDescription = true;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const orderCall = includeOrderCall ? ", order_enabled, call_button_enabled" : "";
    const subDescription = includeSubDescription ? ", sub_description" : "";
    const columns = `${ownerBusinessColumnsBase}${orderCall}${subDescription}`;
    const extra = [
      includeTheme ? "theme" : "",
      includeKind ? "kind" : "",
      includePwa ? "pwa_name, pwa_icon_path" : "",
    ].filter(Boolean);
    const result = await supabase
      .from("businesses")
      .select(extra.length > 0 ? `${columns}, ${extra.join(", ")}` : columns)
      .eq("id", businessId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!result.error) {
      const venue = result.data as (BusinessRow & { theme?: unknown; kind?: unknown; pwa_name?: unknown; pwa_icon_path?: unknown }) | null;
      const icon = typeof venue?.pwa_icon_path === "string" ? venue.pwa_icon_path : "";
      return {
        venue,
        theme: menuTheme(venue?.theme),
        kind: businessKind(venue?.kind),
        error: null,
        storage: includeTheme ? ("ready" as const) : ("missing" as const),
        pwaName: includePwa ? pwaNameFromValue(venue?.pwa_name) : "",
        pwaIcon: includePwa && venue && isOwnedPhotoPath(icon, venue.id, "pwa-icon") ? icon : "",
        pwaStorage: includePwa ? ("ready" as const) : ("missing" as const),
      };
    }

    lastError = result.error;
    if (includeSubDescription && isMissingSubDescriptionColumn(result.error)) {
      includeSubDescription = false;
      continue;
    }
    if (includeOrderCall && isMissingOrderCallColumn(result.error)) {
      includeOrderCall = false;
      continue;
    }
    if (includeTheme && isMissingThemeColumn(result.error) && result.error.message?.toLowerCase().includes("theme")) {
      includeTheme = false;
      continue;
    }
    if (includeKind && isMissingKindColumn(result.error)) {
      includeKind = false;
      continue;
    }
    if (includePwa && isMissingPwaColumn(result.error)) {
      includePwa = false;
      continue;
    }
    break;
  }

  return {
    venue: null,
    theme: "default" as const,
    kind: "food" as const,
    error: lastError,
    storage: "ready" as const,
    pwaName: "",
    pwaIcon: "",
    pwaStorage: "ready" as const,
  };
}

async function uploadJpeg(supabase: SupabaseClient, path: string, file: File, failMessage: string) {
  let blob: Blob;
  try {
    blob = await readImageBlob(file);
  } catch {
    return { ok: false as const, message: "Не удалось использовать это фото. Попробуйте другой файл." };
  }
  if (blob.size > MAX_MENU_PHOTO_BYTES) {
    return { ok: false as const, message: "Фото больше 5 МБ. Выберите другое." };
  }

  const { error } = await supabase.storage.from(MENU_PHOTOS_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) return { ok: false as const, message: failMessage, error };
  return { ok: true as const };
}

function logPhotoDiagnostic(
  marker: "banner" | "product-photo",
  stage: "storage_upload" | "database_update" | "product_lookup",
  error: { message?: string; code?: string; details?: string; hint?: string },
) {
  console.error(`[${marker}]`, {
    stage,
    message: error.message ?? "",
    code: error.code ?? "",
    details: error.details ?? "",
    hint: error.hint ?? "",
  });
}

async function ownedBusiness(businessId: string) {
  const supabase = getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, message: "Сессия не подтверждена. Войдите снова." };
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (error || !data || data.id !== businessId) {
    return { ok: false as const, message: "Не удалось подтвердить заведение." };
  }

  return { ok: true as const, supabase, businessId: data.id, userId: userData.user.id };
}

function dishFromRow(product: ProductRow): Dish {
  return {
    id: product.id,
    categoryId: product.category_id,
    name: product.name.trim(),
    description: product.description?.trim() ?? "",
    price: Number.isInteger(product.price) ? product.price : Math.round(Number(product.price)),
    image: product.image_path ?? "",
    visible: product.is_visible !== false,
  };
}

function asVisible(value: unknown) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function productErrorMessage(
  error: { message?: string; code?: string } | null,
  copy: ReturnType<typeof cabinetCopy>,
) {
  const message = error?.message ?? "";
  if (message.includes("Категория не принадлежит")) return copy.chooseOwnCategory;
  if (error?.code === "23503") return copy.chooseOwnCategory;
  if (error?.code === "23514") return copy.checkFields;
  return copy.saveItemFailed;
}

function venueFromRow(venue: BusinessRow, banner: string): Venue {
  return {
    name: venue.name.trim(),
    description: venue.description ?? "",
    subDescription: storedSubDescription(venue.sub_description),
    address: venue.address ?? "",
    phone: venue.phone ?? "",
    hours: venue.hours ?? "",
    orderPhone: venue.order_phone ?? "",
    banner,
    channels: {
      telegram: venue.telegram_enabled,
      max: venue.max_enabled,
    },
    orderEnabled: venue.order_enabled !== false,
    callButtonEnabled: venue.call_button_enabled === true,
  };
}

function storedSubDescription(value: unknown) {
  if (typeof value !== "string") return "";
  return value.slice(0, SUB_DESCRIPTION_MAX);
}

function isMissingOrderCallColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  if (!message.includes("order_enabled") && !message.includes("call_button_enabled")) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isMissingSubDescriptionColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  if (!message.includes("sub_description")) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function validateSettings(settings: OwnerSettings, copy: ReturnType<typeof cabinetCopy>) {
  const name = settings.name.trim();
  const description = settings.description.trim();
  const subDescription = settings.subDescription.slice(0, SUB_DESCRIPTION_MAX);
  const address = settings.address.trim();
  const hours = settings.hours.trim();
  const phone = optionalPhone(settings.phone);
  const orderPhoneError = cashierPhoneError(settings.orderPhone, copy.cashierPhoneRequired);
  if (orderPhoneError) {
    return { ok: false as const, field: "orderPhone" as const, message: orderPhoneError };
  }

  if (name.length < 1 || name.length > 120) {
    return { ok: false as const, message: "Введите название заведения, не длиннее 120 символов." };
  }
  if (description.length > 2000) {
    return { ok: false as const, message: "Описание слишком длинное." };
  }
  if (subDescription.length > SUB_DESCRIPTION_MAX) {
    return { ok: false as const, message: `Подописание не длиннее ${SUB_DESCRIPTION_MAX} символов.` };
  }
  if (address.length > 300) {
    return { ok: false as const, message: "Адрес слишком длинный." };
  }
  if (hours.length > 120) {
    return { ok: false as const, message: "Часы работы слишком длинные." };
  }
  if (!phone.ok) return { ok: false as const, message: "Введите телефон заведения полностью." };

  const orderEnabled = settings.orderEnabled !== false;
  return {
    ok: true as const,
    values: {
      name,
      description,
      subDescription,
      address,
      phone: phone.value,
      hours,
      orderPhone: formatPhone(settings.orderPhone.trim()),
      telegram: orderEnabled && settings.telegram === true,
      max: orderEnabled && settings.max === true,
      orderEnabled,
      callButtonEnabled: settings.callButtonEnabled === true,
    },
  };
}

export function cashierPhoneError(value: string, emptyMessage = "Введите номер телефона кассира") {
  const trimmed = value.trim();
  if (!trimmed || phoneDigits(trimmed).length === 0) {
    return emptyMessage;
  }
  const formatted = formatPhone(trimmed);
  if (formatted.length > 40 || phoneDigits(formatted).length < 11) {
    return "Проверьте номер телефона";
  }
  return "";
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
