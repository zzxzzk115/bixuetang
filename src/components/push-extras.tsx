"use client";

import { useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { sendTestPush, setEmailRecall } from "@/lib/game/notify-actions";

// 学习提醒的两个附加项:
//   · 发送测试通知——当场验证推送通道是否打通(排查「从没收到过通知」)
//   · 断学邮件提醒——太久没学习时发邮件召回(需已验证邮箱)

const TEST_MSG: Record<string, string> = {
  "no-vapid": "服务端还没配置推送密钥(VAPID),无法发送。",
  "no-sub": "这台设备还没订阅——先在上方开启学习提醒。",
  "send-failed": "发送失败,订阅可能已失效,重新开启一次试试。",
};

export function PushExtras({
  emailRecall,
  emailVerified,
}: {
  emailRecall: boolean;
  emailVerified: boolean;
}) {
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [recall, setRecall] = useState(emailRecall);
  const [savingRecall, setSavingRecall] = useState(false);

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    const r = await sendTestPush();
    setTesting(false);
    setTestMsg(
      r.ok
        ? `已发送到 ${r.sent} 台设备,留意通知栏~`
        : (TEST_MSG[r.reason ?? "send-failed"] ?? "发送失败"),
    );
  };

  const toggleRecall = async () => {
    if (savingRecall) return;
    const next = !recall;
    setRecall(next);
    setSavingRecall(true);
    const r = await setEmailRecall(next);
    setSavingRecall(false);
    if (!r.ok) setRecall(!next);
  };

  return (
    <div className="push-extras">
      <button className="app-btn-plain" onClick={test} disabled={testing}>
        {testing ? (
          <Loader2 size={15} className="spin" aria-hidden />
        ) : (
          <Send size={15} aria-hidden />
        )}
        发送测试通知
      </button>
      {testMsg && <p className="me-note">{testMsg}</p>}

      <label className={`recall-toggle${emailVerified ? "" : " disabled"}`}>
        <input
          type="checkbox"
          checked={recall}
          disabled={!emailVerified || savingRecall}
          onChange={toggleRecall}
        />
        <span>
          <Mail size={14} aria-hidden /> 断学邮件提醒
          <small>
            {emailVerified
              ? "太久没学习时,发邮件提醒你回来"
              : "先在下方「邮箱」绑定并验证邮箱后可开启"}
          </small>
        </span>
      </label>
    </div>
  );
}
