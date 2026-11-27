import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_MENU_PHOTO_BYTES } from "@/lib/photos";
import type { PersonalDemoState } from "@/lib/personal-demo-storage";

export const ACTIVATION_MEDIA_BUCKET = "activation-media";

export type ActivationMediaFolder = "banner" | "products" | "pwa-icon";

export type ActivationMediaPaths = {
  bannerPath: string;
  dishImages: Record<string, string>;
  pwaIconPath: string;
};

export type ActivationMediaUploadResult =
  | ({
      ok: true;
      uploadedCount: number;
      skippedCount: number;
    } & ActivationMediaPaths)
  | ({
      ok: false;
      message: string;
      partial: boolean;
      uploadedCount: number;
      skippedCount: number;
    } & ActivationMediaPaths);

const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Путь объекта в activation-media для RLS SQL. */
export function activationMediaObjectPath(
  requestId: string,
  folder: ActivationMediaFolder,
  fileName: string,
) {
  const id = requestId.trim().toLowerCase();
  const name = fileName.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return "";
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(name)) return "";
  return `${id}/${folder}/${name}`;
}

export function isActivationMediaPath(requestId: string, path: string) {
  const value = path.trim();
  if (!value || value.length > 240) return false;
  const id = requestId.trim().toLowerCase();
  return new RegExp(
    `^${id}/(banner|products|pwa-icon)/[A-Za-z0-9._-]{1,180}$`,
  ).test(value);
}

export function isRemoteImageRef(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

export function isDataImageRef(value: string) {
  return value.trim().toLowerCase().startsWith("data:image");
}

/**
 * Загружает data URL из демо в приватный bucket.
 * Уже сохранённые пути request_id пропускает (догрузка после partial).
 * localStorage не меняет.
 */
export async function uploadActivationDemoMedia(
  supabase: SupabaseClient,
  requestId: string,
  state: PersonalDemoState,
  alreadySaved?: Partial<ActivationMediaPaths>,
): Promise<ActivationMediaUploadResult> {
  const dishImages: Record<string, string> = { ...(alreadySaved?.dishImages ?? {}) };
  let bannerPath = alreadySaved?.bannerPath?.trim() ?? "";
  let pwaIconPath = alreadySaved?.pwaIconPath?.trim() ?? "";
  let uploadedCount = 0;
  let skippedCount = 0;
  const failures: string[] = [];

  if (bannerPath && isActivationMediaPath(requestId, bannerPath)) {
    skippedCount += 1;
  } else {
    bannerPath = "";
    const banner = state.menu.venue.banner.trim();
    if (isDataImageRef(banner)) {
      const path = activationMediaObjectPath(requestId, "banner", "banner.jpg");
      const uploaded = await uploadDataUrl(supabase, path, banner);
      if (!uploaded.ok) failures.push("баннер");
      else {
        bannerPath = path;
        uploadedCount += 1;
      }
    } else if (isRemoteImageRef(banner) || isActivationMediaPath(requestId, banner)) {
      bannerPath = banner;
    }
  }

  for (const dish of state.menu.dishes) {
    const saved = dishImages[dish.id]?.trim() ?? "";
    if (saved && (isActivationMediaPath(requestId, saved) || isRemoteImageRef(saved))) {
      skippedCount += 1;
      continue;
    }

    const image = dish.image.trim();
    if (!image) {
      delete dishImages[dish.id];
      continue;
    }
    if (isDataImageRef(image)) {
      const fileName = `${sanitizeFileToken(dish.id) || "dish"}.jpg`;
      const path = activationMediaObjectPath(requestId, "products", fileName);
      if (!path) {
        failures.push(dish.name || "блюдо");
        continue;
      }
      const uploaded = await uploadDataUrl(supabase, path, image);
      if (!uploaded.ok) failures.push(dish.name || "блюдо");
      else {
        dishImages[dish.id] = path;
        uploadedCount += 1;
      }
      continue;
    }
    if (isRemoteImageRef(image) || isActivationMediaPath(requestId, image)) {
      dishImages[dish.id] = image;
    } else {
      delete dishImages[dish.id];
    }
  }

  if (pwaIconPath && isActivationMediaPath(requestId, pwaIconPath)) {
    skippedCount += 1;
  } else {
    pwaIconPath = "";
    const pwaIcon = readOptionalPwaIcon(state);
    if (pwaIcon && isDataImageRef(pwaIcon)) {
      const path = activationMediaObjectPath(requestId, "pwa-icon", "icon.jpg");
      const uploaded = await uploadDataUrl(supabase, path, pwaIcon);
      if (!uploaded.ok) failures.push("иконка приложения");
      else {
        pwaIconPath = path;
        uploadedCount += 1;
      }
    } else if (pwaIcon && (isRemoteImageRef(pwaIcon) || isActivationMediaPath(requestId, pwaIcon))) {
      pwaIconPath = pwaIcon;
    }
  }

  const paths = { bannerPath, dishImages, pwaIconPath };

  if (failures.length > 0) {
    return {
      ok: false,
      partial: uploadedCount > 0 || skippedCount > 0 || Boolean(bannerPath) || Object.keys(dishImages).length > 0,
      message:
        failures.length === 1
          ? `Не удалось загрузить фото: ${failures[0]}. Попробуйте снова.`
          : `Не удалось загрузить часть фото (${failures.slice(0, 3).join(", ")}). Попробуйте снова.`,
      uploadedCount,
      skippedCount,
      ...paths,
    };
  }

  return { ok: true, uploadedCount, skippedCount, ...paths };
}

/** Удаляет только объекты `{requestId}/...` владельца (cancelled/pending по RLS). */
export async function removeActivationMediaFolder(
  supabase: SupabaseClient,
  requestId: string,
): Promise<{ ok: true; removed: number } | { ok: false; message: string }> {
  const id = requestId.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return { ok: false, message: "Некорректный идентификатор заявки для очистки фото" };
  }

  const paths: string[] = [];
  for (const folder of ["banner", "products", "pwa-icon"] as const) {
    const { data, error } = await supabase.storage.from(ACTIVATION_MEDIA_BUCKET).list(`${id}/${folder}`, {
      limit: 200,
    });
    if (error) {
      return { ok: false, message: "Не удалось прочитать файлы старой заявки" };
    }
    for (const item of data ?? []) {
      if (!item.name || item.name === ".emptyFolderPlaceholder") continue;
      const path = activationMediaObjectPath(id, folder, item.name);
      if (path) paths.push(path);
    }
  }

  if (paths.length === 0) return { ok: true, removed: 0 };

  const { error } = await supabase.storage.from(ACTIVATION_MEDIA_BUCKET).remove(paths);
  if (error) {
    return { ok: false, message: "Не удалось удалить фотографии старой заявки" };
  }
  return { ok: true, removed: paths.length };
}

async function uploadDataUrl(supabase: SupabaseClient, path: string, dataUrl: string) {
  const parsed = dataUrlToBlob(dataUrl);
  if (!parsed) return { ok: false as const };
  if (parsed.blob.size > MAX_MENU_PHOTO_BYTES) return { ok: false as const };

  const { error } = await supabase.storage.from(ACTIVATION_MEDIA_BUCKET).upload(path, parsed.blob, {
    contentType: parsed.contentType,
    upsert: true,
  });
  return error ? { ok: false as const } : { ok: true as const };
}

export function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  if (!allowedMime.has(contentType)) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_MENU_PHOTO_BYTES) return null;
    return { blob: new Blob([bytes], { type: contentType }), contentType };
  } catch {
    return null;
  }
}

function sanitizeFileToken(value: string) {
  return value.trim().replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

function readOptionalPwaIcon(state: PersonalDemoState) {
  const raw = state as PersonalDemoState & { pwaIcon?: unknown; menu?: { pwaIcon?: unknown } };
  if (typeof raw.pwaIcon === "string") return raw.pwaIcon.trim();
  if (raw.menu && typeof raw.menu.pwaIcon === "string") return raw.menu.pwaIcon.trim();
  return "";
}
