import { requireSuperadmin, superadminDenied } from "@/lib/superadmin-server";

export async function GET(request: Request) {
  const access = await requireSuperadmin(request);
  if (!access.ok) return superadminDenied(access);

  return Response.json({ ok: true, status: "superadmin" });
}
