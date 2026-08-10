"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, NotebookPen, Pencil, Trash2 } from "lucide-react";
import { fmtTime } from "@/lib/format/time";
import {
  addVideoNote,
  deleteVideoNote,
  listVideoNotes,
  updateVideoNote,
  type VideoNoteDto,
} from "@/lib/game/notes-actions";
import { renderMarkdown } from "@/lib/markdown";
import { NOTES_CHANGED_EVENT } from "@/lib/notes-events";
import { seekTo } from "@/lib/seek";
import { MarkdownEditor } from "./markdown-editor";

// 视频笔记面板(评论区右侧/下方):按时间戳记 Markdown 笔记。
// 点时间戳 → 播放器跳到那一秒(跨集会先切集);播放器全屏速记层
// 存的笔记通过 NOTES_CHANGED_EVENT 同步进来。

export function VideoNotes({
  courseId,
  episodeN,
  getCurrentTime,
  onStartCompose,
}: {
  courseId: string;
  episodeN: number;
  /** 从播放器取当前秒(记新笔记的时间戳) */
  getCurrentTime: () => number;
  /** 开始输入笔记时回调(播放器自动暂停) */
  onStartCompose?: () => void;
}) {
  const [notes, setNotes] = useState<VideoNoteDto[] | null>(null);
  const [draft, setDraft] = useState("");
  const [draftAt, setDraftAt] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editPreview, setEditPreview] = useState(false);
  /** 默认只看本集,可切整门课 */
  const [scope, setScope] = useState<"episode" | "course">("episode");

  const reload = useCallback(() => {
    listVideoNotes(courseId).then(setNotes);
  }, [courseId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 播放器全屏速记层存了新笔记 → 同步刷新
  useEffect(() => {
    const onChanged = () => reload();
    window.addEventListener(NOTES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, onChanged);
  }, [reload]);

  const visible = useMemo(() => {
    if (!notes) return [];
    return scope === "episode"
      ? notes.filter((n) => n.episodeN === episodeN)
      : notes;
  }, [notes, scope, episodeN]);

  const grabTime = () => setDraftAt(Math.floor(getCurrentTime()));

  const save = async () => {
    if (busy || !draft.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const at = draftAt ?? Math.floor(getCurrentTime());
      const r = await addVideoNote(courseId, episodeN, at, draft);
      if (!r.ok) {
        setMsg(r.error ?? "没存上,再试一次");
        return;
      }
      setDraft("");
      setDraftAt(null);
      setPreview(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: number) => {
    if (busy || !editDraft.trim()) return;
    setBusy(true);
    try {
      const r = await updateVideoNote(id, editDraft);
      if (r.ok) {
        setEditingId(null);
        reload();
      } else {
        setMsg(r.error ?? "没存上");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteVideoNote(id);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="video-notes">
      <div className="video-notes-head">
        <b>
          <NotebookPen size={17} aria-hidden /> 我的笔记
        </b>
        <div className="video-notes-scope">
          <button
            className={scope === "episode" ? "on" : undefined}
            onClick={() => setScope("episode")}
          >
            本集
          </button>
          <button
            className={scope === "course" ? "on" : undefined}
            onClick={() => setScope("course")}
          >
            整门课
          </button>
        </div>
      </div>

      <div className="video-notes-compose">
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          preview={preview}
          onTogglePreview={() => setPreview((v) => !v)}
          onFocus={() => {
            // 开始写笔记就暂停视频,同时把时间戳锚在暂停的这一刻
            onStartCompose?.();
            if (draftAt === null) {
              setDraftAt(Math.floor(getCurrentTime()));
            }
          }}
          placeholder="记点什么…支持 Markdown:**重点**、`代码`、- 列表、> 引用"
          rows={3}
          toolbarExtra={
            <button
              className="video-notes-time"
              onClick={grabTime}
              title="点击取播放器当前时间"
            >
              {draftAt === null ? "@ 取当前时间" : `@ ${fmtTime(draftAt)}`}
            </button>
          }
        />
        {msg && <p className="video-notes-msg">{msg}</p>}
        <button
          className="app-btn-primary"
          onClick={save}
          disabled={busy || !draft.trim()}
        >
          {busy ? (
            <>
              <Loader2 size={15} className="spin" aria-hidden /> 保存中…
            </>
          ) : (
            "保存笔记"
          )}
        </button>
      </div>

      {notes === null ? (
        <p className="video-notes-empty">
          <Loader2 size={15} className="spin" aria-hidden /> 加载中…
        </p>
      ) : visible.length === 0 ? (
        <p className="video-notes-empty">
          还没有笔记。看到重点就顺手记一条,时间戳会帮你标好位置;
          全屏时按 b 或点 ✎ 也能记。
        </p>
      ) : (
        <ul className="video-notes-list">
          {visible.map((n) => (
            <li key={n.id}>
              <div className="video-notes-item-bar">
                <button
                  className="video-notes-time"
                  onClick={() =>
                    seekTo({ page: n.episodeN, seconds: n.tSec })
                  }
                  title="跳到这个时间点"
                >
                  {scope === "course" ? `第 ${n.episodeN} 集 · ` : ""}
                  {fmtTime(n.tSec)}
                </button>
                <span className="video-notes-actions">
                  <button
                    onClick={() => {
                      setEditingId(n.id);
                      setEditDraft(n.contentMd);
                      setEditPreview(false);
                    }}
                    aria-label="编辑"
                    title="编辑"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    onClick={() => remove(n.id)}
                    aria-label="删除"
                    title="删除"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </span>
              </div>
              {editingId === n.id ? (
                <div className="video-notes-edit">
                  <MarkdownEditor
                    value={editDraft}
                    onChange={setEditDraft}
                    preview={editPreview}
                    onTogglePreview={() => setEditPreview((v) => !v)}
                    onFocus={() => onStartCompose?.()}
                    rows={3}
                  />
                  <div className="video-notes-edit-actions">
                    <button
                      className="app-btn-plain"
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </button>
                    <button
                      className="app-btn-primary"
                      onClick={() => saveEdit(n.id)}
                      disabled={busy || !editDraft.trim()}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="video-notes-md"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(n.contentMd),
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
