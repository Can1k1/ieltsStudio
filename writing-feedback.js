import { useState, useEffect, useRef, useCallback } from "react";

// ─── Environment / Config ────────────────────────────────────────────────────
const ENV = {
  ANTHROPIC_API_URL: "https://api.anthropic.com/v1/messages",
  DEFAULT_MODEL: "claude-sonnet-4-20250514",
  MAX_TOKENS: 900,
  TEMPERATURE: 0.4,
  RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 1000,
  RATE_LIMIT_WINDOW: 60000,
  RATE_LIMIT_MAX: 5,
};

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
class RateLimiter {
  constructor(maxCalls, windowMs) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
    this.calls = [];
  }
  check() {
    const now = Date.now();
    this.calls = this.calls.filter(t => now - t < this.windowMs);
    if (this.calls.length >= this.maxCalls) {
      const oldest = this.calls[0];
      const waitMs = this.windowMs - (now - oldest);
      return { allowed: false, waitMs };
    }
    this.calls.push(now);
    return { allowed: true, waitMs: 0 };
  }
}

const rateLimiter = new RateLimiter(ENV.RATE_LIMIT_MAX, ENV.RATE_LIMIT_WINDOW);

// ─── Retry Utility ────────────────────────────────────────────────────────────
async function withRetry(fn, attempts = ENV.RETRY_ATTEMPTS) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.type === "rate_limit" || err.status === 429) throw err;
      if (i < attempts - 1) {
        const delay = ENV.RETRY_BASE_DELAY * Math.pow(2, i);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── Mock Fallback ────────────────────────────────────────────────────────────
function generateMockFeedback(text, taskType, minWords) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const lower = text.toLowerCase();
  const connectors = ["furthermore","however","therefore","moreover","consequently","in contrast","nevertheless","in addition","whereas","thus","although"];
  const found = connectors.filter(c => lower.includes(c));
  const uniqueRatio = new Set(words.map(w => w.toLowerCase())).size / Math.max(1, wc);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 8);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const complex = (text.match(/\b(which|who|although|whereas|if|when|while|despite|unless)\b/gi) || []).length;
  const clamp = x => Math.max(4, Math.min(9, Math.round(x * 2) / 2));

  let ta = 6, cc = 6, lr = 6, gra = 6;
  if (wc >= minWords) ta += 0.5;
  if (wc >= minWords * 1.15) ta += 0.5;
  if (wc < minWords * 0.75) ta -= 1;
  if (taskType === "task2" && paragraphs.length >= 4) ta += 0.5;
  if (found.length >= 4) cc += 1; else if (found.length >= 2) cc += 0.5;
  if (paragraphs.length >= 3) cc += 0.5;
  if (uniqueRatio > 0.55) lr += 0.5;
  const avgLen = wc / Math.max(1, sentences.length);
  if (avgLen >= 12 && avgLen <= 28) gra += 0.5;
  if (complex >= 3) gra += 0.5;
  if (sentences.length >= 8) gra += 0.5;

  ta = clamp(ta); cc = clamp(cc); lr = clamp(lr); gra = clamp(gra);
  const overall = clamp((ta + cc + lr + gra) / 4);

  const strengths = [
    wc >= minWords ? "You met the word-count target, supporting Task Achievement." : null,
    found.length ? `You used linking words (${found.slice(0,3).join(", ")}), which aids coherence.` : null,
    paragraphs.length >= 4 ? "The essay has a clear multi-paragraph structure." : null,
  ].filter(Boolean).join(" ") || "You addressed the task with a complete response.";

  const improvements = [
    wc < minWords ? `Increase length to at least ${minWords} words.` : null,
    found.length < 2 ? "Add more discourse markers (e.g. however, furthermore, in contrast)." : null,
    paragraphs.length < 4 && taskType === "task2" ? "Use four clear paragraphs: intro, two body, conclusion." : null,
  ].filter(Boolean).join(" ") || "Keep developing ideas with specific examples and clearer topic sentences.";

  const tip = taskType === "task1"
    ? "Start with an overview sentence covering the main trend before giving details."
    : "Make your position clear in the introduction and restate it in the conclusion without new ideas.";

  return { ta, cc, lr, gra, overall, strengths, improvements, tip, vocab: ["mitigate", "substantial", "facilitate"], source: "mock" };
}

// ─── AI Service ───────────────────────────────────────────────────────────────
async function callAnthropicAPI(text, words, taskType, onChunk) {
  const rl = rateLimiter.check();
  if (!rl.allowed) {
    const secs = Math.ceil(rl.waitMs / 1000);
    const err = new Error(`Rate limit reached. Please wait ${secs}s before trying again.`);
    err.type = "rate_limit";
    err.waitMs = rl.waitMs;
    throw err;
  }

  const prompt = `You are an expert IELTS examiner. Evaluate this ${taskType === "task1" ? "Task 1" : "Task 2"} essay (${words} words).

Respond ONLY with valid JSON (no markdown, no extra text):
{"ta":X,"cc":X,"lr":X,"gra":X,"overall":X,"strengths":"...","improvements":"...","tip":"...","vocab":["w1","w2","w3"]}

Where X = band score 4.0–9.0 in 0.5 steps. Keep text fields to 1–2 sentences. vocab = 3 academic upgrade words.

Essay:
${text}`;

  const response = await fetch(ENV.ANTHROPIC_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ENV.DEFAULT_MODEL,
      max_tokens: ENV.MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (response.status === 429) {
    const err = new Error("API rate limit exceeded. Retrying...");
    err.type = "rate_limit";
    throw err;
  }
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text || "";

  // Streaming simulation over the raw text
  if (onChunk) {
    for (let i = 0; i < raw.length; i += 8) {
      onChunk(raw.slice(0, i + 8));
      await new Promise(r => setTimeout(r, 18));
    }
    onChunk(raw);
  }

  const clean = raw.replace(/```json|```/g, "").trim();
  return { ...JSON.parse(clean), source: "claude" };
}

// ─── Toast System ─────────────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info", duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);
  const remove = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
  return { toasts, add, remove };
}

// ─── Band Ring ────────────────────────────────────────────────────────────────
function BandRing({ value, label, delay = 0 }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(value), delay + 200); return () => clearTimeout(t); }, [value, delay]);
  const pct = ((v - 4) / 5) * 100;
  const r = 26, circ = 2 * Math.PI * r;
  const color = v >= 7 ? "#22c55e" : v >= 6 ? "#3b82f6" : v >= 5 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={68} height={68} viewBox="0 0 68 68">
        <circle cx={34} cy={34} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
        <circle cx={34} cy={34} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          strokeDashoffset={circ / 4}
          style={{ transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
        <text x={34} y={34} textAnchor="middle" dominantBaseline="central"
          fill="white" fontSize={14} fontWeight={700} fontFamily="inherit">
          {v.toFixed(1)}
        </text>
      </svg>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.5px", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

// ─── Typing Cursor ────────────────────────────────────────────────────────────
function StreamingText({ text, done }) {
  return (
    <span>
      {text}
      {!done && <span style={{
        display: "inline-block", width: 2, height: "1em", background: "#5fb8ae",
        verticalAlign: "text-bottom", marginLeft: 2,
        animation: "blink 0.8s step-end infinite"
      }} />}
    </span>
  );
}

// ─── Toast UI ─────────────────────────────────────────────────────────────────
function ToastContainer({ toasts, remove }) {
  const icons = { info: "ℹ", success: "✓", warning: "⚠", error: "✕" };
  const colors = {
    info: { bg: "#1e3a5f", border: "#3b82f6", icon: "#60a5fa" },
    success: { bg: "#14532d", border: "#22c55e", icon: "#4ade80" },
    warning: { bg: "#451a03", border: "#f59e0b", icon: "#fbbf24" },
    error: { bg: "#450a0a", border: "#ef4444", icon: "#f87171" },
  };
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
      {toasts.map(t => {
        const c = colors[t.type] || colors.info;
        return (
          <div key={t.id} style={{
            background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12,
            padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10,
            animation: "slideIn 0.25s cubic-bezier(.4,0,.2,1)",
            boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${c.border}22`,
          }}>
            <span style={{ color: c.icon, fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icons[t.type]}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.5, flex: 1 }}>{t.msg}</span>
            <button onClick={() => remove(t.id)} style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.4)",
              cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0
            }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
function SkeletonLoader() {
  const pulse = { animation: "pulse 1.8s ease-in-out infinite", background: "rgba(255,255,255,0.06)", borderRadius: 8 };
  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ ...pulse, width: 100, height: 14 }} />
        <div style={{ ...pulse, width: 60, height: 22, borderRadius: 20 }} />
      </div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 24 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ ...pulse, width: 68, height: 68, borderRadius: "50%" }} />
            <div style={{ ...pulse, width: 60, height: 10 }} />
          </div>
        ))}
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ ...pulse, height: 14, marginBottom: 10, width: `${[92, 80, 70][i]}%` }} />
      ))}
    </div>
  );
}

// ─── Feedback Card ────────────────────────────────────────────────────────────
function FeedbackCard({ result, streamText, streaming }) {
  if (!result && !streaming) return null;
  const isAI = result?.source === "claude";
  const isMock = result?.source === "mock";

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "24px", marginTop: 20,
      animation: "fadeUp 0.35s cubic-bezier(.4,0,.2,1)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "white", margin: 0 }}>Writing Feedback</h3>
        {result && (
          <span style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600, letterSpacing: "0.4px",
            background: isAI ? "rgba(95,184,174,0.15)" : isMock ? "rgba(232,181,71,0.15)" : "rgba(138,169,224,0.15)",
            color: isAI ? "#5fb8ae" : isMock ? "#e8b547" : "#8aa9e0",
            border: `1px solid ${isAI ? "rgba(95,184,174,0.25)" : isMock ? "rgba(232,181,71,0.25)" : "rgba(138,169,224,0.25)"}`,
          }}>
            {isAI ? "✦ Claude AI" : isMock ? "⚡ Smart Coach" : "..."}
          </span>
        )}
      </div>

      {streaming && !result && <SkeletonLoader />}

      {streaming && result === null && streamText && (
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
          <StreamingText text={streamText.slice(0, 120) + (streamText.length > 120 ? "…" : "")} done={false} />
        </div>
      )}

      {result && (
        <>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
            {[
              { k: "ta", label: "Task" },
              { k: "cc", label: "Coherence" },
              { k: "lr", label: "Lexical" },
              { k: "gra", label: "Grammar" },
              { k: "overall", label: "Overall" },
            ].map((item, i) => (
              <BandRing key={item.k} value={result[item.k]} label={item.label} delay={i * 80} />
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, lineHeight: 1.75 }}>
            {[
              { label: "Strengths", icon: "✦", text: result.strengths, color: "#22c55e" },
              { label: "To improve", icon: "→", text: result.improvements, color: "#f59e0b" },
              { label: "Examiner tip", icon: "◈", text: result.tip, color: "#8aa9e0" },
              result.vocab?.length ? { label: "Vocabulary upgrade", icon: "◆", text: `Try ${result.vocab.map(v => `"${v}"`).join(", ")} for greater lexical range.`, color: "#a78bff" } : null,
            ].filter(Boolean).map(item => (
              <div key={item.label} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: item.color, flexShrink: 0, fontSize: 15, marginTop: 2 }}>{item.icon}</span>
                <p style={{ margin: 0, color: "rgba(236,232,223,0.82)" }}>
                  <strong style={{ color: item.color, fontWeight: 600 }}>{item.label}: </strong>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Writing Task ─────────────────────────────────────────────────────────────
const WRITING_TASKS = [
  { id: "wt001", type: "task2", label: "Task 2", title: "Technology & Human Connection", minWords: 250, timeLimit: 40, prompt: "Some people believe that technology has made it easier for people to connect with others and has improved human relationships. Others feel that technology has led to people becoming more isolated and that real human contact is increasingly rare. Discuss both views and give your own opinion." },
  { id: "wt002", type: "task2", label: "Task 2", title: "Government & Health", minWords: 250, timeLimit: 40, prompt: "In many countries, governments spend large amounts of public money on promoting healthy lifestyles. Some argue this is effective; others believe individuals should be responsible for their own choices. To what extent do you agree or disagree?" },
  { id: "wt003", type: "task1", label: "Task 1", title: "Renewable Energy Graph", minWords: 150, timeLimit: 20, prompt: "The bar chart shows electricity from renewables in five countries in 2005 and 2020. Summarise the information and make comparisons where relevant.\n\n(Norway 67%→82%, Germany 10%→46%, UK 5%→43%, USA 8%→21%, China 16%→28%)" },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function IELTSFeedback() {
  const [selectedTask, setSelectedTask] = useState(WRITING_TASKS[0]);
  const [essay, setEssay] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | streaming | done | error
  const [result, setResult] = useState(null);
  const [streamText, setStreamText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const { toasts, add: toast, remove: removeToast } = useToasts();
  const timerRef = useRef(null);
  const abortRef = useRef(false);

  const words = essay.trim().split(/\s+/).filter(Boolean).length;
  const wordProgress = Math.min(100, (words / selectedTask.minWords) * 100);

  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const t = setTimeout(() => setRateLimitCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [rateLimitCountdown]);

  const getFeedback = useCallback(async (forceMock = false) => {
    if (words < 50) { toast("Write at least 50 words before requesting feedback.", "warning"); return; }
    abortRef.current = false;
    setStatus("loading");
    setResult(null);
    setStreamText("");
    setErrorMsg("");

    if (forceMock) {
      await new Promise(r => setTimeout(r, 600));
      const fb = generateMockFeedback(essay, selectedTask.type, selectedTask.minWords);
      setResult(fb);
      setStatus("done");
      toast("Smart Coach feedback ready!", "success");
      return;
    }

    try {
      setStatus("streaming");
      const fb = await withRetry(async () => {
        return await callAnthropicAPI(essay, words, selectedTask.type, chunk => {
          if (!abortRef.current) setStreamText(chunk);
        });
      }, ENV.RETRY_ATTEMPTS);

      if (!abortRef.current) {
        setResult(fb);
        setStatus("done");
        toast("Claude AI feedback ready!", "success");
        setRetryCount(0);
      }
    } catch (err) {
      if (abortRef.current) return;

      if (err.type === "rate_limit") {
        const secs = Math.ceil((err.waitMs || 60000) / 1000);
        setRateLimitCountdown(secs);
        toast(`Rate limit reached. Auto-switching to Smart Coach in 3s…`, "warning", 3500);
        setTimeout(() => { if (!abortRef.current) getFeedback(true); }, 3000);
        setStatus("error");
        setErrorMsg(err.message);
        return;
      }

      const attempt = retryCount + 1;
      setRetryCount(attempt);

      if (attempt >= ENV.RETRY_ATTEMPTS) {
        toast("API unavailable — using Smart Coach fallback.", "warning");
        const fb = generateMockFeedback(essay, selectedTask.type, selectedTask.minWords);
        setResult(fb);
        setStatus("done");
        setRetryCount(0);
        return;
      }

      setStatus("error");
      setErrorMsg(err.message || "Unknown error occurred.");
      toast(`Error: ${err.message}`, "error");
    }
  }, [essay, words, selectedTask, retryCount, toast]);

  const handleTaskSwitch = task => {
    abortRef.current = true;
    setSelectedTask(task);
    setEssay("");
    setResult(null);
    setStatus("idle");
    setErrorMsg("");
    setStreamText("");
  };

  const isLoading = status === "loading" || status === "streaming";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0e1218;color:#ece8df;font-family:'DM Sans',system-ui,sans-serif;min-height:100vh;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:0.4}50%{opacity:0.9}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes slideIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        textarea{background:rgba(255,255,255,0.04);color:#ece8df;border:1.5px solid rgba(255,255,255,0.08);border-radius:12px;font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.75;padding:16px;resize:vertical;width:100%;outline:none;transition:border-color .2s;}
        textarea:focus{border-color:rgba(95,184,174,0.5);}
        textarea::placeholder{color:rgba(255,255,255,0.25);}
        button{cursor:pointer;font-family:'DM Sans',sans-serif;border:none;transition:all .2s;}
        button:active{transform:scale(0.97);}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px;}
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0e1218", padding: "0 0 60px" }}>
        {/* Header */}
        <div style={{
          background: "rgba(14,18,24,0.92)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0 24px", position: "sticky", top: 0, zIndex: 100
        }}>
          <div style={{ maxWidth: 900, margin: "0 auto", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>
              IELTS <span style={{ color: "#5fb8ae", fontStyle: "italic" }}>Studio</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                fontSize: 12, fontFamily: "'DM Mono',monospace",
                background: "rgba(95,184,174,0.1)", color: "#5fb8ae",
                border: "1px solid rgba(95,184,174,0.2)", borderRadius: 20,
                padding: "4px 12px",
              }}>✦ AI Feedback v2.0</div>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

          {/* Task selector */}
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono',monospace", marginBottom: 12 }}>Select task</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {WRITING_TASKS.map(t => (
                <button key={t.id} onClick={() => handleTaskSwitch(t)} style={{
                  padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                  background: selectedTask.id === t.id ? "#5fb8ae" : "rgba(255,255,255,0.05)",
                  color: selectedTask.id === t.id ? "#0e1218" : "rgba(255,255,255,0.6)",
                  border: `1px solid ${selectedTask.id === t.id ? "#5fb8ae" : "rgba(255,255,255,0.08)"}`,
                }}>
                  {t.label} · {t.title}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div style={{
            background: "rgba(95,184,174,0.06)", border: "1px solid rgba(95,184,174,0.15)",
            borderRadius: 14, padding: "20px 22px", marginBottom: 24,
            animation: "fadeUp 0.3s ease"
          }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <span style={{
                fontSize: 11, fontFamily: "'DM Mono',monospace", padding: "2px 10px",
                borderRadius: 20, background: "rgba(95,184,174,0.15)", color: "#5fb8ae",
                border: "1px solid rgba(95,184,174,0.2)"
              }}>{selectedTask.label}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono',monospace" }}>
                ⏱ {selectedTask.timeLimit}min · {selectedTask.minWords}+ words
              </span>
            </div>
            <p style={{ fontSize: 14, color: "rgba(236,232,223,0.8)", lineHeight: 1.75, whiteSpace: "pre-line" }}>
              {selectedTask.prompt}
            </p>
          </div>

          {/* Editor */}
          <div style={{ marginBottom: 16 }}>
            <textarea
              value={essay}
              onChange={e => setEssay(e.target.value)}
              placeholder="Begin writing your response here…"
              rows={12}
              disabled={isLoading}
              style={{ opacity: isLoading ? 0.7 : 1 }}
            />
          </div>

          {/* Word count bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ flex: 1, marginRight: 16 }}>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${wordProgress}%`,
                  background: wordProgress >= 100 ? "#22c55e" : wordProgress >= 80 ? "#f59e0b" : "#5fb8ae",
                  transition: "width .4s cubic-bezier(.4,0,.2,1), background .4s"
                }} />
              </div>
            </div>
            <span style={{
              fontSize: 12, fontFamily: "'DM Mono',monospace",
              color: words >= selectedTask.minWords ? "#22c55e" : words >= selectedTask.minWords * 0.8 ? "#f59e0b" : "rgba(255,255,255,0.35)"
            }}>
              {words} / {selectedTask.minWords} words
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <button
              onClick={() => getFeedback(false)}
              disabled={isLoading || words < 50}
              style={{
                padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 600,
                background: isLoading ? "rgba(95,184,174,0.3)" : words < 50 ? "rgba(255,255,255,0.06)" : "#5fb8ae",
                color: isLoading ? "rgba(255,255,255,0.6)" : words < 50 ? "rgba(255,255,255,0.3)" : "#0e1218",
                display: "flex", alignItems: "center", gap: 8,
              }}>
              {isLoading ? (
                <>
                  <svg width={16} height={16} viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite" }}>
                    <circle cx={8} cy={8} r={6} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={2} />
                    <path d="M8 2 A6 6 0 0 1 14 8" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                  {status === "loading" ? "Analysing…" : "Streaming…"}
                </>
              ) : "✦ Get AI Feedback"}
            </button>

            <button
              onClick={() => getFeedback(true)}
              disabled={isLoading || words < 50}
              style={{
                padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500,
                background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.1)",
                opacity: words < 50 ? 0.4 : 1
              }}>
              ⚡ Smart Coach
            </button>

            {(status === "error" || status === "done") && (
              <button onClick={() => { setResult(null); setStatus("idle"); setErrorMsg(""); }} style={{
                padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 500,
                background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(255,255,255,0.08)"
              }}>↩ Reset</button>
            )}
          </div>

          {/* Rate limit notice */}
          {rateLimitCountdown > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
              background: "rgba(232,181,71,0.1)", border: "1px solid rgba(232,181,71,0.25)",
              borderRadius: 10, fontSize: 13, color: "#e8b547", marginTop: 12,
              animation: "fadeUp 0.3s ease"
            }}>
              <span>⏱</span>
              <span>Rate limit active. Smart Coach fallback in {rateLimitCountdown}s…</span>
            </div>
          )}

          {/* Error banner */}
          {status === "error" && errorMsg && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px",
              background: "rgba(224,123,106,0.1)", border: "1px solid rgba(224,123,106,0.25)",
              borderRadius: 12, fontSize: 13, color: "#e07b6a", marginTop: 14,
              animation: "fadeUp 0.3s ease"
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
              <div>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>API Error</p>
                <p style={{ opacity: 0.8 }}>{errorMsg}</p>
                <button onClick={() => getFeedback(true)} style={{
                  marginTop: 10, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: "rgba(224,123,106,0.2)", color: "#e07b6a",
                  border: "1px solid rgba(224,123,106,0.35)"
                }}>Use Smart Coach instead →</button>
              </div>
            </div>
          )}

          {/* Feedback output */}
          <FeedbackCard
            result={result}
            streamText={streamText}
            streaming={status === "streaming" || status === "loading"}
          />

          {/* Architecture legend */}
          {status === "idle" && !result && (
            <div style={{
              marginTop: 32, padding: "20px 24px",
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 16, display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16
            }}>
              {[
                { icon: "⚡", label: "Rate limiting", desc: "5 req/min with countdown" },
                { icon: "↻", label: "Auto retry", desc: "3× with exponential backoff" },
                { icon: "◈", label: "Streaming", desc: "Token-by-token simulation" },
                { icon: "◆", label: "Fallback", desc: "Smart Coach when API fails" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#5fb8ae", fontSize: 16 }}>{item.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{item.label}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} remove={removeToast} />
    </>
  );
}
