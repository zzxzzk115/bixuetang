// 视频笔记的跨组件刷新事件:播放器速记层存完笔记后广播,
// 页面下方的笔记面板收到即重新拉取(两者不共享 React 状态树)。
export const NOTES_CHANGED_EVENT = "guild:notes-changed";
