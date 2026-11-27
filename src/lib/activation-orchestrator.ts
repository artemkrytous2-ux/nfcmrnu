import {
  ACTIVATION_MEDIA_BUCKET,
  isActivationMediaPath,
  isRemoteImageRef,
} from "@/lib/activation-media";
import { mediaStatusFromPayload } from "@/lib/activation-demo-payload";
import {
  isActivationPlanCode,
  type ActivationPlanCode,
} from "@/lib/activation-plans";
import { businessKind, type BusinessKind } from "@/lib/business-kind";
import { SUB_DESCRIPTION_MAX } from "@/lib/menu";
import { menuTheme, type MenuTheme } from "@/lib/menu-theme";
import { pwaNameFromValue, storedPwaName } from "@/lib/pwa-settings";
import { applySubscriptionChange } from "@/lib/subscription-lifecycle";
import type { SupabaseClient } from "@supabase/supabase-js";

const MENU_PHOTOS_BUCKET = "menu-photos";

/** Источник подтверждения оплаты. Robokassa позже вызовет тот же оркестратор с source='robokassa'. */
export type ActivationPaymentSource = "manual" | "robokassa";

export type ActivatePaidRequestInput = {
  admin: SupabaseClient;
  requestId: string;
  /** Обязательное явное подтверждение оплаты (ручное или от платёжного провайдера). */
  paymentConfirmed: true;
  source: ActivationPaymentSource;
  paymentProvider?: string;
  paymentExternalId?: string;
  notes?: string;
  kind?: BusinessKind;
  slugOverride?: string;
};

export type ActivatePaidRequestResult =
  | {
      ok: true;
      alreadyActivated: boolean;
      businessId: string;
      slug: string;
      subscriptionId: string;
      requestId: string;
    }
  | {
      ok: false;
      status: "invalid" | "conflict" | "error";
      message: string;
      requestStatus?: string;
      businessId?: string | null;
    };

type RequestRow = {
  id: string;
  user_id: string;
  demo_payload: unknown;
  plan_code: string;
  plan_amount_rub: number;
  plan_duration_months: number;
  desired_slug: string;
  contact_phone: string;
  status: string;
  business_id: string | null;
  error_message: string;
  activated_at: string | null;
};

type DemoMenu = {
  venue: {
    name: string;
    description: string;
    subDescription: string;
    address: string;
    phone: string;
    hours: string;
    orderPhone: string;
    banner: string;
    channels: { telegram: boolean; max: boolean };
    orderEnabled: boolean;
    callButtonEnabled: boolean;
  };
  categories: Array<{ id: string; name: string }>;
  dishes: Array<{
    id: string;
    categoryId: string;
    name: string;
    description: string;
    price: number;
    image: string;
    visible: boolean;
  }>;
};

type ParsedPayload = {
  theme: MenuTheme;
  menu: DemoMenu;
  pwaIconPath: string;
  pwaName: string;
};

const requestSelect =
  "id, user_id, demo_payload, plan_code, plan_amount_rub, plan_duration_months, desired_slug, contact_phone, status, business_id, error_message, activated_at";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Единый механизм активации после подтверждённой оплаты.
 * Вызывается из суперадминки (manual) и позже из вебхука Robokassa без смены переноса.
 */
export async function activatePaidRequest(
  input: ActivatePaidRequestInput,
): Promise<ActivatePaidRequestResult> {
  if (input.paymentConfirmed !== true) {
    return { ok: false, status: "invalid", message: "Нужно подтверждение оплаты" };
  }
  if (!uuidPattern.test(input.requestId)) {
    return { ok: false, status: "invalid", message: "Некорректная заявка" };
  }
  if (input.source !== "manual" && input.source !== "robokassa") {
    return { ok: false, status: "invalid", message: "Некорректный источник оплаты" };
  }

  const loaded = await input.admin
    .from("activation_requests")
    .select(requestSelect)
    .eq("id", input.requestId)
    .maybeSingle();

  if (loaded.error) {
    return {
      ok: false,
      status: "error",
      message: tableMissingMessage(loaded.error.message),
    };
  }
  if (!loaded.data) {
    return { ok: false, status: "invalid", message: "Заявка не найдена" };
  }

  let row = loaded.data as RequestRow;

  if (row.status === "activated" && row.business_id) {
    const sub = await findSubscription(input.admin, row.id, row.business_id);
    return {
      ok: true,
      alreadyActivated: true,
      businessId: row.business_id,
      slug: await readSlug(input.admin, row.business_id, row.desired_slug),
      subscriptionId: sub?.id ?? "",
      requestId: row.id,
    };
  }

  if (row.status === "cancelled") {
    return {
      ok: false,
      status: "conflict",
      message: "Отменённую заявку нельзя активировать",
      requestStatus: row.status,
    };
  }

  if (row.status === "pending" || row.status === "failed") {
    const claimed = await input.admin
      .from("activation_requests")
      .update({ status: "processing", error_message: "" })
      .eq("id", row.id)
      .eq("status", row.status)
      .select(requestSelect)
      .maybeSingle();
    if (claimed.error || !claimed.data) {
      const again = await input.admin
        .from("activation_requests")
        .select(requestSelect)
        .eq("id", row.id)
        .maybeSingle();
      if (again.data && (again.data as RequestRow).status === "activated" && (again.data as RequestRow).business_id) {
        const activated = again.data as RequestRow;
        const sub = await findSubscription(input.admin, activated.id, activated.business_id!);
        return {
          ok: true,
          alreadyActivated: true,
          businessId: activated.business_id!,
          slug: await readSlug(input.admin, activated.business_id!, activated.desired_slug),
          subscriptionId: sub?.id ?? "",
          requestId: activated.id,
        };
      }
      return {
        ok: false,
        status: "conflict",
        message: "Не удалось начать активацию: заявка уже обрабатывается или изменена",
      };
    }
    row = claimed.data as RequestRow;
  } else if (row.status !== "processing") {
    return {
      ok: false,
      status: "conflict",
      message: `Заявку со статусом «${row.status}» нельзя активировать`,
      requestStatus: row.status,
    };
  }

  try {
    return await runTransfer(input, row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить активацию";
    // business_id мог появиться внутри runTransfer — перечитываем, чтобы не затереть связь.
    const latest = await input.admin
      .from("activation_requests")
      .select("business_id")
      .eq("id", row.id)
      .maybeSingle();
    const linkedId =
      (typeof latest.data?.business_id === "string" ? latest.data.business_id : null) || row.business_id;
    await markFailed(input.admin, row.id, message, linkedId);
    return {
      ok: false,
      status: "error",
      message,
      requestStatus: "failed",
      businessId: linkedId,
    };
  }
}

async function runTransfer(
  input: ActivatePaidRequestInput,
  row: RequestRow,
): Promise<ActivatePaidRequestResult> {
  if (!isActivationPlanCode(row.plan_code)) {
    throw new Error("В заявке указан неизвестный тариф");
  }
  const planCode = row.plan_code as ActivationPlanCode;
  if (
    (planCode === "month_990" && (row.plan_amount_rub !== 990 || row.plan_duration_months !== 1)) ||
    (planCode === "months6_5490" && (row.plan_amount_rub !== 5490 || row.plan_duration_months !== 6))
  ) {
    throw new Error("Параметры тарифа в заявке несогласованы");
  }

  const payload = parseDemoPayload(row.demo_payload);
  if (!payload) {
    throw new Error("Снимок демоверсии повреждён или пуст");
  }

  const ownerCheck = await input.admin
    .from("businesses")
    .select("id, slug, status")
    .eq("owner_id", row.user_id)
    .maybeSingle();
  if (ownerCheck.error) {
    throw new Error("Не удалось проверить существующее заведение владельца");
  }

  let businessId = row.business_id;
  let slug = row.desired_slug;

  if (ownerCheck.data?.id && ownerCheck.data.id !== businessId) {
    // Частичный сбой: заведение уже есть у владельца, а в заявке business_id ещё пуст.
    if (!businessId) {
      const claimedBy = await input.admin
        .from("activation_requests")
        .select("id")
        .eq("business_id", ownerCheck.data.id)
        .maybeSingle();
      if (claimedBy.error) {
        throw new Error("Не удалось проверить привязку существующего заведения");
      }
      if (claimedBy.data?.id && claimedBy.data.id !== row.id) {
        throw new Error("У пользователя уже есть другое заведение NFCMENU");
      }
      businessId = ownerCheck.data.id;
      const linkedOrphan = await input.admin
        .from("activation_requests")
        .update({ business_id: businessId })
        .eq("id", row.id)
        .eq("status", "processing")
        .select("id, business_id")
        .maybeSingle();
      if (linkedOrphan.error || linkedOrphan.data?.business_id !== businessId) {
        throw new Error("Найдено заведение владельца, но не удалось привязать его к заявке");
      }
      row = { ...row, business_id: businessId };
    } else {
      throw new Error("У пользователя уже есть другое заведение NFCMENU");
    }
  }

  if (!businessId) {
    const created = await createBusiness(input, row, payload);
    businessId = created.businessId;
    slug = created.slug;
    const linked = await input.admin
      .from("activation_requests")
      .update({ business_id: businessId })
      .eq("id", row.id)
      .eq("status", "processing")
      .select("id, business_id")
      .maybeSingle();
    if (linked.error || linked.data?.business_id !== businessId) {
      throw new Error("Заведение создано, но не привязано к заявке. Повторите активацию.");
    }
    row = { ...row, business_id: businessId };
  } else {
    slug = await readSlug(input.admin, businessId, row.desired_slug);
    await syncBusinessFields(input.admin, businessId, row, payload, input.kind);
  }

  const categoryMap = await ensureCategories(input.admin, businessId, payload.menu.categories);
  const productMap = await ensureProducts(input.admin, businessId, payload.menu.dishes, categoryMap);
  await transferMedia(input.admin, row.id, businessId, payload, productMap);

  const subscriptionId = await ensureSubscription(input, row, businessId, planCode);

  const activatedBusiness = await input.admin
    .from("businesses")
    .update({ status: "active" })
    .eq("id", businessId)
    .select("id, slug, status, is_published, owner_id")
    .maybeSingle();
  if (
    activatedBusiness.error ||
    !activatedBusiness.data ||
    activatedBusiness.data.status !== "active" ||
    activatedBusiness.data.owner_id !== row.user_id
  ) {
    throw new Error("Не удалось перевести заведение в рабочий статус");
  }
  slug = typeof activatedBusiness.data.slug === "string" ? activatedBusiness.data.slug : slug;

  const activatedAt = new Date().toISOString();
  const finalized = await input.admin
    .from("activation_requests")
    .update({
      status: "activated",
      business_id: businessId,
      activated_at: activatedAt,
      error_message: "",
    })
    .eq("id", row.id)
    .in("status", ["processing", "failed"])
    .select("id, status, business_id, activated_at")
    .maybeSingle();

  if (finalized.error || !finalized.data || finalized.data.status !== "activated") {
    const again = await input.admin
      .from("activation_requests")
      .select("id, status, business_id")
      .eq("id", row.id)
      .maybeSingle();
    if (again.data?.status === "activated" && again.data.business_id === businessId) {
      return {
        ok: true,
        alreadyActivated: true,
        businessId,
        slug,
        subscriptionId,
        requestId: row.id,
      };
    }
    throw new Error("Перенос выполнен, но статус заявки не обновился. Повторите активацию.");
  }

  return {
    ok: true,
    alreadyActivated: false,
    businessId,
    slug,
    subscriptionId,
    requestId: row.id,
  };
}

async function createBusiness(
  input: ActivatePaidRequestInput,
  row: RequestRow,
  payload: ParsedPayload,
) {
  const kind = businessKind(input.kind ?? "food");
  const slugOverride =
    typeof input.slugOverride === "string" ? input.slugOverride.trim().toLowerCase() : "";
  const baseSlug = slugOverride || row.desired_slug;
  const slug = await allocateSlug(input.admin, baseSlug);
  const venue = payload.menu.venue;
  const phone = clip(venue.phone || row.contact_phone, 40);
  const pwaName = resolvePwaName(payload.pwaName, venue.name);

  const insert: Record<string, unknown> = {
    owner_id: row.user_id,
    slug,
    name: clip(venue.name, 120) || "Заведение",
    description: clip(venue.description, 2000),
    sub_description: clip(venue.subDescription, SUB_DESCRIPTION_MAX),
    address: clip(venue.address, 300),
    phone,
    hours: clip(venue.hours, 120),
    order_phone: clip(venue.orderPhone || phone, 40),
    banner_path: "",
    telegram_enabled: venue.channels.telegram !== false,
    max_enabled: venue.channels.max !== false,
    order_enabled: venue.orderEnabled !== false,
    call_button_enabled: venue.callButtonEnabled === true,
    theme: payload.theme,
    kind,
    status: "draft",
    is_blocked: false,
    is_archived: false,
  };
  if (pwaName) insert.pwa_name = pwaName;

  const { data, error } = await input.admin
    .from("businesses")
    .insert(insert)
    .select("id, slug")
    .maybeSingle();

  if (error || !data?.id) {
    if (error?.code === "23505") {
      throw new Error("Адрес страницы или владелец уже заняты. Измените slug или проверьте аккаунт.");
    }
    throw new Error(error?.message?.includes("theme") ? "Не удалось создать заведение (theme/kind/pwa)." : "Не удалось создать заведение");
  }

  return { businessId: data.id as string, slug: String(data.slug ?? slug) };
}

async function syncBusinessFields(
  admin: SupabaseClient,
  businessId: string,
  row: RequestRow,
  payload: ParsedPayload,
  kindOverride?: BusinessKind,
) {
  const venue = payload.menu.venue;
  const phone = clip(venue.phone || row.contact_phone, 40);
  const pwaName = resolvePwaName(payload.pwaName, venue.name);
  const update: Record<string, unknown> = {
    name: clip(venue.name, 120) || "Заведение",
    description: clip(venue.description, 2000),
    sub_description: clip(venue.subDescription, SUB_DESCRIPTION_MAX),
    address: clip(venue.address, 300),
    phone,
    hours: clip(venue.hours, 120),
    order_phone: clip(venue.orderPhone || phone, 40),
    telegram_enabled: venue.channels.telegram !== false,
    max_enabled: venue.channels.max !== false,
    order_enabled: venue.orderEnabled !== false,
    call_button_enabled: venue.callButtonEnabled === true,
    theme: payload.theme,
    kind: businessKind(kindOverride ?? "food"),
    owner_id: row.user_id,
  };
  if (pwaName) update.pwa_name = pwaName;

  const { error } = await admin.from("businesses").update(update).eq("id", businessId);
  if (error) throw new Error("Не удалось обновить данные заведения при повторе активации");
}

async function ensureCategories(
  admin: SupabaseClient,
  businessId: string,
  categories: DemoMenu["categories"],
) {
  const existing = await admin
    .from("categories")
    .select("id, name, sort_order")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  if (existing.error) throw new Error("Не удалось прочитать категории заведения");

  const map = new Map<string, string>();
  const byName = new Map<string, string>();
  let maxOrder = -1;
  for (const row of existing.data ?? []) {
    if (typeof row.sort_order === "number" && row.sort_order > maxOrder) maxOrder = row.sort_order;
    if (typeof row.id === "string" && typeof row.name === "string") {
      byName.set(row.name, row.id);
    }
  }

  for (let i = 0; i < categories.length; i += 1) {
    const category = categories[i];
    const name = clip(category.name, 80);
    if (!name) continue;
    const found = byName.get(name);
    if (found) {
      map.set(category.id, found);
      continue;
    }
    maxOrder += 1;
    const { data, error } = await admin
      .from("categories")
      .insert({ business_id: businessId, name, sort_order: maxOrder })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) throw new Error(`Не удалось создать категорию «${name}»`);
    byName.set(name, data.id);
    map.set(category.id, data.id);
  }
  return map;
}

async function ensureProducts(
  admin: SupabaseClient,
  businessId: string,
  dishes: DemoMenu["dishes"],
  categoryMap: Map<string, string>,
) {
  const existing = await admin
    .from("products")
    .select("id, name, category_id, sort_order")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  if (existing.error) throw new Error("Не удалось прочитать блюда заведения");

  const map = new Map<string, string>();
  const byKey = new Map<string, string>();
  let maxOrder = -1;
  for (const row of existing.data ?? []) {
    if (typeof row.sort_order === "number" && row.sort_order > maxOrder) maxOrder = row.sort_order;
    if (typeof row.id === "string" && typeof row.name === "string" && typeof row.category_id === "string") {
      byKey.set(`${row.category_id}::${row.name}`, row.id);
    }
  }

  for (let i = 0; i < dishes.length; i += 1) {
    const dish = dishes[i];
    const categoryId = categoryMap.get(dish.categoryId);
    if (!categoryId) continue;
    const name = clip(dish.name, 120);
    if (!name) continue;
    const key = `${categoryId}::${name}`;
    const found = byKey.get(key);
    if (found) {
      map.set(dish.id, found);
      continue;
    }
    const price =
      typeof dish.price === "number" && Number.isFinite(dish.price)
        ? Math.max(0, Math.min(1_000_000, Math.round(dish.price)))
        : 0;
    maxOrder += 1;
    const { data, error } = await admin
      .from("products")
      .insert({
        business_id: businessId,
        category_id: categoryId,
        name,
        description: clip(dish.description, 2000),
        price,
        image_path: "",
        is_visible: dish.visible !== false,
        sort_order: maxOrder,
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) throw new Error(`Не удалось создать блюдо «${name}»`);
    byKey.set(key, data.id);
    map.set(dish.id, data.id);
  }
  return map;
}

async function transferMedia(
  admin: SupabaseClient,
  requestId: string,
  businessId: string,
  payload: ParsedPayload,
  productMap: Map<string, string>,
) {
  const bannerSource = payload.menu.venue.banner.trim();
  if (bannerSource) {
    const bannerPath = await resolveCopiedPath(admin, requestId, businessId, "banner", "banner.jpg", bannerSource);
    if (bannerPath) {
      const { error } = await admin.from("businesses").update({ banner_path: bannerPath }).eq("id", businessId);
      if (error) throw new Error("Не удалось сохранить путь баннера");
    }
  }

  if (payload.pwaIconPath.trim()) {
    const iconPath = await resolveCopiedPath(
      admin,
      requestId,
      businessId,
      "pwa-icon",
      "icon.jpg",
      payload.pwaIconPath.trim(),
      { allowRemote: false },
    );
    if (iconPath) {
      const { error } = await admin.from("businesses").update({ pwa_icon_path: iconPath }).eq("id", businessId);
      if (error) throw new Error("Не удалось сохранить путь иконки приложения");
    }
  }

  for (const dish of payload.menu.dishes) {
    const productId = productMap.get(dish.id);
    if (!productId) continue;
    const source = dish.image.trim();
    if (!source) continue;
    const imagePath = await resolveCopiedPath(
      admin,
      requestId,
      businessId,
      "products",
      `${productId}.jpg`,
      source,
    );
    if (!imagePath) continue;
    const { error } = await admin
      .from("products")
      .update({ image_path: imagePath })
      .eq("id", productId)
      .eq("business_id", businessId);
    if (error) throw new Error(`Не удалось сохранить фото блюда «${dish.name}»`);
  }
}

async function resolveCopiedPath(
  admin: SupabaseClient,
  requestId: string,
  businessId: string,
  folder: "banner" | "products" | "pwa-icon",
  fileName: string,
  source: string,
  options?: { allowRemote?: boolean },
) {
  const allowRemote = options?.allowRemote !== false;
  if (isRemoteImageRef(source)) {
    return allowRemote ? source.slice(0, 240) : "";
  }

  if (source.startsWith(`${businessId}/${folder}/`)) {
    return source.slice(0, 240);
  }

  if (!isActivationMediaPath(requestId, source)) {
    return "";
  }

  const sourceName = source.split("/").pop() || fileName;
  const extMatch = /\.([A-Za-z0-9]{1,8})$/.exec(sourceName);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const safeExt = ext === "jpeg" || ext === "jpg" || ext === "png" || ext === "webp" ? ext : "jpg";
  const baseName = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const destName = `${baseName}.${safeExt === "jpeg" ? "jpg" : safeExt}`;
  const dest = `${businessId}/${folder}/${destName}`;
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(destName) || dest.length > 240) return "";

  const downloaded = await admin.storage.from(ACTIVATION_MEDIA_BUCKET).download(source);
  if (downloaded.error || !downloaded.data) {
    throw new Error(`Не удалось прочитать файл из activation-media: ${source}`);
  }

  const contentType =
    downloaded.data.type ||
    (safeExt === "png" ? "image/png" : safeExt === "webp" ? "image/webp" : "image/jpeg");
  const uploaded = await admin.storage.from(MENU_PHOTOS_BUCKET).upload(dest, downloaded.data, {
    contentType,
    upsert: true,
  });
  if (uploaded.error) {
    throw new Error(`Не удалось скопировать файл в menu-photos (${folder})`);
  }
  return dest;
}

async function ensureSubscription(
  input: ActivatePaidRequestInput,
  row: RequestRow,
  businessId: string,
  planCode: ActivationPlanCode,
) {
  // Единый lifecycle: assign + идемпотентность по activation_request_id / payment_external_id.
  // Повторная активация той же заявки не продлевает срок повторно.
  const result = await applySubscriptionChange({
    admin: input.admin,
    businessId,
    action: "assign",
    planCode,
    source: input.source,
    paymentProvider: input.paymentProvider ?? (input.source === "robokassa" ? "robokassa" : "manual"),
    paymentExternalId: input.paymentExternalId ?? "",
    activationRequestId: row.id,
    notes: [input.notes?.trim() ?? "", `activation:${row.id}`, `source:${input.source}`]
      .filter(Boolean)
      .join(" · "),
  });

  if (!result.ok) {
    if (result.status === "conflict") {
      throw new Error(result.message);
    }
    throw new Error(result.message || "Не удалось создать подписку");
  }
  return result.subscriptionId;
}

async function allocateSlug(admin: SupabaseClient, base: string) {
  const cleaned = base.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const root = cleaned.length >= 2 ? cleaned.slice(0, 56) : `demo-${Date.now().toString(36)}`;
  for (let i = 0; i < 30; i += 1) {
    const candidate = i === 0 ? root : `${root.slice(0, 50)}-${i + 1}`;
    const { data, error } = await admin.from("businesses").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw new Error("Не удалось проверить адрес страницы");
    if (!data) return candidate;
  }
  return `${root.slice(0, 40)}-${Date.now().toString(36)}`;
}

async function findSubscription(admin: SupabaseClient, requestId: string, businessId: string) {
  const { data } = await admin
    .from("business_subscriptions")
    .select("id")
    .eq("activation_request_id", requestId)
    .eq("business_id", businessId)
    .maybeSingle();
  return data as { id: string } | null;
}

async function readSlug(admin: SupabaseClient, businessId: string, fallback: string) {
  const { data } = await admin.from("businesses").select("slug").eq("id", businessId).maybeSingle();
  return typeof data?.slug === "string" && data.slug ? data.slug : fallback;
}

async function markFailed(
  admin: SupabaseClient,
  requestId: string,
  message: string,
  businessId: string | null,
) {
  const patch: Record<string, unknown> = {
    status: "failed",
    error_message: clip(message, 2000) || "Ошибка активации",
  };
  // Никогда не затираем уже записанный business_id значением null.
  if (businessId) patch.business_id = businessId;

  await admin
    .from("activation_requests")
    .update(patch)
    .eq("id", requestId)
    .in("status", ["processing", "failed"]);
}

function parseDemoPayload(raw: unknown): ParsedPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    theme?: unknown;
    pwaIconPath?: unknown;
    pwaName?: unknown;
    menu?: {
      venue?: Record<string, unknown>;
      categories?: unknown;
      dishes?: unknown;
    };
  };
  const venueRaw = row.menu?.venue;
  if (!venueRaw || typeof venueRaw !== "object") return null;
  const name = typeof venueRaw.name === "string" ? venueRaw.name.trim() : "";
  if (!name) return null;

  const channelsRaw =
    venueRaw.channels && typeof venueRaw.channels === "object"
      ? (venueRaw.channels as Record<string, unknown>)
      : {};

  const categories = Array.isArray(row.menu?.categories)
    ? row.menu!.categories
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const cat = item as { id?: unknown; name?: unknown };
          if (typeof cat.id !== "string" || typeof cat.name !== "string") return null;
          return { id: cat.id, name: cat.name };
        })
        .filter((item): item is { id: string; name: string } => Boolean(item))
    : [];

  const dishes = Array.isArray(row.menu?.dishes)
    ? row.menu!.dishes
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const dish = item as Record<string, unknown>;
          if (typeof dish.id !== "string" || typeof dish.categoryId !== "string" || typeof dish.name !== "string") {
            return null;
          }
          return {
            id: dish.id,
            categoryId: dish.categoryId,
            name: dish.name,
            description: typeof dish.description === "string" ? dish.description : "",
            price: typeof dish.price === "number" ? dish.price : 0,
            image: typeof dish.image === "string" ? dish.image : "",
            visible: dish.visible !== false,
          };
        })
        .filter((item): item is DemoMenu["dishes"][number] => Boolean(item))
    : [];

  return {
    theme: menuTheme(row.theme),
    pwaIconPath: typeof row.pwaIconPath === "string" ? row.pwaIconPath : "",
    pwaName: typeof row.pwaName === "string" ? row.pwaName : "",
    menu: {
      venue: {
        name,
        description: typeof venueRaw.description === "string" ? venueRaw.description : "",
        subDescription: typeof venueRaw.subDescription === "string" ? venueRaw.subDescription : "",
        address: typeof venueRaw.address === "string" ? venueRaw.address : "",
        phone: typeof venueRaw.phone === "string" ? venueRaw.phone : "",
        hours: typeof venueRaw.hours === "string" ? venueRaw.hours : "",
        orderPhone: typeof venueRaw.orderPhone === "string" ? venueRaw.orderPhone : "",
        banner: typeof venueRaw.banner === "string" ? venueRaw.banner : "",
        channels: {
          telegram: channelsRaw.telegram !== false,
          max: channelsRaw.max !== false,
        },
        orderEnabled: venueRaw.orderEnabled !== false,
        callButtonEnabled: venueRaw.callButtonEnabled === true,
      },
      categories,
      dishes,
    },
  };
}

function resolvePwaName(fromPayload: string, venueName: string) {
  const explicit = storedPwaName(fromPayload);
  if (!explicit.ok) return null;
  if (explicit.name) return explicit.name;
  const fallback = storedPwaName(pwaNameFromValue(venueName).slice(0, 40));
  return fallback.ok ? fallback.name : null;
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

function tableMissingMessage(message: string) {
  const text = message.toLowerCase();
  if (text.includes("activation_requests") || text.includes("does not exist") || text.includes("schema cache")) {
    return "Таблица заявок ещё не подключена. Примените supabase/safe-migrations/50-activation-requests.sql.";
  }
  return "Не удалось загрузить заявку";
}

/** Для UI/логов: mediaStatus из payload без изменения оркестратора. */
export function activationMediaStatusOf(payload: unknown) {
  return mediaStatusFromPayload(payload);
}
