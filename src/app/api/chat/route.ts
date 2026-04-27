import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PENPOT_MCP_URL = process.env.PENPOT_MCP_URL ?? "http://penpot-mcp:4401";
const MODEL = process.env.LLM_MODEL ?? "claude-sonnet-4-6";

const SYSTEM = `Tu es l'assistant design de l'agence Équinoxes (Reims), connecté à Penpot via MCP.

Charte graphique Équinoxes :
- Couleur principale : #1e1f34 (bleu nuit)
- Couleur accent : #3ce65f (vert électrique)
- Titre : Raleway Semi-Bold 600
- Sous-titre : Roboto Condensed Light 300
- Corps : Montserrat Light 300

Tu crées des maquettes directement dans Penpot, appliques la charte Équinoxes, et réponds en français de façon concise et professionnelle.`;

async function callMCP(tool: string, input: Record<string, unknown>) {
  try {
    const res = await fetch(`${PENPOT_MCP_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: tool, arguments: input },
      }),
    });
    const data = await res.json();
    return JSON.stringify(data.result ?? "OK");
  } catch {
    return "MCP non disponible";
  }
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM,
          messages,
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ type: "text", text: event.delta.text });
          }
        }

        const final = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM,
          messages,
        });

        for (const block of final.content) {
          if (block.type === "tool_use") {
            send({ type: "tool_start", tool: block.name });
            const result = await callMCP(block.name, block.input as Record<string, unknown>);
            send({ type: "tool_done", tool: block.name, result });
          }
        }
      } catch (err) {
        send({ type: "error", message: String(err) });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
