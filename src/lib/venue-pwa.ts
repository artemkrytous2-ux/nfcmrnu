import { connection } from "next/server";
import { isMissingPwaColumn, pwaNameFromValue } from "@/lib/pwa-settings";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const filePattern = /^[A-Za-z0-9._-]{1,180}$/;

export type VenuePwa = {
  slug: string;
  title: string;
  iconPath: string | null;
};

type BusinessPwaRow = {
  id?: unknown;
  name?: unknown;
  pwa_name?: unknown;
  pwa_icon_path?: unknown;
};

export async function loadVenuePwa(slug: string): Promise<VenuePwa | null> {
  try {
    await connection();
    if (!slugPattern.test(slug)) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url || !key) return null;

    const withIcon = await readBusiness(url, key, slug, "id,name,pwa_name,pwa_icon_path");
    if (withIcon.ok) return venueFromRow(slug, withIcon.row);
    if (!withIcon.missingColumn) return null;

    const nameOnly = await readBusiness(url, key, slug, "id,name");
    if (!nameOnly.ok) return null;
    return venueFromRow(slug, nameOnly.row);
  } catch {
    return null;
  }
}

export function venueManifest(venue: VenuePwa) {
  const home = `/m/${venue.slug}/`;
  return {
    id: home,
    name: venue.title,
    short_name: venue.title,
    start_url: home,
    scope: home,
    display: "standalone",
    background_color: "#070807",
    theme_color: "#070807",
    icons: venue.iconPath ? customIcons(venue.slug) : defaultIcons(),
  };
}

export function venueIconUrl(path: string, supabaseUrl: string) {
  const encoded = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/menu-photos/${encoded}`;
}

function customIcons(slug: string) {
  const src = `/m/${slug}/icon`;
  return [
    { src, sizes: "512x512", type: "image/jpeg", purpose: "any" },
    { src, sizes: "192x192", type: "image/jpeg", purpose: "any" },
  ];
}

function defaultIcons() {
  return [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" },
  ];
}

function venueFromRow(slug: string, row: BusinessPwaRow | null): VenuePwa | null {
  if (!row || typeof row.id !== "string" || typeof row.name !== "string") return null;
  const businessName = row.name.trim();
  if (!businessName) return null;
  const customName = pwaNameFromValue(row.pwa_name);
  return {
    slug,
    title: customName || businessName,
    iconPath: ownedIconPath(row.id, row.pwa_icon_path),
  };
}

function ownedIconPath(businessId: string, value: unknown) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.length > 240) return null;
  const prefix = `${businessId}/pwa-icon/`;
  if (!path.startsWith(prefix)) return null;
  return filePattern.test(path.slice(prefix.length)) ? path : null;
}

async function readBusiness(url: string, key: string, slug: string, select: string) {
  const endpoint = new URL("/rest/v1/businesses", url);
  endpoint.searchParams.set("select", select);
  endpoint.searchParams.set("slug", `eq.${slug}`);
  endpoint.searchParams.set("is_published", "eq.true");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as BusinessPwaRow[] | { code?: string; message?: string } | null;
  if (!response.ok) {
    const error = payload && !Array.isArray(payload) ? payload : null;
    return { ok: false as const, missingColumn: isMissingPwaColumn(error), row: null };
  }
  const row = Array.isArray(payload) ? payload[0] ?? null : null;
  return { ok: true as const, missingColumn: false, row };
}
