// 内置 demo 程序（全部自研，避开官方课程软件版权）


export interface HackDemo {
  id: string;
  title: string;
  kind: "asm" | "jack";
  description: string;
  files: { name: string; source: string }[];
}

const FILL_ASM = `// fill.asm — 按住任意键全屏涂黑，松开清屏
// 经典练习的自研实现：轮询键盘，整屏写 -1 或 0

(POLL)
  @KBD
  D=M
  @BLACK
  D;JNE
  // 无按键 → 填 0
  @color
  M=0
  @DRAW
  0;JMP
(BLACK)
  @color
  M=-1
(DRAW)
  // for (i = 8191; i >= 0; i--) screen[i] = color
  @8191
  D=A
  @i
  M=D
(LOOP)
  @i
  D=M
  @POLL
  D;JLT        // 画完回去继续轮询
  @SCREEN
  D=D+A        // 目标地址 = SCREEN + i
  @ptr
  M=D
  @color
  D=M
  @ptr
  A=M
  M=D
  @i
  M=M-1
  @LOOP
  0;JMP
`;

const RECT_ASM = `// rect.asm — 在屏幕左上画一个 32×64 像素的实心矩形
// R0 可改行数（默认 64）

  @64
  D=A
  @R0
  M=D          // 行数
  @SCREEN
  D=A
  @addr
  M=D
(ROW)
  @R0
  D=M
  @END
  D;JLE
  // 本行涂黑 2 个 word（32 像素）
  @addr
  A=M
  M=-1
  @addr
  A=M+1
  M=-1
  // 下一行：地址 +32
  @32
  D=A
  @addr
  M=M+D
  @R0
  M=M-1
  @ROW
  0;JMP
(END)
  @END
  0;JMP
`;

const BOUNCE_JACK = `// Bounce.jack — 一颗小球在屏幕内反弹（按 ESC 退出）
class Main {
  function void main() {
    var int x, y, dx, dy, size;
    let x = 100;
    let y = 60;
    let dx = 3;
    let dy = 2;
    let size = 6;
    while (~(Keyboard.keyPressed() = 140)) {
      // 擦除
      do Screen.setColor(false);
      do Screen.drawRectangle(x, y, x + size, y + size);
      // 移动与反弹
      let x = x + dx;
      let y = y + dy;
      if ((x < 1) | (x > (505 - size))) { let dx = -dx; }
      if ((y < 1) | (y > (249 - size))) { let dy = -dy; }
      // 重绘
      do Screen.setColor(true);
      do Screen.drawRectangle(x, y, x + size, y + size);
      do Sys.wait(10);
    }
    return;
  }
}
`;

const PADDLE_JACK = `// Paddle.jack — 简化弹球：左右方向键移动挡板，接住小球
class Main {
  function void main() {
    var int px, bx, by, dx, dy, key, score;
    let px = 220;      // 挡板左端 x
    let bx = 250;
    let by = 30;
    let dx = 4;
    let dy = 3;
    let score = 0;
    while (true) {
      let key = Keyboard.keyPressed();
      if (key = 140) { return; }                 // ESC 退出
      // 挡板
      do Screen.setColor(false);
      do Screen.drawRectangle(px, 240, px + 70, 246);
      if (key = 130) { if (px > 8) { let px = px - 8; } }        // ←
      if (key = 132) { if (px < 434) { let px = px + 8; } }      // →
      do Screen.setColor(true);
      do Screen.drawRectangle(px, 240, px + 70, 246);
      // 球
      do Screen.setColor(false);
      do Screen.drawCircle(bx, by, 4);
      let bx = bx + dx;
      let by = by + dy;
      if ((bx < 5) | (bx > 506)) { let dx = -dx; }
      if (by < 5) { let dy = -dy; }
      // 挡板碰撞
      if (by > 234) {
        if ((bx > (px - 4)) & (bx < (px + 74))) {
          let dy = -dy;
          let score = score + 1;
        } else {
          if (by > 250) {          // 落底重置
            let bx = 250;
            let by = 30;
            let score = 0;
          }
        }
      }
      do Screen.setColor(true);
      do Screen.drawCircle(bx, by, 4);
      // 记分
      do Output.moveCursor(0, 0);
      do Output.printString("SCORE ");
      do Output.printInt(score);
      do Sys.wait(12);
    }
    return;
  }
}
`;

const DRAW_JACK = `// Draw.jack — 方向键移动画笔画点，空格清屏（ESC 退出）
class Main {
  function void main() {
    var int x, y, key;
    let x = 256;
    let y = 128;
    do Screen.setColor(true);
    while (~(key = 140)) {
      let key = Keyboard.keyPressed();
      if (key = 130) { if (x > 0) { let x = x - 2; } }
      if (key = 132) { if (x < 511) { let x = x + 2; } }
      if (key = 131) { if (y > 0) { let y = y - 2; } }
      if (key = 133) { if (y < 255) { let y = y + 2; } }
      if (key = 32) { do Screen.clearScreen(); }
      do Screen.drawPixel(x, y);
      do Sys.wait(8);
    }
    return;
  }
}
`;

export const HACK_DEMOS: HackDemo[] = [
  {
    id: "fill",
    title: "fill.asm · 按键涂屏",
    kind: "asm",
    description: "按住任意键全屏涂黑，松开清屏——第一个要跑通的经典练习",
    files: [{ name: "fill.asm", source: FILL_ASM }],
  },
  {
    id: "rect",
    title: "rect.asm · 画矩形",
    kind: "asm",
    description: "直接写屏幕内存画一个实心矩形",
    files: [{ name: "rect.asm", source: RECT_ASM }],
  },
  {
    id: "bounce",
    title: "Bounce.jack · 弹球",
    kind: "jack",
    description: "Jack 语言：小球反弹（ESC 退出）",
    files: [{ name: "Main.jack", source: BOUNCE_JACK }],
  },
  {
    id: "paddle",
    title: "Paddle.jack · 接球游戏",
    kind: "jack",
    description: "方向键移动挡板接球，Pong 级 demo（ESC 退出）",
    files: [{ name: "Main.jack", source: PADDLE_JACK }],
  },
  {
    id: "draw",
    title: "Draw.jack · 画板",
    kind: "jack",
    description: "方向键移动画笔，空格清屏",
    files: [{ name: "Main.jack", source: DRAW_JACK }],
  },
];
