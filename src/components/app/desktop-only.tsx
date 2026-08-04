"use client";

import { useSyncExternalStore } from "react";
import { Monitor } from "lucide-react";

// 桌面端专属工具的门。
//
// 实验室与数学工坊都靠键盘吃饭——多文件代码编辑器、公式输入。
// 在手机上把它们硬塞进去只会得到一个谁都用不了的界面，
// 不如老老实实说清楚该去电脑上开。
//
// 判定用宽度而不是 UA：iPad 横屏、折叠屏展开这些都该算「够大」，
// 而 UA 嗅探永远追不上机型。

const QUERY = "(min-width: 900px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function DesktopOnly({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // SSR 快照给 true：服务端渲染出完整内容，桌面首屏不会闪一下提示语；
  // 窄屏客户端水合后立刻换成提示，代价只是一帧
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );

  if (wide) return <>{children}</>;

  return (
    <div className="desktop-only">
      <Monitor size={30} aria-hidden />
      <b>{title}需要更大的屏幕</b>
      <p>
        这里要用到键盘和多栏布局——代码编辑器、公式输入在手机上没法好好用。
        换台电脑打开本页，或者把平板横过来。
      </p>
    </div>
  );
}
