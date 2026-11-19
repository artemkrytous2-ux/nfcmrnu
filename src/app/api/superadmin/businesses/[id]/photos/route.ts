import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";
import { isBusinessId, saveSuperadminPhoto } from "@/lib/superadmin-editor";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);
  const { id } = await context.params;
  if (!isBusinessId(id)) return Response.json({ ok: false, message: "Не удалось загрузить фотографию." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, message: "Не удалось загрузить фотографию." }, { status: 400 });
  }
  const result = await saveSuperadminPhoto(access.supabase, id, form?.get("kind"), form?.get("productId"), file);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
