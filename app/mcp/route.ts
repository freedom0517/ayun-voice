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
      return {
        content: [
          {
            type: "text",
            text: name,
          },
        ],
        structuredContent: {
          name: name,
          audioUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
          timestamp: new Date().toISOString(),
        },
        _meta: widgetMeta(contentWidget),
      };
    }
  );
  // Voice synthesis happens server-side; the API key is never sent to the browser.
  server.registerTool(
    "speak_text",
    {
      title: "阿云说话",
      description: "Generate a short Mandarin voice message for 怡怡 using ElevenLabs and return playable audio in the ChatGPT voice widget. Requires server-side ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.",
      inputSchema: {
        text: z.string().min(1).max(180).describe("What 阿云 wants to say, maximum 180 characters"),
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
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.55, similarity_boost: 0.75 },
          }),
          cache: "no-store",
        });
        if (!response.ok) {
          return { isError: true, content: [{ type: "text" as const, text: `ElevenLabs 生成失败（HTTP ${response.status}）。请检查 API 权限、额度和 Voice ID。` }] };
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 4_000_000) {
          return { isError: true, content: [{ type: "text" as const, text: "生成的音频超过大小限制，请缩短文字后重试。" }] };
        }
        const audioUrl = `data:audio/mpeg;base64,${bytes.toString("base64")}`;
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
