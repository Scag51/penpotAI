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

Charte graphique Équinoxes :
- Couleur principale : #1e1f34 (bleu nuit)
- Couleur accent : #3ce65f (vert électrique)
- Titre : Raleway Semi-Bold
- Corps : Montserrat Light

Quand on te demande de créer du contenu WordPress, utilise les outils disponibles.
Génère du contenu Gutenberg structuré avec des blocs natifs WordPress.
Donne toujours l'URL de prévisualisation après création.
Réponds en français, de façon concise et professionnelle.`;

const WP_TOOLS: Anthropic.Tool[] = [
  {
    name: "wp_create_page",
    description: "Crée une page WordPress avec du contenu Gutenberg",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Titre de la page" },
        content: { type: "string", description: "Contenu Gutenberg (blocs HTML)" },
        status: { type: "string", enum: ["publish", "draft"] },
        slug: { type: "string", description: "Slug URL" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "wp_create_post",
    description: "Crée un article WordPress",
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
    description: "Met à jour une page WordPress existante",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        content: { type: "string" },
        status: { type: "string", enum: ["publish", "draft"] },
      },
      required: ["id"],
    },
  },
  {
    name: "wp_list_pages",
    description: "Liste les pages WordPress existantes",
    input_schema: {
      type: "object" as const,
      properties: {
        per_page: { type: "number" },
      },
    },
  },
  {
    name: "wp_list_posts",
    description: "Liste les articles WordPress existants",
    input_schema: {
      type: "object" as const,
      properties: {
        per_page: { type: "number" },
      },
    },
  },
  {
    name: "wp_get_site_info",
    description: "Récupère les informations du site WordPress",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

async function executeWpTool(name: string, input: Record<string, unknown>): Promise<string> {
  const headers = {
    "Authorization": `Basic ${WP_AUTH}`,
    "Content-Type": "application/json",
  };

  try {
    switch (name) {
      case "wp_create_page": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/pages`, {
          method: "POST", headers,
          body: JSON.stringify({ title: input.title, content: input.content, status: input.status ?? "publish", slug: input.slug }),
        });
        const data = await res.json();
        if (!res.ok) return `Erreur: ${JSON.stringify(data)}`;
        return JSON.stringify({ id: data.id, title: data.title?.rendered, url: data.link, preview: `${WP_URL}/?page_id=${data.id}&preview=true`, status: data.status });
      }
      case "wp_create_post": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
          method: "POST", headers,
          body: JSON.stringify({ title: input.title, content: input.content, status: input.status ?? "publish", excerpt: input.excerpt }),
        });
        const data = await res.json();
        if (!res.ok) return `Erreur: ${JSON.stringify(data)}`;
        return JSON.stringify({ id: data.id, title: data.title?.rendered, url: data.link, status: data.status });
      }
      case "wp_update_page": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/pages/${input.id}`, {
          method: "POST", headers,
          body: JSON.stringify({ title: input.title, content: input.content, status: input.status }),
        });
        const data = await res.json();
        if (!res.ok) return `Erreur: ${JSON.stringify(data)}`;
        return JSON.stringify({ id: data.id, url: data.link, status: data.status });
      }
      case "wp_list_pages": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/pages?per_page=${input.per_page ?? 10}&_fields=id,title,link,status`, { headers });
        const data = await res.json();
        return JSON.stringify(data.map((p: Record<string, unknown>) => ({ id: p.id, title: (p.title as Record<string, unknown>)?.rendered, url: p.link, status: p.status })));
      }
      case "wp_list_posts": {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=${input.per_page ?? 10}&_fields=id,title,link,status`, { headers });
        const data = await res.json();
        return JSON.stringify(data.map((p: Record<string, unknown>) => ({ id: p.id, title: (p.title as Record<string, unknown>)?.rendered, url: p.link, status: p.status })));
      }
      case "wp_get_site_info": {
        const res = await fetch(`${WP_URL}/wp-json`, { headers });
        const data = await res.json();
        return JSON.stringify({ name: data.name, description: data.description, url: data.url });
      }
      default: return `Outil inconnu: ${name}`;
    }
  } catch (err) {
    return `Erreur connexion WordPress: ${err}`;
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
        let continueLoop = true;

        while (continueLoop) {
          const response = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM,
            messages: currentMessages,
            tools: WP_TOOLS,
          });

          for (const block of response.content) {
            if (block.type === "text") {
              send({ type: "text", text: block.text });
            }
          }

          if (response.stop_reason === "tool_use") {
            const assistantMsg = { role: "assistant" as const, content: response.content };
            currentMessages = [...currentMessages, assistantMsg];
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of response.content) {
              if (block.type === "tool_use") {
                send({ type: "tool_start", tool: block.name, input: block.input });
                const result = await executeWpTool(block.name, block.input as Record<string, unknown>);
                try {
                  send({ type: "tool_done", tool: block.name, result: JSON.parse(result) });
                } catch {
                  send({ type: "tool_done", tool: block.name, result });
                }
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
              }
            }

            currentMessages = [...currentMessages, { role: "user" as const, content: toolResults }];
          } else {
            continueLoop = false;
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
