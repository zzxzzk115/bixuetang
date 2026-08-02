"use client";

import { useEffect, useRef } from "react";
import { hackKeyCode, KBD, SCREEN_BASE, SCREEN_H, SCREEN_W, SCREEN_WORDS } from "@/lib/hack/defs";
import type { HackMachine } from "@/lib/hack/cpu/machine";

// 512×256 单色屏：屏幕内存 → R8 纹理 → 全屏 triangle。
// Hack 语义：bit=1 为黑像素，白底。

const VS = `attribute vec2 p; varying vec2 uv;
void main(){ uv = p * 0.5 + 0.5; uv.y = 1.0 - uv.y; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `precision mediump float; varying vec2 uv; uniform sampler2D tex;
void main(){ float v = texture2D(tex, uv).r; gl_FragColor = vec4(vec3(1.0 - v), 1.0); }`;

interface GlState {
  gl: WebGLRenderingContext;
  pixels: Uint8Array;
}

function initGl(canvas: HTMLCanvasElement): GlState | null {
  const gl = canvas.getContext("webgl", { antialias: false });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.LUMINANCE, SCREEN_W, SCREEN_H, 0,
    gl.LUMINANCE, gl.UNSIGNED_BYTE, null,
  );

  return { gl, pixels: new Uint8Array(SCREEN_W * SCREEN_H) };
}

function upload(state: GlState, ram: Int16Array) {
  const { gl, pixels } = state;
  for (let w = 0; w < SCREEN_WORDS; w++) {
    const word = ram[SCREEN_BASE + w];
    const base = w * 16;
    for (let bit = 0; bit < 16; bit++) {
      pixels[base + bit] = (word >> bit) & 1 ? 255 : 0;
    }
  }
  gl.texSubImage2D(
    gl.TEXTURE_2D, 0, 0, 0, SCREEN_W, SCREEN_H,
    gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels,
  );
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function HackScreen({
  machineRef,
  seq,
}: {
  /** 模拟器可变状态经 ref 传递：只在 effect/事件回调中访问与修改 */
  machineRef: React.RefObject<HackMachine | null>;
  seq: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GlState | null>(null);

  useEffect(() => {
    if (canvasRef.current && !glRef.current) {
      glRef.current = initGl(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    const gl = glRef.current;
    const m = machineRef.current;
    if (!m || !gl) return;
    if (m.screenDirty) {
      m.screenDirty = false;
      upload(gl, m.ram);
    }
  }, [seq, machineRef]);

  const setKey = (code: number) => {
    const m = machineRef.current;
    if (m) m.ram[KBD] = code;
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={SCREEN_W}
        height={SCREEN_H}
        tabIndex={0}
        onKeyDown={(e) => {
          e.preventDefault();
          setKey(hackKeyCode(e));
        }}
        onKeyUp={(e) => {
          e.preventDefault();
          setKey(0);
        }}
        className="w-full max-w-[640px] cursor-crosshair rounded border-2 border-edge bg-white outline-none focus:border-gold"
        style={{ imageRendering: "pixelated", aspectRatio: "2 / 1" }}
      />
      <p className="mt-1 text-xs text-muted">
        点击屏幕获得焦点后，键盘输入写入 RAM[0x6000]
      </p>
    </div>
  );
}
