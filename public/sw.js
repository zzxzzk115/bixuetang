// Service Worker。
//
// 浏览器判定「这个站可以装成 App」有三个硬条件：manifest、Service Worker
// （且监听 fetch）、HTTPS。少一个都不会出现安装提示——这就是之前
// 「浏览器根本没识别成 PWA」的原因，manifest 早就有了，缺的是这个文件。
//
// 策略克制：只缓存自家的静态壳，别碰视频流和接口。
//   · 视频/音频走 /api/bili/stream，几百 MB，缓存进去会把配额撑爆
//   · 其余 /api/* 是登录态数据，缓存了会串号
//   · 页面走「网络优先、失败回缓存」，断网时至少还能打开看到界面

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const PAGES = `pages-${VERSION}`;

/** 装好就先备着的壳资源 */
const PRECACHE = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)),
  );
  // 新版本立刻接管，不等所有标签页关掉
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL && k !== PAGES)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 只管自己站的请求；bilibili 的图床、字幕直链一概放过
  if (url.origin !== self.location.origin) return;
  // 接口与视频流一律不碰（见文件头的理由）
  if (url.pathname.startsWith("/api/")) return;
  // 上传的头像带版本号 query，交给 HTTP 缓存就够了
  if (url.pathname.startsWith("/avatars/")) return;

  // Next 的构建产物带内容哈希，缓存优先没有版本风险
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

  // 页面导航：网络优先，断网时回落到上次缓存的那一份
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

// Web Push:收到推送弹通知(学习提醒/复习到期/断签召回)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "必学堂", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "必学堂";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // 同 tag 的通知折叠,别刷屏
    tag: data.tag || "bixuetang",
    data: { url: data.url || "/play" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 点通知:已开着就聚焦,否则新开到目标页
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/play";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if ("focus" in c) {
            c.navigate(target);
            return c.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
