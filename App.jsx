import { useState, useEffect, useRef } from "react";

const FONT = "'DM Sans', 'Segoe UI', system-ui, sans-serif";
const MONO = "'DM Mono', 'Menlo', monospace";
const C = {
  bg: "#0A0D12", surface: "#11151C", surfaceAlt: "#161B24",
  border: "#1C222D", borderLight: "#2A3140",
  text: "#E6EAF0", textMuted: "#7A8599",
  accent: "#3ECF8E", accentDim: "rgba(62,207,142,0.10)", accentGlow: "rgba(62,207,142,0.3)",
  warning: "#F5A623", warningDim: "rgba(245,166,35,0.12)",
  info: "#5B9DF9", infoDim: "rgba(91,157,249,0.12)",
  error: "#EF5350", errorDim: "rgba(239,83,80,0.12)",
};

const inputStyle = { padding: "11px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, fontFamily: FONT, outline: "none" };
const btnPrimary = { padding: "10px 24px", background: C.accent, color: C.bg, border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT };
const btnSecondary = { padding: "10px 20px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONT };
const btnGhost = { padding: "6px 12px", background: "transparent", color: C.textMuted, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONT };
const navStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${C.border}` };
const navLink = { color: C.textMuted, textDecoration: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" };

function parseData(raw) {
  const trimmed = raw.trim();
  try { const json = JSON.parse(trimmed); if (Array.isArray(json) && json.length > 0) return { rows: json, columns: Object.keys(json[0]) }; } catch {}
  const lines = trimmed.split("\n").filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const columns = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => { const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, "")); const obj = {}; columns.forEach((col, i) => obj[col] = vals[i] || ""); return obj; });
  return { rows, columns };
}

function analyzeColumn(rows, col) {
  const vals = rows.map(r => r[col]).filter(v => v !== "" && v !== undefined && v !== null);
  const nums = vals.map(Number).filter(n => !isNaN(n));
  if (nums.length > vals.length * 0.6) {
    const sum = nums.reduce((a, b) => a + b, 0); const mean = sum / nums.length;
    const sorted = [...nums].sort((a, b) => a - b); const median = sorted[Math.floor(sorted.length / 2)];
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    return { type: "numeric", count: nums.length, mean, median, min: sorted[0], max: sorted[sorted.length - 1], std: Math.sqrt(variance), missing: rows.length - vals.length, sum };
  }
  const freq = {}; vals.forEach(v => freq[v] = (freq[v] || 0) + 1);
  return { type: "categorical", count: vals.length, uniqueCount: Object.keys(freq).length, topEntries: Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5), missing: rows.length - vals.length };
}

function generateInsights(rows, columns, colStats) {
  const insights = [], actions = [];
  const totalCells = rows.length * columns.length;
  const missingCells = Object.values(colStats).reduce((a, s) => a + s.missing, 0);
  const missingPct = ((missingCells / totalCells) * 100).toFixed(1);
  if (missingCells > 0) {
    insights.push({ icon: "\u26a0", type: "warning", title: "Missing Data Detected", body: `${missingCells} empty cells found (${missingPct}%). Columns most affected: ${Object.entries(colStats).filter(([,s]) => s.missing > 0).sort((a,b) => b[1].missing - a[1].missing).slice(0,3).map(([c,s]) => `${c} (${s.missing})`).join(", ")}.` });
    actions.push("Fill or remove rows with missing values before deeper analysis.");
  } else { insights.push({ icon: "\u2713", type: "success", title: "Clean Dataset", body: "No missing values detected." }); }

  const numericCols = Object.entries(colStats).filter(([,s]) => s.type === "numeric");
  numericCols.forEach(([col, s]) => {
    const cv = s.mean !== 0 ? ((s.std / Math.abs(s.mean)) * 100).toFixed(1) : 0;
    if (cv > 80) { insights.push({ icon: "\ud83d\udcca", type: "info", title: `High Variance in "${col}"`, body: `CV is ${cv}%. Range: ${fmt(s.min)} to ${fmt(s.max)}, mean ${fmt(s.mean)}.` }); actions.push(`Investigate outliers in "${col}".`); }
    if (s.mean !== 0 && Math.abs(s.median - s.mean) / Math.abs(s.mean) > 0.25) { insights.push({ icon: "\ud83d\udcc8", type: "info", title: `Skewed Distribution in "${col}"`, body: `Mean (${fmt(s.mean)}) differs from median (${fmt(s.median)}).` }); }
  });

  const revCol = numericCols.find(([c]) => /revenue|sales|income|amount|total|price/i.test(c));
  if (revCol) { const [col, s] = revCol; insights.push({ icon: "\ud83d\udcb0", type: "success", title: `Financial Column: "${col}"`, body: `Total: ${fmt(s.sum)} | Avg: ${fmt(s.mean)} | Median: ${fmt(s.median)}.` }); actions.push(`Break down "${col}" by time period or category.`); }

  Object.entries(colStats).filter(([,s]) => s.type === "categorical").forEach(([col, s]) => {
    if (s.uniqueCount === rows.length && rows.length > 5) { insights.push({ icon: "\ud83d\udd11", type: "info", title: `"${col}" is a Unique Identifier`, body: `Every value is unique across ${s.count} rows.` }); }
    else if (s.topEntries.length > 0) { const [val, cnt] = s.topEntries[0]; const pct = ((cnt / s.count) * 100).toFixed(0); if (pct > 50) { insights.push({ icon: "\ud83c\udff7", type: "warning", title: `Dominant Category in "${col}"`, body: `"${val}" = ${pct}% of entries.` }); actions.push(`Diversify beyond "${val}" in "${col}".`); } }
  });

  if (rows.length < 10) { insights.push({ icon: "\ud83d\udccb", type: "warning", title: "Small Sample Size", body: `Only ${rows.length} rows.` }); actions.push("Collect more data before major decisions."); }
  else if (rows.length >= 100) { insights.push({ icon: "\ud83d\udccb", type: "success", title: "Solid Dataset Size", body: `${rows.length} rows.` }); }
  if (actions.length === 0) { actions.push("Data looks solid \u2014 consider trend analysis over time."); actions.push("Segment by key categorical columns for growth opportunities."); }
  return { insights, actions };
}

function fmt(n) { if (n == null) return "\u2014"; if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1)+"M"; if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1)+"K"; return Number(n).toFixed(n % 1 === 0 ? 0 : 2); }

function useScrollReveal() {
  const [visible, setVisible] = useState({});
  const refs = useRef({});
  useEffect(() => {
    const obs = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) setVisible(v => ({...v, [e.target.dataset.section]: true})); }), { threshold: 0.15 });
    Object.values(refs.current).forEach(el => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  const ref = key => el => { refs.current[key] = el; };
  const anim = (key, delay = 0) => ({ opacity: visible[key] ? 1 : 0, transform: visible[key] ? "translateY(0)" : "translateY(28px)", transition: `all 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms` });
  return { ref, anim };
}

// === MAIN APP ===
export default function App() {
  const [page, setPage] = useState(window.location.hash === "#app" ? "app" : "landing");
  useEffect(() => { const h = () => setPage(window.location.hash === "#app" ? "app" : "landing"); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      {page === "landing" ? <LandingPage /> : <DataLensApp />}
    </div>
  );
}

// === LANDING PAGE ===
function LandingPage() {
  const [email, setEmail] = useState(""); const [submitted, setSubmitted] = useState(false);
  const { ref, anim } = useScrollReveal();
  const handleSubmit = () => { if (email && /\S+@\S+\.\S+/.test(email)) { const e = JSON.parse(localStorage.getItem("datalens_waitlist") || "[]"); e.push({email, date: new Date().toISOString()}); localStorage.setItem("datalens_waitlist", JSON.stringify(e)); setSubmitted(true); } };
  const goToApp = () => { window.location.hash = "#app"; };

  return (<>
    <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 20, color: C.accent }}>{"\u25c6"}</span><span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.03em" }}>DataLens</span></div>
      <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
        <a href="#how" style={navLink}>How It Works</a><a href="#features" style={navLink}>Features</a><a href="#pricing" style={navLink}>Pricing</a>
        <button onClick={goToApp} style={{ ...btnPrimary, padding: "8px 20px", fontSize: 13 }}>Launch App →</button>
      </div>
    </nav>

    <section data-section="hero" ref={ref("hero")} style={{ maxWidth: 800, margin: "0 auto", padding: "100px 32px 80px", textAlign: "center" }}>
      <div style={anim("hero")}><div style={{ display: "inline-block", padding: "6px 16px", borderRadius: 20, background: C.accentDim, border: "1px solid rgba(62,207,142,0.2)", fontSize: 12, fontWeight: 600, color: C.accent, marginBottom: 24, fontFamily: MONO, letterSpacing: "0.03em" }}>BUILT FOR SHOPIFY SELLERS</div></div>
      <h1 style={{ fontSize: "clamp(36px,5.5vw,60px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.04em", margin: "0 0 20px", ...anim("hero", 100) }}>Your Shopify data<br/>knows what to do next.<br/><span style={{ color: C.accent }}>Now you will too.</span></h1>
      <p style={{ fontSize: 18, color: C.textMuted, lineHeight: 1.6, maxWidth: 520, margin: "0 auto 36px", ...anim("hero", 200) }}>Export your data. Paste it in. Get instant insights on what's selling, what's dead weight, and exactly where to focus next.</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", ...anim("hero", 300) }}>
        <button onClick={goToApp} style={{ ...btnPrimary, padding: "14px 32px", fontSize: 15, fontWeight: 700, boxShadow: `0 0 30px ${C.accentGlow}` }}>Try It Free →</button>
        <a href="#how" style={{ ...btnSecondary, padding: "14px 32px", fontSize: 15, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>See How It Works</a>
      </div>
    </section>

    <section data-section="preview" ref={ref("preview")} style={{ maxWidth: 880, margin: "0 auto 80px", padding: "0 32px", ...anim("preview") }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, background: `radial-gradient(circle, ${C.accentGlow} 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ fontSize: 11, fontFamily: MONO, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>Live Analysis Preview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[{ label: "Total Revenue", value: "$284,600", color: C.accent }, { label: "Products Analyzed", value: "47", color: C.text }, { label: "Top Category Share", value: "62%", color: C.warning }, { label: "Data Quality", value: "94%", color: C.info }].map((d, i) => (
            <div key={i} style={{ padding: "14px 16px", background: C.surfaceAlt, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{d.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: d.color, letterSpacing: "-0.02em" }}>{d.value}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "14px 18px", background: C.accentDim, borderLeft: `3px solid ${C.accent}`, borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
          <strong style={{ color: C.accent }}>{"\u26a1"} Insight:</strong> <span style={{ color: C.text }}>62% of revenue comes from just 3 of your 47 products. Consider increasing ad spend on your top 3 and evaluating whether the bottom 20 are worth keeping.</span>
        </div>
      </div>
    </section>

    <section id="how" data-section="how" ref={ref("how")} style={{ maxWidth: 880, margin: "0 auto", padding: "60px 32px 80px" }}>
      <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center", marginBottom: 48, ...anim("how") }}>Three steps. Thirty seconds.</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        {[{ num: "01", title: "Export from Shopify", desc: "Go to Analytics \u2192 Export. Grab your orders or sales CSV." }, { num: "02", title: "Paste into DataLens", desc: "Drop your CSV into the input screen. We auto-detect everything." }, { num: "03", title: "Get your next move", desc: "Instant breakdown with a specific action plan to grow revenue." }].map((s, i) => (
          <div key={i} style={{ padding: "28px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, ...anim("how", 100 + i * 120) }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.accent, fontFamily: MONO, marginBottom: 12, opacity: 0.7 }}>{s.num}</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.title}</h3>
            <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>

    <section id="features" data-section="features" ref={ref("features")} style={{ maxWidth: 880, margin: "0 auto", padding: "40px 32px 80px" }}>
      <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center", marginBottom: 48, ...anim("features") }}>What you'll see in seconds</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
        {[{ icon: "\ud83d\udcca", title: "Revenue Concentration", desc: "See which products drive your income and how concentrated it is." }, { icon: "\u26a0\ufe0f", title: "Data Quality Flags", desc: "Missing values and gaps get called out instantly." }, { icon: "\ud83d\udcc8", title: "Distribution Analysis", desc: "Spot skewed pricing, outliers, and hidden patterns." }, { icon: "\ud83c\udff7\ufe0f", title: "Category Breakdown", desc: "Which collections pull weight and which don't." }, { icon: "\ud83c\udfaf", title: "Actionable Next Steps", desc: "Specific, numbered recommendations you can act on today." }, { icon: "\u26a1", title: "Instant Results", desc: "No setup, no integrations. Paste data, get answers." }].map((f, i) => (
          <div key={i} style={{ padding: "24px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, ...anim("features", 80 + i * 80) }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>{f.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{f.title}</h3>
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>

    <section id="pricing" data-section="pricing" ref={ref("pricing")} style={{ maxWidth: 700, margin: "0 auto", padding: "40px 32px 80px" }}>
      <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center", marginBottom: 12, ...anim("pricing") }}>Simple pricing</h2>
      <p style={{ textAlign: "center", color: C.textMuted, fontSize: 15, marginBottom: 40, ...anim("pricing", 80) }}>Free while in early access. Paid plans coming soon.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, ...anim("pricing", 160) }}>
        <div style={{ padding: "28px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, fontFamily: MONO, textTransform: "uppercase", marginBottom: 8 }}>Free</div>
          <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 4 }}>$0</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>During early access</div>
          {["5 analyses / month","CSV & JSON upload","Full insights report","Email support"].map(f => <div key={f} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ color: C.accent }}>{"\u2713"}</span> {f}</div>)}
        </div>
        <div style={{ padding: "28px 24px", background: C.surface, border: `1px solid ${C.accent}`, borderRadius: 14, boxShadow: `0 0 40px ${C.accentDim}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, fontFamily: MONO, textTransform: "uppercase", marginBottom: 8 }}>Pro (coming soon)</div>
          <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 4 }}>$29<span style={{ fontSize: 16, color: C.textMuted }}>/mo</span></div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>For serious sellers</div>
          {["Unlimited analyses","AI-powered insights","Shopify direct import","Trend tracking","Export PDF reports","Priority support"].map(f => <div key={f} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ color: C.accent }}>{"\u2713"}</span> {f}</div>)}
        </div>
      </div>
    </section>

    <section id="cta" data-section="cta" ref={ref("cta")} style={{ maxWidth: 600, margin: "0 auto", padding: "40px 32px 100px", textAlign: "center" }}>
      <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 12, ...anim("cta") }}>Stop guessing. Start knowing.</h2>
      <p style={{ color: C.textMuted, fontSize: 15, marginBottom: 28, ...anim("cta", 80) }}>Join the first 20 Shopify sellers getting free early access.</p>
      {!submitted ? (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", ...anim("cta", 160) }}>
          <input type="email" placeholder="you@yourstore.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ ...inputStyle, width: 280 }} />
          <button onClick={handleSubmit} style={{ ...btnPrimary, padding: "13px 28px", boxShadow: `0 0 30px ${C.accentGlow}` }}>Get Early Access</button>
        </div>
      ) : (
        <div style={{ padding: "16px 24px", background: C.accentDim, border: "1px solid rgba(62,207,142,0.2)", borderRadius: 12, display: "inline-block" }}>
          <span style={{ color: C.accent, fontWeight: 600 }}>{"\u2713"} You're on the list!</span><span style={{ color: C.textMuted, marginLeft: 8 }}>We'll reach out soon.</span>
        </div>
      )}
      <div style={{ marginTop: 20, ...anim("cta", 240) }}><button onClick={goToApp} style={{ ...btnGhost, color: C.accent }}>Or try the app now →</button></div>
    </section>

    <footer style={{ borderTop: `1px solid ${C.border}`, padding: "24px 32px", textAlign: "center", fontSize: 12, color: C.textMuted }}>{"\u00a9"} 2026 DataLens. Built for Shopify sellers who'd rather grow than guess.</footer>
  </>);
}

// === DATALENS APP ===
function DataLensApp() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  useEffect(() => { const s = localStorage.getItem("datalens_user"); if (s) { setUser(s); setScreen("input"); } }, []);
  const handleLogin = email => { localStorage.setItem("datalens_user", email); setUser(email); setScreen("input"); };
  const handleLogout = () => { localStorage.removeItem("datalens_user"); setUser(null); setAnalysisResult(null); setScreen("login"); };
  const goToLanding = () => { window.location.hash = ""; };
  return (<>
    {screen === "login" && <LoginScreen onLogin={handleLogin} goToLanding={goToLanding} />}
    {screen === "input" && <InputScreen user={user} onAnalyze={r => { setAnalysisResult(r); setScreen("output"); }} onLogout={handleLogout} goToLanding={goToLanding} />}
    {screen === "output" && <OutputScreen user={user} result={analysisResult} onBack={() => setScreen("input")} onLogout={handleLogout} goToLanding={goToLanding} />}
  </>);
}

function LoginScreen({ onLogin, goToLanding }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [mode, setMode] = useState("login"); const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);
  const handleSubmit = () => {
    if (!email || !password) return setError("Both fields are required.");
    if (!/\S+@\S+\.\S+/.test(email)) return setError("Enter a valid email.");
    if (password.length < 6) return setError("Password must be 6+ characters.");
    const stored = localStorage.getItem("dlu_" + email);
    if (mode === "signup") { if (stored) return setError("Account exists. Log in instead."); localStorage.setItem("dlu_" + email, btoa(password + "::salt")); onLogin(email); }
    else { if (!stored || stored !== btoa(password + "::salt")) return setError("Invalid email or password."); onLogin(email); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(12px)", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ width: "100%", maxWidth: 400, padding: 40, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div onClick={goToLanding} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 12, background: C.accentDim, marginBottom: 16, cursor: "pointer" }}><span style={{ fontSize: 22 }}>{"\u25c6"}</span></div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em" }}>DataLens</h1>
          <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>{mode === "login" ? "Sign in to analyze your data" : "Create your account"}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="email" placeholder="Email address" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inputStyle} />
          <input type="password" placeholder="Password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={inputStyle} />
        </div>
        {error && <p style={{ color: C.error, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
        <button onClick={handleSubmit} style={{ ...btnPrimary, width: "100%", marginTop: 20, padding: "12px 0" }}>{mode === "login" ? "Sign In" : "Create Account"}</button>
        <p style={{ textAlign: "center", fontSize: 13, color: C.textMuted, marginTop: 20 }}>
          {mode === "login" ? "No account? " : "Already have one? "}
          <span onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} style={{ color: C.accent, cursor: "pointer", fontWeight: 500 }}>{mode === "login" ? "Sign up" : "Sign in"}</span>
        </p>
      </div>
    </div>
  );
}

function InputScreen({ user, onAnalyze, onLogout, goToLanding }) {
  const [raw, setRaw] = useState(""); const [error, setError] = useState(""); const [mounted, setMounted] = useState(false); const fileRef = useRef();
  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);
  const handleFile = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { setRaw(ev.target.result); setError(""); }; r.readAsText(f); };
  const handleAnalyze = () => {
    if (!raw.trim()) return setError("Paste or upload your data first.");
    const parsed = parseData(raw);
    if (!parsed || parsed.rows.length === 0) return setError("Couldn't parse. Use CSV, TSV, or JSON.");
    const colStats = {}; parsed.columns.forEach(col => { colStats[col] = analyzeColumn(parsed.rows, col); });
    onAnalyze({ parsed, colStats, ...generateInsights(parsed.rows, parsed.columns, colStats) });
  };
  const loadSample = () => { setRaw("Product,Revenue,Units Sold,Category,Region\nWidget A,45200,320,Electronics,North\nWidget B,12800,95,Home,South\nWidget C,78500,540,Electronics,West\nWidget D,5200,40,Home,North\nWidget E,92100,610,Electronics,East\nGadget F,31400,220,Accessories,South\nGadget G,18700,145,Accessories,West\nGadget H,,88,Home,North\nGadget I,67300,470,Electronics,East\nGadget J,8900,62,Home,South\nService K,120000,800,Services,\nService L,43500,310,Services,West"); setError(""); };
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(12px)", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
      <nav style={navStyle}>
        <div onClick={goToLanding} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><span style={{ fontSize: 18, color: C.accent }}>{"\u25c6"}</span><span style={{ fontWeight: 700, fontSize: 16 }}>DataLens</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}><span style={{ fontSize: 13, color: C.textMuted }}>{user}</span><button onClick={onLogout} style={btnGhost}>Log out</button></div>
      </nav>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 680 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Upload Your Data</h2>
          <p style={{ color: C.textMuted, fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>Paste CSV, TSV, or JSON data below — or upload a file.</p>
          <textarea value={raw} onChange={e => { setRaw(e.target.value); setError(""); }} placeholder="Product,Revenue,Units Sold,Category\nWidget A,45200,320,Electronics\n..." style={{ ...inputStyle, width: "100%", height: 240, resize: "vertical", fontFamily: MONO, fontSize: 13, lineHeight: 1.6, boxSizing: "border-box" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={handleAnalyze} style={{ ...btnPrimary, padding: "10px 28px" }}>Analyze Data →</button>
            <button onClick={() => fileRef.current?.click()} style={btnSecondary}>Upload File</button>
            <button onClick={loadSample} style={btnGhost}>Load Sample</button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.json,.txt" onChange={handleFile} style={{ display: "none" }} />
          </div>
          {error && <p style={{ color: C.error, fontSize: 13, marginTop: 14 }}>{error}</p>}
          <div style={{ marginTop: 28, padding: "16px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}><strong style={{ color: C.text }}>Supported formats:</strong> CSV, TSV, or JSON arrays. First row = column headers.</div>
        </div>
      </div>
    </div>
  );
}

function OutputScreen({ user, result, onBack, onLogout, goToLanding }) {
  const { parsed, colStats, insights, actions } = result;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);
  const tc = { success: C.accent, warning: C.warning, info: C.info };
  const tb = { success: C.accentDim, warning: C.warningDim, info: C.infoDim };
  return (
    <div style={{ minHeight: "100vh", opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(12px)", transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
      <nav style={navStyle}>
        <div onClick={goToLanding} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><span style={{ fontSize: 18, color: C.accent }}>{"\u25c6"}</span><span style={{ fontWeight: 700, fontSize: 16 }}>DataLens</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}><span style={{ fontSize: 13, color: C.textMuted }}>{user}</span><button onClick={onLogout} style={btnGhost}>Log out</button></div>
      </nav>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 64px" }}>
        <button onClick={onBack} style={{ ...btnGhost, marginBottom: 20, fontSize: 13 }}>{"\u2190"} Back to data input</button>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Analysis Results</h2>
        <p style={{ color: C.textMuted, fontSize: 14, margin: "0 0 32px" }}>{parsed.rows.length} rows × {parsed.columns.length} columns analyzed</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
          {[{ l: "Rows", v: parsed.rows.length }, { l: "Columns", v: parsed.columns.length }, { l: "Numeric", v: Object.values(colStats).filter(s => s.type === "numeric").length }, { l: "Category", v: Object.values(colStats).filter(s => s.type === "categorical").length }].map((d, i) => (
            <div key={i} style={{ padding: "16px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{d.l}</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{d.v}</div>
            </div>
          ))}
        </div>
        <Sec title="Column Breakdown">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {parsed.columns.map(col => { const s = colStats[col]; return (
              <div key={col} style={{ padding: "14px 18px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div><span style={{ fontWeight: 600, fontSize: 14 }}>{col}</span><span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6, background: s.type === "numeric" ? C.infoDim : C.accentDim, color: s.type === "numeric" ? C.info : C.accent, fontFamily: MONO }}>{s.type}</span>{s.missing > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6, background: C.warningDim, color: C.warning, fontFamily: MONO }}>{s.missing} missing</span>}</div>
                <div style={{ fontSize: 12, color: C.textMuted, fontFamily: MONO }}>{s.type === "numeric" ? `min ${fmt(s.min)} \u00b7 avg ${fmt(s.mean)} \u00b7 max ${fmt(s.max)}` : `${s.uniqueCount} unique \u00b7 top: "${s.topEntries?.[0]?.[0] || "\u2014"}"`}</div>
              </div>
            ); })}
          </div>
        </Sec>
        <Sec title="Insights">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ padding: "16px 20px", borderRadius: 10, background: tb[ins.type], borderLeft: `3px solid ${tc[ins.type]}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 16 }}>{ins.icon}</span><span style={{ fontWeight: 600, fontSize: 14, color: tc[ins.type] }}>{ins.title}</span></div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>{ins.body}</p>
              </div>
            ))}
          </div>
        </Sec>
        <Sec title="Recommended Next Steps">
          <div style={{ padding: "20px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
            {actions.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: i < actions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 7, background: C.accentDim, color: C.accent, fontSize: 12, fontWeight: 700, flexShrink: 0, fontFamily: MONO }}>{i + 1}</span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{a}</p>
              </div>
            ))}
          </div>
        </Sec>
        <Sec title="Data Preview (first 10 rows)">
          <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12 }}>
              <thead><tr>{parsed.columns.map(col => <th key={col} style={{ textAlign: "left", padding: "10px 14px", background: C.surface, color: C.textMuted, fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{col}</th>)}</tr></thead>
              <tbody>{parsed.rows.slice(0, 10).map((row, i) => <tr key={i}>{parsed.columns.map(col => <td key={col} style={{ padding: "8px 14px", borderBottom: `1px solid ${C.border}`, color: row[col] ? C.text : C.textMuted, whiteSpace: "nowrap" }}>{row[col] || "\u2014"}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Sec>
      </div>
    </div>
  );
}

function Sec({ title, children }) { return <div style={{ marginBottom: 32 }}><h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>{title}</h3>{children}</div>; }
