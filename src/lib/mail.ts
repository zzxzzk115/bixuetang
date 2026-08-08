import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// 发信封装,配置无关:
//   · 配了 SMTP_HOST → 用 nodemailer 发(本机 25 直投,或外部中转,只看 env)
//   · 没配 → dev 兜底:把邮件内容(含链接)打到服务器日志,不外发,保证无头可测
//
// 相关环境变量:SMTP_HOST / SMTP_PORT(默 587)/ SMTP_USER / SMTP_PASS /
//   SMTP_SECURE(=1 走 TLS,465 自动开)/ SMTP_FROM(发件人)。

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// undefined = 还没初始化;null = 没配 SMTP(走 dev 日志)
let cached: Transporter | null | undefined;

function transport(): Transporter | null {
  if (cached !== undefined) return cached;
  const host = process.env.SMTP_HOST;
  if (!host) {
    cached = null;
    return cached;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  cached = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "1" || port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cached;
}

export async function sendMail(mail: Mail): Promise<void> {
  const t = transport();
  const from = process.env.SMTP_FROM ?? "必学堂 <no-reply@bixuetang.com>";
  if (!t) {
    // 未配 SMTP:不真正外发,打日志方便本地/无头测试对拍
    console.info(
      `[mail:dev] 未配置 SMTP,邮件未外发\n  收件:${mail.to}\n  主题:${mail.subject}\n  正文:${mail.text}`,
    );
    return;
  }
  await t.sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
