import { env, HttpError } from "./http.ts";

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
export interface Msg { role: "user" | "assistant"; content: string | Block[] }

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Calls the Anthropic Messages API. When `tool` is given the model is forced to answer
 * through it, which gives us schema-shaped JSON instead of free text.
 */
export async function claudeTool<T>(opts: { system: string; messages: Msg[]; tool: Tool; maxTokens?: number }): Promise<T> {
  const res = await call({
    system: opts.system, messages: opts.messages, max_tokens: opts.maxTokens ?? 1024,
    tools: [opts.tool], tool_choice: { type: "tool", name: opts.tool.name },
  });
  const block = (res.content as Array<{ type: string; input?: unknown }>).find((b) => b.type === "tool_use");
  if (!block?.input) throw new HttpError(502, "ai_bad_response");
  return block.input as T;
}

async function call(body: Record<string, unknown>) {
  const key = env("ANTHROPIC_API_KEY");
  const model = env("ANTHROPIC_MODEL", true) || "claude-sonnet-5-5";
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, ...body }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (e) {
    console.error("anthropic fetch failed", e);
    throw new HttpError(504, "ai_timeout");
  }
  if (!res.ok) {
    console.error("anthropic error", res.status, await res.text());
    throw new HttpError(res.status === 429 ? 503 : 502, "ai_unavailable");
  }
  return await res.json();
}

export function imageBlock(bytes: Uint8Array, mime: string, b64: (b: Uint8Array) => string): Block {
  return { type: "image", source: { type: "base64", media_type: mime, data: b64(bytes) } };
}
