import type { SupabaseClient } from "@supabase/supabase-js";
import { businessKind, isMissingKindColumn } from "@/lib/business-kind";
import { SUB_DESCRIPTION_MAX } from "@/lib/menu";
import { isMissingThemeColumn, menuTheme, menuThemes, type MenuTheme } from "@/lib/menu-theme";
import { formatPhone, phoneDigits } from "@/lib/order";
import { isMissingPwaColumn, pwaNameFromValue, reportPwaIconError, storedPwaName } from "@/lib/pwa-settings";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const filePattern = /^[A-Za-z0-9._-]{1,180}$/;

type Failure = { ok: false; message: string };
type Success<T> = { ok: true } & T;

export function isBusinessId(value: string) {
  return uuidPattern.test(value);
}

export async function loadSuperadminMenu(supabase: SupabaseClient, businessId: string) {
  const business = await readBusiness(supabase, businessId);
  if (!business) return fail("Не удалось загрузить заведение. Обновите страницу.");

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select("id, category_id, name, description, price, image_path, is_visible, sort_order")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true }),
  ]);
  if (categoriesResult.error || productsResult.error) {
    return fail("Не удалось загрузить меню. Обновите страницу.");
  }

  const categories = (categoriesResult.data ?? [])
    .filter((category) => category.id && category.name.trim())
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
    .map((category) => ({ id: category.id, name: category.name.trim() }));
  const categoryIds = new Set(categories.map((category) => category.id));
  const dishes = (productsResult.data ?? [])
    .filter((product) => product.id && product.name.trim() && categoryIds.has(product.category_id))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
    .map(dishFromRow);

  return {
    ok: true as const,
    venue: venueFromRow(business.row),
    categories,
    dishes,
    kind: business.kind,
    theme: business.theme,
    themeStorage: business.themeStorage,
    site: {
      slug: business.row.slug,
      published: business.row.is_published === true,
      status: business.row.status,
      blocked: business.row.is_blocked === true,
      archived: business.row.is_archived === true,
    },
    pwa: {
      name: business.pwaName,
      icon: business.pwaIcon,
      storage: business.pwaStorage,
    },
  };
}

export async function saveSuperadminSettings(
  supabase: SupabaseClient,
  businessId: string,
  input: Record<string, unknown>,
) {
  const checked = validateSettings(input);
  if (!checked.ok) return checked;
  const { data, error } = await supabase
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
    .select(
      "id, name, description, sub_description, address, phone, hours, order_phone, banner_path, telegram_enabled, max_enabled, order_enabled, call_button_enabled",
    )
    .maybeSingle();
  if (error || data?.id !== businessId) {
    return fail("Не удалось сохранить настройки. Проверьте поля и попробуйте снова.");
  }
  return { ok: true as const, venue: venueFromRow(data) };
}

export async function addSuperadminCategory(supabase: SupabaseClient, businessId: string, name: unknown) {
  const title = typeof name === "string" ? name.trim() : "";
  if (!title) return fail("Введите название новой категории");
  if (title.length > 80) return fail("Название категории не длиннее 80 символов.");
  if (!(await businessExists(supabase, businessId))) return fail("Не удалось добавить категорию.");

  const { data: latest, error: orderError } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (orderError) return fail("Не удалось добавить категорию.");
  const currentOrder = latest?.[0]?.sort_order;
  const sortOrder = typeof currentOrder === "number" ? currentOrder + 1 : 0;
  const { data, error } = await supabase
    .from("categories")
    .insert({ business_id: businessId, name: title, sort_order: sortOrder })
    .select("id, name")
    .maybeSingle();
  if (error || !data?.id) return fail("Не удалось добавить категорию.");
  return { ok: true as const, id: data.id, name: data.name.trim() };
}

export async function renameSuperadminCategory(
  supabase: SupabaseClient,
  businessId: string,
  categoryId: unknown,
  name: unknown,
) {
  if (!isId(categoryId)) return fail("Не удалось сохранить категорию.");
  const title = typeof name === "string" ? name.trim() : "";
  if (!title) return fail("Введите название категории");
  if (title.length > 80) return fail("Название категории не длиннее 80 символов.");
  const { data, error } = await supabase
    .from("categories")
    .update({ name: title })
    .eq("id", categoryId)
    .eq("business_id", businessId)
    .select("id, name")
    .maybeSingle();
  if (error || data?.id !== categoryId) return fail("Не удалось сохранить категорию.");
  return { ok: true as const, id: data.id, name: data.name.trim() };
}

export async function deleteSuperadminCategory(supabase: SupabaseClient, businessId: string, categoryId: unknown) {
  if (!isId(categoryId)) return fail("Не удалось удалить категорию.");
  const { count: categoryCount, error: countError } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (countError || categoryCount === null) return fail("Не удалось удалить категорию.");
  if (categoryCount <= 1) {
    return fail("Нельзя удалить последнюю категорию. У каждого заведения должна оставаться хотя бы одна категория");
  }
  const { count: productCount, error: productError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("category_id", categoryId);
  if (productError || productCount === null) return fail("Не удалось удалить категорию.");
  if (productCount > 0) return fail("Нельзя удалить категорию, пока в ней есть блюда");

  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("business_id", businessId)
    .select("id");
  if (error || !data?.some((row) => row.id === categoryId)) return fail("Не удалось удалить категорию.");
  return { ok: true as const };
}

export async function saveSuperadminProduct(
  supabase: SupabaseClient,
  businessId: string,
  input: Record<string, unknown>,
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const price = input.price;
  const categoryId = input.categoryId;
  const visible = input.visible === true;
  const id = input.id;
  if (!name) return fail("Введите название блюда");
  if (name.length > 120) return fail("Название блюда не длиннее 120 символов.");
  if (description.length > 2000) return fail("Описание слишком длинное.");
  if (typeof price !== "number" || !Number.isInteger(price) || price < 0) {
    return fail(typeof price === "number" && price < 0 ? "Цена не может быть отрицательной." : "Введите цену целым числом рублей.");
  }
  if (price > 1_000_000) return fail("Цена не больше 1 000 000 ₽.");
  if (id !== null && id !== undefined && !isId(id)) return fail("Не удалось сохранить блюдо.");
  if (!isId(categoryId)) return fail("Выберите категорию своего заведения.");

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (categoryError || category?.id !== categoryId) return fail("Выберите категорию своего заведения.");

  const values = { category_id: categoryId, name, description, price, is_visible: visible };
  if (!id) {
    const { data: latest, error: orderError } = await supabase
      .from("products")
      .select("sort_order")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: false })
      .limit(1);
    if (orderError) return fail("Не удалось сохранить блюдо.");
    const currentOrder = latest?.[0]?.sort_order;
    const sortOrder = typeof currentOrder === "number" ? currentOrder + 1 : 0;
    const { data, error } = await supabase
      .from("products")
      .insert({ ...values, business_id: businessId, sort_order: sortOrder })
      .select("id, category_id, name, description, price, image_path, is_visible")
      .maybeSingle();
    if (error || !data?.id) return fail(productError(error));
    return { ok: true as const, dish: dishFromRow(data) };
  }

  const { data, error } = await supabase
    .from("products")
    .update(values)
    .eq("id", id)
    .eq("business_id", businessId)
    .select("id, category_id, name, description, price, image_path, is_visible")
    .maybeSingle();
  if (error || data?.id !== id) return fail(productError(error));
  return { ok: true as const, dish: dishFromRow(data) };
}

export async function setSuperadminProductVisible(
  supabase: SupabaseClient,
  businessId: string,
  productId: unknown,
  visible: unknown,
) {
  if (!isId(productId) || typeof visible !== "boolean") return fail("Не удалось изменить видимость блюда.");
  const { data, error } = await supabase
    .from("products")
    .update({ is_visible: visible })
    .eq("id", productId)
    .eq("business_id", businessId)
    .select("id, is_visible")
    .maybeSingle();
  if (error || data?.id !== productId || data.is_visible !== visible) {
    return fail("Не удалось изменить видимость блюда.");
  }
  return { ok: true as const, visible: data.is_visible };
}

export async function deleteSuperadminProduct(supabase: SupabaseClient, businessId: string, productId: unknown) {
  if (!isId(productId)) return fail("Не удалось удалить блюдо.");
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("business_id", businessId)
    .select("id");
  if (error || !data?.some((row) => row.id === productId)) return fail("Не удалось удалить блюдо.");
  return { ok: true as const };
}

export async function saveSuperadminPhoto(
  supabase: SupabaseClient,
  businessId: string,
  kind: unknown,
  productId: unknown,
  file: File,
) {
  if (file.size > 5 * 1024 * 1024) return fail("Фото больше 5 МБ. Выберите другое.");
  if (kind === "pwa-icon") {
    if (!(await isJpegFile(file))) return fail("Не удалось использовать это изображение. Выберите другое.");
    return savePwaIcon(supabase, businessId, file);
  }
  if (file.type !== "image/jpeg") return fail("Не удалось использовать это фото. Попробуйте другой файл.");
  if (kind === "banner") return saveBanner(supabase, businessId, file);
  if (kind === "product" && isId(productId)) return saveProductPhoto(supabase, businessId, productId, file);
  return fail("Не удалось загрузить фотографию.");
}

export async function deleteSuperadminPhoto(
  supabase: SupabaseClient,
  businessId: string,
  kind: unknown,
  productId: unknown,
) {
  if (kind === "banner") return deleteBanner(supabase, businessId);
  if (kind === "pwa-icon") return deletePwaIcon(supabase, businessId);
  if (kind === "product" && isId(productId)) return deleteProductPhoto(supabase, businessId, productId);
  return fail("Не удалось удалить фотографию.");
}

async function saveProductPhoto(supabase: SupabaseClient, businessId: string, productId: string, file: File) {
  const { data: existing, error: readError } = await supabase
    .from("products")
    .select("id, image_path")
    .eq("id", productId)
    .eq("business_id", businessId)
    .maybeSingle();
  const previous = typeof existing?.image_path === "string" ? existing.image_path : "";
  if (readError || existing?.id !== productId) return fail("Не удалось загрузить фотографию.");
  const path = photoPath(businessId, "products", `${productId}-${Date.now()}.jpg`);
  const uploaded = await upload(supabase, path, file);
  if (!uploaded.ok) return fail("Не удалось загрузить фотографию.");
  const { data, error } = await supabase
    .from("products")
    .update({ image_path: path })
    .eq("id", productId)
    .eq("business_id", businessId)
    .select("id, image_path")
    .maybeSingle();
  if (error || data?.id !== productId || data.image_path !== path) {
    await supabase.storage.from("menu-photos").remove([path]);
    return fail("Не удалось загрузить фотографию.");
  }
  if (previous && previous !== path && isPhotoPath(previous, businessId, "products")) {
    await supabase.storage.from("menu-photos").remove([previous]);
  }
  return { ok: true as const, path };
}

async function deleteProductPhoto(supabase: SupabaseClient, businessId: string, productId: string) {
  const { data: existing, error: readError } = await supabase
    .from("products")
    .select("id, image_path")
    .eq("id", productId)
    .eq("business_id", businessId)
    .maybeSingle();
  const previous = typeof existing?.image_path === "string" ? existing.image_path : "";
  if (readError || existing?.id !== productId) return fail("Не удалось удалить фотографию.");
  if (!previous) return fail("У блюда нет фотографии.");
  if (!isPhotoPath(previous, businessId, "products")) return fail("Не удалось удалить фотографию.");
  const removed = await supabase.storage.from("menu-photos").remove([previous]);
  if (removed.error) return fail("Не удалось удалить фотографию.");
  const { data, error } = await supabase
    .from("products")
    .update({ image_path: "" })
    .eq("id", productId)
    .eq("business_id", businessId)
    .select("id, image_path")
    .maybeSingle();
  if (error || data?.id !== productId || data.image_path !== "") return fail("Не удалось удалить фотографию.");
  return { ok: true as const };
}

async function saveBanner(supabase: SupabaseClient, businessId: string, file: File) {
  const { data: existing, error: readError } = await supabase
    .from("businesses")
    .select("id, banner_path")
    .eq("id", businessId)
    .maybeSingle();
  const previous = typeof existing?.banner_path === "string" ? existing.banner_path : "";
  if (readError || existing?.id !== businessId) return fail("Не удалось загрузить баннер.");
  const path = photoPath(businessId, "banner", `banner-${Date.now()}.jpg`);
  const uploaded = await upload(supabase, path, file);
  if (!uploaded.ok) return fail("Не удалось загрузить баннер.");
  const { data, error } = await supabase
    .from("businesses")
    .update({ banner_path: path })
    .eq("id", businessId)
    .select("id, banner_path")
    .maybeSingle();
  if (error || data?.id !== businessId || data.banner_path !== path) {
    await supabase.storage.from("menu-photos").remove([path]);
    return fail("Не удалось загрузить баннер.");
  }
  if (previous && previous !== path && isPhotoPath(previous, businessId, "banner")) {
    await supabase.storage.from("menu-photos").remove([previous]);
  }
  return { ok: true as const, path };
}

async function savePwaIcon(supabase: SupabaseClient, businessId: string, file: File) {
  const { data: existing, error: readError } = await supabase
    .from("businesses")
    .select("id, pwa_icon_path")
    .eq("id", businessId)
    .maybeSingle();
  const previous = typeof existing?.pwa_icon_path === "string" ? existing.pwa_icon_path : "";
  if (readError && isMissingPwaColumn(readError)) {
    return fail("Сохранение приложения пока недоступно. Обновление базы ещё не применено.");
  }
  if (readError || existing?.id !== businessId) return fail("Не удалось загрузить иконку.");
  const path = photoPath(businessId, "pwa-icon", `icon-${Date.now()}.jpg`);
  if (!path) return fail("Не удалось загрузить иконку.");
  const uploaded = await upload(supabase, path, file);
  if (!uploaded.ok) {
    return fail(reportPwaIconError("storage_upload", { message: uploaded.message, code: uploaded.code }, { path }));
  }
  const { data, error } = await supabase
    .from("businesses")
    .update({ pwa_icon_path: path })
    .eq("id", businessId)
    .select("id, pwa_icon_path")
    .maybeSingle();
  if (error || data?.id !== businessId || data.pwa_icon_path !== path) {
    await supabase.storage.from("menu-photos").remove([path]);
    if (error && isMissingPwaColumn(error)) {
      return fail("Сохранение приложения пока недоступно. Обновление базы ещё не применено.");
    }
    return fail(
      reportPwaIconError("database_update", error, {
        path,
        saved: typeof data?.pwa_icon_path === "string" ? data.pwa_icon_path : "",
        id: data?.id ?? "",
      }),
    );
  }
  if (previous && previous !== path && isPhotoPath(previous, businessId, "pwa-icon")) {
    await supabase.storage.from("menu-photos").remove([previous]);
  }
  return { ok: true as const, path };
}

async function deletePwaIcon(supabase: SupabaseClient, businessId: string) {
  const { data: existing, error: readError } = await supabase
    .from("businesses")
    .select("id, pwa_icon_path")
    .eq("id", businessId)
    .maybeSingle();
  const previous = typeof existing?.pwa_icon_path === "string" ? existing.pwa_icon_path : "";
  if (readError && isMissingPwaColumn(readError)) {
    return fail("Сохранение приложения пока недоступно. Обновление базы ещё не применено.");
  }
  if (readError || existing?.id !== businessId) return fail("Не удалось удалить иконку.");
  if (!previous) return fail("Своей иконки пока нет.");
  if (!isPhotoPath(previous, businessId, "pwa-icon")) return fail("Не удалось удалить иконку.");
  const removed = await supabase.storage.from("menu-photos").remove([previous]);
  if (removed.error) return fail("Не удалось удалить иконку.");
  const { data, error } = await supabase
    .from("businesses")
    .update({ pwa_icon_path: null })
    .eq("id", businessId)
    .select("id, pwa_icon_path")
    .maybeSingle();
  if (error || data?.id !== businessId || data.pwa_icon_path) return fail("Не удалось удалить иконку.");
  return { ok: true as const };
}

async function deleteBanner(supabase: SupabaseClient, businessId: string) {
  const { data: existing, error: readError } = await supabase
    .from("businesses")
    .select("id, banner_path")
    .eq("id", businessId)
    .maybeSingle();
  const previous = typeof existing?.banner_path === "string" ? existing.banner_path : "";
  if (readError || existing?.id !== businessId) return fail("Не удалось удалить баннер.");
  if (!previous) return fail("У заведения нет баннера.");
  if (!isPhotoPath(previous, businessId, "banner")) return fail("Не удалось удалить баннер.");
  const removed = await supabase.storage.from("menu-photos").remove([previous]);
  if (removed.error) return fail("Не удалось удалить баннер.");
  const { data, error } = await supabase
    .from("businesses")
    .update({ banner_path: "" })
    .eq("id", businessId)
    .select("id, banner_path")
    .maybeSingle();
  if (error || data?.id !== businessId || data.banner_path !== "") return fail("Не удалось удалить баннер.");
  return { ok: true as const };
}

async function upload(supabase: SupabaseClient, path: string, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage.from("menu-photos").upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: false,
  });
  return {
    ok: !error,
    message: error?.message ?? "",
    code: String(error?.statusCode ?? ""),
  };
}

async function isJpegFile(file: File) {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/pjpeg") return true;
  if (type !== "" || !/\.jpe?g$/i.test(file.name)) return false;
  const header = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

async function businessExists(supabase: SupabaseClient, businessId: string) {
  const { data, error } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  return !error && data?.id === businessId;
}

const businessColumnsBase =
  "id, name, description, address, phone, hours, order_phone, banner_path, telegram_enabled, max_enabled, slug, status, is_published, is_blocked, is_archived";

async function readBusiness(supabase: SupabaseClient, businessId: string) {
  let includeTheme = true;
  let includeKind = true;
  let includePwa = true;
  let includeOrderCall = true;
  let includeSubDescription = true;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const orderCall = includeOrderCall ? ", order_enabled, call_button_enabled" : "";
    const subDescription = includeSubDescription ? ", sub_description" : "";
    const columns = `${businessColumnsBase}${orderCall}${subDescription}`;
    const extra = [
      includeTheme ? "theme" : "",
      includeKind ? "kind" : "",
      includePwa ? "pwa_name, pwa_icon_path" : "",
    ].filter(Boolean);
    const result = await supabase
      .from("businesses")
      .select(extra.length > 0 ? `${columns}, ${extra.join(", ")}` : columns)
      .eq("id", businessId)
      .maybeSingle();
    if (!result.error) {
      const row = result.data as BusinessRow | null;
      if (!row || row.id !== businessId) return null;
      const icon = typeof row.pwa_icon_path === "string" ? row.pwa_icon_path : "";
      return {
        row,
        kind: businessKind(row.kind),
        theme: menuTheme(row.theme),
        themeStorage: includeTheme ? ("ready" as const) : ("missing" as const),
        pwaName: includePwa ? pwaNameFromValue(row.pwa_name) : "",
        pwaIcon: includePwa && isPhotoPath(icon, businessId, "pwa-icon") ? icon : "",
        pwaStorage: includePwa ? ("ready" as const) : ("missing" as const),
      };
    }
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
    return null;
  }

  return null;
}

export async function saveSuperadminPwa(supabase: SupabaseClient, businessId: string, name: unknown) {
  if (typeof name !== "string") return fail("Не удалось сохранить название приложения.");
  const checked = storedPwaName(name);
  if (!checked.ok) return fail(checked.message);
  const { data, error } = await supabase
    .from("businesses")
    .update({ pwa_name: checked.name })
    .eq("id", businessId)
    .select("id, pwa_name")
    .maybeSingle();
  if (error && isMissingPwaColumn(error)) {
    return fail("Сохранение приложения пока недоступно. Обновление базы ещё не применено.");
  }
  const savedName = pwaNameFromValue(data?.pwa_name);
  if (error || data?.id !== businessId || savedName !== (checked.name ?? "")) {
    return fail("Не удалось сохранить название приложения.");
  }
  return { ok: true as const, name: savedName };
}

export async function saveSuperadminTheme(supabase: SupabaseClient, businessId: string, theme: unknown) {
  if (typeof theme !== "string" || !menuThemes.includes(theme as MenuTheme)) {
    return fail("Выберите оформление из списка.");
  }
  const { data, error } = await supabase
    .from("businesses")
    .update({ theme })
    .eq("id", businessId)
    .select("id, theme")
    .maybeSingle();
  if (error && isMissingThemeColumn(error)) {
    return fail("Сохранение оформления пока недоступно. Обновление базы ещё не применено.");
  }
  if (error || data?.id !== businessId || menuTheme(data?.theme) !== theme) {
    return fail("Не удалось сохранить оформление.");
  }
  return { ok: true as const, theme: menuTheme(data.theme) };
}

type BusinessRow = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  hours: string | null;
  order_phone: string | null;
  banner_path: string | null;
  telegram_enabled: boolean;
  max_enabled: boolean;
  order_enabled?: boolean;
  call_button_enabled?: boolean;
  sub_description?: string | null;
  slug: string;
  status: string;
  is_published: boolean;
  is_blocked: boolean;
  is_archived: boolean;
  theme?: unknown;
  kind?: unknown;
  pwa_name?: unknown;
  pwa_icon_path?: string | null;
};

function venueFromRow(row: {
  name: string;
  description: string | null;
  sub_description?: string | null;
  address: string | null;
  phone: string | null;
  hours: string | null;
  order_phone: string | null;
  banner_path: string | null;
  telegram_enabled: boolean;
  max_enabled: boolean;
  order_enabled?: boolean;
  call_button_enabled?: boolean;
}) {
  return {
    name: row.name.trim(),
    description: row.description ?? "",
    subDescription:
      typeof row.sub_description === "string" ? row.sub_description.slice(0, SUB_DESCRIPTION_MAX) : "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    hours: row.hours ?? "",
    orderPhone: row.order_phone ?? "",
    banner: row.banner_path ?? "",
    telegram: row.telegram_enabled,
    max: row.max_enabled,
    orderEnabled: row.order_enabled !== false,
    callButtonEnabled: row.call_button_enabled === true,
  };
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

function dishFromRow(row: {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_path: string | null;
  is_visible: boolean;
}) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name.trim(),
    description: row.description?.trim() ?? "",
    price: Number.isInteger(row.price) ? row.price : Math.round(Number(row.price)),
    image: row.image_path ?? "",
    visible: row.is_visible !== false,
  };
}

function validateSettings(input: Record<string, unknown>): Failure | Success<{ values: Settings }> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const subDescription =
    typeof input.subDescription === "string" ? input.subDescription.slice(0, SUB_DESCRIPTION_MAX) : "";
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const hours = typeof input.hours === "string" ? input.hours.trim() : "";
  const phone = optionalPhone(typeof input.phone === "string" ? input.phone : "");
  const orderPhone = typeof input.orderPhone === "string" ? input.orderPhone : "";
  const orderPhoneError = cashierPhoneError(orderPhone);
  if (orderPhoneError) return { ok: false, message: orderPhoneError };
  if (name.length < 1 || name.length > 120) return fail("Введите название заведения, не длиннее 120 символов.");
  if (description.length > 2000) return fail("Описание слишком длинное.");
  if (subDescription.length > SUB_DESCRIPTION_MAX) {
    return fail(`Подописание не длиннее ${SUB_DESCRIPTION_MAX} символов.`);
  }
  if (address.length > 300) return fail("Адрес слишком длинный.");
  if (hours.length > 120) return fail("Часы работы слишком длинные.");
  if (!phone.ok) return fail("Введите телефон заведения полностью.");
  return {
    ok: true,
    values: {
      name,
      description,
      subDescription,
      address,
      phone: phone.value,
      hours,
      orderPhone: formatPhone(orderPhone.trim()),
      telegram: input.telegram === true,
      max: input.max === true,
      orderEnabled: input.orderEnabled !== false,
      callButtonEnabled: input.callButtonEnabled === true,
    },
  };
}

function cashierPhoneError(value: string) {
  const trimmed = value.trim();
  if (!trimmed || phoneDigits(trimmed).length === 0) return "Введите номер телефона кассира";
  const formatted = formatPhone(trimmed);
  if (formatted.length > 40 || phoneDigits(formatted).length < 11) return "Проверьте номер телефона";
  return "";
}

function optionalPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, value: "" };
  const formatted = formatPhone(trimmed);
  if (formatted.length > 40 || phoneDigits(formatted).length < 11) return { ok: false as const, value: "" };
  return { ok: true as const, value: formatted };
}

function photoPath(businessId: string, folder: "banner" | "products" | "pwa-icon", fileName: string) {
  const path = `${businessId}/${folder}/${fileName}`;
  return isPhotoPath(path, businessId, folder) ? path : "";
}

function isPhotoPath(path: string, businessId: string, folder: "banner" | "products" | "pwa-icon") {
  if (!path || path.length > 240) return false;
  const prefix = `${businessId}/${folder}/`;
  if (!path.startsWith(prefix)) return false;
  return filePattern.test(path.slice(prefix.length));
}

function isId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function productError(error: { message?: string; code?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("Категория не принадлежит")) return "Выберите категорию своего заведения.";
  if (error?.code === "23503") return "Выберите категорию своего заведения.";
  if (error?.code === "23514") return "Проверьте название, описание и цену.";
  return "Не удалось сохранить блюдо.";
}

function fail(message: string): Failure {
  return { ok: false, message };
}

type Settings = {
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
