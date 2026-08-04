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

/** 扫码登录相关请求要带 passport 的 Referer，否则部分环境会被判成异常来源 */
function passportHeaders(buvid?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: "https://passport.bilibili.com/login",
    Origin: "https://passport.bilibili.com",
  };
  if (buvid) headers.Cookie = `buvid3=${buvid}`;
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

export async function qrGenerate(buvid?: string): Promise<QrGenerate> {
  const res = await fetch(
    "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
    { headers: passportHeaders(buvid), cache: "no-store" },
  );
  const json = (await res.json()) as {
    code: number;
    message?: string;
    data?: QrGenerate;
  };
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message ?? `二维码申请失败（code=${json.code}）`);
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
  /** 非预期状态时回传原始码，便于定位（UI 会显示出来） */
  rawCode?: number;
  rawMessage?: string;
}

/** 从 Set-Cookie 头里挑出某个 cookie 的值 */
function cookieValue(setCookies: string[], name: string): string | undefined {
  for (const line of setCookies) {
    const match = line.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return undefined;
}

/**
 * 轮询扫码结果。
 * 凭据有两条来路：跳转 URL 的 query，以及响应的 Set-Cookie。
 * 两边都读——B 站在不同环境下给的位置不一样，只认一边就会「确认了却登不上」。
 */
export async function qrPoll(
  qrcodeKey: string,
  buvid?: string,
): Promise<QrPollResult> {
  const res = await fetch(
    `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
    { headers: passportHeaders(buvid), cache: "no-store" },
  );
  const json = (await res.json()) as {
    code: number;
    message?: string;
    data?: QrPollData;
  };
  // 外层非 0（如 -412 风控）直接把码带回去，别装作「等待扫码」
  if (json.code !== 0) {
    return {
      status: "pending",
      rawCode: json.code,
      rawMessage: json.message,
    };
  }
  const data = json.data;
  if (!data) return { status: "pending" };

  if (data.code === 86038) return { status: "expired" };
  if (data.code === 86090) return { status: "scanned" };
  if (data.code === 86101) return { status: "pending" };
  if (data.code !== 0) {
    return { status: "pending", rawCode: data.code, rawMessage: data.message };
  }

  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);

  let sessdata = cookieValue(setCookies, "SESSDATA");
  let biliJct = cookieValue(setCookies, "bili_jct");
  let mid = cookieValue(setCookies, "DedeUserID");

  if (data.url) {
    try {
      const url = new URL(data.url);
      sessdata = sessdata ?? url.searchParams.get("SESSDATA") ?? undefined;
      biliJct = biliJct ?? url.searchParams.get("bili_jct") ?? undefined;
      mid = mid ?? url.searchParams.get("DedeUserID") ?? undefined;
    } catch {
      // url 不是合法地址就只靠 cookie
    }
  }

  if (!sessdata || !mid) {
    return {
      status: "pending",
      rawCode: data.code,
      rawMessage: "已确认登录，但没能取到凭据（接口返回格式可能变了）",
    };
  }
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

// ---------- 互动（点赞 / 投币 / 收藏 / 评论） ----------

function formHeaders(sessdata: string, csrf: string): Record<string, string> {
  return {
    "User-Agent": UA,
    Referer: "https://www.bilibili.com",
    Origin: "https://www.bilibili.com",
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: `SESSDATA=${sessdata}; bili_jct=${csrf}`,
  };
}

async function postForm<T>(
  url: string,
  body: Record<string, string | number>,
  sessdata: string,
  csrf: string,
): Promise<{ code: number; message?: string; data?: T }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) params.set(k, String(v));
  const res = await fetch(url, {
    method: "POST",
    headers: formHeaders(sessdata, csrf),
    body: params.toString(),
    cache: "no-store",
  });
  return (await res.json()) as { code: number; message?: string; data?: T };
}

export interface VideoRelation {
  like: boolean;
  coin: number;
  favorite: boolean;
}

/** 我对这个稿件的互动状态（未登录全 false） */
export async function fetchRelation(
  bvid: string,
  sessdata?: string,
): Promise<VideoRelation> {
  if (!sessdata) return { like: false, coin: 0, favorite: false };
  const json = await getJson<{
    like: boolean;
    coin: number;
    favorite: boolean;
  }>(
    `https://api.bilibili.com/x/web-interface/archive/relation?bvid=${encodeURIComponent(bvid)}`,
    sessdata,
  );
  return {
    like: !!json.data?.like,
    coin: json.data?.coin ?? 0,
    favorite: !!json.data?.favorite,
  };
}

export interface VideoStat {
  view: number;
  like: number;
  coin: number;
  favorite: number;
  reply: number;
}

export async function fetchStat(bvid: string): Promise<VideoStat | null> {
  const json = await getJson<VideoStat>(
    `https://api.bilibili.com/x/web-interface/archive/stat?bvid=${encodeURIComponent(bvid)}`,
  );
  return json.data ?? null;
}

export async function likeVideo(
  bvid: string,
  like: boolean,
  sessdata: string,
  csrf: string,
) {
  const json = await postForm(
    "https://api.bilibili.com/x/web-interface/archive/like",
    { bvid, like: like ? 1 : 2, csrf },
    sessdata,
    csrf,
  );
  // 65006 = 已经点过赞
  if (json.code !== 0 && json.code !== 65006) {
    throw new Error(json.message ?? `点赞失败（${json.code}）`);
  }
}

export async function coinVideo(
  bvid: string,
  multiply: number,
  sessdata: string,
  csrf: string,
) {
  const json = await postForm(
    "https://api.bilibili.com/x/web-interface/coin/add",
    { bvid, multiply, select_like: 0, csrf },
    sessdata,
    csrf,
  );
  if (json.code !== 0) {
    throw new Error(json.message ?? `投币失败（${json.code}）`);
  }
}

/** 取默认收藏夹 id（收藏接口要指定收藏夹） */
export async function defaultFavFolder(
  mid: string,
  sessdata: string,
): Promise<number | null> {
  const json = await getJson<{ list?: { id: number }[] }>(
    `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${encodeURIComponent(mid)}`,
    sessdata,
  );
  return json.data?.list?.[0]?.id ?? null;
}

export async function favVideo(
  aid: number,
  folderId: number,
  add: boolean,
  sessdata: string,
  csrf: string,
) {
  const json = await postForm(
    "https://api.bilibili.com/x/v3/fav/resource/deal",
    {
      rid: aid,
      type: 2,
      [add ? "add_media_ids" : "del_media_ids"]: folderId,
      csrf,
    },
    sessdata,
    csrf,
  );
  if (json.code !== 0) {
    throw new Error(json.message ?? `收藏失败（${json.code}）`);
  }
}

export interface ReplyItem {
  id: string;
  uname: string;
  avatar: string;
  message: string;
  like: number;
  time: number;
}

interface RawReply {
  rpid_str: string;
  like: number;
  ctime: number;
  member: { uname: string; avatar: string };
  content: { message: string };
}

export async function fetchReplies(
  aid: number,
  sessdata?: string,
): Promise<ReplyItem[]> {
  const json = await getJson<{ replies?: RawReply[] }>(
    `https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=1&ps=20&pn=1`,
    sessdata,
  );
  return (json.data?.replies ?? []).map((r) => ({
    id: r.rpid_str,
    uname: r.member.uname,
    avatar: r.member.avatar,
    message: r.content.message,
    like: r.like,
    time: r.ctime,
  }));
}

export async function postReply(
  aid: number,
  message: string,
  sessdata: string,
  csrf: string,
) {
  const json = await postForm(
    "https://api.bilibili.com/x/v2/reply/add",
    { type: 1, oid: aid, message, plat: 1, csrf },
    sessdata,
    csrf,
  );
  if (json.code !== 0) {
    throw new Error(json.message ?? `发送失败（${json.code}）`);
  }
}

// ---------- 字幕（CC） ----------

export interface SubtitleCue {
  from: number;
  to: number;
  text: string;
}

export interface SubtitleTrack {
  lan: string;
  lanDoc: string;
  cues: SubtitleCue[];
}

interface PlayerV2Data {
  subtitle?: {
    subtitles?: {
      lan: string;
      lan_doc: string;
      subtitle_url?: string;
      subtitle_url_v2?: string;
    }[];
  };
}

/**
 * 取字幕轨。B 站的字幕（含 AI 生成的）多数要登录态才给，
 * 所以这是「绑定账号」的又一处收益；游客态返回空数组。
 */
export async function fetchSubtitles(
  bvid: string,
  cid: number,
  sessdata?: string,
): Promise<SubtitleTrack[]> {
  const json = await getJson<PlayerV2Data>(
    `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`,
    sessdata,
  );
  const list = json.data?.subtitle?.subtitles ?? [];
  const tracks: SubtitleTrack[] = [];
  for (const item of list.slice(0, 4)) {
    const raw = item.subtitle_url_v2 || item.subtitle_url;
    if (!raw) continue;
    // 接口给的是协议相对地址
    const url = raw.startsWith("//") ? `https:${raw}` : raw;
    try {
      const res = await fetch(url, {
        headers: biliHeaders(sessdata),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const body = (await res.json()) as {
        body?: { from: number; to: number; content: string }[];
      };
      const cues = (body.body ?? []).map((c) => ({
        from: c.from,
        to: c.to,
        text: c.content,
      }));
      if (cues.length > 0) {
        tracks.push({ lan: item.lan, lanDoc: item.lan_doc, cues });
      }
    } catch {
      // 单条字幕拉不到就跳过
    }
  }
  return tracks;
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
