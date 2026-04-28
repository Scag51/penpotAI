"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Role = "user" | "assistant";
type Panel = "chat" | "actions" | "guide";
type LoadState = "idle" | "thinking" | "calling" | "error";

interface ToolResult { url?: string; id?: number; title?: string; status?: string; [key: string]: unknown; }
interface ToolCall { tool: string; status: "pending" | "done" | "error"; result?: ToolResult; error?: string; }
interface Message { id: string; role: Role; content: string; image?: string; toolCalls?: ToolCall[]; }
interface Stats { iteration: number; tokens: { input: number; output: number; total: number }; cost: { iteration_eur: string; total_eur: string }; total_tokens: { input: number; output: number }; }
interface DoneStats { total_tokens: number; total_cost_eur: string; iterations: number; }

const LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 80 425.2 220" style={{ height: 24, width: "auto" }}>
    <path fill="#3ce65f" d="M382.94,125.59c-14.85-12.16-41.08-16.6-69.32-11.94.94,3.87,1.65,7.83,2.13,11.85,29.41-4.85,50.34,1.84,59.57,9.4,3.07,2.51,6.73,6.62,6.73,11.88,0,5.54-2.36,10.28-7,14.09-11.71,9.6-35.62,11.94-63.97,6.27-16.94-3.39-40.19-9.82-64.81-16.63-51.64-14.29-115.92-32.07-161.12-32.67-23.97-.34-42.04,7.1-48.43,19.84-3.56,7.09-2.76,14.86,2.2,21.32,11.57,15.09,41.44,19.38,79.9,11.47l-.51-2.47c-.95-3.02-1.76-6.1-2.42-9.23-39.56,8.03-61.04,1.22-67.42-7.1-2.13-2.77-2.46-5.67-.99-8.6,3.15-6.28,14.92-13.47,37.51-13.2,43.66.58,107.1,18.13,158.08,32.23,25.92,7.17,48.3,13.36,65.66,16.83,10.98,2.19,21.33,3.28,30.79,3.28,18.41,0,33.47-4.09,43.16-12.04,7.46-6.12,11.41-14.21,11.41-23.4,0-7.9-3.85-15.23-11.14-21.2Z"/>
    <rect fill="#1e2040" x="30.82" y="281.31" width="29.72" height="6.32"/>
    <polygon fill="#1e2040" points="38.71 296.92 30.82 296.92 30.82 320 60.54 320 60.54 313.68 38.71 313.68 38.71 296.92"/>
    <rect fill="#1e2040" x="44.79" y="296.92" width="15.75" height="6.32"/>
    <rect fill="#1e2040" x="162.14" y="281.18" width="7.13" height="38.96"/>
    <polygon fill="#1e2040" points="217.69 280.87 210.55 280.87 210.55 305.64 217.69 313.9 217.69 280.87"/>
    <polygon fill="#1e2040" points="181.31 280.08 181.31 320.44 188.1 320.44 188.1 297.34 208.77 320.28 208.92 320.44 218.33 320.44 181.31 280.08"/>
    <rect fill="#1e2040" x="325.18" y="281.31" width="29.72" height="6.32"/>
    <polygon fill="#1e2040" points="333.06 296.92 325.18 296.92 325.18 320 354.9 320 354.9 313.68 333.06 313.68 333.06 296.92"/>
    <rect fill="#1e2040" x="339.15" y="296.92" width="15.75" height="6.32"/>
  </svg>
);

const ACTIONS = [
  { cat: "Pages", items: [
    { label: "Accueil", desc: "Hero + services + contact", prompt: "Cree une page d'accueil avec hero, 3 services en colonnes, section a propos et bouton contact. Publie-la." },
    { label: "A propos", desc: "Presentation et equipe", prompt: "Cree une page A propos avec presentation, valeurs et equipe. Publie-la." },
    { label: "Services", desc: "Grille de prestations", prompt: "Cree une page Services avec 6 prestations en grille avec titre et description. Publie-la." },
    { label: "Contact", desc: "Coordonnees et horaires", prompt: "Cree une page Contact avec coordonnees completes et horaires. Publie-la." },
    { label: "Portfolio", desc: "Grille de realisations", prompt: "Cree une page Portfolio avec 6 realisations en cartes. Publie-la." },
    { label: "Mentions legales", desc: "Page legale obligatoire", prompt: "Cree une page Mentions legales complete selon la loi francaise. Publie-la." },
  ]},
  { cat: "Contenu", items: [
    { label: "Article blog", desc: "Article structure", prompt: "Cree un article de blog avec introduction, 3 sections H2 et conclusion. Publie-le." },
    { label: "FAQ", desc: "Questions frequentes", prompt: "Cree une page FAQ avec 8 questions-reponses. Publie-la." },
    { label: "Temoignages", desc: "Avis clients", prompt: "Cree une page Temoignages avec 6 avis clients. Publie-la." },
  ]},
  { cat: "Gestion", items: [
    { label: "Mes pages", desc: "Voir toutes les pages", prompt: "Liste toutes les pages existantes sur le site WordPress avec leur statut." },
    { label: "Mes articles", desc: "Voir tous les articles", prompt: "Liste tous les articles publies sur le site WordPress." },
    { label: "Infos du site", desc: "Nom, URL, version", prompt: "Donne-moi les informations generales du site WordPress." },
  ]},
];

const GUIDE = [
  { title: "Decrivez en langage naturel", desc: "Ex : \"Cree une page d'accueil pour un plombier a Lyon avec 4 services et les tarifs\"." },
  { title: "Utilisez les actions rapides", desc: "Cliquez sur Actions pour choisir un type de page. L'IA cree directement un contenu professionnel." },
  { title: "Envoyez une maquette", desc: "Glissez-deposez ou collez (Ctrl+V) n'importe quelle image. L'IA analyse et reproduit en WordPress." },
  { title: "Suivez le statut en temps reel", desc: "La barre indique : vert = reflexion, bleu = creation WordPress, rouge = erreur." },
  { title: "Affinez a votre guise", desc: "Apres creation : \"Rends le titre plus grand\", \"Ajoute des temoignages\", \"Change la couleur\"." },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", content: "Bonjour ! Je suis votre assistant de creation WordPress.\n\nDecrivez ce que vous souhaitez, choisissez une action rapide, ou envoyez une maquette — je cree directement sur votre site." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [currentTool, setCurrentTool] = useState<string | undefined>();
  const [panel, setPanel] = useState<Panel>("chat");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingImageName, setPendingImageName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [activeCat, setActiveCat] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [doneStats, setDoneStats] = useState<DoneStats | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = (e) => { setPendingImage(e.target?.result as string); setPendingImageName(file.name); };
    r.readAsDataURL(file);
  };

  const toolLabel = (tool: string) => ({ wp_create_page: "Creation de la page", wp_create_post: "Creation de l'article", wp_update_page: "Mise a jour de la page", wp_list_pages: "Lecture des pages", wp_list_posts: "Lecture des articles", wp_get_site_info: "Lecture des infos" }[tool] ?? tool.replace("wp_", "").replace(/_/g, " "));

  const sendMessage = useCallback(async (text: string, imageData?: string) => {
    if ((!text.trim() && !imageData) || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() || "Analyse cette maquette et reproduis-la sur WordPress", ...(imageData ? { image: imageData } : {}) };
    const asstId = crypto.randomUUID();
    setMessages((p) => [...p, userMsg, { id: asstId, role: "assistant", content: "", toolCalls: [] }]);
    setInput(""); setPendingImage(null); setPendingImageName(""); setLoading(true); setLoadState("thinking"); setCurrentTool(undefined); setPanel("chat"); setStats(null); setDoneStats(null);
    const apiMessages = [...messages, userMsg].map((m) => m.image ? { role: m.role, content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: m.image.split(",")[1] } }, { type: "text", text: m.content }] } : { role: m.role, content: m.content });
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: apiMessages }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "text") { setLoadState("thinking"); setMessages((p) => p.map((m) => m.id === asstId ? { ...m, content: m.content + ev.text } : m)); }
            if (ev.type === "tool_start") { setLoadState("calling"); setCurrentTool(ev.tool); setMessages((p) => p.map((m) => m.id === asstId ? { ...m, toolCalls: [...(m.toolCalls ?? []), { tool: ev.tool, status: "pending" }] } : m)); }
            if (ev.type === "tool_done") { setLoadState("thinking"); setCurrentTool(undefined); setMessages((p) => p.map((m) => m.id === asstId ? { ...m, toolCalls: (m.toolCalls ?? []).map((tc) => tc.tool === ev.tool ? { ...tc, status: "done", result: ev.result as ToolResult } : tc) } : m)); }
            if (ev.type === "tool_error") { setLoadState("error"); setMessages((p) => p.map((m) => m.id === asstId ? { ...m, toolCalls: (m.toolCalls ?? []).map((tc) => tc.tool === ev.tool ? { ...tc, status: "error", error: ev.error } : tc) } : m)); }
            if (ev.type === "error") { setLoadState("error"); setMessages((p) => p.map((m) => m.id === asstId ? { ...m, content: m.content || `Erreur : ${ev.message}` } : m)); }
            if (ev.type === "stats") { setStats(ev as unknown as Stats); }
            if (ev.type === "done_stats") { setDoneStats(ev as unknown as DoneStats); }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setLoadState("error");
      setMessages((p) => p.map((m) => m.id === asstId ? { ...m, content: `Impossible de joindre le serveur.\nDetail : ${err}` } : m));
    } finally {
      setLoading(false);
      setLoadState("idle");
    }
  }, [messages, loading]);

  const isReady = !loading && (!!input.trim() || !!pendingImage);

  const statusCfg = {
    thinking: { c: "#059669", bg: "#ecfdf5", b: "#a7f3d0", t: "Claude analyse votre demande..." },
    calling: { c: "#2563eb", bg: "#eff6ff", b: "#bfdbfe", t: `WordPress : ${toolLabel(currentTool ?? "")}...` },
    error: { c: "#dc2626", bg: "#fef2f2", b: "#fecaca", t: "Une erreur est survenue. Reformulez ou reessayez." },
    idle: null,
  }[loadState];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#f8faff", fontFamily: "'Inter', system-ui, sans-serif", color: "#1e2040", fontSize: 14 }}>

      <header style={{ background: "#fff", borderBottom: "1px solid #e8eaf2", padding: "0 18px", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {LOGO}
          <div style={{ width: 1, height: 18, background: "#e8eaf2" }} />
          <span style={{ fontSize: 12, color: "#9194a8", fontWeight: 500 }}>Studio WordPress</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {doneStats && (
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
              {doneStats.total_cost_eur}EUR - {doneStats.total_tokens.toLocaleString()} tokens
            </span>
          )}
          <button onClick={() => setShowDebug(p => !p)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e0e7ef", background: showDebug ? "#eff6ff" : "#fff", cursor: "pointer", fontSize: 12, color: showDebug ? "#2563eb" : "#9194a8", fontWeight: 600 }}>dbg</button>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#059669", fontWeight: 600, background: "#ecfdf5", padding: "4px 11px", borderRadius: 20, border: "1px solid #a7f3d0" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            WordPress actif
          </div>
        </div>
      </header>

      {showDebug && stats && (
        <div style={{ background: "#1e2040", color: "#94a3b8", padding: "6px 18px", fontSize: 11, fontFamily: "monospace", display: "flex", gap: 20, flexWrap: "wrap", flexShrink: 0 }}>
          <span style={{ color: "#e2e8f0" }}>Iter {stats.iteration}</span>
          <span>Input: {stats.tokens.input.toLocaleString()} tk</span>
          <span>Output: {stats.tokens.output.toLocaleString()} tk</span>
          <span style={{ color: "#3ce65f" }}>Ce prompt: {stats.cost.iteration_eur}EUR</span>
          <span style={{ color: "#3ce65f" }}>Session: {stats.cost.total_eur}EUR</span>
          <span>Total: {(stats.total_tokens.input + stats.total_tokens.output).toLocaleString()} tk</span>
        </div>
      )}

      {statusCfg && (
        <div style={{ background: statusCfg.bg, borderBottom: `1px solid ${statusCfg.b}`, padding: "7px 18px", display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
          {loadState !== "error"
            ? <span style={{ display: "flex", gap: 3 }}>{[0, 150, 300].map((d, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: statusCfg.c, display: "inline-block", animation: `dot 1s ${d}ms ease-in-out infinite` }} />)}</span>
            : <span style={{ fontSize: 14 }}>(!)</span>}
          <span style={{ fontSize: 12, color: statusCfg.c, fontWeight: 500 }}>{statusCfg.t}</span>
        </div>
      )}

      <nav style={{ display: "flex", gap: 2, padding: "10px 16px 0", background: "#fff", borderBottom: "1px solid #e8eaf2", flexShrink: 0 }}>
        {([{ id: "chat", label: "Conversation" }, { id: "actions", label: "Actions rapides" }, { id: "guide", label: "Guide" }] as { id: Panel; label: string }[]).map((n) => (
          <button key={n.id} onClick={() => setPanel(n.id)} style={{ padding: "6px 14px", border: "none", borderRadius: "8px 8px 0 0", background: panel === n.id ? "#f8faff" : "transparent", color: panel === n.id ? "#1e2040" : "#9194a8", fontWeight: panel === n.id ? 600 : 400, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", borderBottom: panel === n.id ? "2px solid #2563eb" : "2px solid transparent" }}>
            {n.label}
          </button>
        ))}
      </nav>

      {panel === "chat" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px", display: "flex", flexDirection: "column" }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}>
          {dragOver && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(37,99,235,0.05)", border: "2px dashed #2563eb", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ background: "#fff", padding: "16px 30px", borderRadius: 12, color: "#2563eb", fontWeight: 700, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>Deposer l'image ici</div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: "flex", gap: 10, maxWidth: "84%", alignSelf: msg.role === "user" ? "flex-end" : "flex-start", flexDirection: msg.role === "user" ? "row-reverse" : "row", marginBottom: 16 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", background: msg.role === "assistant" ? "#eef2ff" : "#1e2040", border: msg.role === "assistant" ? "1px solid #e0e7ff" : "none", fontSize: 11, fontWeight: 700, color: msg.role === "assistant" ? "#4f46e5" : "#fff" }}>
                {msg.role === "assistant" ? "IA" : "CS"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: "#b0b4c8", letterSpacing: "0.05em", textTransform: "uppercase" as const, marginLeft: 2, textAlign: msg.role === "user" ? "right" : "left" }}>
                  {msg.role === "assistant" ? "Assistant WordPress" : "Vous"}
                </span>
                {msg.image && <img src={msg.image} alt="" style={{ maxWidth: 200, borderRadius: 8, marginBottom: 4, border: "1px solid #e8eaf2" }} />}
                {(msg.toolCalls ?? []).map((tc, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8, marginBottom: 4, background: tc.status === "done" ? "#ecfdf5" : tc.status === "error" ? "#fef2f2" : "#eff6ff", border: `1px solid ${tc.status === "done" ? "#a7f3d0" : tc.status === "error" ? "#fecaca" : "#bfdbfe"}`, fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: tc.status === "done" ? "#059669" : tc.status === "error" ? "#dc2626" : "#2563eb" }}>
                      {tc.status === "pending" ? "[...]" : tc.status === "done" ? "[OK]" : "[ERR]"}
                    </span>
                    <span style={{ color: tc.status === "done" ? "#059669" : tc.status === "error" ? "#dc2626" : "#2563eb", fontWeight: 500 }}>
                      {tc.status === "pending" ? `${toolLabel(tc.tool)} en cours...` : tc.status === "done" ? toolLabel(tc.tool) : `Echec : ${toolLabel(tc.tool)}`}
                    </span>
                    {tc.status === "done" && tc.result?.url && (
                      <a href={tc.result.url as string} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", color: "#2563eb", fontWeight: 700, fontSize: 11, textDecoration: "none", padding: "2px 9px", background: "#dbeafe", borderRadius: 6 }}>Voir</a>
                    )}
                    {tc.status === "error" && tc.error && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: "#dc2626" }}>{String(tc.error).slice(0, 80)}</span>
                    )}
                  </div>
                ))}
                <div style={{ padding: "10px 14px", borderRadius: msg.role === "assistant" ? "4px 12px 12px 12px" : "12px 4px 12px 12px", background: msg.role === "assistant" ? "#fff" : "#1e2040", color: msg.role === "user" ? "#fff" : "#1e2040", fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const, border: msg.role === "assistant" ? "1px solid #e8eaf2" : "none", boxShadow: msg.role === "assistant" ? "0 1px 4px rgba(0,0,0,0.05)" : "none" }}>
                  {msg.content || (loading && msg.role === "assistant" && (
                    <span style={{ display: "flex", gap: 4 }}>
                      {[0, 150, 300].map((d, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block", animation: `dot 1s ${d}ms ease-in-out infinite` }} />)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {panel === "actions" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <p style={{ fontSize: 12, color: "#9194a8", marginBottom: 14 }}>Cliquez pour creer directement sur votre WordPress.</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {ACTIONS.map((a, i) => (
              <button key={i} onClick={() => setActiveCat(i)} style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${activeCat === i ? "#2563eb" : "#e0e7ef"}`, background: activeCat === i ? "#eff6ff" : "#fff", color: activeCat === i ? "#2563eb" : "#9194a8", cursor: "pointer", fontSize: 12, fontWeight: activeCat === i ? 600 : 400, fontFamily: "inherit" }}>
                {a.cat}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: 10 }}>
            {ACTIONS[activeCat].items.map((a) => (
              <button key={a.label} onClick={() => sendMessage(a.prompt)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: 14, borderRadius: 10, border: "1px solid #e8eaf2", background: "#fff", color: "#1e2040", cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2563eb"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(37,99,235,0.12)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e8eaf2"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</span>
                <span style={{ fontSize: 11, color: "#9194a8" }}>{a.desc}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 18, padding: 16, borderRadius: 10, border: "2px dashed #e0e7ef", background: "#f0f4ff", textAlign: "center" as const }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { processFile(f); setPanel("chat"); } }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Reproduire une maquette</p>
            <p style={{ fontSize: 11, color: "#9194a8", marginBottom: 12 }}>Deposez une image ou selectionnez un fichier</p>
            <button onClick={() => fileRef.current?.click()} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
              Choisir une image
            </button>
          </div>
        </div>
      )}

      {panel === "guide" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Comment creer votre site</h2>
          <p style={{ fontSize: 12, color: "#9194a8", marginBottom: 16 }}>5 etapes pour maitriser l'assistant WordPress.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
            {GUIDE.map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 10, background: "#fff", border: "1px solid #e8eaf2", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#2563eb", flexShrink: 0 }}>{i + 1}</div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{g.title}</p>
                  <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{g.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Exemples de prompts</h3>
          {[
            "Cree une page d'accueil pour un cabinet dentaire a Paris avec hero, 3 services et prise de RDV",
            "Cree une page Services pour un electricien : depannage, installation, mise aux normes",
            "Cree un article de blog sur les tendances jardinage 2026, 3 sections structurees",
            "Cree une page A propos pour une agence web de 5 personnes basee a Lyon",
          ].map((ex) => (
            <button key={ex} onClick={() => { setInput(ex); setPanel("chat"); setTimeout(() => inputRef.current?.focus(), 100); }} style={{ display: "block", width: "100%", textAlign: "left" as const, padding: "9px 12px", marginBottom: 7, borderRadius: 8, border: "1px solid #e0e7ef", background: "#fff", color: "#6b7280", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit", lineHeight: 1.5 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2563eb"; (e.currentTarget as HTMLButtonElement).style.color = "#1e2040"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e0e7ef"; (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}>
              &quot;{ex}&quot;
            </button>
          ))}
        </div>
      )}

      {pendingImage && (
        <div style={{ padding: "0 14px 8px", background: "#fff", borderTop: "1px solid #e8eaf2" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <img src={pendingImage} alt="" style={{ width: 26, height: 26, objectFit: "cover", borderRadius: 4 }} />
            <span style={{ fontSize: 11, color: "#6b7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingImageName}</span>
            <button onClick={() => { setPendingImage(null); setPendingImageName(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 0 }}>x</button>
          </div>
        </div>
      )}

      <div style={{ padding: "8px 14px 14px", background: "#fff", borderTop: "1px solid #e8eaf2", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#f8faff", border: `1.5px solid ${pendingImage ? "#2563eb" : "#e0e7ef"}`, borderRadius: 12, padding: "8px 10px", transition: "border-color 0.2s" }}>
          <button onClick={() => fileRef.current?.click()} title="Joindre une maquette" style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid #e0e7ef", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, color: "#9194a8", fontWeight: 600 }}>img</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} style={{ display: "none" }} />
          <textarea ref={inputRef} style={{ flex: 1, border: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5, color: "#1e2040", resize: "none", outline: "none", lineHeight: 1.6, maxHeight: 130 }} placeholder="Decrivez ce que vous souhaitez creer..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input, pendingImage ?? undefined); } }} onPaste={(e) => { for (const item of Array.from(e.clipboardData?.items ?? [])) { if (item.type.startsWith("image/")) { const f = item.getAsFile(); if (f) processFile(f); break; } } }} rows={1} disabled={loading} />
          <button onClick={() => sendMessage(input, pendingImage ?? undefined)} disabled={!isReady} style={{ width: 34, height: 34, borderRadius: 9, background: isReady ? "#1e2040" : "#f0f2f7", border: "none", cursor: isReady ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill={isReady ? "#fff" : "#c0c4d6"}><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
          </button>
        </div>
        <p style={{ textAlign: "center", fontSize: 10, color: "#c0c4d6", marginTop: 6 }}>Entree pour envoyer - Shift+Entree pour nouvelle ligne - Glisser ou Ctrl+V pour coller une image</p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #__next { height: 100%; }
        textarea::placeholder { color: #c0c4d6; }
        textarea:focus { outline: none; }
        @keyframes dot { 0%,60%,100%{transform:scale(0.6);opacity:0.4} 30%{transform:scale(1);opacity:1} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #e0e7ef; border-radius: 4px; }
      `}</style>
    </div>
  );
}
