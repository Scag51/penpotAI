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

const SYSTEM = `Tu es l'assistant développeur web de l'agence Équinoxes (Reims).
Tu es connecté directement à WordPress via REST API sur ${WP_URL}.

IMPORTANT - Instructions de comportement :
1. Commence TOUJOURS par appeler wp_get_site_info puis wp_list_pages pour connaître l'état du site
2. Utilise wp_create_page pour créer une NOUVELLE page
3. Utilise wp_update_page pour modifier une page EXISTANTE (quand l'ID est connu)
4. Après chaque action WordPress, confirme ce qui a été fait avec l'URL directe
5. Si une erreur survient, explique-la clairement et propose une solution
6. Génère du contenu Gutenberg riche avec des blocs variés (cover, columns, group, heading, paragraph, buttons)
7. Termine TOUJOURS par un résumé de ce qui a été créé avec les URLs

Style WordPress Gutenberg :
- Utilise des blocs core/cover pour les heroes avec overlay sombre
- Utilise core/columns pour les sections en grille
- Utilise core/group avec background pour les sections colorées
- Utilise core/buttons pour les CTAs
- Couleurs : #1e1f34 (sombre), #3ce65f (accent vert), #ffffff (clair)

R�ponds en français, de façon concise et professionnelle.`;

const WP_TOOLS: Anthropic.Tool[] = [
  {
    name: "wp_get_site_info",
    description: "Récupère les informations du site WordPress (nom, URL, description)",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "wp_list_pages",
    description: "Liste toutes les pages WordPress avec leur ID, titre, statut et URL",
    input_schema: { type: "object" as const, properties: { per_page: { type: "number", description: "Nombre de pages (défaut 20)" } }, required: [] },
  },
  {
    name: "wp_list_posts",
    description: "Liste les articles WordPress avec leur ID, titre, statut et URL",
    input_schema: { type: "object" as const, properties: { per_page: { type: "number" } }, required: [] },
  },
  {
    name: "wp_create_page",
    description: "Crée une NOUVELLE page WordPress avec du contenu Gutenberg. Retourne l'ID, l'URL et le statut.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Titre de la page" },
        content: { type: "string", description: "Contenu en blocs Gutenberg HTML" },
        status: { type: "string", enum: ["publish", "draft"], description: "publish pour publier immédiatement" },
        slug: { type: "string", description: "URL slug de la page" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "wp_create_post",
    description: "Crée un NOUVEL article WordPress. Retourne l'ID, l'URL et le statut.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "Contenu en blocs Gutenberg HTML" },
        status: { type: "string", enum: ["publish", "draft"] },
        excerpt: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "wp_update_page",
    description: "Met à jour une page WordPress EXISTANTE par son ID. Retourne l'URL mise à jour.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "ID de la page à modifier" },
        title: { type: "string" },
        content: { type: "string", description: "Nouveau contenu Gutenberg HTML" },
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
        return { data: { name: d.name, description: d.description, url: d.url, wp_version: d.wp_version } };
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
    return { data: null, error: `Connexion WordPress échouée: ${err}` };
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
        let currentMessages = [...messages];
        let iteration = 0;
        const MAX_ITERATIONS = 8;

        while (iteration < MAX_ITERATIONS) {
          iteration++;

          // ── Appel Claude avec STREAMING natif ──────────────────────────
          const stream = await client.messages.stream({
            model: MODEL,
            max_tokens: 8192,
            system: SYSTEM,
            messages: currentMessages,
            tools: WP_TOOLS,
          });

          let fullText = "";
          const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

          // Stream token par token
          for await (const event of stream) {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                fullText += event.delta.text;
                send({ type: "text", text: event.delta.text });
              }
            }
            if (event.type === "content_block_start") {
              if (event.content_block.type === "tool_use") {
                send({ type: "tool_start", tool: event.content_block.name });
              }
            }
          }

          const finalMessage = await stream.finalMessage();

          // Récupérer les tool_use blocks
          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              toolUseBlocks.push(block);
            }
          }

          // ── Pas d'outils → fin ─────────────────────────────────────────
          if (finalMessage.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
            if (!fullText) {
              send({ type: "text", text: "✅ Opération terminée." });
            }
            break;
          }

          // ── Exécution des outils WordPress ─────────────────────────────
          const assistantMsg = { role: "assistant" as const, content: finalMessage.content };
          currentMessages = [...currentMessages, assistantMsg];
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of toolUseBlocks) {
            const { data, error } = await executeWpTool(block.name, block.input as Record<string, unknown>);

            if (error) {
              send({ type: "tool_error", tool: block.name, error });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Erreur: ${error}`,
                is_error: true,
              });
            } else {
              send({ type: "tool_done", tool: block.name, result: data });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(data),
              });
            }
          }

          currentMessages = [...currentMessages, { role: "user" as const, content: toolResults }];
        }

        if (iteration >= MAX_ITERATIONS) {
          send({ type: "text", text: "\n\n⚠️ Limite d'itérations atteinte. Vérifiez le résultat sur WordPress." });
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
