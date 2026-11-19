export const businessKinds = ["food", "beauty", "repair", "catalog"] as const;

export type BusinessKind = (typeof businessKinds)[number];

export const businessKindChoices: { id: BusinessKind; title: string }[] = [
  { id: "food", title: "Ресторан / кафе" },
  { id: "beauty", title: "Красота и услуги" },
  { id: "repair", title: "Ремонт и строительство" },
  { id: "catalog", title: "Каталог товаров" },
];

export function businessKind(value: unknown): BusinessKind {
  return typeof value === "string" && businessKinds.includes(value as BusinessKind) ? (value as BusinessKind) : "food";
}

/** Для создания заведения: отсутствие поля означает food, неизвестное значение отклоняется. */
export function businessKindForCreate(value: unknown): BusinessKind | null {
  if (value === undefined) return "food";
  return typeof value === "string" && businessKinds.includes(value as BusinessKind) ? (value as BusinessKind) : null;
}

export function isMissingKindColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  if (!message.includes("kind")) return false;
  return error.code === "42703" || error.code === "PGRST204" || message.includes("does not exist") || message.includes("schema cache");
}
