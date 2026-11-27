import { displayFont } from "@/lib/display-font";

/** Server-only wrapper: mounts Cormorant CSS variable for beauty menus. */
export function BeautyFontShell({ children }: { children: React.ReactNode }) {
  return <div className={displayFont.variable}>{children}</div>;
}
