const statusEl = document.getElementById("status");
const reportBtn = document.getElementById("report");

document.getElementById("opts").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

/** 在当前标签页里解析视频 id（与 content.js 同一套规则） */
function extractInTab() {
  const url = new URL(location.href);
  if (location.hostname.endsWith("bilibili.com")) {
    const bv = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
    const av = url.pathname.match(/\/video\/av(\d+)/)?.[1];
    const page = Number(url.searchParams.get("p") ?? "1");
    const id = bv || (av ? `av${av}` : null);
    return id ? { videoId: id, page } : null;
  }
  if (location.hostname.endsWith("youtube.com")) {
    const v = url.searchParams.get("v");
    return v ? { videoId: v } : null;
  }
  return null;
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  let info = null;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractInTab,
    });
    info = res?.result ?? null;
  } catch {
    // 没有 scripting 权限时退回 URL 解析
    const url = new URL(tab.url ?? "about:blank");
    const bv = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)?.[1];
    const v = url.searchParams.get("v");
    if (bv) info = { videoId: bv, page: Number(url.searchParams.get("p") ?? "1") };
    else if (v) info = { videoId: v };
  }

  if (!info) {
    statusEl.textContent = "当前页面不是 bilibili / YouTube 播放页";
    return;
  }

  const hit = await chrome.runtime.sendMessage({ type: "resolve", payload: info });
  if (hit?.error) {
    statusEl.innerHTML = `<span class="muted">${hit.error}</span>`;
    return;
  }
  if (!hit?.matched) {
    statusEl.innerHTML = `<span class="muted">这个视频不在课程库里<br>（${info.videoId}）</span>`;
    return;
  }

  statusEl.innerHTML =
    `<div class="gold">${hit.courseTitle}</div>` +
    `<div style="margin-top:4px">第 ${hit.episodeN} 集 · ${hit.episodeTitle}</div>` +
    `<div class="muted" style="margin-top:6px">冒险者：${hit.user}</div>`;
  reportBtn.disabled = false;

  reportBtn.addEventListener("click", async () => {
    reportBtn.disabled = true;
    reportBtn.textContent = "同步中……";
    const res = await chrome.runtime.sendMessage({
      type: "report",
      payload: { ...info, ratio: 1 },
    });
    if (res?.error) {
      reportBtn.textContent = res.error;
      return;
    }
    let text = res.recorded ? `✓ 已记录 +${res.gained} XP` : "这集之前已记录过";
    if (res.levelUp) text += ` · Lv.${res.level}`;
    if (res.courseDone) text += " · 🏆通关";
    reportBtn.textContent = text;
  });
}

void main();
