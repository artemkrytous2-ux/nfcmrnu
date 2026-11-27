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
  is_published: boolean;
};

const columns = "id, name, slug, status, owner_id, is_blocked, is_archived, is_published";

const nextStatus: Record<string, "demo" | "active"> = {
  draft: "demo",
  demo: "active",
  active: "demo",
};

export async function POST(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { id } = await context.params;
  if (!isBusinessId(id)) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const status = readStatus(body);
  if (!status) {
    return Response.json({ ok: false, message: "Можно изменить только статус" }, { status: 400 });
  }

  const existing = await access.supabase.from("businesses").select(columns).eq("id", id).maybeSingle();
  if (existing.error) {
    return Response.json({ ok: false, message: "Не удалось обновить статус. Повторите попытку." }, { status: 500 });
  }
  if (!existing.data) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }
  const before = existing.data as BusinessRow;
  if (before.is_blocked || before.is_archived) {
    return Response.json(
      { ok: false, message: "Заблокированное или архивное заведение нельзя активировать" },
      { status: 409 },
    );
  }
  if (nextStatus[before.status] !== status) {
    return Response.json({ ok: false, message: "Такой переход статуса недоступен" }, { status: 409 });
  }

  const updated = await access.supabase
    .from("businesses")
    .update({ status })
    .eq("id", id)
    .eq("status", before.status)
    .eq("is_blocked", false)
    .eq("is_archived", false)
    .select(columns)
    .maybeSingle();
  if (updated.error || !updated.data) {
    return Response.json({ ok: false, message: "Не удалось обновить статус. Повторите попытку." }, { status: 500 });
  }
  const after = updated.data as BusinessRow;
  const published = (after.status === "demo" || after.status === "active") && !after.is_blocked && !after.is_archived;
  if (
    after.status !== status ||
    after.is_published !== published ||
    Boolean(after.is_blocked) ||
    Boolean(after.is_archived) ||
    after.owner_id !== before.owner_id ||
    after.slug !== before.slug ||
    after.name !== before.name
  ) {
    return Response.json({ ok: false, message: "Не удалось обновить статус. Повторите попытку." }, { status: 500 });
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

function readStatus(body: Record<string, unknown> | null) {
  if (!body || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "status") return null;
  if (body.status !== "demo" && body.status !== "active") return null;
  return body.status;
}
