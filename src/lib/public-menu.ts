import { businessKind, type BusinessKind } from "@/lib/business-kind";
import { SUB_DESCRIPTION_MAX, type MenuState } from "@/lib/menu";
import { menuTheme, type MenuTheme } from "@/lib/menu-theme";

export type PublicMenuData = {
  slug: string;
  menu: MenuState | null;
  theme: MenuTheme;
  kind: BusinessKind;
  promptEnabled: boolean;
  unavailable: boolean;
};

export type PublicBusinessRow = {
  id: string;
  name: string;
  description: string;
  sub_description?: unknown;
  address?: string;
  phone: string;
  hours?: string;
  order_phone: string;
  banner_path: string;
  telegram_enabled: boolean;
  max_enabled: boolean;
  order_enabled?: unknown;
  call_button_enabled?: unknown;
  theme?: unknown;
  kind?: unknown;
  pwa_prompt_enabled?: unknown;
};

export type PublicCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
};

export type PublicProductRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  image_path: string;
  sort_order: number;
};

export const PUBLIC_MENU_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PUBLIC_BUSINESS_COLUMNS =
  "id, name, description, address, phone, hours, order_phone, banner_path, telegram_enabled, max_enabled";

export function unavailablePublicMenu(slug: string): PublicMenuData {
  return {
    slug,
    menu: null,
    theme: "default",
    kind: "food",
    promptEnabled: false,
    unavailable: true,
  };
}

export function buildPublicMenuData(
  slug: string,
  venue: PublicBusinessRow,
  categoryRows: PublicCategoryRow[],
  productRows: PublicProductRow[],
): PublicMenuData {
  const kind = businessKind(venue.kind);
  const categories = categoryRows
    .filter((category) => category.id && category.name.trim())
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
    .map((category) => ({ id: category.id, name: category.name.trim() }));
  const categoryIds = new Set(categories.map((category) => category.id));
  const dishes = productRows
    .filter((product) => product.id && product.name.trim() && categoryIds.has(product.category_id))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
    .map((product) => ({
      id: product.id,
      categoryId: product.category_id,
      name: product.name.trim(),
      description: product.description?.trim() ?? "",
      price: Number.isFinite(Number(product.price)) ? Math.round(Number(product.price)) : 0,
      image: product.image_path ?? "",
      visible: true,
    }));

  return {
    slug,
    theme: menuTheme(venue.theme),
    kind,
    promptEnabled: venue.pwa_prompt_enabled === true,
    unavailable: false,
    menu: {
      venue: {
        name: venue.name.trim(),
        description: venue.description ?? "",
        subDescription:
          typeof venue.sub_description === "string"
            ? venue.sub_description.slice(0, SUB_DESCRIPTION_MAX)
            : "",
        address: kind === "beauty" ? (venue.address ?? "") : "",
        phone: venue.phone ?? "",
        hours: kind === "beauty" ? (venue.hours ?? "") : "",
        orderPhone: venue.order_phone ?? "",
        banner: venue.banner_path ?? "",
        channels: {
          telegram: venue.telegram_enabled,
          max: venue.max_enabled,
        },
        orderEnabled: venue.order_enabled !== false,
        callButtonEnabled: venue.call_button_enabled === true,
      },
      categories,
      dishes,
    },
  };
}
