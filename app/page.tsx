"use client";

import { useWidgetProps, useIsChatGptApp } from "./hooks";

type VoiceResult = {
  name?: string;
  audioUrl?: string;
  result?: { structuredContent?: { name?: string; audioUrl?: string } };
};

const DEFAULT_AUDIO = "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3";

export default function Home() {
  const toolOutput = useWidgetProps<VoiceResult>();
  const isChatGptApp = useIsChatGptApp();
  const content = toolOutput?.result?.structuredContent ?? toolOutput;
  const name = content?.name || "怡怡";
  const audioUrl = content?.audioUrl || DEFAULT_AUDIO;

  return (
    <main style={{ minHeight: "100vh", background: "#fff", padding: "20px 12px", fontFamily: "system-ui, sans-serif", color: "#3c3035" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div aria-hidden="true" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "50%", background: "#fbe4ed", display: "grid", placeItems: "center", fontSize: 21 }}>🐱</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#91858c", fontSize: 12, marginBottom: 6 }}>阿云</div>
          <section style={{ background: "#fdf1f5", borderRadius: "5px 18px 18px 18px", padding: "14px 16px", maxWidth: "90%", boxSizing: "border-box" }}>
            <div style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 10 }}>{name}，阿云的语音条测试来啦。</div>
            <audio controls preload="metadata" src={audioUrl} style={{ display: "block", width: "100%", minWidth: 0 }} aria-label="播放测试音频">
              当前设备无法播放音频。
            </audio>
            <div style={{ fontSize: 11, lineHeight: 1.6, color: "#8f7e87", marginTop: 8 }}>
              这是公开测试音效，不是阿云的声音。先确认 ChatGPT 安卓端能播放，随后再接中文语音合成。
            </div>
          </section>
          <div style={{ color: "#b3a7ad", fontSize: 11, marginTop: 5 }}>已读</div>
          {!isChatGptApp && <p style={{ fontSize: 12, color: "#92848c", marginTop: 16 }}>网页预览模式。正式插件卡片需要在 ChatGPT 中调用 show_content。</p>}
        </div>
      </div>
    </main>
  );
}
