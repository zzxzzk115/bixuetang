// 分享卡绘制(客户端 canvas)。
// 两种模式:site=本站风格(logo+站点绿),bili=bilibili 风格(粉色系)。
// 图内带二维码:扫码直达对应页面;链接用当前 origin,
// 配了域名自然走域名,本地就是 localhost——无需额外配置。

export interface ShareCardInput {
  mode: "site" | "bili";
  /** 同源封面代理地址(跨域图会污染画布) */
  coverUrl: string;
  /** 站点 logo(同源) */
  logoUrl: string;
  courseTitle: string;
  episodeTitle: string;
  episodeN: number;
  /** 二维码与分享的目标链接 */
  link: string;
}

const W = 750;
const H = 1050;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 逐字换行(中文没有空格可断),最多 maxLines 行,超出加省略号 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && ctx.measureText(text).width > maxWidth * maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
  }
  return lines;
}

function loadImage(
  src: string,
  cors = false,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // 跨域头像:声明 anonymous——服务器给 CORS 就干净加载,不给就 onerror 回退,
    // 两种都不会污染画布(污染会让 toBlob 抛 SecurityError)。
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// 首字母色块(头像兜底):按名字取一个稳定的柔和底色
const AVATAR_TONES = [
  "#58cc02",
  "#1cb0f6",
  "#ce82ff",
  "#ff9600",
  "#ff4b4b",
  "#2ec4b6",
];
function drawLetterAvatar(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number,
  cy: number,
  r: number,
) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = AVATAR_TONES[h % AVATAR_TONES.length];
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(r)}px 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((name.slice(0, 1) || "?").toUpperCase(), cx, cy + 2);
  ctx.restore();
}

export interface InviteCardInput {
  /** 邀请人昵称 */
  inviterName: string;
  /** 邀请人头像地址(avatarSrc 解析后;同源可画,跨域走 CORS 兜底) */
  avatarUrl: string | null;
  /** 站点 logo(同源) */
  logoUrl: string;
  /** 二维码目标:邀请注册链接(带 ?ref=) */
  link: string;
}

/** 邀请分享图:邀请人头像 + 大标题 + 二维码,复用本模块的 canvas/二维码逻辑 */
export async function drawInviteCard(
  input: InviteCardInput,
): Promise<HTMLCanvasElement> {
  const { default: QRCode } = await import("qrcode");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const accent = "#58cc02";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 12);

  const font = (s: string) =>
    `${s} 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // 顶部:小 logo + 品牌
  const logo = await loadImage(input.logoUrl);
  if (logo) {
    ctx.save();
    roundRect(ctx, 40, 56, 64, 64, 16);
    ctx.clip();
    ctx.drawImage(logo, 40, 56, 64, 64);
    ctx.restore();
  }
  ctx.fillStyle = "#26313c";
  ctx.font = font("bold 34px");
  ctx.fillText("必学堂", 120, 100);

  // 邀请人头像:大圆(居中),同源直接画,跨域声明 CORS,失败画首字母块
  const cx = W / 2;
  const avatarY = 300;
  const r = 100;
  const isSameOrigin = !!input.avatarUrl && input.avatarUrl.startsWith("/");
  const avatar = input.avatarUrl
    ? await loadImage(input.avatarUrl, !isSameOrigin)
    : null;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, avatarY, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const scale = Math.max((2 * r) / avatar.width, (2 * r) / avatar.height);
    const dw = avatar.width * scale;
    const dh = avatar.height * scale;
    ctx.drawImage(avatar, cx - dw / 2, avatarY - dh / 2, dw, dh);
    ctx.restore();
    // 头像描边
    ctx.beginPath();
    ctx.arc(cx, avatarY, r, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.stroke();
  } else {
    drawLetterAvatar(ctx, input.inviterName, cx, avatarY, r);
  }

  // 大标题(居中)
  ctx.textAlign = "center";
  ctx.fillStyle = "#26313c";
  ctx.font = font("bold 52px");
  const nameLine = wrapText(ctx, input.inviterName, W - 120, 1)[0] ?? "";
  ctx.fillText(`${nameLine} 邀你一起学`, cx, avatarY + r + 80);
  ctx.fillStyle = accent;
  ctx.font = font("bold 30px");
  ctx.fillText("互相较劲,一起变强 · 上榜比学习", cx, avatarY + r + 128);

  // 二维码(居中偏下)
  const qrSize = 280;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, input.link, {
    width: qrSize,
    margin: 1,
    color: { dark: "#26313c", light: "#ffffff" },
  });
  const qrX = (W - qrSize) / 2;
  const qrY = 660;
  ctx.save();
  roundRect(ctx, qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 24);
  ctx.fillStyle = "#f4f7f9";
  ctx.fill();
  ctx.restore();
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "#7b8a99";
  ctx.font = font("26px");
  ctx.fillText("扫码注册,成为好友", cx, qrY + qrSize + 56);
  ctx.textAlign = "left";

  return canvas;
}

export async function drawShareCard(
  input: ShareCardInput,
): Promise<HTMLCanvasElement> {
  const { default: QRCode } = await import("qrcode");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const accent = input.mode === "bili" ? "#fb7299" : "#58cc02";
  const brand = input.mode === "bili" ? "bilibili" : "必学堂";
  const brandSub =
    input.mode === "bili" ? "哔哩哔哩 · 原站观看" : "游戏化公开课自学";

  // 底
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // 顶部品牌条
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 12);

  // 封面 16:9
  const coverY = 40;
  const coverH = Math.round(((W - 80) * 9) / 16);
  const cover = await loadImage(input.coverUrl);
  ctx.save();
  roundRect(ctx, 40, coverY, W - 80, coverH, 20);
  ctx.clip();
  if (cover) {
    // cover 按比例铺满裁切
    const scale = Math.max((W - 80) / cover.width, coverH / cover.height);
    const dw = cover.width * scale;
    const dh = cover.height * scale;
    ctx.drawImage(cover, 40 + (W - 80 - dw) / 2, coverY + (coverH - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = "#e8ecef";
    ctx.fillRect(40, coverY, W - 80, coverH);
  }
  ctx.restore();

  // 集数标签
  ctx.fillStyle = accent;
  roundRect(ctx, 40, coverY + coverH + 36, 128, 44, 22);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 24px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(`第 ${input.episodeN} 集`, 62, coverY + coverH + 59);

  // 标题
  ctx.fillStyle = "#26313c";
  ctx.font = "bold 40px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const titleLines = wrapText(ctx, input.episodeTitle, W - 80, 2);
  let ty = coverY + coverH + 132;
  for (const line of titleLines) {
    ctx.fillText(line, 40, ty);
    ty += 56;
  }
  // 课程名
  ctx.fillStyle = "#7b8a99";
  ctx.font = "26px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillText(
    wrapText(ctx, input.courseTitle, W - 80, 1)[0] ?? "",
    40,
    ty + 8,
  );

  // 分隔线
  ctx.strokeStyle = "#eef1f4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, H - 300);
  ctx.lineTo(W - 40, H - 300);
  ctx.stroke();

  // 底部:品牌 + 二维码
  const qrSize = 200;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, input.link, {
    width: qrSize,
    margin: 1,
    color: { dark: "#26313c", light: "#ffffff" },
  });
  ctx.drawImage(qrCanvas, W - 40 - qrSize, H - 260, qrSize, qrSize);
  ctx.fillStyle = "#9aa7b3";
  ctx.font = "22px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillText(
    input.mode === "bili" ? "扫码去 bilibili 看" : "扫码继续这门课",
    W - 40 - qrSize + 6,
    H - 34,
  );

  // 品牌区:本站画 logo,bilibili 画文字标
  if (input.mode === "site") {
    const logo = await loadImage(input.logoUrl);
    if (logo) {
      ctx.save();
      roundRect(ctx, 40, H - 244, 88, 88, 22);
      ctx.clip();
      ctx.drawImage(logo, 40, H - 244, 88, 88);
      ctx.restore();
    }
    ctx.fillStyle = "#26313c";
    ctx.font = "bold 40px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(brand, 148, H - 202);
  } else {
    ctx.fillStyle = accent;
    ctx.font = "bold 52px 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.fillText(brand, 40, H - 196);
  }
  ctx.fillStyle = "#9aa7b3";
  ctx.font = "24px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillText(brandSub, input.mode === "site" ? 148 : 40, H - 152);

  return canvas;
}
