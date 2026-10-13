"use client";

import { useEffect, useRef, useState } from "react";
import { useWidgetProps } from "./hooks";

type VoiceResult = {
  name?: string;
  message?: string;
  audioUrl?: string;
  result?: { structuredContent?: { name?: string; message?: string; audioUrl?: string } };
};

const DEFAULT_AUDIO = "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3";
const PINK = "#E7659C";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function Home() {
  const toolOutput = useWidgetProps<VoiceResult>();
  const content = toolOutput?.result?.structuredContent ?? toolOutput;
  const audioUrl = content?.audioUrl || DEFAULT_AUDIO;
  const message = content?.message;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [completedDuration, setCompletedDuration] = useState(0);

  function syncDuration(audio: HTMLAudioElement) {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    } else if (audio.seekable.length > 0) {
      const end = audio.seekable.end(audio.seekable.length - 1);
      if (Number.isFinite(end) && end > 0) setDuration(end);
    }
  }

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setCompletedDuration(0);
  }, [audioUrl]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }

  const totalDuration = duration > 0 ? duration : completedDuration;
  const progress = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <main style={{ background: "transparent", padding: "4px 0", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 310, minWidth: 0, boxSizing: "border-box" }}>
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              onLoadedMetadata={(event) => syncDuration(event.currentTarget)}
              onLoadedData={(event) => syncDuration(event.currentTarget)}
              onCanPlay={(event) => syncDuration(event.currentTarget)}
              onDurationChange={(event) => syncDuration(event.currentTarget)}
              onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); syncDuration(event.currentTarget); }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={(event) => { setPlaying(false); setCurrentTime(event.currentTarget.currentTime); if (!duration && event.currentTarget.currentTime > 0) setCompletedDuration(event.currentTarget.currentTime); }}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", minWidth: 0, boxSizing: "border-box", background: "#FCE6EF", borderRadius: 999, padding: "12px 14px", color: PINK }}>
              <button type="button" onClick={togglePlayback} aria-label={playing ? "暂停" : "播放"} style={{ color: PINK, border: 0, background: "transparent", padding: 0, width: 20, height: 24, display: "grid", placeItems: "center", flexShrink: 0, cursor: "pointer" }}>
                {playing ? (
                  <svg width="17" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="4" height="14" rx="1"/><rect x="11" y="2" width="4" height="14" rx="1"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><path d="M4 2.5a1 1 0 0 1 1.52-.85l11 6.5a1 1 0 0 1 0 1.7l-11 6.5A1 1 0 0 1 4 15.5z"/></svg>
                )}
              </button>
              <span style={{ fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatTime(currentTime)} / {totalDuration > 0 ? formatTime(totalDuration) : "--:--"}</span>
              <div style={{ position: "relative", flex: 1, minWidth: 34, height: 22, display: "flex", alignItems: "center" }}>
                <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 999, background: "#FFFFFF", pointerEvents: "none" }}>
                  <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: PINK }} />
                </div>
                <input
                  aria-label="播放进度"
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  value={progress}
                  disabled={totalDuration <= 0}
                  onChange={(event) => {
                    const audio = audioRef.current;
                    if (audio && totalDuration > 0) {
                      const nextTime = (Number(event.target.value) / 100) * totalDuration;
                      audio.currentTime = nextTime;
                      setCurrentTime(nextTime);
                    }
                  }}
                  style={{ position: "relative", width: "100%", margin: 0, height: 22, opacity: 0, cursor: totalDuration > 0 ? "pointer" : "default" }}
                />
                <div aria-hidden="true" style={{ position: "absolute", left: `calc(${progress}% - 5px)`, width: 10, height: 10, borderRadius: "50%", background: PINK, pointerEvents: "none" }} />
              </div>
              <button type="button" onClick={() => { const audio = audioRef.current; if (audio) { audio.muted = !audio.muted; setMuted(audio.muted); } }} aria-label={muted ? "取消静音" : "静音"} style={{ color: PINK, border: 0, background: "transparent", padding: 0, display: "grid", placeItems: "center", flexShrink: 0, cursor: "pointer" }}>
                {muted ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m17 9 5 6m0-6-5 6"/></svg> : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>}
              </button>
            </div>
        {message && <div style={{ fontSize: 13, lineHeight: 1.7, color: "#776b72", marginTop: 9, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message}</div>}
      </div>
    </main>
  );
}
