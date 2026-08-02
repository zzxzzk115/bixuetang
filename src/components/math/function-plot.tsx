"use client";

import { useEffect, useRef, useState } from "react";

const W = 640;
const H = 380;
const SAMPLES = 512;

export function FunctionPlot({
  sampler,
  latex,
}: {
  sampler: (x: number) => number;
  latex: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [xMin, setXMin] = useState("-10");
  const [xMax, setXMax] = useState("10");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const x0 = parseFloat(xMin);
    const x1 = parseFloat(xMax);
    if (!Number.isFinite(x0) || !Number.isFinite(x1) || x0 >= x1) return;

    // 采样
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const x = x0 + ((x1 - x0) * i) / SAMPLES;
      xs.push(x);
      ys.push(sampler(x));
    }
    const finite = ys.filter((y) => Number.isFinite(y));
    if (finite.length === 0) return;
    let yLo = Math.min(...finite);
    let yHi = Math.max(...finite);
    if (yHi - yLo < 1e-9) {
      yLo -= 1;
      yHi += 1;
    }
    const pad = (yHi - yLo) * 0.08;
    yLo -= pad;
    yHi += pad;

    const px = (x: number) => ((x - x0) / (x1 - x0)) * W;
    const py = (y: number) => H - ((y - yLo) / (yHi - yLo)) * H;

    const css = getComputedStyle(document.documentElement);
    const color = (name: string, fallback: string) =>
      css.getPropertyValue(name).trim() || fallback;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color("--background", "#0b0e14");
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = color("--edge", "#252d44");
    ctx.lineWidth = 1;
    const gridStep = niceStep(x1 - x0);
    for (let gx = Math.ceil(x0 / gridStep) * gridStep; gx <= x1; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(px(gx), 0);
      ctx.lineTo(px(gx), H);
      ctx.stroke();
    }
    const gridStepY = niceStep(yHi - yLo);
    for (let gy = Math.ceil(yLo / gridStepY) * gridStepY; gy <= yHi; gy += gridStepY) {
      ctx.beginPath();
      ctx.moveTo(0, py(gy));
      ctx.lineTo(W, py(gy));
      ctx.stroke();
    }

    // 坐标轴
    ctx.strokeStyle = color("--muted", "#8b93a7");
    ctx.lineWidth = 1.5;
    if (yLo < 0 && yHi > 0) {
      ctx.beginPath();
      ctx.moveTo(0, py(0));
      ctx.lineTo(W, py(0));
      ctx.stroke();
    }
    if (x0 < 0 && x1 > 0) {
      ctx.beginPath();
      ctx.moveTo(px(0), 0);
      ctx.lineTo(px(0), H);
      ctx.stroke();
    }

    // 曲线（NaN/Inf 断开）
    ctx.strokeStyle = color("--gold", "#f5c542");
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= SAMPLES; i++) {
      const y = ys[i];
      if (!Number.isFinite(y)) {
        pen = false;
        continue;
      }
      const cx = px(xs[i]);
      const cy = py(y);
      if (cy < -H || cy > 2 * H) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(cx, cy);
      else ctx.moveTo(cx, cy);
      pen = true;
    }
    ctx.stroke();

    // 范围标注
    ctx.fillStyle = color("--muted", "#8b93a7");
    ctx.font = "11px monospace";
    ctx.fillText(`x∈[${x0}, ${x1}]  y∈[${yLo.toFixed(2)}, ${yHi.toFixed(2)}]`, 8, 14);
  }, [sampler, xMin, xMax]);

  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span>📈 函数图像</span>
        <span className="max-w-56 truncate font-mono">{latex}</span>
        <span className="ml-auto">x:</span>
        <input
          value={xMin}
          onChange={(e) => setXMin(e.target.value)}
          className="w-16 rounded border border-edge bg-background px-1.5 py-0.5 font-mono outline-none focus:border-gold"
        />
        <span>→</span>
        <input
          value={xMax}
          onChange={(e) => setXMax(e.target.value)}
          className="w-16 rounded border border-edge bg-background px-1.5 py-0.5 font-mono outline-none focus:border-gold"
        />
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="w-full rounded" />
    </div>
  );
}

function niceStep(range: number): number {
  const raw = range / 10;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}
