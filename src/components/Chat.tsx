"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type Role = "user" | "assistant";

interface ToolCall {
  tool: string;
  status: "pending" | "done" | "error";
}

interface Message {
  id: string;
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
}

const SUGGESTIONS = [
  "Crée une page d'accueil avec hero sombre et CTA vert",
  "Liste les projets Penpot disponibles",
  "Crée un composant bouton aux couleurs Équinoxes",
  "Ajoute une section 3 colonnes services",
];

const LOGO = (
  <svg viewBox="100 100 230 200" xmlns="http://www.w3.org/2000/svg" style={{ height: 30, width: "auto" }}>
    <path fill="#3ce65f" d="M382.94,125.59c-14.85-12.16-41.08-16.6-69.32-11.94.94,3.87,1.65,7.83,2.13,11.85,29.41-4.85,50.34,1.84,59.57,9.4,3.07,2.51,6.73,6.62,6.73,11.88,0,5.54-2.36,10.28-7,14.09-11.71,9.6-35.62,11.94-63.97,6.27-16.94-3.39-40.19-9.82-64.81-16.63-51.64-14.29-115.92-32.07-161.12-32.67-23.97-.34-42.04,7.1-48.43,19.84-3.56,7.09-2.76,14.86,2.2,21.32,11.57,15.09,41.44,19.38,79.9,11.47l-.51-2.47c-.95-3.02-1.76-6.1-2.42-9.23-39.56,8.03-61.04,1.22-67.42-7.1-2.13-2.77-2.46-5.67-.99-8.6,3.15-6.28,14.92-13.47,37.51-13.2,43.66.58,107.1,18.13,158.08,32.23,25.92,7.17,48.3,13.36,65.66,16.83,10.98,2.19,21.33,3.28,30.79,3.28,18.41,0,33.47-4.09,43.16-12.04,7.46-6.12,11.41-14.21,11.41-23.4,0-7.9-3.85-15.23-11.14-21.2Z"/>
    <rect fill="#fff" x="30.82" y="281.31" width="29.72" height="6.32"/>
    <polygon fill="#fff" points="38.71 296.92 30.82 296.92 30.82 320 60.54 320 60.54 313.68 38.71 313.68 38.71 296.92"/>
    <rect fill="#fff" x="44.79" y="296.92" width="15.75" height="6.32"/>
    <rect fill="#fff" x="162.14" y="281.18" width="7.13" height="38.96"/>
    <polygon fill="#fff" points="217.69 280.87 210.55 280.87 210.55 305.64 217.69 313.9 217.69 280.87"/>
    <polygon fill="#fff" points="181.31 280.08 181.31 320.44 188.1 320.44 188.1 297.34 208.77 320.28 208.92 320.44 218.33 320.44 181.31 280.08"/>
    <rect fill="#fff" x="325.18" y="281.31" width="29.72" height="6.32"/>
    <polygon fill="#fff" points="333.06 296.92 325.18 296.92 325.18 320 354.9 320 354.9 313.68 333.06 313.68 333.06 296.92"/>
    <rect fill="#fff" x="339.15" y="296.92" width="15.75" height="6.32"/>
  </svg>
);

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Bonjour ! Je suis connecté à votre espace Penpot. Décrivez la maquette à créer et je l'applique directement sur le canvas avec la charte Équinoxes.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    const asstId = crypto.randomUUID();
    const asstMsg: Message = { id: asstId, role: "assistant", content: "", toolCalls: [] };

    setMessages((p) => [...p, userMsg, asstMsg]);
    setInput("");
    setLoading(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "text") {
              setMessages((p) => p.map((m) => m.id === asstId ? { ...m, content: m.content + ev.text } : m));
            }
            if (ev.type === "tool_start") {
              setMessages((p) => p.map((m) => m.id === asstId ? { ...m, toolCalls: [...(m.toolCalls ?? []), { tool: ev.tool, status: "pending" }] } : m));
            }
            if (ev.type === "tool_done") {
              setMessages((p) => p.map((m) => m.id === asstId ? { ...m, toolCalls: (m.toolCalls ?? []).map((tc) => tc.tool === ev.tool ? { ...tc, status: "done" } : tc) } : m));
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setMessages((p) => p.map((m) => m.id === asstId ? { ...m, content: `Erreur : ${err}` } : m));
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  return (
    <div style={s.shell}>
      {/* HEADER */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          {LOGO}
          <div>
            <div style={s.brandName}>ÉQUINOXES</div>
            <div style={s.brandSub}>STUDIO IA — DESIGN</div>
          </div>
        </div>
        <div style={s.badge}>
          <span style={s.dot} />
          <span style={s.badgeLabel}>Penpot connecté</span>
        </div>
      </header>

      {/* MESSAGES */}
      <div style={s.messages}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ ...s.msgRow, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "assistant" && <div style={s.avatarAI}><svg viewBox="200 270 30 60" width="16"><polygon fill="#3ce65f" points="217.69 280.87 210.55 280.87 210.55 305.64 217.69 313.9 217.69 280.87"/><polygon fill="#3ce65f" points="181.31 280.08 181.31 320.44 188.1 320.44 188.1 297.34 208.77 320.28 208.92 320.44 218.33 320.44 181.31 280.08"/></svg></div>}
            <div style={{ maxWidth: "85%" }}>
              <div style={s.msgLabel}>{msg.role === "assistant" ? "Assistant Équinoxes" : "Vous"}</div>
              {(msg.toolCalls ?? []).map((tc, i) => (
                <div key={i} style={{ ...s.toolCall, borderColor: tc.status === "done" ? "rgba(60,230,95,0.3)" : tc.status === "error" ? "rgba(255,80,80,0.3)" : "rgba(255,200,0,0.3)", color: tc.status === "done" ? "#3ce65f" : tc.status === "error" ? "#ff5050" : "#ffc800" }}>
                  {tc.status === "pending" ? "⏳" : tc.status === "done" ? "✅" : "❌"} {tc.tool.replace("penpot_", "")}
                </div>
              ))}
              <div style={msg.role === "assistant" ? s.bubbleAI : s.bubbleUser}>
                {msg.content || (loading && msg.role === "assistant" && (
                  <span style={s.typing}><span /><span /><span /></span>
                ))}
              </div>
            </div>
            {msg.role === "user" && <div style={s.avatarUser}>CS</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div style={s.inputArea}>
        {messages.length <= 2 && (
          <div style={s.suggestions}>
            {SUGGESTIONS.map((s) => (
              <button key={s} style={chip} onClick={() => sendMessage(s)}>{s}</button>
            ))}
          </div>
        )}
        <div style={s.inputRow}>
          <textarea
            style={s.textarea}
            placeholder="Décrivez votre maquette ou demandez une modification…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            rows={1}
            disabled={loading}
          />
          <button style={{ ...s.sendBtn, opacity: loading || !input.trim() ? 0.4 : 1 }} onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="#1e1f34"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
          </button>
        </div>
        <p style={s.hint}>Entrée pour envoyer · Shift+Entrée pour sauter une ligne</p>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes blink { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
        div[style*="typing"] span { width:5px;height:5px;border-radius:50%;background:#3ce65f;display:inline-block;margin:0 2px;animation:blink 1.2s infinite; }
        div[style*="typing"] span:nth-child(2){animation-delay:.2s}
        div[style*="typing"] span:nth-child(3){animation-delay:.4s}
        textarea:focus{outline:none;}
        textarea::placeholder{color:rgba(255,255,255,0.25);}
        button:hover:not(:disabled){filter:brightness(1.1);}
      `}</style>
    </div>
  );
}

const chip: React.CSSProperties = {
  fontFamily: "'Roboto Condensed', sans-serif",
  fontWeight: 300,
  fontSize: 11,
  padding: "4px 12px",
  borderRadius: 20,
  border: "1px solid rgba(60,230,95,0.25)",
  color: "rgba(60,230,95,0.8)",
  background: "rgba(60,230,95,0.05)",
  cursor: "pointer",
  letterSpacing: "0.03em",
};

const s: Record<string, React.CSSProperties> = {
  shell: { display:"flex", flexDirection:"column", height:"100vh", background:"#0f1020", fontFamily:"'Montserrat',sans-serif", fontWeight:300 },
  header: { background:"#1e1f34", borderBottom:"1px solid rgba(60,230,95,0.15)", padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 },
  headerLeft: { display:"flex", alignItems:"center", gap:12 },
  brandName: { fontFamily:"'Raleway',sans-serif", fontWeight:600, fontSize:15, color:"#fff", letterSpacing:"0.04em" },
  brandSub: { fontFamily:"'Roboto Condensed',sans-serif", fontWeight:300, fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:"0.1em" },
  badge: { display:"flex", alignItems:"center", gap:6, background:"rgba(60,230,95,0.1)", border:"1px solid rgba(60,230,95,0.25)", borderRadius:20, padding:"4px 12px" },
  dot: { width:6, height:6, borderRadius:"50%", background:"#3ce65f", animation:"pulse 2s infinite", display:"inline-block" },
  badgeLabel: { fontFamily:"'Roboto Condensed',sans-serif", fontWeight:300, fontSize:11, color:"#3ce65f", letterSpacing:"0.05em" },
  messages: { flex:1, overflowY:"auto", padding:"20px 16px", display:"flex", flexDirection:"column", gap:14 },
  msgRow: { display:"flex", gap:10, alignItems:"flex-start" },
  avatarAI: { width:30, height:30, borderRadius:"50%", background:"#1e1f34", border:"1px solid rgba(60,230,95,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:18 },
  avatarUser: { width:30, height:30, borderRadius:"50%", background:"#3ce65f", color:"#1e1f34", fontFamily:"'Raleway',sans-serif", fontWeight:600, fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:18 },
  msgLabel: { fontFamily:"'Roboto Condensed',sans-serif", fontWeight:300, fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:4 },
  toolCall: { display:"flex", alignItems:"center", gap:8, padding:"5px 12px", borderRadius:8, border:"1px solid", fontSize:11, fontFamily:"'Roboto Condensed',sans-serif", fontWeight:300, marginBottom:4 },
  bubbleAI: { padding:"10px 14px", borderRadius:14, borderTopLeftRadius:4, background:"#1e1f34", border:"1px solid rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.85)", fontSize:13, lineHeight:1.7, fontFamily:"'Montserrat',sans-serif", fontWeight:300 },
  bubbleUser: { padding:"10px 14px", borderRadius:14, borderTopRightRadius:4, background:"#3ce65f", color:"#1e1f34", fontSize:13, lineHeight:1.7, fontFamily:"'Montserrat',sans-serif", fontWeight:400 },
  typing: { display:"inline-flex", gap:4, alignItems:"center", padding:"4px 0" },
  inputArea: { borderTop:"1px solid rgba(255,255,255,0.06)", padding:"12px 16px 16px", background:"#1e1f34", flexShrink:0 },
  suggestions: { display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 },
  inputRow: { display:"flex", alignItems:"flex-end", gap:8, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"8px 10px" },
  textarea: { flex:1, border:"none", background:"transparent", fontFamily:"'Montserrat',sans-serif", fontWeight:300, fontSize:13, color:"rgba(255,255,255,0.85)", resize:"none", lineHeight:1.5, maxHeight:120 },
  sendBtn: { width:30, height:30, borderRadius:8, background:"#3ce65f", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  hint: { fontFamily:"'Roboto Condensed',sans-serif", fontWeight:300, fontSize:10, color:"rgba(255,255,255,0.2)", textAlign:"center", marginTop:8, letterSpacing:"0.04em" },
};
