import { cacheLife, cacheTag } from "next/cache";
import { isMissingKindColumn } from "@/lib/business-kind";
import { isMissingThemeColumn } from "@/lib/menu-theme";
import {
  buildPublicMenuData,
  PUBLIC_BUSINESS_COLUMNS,
  PUBLIC_MENU_SLUG_PATTERN,
  type PublicBusinessRow,
  type PublicCategoryRow,
  type PublicMenuData,
  type PublicProductRow,
  unavailablePublicMenu,
} from "@/lib/public-menu";
import { publicMenuCacheTag } from "@/lib/public-menu-cache";

type RestError = { code?: string; message?: string };

/**
 * Server-only published menu snapshot for `/m/[slug]`.
 * Uses the anon/publishable key only. Cache key includes `slug` via `"use cache"` args.
 */
export async function loadPublicMenuBySlug(slug: string): Promise<PublicMenuData> {
  "use cache";
  cacheTag(publicMenuCacheTag(slug));
  cacheLife("minutes");
  return readPublishedMenu(slug);
}

async function readPublishedMenu(slug: string): Promise<PublicMenuData> {
  if (!PUBLIC_MENU_SLUG_PATTERN.test(slug)) return unavailablePublicMenu(slug);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return unavailablePublicMenu(slug);

  const business = await loadPublishedBusiness(url, key, slug);
  if (!business) return unavailablePublicMenu(slug);

  const [categories, products] = await Promise.all([
    loadCategories(url, key, business.id),
    loadProducts(url, key, business.id),
  ]);
  if (!categories || !products) return unavailablePublicMenu(slug);

  // business.id is used only for scoped queries and is not returned to the client.
  return buildPublicMenuData(slug, business, categories, products);
}

async function loadPublishedBusiness(url: string, key: string, slug: string) {
  let includeTheme = true;
  let includeKind = true;
  let includePrompt = true;
  let includeOrderCall = true;
  let includeSubDescription = true;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const extra = [
      includeTheme ? "theme" : "",
      includeKind ? "kind" : "",
      includePrompt ? "pwa_prompt_enabled" : "",
      includeOrderCall ? "order_enabled, call_button_enabled" : "",
      includeSubDescription ? "sub_description" : "",
    ].filter(Boolean);
    const select = extra.length > 0 ? `${PUBLIC_BUSINESS_COLUMNS}, ${extra.join(", ")}` : PUBLIC_BUSINESS_COLUMNS;
    const result = await restGet<PublicBusinessRow>(url, key, "businesses", {
      select,
      slug: `eq.${slug}`,
      is_published: "eq.true",
      limit: "1",
    });

    if (!result.error) {
      const row = result.rows[0];
      if (!row?.id || typeof row.name !== "string") return null;
      return row;
    }

    if (includeSubDescription && isMissingSubDescriptionColumn(result.error)) {
      includeSubDescription = false;
      continue;
    }
    if (includeOrderCall && isMissingOrderCallColumn(result.error)) {
      includeOrderCall = false;
      continue;
    }
    if (includePrompt && isMissingPromptColumn(result.error)) {
      includePrompt = false;
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
    return null;
  }

  return null;
}

async function loadCategories(url: string, key: string, businessId: string) {
  const result = await restGet<PublicCategoryRow>(url, key, "categories", {
    select: "id, name, sort_order",
    business_id: `eq.${businessId}`,
    order: "sort_order.asc",
  });
  return result.error ? null : result.rows;
}

async function loadProducts(url: string, key: string, businessId: string) {
  const result = await restGet<PublicProductRow>(url, key, "products", {
    select: "id, category_id, name, description, price, image_path, sort_order",
    business_id: `eq.${businessId}`,
    is_visible: "eq.true",
    order: "sort_order.asc",
  });
  return result.error ? null : result.rows;
}

async function restGet<T>(
  url: string,
  key: string,
  table: string,
  params: Record<string, string>,
): Promise<{ rows: T[]; error: RestError | null }> {
  const endpoint = new URL(`/rest/v1/${table}`, url);
  for (const [name, value] of Object.entries(params)) {
    endpoint.searchParams.set(name, value);
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
    const payload = (await response.json().catch(() => null)) as T[] | RestError | null;
    if (!response.ok) {
      const error = payload && !Array.isArray(payload) ? payload : { message: `HTTP ${response.status}` };
      return { rows: [], error };
    }
    return { rows: Array.isArray(payload) ? payload : [], error: null };
  } catch {
    return { rows: [], error: { message: "network" } };
  }
}

function isMissingPromptColumn(error: RestError | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  if (!message.includes("pwa_prompt_enabled")) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isMissingOrderCallColumn(error: RestError | null | undefined) {
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

function isMissingSubDescriptionColumn(error: RestError | null | undefined) {
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
