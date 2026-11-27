import { isActivationPlanCode } from "@/lib/activation-plans";
import {
  applySubscriptionChange,
  daysRemaining,
  loadBusinessSubscriptionSummary,
  subscriptionStatusLabel,
  type SubscriptionChangeAction,
} from "@/lib/subscription-lifecycle";
import { createServiceRoleClient } from "@/lib/supabase-service-role";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

type Context = { params: Promise<{ id: string }> };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ ok: false, status: "invalid", message: "Заведение не найдено" }, { status: 404 });
  }

  const summary = await loadBusinessSubscriptionSummary(access.supabase, id);
  const { data: events, error } = await access.supabase
    .from("business_subscription_events")
    .select(
      "id, action, plan_code, prev_ends_at, new_ends_at, new_status, source, notes, created_at, payment_external_id, activation_request_id",
    )
    .eq("business_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json(
      {
        ok: false,
        status: "error",
        message: eventsTableHint(error.message),
        subscription: summary,
        events: [],
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    subscription: summary
      ? {
          ...summary,
          statusLabel: subscriptionStatusLabel(summary.status, summary.endsAt),
        }
      : null,
    events: Array.isArray(events)
      ? events.map((row) => ({
          id: row.id,
          action: row.action,
          planCode: row.plan_code,
          prevEndsAt: row.prev_ends_at,
          newEndsAt: row.new_ends_at,
          newStatus: row.new_status,
          source: row.source,
          notes: row.notes,
          createdAt: row.created_at,
          paymentExternalId: row.payment_external_id,
          activationRequestId: row.activation_request_id,
          daysRemaining: daysRemaining(row.new_ends_at as string),
        }))
      : [],
  });
}

export async function POST(request: Request, context: Context) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ ok: false, status: "invalid", message: "Заведение не найдено" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    planCode?: unknown;
    endsAt?: unknown;
    expectedEndsAt?: unknown;
    notes?: unknown;
  } | null;

  const action = body?.action;
  if (action !== "assign" && action !== "extend" && action !== "set_ends_at") {
    return Response.json(
      {
        ok: false,
        status: "invalid",
        message: "Укажите действие: assign, extend или set_ends_at",
      },
      { status: 400 },
    );
  }

  const planCode =
    typeof body?.planCode === "string" && isActivationPlanCode(body.planCode) ? body.planCode : undefined;
  if ((action === "assign" || action === "extend") && !planCode) {
    return Response.json(
      { ok: false, status: "invalid", message: "Укажите тариф month_990 или months6_5490" },
      { status: 400 },
    );
  }

  const endsAt = typeof body?.endsAt === "string" ? body.endsAt : undefined;
  if (action === "set_ends_at" && !endsAt) {
    return Response.json(
      { ok: false, status: "invalid", message: "Укажите дату окончания" },
      { status: 400 },
    );
  }

  const expectedEndsAt =
    typeof body?.expectedEndsAt === "string" && body.expectedEndsAt.trim()
      ? body.expectedEndsAt.trim()
      : undefined;
  if (action === "extend" && !expectedEndsAt) {
    return Response.json(
      {
        ok: false,
        status: "invalid",
        message: "Обновите данные подписки и повторите продление",
      },
      { status: 400 },
    );
  }

  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : undefined;
  const { data: userData } = await access.supabase.auth.getUser();

  // service_role: едино с активацией и будущим Robokassa; права суперадмина уже проверены выше.
  const admin = createServiceRoleClient() ?? access.supabase;

  const result = await applySubscriptionChange({
    admin,
    businessId: id,
    action: action as SubscriptionChangeAction,
    planCode,
    endsAt,
    expectedEndsAt,
    source: "manual",
    paymentProvider: "manual",
    notes,
    actorUserId: userData.user?.id ?? null,
  });

  if (!result.ok) {
    const http = result.status === "invalid" ? 400 : result.status === "conflict" ? 409 : 500;
    return Response.json(
      { ok: false, status: result.status, message: result.message },
      { status: http },
    );
  }

  return Response.json({
    ok: true,
    alreadyApplied: result.alreadyApplied,
    subscription: {
      subscriptionId: result.subscriptionId,
      planCode: result.planCode,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      status: result.status,
      daysRemaining: result.daysRemaining,
      statusLabel: subscriptionStatusLabel(result.status, result.endsAt),
      source: "manual",
    },
    eventId: result.eventId,
    action: result.action,
  });
}

function eventsTableHint(message: string) {
  const text = message.toLowerCase();
  if (
    text.includes("business_subscription_events") ||
    text.includes("schema cache") ||
    text.includes("does not exist")
  ) {
    return "История подписок ещё не подключена. Примените supabase/safe-migrations/54-subscription-events.sql.";
  }
  return "Не удалось загрузить историю подписки";
}
