const CACHE_NAME = "edtech-v3";
const PRECACHE_URLS = ["/", "/manifest.json"];

// Skip all caching when running in development (localhost or Replit dev domain)
const IS_DEV = self.location.hostname === "localhost" ||
  self.location.hostname.endsWith(".replit.dev") ||
  self.location.hostname.endsWith(".pike.replit.dev") ||
  self.location.hostname.endsWith(".repl.co");

self.addEventListener("install", (event) => {
  if (IS_DEV) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // In dev, always go to network — never serve from cache
  if (IS_DEV) return;

  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ── Web Push Notifications (SRS FR-NOT-01 / M-08) ─────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { data = { title: "EdTech Study Platform", body: event.data.text() }; }

  const options = {
    body: data.body ?? "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: data.tag ?? "edtech-notification",
    renotify: true,
    data: { url: data.url ?? "/" },
  };

  event.waitUntil(
    self.registration.showNotification(data.title ?? "EdTech Study Platform", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── Background Sync for exam answers (SRS H-02) ──────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-exam-answers") {
    event.waitUntil(syncExamAnswers());
  }
});

async function syncExamAnswers() {
  try {
    const db = await openAnswerQueue();
    const items = await getAllFromStore(db);
    for (const item of items) {
      try {
        const res = await fetch(item.url, { method: "POST", headers: item.headers, body: item.body });
        if (res.ok) {
          const tx = db.transaction("queue", "readwrite");
          tx.objectStore("queue").delete(item.id);
        }
      } catch { /* retry next sync */ }
    }
  } catch { /* IndexedDB unavailable */ }
}

function openAnswerQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("edtech-sync-queue", 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function getAllFromStore(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readonly");
    const req = tx.objectStore("queue").getAll();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}
