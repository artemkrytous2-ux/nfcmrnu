import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePublicVenueBySlug } from "@/lib/public-menu-cache";
import { requireUserRequest, userRequestDenied } from "@/lib/user-request-server";

/**
 * Owner-only: purge public caches for the business linked to the session.
 * Slug is resolved server-side from owner_id — request body is ignored.
 */
export async function POST(request: Request) {
  const access = await requireUserRequest(request);
  if (!access.ok) return userRequestDenied(access);

  const slug = await ownBusinessSlug(access.supabase, access.user.id);
  if (!slug) {
    return Response.json({ ok: false, status: "missing", message: "Заведение не найдено" }, { status: 404 });
  }

  revalidatePublicVenueBySlug(slug);
  return Response.json({ ok: true });
}

async function ownBusinessSlug(supabase: SupabaseClient, ownerId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select("slug")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || typeof data?.slug !== "string") return null;
  const slug = data.slug.trim();
  return slug || null;
}
