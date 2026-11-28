import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerUrl } from "@/lib/supabase-url";

export type SuperadminDenial = {
  ok: false;
  status: "anonymous" | "forbidden" | "error";
  httpStatus: 401 | 403 | 500;
};

export async function requireSuperadmin(
  request: Request,
): Promise<{ ok: true; supabase: SupabaseClient } | SuperadminDenial> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return { ok: false, status: "anonymous", httpStatus: 401 };

  const url = getSupabaseServerUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return { ok: false, status: "error", httpStatus: 500 };

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { ok: false, status: "anonymous", httpStatus: 401 };

  const { data, error } = await supabase.rpc("is_superadmin");
  if (error) return { ok: false, status: "error", httpStatus: 500 };
  if (data !== true) return { ok: false, status: "forbidden", httpStatus: 403 };

  return { ok: true, supabase };
}

export function superadminDenied(result: SuperadminDenial) {
  return Response.json({ ok: false, status: result.status }, { status: result.httpStatus });
}

function bearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
