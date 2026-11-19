"use client";

import { useEffect, useRef, useState } from "react";
import { CART_STORAGE_KEY } from "@/lib/order";

function readCart(storageKey: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, quantity]) => {
        const count = Number(quantity);
        if (!id || !Number.isFinite(count) || count <= 0) return [];
        return [[id, Math.min(99, Math.round(count))]];
      }),
    );
  } catch {
    return {};
  }
}

export function cartStorageKey(scope: string) {
  return scope === "demo" ? CART_STORAGE_KEY : `${CART_STORAGE_KEY}:${scope}`;
}

export function useCart(scope: string) {
  const storageKey = cartStorageKey(scope);
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;
  const [activeKey, setActiveKey] = useState(storageKey);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  if (activeKey !== storageKey) {
    setActiveKey(storageKey);
    setQuantities({});
  }

  useEffect(() => {
    setQuantities(readCart(storageKey));
  }, [storageKey]);

  const update = (next: Record<string, number>) => {
    setQuantities(next);
    window.sessionStorage.setItem(storageKeyRef.current, JSON.stringify(next));
  };

  const add = (id: string) => {
    update({ ...quantities, [id]: Math.min(99, (quantities[id] ?? 0) + 1) });
  };

  const setQuantity = (id: string, quantity: number) => {
    const next = { ...quantities };
    if (quantity <= 0) delete next[id];
    else next[id] = Math.min(99, quantity);
    update(next);
  };

  const clear = () => update({});

  return { quantities, add, setQuantity, clear };
}
