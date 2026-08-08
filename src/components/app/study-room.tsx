"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Users } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import {
  enterRoom,
  heartbeat,
  leaveRoom,
} from "@/lib/social/study-actions";
import type { RoomView } from "@/lib/social/study-types";

// 自习室房间:进入即登记在场,每 20 秒发心跳并拉最新在场同学;离开/关页面即退出。
export function StudyRoom({ initial }: { initial: RoomView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const leftRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const boot = async () => {
      await enterRoom(initial.id);
      const v = await heartbeat(initial.id);
      if (alive && v) setView(v);
    };
    void boot();
    const iv = setInterval(async () => {
      const v = await heartbeat(initial.id);
      if (alive && v) setView(v);
    }, 20000);
    return () => {
      alive = false;
      clearInterval(iv);
      if (!leftRef.current) void leaveRoom();
    };
  }, [initial.id]);

  function leave() {
    leftRef.current = true;
    void leaveRoom();
    router.push("/study");
  }

  return (
    <div className="study-room">
      <div className="study-room-head">
        <span className="study-room-emoji">{view.emoji ?? "📚"}</span>
        <div>
          <h1>{view.name}</h1>
          <small>
            <Users size={13} aria-hidden /> {view.members.length} 人在自习
          </small>
        </div>
      </div>

      <div className="study-members">
        {view.members.map((m) => (
          <div key={m.userId} className="study-member">
            <span className="study-member-avatar">
              <UserAvatar
                userId={m.userId}
                avatar={m.avatar}
                name={m.name}
                size={54}
              />
            </span>
            <b>{m.name}</b>
            <small>自习 {m.minutes} 分钟</small>
          </div>
        ))}
      </div>

      <button className="study-leave" onClick={leave}>
        <DoorOpen size={16} aria-hidden /> 离开自习室
      </button>
      <p className="me-note">
        在这儿安静自习,让同学看到你在努力。每 20 秒同步一次在场的人。
      </p>
    </div>
  );
}
