import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadVenuePwa, venueIconUrl } from "@/lib/venue-pwa";
import { getSupabaseServerUrl } from "@/lib/supabase-url";

const maxBytes = 5 * 1024 * 1024;
const appleSide = 180;

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const venue = await loadVenuePwa(slug);
  const supabaseUrl = getSupabaseServerUrl();
  if (!venue?.iconPath || !supabaseUrl) return standardIcon("public, max-age=86400");

  try {
    const response = await fetch(venueIconUrl(venue.iconPath, supabaseUrl), { cache: "no-store" });
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!response.ok || (type !== "image/jpeg" && type !== "image/jpg" && type !== "image/png" && type !== "image/webp")) {
      return standardIcon("public, max-age=300");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return standardIcon("public, max-age=300");
    const png = await sharp(bytes).resize(appleSide, appleSide, { fit: "cover" }).png().toBuffer();
    return pngResponse(png, "public, max-age=300");
  } catch {
    return standardIcon("public, max-age=300");
  }
}

function pngResponse(bytes: Uint8Array, cacheControl: string) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function standardIcon(cacheControl: string) {
  const bytes = await readFile(path.join(process.cwd(), "public", "icons", "icon-180.png"));
  return pngResponse(bytes, cacheControl);
}
