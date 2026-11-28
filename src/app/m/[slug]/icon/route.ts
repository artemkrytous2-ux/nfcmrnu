import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadVenuePwa, venueIconUrl } from "@/lib/venue-pwa";
import { getSupabaseServerUrl } from "@/lib/supabase-url";

const maxBytes = 5 * 1024 * 1024;

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const venue = await loadVenuePwa(slug);
  const supabaseUrl = getSupabaseServerUrl();
  if (!venue?.iconPath || !supabaseUrl) return defaultIcon();

  try {
    const response = await fetch(venueIconUrl(venue.iconPath, supabaseUrl), { cache: "no-store" });
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!response.ok || !type.startsWith("image/")) return defaultIcon();
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return defaultIcon();
    return new Response(bytes, {
      headers: {
        "Content-Type": type === "image/jpg" ? "image/jpeg" : type,
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return defaultIcon();
  }
}

async function defaultIcon() {
  const bytes = await readFile(path.join(process.cwd(), "public", "icons", "icon-512.png"));
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
