import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "menu-photos";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const storageIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const folders = ["banner", "products", "pwa-icon"] as const;
const outsideFolderMessage =
  "У заведения есть файл вне папок banner, products и pwa-icon. Удаление остановлено";

type ArchiveRow = {
  id: string;
  slug: string;
  is_archived: boolean;
};

type StorageEntry = {
  name: string;
  id: string | null;
};

type Failure = { ok: false; status: number; message: string };

export async function deleteArchivedBusiness(
  supabase: SupabaseClient,
  requestedId: string,
  slug: unknown,
): Promise<{ ok: true } | Failure> {
  if (typeof slug !== "string" || slug.length === 0 || slug !== slug.trim()) {
    return fail(400, "Адрес страницы не совпадает");
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("id, slug, is_archived")
    .eq("id", requestedId)
    .maybeSingle();

  if (error) return fail(500, "Не удалось удалить заведение. Повторите попытку.");
  if (!data) return fail(404, "Заведение не найдено");

  const row = data as ArchiveRow;
  if (!storageIdPattern.test(row.id)) return fail(500, "Не удалось удалить заведение. Повторите попытку.");
  if (row.slug !== slug) return fail(400, "Адрес страницы не совпадает");
  if (row.is_archived !== true) return fail(409, "Сначала перенесите заведение в архив");

  const businessId = row.id;
  const before = await inspectVenueFiles(supabase, businessId);
  if (!before.ok) return before;
  if (before.paths.length > 0) {
    const removed = await removePaths(supabase, businessId, before.paths);
    const afterRemove = await inspectVenueFiles(supabase, businessId);
    if (!afterRemove.ok) return afterRemove;
    if (afterRemove.paths.length > 0) {
      return removed.ok ? fail(409, "Фотографии ещё не удалены. Повторите удаление.") : removed;
    }
  }

  const after = await inspectVenueFiles(supabase, businessId);
  if (!after.ok) return after;
  if (after.paths.length > 0) {
    return fail(409, "Фотографии ещё не удалены. Повторите удаление.");
  }

  const deleted = await supabase.rpc("delete_archived_business", {
    p_business_id: businessId,
    p_slug: slug,
  });
  if (deleted.error) return rpcFailure(deleted.error.message);
  return { ok: true };
}

async function inspectVenueFiles(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ ok: true; paths: string[] } | Failure> {
  const root = await listPageByPage(supabase, businessId);
  if (!root.ok) return root;

  for (const entry of root.entries) {
    if (entry.id !== null || !folders.includes(entry.name as (typeof folders)[number])) {
      return fail(409, outsideFolderMessage);
    }
  }

  const paths: string[] = [];
  for (const folder of folders) {
    const listed = await listPageByPage(supabase, `${businessId}/${folder}`);
    if (!listed.ok) return listed;
    for (const entry of listed.entries) {
      const path = `${businessId}/${folder}/${entry.name}`;
      if (entry.id === null || !isVenueFilePath(businessId, path)) {
        return fail(409, outsideFolderMessage);
      }
      paths.push(path);
    }
  }

  return { ok: true, paths };
}

async function listPageByPage(
  supabase: SupabaseClient,
  folder: string,
): Promise<{ ok: true; entries: StorageEntry[] } | Failure> {
  const entries: StorageEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) return fail(500, "Не удалось проверить фотографии. Повторите удаление.");
    const batch = data ?? [];
    for (const item of batch) {
      if (!item.name || item.name === "." || item.name === "..") {
        return fail(409, outsideFolderMessage);
      }
      entries.push({ name: item.name, id: item.id });
    }
    if (batch.length < PAGE_SIZE) return { ok: true, entries };
  }
  return fail(409, "Не удалось проверить все фотографии. Повторите удаление.");
}

async function removePaths(
  supabase: SupabaseClient,
  businessId: string,
  paths: string[],
): Promise<{ ok: true } | Failure> {
  let failed = false;
  for (let index = 0; index < paths.length; index += PAGE_SIZE) {
    const chunk = paths.slice(index, index + PAGE_SIZE);
    if (chunk.some((path) => path.startsWith(`${BUCKET}/`) || !isVenueFilePath(businessId, path))) {
      return fail(409, outsideFolderMessage);
    }
    const { error } = await supabase.storage.from(BUCKET).remove(chunk);
    if (error) failed = true;
  }
  return failed ? fail(500, "Не удалось удалить фотографии. Повторите удаление.") : { ok: true };
}

function isVenueFilePath(businessId: string, path: string) {
  if (!storageIdPattern.test(businessId) || path.length > 240) return false;
  for (const folder of folders) {
    const prefix = `${businessId}/${folder}/`;
    if (!path.startsWith(prefix)) continue;
    return /^[A-Za-z0-9._-]{1,180}$/.test(path.slice(prefix.length));
  }
  return false;
}

function rpcFailure(message: string): Failure {
  if (message.includes("Заведение не найдено")) return fail(404, "Заведение не найдено");
  if (message.includes("Адрес страницы не совпадает")) return fail(400, "Адрес страницы не совпадает");
  if (message.includes("Сначала перенесите заведение в архив")) {
    return fail(409, "Сначала перенесите заведение в архив");
  }
  if (
    message.includes("Сначала удалите фотографии") ||
    message.includes("вне папок") ||
    message.includes("не видит все файлы")
  ) {
    return fail(409, "Фотографии ещё не удалены. Повторите удаление.");
  }
  return fail(500, "Не удалось удалить заведение. Повторите попытку.");
}

function fail(status: number, message: string): Failure {
  return { ok: false, status, message };
}
