import "server-only";

// bilibili 开放接口薄封装（服务端专用）。
//
// 思路参考 wiliwili（https://github.com/xfangfang/wiliwili，GPL-3.0）：
// 用官方 TV/Web 端接口取播放地址与弹幕，自己渲染播放器，
// 从而拿到「看了多少、看到哪」这些学习进度信号。
// 凭据只在服务端使用，绝不下发到客户端。

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subtitleCache } from "@/lib/db/schema";
import { signWbi } from "./wbi";

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
 * 两边都读——bilibili 在不同环境下给的位置不一样，只认一边就会「确认了却登不上」。
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
  /** 封面图地址(分享卡用) */
  pic?: string;
  /** UP 主(搬运/官方账号的 credit 展示与关注入口) */
  owner?: { mid: number; name: string; face: string };
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
  /** MP4 durl streams, one per available quality. */
  video: PlayStream[];
  audio: PlayStream[];
  /** Best MP4 stream fallback. */
  progressive?: { url: string; backupUrls: string[] };
  durationSec: number;
  /** 各清晰度名称 */
  qualityNames: Record<number, string>;
}

interface PlayUrlData {
  durl?: { url: string; backup_url?: string[]; length: number }[];
  timelength?: number;
  quality?: number;
  accept_quality?: number[];
  accept_description?: string[];
}

/**
 * 取播放地址。
 *
 * **要单文件 MP4，不要 DASH。**
 *
 * DASH（fnval=4048）给的是画音分离的两路分片 MP4，头部只有一个几百字节的
 * moov（没有完整样本表），真实时长在 sidx 里。用 `<video src>` 直接播它，
 * 浏览器只能按已下载的分片推算时长——70 分钟的 CS50 会显示成 12 分钟；
 * 再加上画音两路各自缓冲、各自 seek、靠 JS 校正同步，大文件必然失步：
 * 表现就是没声音、播到中间卡死。要用 DASH 就得上 MSE 自己拼分片，
 * 那是 dash.js 那一整套东西。
 *
 * fnval=1 给的是音视频合一的完整 MP4，时长准确、Range 正常、只有一路流。
 * 代价是最高 720P（DASH 能到 1080P+），对学习视频完全够用——
 * 能正常播放比多几十万像素重要。
 *
 * 没登录时 bilibili 只给 360P/480P，绑定账号才有 720P。
 */
async function fetchMp4PlayUrl(
  bvid: string,
  cid: number,
  qn: number,
  sessdata?: string,
): Promise<PlayUrlData | null> {
  const json = await getJson<PlayUrlData>(
    `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&qn=${qn}&fnval=1&fnver=0`,
    sessdata,
  );
  if (json.code !== 0 || !json.data?.durl?.[0]) return null;
  return json.data;
}

export async function fetchPlayUrl(
  bvid: string,
  cid: number,
  sessdata?: string,
): Promise<PlayInfo> {
  const firstData = await fetchMp4PlayUrl(bvid, cid, 80, sessdata);
  if (!firstData) throw new Error("取播放地址失败");

  const qualityNames: Record<number, string> = {};
  (firstData.accept_quality ?? []).forEach((q, i) => {
    qualityNames[q] = firstData.accept_description?.[i] ?? String(q);
  });

  const requested = Array.from(
    new Set([...(firstData.accept_quality ?? []), firstData.quality ?? 80, 80, 64, 32, 16]),
  ).filter((q) => Number.isFinite(q) && q > 0);

  const streams = new Map<number, PlayStream>();
  const addStream = (data: PlayUrlData, requestedQn: number) => {
    const first = data.durl?.[0];
    if (!first) return;
    const id = data.quality ?? requestedQn;
    if (streams.has(id)) return;
    streams.set(id, {
      url: first.url,
      backupUrls: first.backup_url ?? [],
      mimeType: "video/mp4",
      codecs: "avc1",
      id,
      bandwidth: 0,
    });
  };

  addStream(firstData, firstData.quality ?? 80);
  for (const qn of requested) {
    if (streams.has(qn)) continue;
    try {
      const data =
        qn === (firstData.quality ?? 80)
          ? firstData
          : await fetchMp4PlayUrl(bvid, cid, qn, sessdata);
      if (data) addStream(data, qn);
    } catch {
      // Some advertised qualities are DASH-only or account-gated; skip them.
    }
  }

  const video = [...streams.values()].sort((a, b) => b.id - a.id);
  const best = video[0];
  return {
    video,
    audio: [],
    progressive: best ? { url: best.url, backupUrls: best.backupUrls } : undefined,
    durationSec: Math.round((firstData.timelength ?? 0) / 1000),
    qualityNames,
  };
}

// ---------- DASH（配合 MSE 播放器） ----------
//
// fnval=4048 给的是画音分离的分片 MP4（fMP4），响应里带每路流的
// segment_base 字节区间（moov 初始段 + sidx 索引段）——这正是合成
// SegmentBase 寻址 MPD 所需的全部信息。直接 <video src> 播分片流会
// 时长错乱（上面 fetchMp4PlayUrl 的注释有血泪史），但交给 dash.js
// 走 MSE/ManagedMediaSource 就是它的本职：1080P+、自适应码率、
// 换清晰度不丢进度。老设备（iOS <17.1）没有 MSE，仍走上面的 MP4 兜底。

export interface DashStream {
  /** 视频=清晰度编号(qn)，音频=音质编号（30216/30232/30280 等） */
  id: number;
  baseUrl: string;
  backupUrls: string[];
  bandwidth: number;
  mimeType: string;
  codecs: string;
  width?: number;
  height?: number;
  /** 形如 "30000/1001"，MPD 原样透传 */
  frameRate?: string;
  /** moov 初始段字节区间，形如 "0-991" */
  initRange?: string;
  /** sidx 索引段字节区间，形如 "992-5647" */
  indexRange?: string;
}

export interface DashPlayInfo {
  durationSec: number;
  video: DashStream[];
  audio: DashStream[];
  qualityNames: Record<number, string>;
}

/** bilibili 的 dash 字段有 snake_case / camelCase 两套写法，都要兜住 */
interface RawDashSegmentBase {
  initialization?: string;
  index_range?: string;
  Initialization?: string;
  indexRange?: string;
}

interface RawDashStream {
  id: number;
  base_url?: string;
  baseUrl?: string;
  backup_url?: string[];
  backupUrl?: string[];
  bandwidth?: number;
  mime_type?: string;
  mimeType?: string;
  codecs?: string;
  width?: number;
  height?: number;
  frame_rate?: string;
  frameRate?: string;
  segment_base?: RawDashSegmentBase;
  SegmentBase?: RawDashSegmentBase;
}

interface DashPlayUrlData {
  timelength?: number;
  accept_quality?: number[];
  accept_description?: string[];
  dash?: {
    duration?: number;
    video?: RawDashStream[];
    audio?: RawDashStream[];
  };
}

function toDashStream(raw: RawDashStream, fallbackMime: string): DashStream | null {
  const baseUrl = raw.base_url ?? raw.baseUrl;
  if (!baseUrl) return null;
  const seg = raw.segment_base ?? raw.SegmentBase;
  return {
    id: raw.id,
    baseUrl,
    backupUrls: raw.backup_url ?? raw.backupUrl ?? [],
    bandwidth: raw.bandwidth ?? 0,
    mimeType: raw.mime_type ?? raw.mimeType ?? fallbackMime,
    codecs: raw.codecs ?? "",
    width: raw.width,
    height: raw.height,
    frameRate: raw.frame_rate ?? raw.frameRate,
    initRange: seg?.initialization ?? seg?.Initialization,
    indexRange: seg?.index_range ?? seg?.indexRange,
  };
}

/** DASH 播放信息；接口没给 dash 数据时返回 null（由调用方降级到 MP4） */
export async function fetchDashPlayUrl(
  bvid: string,
  cid: number,
  sessdata?: string,
): Promise<DashPlayInfo | null> {
  const json = await getJson<DashPlayUrlData>(
    `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&qn=127&fnval=4048&fnver=0&fourk=1`,
    sessdata,
  );
  const dash = json.data?.dash;
  if (json.code !== 0 || !dash?.video?.length) return null;

  const qualityNames: Record<number, string> = {};
  (json.data?.accept_quality ?? []).forEach((q, i) => {
    qualityNames[q] = json.data?.accept_description?.[i] ?? String(q);
  });

  return {
    durationSec:
      dash.duration ?? Math.round((json.data?.timelength ?? 0) / 1000),
    video: (dash.video ?? [])
      .map((raw) => toDashStream(raw, "video/mp4"))
      .filter((s): s is DashStream => !!s),
    audio: (dash.audio ?? [])
      .map((raw) => toDashStream(raw, "audio/mp4"))
      .filter((s): s is DashStream => !!s),
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

/** 我与某 UP 主的关注状态。attribute:2/6 = 已关注(6 是互关) */
export async function fetchUpRelation(
  mid: number,
  sessdata: string,
): Promise<boolean> {
  const json = await getJson<{ attribute: number }>(
    `https://api.bilibili.com/x/relation?fid=${mid}`,
    sessdata,
  );
  const attr = json.data?.attribute ?? 0;
  return attr === 2 || attr === 6;
}

/** 关注/取关 UP 主(act 1=关注 2=取关) */
export async function modifyUpRelation(
  mid: number,
  follow: boolean,
  sessdata: string,
  csrf: string,
) {
  const json = await postForm(
    "https://api.bilibili.com/x/relation/modify",
    { fid: mid, act: follow ? 1 : 2, re_src: 11, csrf },
    sessdata,
    csrf,
  );
  // 22014 = 已经关注过
  if (json.code !== 0 && json.code !== 22014) {
    throw new Error(json.message ?? `操作失败（${json.code}）`);
  }
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

export interface FavFolder {
  id: number;
  title: string;
  mediaCount: number;
  /** 这个稿件是否已在该收藏夹里 */
  faved: boolean;
}

/**
 * 取我的收藏夹列表。带 rid/type 时每个收藏夹会附 fav_state，
 * 于是「哪些夹子已经收了这条」一次就拿到，不用逐个查。
 */
export async function fetchFavFolders(
  mid: string,
  aid: number,
  sessdata: string,
): Promise<FavFolder[]> {
  const json = await getJson<{
    list?: { id: number; title: string; media_count: number; fav_state: number }[];
  }>(
    `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${encodeURIComponent(mid)}&type=2&rid=${aid}`,
    sessdata,
  );
  return (json.data?.list ?? []).map((f) => ({
    id: f.id,
    title: f.title,
    mediaCount: f.media_count,
    faved: f.fav_state > 0,
  }));
}

/** 一次提交收藏夹变更：加入 addIds、移出 delIds */
export async function dealFavorite(
  aid: number,
  addIds: number[],
  delIds: number[],
  sessdata: string,
  csrf: string,
) {
  const body: Record<string, string | number> = { rid: aid, type: 2, csrf };
  if (addIds.length > 0) body.add_media_ids = addIds.join(",");
  if (delIds.length > 0) body.del_media_ids = delIds.join(",");
  const json = await postForm(
    "https://api.bilibili.com/x/v3/fav/resource/deal",
    body,
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
  /** bilibili AI 生成（lan 以 ai- 开头）——质量不稳定 */
  ai: boolean;
  /** 时间轴覆盖率明显不足，多半根本不是这一 P 的字幕 */
  suspect: boolean;
}

/** UP 主标的视频章节（进度条上的分段刻度） */
export interface ViewPoint {
  content: string;
  /** 起止秒 */
  from: number;
  to: number;
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
  /** 章节列表；没标章节的稿件不带这个字段 */
  view_points?: { type?: number; content?: string; from?: number; to?: number }[];
}

/**
 * 取字幕轨。bilibili 的字幕（含 AI 生成的）多数要登录态才给，
 * 所以这是「绑定账号」的又一处收益；游客态返回空数组。
 */
type RawSubtitle = NonNullable<
  NonNullable<PlayerV2Data["subtitle"]>["subtitles"]
>[number];

/** WBI 接口被风控拦过就别再浪费请求（进程内记一下，重启即重试） */
const wbiState = globalThis as unknown as { __biliWbiBlocked?: boolean };

/**
 * 取字幕轨列表。
 * 实测 bilibili 这个接口返回不稳定：同一个 cid 连查 4 次，3 次只给 AI 字幕轨，
 * 1 次才带上人工字幕轨。所以多试几次并按语言合并，拿到人工轨就收工。
 * （WBI 签名版接口在境外 IP 会被 412 拦截，失败后不再重试。）
 */
function parseViewPoints(data: PlayerV2Data | undefined): ViewPoint[] {
  return (data?.view_points ?? [])
    .filter(
      (p) =>
        !!p.content &&
        Number.isFinite(p.from) &&
        Number.isFinite(p.to) &&
        (p.to as number) > (p.from as number),
    )
    .map((p) => ({ content: p.content!, from: p.from!, to: p.to! }))
    .sort((a, b) => a.from - b.from);
}

async function collectSubtitleList(
  bvid: string,
  cid: number,
  sessdata?: string,
): Promise<{ subs: RawSubtitle[]; viewPoints: ViewPoint[] | null }> {
  const merged = new Map<string, RawSubtitle>();
  // null = 一次都没成功响应过（章节情况未知，别把「未知」缓存成「没有」）
  let viewPoints: ViewPoint[] | null = null;

  const urlOf = (item?: RawSubtitle) =>
    item ? item.subtitle_url || item.subtitle_url_v2 : "";
  const absorb = (data: PlayerV2Data | undefined) => {
    for (const item of data?.subtitle?.subtitles ?? []) {
      if (!item?.lan) continue;
      // 同一语言以「带得到正文地址」的那份为准——view 接口给的条目常常没有 url
      if (!merged.has(item.lan) || (!urlOf(merged.get(item.lan)) && urlOf(item))) {
        merged.set(item.lan, item);
      }
    }
    // 章节顺路收下（同一响应里就有，不必单独再打一次接口）
    const points = parseViewPoints(data);
    if (viewPoints === null || points.length > 0) viewPoints = points;
  };
  const hasHuman = () =>
    [...merged.keys()].some((lan) => !lan.startsWith("ai-"));

  // wiliwili 的做法：wbi/v2 + 只传 bvid 与 cid，别的参数一概不传。
  // （实测 WBI 签名与 buvid3 都不是字幕能否返回的门槛，有效的 SESSDATA 才是；
  //   签名版在境外 IP 会被 412 拦，所以拦过一次就直接走未签名版。）
  if (!wbiState.__biliWbiBlocked) {
    try {
      const query = await signWbi({ bvid, cid }, biliHeaders(sessdata));
      const json = await getJson<PlayerV2Data>(
        `https://api.bilibili.com/x/player/wbi/v2?${query}`,
        sessdata,
      );
      if (json.code === 0) absorb(json.data);
      else wbiState.__biliWbiBlocked = true;
    } catch {
      wbiState.__biliWbiBlocked = true;
    }
  }

  // 实测：连着问同一个 cid 会被降级——第 1 次给人工轨 zh-CN，第 2、3 次就只剩
  // ai-zh 了。所以重试要慢，快速重试只会把好结果问没。
  for (let attempt = 0; attempt < 2 && !hasHuman(); attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    try {
      const json = await getJson<PlayerV2Data>(
        `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`,
        sessdata,
      );
      absorb(json.data);
    } catch {
      // 单次失败无所谓，还有下一轮
    }
  }
  return { subs: [...merged.values()], viewPoints };
}

/**
 * 这个稿件到底有没有 UP 主上传的人工字幕。
 * view 接口的 subtitle.list 里人工轨是 type:0，但它**不给正文地址**
 * （subtitle_url 恒为空），所以只能用来判断「该有而没拿到」，
 * 不能直接当字幕源用。
 */
async function hasManualSubtitle(
  bvid: string,
  sessdata?: string,
): Promise<boolean> {
  try {
    const json = await getJson<{ subtitle?: { list?: RawSubtitle[] } }>(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
      sessdata,
    );
    return (json.data?.subtitle?.list ?? []).some(
      (item) => !!item.lan && !item.lan.startsWith("ai-"),
    );
  } catch {
    return false;
  }
}

/**
 * 字幕结果缓存。字幕内容不会变，而连续请求会被 bilibili 限流
 * （实测同一条 AI 轨连查三次分别返回 209/55/17 条，越查越少），
 * 所以取到一次好结果就存住。
 */
const subCache = globalThis as unknown as {
  __biliSubs?: Map<number, { tracks: SubtitleTrack[]; at: number }>;
};
/** 只抓到 AI 轨时的缓存时效：过期后再去碰运气找人工轨 */
const SUB_TTL = 30 * 60 * 1000;

/**
 * 读持久缓存。人工轨永不过期（字幕内容不会变，而重新去问反而可能问不到）；
 * 只有 AI 轨的结果按 SUB_TTL 过期，好让后续请求还有机会捞到人工轨。
 */
async function readSubCache(cid: number): Promise<SubtitleTrack[] | null> {
  try {
    const row = await db
      .select()
      .from(subtitleCache)
      .where(eq(subtitleCache.cid, cid))
      .get();
    if (!row) return null;
    if (!row.hasHuman && Date.now() - row.updatedAt > SUB_TTL) return null;
    return JSON.parse(row.tracksJson) as SubtitleTrack[];
  } catch {
    return null;
  }
}

async function writeSubCache(
  cid: number,
  bvid: string,
  tracks: SubtitleTrack[],
): Promise<void> {
  const hasHuman = tracks.some((t) => !t.ai);
  try {
    const existing = await db
      .select({ hasHuman: subtitleCache.hasHuman })
      .from(subtitleCache)
      .where(eq(subtitleCache.cid, cid))
      .get();
    // 别用「这次只捞到 AI 轨」的结果覆盖掉之前存好的人工轨
    if (existing?.hasHuman && !hasHuman) return;
    await db
      .insert(subtitleCache)
      .values({
        cid,
        bvid,
        tracksJson: JSON.stringify(tracks),
        hasHuman: hasHuman ? 1 : 0,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: subtitleCache.cid,
        set: {
          bvid,
          tracksJson: JSON.stringify(tracks),
          hasHuman: hasHuman ? 1 : 0,
          updatedAt: Date.now(),
        },
      });
  } catch {
    // 缓存写失败不影响播放
  }
}

// ---------- 视频章节（view_points） ----------

async function readViewPointsCache(cid: number): Promise<ViewPoint[] | null> {
  try {
    const row = await db
      .select({ viewPointsJson: subtitleCache.viewPointsJson })
      .from(subtitleCache)
      .where(eq(subtitleCache.cid, cid))
      .get();
    if (!row || row.viewPointsJson == null) return null;
    return JSON.parse(row.viewPointsJson) as ViewPoint[];
  } catch {
    return null;
  }
}

/**
 * 写章节缓存。行不存在时以「空字幕、立即过期」的占位行落地——
 * updatedAt=0 保证字幕链路仍会去抓真字幕，不受占位行影响。
 */
async function writeViewPointsCache(
  cid: number,
  bvid: string,
  points: ViewPoint[],
): Promise<void> {
  try {
    await db
      .insert(subtitleCache)
      .values({
        cid,
        bvid,
        tracksJson: "[]",
        hasHuman: 0,
        updatedAt: 0,
        viewPointsJson: JSON.stringify(points),
      })
      .onConflictDoUpdate({
        target: subtitleCache.cid,
        set: { viewPointsJson: JSON.stringify(points) },
      });
  } catch {
    // 缓存写失败不影响播放
  }
}

/**
 * 取视频章节。优先读永久缓存（字幕链路顺路存过就零请求）；
 * 缓存未命中时打一次未签名 player/v2——只多这一次，之后永久命中。
 */
export async function fetchViewPoints(
  bvid: string,
  cid: number,
  sessdata?: string,
): Promise<ViewPoint[]> {
  const cached = await readViewPointsCache(cid);
  if (cached) return cached;
  try {
    const json = await getJson<PlayerV2Data>(
      `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`,
      sessdata,
    );
    if (json.code !== 0) return [];
    const points = parseViewPoints(json.data);
    await writeViewPointsCache(cid, bvid, points);
    return points;
  } catch {
    return [];
  }
}

export async function fetchSubtitles(
  bvid: string,
  cid: number,
  sessdata?: string,
  /** 该 P 的时长，用来判断字幕时间轴是否对得上 */
  durationSec?: number,
): Promise<SubtitleTrack[]> {
  if (!subCache.__biliSubs) subCache.__biliSubs = new Map();
  const cached = subCache.__biliSubs.get(cid);
  if (cached && Date.now() - cached.at < SUB_TTL && cached.tracks.length > 0) {
    return cached.tracks;
  }
  const persisted = await readSubCache(cid);
  if (persisted && persisted.length > 0) {
    subCache.__biliSubs.set(cid, { tracks: persisted, at: Date.now() });
    return persisted;
  }

  const { subs: list, viewPoints } = await collectSubtitleList(
    bvid,
    cid,
    sessdata,
  );
  // 章节顺路持久化。空结果只在「从没查到过」时落地——
  // 防止接口偶发漏掉 view_points 时把存好的章节冲成空。
  if (
    viewPoints !== null &&
    (viewPoints.length > 0 || (await readViewPointsCache(cid)) === null)
  ) {
    await writeViewPointsCache(cid, bvid, viewPoints);
  }
  const tracks: SubtitleTrack[] = [];
  for (const item of list.slice(0, 4)) {
    // wiliwili 只读 subtitle_url；v2 字段是后加的，两个都兜住
    const raw = item.subtitle_url || item.subtitle_url_v2;
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
      const cues = (body.body ?? [])
        .map((c) => ({ from: c.from, to: c.to, text: c.content }))
        // bilibili 偶尔给乱序数据；排好序前端才能按时间二分
        .sort((a, b) => a.from - b.from);
      if (cues.length === 0) continue;

      // 覆盖率体检：实测遇到过 bilibili 把别的视频的 AI 字幕挂到本片 cid 上，
      // 时间轴只盖住不到一半，正文也文不对题。标出来别让用户以为是我们错了。
      const lastTo = cues[cues.length - 1].to;
      const suspect =
        !!durationSec && durationSec > 60 && lastTo < durationSec * 0.6;

      tracks.push({
        lan: item.lan,
        lanDoc: item.lan_doc,
        cues,
        ai: item.lan.startsWith("ai-"),
        suspect,
      });
    } catch {
      // 单条字幕拉不到就跳过
    }
  }
  // 人工字幕优先于 AI 字幕，可疑的排最后
  const sorted = tracks.sort(
    (a, b) => Number(a.ai) - Number(b.ai) || Number(a.suspect) - Number(b.suspect),
  );
  if (sorted.length === 0) return sorted;

  // 只捞到 AI 轨时，先问一句这稿件本来有没有人工字幕：有的话说明是被降级了，
  // 这份结果不该缓存（哪怕短期），否则半小时内都只能看错乱的 AI 字幕。
  const aiOnly = sorted.every((t) => t.ai);
  if (aiOnly && (await hasManualSubtitle(bvid, sessdata))) {
    return sorted;
  }

  subCache.__biliSubs!.set(cid, { tracks: sorted, at: Date.now() });
  await writeSubCache(cid, bvid, sorted);
  return sorted;
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
