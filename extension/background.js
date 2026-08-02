// Service worker：持有 token 与站点地址，代内容脚本发请求。
// 把凭据放在这里而不是内容脚本，避免 token 暴露在页面上下文中。

async function config() {
  const { baseUrl, token } = await chrome.storage.sync.get(["baseUrl", "token"]);
  return { baseUrl: (baseUrl || "http://localhost:3000").replace(/\/+$/, ""), token };
}

async function callApi(path, init = {}) {
  const { baseUrl, token } = await config();
  if (!token) return { error: "未配置 token，请打开插件设置" };
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    if (res.status === 401) return { error: "token 无效或已撤销" };
    if (!res.ok) return { error: `服务返回 ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: `连不上 ${baseUrl}` };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "report") {
    void callApi("/api/watch", {
      method: "POST",
      body: JSON.stringify(msg.payload),
    }).then(sendResponse);
    return true; // 异步响应
  }
  if (msg?.type === "resolve") {
    const q = new URLSearchParams({ videoId: msg.payload.videoId });
    if (msg.payload.page) q.set("page", String(msg.payload.page));
    void callApi(`/api/resolve?${q}`).then(sendResponse);
    return true;
  }
  return false;
});
