const $ = (id) => document.getElementById(id);

async function load() {
  const { baseUrl, token } = await chrome.storage.sync.get(["baseUrl", "token"]);
  $("baseUrl").value = baseUrl || "http://localhost:3000";
  $("token").value = token || "";
}

$("save").addEventListener("click", async () => {
  const baseUrl = $("baseUrl").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();
  const msg = $("msg");

  if (!baseUrl || !token) {
    msg.className = "hint err";
    msg.textContent = "地址和 token 都要填。";
    return;
  }

  await chrome.storage.sync.set({ baseUrl, token });
  msg.className = "hint";
  msg.textContent = "已保存，正在测试连接……";

  // 用一个必然存在的课程视频探测：拿 resolve 接口验证鉴权是否通
  try {
    const res = await fetch(`${baseUrl}/api/resolve?videoId=probe`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      msg.className = "hint err";
      msg.textContent = "token 无效或已撤销，请到站点设置页重新生成。";
      return;
    }
    if (!res.ok) {
      msg.className = "hint err";
      msg.textContent = `站点返回 ${res.status}，检查地址是否正确。`;
      return;
    }
    const data = await res.json();
    msg.className = "hint ok";
    msg.textContent = `✓ 连接成功，当前身份：${data.user}`;
  } catch {
    msg.className = "hint err";
    msg.textContent = `连不上 ${baseUrl}，确认站点已启动、地址可访问。`;
  }
});

void load();
