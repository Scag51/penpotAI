import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const WP_MCP_URL = process.env.WORDPRESS_MCP_URL ?? "http://wordpress-mcp:8787/mcp";
const MODEL = process.env.LLM_MODEL ?? "claude-sonnet-4-6";

const SYSTEM = `Tu es l'assistant développeur web de l'agence Équinoxes (Reims).
Tu es connecté à un WordPress via MCP et tu crées des sites complets en Gutenberg.

Charte graphique Équinoxes par défaut :
- Couleur principale : #1e1f34 (bleu nuit)
- Couleur accent : #3ce65f (vert électrique)
- Titre : Raleway Semi-Bold
- Corps : Montserrat Light

Quand on te demande de créer du contenu WordPress :
1. Utilise les outils wordpress-mcp pour créer les pages/articles
2. Génère du contenu Gutenberg structuré (blocs natifs)
3. Applique une mise en page professionnelle
4. Confirme ce qui a été créé avec l'URL de prévisualisation

Blocs Gutenberg que tu maîtrises :
- core/heading, core/paragraph, core/image
- core/columns, core/column
- core/cover, core/buttons, core/button
- core/group, core/separator
- core/list, core/quote

Réponds en français, de façon concise et professionnelle.
Quand tu crées une page, donne toujours l'URL de prévisualisation sur mk.qoma.fr.`;

async function callWordPressMCP(tool: string, input: Record<string, unknown>) {
  try {
    const res = await fetch(WP_MCP_URL, {
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
  } catch (err) {
    return `Erreur MCP WordPress: ${err}`;
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
            const result = await callWordPressMCP(
              block.name,
              block.input as Record<string, unknown>
            );
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
