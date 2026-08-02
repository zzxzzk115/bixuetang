// 纯血模式的 Jack OS：用 Jack 语言自己实现的操作系统类库（对应 nand2tetris Project 12）。
// 开启后这些源码会和用户代码一起编译，OS 调用不再走 TS trap，
// 而是真正跑在模拟 CPU 上——包括软件实现的乘除法。
//
// 代价：Hack 没有乘除指令，Math.multiply 一次要几百条指令，
// 图形密集的程序会明显变慢。这正是这门课想让人体会到的东西。

export const JACK_OS_FILES: { name: string; source: string }[] = [
  {
    name: "Math.jack",
    source: `// 位运算实现的乘除法——Hack CPU 没有乘除指令
class Math {
    static Array twoToThe;

    function void init() {
        var int i, v;
        let twoToThe = Array.new(16);
        let i = 0;
        let v = 1;
        while (i < 16) {
            let twoToThe[i] = v;
            let v = v + v;
            let i = i + 1;
        }
        return;
    }

    function int abs(int x) {
        if (x < 0) { return -x; }
        return x;
    }

    /** 第 j 位是否为 1 */
    function boolean bit(int x, int j) {
        return ~((x & twoToThe[j]) = 0);
    }

    /** 移位相加：O(16) 次加法 */
    function int multiply(int x, int y) {
        var int sum, shifted, j;
        let sum = 0;
        let shifted = x;
        let j = 0;
        while (j < 16) {
            if (Math.bit(y, j)) {
                let sum = sum + shifted;
            }
            let shifted = shifted + shifted;
            let j = j + 1;
        }
        return sum;
    }

    /** 递归长除法 */
    function int divide(int x, int y) {
        var int q, result, absX, absY;
        let absX = Math.abs(x);
        let absY = Math.abs(y);
        if (absY > absX) { return 0; }
        let q = Math.divide(absX, absY + absY);
        if ((absX - (2 * q * absY)) < absY) {
            let result = q + q;
        } else {
            let result = q + q + 1;
        }
        if (((x < 0) & (y > 0)) | ((x > 0) & (y < 0))) {
            return -result;
        }
        return result;
    }

    /** 二分逼近开方 */
    function int sqrt(int x) {
        var int y, j, t, tt;
        if (x < 1) { return 0; }
        let y = 0;
        let j = 7;
        while (~(j < 0)) {
            let t = y + twoToThe[j];
            let tt = t * t;
            if (~(tt > x) & (tt > 0)) {
                let y = t;
            }
            let j = j - 1;
        }
        return y;
    }

    function int max(int a, int b) {
        if (a > b) { return a; }
        return b;
    }

    function int min(int a, int b) {
        if (a < b) { return a; }
        return b;
    }
}
`,
  },
  {
    name: "Memory.jack",
    source: `// 首次适配空闲链表堆分配器
class Memory {
    static Array ram;
    static Array freeList;

    function void init() {
        let ram = 0;
        let freeList = 2048;
        let freeList[0] = 14335;   // 块大小（16383-2048）
        let freeList[1] = null;    // next
        return;
    }

    function int peek(int address) {
        return ram[address];
    }

    function void poke(int address, int value) {
        let ram[address] = value;
        return;
    }

    /** 首次适配：找到第一个足够大的块就切一段出来 */
    function int alloc(int size) {
        var Array block, prev, next;
        var int blockSize;
        if (size < 1) { let size = 1; }
        let block = freeList;
        let prev = null;
        while (~(block = null)) {
            let blockSize = block[0];
            if (~(blockSize < (size + 2))) {
                // 从块尾切走 size+1 个字，块头保留剩余容量
                let block[0] = blockSize - size - 1;
                let next = block + blockSize - size;
                let next[-1] = size + 1;
                return next;
            }
            let prev = block;
            let block = block[1];
        }
        do Sys.error(6);   // 堆耗尽
        return 0;
    }

    /** 释放：挂回空闲链表头部（不做合并，够教学用） */
    function void deAlloc(Array o) {
        var Array block;
        let block = o - 1;
        let block[1] = freeList;
        let freeList = block;
        return;
    }
}
`,
  },
  {
    name: "Array.jack",
    source: `class Array {
    function Array new(int size) {
        if (size < 1) { do Sys.error(2); }
        return Memory.alloc(size);
    }

    method void dispose() {
        do Memory.deAlloc(this);
        return;
    }
}
`,
  },
  {
    name: "Screen.jack",
    source: `// 直接写屏幕内存 16384..24575（512x256 单色）
class Screen {
    static boolean color;
    static Array twoToThe;

    function void init() {
        var int i, v;
        let color = true;
        let twoToThe = Array.new(16);
        let i = 0;
        let v = 1;
        while (i < 16) {
            let twoToThe[i] = v;
            let v = v + v;
            let i = i + 1;
        }
        return;
    }

    function void clearScreen() {
        var int i;
        let i = 16384;
        while (i < 24576) {
            do Memory.poke(i, 0);
            let i = i + 1;
        }
        return;
    }

    function void setColor(boolean b) {
        let color = b;
        return;
    }

    function void drawPixel(int x, int y) {
        var int addr, value, bit;
        if ((x < 0) | (x > 511) | (y < 0) | (y > 255)) { return; }
        let addr = 16384 + (y * 32) + (x / 16);
        let bit = twoToThe[x - ((x / 16) * 16)];
        let value = Memory.peek(addr);
        if (color) {
            do Memory.poke(addr, value | bit);
        } else {
            do Memory.poke(addr, value & (~bit));
        }
        return;
    }

    /** Bresenham 直线 */
    function void drawLine(int x1, int y1, int x2, int y2) {
        var int dx, dy, a, b, diff, tmp;
        if (x1 > x2) {
            let tmp = x1; let x1 = x2; let x2 = tmp;
            let tmp = y1; let y1 = y2; let y2 = tmp;
        }
        let dx = x2 - x1;
        let dy = y2 - y1;
        if (dx = 0) {
            let a = Math.min(y1, y2);
            let b = Math.max(y1, y2);
            while (~(a > b)) {
                do Screen.drawPixel(x1, a);
                let a = a + 1;
            }
            return;
        }
        if (dy = 0) {
            let a = 0;
            while (~(a > dx)) {
                do Screen.drawPixel(x1 + a, y1);
                let a = a + 1;
            }
            return;
        }
        let a = 0;
        let b = 0;
        let diff = 0;
        if (dy > 0) {
            while (~(a > dx) & ~(b > dy)) {
                do Screen.drawPixel(x1 + a, y1 + b);
                if (diff < 0) { let a = a + 1; let diff = diff + dy; }
                else { let b = b + 1; let diff = diff - dx; }
            }
        } else {
            while (~(a > dx) & ~(b < dy)) {
                do Screen.drawPixel(x1 + a, y1 + b);
                if (diff < 0) { let a = a + 1; let diff = diff - dy; }
                else { let b = b - 1; let diff = diff - dx; }
            }
        }
        return;
    }

    function void drawRectangle(int x1, int y1, int x2, int y2) {
        var int y;
        let y = Math.min(y1, y2);
        while (~(y > Math.max(y1, y2))) {
            do Screen.drawLine(x1, y, x2, y);
            let y = y + 1;
        }
        return;
    }

    function void drawCircle(int cx, int cy, int r) {
        var int dy, half;
        if (r > 181) { let r = 181; }
        let dy = -r;
        while (~(dy > r)) {
            let half = Math.sqrt((r * r) - (dy * dy));
            do Screen.drawLine(cx - half, cy + dy, cx + half, cy + dy);
            let dy = dy + 1;
        }
        return;
    }
}
`,
  },
  {
    name: "String.jack",
    source: `class String {
    field Array chars;
    field int len, capacity;

    constructor String new(int maxLength) {
        if (maxLength < 1) { let maxLength = 1; }
        let chars = Array.new(maxLength);
        let capacity = maxLength;
        let len = 0;
        return this;
    }

    method void dispose() {
        do chars.dispose();
        do Memory.deAlloc(this);
        return;
    }

    method int length() { return len; }

    method char charAt(int j) { return chars[j]; }

    method void setCharAt(int j, char c) {
        let chars[j] = c;
        return;
    }

    method String appendChar(char c) {
        if (len < capacity) {
            let chars[len] = c;
            let len = len + 1;
        }
        return this;
    }

    method void eraseLastChar() {
        if (len > 0) { let len = len - 1; }
        return;
    }

    method int intValue() {
        var int v, i, d;
        var boolean neg;
        let v = 0;
        let i = 0;
        let neg = false;
        if ((len > 0) & (chars[0] = 45)) { let neg = true; let i = 1; }
        while (i < len) {
            let d = chars[i] - 48;
            if ((d < 0) | (d > 9)) {
                if (neg) { return -v; }
                return v;
            }
            let v = (v * 10) + d;
            let i = i + 1;
        }
        if (neg) { return -v; }
        return v;
    }

    method void setInt(int val) {
        var int lastDigit, c;
        let len = 0;
        if (val < 0) {
            do appendChar(45);
            let val = -val;
        }
        do setIntHelper(val);
        return;
    }

    method void setIntHelper(int val) {
        var int q, lastDigit;
        let q = val / 10;
        let lastDigit = val - (q * 10);
        if (val > 9) { do setIntHelper(q); }
        do appendChar(lastDigit + 48);
        return;
    }

    function char newLine() { return 128; }
    function char backSpace() { return 129; }
    function char doubleQuote() { return 34; }
}
`,
  },
  {
    name: "Output.jack",
    source: `// 8x11 字符网格；字模用紧凑的 5x7 位图，只覆盖常用可打印字符
class Output {
    static Array font;
    static int cursorRow, cursorCol;

    function void init() {
        let cursorRow = 0;
        let cursorCol = 0;
        do Output.initFont();
        return;
    }

    function void initFont() {
        var int i;
        let font = Array.new(96);      // ASCII 32..127，每项 5 个字节压缩进 Array of Array
        let i = 0;
        while (i < 96) {
            let font[i] = 0;
            let i = i + 1;
        }
        // 只显式给出数字与大写字母的列位图（每列 7 位，5 列打包进 5 个 Array 项）
        do Output.setGlyph(48, 62, 81, 73, 69, 62);      // 0
        do Output.setGlyph(49, 0, 66, 127, 64, 0);       // 1
        do Output.setGlyph(50, 66, 97, 81, 73, 70);      // 2
        do Output.setGlyph(51, 33, 65, 69, 75, 49);      // 3
        do Output.setGlyph(52, 24, 20, 18, 127, 16);     // 4
        do Output.setGlyph(53, 39, 69, 69, 69, 57);      // 5
        do Output.setGlyph(54, 60, 74, 73, 73, 48);      // 6
        do Output.setGlyph(55, 1, 113, 9, 5, 3);         // 7
        do Output.setGlyph(56, 54, 73, 73, 73, 54);      // 8
        do Output.setGlyph(57, 6, 73, 73, 41, 30);       // 9
        do Output.setGlyph(65, 126, 17, 17, 17, 126);    // A
        do Output.setGlyph(66, 127, 73, 73, 73, 54);     // B
        do Output.setGlyph(67, 62, 65, 65, 65, 34);      // C
        do Output.setGlyph(68, 127, 65, 65, 34, 28);     // D
        do Output.setGlyph(69, 127, 73, 73, 73, 65);     // E
        do Output.setGlyph(70, 127, 9, 9, 9, 1);         // F
        do Output.setGlyph(71, 62, 65, 73, 73, 122);     // G
        do Output.setGlyph(72, 127, 8, 8, 8, 127);       // H
        do Output.setGlyph(73, 0, 65, 127, 65, 0);       // I
        do Output.setGlyph(76, 127, 64, 64, 64, 64);     // L
        do Output.setGlyph(77, 127, 2, 12, 2, 127);      // M
        do Output.setGlyph(78, 127, 4, 8, 16, 127);      // N
        do Output.setGlyph(79, 62, 65, 65, 65, 62);      // O
        do Output.setGlyph(80, 127, 9, 9, 9, 6);         // P
        do Output.setGlyph(82, 127, 9, 25, 41, 70);      // R
        do Output.setGlyph(83, 70, 73, 73, 73, 49);      // S
        do Output.setGlyph(84, 1, 1, 127, 1, 1);         // T
        do Output.setGlyph(85, 63, 64, 64, 64, 63);      // U
        do Output.setGlyph(87, 63, 64, 56, 64, 63);      // W
        do Output.setGlyph(89, 7, 8, 112, 8, 7);         // Y
        do Output.setGlyph(58, 0, 54, 54, 0, 0);         // :
        do Output.setGlyph(45, 8, 8, 8, 8, 8);           // -
        return;
    }

    function void setGlyph(int code, int c0, int c1, int c2, int c3, int c4) {
        var Array g;
        let g = Array.new(5);
        let g[0] = c0; let g[1] = c1; let g[2] = c2; let g[3] = c3; let g[4] = c4;
        let font[code - 32] = g;
        return;
    }

    function void moveCursor(int i, int j) {
        let cursorRow = i;
        let cursorCol = j;
        return;
    }

    function void printChar(char c) {
        var Array g;
        var int x0, y0, col, row, bits;
        let x0 = cursorCol * 8;
        let y0 = cursorRow * 11;
        // 先清格
        do Screen.setColor(false);
        do Screen.drawRectangle(x0, y0, x0 + 7, y0 + 10);
        do Screen.setColor(true);
        if ((c > 31) & (c < 128)) {
            let g = font[c - 32];
            if (~(g = 0)) {
                let col = 0;
                while (col < 5) {
                    let bits = g[col];
                    let row = 0;
                    while (row < 7) {
                        if (~((bits & Output.pow2(row)) = 0)) {
                            do Screen.drawPixel(x0 + 1 + col, y0 + 2 + row);
                        }
                        let row = row + 1;
                    }
                    let col = col + 1;
                }
            }
        }
        let cursorCol = cursorCol + 1;
        if (cursorCol > 63) {
            let cursorCol = 0;
            let cursorRow = cursorRow + 1;
            if (cursorRow > 22) { let cursorRow = 0; }
        }
        return;
    }

    function int pow2(int n) {
        var int v, i;
        let v = 1;
        let i = 0;
        while (i < n) { let v = v + v; let i = i + 1; }
        return v;
    }

    function void printString(String s) {
        var int i;
        let i = 0;
        while (i < s.length()) {
            do Output.printChar(s.charAt(i));
            let i = i + 1;
        }
        return;
    }

    function void printInt(int i) {
        var String s;
        let s = String.new(7);
        do s.setInt(i);
        do Output.printString(s);
        do s.dispose();
        return;
    }

    function void println() {
        let cursorCol = 0;
        let cursorRow = cursorRow + 1;
        if (cursorRow > 22) { let cursorRow = 0; }
        return;
    }

    function void backSpace() {
        if (cursorCol > 0) { let cursorCol = cursorCol - 1; }
        do Output.printChar(32);
        if (cursorCol > 0) { let cursorCol = cursorCol - 1; }
        return;
    }
}
`,
  },
  {
    name: "Keyboard.jack",
    source: `class Keyboard {
    function void init() { return; }

    function char keyPressed() {
        return Memory.peek(24576);
    }

    /** 阻塞到按下再松开，返回按键 */
    function char readChar() {
        var char c, k;
        let c = 0;
        while (c = 0) { let c = Keyboard.keyPressed(); }
        let k = c;
        while (~(Keyboard.keyPressed() = 0)) { }
        do Output.printChar(k);
        return k;
    }

    function String readLine(String message) {
        var String s;
        var char c;
        do Output.printString(message);
        let s = String.new(64);
        let c = Keyboard.readChar();
        while (~(c = 128)) {
            if (c = 129) {
                do s.eraseLastChar();
                do Output.backSpace();
            } else {
                do s.appendChar(c);
            }
            let c = Keyboard.readChar();
        }
        do Output.println();
        return s;
    }

    function int readInt(String message) {
        var String s;
        var int v;
        let s = Keyboard.readLine(message);
        let v = s.intValue();
        do s.dispose();
        return v;
    }
}
`,
  },
  {
    name: "Sys.jack",
    source: `class Sys {
    /**
     * bootstrap 入口：先初始化各 OS 类，再进用户 main。
     * Memory 必须最先初始化——Math/Screen/Output 的 init 都要 Array.new 分配内存。
     */
    function void init() {
        do Memory.init();
        do Math.init();
        do Screen.init();
        do Output.init();
        do Keyboard.init();
        do Screen.clearScreen();
        do Main.main();
        do Sys.halt();
        return;
    }

    /**
     * 停机。除了自旋，还往 R15 写一个约定魔数（32123）——
     * 标准 VM 翻译只用到 R13/R14，R15 空闲，模拟器据此识别「程序已结束」，
     * 否则纯血模式下无从区分 while(true){} 与正常的忙等循环。
     */
    function void halt() {
        do Memory.poke(15, 32123);
        while (true) { }
        return;
    }

    /** 忙等待；纯血模式下时长取决于 CPU 速度档位 */
    function void wait(int duration) {
        var int i, j;
        let i = 0;
        while (i < duration) {
            let j = 0;
            while (j < 200) { let j = j + 1; }
            let i = i + 1;
        }
        return;
    }

    function void error(int errorCode) {
        do Output.printString("ERR");
        do Output.printInt(errorCode);
        do Sys.halt();
        return;
    }
}
`,
  },
];

/** 纯血模式下这些类由 Jack 源码提供，不再注册 trap */
export const JACK_OS_CLASSES = new Set([
  "Math",
  "Memory",
  "Array",
  "Screen",
  "String",
  "Output",
  "Keyboard",
  "Sys",
]);
