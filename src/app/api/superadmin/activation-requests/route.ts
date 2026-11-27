import { mediaStatusFromPayload } from "@/lib/activation-demo-payload";
import {
  isActivationContactChannel,
  type ActivationContactChannel,
  type ActivationPlanCode,
} from "@/lib/activation-plans";
import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

type RequestRow = {
  id: string;
  user_id: string;
  plan_code: string;
  plan_amount_rub: number;
  plan_duration_months: number;
  desired_slug: string;
  contact_phone: string;
  status: string;
  demo_payload: unknown;
  error_message: string;
  business_id: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
};

export async function GET(request: Request) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  const { data, error } = await access.supabase
    .from("activation_requests")
    .select(
      "id, user_id, plan_code, plan_amount_rub, plan_duration_months, desired_slug, contact_phone, status, demo_payload, error_message, business_id, created_at, updated_at, activated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json(
      {
        ok: false,
        status: "unavailable",
        message: tableMissingMessage(error.message),
      },
      { status: 503 },
    );
  }

  return Response.json({
    ok: true,
    requests: Array.isArray(data) ? data.map(toAdminRequest) : [],
  });
}

function toAdminRequest(row: RequestRow) {
  const payload = row.demo_payload && typeof row.demo_payload === "object" ? row.demo_payload : null;
  const venueName =
    payload &&
    typeof payload === "object" &&
    "menu" in payload &&
    payload.menu &&
    typeof payload.menu === "object" &&
    "venue" in payload.menu &&
    payload.menu.venue &&
    typeof payload.menu.venue === "object" &&
    "name" in payload.menu.venue &&
    typeof payload.menu.venue.name === "string"
      ? payload.menu.venue.name
      : "";

  return {
    id: row.id,
    userId: row.user_id,
    planCode: row.plan_code as ActivationPlanCode,
    planAmountRub: row.plan_amount_rub,
    planDurationMonths: row.plan_duration_months,
    desiredSlug: row.desired_slug,
    contactPhone: row.contact_phone,
    preferredContact: preferredContactFromPayload(row.demo_payload),
    mediaStatus: mediaStatusFromPayload(row.demo_payload),
    venueName,
    status: row.status,
    errorMessage: row.error_message,
    businessId: row.business_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activatedAt: row.activated_at,
  };
}

function preferredContactFromPayload(payload: unknown): ActivationContactChannel | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { preferredContact?: unknown }).preferredContact;
  return isActivationContactChannel(value) ? value : null;
}

function tableMissingMessage(message: string) {
  const text = message.toLowerCase();
  if (text.includes("activation_requests") || text.includes("does not exist") || text.includes("schema cache")) {
    return "Таблица заявок ещё не подключена. Примените supabase/activation-requests.sql.";
  }
  return "Не удалось загрузить заявки";
}
