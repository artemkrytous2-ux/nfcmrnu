import { revalidatePublicVenueByBusinessId } from "@/lib/public-menu-cache";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";
import {
  addSuperadminCategory,
  deleteSuperadminCategory,
  deleteSuperadminPhoto,
  deleteSuperadminProduct,
  isBusinessId,
  loadSuperadminMenu,
  renameSuperadminCategory,
  saveSuperadminProduct,
  saveSuperadminPwa,
  saveSuperadminSettings,
  saveSuperadminTheme,
  setSuperadminProductVisible,
} from "@/lib/superadmin-editor";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);
  const { id } = await context.params;
  if (!isBusinessId(id)) return Response.json({ ok: false, message: "Не удалось загрузить заведение." }, { status: 404 });
  const result = await loadSuperadminMenu(access.supabase, id);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

export async function POST(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);
  const { id } = await context.params;
  if (!isBusinessId(id)) return Response.json({ ok: false, message: "Не удалось сохранить изменения." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { action?: string } & Record<string, unknown> | null;
  const action = body?.action;
  const result =
    action === "settings"
      ? await saveSuperadminSettings(access.supabase, id, body ?? {})
      : action === "theme"
        ? await saveSuperadminTheme(access.supabase, id, body?.theme)
        : action === "pwa"
          ? await saveSuperadminPwa(access.supabase, id, body?.name)
        : action === "addCategory"
        ? await addSuperadminCategory(access.supabase, id, body?.name)
        : action === "renameCategory"
          ? await renameSuperadminCategory(access.supabase, id, body?.categoryId, body?.name)
          : action === "deleteCategory"
            ? await deleteSuperadminCategory(access.supabase, id, body?.categoryId)
            : action === "saveProduct"
              ? await saveSuperadminProduct(access.supabase, id, body ?? {})
              : action === "setVisible"
                ? await setSuperadminProductVisible(access.supabase, id, body?.productId, body?.visible)
                : action === "deleteProduct"
                  ? await deleteSuperadminProduct(access.supabase, id, body?.productId)
                  : action === "deletePhoto"
                    ? await deleteSuperadminPhoto(access.supabase, id, body?.kind, body?.productId)
                    : { ok: false as const, message: "Не удалось сохранить изменения." };

  if (result.ok) {
    await revalidatePublicVenueByBusinessId(access.supabase, id);
  }

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
