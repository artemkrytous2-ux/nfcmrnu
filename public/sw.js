const STATIC_CACHE = "nfcmenu-static-v1";
const OFFLINE_CACHE = "nfcmenu-offline-v1";
const CURRENT_CACHES = new Set([STATIC_CACHE, OFFLINE_CACHE]);

const PRECACHE = [
  "/offline.html",
  "/icons/icon-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("nfcmenu-") && !CURRENT_CACHES.has(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (hasCredentialHeaders(request)) return;
  if (isPrivatePath(url.pathname)) return;
  if (isNextDataRequest(request, url)) return;

  if (isVersionedStatic(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isPwaIcon(url.pathname)) {
    event.respondWith(cacheFirst(request, OFFLINE_CACHE));
    return;
  }

  if (isPublicDocument(request)) {
    event.respondWith(networkOrOffline(request));
  }
});

function hasCredentialHeaders(request) {
  return request.headers.has("authorization") || request.headers.has("cookie");
}

function isPrivatePath(pathname) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/superadmin" ||
    pathname.startsWith("/superadmin/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

function isNextDataRequest(request, url) {
  if (url.searchParams.has("_rsc")) return true;
  if (request.headers.has("rsc")) return true;
  if (request.headers.has("next-router-prefetch")) return true;
  if (request.headers.has("next-router-segment-prefetch")) return true;
  const purpose = `${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""}`;
  if (purpose.toLowerCase().includes("prefetch")) return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/x-component");
}

function isVersionedStatic(pathname) {
  return pathname.startsWith("/_next/static/");
}

function isPwaIcon(pathname) {
  return /^\/icons\/icon-(180|192|512)\.png$/.test(pathname);
}

function isPublicDocument(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function canStore(request, response) {
  if (!response || response.ok !== true || response.type !== "basic") return false;
  if (hasCredentialHeaders(request)) return false;
  if (response.headers.has("set-cookie")) return false;
  return true;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canStore(request, response)) await cache.put(request, response.clone());
  return response;
}

async function networkOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(OFFLINE_CACHE);
    const offline = await cache.match("/offline.html");
    if (offline) return offline;
    throw new Error("offline");
  }
}
