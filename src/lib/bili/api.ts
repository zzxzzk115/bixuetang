import "server-only";

// B 站开放接口薄封装（服务端专用）。
//
// 思路参考 wiliwili（https://github.com/xfangfang/wiliwili，MIT）：
// 用官方 TV/Web 端接口取播放地址与弹幕，自己渲染播放器，
// 从而拿到「看了多少、看到哪」这些学习进度信号。
// 凭据只在服务端使用，绝不下发到客户端。

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export function biliHeaders(sessdata?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: "https://www.bilibili.com",
    Origin: "https://www.bilibili.com",
  };
  if (sessdata) headers.Cookie = `SESSDATA=${sessdata}`;
  return headers;
}

async function getJson<T>(
  url: string,
  sessdata?: string,
): Promise<{ code: number; message?: string; data?: T }> {
  const res = await fetch(url, {
    headers: biliHeaders(sessdata),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bilibili HTTP ${res.status}`);
  return (await res.json()) as { code: number; message?: string; data?: T };
}

// ---------- 扫码登录 ----------

export interface QrGenerate {
  url: string;
  qrcode_key: string;
}

export async function qrGenerate(): Promise<QrGenerate> {
  const json = await getJson<QrGenerate>(
    "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
  );
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message ?? "二维码申请失败");
  }
  return json.data;
}

export interface QrPollData {
  /** 0=成功 86038=二维码失效 86090=已扫待确认 86101=未扫描 */
  code: number;
  message: string;
  url: string;
  refresh_token: string;
  timestamp: number;
}

export interface QrPollResult {
  status: "pending" | "scanned" | "expired" | "ok";
  sessdata?: string;
  biliJct?: string;
  mid?: string;
  refreshToken?: string;
}

/** 轮询扫码结果。成功时从 302 URL 的 query 里取出凭据 */
export async function qrPoll(qrcodeKey: string): Promise<QrPollResult> {
  const res = await fetch(
    `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
    { headers: biliHeaders(), cache: "no-store" },
  );
  const json = (await res.json()) as { code: number; data?: QrPollData };
  const data = json.data;
  if (!data) return { status: "pending" };

  if (data.code === 86038) return { status: "expired" };
  if (data.code === 86090) return { status: "scanned" };
  if (data.code !== 0) return { status: "pending" };

  // 成功：凭据在跳转 URL 的 query 里；Set-Cookie 同样带 SESSDATA
  const url = new URL(data.url);
  const sessdata = url.searchParams.get("SESSDATA") ?? undefined;
  const biliJct = url.searchParams.get("bili_jct") ?? undefined;
  const mid = url.searchParams.get("DedeUserID") ?? undefined;
  if (!sessdata || !mid) return { status: "pending" };
  return {
    status: "ok",
    sessdata,
    biliJct,
    mid,
    refreshToken: data.refresh_token,
  };
}

export interface BiliSelfInfo {
  mid: number;
  uname: string;
  face: string;
  level_info?: { current_level: number };
}

export async function fetchSelfInfo(sessdata: string): Promise<BiliSelfInfo> {
  const json = await getJson<BiliSelfInfo>(
    "https://api.bilibili.com/x/web-interface/nav",
    sessdata,
  );
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message ?? "获取账号信息失败");
  }
  return json.data;
}

// ---------- 视频信息与播放地址 ----------

export interface BiliViewPage {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface BiliViewData {
  bvid: string;
  aid: number;
  title: string;
  duration: number;
  pages: BiliViewPage[];
}

export async function fetchView(
  bvid: string,
  sessdata?: string,
): Promise<BiliViewData> {
  const json = await getJson<BiliViewData>(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    sessdata,
  );
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message ?? "取视频信息失败");
  }
  return json.data;
}

export interface PlayStream {
  /** 直链（需带 Referer 才能取，因此走本站代理） */
  url: string;
  backupUrls: string[];
  mimeType: string;
  codecs: string;
  /** 清晰度编号，越大越清晰 */
  id: number;
  bandwidth: number;
}

export interface PlayInfo {
  /** 视频流（DASH，画音分离） */
  video: PlayStream[];
  audio: PlayStream[];
  /** 单文件 MP4（durl 模式，游客态常见） */
  progressive?: { url: string; backupUrls: string[] };
  durationSec: number;
  /** 各清晰度名称 */
  qualityNames: Record<number, string>;
}

interface DashStream {
  id: number;
  baseUrl: string;
  base_url?: string;
  backupUrl?: string[];
  backup_url?: string[];
  mimeType?: string;
  mime_type?: string;
  codecs: string;
  bandwidth: number;
}

interface PlayUrlData {
  dash?: { duration: number; video: DashStream[]; audio: DashStream[] };
  durl?: { url: string; backup_url?: string[]; length: number }[];
  timelength?: number;
  accept_quality?: number[];
  accept_description?: string[];
}

function toStream(s: DashStream): PlayStream {
  return {
    url: s.baseUrl ?? s.base_url ?? "",
    backupUrls: s.backupUrl ?? s.backup_url ?? [],
    mimeType: s.mimeType ?? s.mime_type ?? "video/mp4",
    codecs: s.codecs,
    id: s.id,
    bandwidth: s.bandwidth,
  };
}

/**
 * 取播放地址。fnval=4048 请求 DASH（含 4K/HDR），登录态才有高清晰度。
 * 没登录时 B 站只给 360P/480P——这正是绑定账号的价值。
 */
export async function fetchPlayUrl(
  bvid: string,
  cid: number,
  sessdata?: string,
): Promise<PlayInfo> {
  const json = await getJson<PlayUrlData>(
    `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&fnval=4048&fnver=0&fourk=1`,
    sessdata,
  );
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message ?? "取播放地址失败");
  }
  const data = json.data;
  const qualityNames: Record<number, string> = {};
  (data.accept_quality ?? []).forEach((q, i) => {
    qualityNames[q] = data.accept_description?.[i] ?? String(q);
  });

  if (data.dash) {
    return {
      video: data.dash.video.map(toStream),
      audio: data.dash.audio.map(toStream),
      durationSec: data.dash.duration,
      qualityNames,
    };
  }
  const first = data.durl?.[0];
  return {
    video: [],
    audio: [],
    progressive: first
      ? { url: first.url, backupUrls: first.backup_url ?? [] }
      : undefined,
    durationSec: Math.round((data.timelength ?? 0) / 1000),
    qualityNames,
  };
}

// ---------- 弹幕 ----------

export interface Danmaku {
  /** 出现时间（秒） */
  t: number;
  /** 1=滚动 4=底部 5=顶部 */
  mode: number;
  color: number;
  text: string;
}

/** 取 XML 弹幕并解析（老接口无需鉴权，够用且稳定） */
export async function fetchDanmaku(cid: number): Promise<Danmaku[]> {
  const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
    headers: biliHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const out: Danmaku[] = [];
  // <d p="时间,模式,字号,颜色,时间戳,池,用户,弹幕id">正文</d>
  const re = /<d p="([^"]+)"[^>]*>([\s\S]*?)<\/d>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const parts = m[1].split(",");
    const t = Number(parts[0]);
    const mode = Number(parts[1]);
    const color = Number(parts[3]);
    const text = m[2]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (!Number.isFinite(t) || !text) continue;
    out.push({ t, mode: Number.isFinite(mode) ? mode : 1, color, text });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
