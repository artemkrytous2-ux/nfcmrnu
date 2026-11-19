import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isExistingAccountError, validateOwnerAccount } from "@/lib/owner-account";
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
  if (!body || Array.isArray(body)) {
    return Response.json({ ok: false, message: "Введите почту и пароль владельца" }, { status: 400 });
  }
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("email") || !keys.includes("password")) {
    return Response.json({ ok: false, message: "Можно передать только почту и пароль" }, { status: 400 });
  }
  const account = validateOwnerAccount(body.email, body.password);
  if (typeof account === "string") {
    return Response.json({ ok: false, message: account }, { status: 400 });
  }

  const existing = await access.supabase.from("businesses").select(columns).eq("id", id).maybeSingle();
  if (existing.error) {
    return Response.json({ ok: false, message: "Не удалось назначить владельца. Повторите попытку." }, { status: 500 });
  }
  if (!existing.data) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }
  const before = existing.data as BusinessRow;
  if (before.owner_id !== null) {
    return Response.json({ ok: false, message: "У заведения уже есть владелец" }, { status: 409 });
  }

  const admin = serviceAuthClient();
  if (!admin) {
    return Response.json(
      { ok: false, message: "Сервер не настроен для создания аккаунтов владельцев" },
      { status: 500 },
    );
  }

  const created = await admin.auth.admin.createUser({
    email: account.email,
    password: body.password as string,
    email_confirm: true,
  });
  if (created.error || !created.data.user?.id) {
    if (created.error && isExistingAccountError(created.error)) {
      return Response.json({ ok: false, message: "Такая почта уже зарегистрирована" }, { status: 409 });
    }
    return Response.json({ ok: false, message: "Не удалось создать аккаунт владельца" }, { status: 500 });
  }
  const ownerId = created.data.user.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) {
    return Response.json(
      { ok: false, message: "Аккаунт создан, но привязать его к заведению не удалось. Аккаунт оставлен без заведения." },
      { status: 500 },
    );
  }

  const updated = await access.supabase
    .from("businesses")
    .update({ owner_id: ownerId })
    .eq("id", id)
    .is("owner_id", null)
    .select(columns)
    .maybeSingle();
  const after = updated.data as BusinessRow | null;
  const unchanged =
    after !== null &&
    after.owner_id === ownerId &&
    after.status === before.status &&
    after.is_blocked === before.is_blocked &&
    after.is_archived === before.is_archived &&
    after.slug === before.slug &&
    after.name === before.name;
  if (updated.error || !after || !unchanged) {
    const removed = await removeUnboundAccount(access.supabase, admin, ownerId);
    const message = removed
      ? "Не удалось назначить владельца. Созданный аккаунт удалён, повторите попытку."
      : "Аккаунт создан, но привязать его к заведению не удалось. Аккаунт оставлен без заведения.";
    return Response.json({ ok: false, message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    business: {
      id: after.id,
      name: after.name,
      slug: after.slug,
      status: after.status,
      hasOwner: true,
      isBlocked: after.is_blocked === true,
      isArchived: after.is_archived === true,
    },
  });
}

function serviceAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function removeUnboundAccount(
  supabase: SupabaseClient,
  admin: NonNullable<ReturnType<typeof serviceAuthClient>>,
  ownerId: string,
) {
  const links = await supabase.from("businesses").select("id").eq("owner_id", ownerId);
  if (links.error || !Array.isArray(links.data) || links.data.length > 0) return false;
  const removed = await admin.auth.admin.deleteUser(ownerId);
  return !removed.error;
}
