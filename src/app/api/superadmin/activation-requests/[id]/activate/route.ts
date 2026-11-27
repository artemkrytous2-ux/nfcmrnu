import { activatePaidRequest } from "@/lib/activation-orchestrator";
import { businessKindForCreate } from "@/lib/business-kind";
import { createServiceRoleClient } from "@/lib/supabase-service-role";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

type Context = { params: Promise<{ id: string }> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ручное подтверждение оплаты и запуск того же оркестратора,
 * который позже сможет вызывать Robokassa (source=robokassa) без смены переноса.
 */
export async function POST(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ ok: false, status: "invalid", message: "Заявка не найдена" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    paymentConfirmed?: unknown;
    notes?: unknown;
    kind?: unknown;
    slug?: unknown;
  } | null;

  if (body?.paymentConfirmed !== true) {
    return Response.json(
      {
        ok: false,
        status: "invalid",
        message: "Отметьте подтверждение оплаты, прежде чем активировать",
      },
      { status: 400 },
    );
  }

  const kind =
    body && "kind" in body && body.kind !== undefined ? businessKindForCreate(body.kind) : undefined;
  if (body && "kind" in body && body.kind !== undefined && !kind) {
    return Response.json({ ok: false, status: "invalid", message: "Некорректный тип сайта" }, { status: 400 });
  }

  const slugOverride = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : undefined;
  if (slugOverride) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugOverride) || slugOverride.length < 2 || slugOverride.length > 64) {
      return Response.json(
        { ok: false, status: "invalid", message: "Некорректный адрес страницы" },
        { status: 400 },
      );
    }
  }

  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : undefined;

  const admin = createServiceRoleClient();
  if (!admin) {
    return Response.json(
      {
        ok: false,
        status: "error",
        message: "Сервер не настроен для активации (нет SUPABASE_SERVICE_ROLE_KEY)",
      },
      { status: 500 },
    );
  }

  const result = await activatePaidRequest({
    admin,
    requestId: id,
    paymentConfirmed: true,
    source: "manual",
    paymentProvider: "manual",
    notes,
    kind: kind ?? undefined,
    slugOverride,
  });

  if (!result.ok) {
    const http =
      result.status === "invalid" ? 400 : result.status === "conflict" ? 409 : 500;
    return Response.json(
      {
        ok: false,
        status: result.status,
        message: result.message,
        requestStatus: result.requestStatus,
        businessId: result.businessId ?? null,
      },
      { status: http },
    );
  }

  return Response.json({
    ok: true,
    alreadyActivated: result.alreadyActivated,
    businessId: result.businessId,
    slug: result.slug,
    subscriptionId: result.subscriptionId,
    requestId: result.requestId,
  });
}
