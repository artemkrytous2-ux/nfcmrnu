import { revalidatePublicVenueBySlug } from "@/lib/public-menu-cache";
import { isBusinessId } from "@/lib/superadmin-editor";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

type Context = { params: Promise<{ id: string }> };

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_id: string | null;
  is_blocked: boolean;
  is_archived: boolean;
};

const columns = "id, name, slug, status, owner_id, is_blocked, is_archived";

export async function POST(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { id } = await context.params;
  if (!isBusinessId(id)) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const archived = readArchived(body);
  if (archived === null) {
    return Response.json({ ok: false, message: "Можно изменить только признак архива" }, { status: 400 });
  }

  const existing = await access.supabase.from("businesses").select(columns).eq("id", id).maybeSingle();
  if (existing.error) {
    return Response.json({ ok: false, message: "Не удалось обновить архив. Повторите попытку." }, { status: 500 });
  }
  if (!existing.data) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }
  const before = existing.data as BusinessRow;

  const updated = await access.supabase
    .from("businesses")
    .update({ is_archived: archived })
    .eq("id", id)
    .select(columns)
    .maybeSingle();
  if (updated.error || !updated.data) {
    return Response.json({ ok: false, message: "Не удалось обновить архив. Повторите попытку." }, { status: 500 });
  }
  const after = updated.data as BusinessRow;
  if (
    after.is_archived !== archived ||
    after.status !== before.status ||
    after.is_blocked !== before.is_blocked ||
    after.slug !== before.slug ||
    after.name !== before.name ||
    after.owner_id !== before.owner_id
  ) {
    return Response.json({ ok: false, message: "Не удалось обновить архив. Повторите попытку." }, { status: 500 });
  }

  revalidatePublicVenueBySlug(after.slug);

  return Response.json({
    ok: true,
    business: {
      id: after.id,
      name: after.name,
      slug: after.slug,
      status: after.status,
      hasOwner: after.owner_id !== null,
      isBlocked: after.is_blocked === true,
      isArchived: after.is_archived === true,
    },
  });
}

function readArchived(body: Record<string, unknown> | null) {
  if (!body || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "archived") return null;
  if (body.archived !== true && body.archived !== false) return null;
  return body.archived;
}
