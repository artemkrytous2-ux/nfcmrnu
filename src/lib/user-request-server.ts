import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type UserRequestDenial = {
  ok: false;
  status: "anonymous" | "error";
  httpStatus: 401 | 500;
};

export async function requireUserRequest(
  request: Request,
): Promise<{ ok: true; supabase: SupabaseClient; user: User; token: string } | UserRequestDenial> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return { ok: false, status: "anonymous", httpStatus: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
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

  return { ok: true, supabase, user: userData.user, token };
}

export function userRequestDenied(result: UserRequestDenial) {
  return Response.json({ ok: false, status: result.status }, { status: result.httpStatus });
}

function bearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
