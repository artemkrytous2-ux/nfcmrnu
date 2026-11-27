import { deleteArchivedBusiness } from "@/lib/archive-delete";
import { revalidatePublicVenueBySlug } from "@/lib/public-menu-cache";
import { isBusinessId } from "@/lib/superadmin-editor";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { id } = await context.params;
  if (!isBusinessId(id)) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { slug?: unknown } | null;
  const result = await deleteArchivedBusiness(access.supabase, id, body?.slug);
  if (!result.ok) return Response.json({ ok: false, message: result.message }, { status: result.status });
  if (typeof body?.slug === "string") {
    revalidatePublicVenueBySlug(body.slug);
  }
  return Response.json({ ok: true });
}
