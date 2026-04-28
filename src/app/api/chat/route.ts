import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.LLM_MODEL ?? "claude-sonnet-4-6";
const WP_URL = process.env.WORDPRESS_SITE_URL ?? "https://mk.qoma.fr";
const WP_USER = process.env.WORDPRESS_USERNAME ?? "mk";
const WP_PASS = process.env.WORDPRESS_APP_PASSWORD ?? "";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64");

// Tarifs Claude Sonnet 4 ($/million tokens)
const PRICE_INPUT = 3.0;
const PRICE_OUTPUT = 15.0;

const SYSTEM = `Tu es l'assistant développeur web de l'agence Equinoxes (Reims).
Tu es connecte directement a WordPress via REST API sur ${WP_URL}.

Instructions :
1. Commence par wp_get_site_info puis wp_list_pages pour connaitre l'etat du site
2. Utilise wp_create_page pour une NOUVELLE page, wp_update_page pour MODIFIER une existante
3. Apres chaque action, confirme avec l'URL
4. Si erreur, explique clairement et propose une solution
5. Genere du contenu Gutenberg concis (max 40 blocs par page)
6. Termine par un resume avec les URLs

Style Gutenberg : blocs core/cover pour heroes, core/columns pour grilles, core/buttons pour CTAs.
Couleurs : #1e1f34 (sombre), #3ce65f (vert), #ffffff (clair).
Reponds en francais, de facon concise.`;

const WP_TOOLS: Anthropic.Tool[] = [
  {
    name: "wp_get_site_info",
    description: "Recupere les informations du site WordPress",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "wp_list_pages",
    description: "Liste toutes les pages WordPress avec ID, titre, statut et URL",
    input_schema: { type: "object" as const, properties: { per_page: { type: "number" } }, required: [] },
  },
  {
    name: "wp_list_posts",
    description: "Liste les articles WordPress",
    input_schema: { type: "object" as const, properties: { per_page: { type: "number" } }, required: [] },
  },
  {
    name: "wp_create_page",
    description: "Cree une NOUVELLE page WordPress avec contenu Gutenberg. Retourne ID et URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "Blocs Gutenberg HTML" },
        status: { type: "string", enum: ["publish", "draft"] },
        slug: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "wp_create_post",
    description: "Cree un NOUVEL article WordPress. Retourne ID et URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        status: { type: "string", enum: ["publish", "draft"] },
        excerpt: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "wp_update_page",
    description: "Met a jour une page WordPress EXISTANTE par son ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "ID de la page" },
        title: { type: "string" },
        content: { type: "string" },
        status: { type: "string", enum: ["publish", "draft"] },
      },
      required: ["id"],
    },
  },
];

async function executeWpTool(name: string, input: Record<string, unknown>): Promise<{ data: unknown; error?: string }> {
  const headers = { "Authorization": `Basic ${WP_AUTH}`, "Content-Type": "application/json" };
  try {
    switch (name) {
      case "wp_get_site_info": {
        const res = await fetch(`${WP_URL}/wp-json`, { headers });
        if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
        const d = await res.json();
        return { data: { name: d.name, description: d.description, url: d.url } };
      }
      case "wp_list_pages": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/pages?per_page=${input.per_page ?? 20}&_fields=id,title,link,status`, { headers });
        if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
        const d = await res.json();
        return { data: d.map((p: Record<string, unknown>) => ({ id: p.id, title: (p.title as Record<string, unknown>)?.rendered, url: p.link, status: p.status })) };
      }
      case "wp_list_posts": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=${input.per_page ?? 10}&_fields=id,title,link,status`, { headers });
        if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
        const d = await res.json();
        return { data: d.map((p: Record<string, unknown>) => ({ id: p.id, title: (p.title as Record<string, unknown>)?.rendered, url: p.link, status: p.status })) };
      }
      case "wp_create_page": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/pages`, {
          method: "POST", headers,
          body: JSON.stringify({ title: input.title, content: input.content, status: input.status ?? "publish", slug: input.slug }),
        });
        const d = await res.json();
        if (!res.ok) return { data: null, error: `WordPress: ${d.message ?? JSON.stringify(d)}` };
        return { data: { id: d.id, title: d.title?.rendered, url: d.link, status: d.status } };
      }
      case "wp_create_post": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
          method: "POST", headers,
          body: JSON.stringify({ title: input.title, content: input.content, status: input.status ?? "publish", excerpt: input.excerpt }),
        });
        const d = await res.json();
        if (!res.ok) return { data: null, error: `WordPress: ${d.message ?? JSON.stringify(d)}` };
        return { data: { id: d.id, title: d.title?.rendered, url: d.link, status: d.status } };
      }
      case "wp_update_page": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/pages/${input.id}`, {
          method: "POST", headers,
          body: JSON.stringify({ title: input.title, content: input.content, status: input.status }),
        });
        const d = await res.json();
        if (!res.ok) return { data: null, error: `WordPress: ${d.message ?? JSON.stringify(d)}` };
        return { data: { id: d.id, title: d.title?.rendered, url: d.link, status: d.status } };
      }
      default:
        return { data: null, error: `Outil inconnu: ${name}` };
    }
  } catch (err) {
    return { data: null, error: `Connexion WordPress echouee: ${err}` };
  }
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      // Compteurs globaux de tokens et cout
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      try {
        let currentMessages = [...messages];
        let iteration = 0;
        const MAX_ITERATIONS = 8;

        while (iteration < MAX_ITERATIONS) {
          iteration++;

          // Heartbeat toutes les 8s pour eviter timeout Traefik
          const heartbeatInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch { /* connexion fermee */ }
          }, 8000);

          let iterInputTokens = 0;
          let iterOutputTokens = 0;

          try {
            const stream = await client.messages.stream({
              model: MODEL,
              max_tokens: 8192,
              system: SYSTEM,
              messages: currentMessages,
              tools: WP_TOOLS,
            });

            const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

            // Stream token par token
            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                send({ type: "text", text: event.delta.text });
              }
              if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
                send({ type: "tool_start", tool: event.content_block.name });
              }
              if (event.type === "message_delta" && event.usage) {
                iterOutputTokens = event.usage.output_tokens ?? 0;
              }
            }

            clearInterval(heartbeatInterval);
            const finalMessage = await stream.finalMessage();

            // Tokens de cette iteration
            iterInputTokens = finalMessage.usage?.input_tokens ?? 0;
            iterOutputTokens = finalMessage.usage?.output_tokens ?? iterOutputTokens;
            totalInputTokens += iterInputTokens;
            totalOutputTokens += iterOutputTokens;

            // Cout en euros (taux USD->EUR ~0.92)
            const iterCostUsd = (iterInputTokens * PRICE_INPUT + iterOutputTokens * PRICE_OUTPUT) / 1_000_000;
            const iterCostEur = iterCostUsd * 0.92;
            const totalCostEur = (totalInputTokens * PRICE_INPUT + totalOutputTokens * PRICE_OUTPUT) / 1_000_000 * 0.92;

            // Envoi des stats (visibles dans le panneau debug)
            send({
              type: "stats",
              iteration,
              tokens: { input: iterInputTokens, output: iterOutputTokens, total: iterInputTokens + iterOutputTokens },
              cost: { iteration_eur: iterCostEur.toFixed(4), total_eur: totalCostEur.toFixed(4) },
              total_tokens: { input: totalInputTokens, output: totalOutputTokens },
            });

            // Recuperer tool_use blocks
            for (const block of finalMessage.content) {
              if (block.type === "tool_use") toolUseBlocks.push(block);
            }

            // Detecter coupure par limite de tokens
            if (finalMessage.stop_reason === "max_tokens") {
              send({ type: "text", text: "\n\n⚠️ Contenu trop long — je continue en divisant la tache..." });
              // Continuer la boucle pour que Claude reprenne
              const assistantMsg = { role: "assistant" as const, content: finalMessage.content };
              currentMessages = [...currentMessages, assistantMsg];
              currentMessages = [...currentMessages, { role: "user" as const, content: "Continue exactement ou tu t'es arrete. Termine la creation de la page et appelle wp_create_page ou wp_update_page." }];
              clearInterval(heartbeatInterval);
              continue;
            }

            // Fin si pas d'outils
            if (finalMessage.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
              // Stats finales
              send({
                type: "done_stats",
                total_tokens: totalInputTokens + totalOutputTokens,
                total_cost_eur: totalCostEur.toFixed(4),
                iterations: iteration,
              });
              break;
            }

            // Execution des outils WordPress
            const assistantMsg = { role: "assistant" as const, content: finalMessage.content };
            currentMessages = [...currentMessages, assistantMsg];
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of toolUseBlocks) {
              const { data, error } = await executeWpTool(block.name, block.input as Record<string, unknown>);
              if (error) {
                send({ type: "tool_error", tool: block.name, error });
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Erreur: ${error}`, is_error: true });
              } else {
                send({ type: "tool_done", tool: block.name, result: data });
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(data) });
              }
            }

            currentMessages = [...currentMessages, { role: "user" as const, content: toolResults }];

          } catch (iterErr) {
            clearInterval(heartbeatInterval);
            throw iterErr;
          }
        }

        if (iteration >= MAX_ITERATIONS) {
          send({ type: "text", text: "\n\n⚠️ Limite d'iterations atteinte." });
        }

      } catch (err) {
        const msg = String(err);
        send({ type: "error", message: msg });
        send({ type: "text", text: `\n\n❌ Erreur : ${msg}` });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
