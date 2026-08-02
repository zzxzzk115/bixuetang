// 内容脚本：在 B 站 / YouTube 播放页读取当前视频与播放进度，
// 达到阈值后通过 background 上报给 Guild 后端。
// 只读取播放器状态，不碰账号信息，不注入任何界面元素（除轻量角标）。

const REPORT_RATIO = 0.8; // 与后端 WATCH_THRESHOLD 一致
const POLL_MS = 5000;

/** 当前页面的视频标识 */
function currentVideo() {
  const url = new URL(location.href);
  if (location.hostname.endsWith("bilibili.com")) {
    const bv = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
    const av = url.pathname.match(/\/video\/av(\d+)/)?.[1];
    const page = Number(url.searchParams.get("p") ?? "1");
    if (bv) return { videoId: bv, page };
    if (av) return { videoId: `av${av}`, page };
    return null;
  }
  if (location.hostname.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    const index = Number(url.searchParams.get("index") ?? "0");
    if (v) return { videoId: v, page: index || undefined };
    return null;
  }
  return null;
}

/** 播放进度比例（拿不到播放器时返回 null） */
function playbackRatio() {
  const video = document.querySelector("video");
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return null;
  return video.currentTime / video.duration;
}

let badge = null;
function showBadge(text, tone) {
  if (!badge) {
    badge = document.createElement("div");
    badge.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
      "padding:8px 14px", "border-radius:8px", "font:13px/1.4 system-ui,sans-serif",
      "color:#f5c542", "background:rgba(11,14,20,.94)", "border:1px solid #f5c542",
      "box-shadow:0 4px 16px rgba(0,0,0,.4)", "pointer-events:none",
      "transition:opacity .3s", "max-width:280px",
    ].join(";");
    document.body.appendChild(badge);
  }
  badge.style.color = tone === "muted" ? "#8b93a7" : "#f5c542";
  badge.style.borderColor = tone === "muted" ? "#252d44" : "#f5c542";
  badge.textContent = text;
  badge.style.opacity = "1";
  clearTimeout(showBadge.timer);
  showBadge.timer = setTimeout(() => {
    if (badge) badge.style.opacity = "0";
  }, 4000);
}

const reported = new Set();

async function tick() {
  const info = currentVideo();
  if (!info) return;
  const ratio = playbackRatio();
  if (ratio === null) return;

  const key = `${info.videoId}:${info.page ?? 1}`;
  if (reported.has(key) || ratio < REPORT_RATIO) return;
  reported.add(key);

  try {
    const res = await chrome.runtime.sendMessage({
      type: "report",
      payload: { ...info, ratio },
    });
    if (!res) return;
    if (res.error) {
      showBadge(`⚠ ${res.error}`, "muted");
      reported.delete(key); // 失败允许下次重试
      return;
    }
    if (!res.matched) {
      showBadge("这个视频不在学者公会的课程库里", "muted");
      return;
    }
    if (res.recorded) {
      let text = `✓ ${res.courseTitle} 第 ${res.episodeN} 集已记录 +${res.gained} XP`;
      if (res.levelUp) text += ` · 升到 Lv.${res.level}！`;
      if (res.courseDone) text += " · 🏆 整门通关！";
      showBadge(text);
    } else {
      showBadge(`已看过：${res.courseTitle} 第 ${res.episodeN} 集`, "muted");
    }
  } catch {
    reported.delete(key);
  }
}

setInterval(tick, POLL_MS);

// B 站/YouTube 是单页应用，换集不刷新页面，需监听 URL 变化重置状态
let lastHref = location.href;
setInterval(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
  }
}, 1500);
