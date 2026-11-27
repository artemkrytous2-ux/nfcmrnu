import { Cormorant_Garamond } from "next/font/google";

/** Display font for beauty menus only — do not load on food/home root layout. */
export const displayFont = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  display: "swap",
});
