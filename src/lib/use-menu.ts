"use client";

import { useEffect, useState } from "react";
import { loadMenu, MENU_CHANGE_EVENT, MENU_STORAGE_KEY, saveMenu, type MenuState } from "@/lib/menu";

export function useMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const refresh = () => setMenu(loadMenu());
    refresh();

    const onStorage = (event: StorageEvent) => {
      if (event.key === MENU_STORAGE_KEY) refresh();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(MENU_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MENU_CHANGE_EVENT, refresh);
    };
  }, []);

  const updateMenu = (next: MenuState) => {
    saveMenu(next);
    setMenu(next);
  };

  return { menu, ready: menu !== null, updateMenu };
}
