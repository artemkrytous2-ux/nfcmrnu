import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerUrl } from "@/lib/supabase-url";

/** Серверный клиент service_role: обход RLS для переноса активации и будущих вебхуков оплаты. */
export function createServiceRoleClient(): SupabaseClient | null {
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
