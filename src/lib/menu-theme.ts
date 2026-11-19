export const menuThemes = ["default", "minimal", "warm", "natural", "soft", "modern"] as const;

export type MenuTheme = (typeof menuThemes)[number];

export const menuThemeChoices: { id: MenuTheme; title: string }[] = [
  { id: "default", title: "Премиум" },
  { id: "minimal", title: "Минимализм" },
  { id: "warm", title: "Тёплая" },
  { id: "natural", title: "Натуральная" },
  { id: "soft", title: "Нежная" },
  { id: "modern", title: "Современная" },
];

export function isMissingThemeColumn(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("theme") && (message.includes("does not exist") || message.includes("schema cache"));
}

export function menuTheme(value: unknown): MenuTheme {
  return typeof value === "string" && menuThemes.includes(value as MenuTheme) ? (value as MenuTheme) : "default";
}

export function menuThemeClass(value: unknown) {
  return `menu-theme-${menuTheme(value)}`;
}
