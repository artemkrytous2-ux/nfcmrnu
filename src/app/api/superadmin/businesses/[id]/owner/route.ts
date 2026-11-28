import { createClient, type User } from "@supabase/supabase-js";
import { isExistingAccountError, validateOwnerAccount } from "@/lib/owner-account";
import { isBusinessId } from "@/lib/superadmin-editor";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";
import { getSupabaseServerUrl } from "@/lib/supabase-url";

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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { id } = await context.params;
  if (!isBusinessId(id)) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }

  const existing = await access.supabase.from("businesses").select(columns).eq("id", id).maybeSingle();
  if (existing.error) {
    return Response.json({ ok: false, message: "Не удалось отвязать владельца. Повторите попытку." }, { status: 500 });
  }
  if (!existing.data) {
    return Response.json({ ok: false, message: "Заведение не найдено" }, { status: 404 });
  }
  const before = existing.data as BusinessRow;
  if (before.owner_id === null) {
    return Response.json({ ok: true, business: businessPayload(before) });
  }

  const updated = await access.supabase
    .from("businesses")
    .update({ owner_id: null })
    .eq("id", id)
    .eq("owner_id", before.owner_id)
    .select(columns)
    .maybeSingle();
  const after = updated.data as BusinessRow | null;
  const ok =
    after !== null &&
    after.owner_id === null &&
    after.status === before.status &&
    after.is_blocked === before.is_blocked &&
    after.is_archived === before.is_archived &&
    after.slug === before.slug &&
    after.name === before.name;
  if (updated.error || !after || !ok) {
    return Response.json({ ok: false, message: "Не удалось отвязать владельца. Повторите попытку." }, { status: 500 });
  }

  // Auth user is intentionally kept — never delete on unlink.
  return Response.json({ ok: true, business: businessPayload(after) });
}

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
    return Response.json(
      { ok: false, message: "Сначала отвяжите текущего владельца" },
      { status: 409 },
    );
  }

  const admin = serviceAuthClient();
  if (!admin) {
    return Response.json(
      { ok: false, message: "Сервер не настроен для создания аккаунтов владельцев" },
      { status: 500 },
    );
  }

  const resolved = await resolveOwnerUser(admin, account.email, body.password as string);
  if (!resolved.ok) {
    return Response.json({ ok: false, message: resolved.message }, { status: resolved.status });
  }
  const ownerId = resolved.userId;
  if (!uuidPattern.test(ownerId)) {
    return Response.json({ ok: false, message: "Не удалось назначить владельца. Повторите попытку." }, { status: 500 });
  }

  const ownedElsewhere = await access.supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (ownedElsewhere.error) {
    return Response.json({ ok: false, message: "Не удалось назначить владельца. Повторите попытку." }, { status: 500 });
  }
  if (ownedElsewhere.data) {
    return Response.json(
      { ok: false, message: "Этот аккаунт уже привязан к другому заведению" },
      { status: 409 },
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
    return Response.json(
      {
        ok: false,
        message: resolved.created
          ? "Аккаунт создан, но привязать его к заведению не удалось. Аккаунт оставлен без заведения."
          : "Не удалось назначить владельца. Повторите попытку.",
      },
      { status: 500 },
    );
  }

  return Response.json({ ok: true, business: businessPayload(after) });
}

function businessPayload(row: BusinessRow) {
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

function serviceAuthClient() {
  const url = getSupabaseServerUrl();
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

async function resolveOwnerUser(
  admin: NonNullable<ReturnType<typeof serviceAuthClient>>,
  email: string,
  password: string,
): Promise<{ ok: true; userId: string; created: boolean } | { ok: false; message: string; status: number }> {
  const existing = await findAuthUserIdByEmail(admin, email);
  if (existing.ok && existing.userId) {
    return { ok: true, userId: existing.userId, created: false };
  }
  if (!existing.ok) {
    return { ok: false, message: existing.message, status: 500 };
  }

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.data.user?.id && uuidPattern.test(created.data.user.id)) {
    return { ok: true, userId: created.data.user.id, created: true };
  }
  if (created.error && isExistingAccountError(created.error)) {
    const again = await findAuthUserIdByEmail(admin, email);
    if (again.ok && again.userId) {
      return { ok: true, userId: again.userId, created: false };
    }
    return {
      ok: false,
      message: "Такая почта уже зарегистрирована, но найти аккаунт не удалось. Повторите попытку.",
      status: 409,
    };
  }
  return { ok: false, message: "Не удалось создать аккаунт владельца", status: 500 };
}

async function findAuthUserIdByEmail(
  admin: NonNullable<ReturnType<typeof serviceAuthClient>>,
  email: string,
): Promise<{ ok: true; userId: string | null } | { ok: false; message: string }> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) {
      return { ok: false, message: "Не удалось проверить аккаунт владельца" };
    }
    const users = (listed.data.users ?? []) as User[];
    const match = users.find((user) => (user.email ?? "").trim().toLowerCase() === normalized);
    if (match?.id) return { ok: true, userId: match.id };
    if (users.length < 200) return { ok: true, userId: null };
  }
  return { ok: true, userId: null };
}
