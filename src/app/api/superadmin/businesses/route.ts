import { businessKindForCreate } from "@/lib/business-kind";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_id: string | null;
  is_blocked: boolean;
  is_archived: boolean;
};

export async function GET(request: Request) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { data, error } = await access.supabase
    .from("businesses")
    .select("id, name, slug, status, owner_id, is_blocked, is_archived, created_at")
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    return Response.json({ ok: false, status: "error" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    businesses: data.map(toBusiness),
  });
}

export async function POST(request: Request) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const body = (await request.json().catch(() => null)) as { name?: unknown; slug?: unknown; kind?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const kind = businessKindForCreate(body && "kind" in body ? body.kind : undefined);
  const invalid = validateDraft(name, slug);
  if (invalid) {
    return Response.json({ ok: false, status: "invalid", message: invalid }, { status: 400 });
  }
  if (!kind) {
    return Response.json({ ok: false, status: "invalid", message: "Выберите тип сайта" }, { status: 400 });
  }

  const { data, error } = await access.supabase
    .from("businesses")
    .insert({ name, slug, status: "draft", owner_id: null, kind })
    .select("id, name, slug, status, owner_id, is_blocked, is_archived")
    .maybeSingle();

  if (error || !data) {
    const message =
      error?.code === "23505"
        ? "Такой адрес страницы уже занят"
        : "Не удалось создать заведение";
    return Response.json({ ok: false, status: "invalid", message }, { status: 400 });
  }

  return Response.json({ ok: true, business: toBusiness(data as BusinessRow) });
}

function validateDraft(name: string, slug: string) {
  if (!name) return "Введите название";
  if (name.length > 120) return "Название не длиннее 120 символов";
  if (!slug) return "Введите адрес страницы";
  if (!slugPattern.test(slug)) {
    return "Адрес страницы может содержать только строчные латинские буквы, цифры и дефис";
  }
  return null;
}

function toBusiness(row: BusinessRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    hasOwner: row.owner_id !== null,
    isBlocked: row.is_blocked === true,
    isArchived: row.is_archived === true,
  };
}
