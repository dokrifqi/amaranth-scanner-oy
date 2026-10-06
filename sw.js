/* Service worker: aplikasi disimpan di perangkat agar bisa dipakai tanpa internet,
   dan perubahan pada index.html terdeteksi otomatis tanpa perlu menaikkan versi. */
const VERSION = "gambar-ke-word-v2";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./vendor/docx.umd.js",
  "./vendor/jspdf.umd.min.js",
  "./fonts/bricolage-grotesque-latin-600-normal.woff2",
  "./fonts/bricolage-grotesque-latin-700-normal.woff2",
  "./fonts/public-sans-latin-400-normal.woff2",
  "./fonts/public-sans-latin-500-normal.woff2",
  "./fonts/public-sans-latin-600-normal.woff2",
  "./icon-192.png",
  "./icon-512.png",
  "./maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Halaman utama: jaringan dulu supaya selalu versi terbaru, cadangan dari cache saat offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put("./index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Berkas lain (pustaka, font, ikon): cache dulu, lalu jaringan.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

// Aplikasi yang sedang terbuka meminta pengecekan: bandingkan index.html di server dengan salinan di perangkat.
async function checkUpdate() {
  try {
    const res = await fetch("./index.html", { cache: "no-store" });
    if (!res.ok) return;
    const cache = await caches.open(VERSION);
    const old = await cache.match("./index.html");
    const newText = await res.clone().text();
    const oldText = old ? await old.text() : null;
    if (oldText !== null && oldText === newText) return;
    await cache.put("./index.html", res);
    if (oldText !== null) {
      const list = await self.clients.matchAll({ type: "window" });
      list.forEach((c) => c.postMessage({ type: "html-updated" }));
    }
  } catch (err) { /* offline: abaikan */ }
}

self.addEventListener("message", (event) => {
  if (event.data === "check-update") event.waitUntil(checkUpdate());
});
