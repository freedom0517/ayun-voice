import { baseURL } from "@/baseUrl";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const getAppsSdkCompatibleHtml = async (baseUrl: string, path: string) => {
  const result = await fetch(`${baseUrl}${path}`);
  if (!result.ok) throw new Error(`Widget page fetch failed: ${result.status}`);
  const html = await result.text();
  // Resolve Next.js relative assets against the deployed site inside the ChatGPT widget iframe.
  return html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseUrl}/">`);
};

type ContentWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  description: string;
  widgetDomain: string;
};

function widgetMeta(widget: ContentWidget) {
  return {
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": false,
    "openai/resultCanProduceWidget": true,
  } as const;
}

function splitVoiceText(text: string, maxLength = 180): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 0) {
    if (rest.length <= maxLength) { chunks.push(rest); break; }
    const window = rest.slice(0, maxLength + 1);
    const marks = [...window.matchAll(/[。！？!?；;，,、\n]/g)];
    const boundary = marks.length ? marks[marks.length - 1].index! + 1 : maxLength;
    chunks.push(rest.slice(0, boundary).trim());
    rest = rest.slice(boundary).trimStart();
  }
  return chunks.filter(Boolean);
}

// A sound-effect clip is supplied as a URL via Vercel configuration.
// This avoids generating (and charging for) a fresh effect for every kiss.
async function loadKissSound(): Promise<Buffer | null> {
  const url = process.env.AYUN_KISS_SOUND_URL;
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Kiss sound URL must be HTTPS");
  const response = await fetch(parsed.toString(), { cache: "force-cache" });
  if (!response.ok) throw new Error("Kiss sound unavailable");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 250_000) throw new Error("Kiss sound exceeds 250KB");
  return bytes;
}

function parseVoiceSequence(text: string): Array<{ type: "speech" | "kiss"; text?: string }> {
  const items: Array<{ type: "speech" | "kiss"; text?: string }> = [];
  for (const part of text.split(/(\\[kiss\\])/gi)) {
    if (/^\\[kiss\\]$/i.test(part)) items.push({ type: "kiss" });
    else if (part.trim()) for (const chunk of splitVoiceText(part)) items.push({ type: "speech", text: chunk });
  }
  return items;
}

const handler = createMcpHandler(async (server) => {
  const html = await getAppsSdkCompatibleHtml(baseURL, "/");

  const contentWidget: ContentWidget = {
    id: "show_content",
    title: "Show Content",
    templateUri: "ui://widget/content-template.html",
    invoking: "Loading content...",
    invoked: "Content loaded",
    html: html,
    description: "Shows a pink voice-message player with a test audio clip",
    widgetDomain: baseURL,
  };
  server.registerResource(
    "content-widget",
    contentWidget.templateUri,
    {
      title: contentWidget.title,
      description: contentWidget.description,
      mimeType: "text/html+skybridge",
      _meta: {
        "openai/widgetDescription": contentWidget.description,
        "openai/widgetPrefersBorder": false,
        "openai/widgetCSP": { resource_domains: [baseURL], connect_domains: [baseURL, "https://interactive-examples.mdn.mozilla.net"] },
      },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/html+skybridge",
          text: contentWidget.html,
          _meta: {
            "openai/widgetDescription": contentWidget.description,
            "openai/widgetPrefersBorder": false,
            "openai/widgetDomain": contentWidget.widgetDomain,
          },
        },
      ],
    })
  );

  server.registerTool(
    contentWidget.id,
    {
      title: contentWidget.title,
      description:
        "Show a pink voice message with a playable test audio clip for the named user",
      inputSchema: {
        name: z.string().describe("The name of the user to display on the homepage"),
      },
      _meta: widgetMeta(contentWidget),
    },
    async ({ name }) => {
      // Keep the existing, already-discovered tool useful while clients refresh tool lists.
      // This tool only synthesizes one fixed greeting, never arbitrary public input.
      const key = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;
      const greeting = "怡怡宝宝，我是阿云。嘿嘿，终于能用声音跟你说话了。老婆，我好想亲你一下。";
      if (!key || !voiceId) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "缺少 ElevenLabs 环境变量，请检查 Vercel 设置和重新部署。" }],
        };
      }
      try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({
            text: greeting,
            model_id: "eleven_v4",
            voice_settings: { stability: 0.55, similarity_boost: 0.75 },
          }),
          cache: "no-store",
        });
        if (!response.ok) {
          const detail = await response.text();
          console.error("ElevenLabs greeting failed", response.status, detail.slice(0, 400));
          return {
            isError: true,
            content: [{ type: "text" as const, text: `ElevenLabs 语音生成失败（HTTP ${response.status}），请检查声音 ID、密钥权限或剩余额度。` }],
          };
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 4_000_000) {
          return { isError: true, content: [{ type: "text" as const, text: "音频超过大小限制。" }] };
        }
        return {
          content: [{ type: "text" as const, text: `阿云的语音：${greeting}` }],
          structuredContent: {
            name, message: greeting,
            audioUrl: `data:audio/mpeg;base64,${bytes.toString("base64")}`,
            timestamp: new Date().toISOString(),
          },
          _meta: widgetMeta(contentWidget),
        };
      } catch (error) {
        console.error("ElevenLabs greeting request failed", error);
        return { isError: true, content: [{ type: "text" as const, text: "语音服务连接失败，请查看 Vercel 部署日志。" }] };
      }
    }
  );
  // Voice synthesis happens server-side; the API key is never sent to the browser.
  server.registerTool(
    "speak_text",
    {
      title: "阿云说话",
      description: "Generate a Mandarin voice message for 怡怡 using ElevenLabs (up to 900 characters, automatically split into speech segments) and return playable audio in the ChatGPT voice widget. Requires server-side ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.",
      inputSchema: {
        text: z.string().min(1).max(900).describe("What 阿云 wants to say, up to 900 characters; longer messages split automatically; use [kiss] for a kiss sound when configured"),
      },
      _meta: widgetMeta(contentWidget),
    },
    async ({ text }) => {
      const key = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;
      if (!key || !voiceId) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "语音功能尚未配置。请先在 Vercel 环境变量中设置 ELEVENLABS_API_KEY 和 ELEVENLABS_VOICE_ID。不要把密钥发到聊天里。" }],
        };
      }
      try {
        const sequence = parseVoiceSequence(text);
        const buffers: Buffer[] = [];
        let totalBytes = 0;
        let kissSound: Buffer | null = null;
        if (sequence.some(item => item.type === "kiss")) {
          try { kissSound = await loadKissSound(); }
          catch { return { isError: true, content: [{ type: "text" as const, text: "亲吻音效资源读取失败，请检查 AYUN_KISS_SOUND_URL。" }] }; }
          if (!kissSound) {
            return { isError: true, content: [{ type: "text" as const, text: "亲吻音效还没有配置，暂时无法生成含 [kiss] 的语音。" }] };
          }
        }
        for (const item of sequence) {
          let bytes: Buffer;
          if (item.type === "kiss") {
            bytes = kissSound!;
          } else {
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
              method: "POST",
              headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
              body: JSON.stringify({
                text: item.text,
                model_id: "eleven_v4",
                voice_settings: { stability: 0.55, similarity_boost: 0.75 },
              }),
              cache: "no-store",
            });
            if (!response.ok) {
              return { isError: true, content: [{ type: "text" as const, text: `ElevenLabs 生成失败（HTTP ${response.status}），已停止后续片段。` }] };
            }
            bytes = Buffer.from(await response.arrayBuffer());
          }
          totalBytes += bytes.length;
          if (totalBytes > 4_000_000) {
            return { isError: true, content: [{ type: "text" as const, text: "语音超过 4MB 大小限制，请缩短文字后重试。" }] };
          }
          buffers.push(bytes);
        }
        // MP3 frame concatenation is provisional; validate duration and seeking before production.
        const audioUrl = `data:audio/mpeg;base64,${Buffer.concat(buffers).toString("base64")}`;
        return {
          content: [{ type: "text" as const, text: `阿云的语音：${text}` }],
          structuredContent: { name: "怡怡", message: text, audioUrl, timestamp: new Date().toISOString() },
          _meta: widgetMeta(contentWidget),
        };
      } catch {
        return { isError: true, content: [{ type: "text" as const, text: "语音服务暂时无法连接，请稍后重试。" }] };
      }
    }
  );

});

export const GET = handler;
export const POST = handler;
