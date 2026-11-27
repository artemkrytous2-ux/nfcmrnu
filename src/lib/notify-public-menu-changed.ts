"use client";

import { getSupabase } from "@/lib/supabase";

/**
 * Fire-and-forget: ask the server to purge this owner's public venue caches.
 * Failures are ignored so a successful save is never rolled back.
 */
export function notifyPublicMenuChanged() {
  void (async () => {
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/owner/revalidate-public", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      // ignore
    }
  })();
}

export function ownerWriteOk(): { ok: true };
export function ownerWriteOk<T extends object>(payload: T): { ok: true } & T;
export function ownerWriteOk<T extends object>(payload?: T) {
  notifyPublicMenuChanged();
  return payload ? ({ ok: true as const, ...payload } as { ok: true } & T) : { ok: true as const };
}
