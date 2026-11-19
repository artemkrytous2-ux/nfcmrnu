"use client";

import { MenuBoard } from "@/components/menu-board";
import { useMenu } from "@/lib/use-menu";

export function DemoMenu() {
  const { menu, ready } = useMenu();
  return <MenuBoard menu={menu} ready={ready} cartScope="demo" />;
}
