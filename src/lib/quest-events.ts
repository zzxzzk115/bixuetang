// 每日任务完成特效的触发信号。任何可能推进任务的结算点(看完一集/章节、
// 完成复习、打完试炼)在 router.refresh() 之后 dispatch 这个事件,
// 挂在 layout 的 QuestCompleteWatcher 收到后拉取最新任务快照做 diff,
// 对「刚跨到完成」的任务弹特效。用事件而非 props:结算点分散在多个
// 组件里,一个全局广播比层层回调干净。
export const QUESTS_CHANGED_EVENT = "guild:quests-changed";

export function notifyQuestsChanged() {
  if (typeof window === "undefined") return;
  // 服务端 revalidate 需要一点时间落地,略延后再拉取更稳
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent(QUESTS_CHANGED_EVENT));
  }, 400);
}
