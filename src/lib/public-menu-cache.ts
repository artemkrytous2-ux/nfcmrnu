import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_MENU_SLUG_PATTERN } from "@/lib/public-menu";

export function publicMenuCacheTag(slug: string) {
  return `public-menu:${slug}`;
}

export function venuePwaCacheTag(slug: string) {
  return `venue-pwa:${slug}`;
}

/** Drop only this venue's public menu + PWA metadata caches. Never throws. */
export function revalidatePublicVenueBySlug(slug: string) {
  if (!PUBLIC_MENU_SLUG_PATTERN.test(slug)) return;
  try {
    revalidateTag(publicMenuCacheTag(slug), "max");
    revalidateTag(venuePwaCacheTag(slug), "max");
    revalidatePath(`/m/${slug}`, "page");
  } catch {
    // Successful writes must not fail because cache purge failed.
  }
}

/** Resolve slug from a verified business id, then revalidate. Never throws. */
export async function revalidatePublicVenueByBusinessId(
  supabase: SupabaseClient,
  businessId: string,
  knownSlug?: string,
) {
  try {
    const slug = knownSlug?.trim() || (await readBusinessSlug(supabase, businessId));
    if (slug) revalidatePublicVenueBySlug(slug);
  } catch {
    // ignore
  }
}

async function readBusinessSlug(supabase: SupabaseClient, businessId: string) {
  const { data, error } = await supabase.from("businesses").select("slug").eq("id", businessId).maybeSingle();
  if (error || typeof data?.slug !== "string") return "";
  return data.slug.trim();
}
