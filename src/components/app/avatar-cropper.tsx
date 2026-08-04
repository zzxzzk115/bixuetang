"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCcw, X, ZoomIn } from "lucide-react";

// 头像裁切：圆形取景框 + 拖拽平移 + 缩放。
//
// 桌面滚轮缩放、移动端双指捏合，两条路径都要走通——手机上传头像
// 是最常见的场景，不能只做鼠标。

/** 导出尺寸：够 2 倍屏显示，又不至于让上传体积失控 */
const OUTPUT = 512;

interface Transform {
  /** 缩放倍率，1 = 图片短边刚好铺满取景框 */
  scale: number;
  /** 相对取景框中心的偏移（取景框像素） */
  x: number;
  y: number;
}

export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [box, setBox] = useState(280);

  // 手势状态放 ref：这些每帧都在变，进 state 只会白白重渲染
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
      setT({ scale: 1, x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 取景框跟着容器宽度走，小屏也别溢出
  useEffect(() => {
    const onResize = () =>
      setBox(Math.max(200, Math.min(320, window.innerWidth - 96)));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** 把图按当前变换画进画布；size 是画布边长 */
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, size: number, tr: Transform) => {
      const img = imgRef.current;
      if (!img) return;
      // 基准：图片短边铺满取景框（cover），再乘用户缩放
      const base = size / Math.min(img.width, img.height);
      const s = base * tr.scale;
      const w = img.width * s;
      const h = img.height * s;
      const ratio = size / box;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(
        img,
        size / 2 - w / 2 + tr.x * ratio,
        size / 2 - h / 2 + tr.y * ratio,
        w,
        h,
      );
    },
    [box],
  );

  // 预览
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !ready) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = box * dpr;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    paint(ctx, size, t);
  }, [t, ready, box, paint]);

  const clamp = (v: number) => Math.max(1, Math.min(4, v));

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setT((prev) => ({
      ...prev,
      x: d.ox + (e.clientX - d.x),
      y: d.oy + (e.clientY - d.y),
    }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    setT((prev) => ({ ...prev, scale: clamp(prev.scale * (e.deltaY < 0 ? 1.1 : 0.9)) }));
  };

  // 双指捏合。用原生 touch 事件：pointer 事件要自己维护多指表，
  // 这里只需要两指距离，touches 数组现成的。
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    dragRef.current = null;
    const [a, b] = [e.touches[0], e.touches[1]];
    pinchRef.current = {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      scale: t.scale,
    };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const p = pinchRef.current;
    if (!p || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setT((prev) => ({ ...prev, scale: clamp((p.scale * dist) / p.dist) }));
  };
  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const confirm = () => {
    const out = document.createElement("canvas");
    out.width = OUTPUT;
    out.height = OUTPUT;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    paint(ctx, OUTPUT, t);
    // 存成 JPEG：头像不需要透明通道，同画质下比 PNG 小一个数量级
    out.toBlob((blob) => blob && onDone(blob), "image/jpeg", 0.9);
  };

  return (
    <div className="avatar-crop">
      <div
        className="avatar-crop-stage"
        style={{ width: box, height: box }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <canvas ref={canvasRef} style={{ width: box, height: box }} />
        {/* 圆形取景：遮罩画在图上面，纯装饰不吃事件 */}
        <span className="avatar-crop-mask" aria-hidden />
      </div>

      <label className="avatar-crop-zoom">
        <ZoomIn size={15} aria-hidden />
        <input
          type="range"
          min={100}
          max={400}
          value={Math.round(t.scale * 100)}
          onChange={(e) =>
            setT((prev) => ({ ...prev, scale: Number(e.target.value) / 100 }))
          }
        />
        <b>{Math.round(t.scale * 100)}%</b>
      </label>
      <p className="avatar-crop-tip">拖动调位置，滚轮或双指缩放</p>

      <div className="avatar-crop-actions">
        <button className="app-btn-primary" onClick={confirm} disabled={!ready}>
          <Check size={15} aria-hidden /> 用这张
        </button>
        <button
          className="app-btn-plain"
          onClick={() => setT({ scale: 1, x: 0, y: 0 })}
        >
          <RotateCcw size={15} aria-hidden /> 复位
        </button>
        <button className="app-btn-plain" onClick={onCancel}>
          <X size={15} aria-hidden /> 取消
        </button>
      </div>
    </div>
  );
}
