const ICON_SIDE = 512;

export function storedPwaName(value: string): { ok: true; name: string | null } | { ok: false; message: string } {
  const name = value.trim();
  if (!name) return { ok: true, name: null };
  if (name.length > 40) return { ok: false, message: "Название приложения не длиннее 40 символов." };
  return { ok: true, name };
}

export function pwaNameFromValue(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim();
  return name.length <= 40 ? name : "";
}

export function reportPwaIconError(
  stage: string,
  error?: { message?: string; code?: string; statusCode?: string | number } | null,
  extra?: Record<string, string>,
) {
  const message = error?.message?.trim() ?? "";
  const code = String(error?.code ?? error?.statusCode ?? "");
  console.error("[pwa-icon]", { stage, message, code, ...(extra ?? {}) });
  return pwaIconFailureMessage(message, code);
}

export function pwaIconFailureMessage(message: string, code = "") {
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || code === "42501") {
    return "Хранилище не разрешило загрузку иконки.";
  }
  if (lower.includes("check constraint") || code === "23514") {
    return "База не приняла путь иконки.";
  }
  if (lower.includes("mime") || lower.includes("content type") || lower.includes("content-type")) {
    return "Хранилище не приняло файл JPEG.";
  }
  if (
    code === "42703" ||
    code === "PGRST204" ||
    lower.includes("schema cache") ||
    (lower.includes("does not exist") && (lower.includes("pwa_icon_path") || lower.includes("pwa_name")))
  ) {
    return "Сохранение приложения пока недоступно. Обновление базы ещё не применено.";
  }
  return "Не удалось загрузить иконку.";
}

export function isMissingPwaColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  const mentions = message.includes("pwa_name") || message.includes("pwa_icon_path");
  if (!mentions) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

export function readSquareIconBlob(file: File) {
  return new Promise<Blob>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Не удалось открыть изображение"));
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        if (side < 1) {
          reject(new Error("Не удалось подготовить иконку"));
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = ICON_SIDE;
        canvas.height = ICON_SIDE;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Не удалось подготовить иконку"));
          return;
        }
        const offsetX = Math.floor((image.width - side) / 2);
        const offsetY = Math.floor((image.height - side) / 2);
        context.drawImage(image, offsetX, offsetY, side, side, 0, 0, ICON_SIDE, ICON_SIDE);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Не удалось подготовить иконку"));
            return;
          }
          resolve(blob);
        }, "image/jpeg", 0.72);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
