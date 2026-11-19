"use client";

import { useEffect, useState } from "react";
import { businessKind, isMissingKindColumn, type BusinessKind } from "@/lib/business-kind";
import type { MenuState } from "@/lib/menu";
import { isMissingThemeColumn, menuTheme, type MenuTheme } from "@/lib/menu-theme";
import { getPublicSupabase } from "@/lib/supabase";

type BusinessRow = {
  id: string;
  name: string;
  description: string;
  address?: string;
  phone: string;
  hours?: string;
  order_phone: string;
  banner_path: string;
  telegram_enabled: boolean;
  max_enabled: boolean;
  theme?: unknown;
  kind?: unknown;
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
  sort_order: number;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const businessColumns =
  "id, name, description, address, phone, hours, order_phone, banner_path, telegram_enabled, max_enabled";

export function usePublicMenu(slug: string) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [theme, setTheme] = useState<MenuTheme>("default");
  const [kind, setKind] = useState<BusinessKind>("food");
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setReady(false);
      setMenu(null);
      setTheme("default");
      setKind("food");
      setUnavailable(false);

      if (!slugPattern.test(slug)) {
        if (!active) return;
        setUnavailable(true);
        setReady(true);
        return;
      }

      const supabase = getPublicSupabase();
      const loaded = await loadPublishedBusiness(supabase, slug);

      if (!active) return;
      const venue = loaded.venue;
      if (loaded.error || !venue?.id) {
        setUnavailable(true);
        setReady(true);
        return;
      }
      const kind = businessKind(venue.kind);
      setTheme(menuTheme(venue.theme));
      setKind(kind);

      const [categoriesResult, productsResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, sort_order")
          .eq("business_id", venue.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, category_id, name, description, price, image_path, sort_order")
          .eq("business_id", venue.id)
          .eq("is_visible", true)
          .order("sort_order", { ascending: true }),
      ]);

      if (!active) return;
      if (categoriesResult.error || productsResult.error) {
        setUnavailable(true);
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
          visible: true,
        }));

      setMenu({
        venue: {
          name: venue.name.trim(),
          description: venue.description ?? "",
          address: kind === "beauty" ? (venue.address ?? "") : "",
          phone: venue.phone ?? "",
          hours: kind === "beauty" ? (venue.hours ?? "") : "",
          orderPhone: venue.order_phone ?? "",
          banner: venue.banner_path ?? "",
          channels: {
            telegram: venue.telegram_enabled,
            max: venue.max_enabled,
          },
        },
        categories,
        dishes,
      });
      setReady(true);
    };

    void load().catch(() => {
      if (!active) return;
      setMenu(null);
      setUnavailable(true);
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [slug]);

  return { menu, theme, kind, ready, unavailable };
}

async function loadPublishedBusiness(
  supabase: ReturnType<typeof getPublicSupabase>,
  slug: string,
) {
  return loadBusinessRow(supabase, businessColumns, slug);
}

async function loadBusinessRow(
  supabase: ReturnType<typeof getPublicSupabase>,
  columns: string,
  slug: string,
) {
  let includeTheme = true;
  let includeKind = true;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const extra = [includeTheme ? "theme" : "", includeKind ? "kind" : ""].filter(Boolean);
    const result = await supabase
      .from("businesses")
      .select(extra.length > 0 ? `${columns}, ${extra.join(", ")}` : columns)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (!result.error) return { venue: result.data as BusinessRow | null, error: null };

    lastError = result.error;
    if (includeTheme && isMissingThemeColumn(result.error) && result.error.message?.toLowerCase().includes("theme")) {
      includeTheme = false;
      continue;
    }
    if (includeKind && isMissingKindColumn(result.error)) {
      includeKind = false;
      continue;
    }
    break;
  }

  return { venue: null, error: lastError };
}
