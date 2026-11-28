/** Direct project origin (server-side). Avoids hairpin through `/sb` on Timeweb. */
export const SUPABASE_PROJECT_URL = "https://yktqtxmhkgsrjfzhnsei.supabase.co";

/**
 * Browser/client Supabase base URL (`NEXT_PUBLIC_SUPABASE_URL`).
 * After stage 2 this is `https://nfcmenu.pro/sb`.
 */
export function getSupabasePublicUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

/**
 * Server-side Supabase base URL.
 * Prefers `SUPABASE_URL`, otherwise the known project host — never the public `/sb` proxy.
 */
export function getSupabaseServerUrl() {
  const configured = process.env.SUPABASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return SUPABASE_PROJECT_URL;
}

/** True when `src` is a public Storage object URL we may optimize with next/image. */
export function isSupabasePublicStorageUrl(src: string) {
  try {
    if (src.startsWith("/sb/storage/v1/object/public/")) return true;
    const url = new URL(src);
    if (url.protocol !== "https:") return false;
    if (!url.pathname.includes("/storage/v1/object/public/")) return false;
    if (url.hostname.endsWith(".supabase.co")) return true;
    if (url.hostname === "nfcmenu.pro" && url.pathname.startsWith("/sb/storage/v1/object/public/")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
