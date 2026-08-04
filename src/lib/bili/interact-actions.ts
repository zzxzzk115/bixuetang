"use server";

import { eq } from "drizzle-orm";
import { getCurrentUser } from "../auth/session";
import { db } from "../db/client";
import { biliAccounts } from "../db/schema";
import {
  coinVideo,
  defaultFavFolder,
  favVideo,
  fetchRelation,
  fetchReplies,
  fetchStat,
  likeVideo,
  postReply,
  type ReplyItem,
  type VideoRelation,
  type VideoStat,
} from "./api";

// 点赞 / 投币 / 收藏 / 评论：都是用户本人账号的显式操作，
// 每次调用只作用于当前这一个稿件，不做任何批量。

interface Creds {
  sessdata: string;
  csrf: string;
  mid: string;
}

async function creds(): Promise<Creds | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const row = db
    .select()
    .from(biliAccounts)
    .where(eq(biliAccounts.userId, user.id))
    .get();
  if (!row?.sessdata || !row.biliJct) return null;
  return { sessdata: row.sessdata, csrf: row.biliJct, mid: row.mid };
}

export interface InteractState {
  bound: boolean;
  relation?: VideoRelation;
  stat?: VideoStat | null;
}

export async function getInteractState(bvid: string): Promise<InteractState> {
  const c = await creds();
  const stat = await fetchStat(bvid).catch(() => null);
  if (!c) return { bound: false, stat };
  const relation = await fetchRelation(bvid, c.sessdata).catch(() => undefined);
  return { bound: true, relation, stat };
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  relation?: VideoRelation;
}

export async function toggleLike(
  bvid: string,
  like: boolean,
): Promise<ActionResult> {
  const c = await creds();
  if (!c) return { ok: false, error: "请先绑定 B 站账号" };
  try {
    await likeVideo(bvid, like, c.sessdata, c.csrf);
    return { ok: true, relation: await fetchRelation(bvid, c.sessdata) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "点赞失败",
    };
  }
}

export async function addCoin(
  bvid: string,
  multiply: number,
): Promise<ActionResult> {
  const c = await creds();
  if (!c) return { ok: false, error: "请先绑定 B 站账号" };
  if (multiply !== 1 && multiply !== 2) {
    return { ok: false, error: "只能投 1 或 2 个币" };
  }
  try {
    await coinVideo(bvid, multiply, c.sessdata, c.csrf);
    return { ok: true, relation: await fetchRelation(bvid, c.sessdata) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "投币失败",
    };
  }
}

export async function toggleFavorite(
  bvid: string,
  aid: number,
  add: boolean,
): Promise<ActionResult> {
  const c = await creds();
  if (!c) return { ok: false, error: "请先绑定 B 站账号" };
  try {
    const folder = await defaultFavFolder(c.mid, c.sessdata);
    if (!folder) return { ok: false, error: "没找到收藏夹" };
    await favVideo(aid, folder, add, c.sessdata, c.csrf);
    return { ok: true, relation: await fetchRelation(bvid, c.sessdata) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "收藏失败",
    };
  }
}

export async function loadReplies(aid: number): Promise<ReplyItem[]> {
  const c = await creds();
  try {
    return await fetchReplies(aid, c?.sessdata);
  } catch {
    return [];
  }
}

export async function sendReply(
  aid: number,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const c = await creds();
  if (!c) return { ok: false, error: "请先绑定 B 站账号" };
  const text = message.trim();
  if (!text) return { ok: false, error: "评论不能为空" };
  if (text.length > 500) return { ok: false, error: "评论太长了" };
  try {
    await postReply(aid, text, c.sessdata, c.csrf);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "发送失败",
    };
  }
}
