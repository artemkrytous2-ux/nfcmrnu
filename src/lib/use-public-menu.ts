"use client";

import { useEffect, useState } from "react";
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
import { isMissingKindColumn } from "@/lib/business-kind";
import { isMissingThemeColumn } from "@/lib/menu-theme";
import { getPublicSupabase } from "@/lib/supabase";

function snapshotFromInitial(slug: string, initial?: PublicMenuData | null): PublicMenuData | null {
  if (!initial || initial.slug !== slug) return null;
  return initial;
}

export function usePublicMenu(slug: string, initial?: PublicMenuData | null) {
  const seeded = snapshotFromInitial(slug, initial);
  const [menu, setMenu] = useState(seeded?.menu ?? null);
  const [theme, setTheme] = useState(seeded?.theme ?? "default");
  const [kind, setKind] = useState(seeded?.kind ?? "food");
  const [ready, setReady] = useState(Boolean(seeded));
  const [unavailable, setUnavailable] = useState(seeded?.unavailable ?? false);
  const [promptEnabled, setPromptEnabled] = useState(seeded?.promptEnabled ?? false);

  useEffect(() => {
    const fromServer = snapshotFromInitial(slug, initial);
    if (fromServer) {
      // Server already provided this slug — do not hit Supabase again after hydration.
      setMenu(fromServer.menu);
      setTheme(fromServer.theme);
      setKind(fromServer.kind);
      setPromptEnabled(fromServer.promptEnabled);
      setUnavailable(fromServer.unavailable);
      setReady(true);
      return;
    }

    let active = true;

    const applySnapshot = (snapshot: PublicMenuData) => {
      if (!active) return;
      setMenu(snapshot.menu);
      setTheme(snapshot.theme);
      setKind(snapshot.kind);
      setPromptEnabled(snapshot.promptEnabled);
      setUnavailable(snapshot.unavailable);
      setReady(true);
    };

    const load = async () => {
      setReady(false);
      setMenu(null);
      setTheme("default");
      setKind("food");
      setUnavailable(false);
      setPromptEnabled(false);

      if (!PUBLIC_MENU_SLUG_PATTERN.test(slug)) {
        applySnapshot(unavailablePublicMenu(slug));
        return;
      }

      const supabase = getPublicSupabase();
      const loaded = await loadPublishedBusiness(supabase, slug);

      if (!active) return;
      const venue = loaded.venue;
      if (loaded.error || !venue?.id) {
        applySnapshot(unavailablePublicMenu(slug));
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
          .select("id, category_id, name, description, price, image_path, sort_order")
          .eq("business_id", venue.id)
          .eq("is_visible", true)
          .order("sort_order", { ascending: true }),
      ]);

      if (!active) return;
      if (categoriesResult.error || productsResult.error) {
        applySnapshot(unavailablePublicMenu(slug));
        return;
      }

      applySnapshot(
        buildPublicMenuData(
          slug,
          venue,
          (categoriesResult.data ?? []) as PublicCategoryRow[],
          (productsResult.data ?? []) as PublicProductRow[],
        ),
      );
    };

    void load().catch(() => {
      applySnapshot(unavailablePublicMenu(slug));
    });

    return () => {
      active = false;
    };
  }, [slug, initial]);

  return { menu, theme, kind, ready, unavailable, promptEnabled };
}

async function loadPublishedBusiness(supabase: ReturnType<typeof getPublicSupabase>, slug: string) {
  let includeTheme = true;
  let includeKind = true;
  let includePrompt = true;
  let includeOrderCall = true;
  let includeSubDescription = true;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const extra = [
      includeTheme ? "theme" : "",
      includeKind ? "kind" : "",
      includePrompt ? "pwa_prompt_enabled" : "",
      includeOrderCall ? "order_enabled, call_button_enabled" : "",
      includeSubDescription ? "sub_description" : "",
    ].filter(Boolean);
    const result = await supabase
      .from("businesses")
      .select(extra.length > 0 ? `${PUBLIC_BUSINESS_COLUMNS}, ${extra.join(", ")}` : PUBLIC_BUSINESS_COLUMNS)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (!result.error) return { venue: result.data as PublicBusinessRow | null, error: null };

    lastError = result.error;
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
    break;
  }

  return { venue: null, error: lastError };
}

function isMissingPromptColumn(error: { code?: string; message?: string } | null | undefined) {
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
