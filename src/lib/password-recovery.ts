import { getSupabase } from "@/lib/supabase";

export function recoveryRedirectUrl() {
  return `${window.location.origin}/admin/reset`;
}

export async function requestPasswordReset(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: recoveryRedirectUrl(),
  });
  if (!error) return { ok: true as const };
  const text = error.message.toLowerCase();
  if (text.includes("not found") || text.includes("no user")) return { ok: true as const };
  if (text.includes("rate") || text.includes("too many") || text.includes("limit")) {
    return { ok: false as const, limited: true as const };
  }
  return { ok: false as const, limited: false as const };
}

export async function establishRecoverySession() {
  const supabase = getSupabase();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    window.history.replaceState({}, "", "/admin/reset");
    return !error;
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    window.history.replaceState({}, "", "/admin/reset");
    return !error;
  }

  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}
