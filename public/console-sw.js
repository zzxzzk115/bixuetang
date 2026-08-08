// 管理端 Service Worker(admin. 子域独立 origin,与游戏端 /sw.js 互不干扰)。
// 管理端是运营后台,数据敏感且实时——策略比游戏端更克制:
//   · 只缓存构建静态产物(带哈希,安全);页面一律网络优先,断网才回落
//   · 接口/头像一概不碰,绝不缓存登录态或用户数据

const VERSION = "v1";
const SHELL = `admin-shell-${VERSION}`;
const PAGES = `admin-pages-${VERSION}`;

const PRECACHE = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/console.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL && k !== PAGES).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/avatars/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(PAGES);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(request);
          return cached ?? Response.error();
        }
      })(),
    );
  }
});
