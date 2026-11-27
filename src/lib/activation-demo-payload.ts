import type { ActivationContactChannel } from "@/lib/activation-plans";
import {
  isActivationMediaPath,
  isDataImageRef,
  isRemoteImageRef,
} from "@/lib/activation-media";
import type { PersonalDemoState } from "@/lib/personal-demo-storage";

export type ActivationMediaStatus = "pending" | "ready" | "failed";

export type ActivationDemoPayload = {
  preferredContact: ActivationContactChannel | null;
  mediaStatus: ActivationMediaStatus;
  theme: PersonalDemoState["theme"];
  templateVersion: number;
  pwaIconPath: string;
  menu: PersonalDemoState["menu"];
};

/** Снимок без data URL. https и пути Storage оставляем. */
export function buildActivationDemoPayload(
  state: PersonalDemoState,
  preferredContact: ActivationContactChannel | null,
  options?: {
    requestId?: string;
    bannerPath?: string;
    dishImages?: Record<string, string>;
    pwaIconPath?: string;
    mediaStatus?: ActivationMediaStatus;
  },
): ActivationDemoPayload {
  const requestId = options?.requestId?.trim() ?? "";
  const dishImages = options?.dishImages ?? {};

  return {
    preferredContact,
    mediaStatus: options?.mediaStatus ?? "pending",
    theme: state.theme,
    templateVersion: state.templateVersion,
    pwaIconPath: sanitizeImageRef(options?.pwaIconPath ?? "", requestId),
    menu: {
      ...state.menu,
      venue: {
        ...state.menu.venue,
        banner: sanitizeImageRef(
          options?.bannerPath !== undefined ? options.bannerPath : state.menu.venue.banner,
          requestId,
        ),
      },
      dishes: state.menu.dishes.map((dish) => ({
        ...dish,
        image: sanitizeImageRef(
          dishImages[dish.id] !== undefined ? dishImages[dish.id] : dish.image,
          requestId,
        ),
      })),
    },
  };
}

export function mediaStatusFromPayload(payload: unknown): ActivationMediaStatus {
  if (!payload || typeof payload !== "object") return "pending";
  const value = (payload as { mediaStatus?: unknown }).mediaStatus;
  if (value === "ready" || value === "failed" || value === "pending") return value;
  return "pending";
}

/** Уже сохранённые пути Storage/https из demo_payload для догрузки. */
export function mediaPathsFromPayload(payload: unknown, requestId: string) {
  if (!payload || typeof payload !== "object") {
    return { bannerPath: "", dishImages: {} as Record<string, string>, pwaIconPath: "" };
  }
  const row = payload as {
    pwaIconPath?: unknown;
    menu?: { venue?: { banner?: unknown }; dishes?: Array<{ id?: unknown; image?: unknown }> };
  };
  const dishImages: Record<string, string> = {};
  for (const dish of Array.isArray(row.menu?.dishes) ? row.menu.dishes : []) {
    if (typeof dish?.id !== "string" || typeof dish.image !== "string") continue;
    const path = sanitizeImageRef(dish.image, requestId);
    if (path) dishImages[dish.id] = path;
  }
  return {
    bannerPath: sanitizeImageRef(
      typeof row.menu?.venue?.banner === "string" ? row.menu.venue.banner : "",
      requestId,
    ),
    dishImages,
    pwaIconPath: sanitizeImageRef(typeof row.pwaIconPath === "string" ? row.pwaIconPath : "", requestId),
  };
}

export function sanitizeImageRef(value: string, requestId = "") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (isDataImageRef(trimmed)) return "";
  if (isRemoteImageRef(trimmed)) return trimmed.slice(0, 240);
  if (requestId && isActivationMediaPath(requestId, trimmed)) return trimmed.slice(0, 240);
  // Уже сохранённый путь без requestId в контексте merge — только форма activation-media.
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(banner|products|pwa-icon)\/[A-Za-z0-9._-]{1,180}$/.test(
      trimmed,
    )
  ) {
    return trimmed.slice(0, 240);
  }
  return "";
}
