"use client";

import { getSupabase } from "@/lib/supabase";

export const MENU_PHOTOS_BUCKET = "menu-photos";
export const MAX_MENU_PHOTO_BYTES = 5 * 1024 * 1024;

export function menuPhotoUrl(path: string) {
  const value = path.trim();
  if (!value) return "";
  if (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }

  const { data } = getSupabase().storage.from(MENU_PHOTOS_BUCKET).getPublicUrl(value);
  return data.publicUrl;
}

export function photoObjectPath(businessId: string, folder: "banner" | "products", fileName: string) {
  const path = `${businessId}/${folder}/${fileName}`;
  return isOwnedPhotoPath(path, businessId, folder) ? path : "";
}

export function isOwnedPhotoPath(path: string, businessId: string, folder: "banner" | "products") {
  if (!path || path.length > 240) return false;
  const prefix = `${businessId}/${folder}/`;
  if (!path.startsWith(prefix)) return false;
  const fileName = path.slice(prefix.length);
  return /^[A-Za-z0-9._-]{1,180}$/.test(fileName);
}
