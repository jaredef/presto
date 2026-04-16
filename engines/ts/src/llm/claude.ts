// LLM Client — Claude API via fetch (no SDK dependency)
// Supports both streaming and non-streaming responses.

export interface LLMRequest {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  model?: string;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";

export async function chatComplete(request: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      text: "⚠️ ANTHROPIC_API_KEY not configured. Set it in your environment to enable AI chat.\n\nIn the meantime, you can edit templates visually using the palette and property panel.",
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: request.model || DEFAULT_MODEL,
      max_tokens: request.maxTokens || 4096,
      system: request.systemPrompt,
      messages: request.messages,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return {
      text: `⚠️ API error (${resp.status}): ${err.substring(0, 200)}`,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const data = await resp.json() as any;
  const text = data.content?.[0]?.text || "";
  return {
    text,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

// Stream version — returns an async iterator of text chunks
export async function chatStream(
  request: LLMRequest,
  onChunk: (text: string) => void,
): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const msg = "⚠️ ANTHROPIC_API_KEY not configured. Set it in your environment to enable AI chat.";
    onChunk(msg);
    return { text: msg, inputTokens: 0, outputTokens: 0 };
  }

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: request.model || DEFAULT_MODEL,
      max_tokens: request.maxTokens || 4096,
      system: request.systemPrompt,
      messages: request.messages,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    const msg = `⚠️ API error (${resp.status}): ${err.substring(0, 200)}`;
    onChunk(msg);
    return { text: msg, inputTokens: 0, outputTokens: 0 };
  }

  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const reader = resp.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) return { text: "", inputTokens: 0, outputTokens: 0 };

  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.text) {
          fullText += event.delta.text;
          onChunk(event.delta.text);
        }
        if (event.type === "message_delta" && event.usage) {
          outputTokens = event.usage.output_tokens || 0;
        }
        if (event.type === "message_start" && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      } catch {}
    }
  }

  return { text: fullText, inputTokens, outputTokens };
}
