"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

function requireSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [
    [SUPABASE_URL, url],
    [SUPABASE_PUBLISHABLE_KEY, key],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (!url || !key) {
    throw new Error(
      `Supabase не настроен. В .env.local нет ${missing.join(" и ")}. Добавьте переменные и перезапустите приложение.`,
    );
  }

  return { url, key };
}

let client: SupabaseClient | undefined;

/** Клиент создаётся при первом обращении и только если заданы обе переменные. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const { url, key } = requireSupabaseEnv();
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        ...(typeof window !== "undefined" ? { storage: window.localStorage } : {}),
      },
    });
  }

  return client;
}

let publicClient: SupabaseClient | undefined;

/** Гостевой клиент: не читает и не хранит сессию кабинета. */
export function getPublicSupabase(): SupabaseClient {
  if (!publicClient) {
    const { url, key } = requireSupabaseEnv();
    publicClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return publicClient;
}
