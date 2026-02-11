import { useState, useRef, useCallback, useEffect } from "react";

const DEPTS = [
  { id: "strategy", name: "Strategy", icon: "🎯" },
  { id: "creative", name: "Creative Services", icon: "🎨" },
  { id: "media", name: "Media", icon: "📺" },
  { id: "seo_web", name: "SEO & Web Dev", icon: "🌐" },
  { id: "data", name: "Data & Analytics", icon: "📊" },
  { id: "client", name: "Client Service", icon: "🤝" },
  { id: "pm", name: "Project Management", icon: "📋" },
  { id: "finance", name: "Finance", icon: "💰" },
  { id: "ops", name: "Operations & Legal", icon: "⚖️" },
];

const SECTIONS = [
  { id: "overview", name: "Executive Overview", icon: "📄" },
  ...DEPTS,
  { id: "gonogo", name: "Go / No-Go", icon: "✅" },
  { id: "checklist", name: "Master Checklist", icon: "☑️" },
];

const REL_EXP = `Envisionit is a Chicago-based full-service digital marketing agency with 20+ years experience. Tourism clients: Visit St. Pete Clearwater (AOR), Choose Chicago (since 2016), Visit Cincy, Meet NKY, Visit Chicagoland, Galena Country Tourism, Visit Indiana, Visit KC, Visit Spokane, Madrid Turismo, Navy Pier, Cook County Tourism. Enterprise/fintech: Waystar, NMI, Braintree, Heartland.`;

const SJ = `\n\nRespond ONLY with valid JSON. No markdown fences. No text before/after. Start with { end with }.`;

const extractJSON = (t) => {
  if (!t) return null;
  let s = t
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(s);
  } catch {}
  const a = s.indexOf("{"),
    b = s.lastIndexOf("}");
  if (a !== -1 && b > a) {
    try {
      return JSON.parse(s.substring(a, b + 1));
    } catch {}
  }
  try {
    return JSON.parse(
      s
        .substring(a !== -1 ? a : 0, (b !== -1 ? b : s.length - 1) + 1)
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    );
  } catch {}
  return null;
};

// ── API calls go through our secure backend proxy ──
const callAPI = async (sys, content, retries = 2) => {
  for (let a = 0; a <= retries; a++) {
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: sys + (a > 0 ? "\nCRITICAL: ONLY raw JSON. Start { end }." : ""),
          messages: [{ role: "user", content }],
        }),
      });
      if (!r.ok) throw new Error(`API ${r.status}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const t = (d.content || []).map((b) => b.text || "").join("");
      const p = extractJSON(t);
      if (p) return p;
      if (a < retries) continue;
      throw new Error("JSON parse failed: " + t.substring(0, 100));
    } catch (e) {
      if (a >= retries) throw e;
    }
  }
};

const chatAPI = async (sys, msgs) => {
  const r = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: sys,
      messages: msgs,
    }),
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return (d.content || []).map((b) => b.text || "").join("");
};

// ── Prompts ──
const ovP = `You are the Envisionit RFP/RFI Analyst. Return JSON: {"opportunity_title":"","issuing_org":"","type":"RFP|RFI|RFQ","industry":"","scope_summary":"","services_requested":[],"budget":"","contract_duration":"","incumbent":"","strategic_fit":"","submission_deadline":"","critical_dates":[{"date":"","milestone":"","days_until":0}],"evaluation_criteria":[{"category":"","weight":"","notes":""}],"submission_requirements":[],"top_scoring_areas":[]} Extract exact dates, dollars, requirements. "Not specified in document." if missing. CONTEXT: ${REL_EXP}${SJ}`;

const dP = (dn) =>
  `You are the Envisionit RFP/RFI Analyst. For each department extract SPECIFIC questions to answer, deliverables to produce, requirements/constraints. Quote RFP language with section refs. Depts: ${dn.join(", ")}. Return JSON: {"${dn[0]}":{"questions":[],"deliverables":[],"requirements":[],"notes":""},"${dn[1]}":{"questions":[],"deliverables":[],"requirements":[],"notes":""},"${dn[2]}":{"questions":[],"deliverables":[],"requirements":[],"notes":""}}${SJ}`;

const gP = `You are the Envisionit RFP/RFI Analyst. Return JSON: {"recommendation":"GO|NO-GO|CONDITIONAL GO","rationale":"","strengths":[],"risks":[],"open_questions":[],"differentiators":[],"checklist":[{"task":"","owner":"","category":""}]} Categories: Administrative, Strategy, Creative, Media, SEO/Web, Data/Analytics, Client Service, PM, Finance, Operations/Legal, Production/Submission. CONTEXT: ${REL_EXP}${SJ}`;

// ── Storage (localStorage wrapper) ──
const SK = "rfp_idx";
const ldIdx = async () => {
  try {
    const r = localStorage.getItem(SK);
    return r ? JSON.parse(r) : [];
  } catch {
    return [];
  }
};
const svIdx = async (i) => {
  try {
    localStorage.setItem(SK, JSON.stringify(i));
  } catch {}
};
const svAn = async (res) => {
  const id = "rfp_" + Date.now(),
    t = res.overview?.opportunity_title || "Untitled",
    o = res.overview?.issuing_org || "",
    dl = res.overview?.submission_deadline || "",
    rc = res.gonogo?.recommendation || "";
  try {
    localStorage.setItem(id, JSON.stringify(res));
    const idx = await ldIdx();
    idx.unshift({
      id,
      title: t,
      org: o,
      deadline: dl,
      rec: rc,
      date: new Date().toISOString(),
    });
    await svIdx(idx);
    return id;
  } catch {
    return null;
  }
};
const ldAn = async (id) => {
  try {
    const r = localStorage.getItem(id);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
};
const dlAn = async (id) => {
  try {
    localStorage.removeItem(id);
    const idx = await ldIdx();
    await svIdx(idx.filter((i) => i.id !== id));
  } catch {}
};

// ── HTML Export ──
const CSS = `*{margin:0;padding:0;box-sizing:border-box}body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;padding:40px;max-width:900px;margin:0 auto}h1{font-size:28px;color:#f8fafc;margin-bottom:4px}h2{font-size:22px;color:#f8fafc;margin:32px 0 16px;padding-bottom:8px;border-bottom:1px solid #1e293b}h3{font-size:15px;font-weight:700;margin:20px 0 10px;text-transform:uppercase;letter-spacing:1px}.cy{color:#22d3ee}.gn{color:#34d399}.yw{color:#fbbf24}.rd{color:#f87171}.mt{color:#94a3b8}.sb{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.br{font-size:13px;font-weight:600;color:#22d3ee;letter-spacing:2px;text-transform:uppercase}.gr{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.cd{padding:14px;border-radius:10px;background:rgba(15,23,42,0.5);border:1px solid #1e293b}.tg{display:inline-block;padding:5px 12px;border-radius:20px;background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.2);color:#22d3ee;font-size:13px;margin:3px}.tgs{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.tb{width:100%;border-collapse:collapse;margin:8px 0;border-radius:10px;overflow:hidden}.tb td,.tb th{padding:10px 14px;text-align:left;font-size:14px;border-bottom:1px solid #1e293b}.tb tr:nth-child(even){background:rgba(15,23,42,0.5)}.tb tr:nth-child(odd){background:rgba(30,41,59,0.3)}.tb th{background:#0c1322;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px}.bg{font-size:12px;padding:2px 8px;border-radius:10px;font-weight:600}.bgr{background:rgba(239,68,68,0.2);color:#fca5a5}.bgg{background:rgba(51,65,85,0.5);color:#94a3b8}.sb2{background:rgba(15,23,42,0.5);border-radius:10px;padding:16px;margin:8px 0}.sb2.bl{border:1px solid rgba(56,189,248,0.15)}.sb2.gn{border:1px solid rgba(52,211,153,0.15)}.sb2.yw{border:1px solid rgba(251,191,36,0.15)}.it{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(51,65,85,0.4);font-size:14px;line-height:1.6}.dt{font-size:8px;margin-top:6px;flex-shrink:0}.fb{padding:14px;border-radius:10px;background:rgba(34,211,238,0.05);border:1px solid rgba(34,211,238,0.15);margin:12px 0}.rb{padding:24px;border-radius:12px;text-align:center;margin:16px 0}.rg{background:rgba(34,197,94,0.1);border:2px solid rgba(34,197,94,0.3)}.rn{background:rgba(239,68,68,0.1);border:2px solid rgba(239,68,68,0.3)}.rc{background:rgba(251,191,36,0.1);border:2px solid rgba(251,191,36,0.3)}.rl{font-size:32px;font-weight:800}.nb{padding:14px;border-radius:10px;background:rgba(51,65,85,0.25);border:1px solid #334155;margin:12px 0}.ck{display:flex;gap:10px;padding:9px 12px;border-bottom:1px solid rgba(51,65,85,0.3);align-items:flex-start}.ct{font-size:14px;flex:1;line-height:1.5}.co{font-size:12px;color:#22d3ee;white-space:nowrap}@media print{body{background:#fff;color:#1e293b;padding:20px}h1,h2,h3{color:#0f172a}.cd{border:1px solid #e2e8f0}}`;

const lH = (items, c) => {
  if (!items?.length)
    return `<p class="mt" style="font-style:italic;margin:8px 0">No specific items identified</p>`;
  return items
    .map(
      (i) =>
        `<div class="it"><span class="dt" style="color:${c}">●</span><span>${typeof i === "string" ? i : i.task || i.milestone || ""}</span></div>`
    )
    .join("");
};

const hOv = (o) => {
  let h = `<h2>📄 Executive Overview</h2><div class="gr">`;
  [
    ["Opportunity", o.opportunity_title],
    ["Issuing Org", o.issuing_org],
    ["Type", o.type],
    ["Industry", o.industry],
    ["Budget", o.budget],
    ["Duration", o.contract_duration],
    ["Incumbent", o.incumbent],
    ["Deadline", o.submission_deadline],
  ].forEach(([k, v]) => {
    h += `<div class="cd"><div class="sb">${k}</div><div style="${k === "Deadline" ? "color:#f87171;font-weight:600" : ""}">${v || "—"}</div></div>`;
  });
  h += `</div>`;
  if (o.scope_summary)
    h += `<h3 style="color:#f8fafc">Scope Summary</h3><p style="font-size:14px;line-height:1.7;margin:8px 0">${o.scope_summary}</p>`;
  if (o.strategic_fit)
    h += `<div class="fb"><h3 class="cy" style="margin-top:0">Strategic Fit</h3><p style="font-size:14px;line-height:1.6">${o.strategic_fit}</p></div>`;
  if (o.services_requested?.length)
    h += `<h3 style="color:#f8fafc">Services Requested</h3><div class="tgs">${o.services_requested.map((s) => `<span class="tg">${s}</span>`).join("")}</div>`;
  if (o.critical_dates?.length) {
    h += `<h3 style="color:#f8fafc">Critical Dates</h3><table class="tb"><tr><th>Milestone</th><th>Date</th><th>Days</th></tr>`;
    o.critical_dates.forEach((d) => {
      h += `<tr><td>${d.milestone}</td><td>${d.date}</td><td><span class="bg ${(d.days_until ?? 99) <= 7 ? "bgr" : "bgg"}">${d.days_until ?? "—"}d</span></td></tr>`;
    });
    h += `</table>`;
  }
  if (o.evaluation_criteria?.length) {
    h += `<h3 style="color:#f8fafc">Evaluation Criteria</h3><table class="tb"><tr><th>Category</th><th>Weight</th><th>Notes</th></tr>`;
    o.evaluation_criteria.forEach((c) => {
      h += `<tr><td>${c.category}</td><td style="color:#22d3ee;font-weight:700">${c.weight}</td><td class="mt">${c.notes || ""}</td></tr>`;
    });
    h += `</table>`;
  }
  if (o.top_scoring_areas?.length)
    h += `<div class="fb"><h3 class="cy" style="margin-top:0">🎯 Top Areas to Invest Effort</h3>${o.top_scoring_areas.map((a, i) => `<div style="padding:5px 0;font-size:14px">${i + 1}. ${a}</div>`).join("")}</div>`;
  return h;
};

const hDp = (id, nm, ic, ds) => {
  const d = ds[id];
  if (!d)
    return `<h2>${ic} ${nm}</h2><p class="mt">No analysis available.</p>`;
  let h = `<h2>${ic} ${nm}</h2><h3 style="color:#38bdf8">Questions to Answer</h3><div class="sb2 bl">${lH(d.questions, "#38bdf8")}</div><h3 class="gn">Deliverables to Produce</h3><div class="sb2 gn">${lH(d.deliverables, "#34d399")}</div><h3 class="yw">Requirements & Constraints</h3><div class="sb2 yw">${lH(d.requirements, "#fbbf24")}</div>`;
  if (d.notes && !d.notes.startsWith("No specific"))
    h += `<div class="nb"><span class="mt" style="font-weight:600">📌 Notes:</span> ${d.notes}</div>`;
  return h;
};

const hGn = (g) => {
  const c =
    g.recommendation === "GO"
      ? "rg"
      : g.recommendation === "NO-GO"
        ? "rn"
        : "rc";
  const cl =
    g.recommendation === "GO"
      ? "#34d399"
      : g.recommendation === "NO-GO"
        ? "#f87171"
        : "#fbbf24";
  return `<h2>✅ Go / No-Go</h2><div class="rb ${c}"><div class="rl" style="color:${cl}">${g.recommendation || "PENDING"}</div><p style="font-size:15px;margin-top:10px;line-height:1.6">${g.rationale || ""}</p></div><h3 class="gn">Strengths</h3>${lH(g.strengths, "#34d399")}<h3 class="rd">Risks</h3>${lH(g.risks, "#f87171")}<h3 class="yw">Open Questions</h3>${lH(g.open_questions, "#fbbf24")}<h3 class="cy">Differentiators</h3>${lH(g.differentiators, "#22d3ee")}`;
};

const hCk = (g) => {
  const cs = {};
  (g.checklist || []).forEach((i) => {
    const c = i.category || "Other";
    if (!cs[c]) cs[c] = [];
    cs[c].push(i);
  });
  let h = `<h2>☑️ Master Checklist</h2>`;
  Object.entries(cs).forEach(([c, its]) => {
    h += `<h3 class="mt" style="margin-top:24px;padding-bottom:6px;border-bottom:1px solid #1e293b">${c}</h3>`;
    its.forEach((i) => {
      h += `<div class="ck"><span class="mt" style="font-size:16px">☐</span><span class="ct">${i.task}</span><span class="co">${i.owner}</span></div>`;
    });
  });
  return h;
};

const mkHTML = (body, t) =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${t}</title><style>${CSS}</style></head><body><div class="br">Envisionit</div><h1>${t}</h1><p class="mt" style="margin-bottom:8px">Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p><hr style="border:none;border-top:1px solid #1e293b;margin:16px 0">${body}</body></html>`;

const dlHTML = (h, f) => {
  const b = new Blob([h], { type: "text/html;charset=utf-8" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u;
  a.download = f;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(u);
};

const expSec = (tab, res) => {
  const { overview: o = {}, departments: ds = {}, gonogo: g = {} } = res;
  const s = SECTIONS.find((x) => x.id === tab);
  const t = `${s?.name || "Section"} — ${o.opportunity_title || "RFP"}`;
  let b = "";
  if (tab === "overview") b = hOv(o);
  else if (tab === "gonogo") b = hGn(g);
  else if (tab === "checklist") b = hCk(g);
  else {
    const d = DEPTS.find((x) => x.id === tab);
    if (d) b = hDp(d.id, d.name, d.icon, ds);
  }
  return { html: mkHTML(b, t), title: t };
};

const expFull = (res) => {
  const { overview: o = {}, departments: ds = {}, gonogo: g = {} } = res;
  const t = o.opportunity_title || "RFP Analysis";
  let b = hOv(o);
  DEPTS.forEach((d) => {
    b += hDp(d.id, d.name, d.icon, ds);
  });
  b += hGn(g) + hCk(g);
  return { html: mkHTML(b, `Full Report — ${t}`), title: t };
};

const BT = (bg) => ({
  padding: "7px 14px",
  borderRadius: 7,
  border: "none",
  background: bg,
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

// Which sections each phase unlocks
const PHASE_SECTIONS = {
  0: ["overview"],
  1: ["strategy", "creative", "media"],
  2: ["seo_web", "data", "client"],
  3: ["pm", "finance", "ops"],
  4: ["gonogo", "checklist"],
};

export default function App() {
  const [view, setView] = useState("home");
  const [inputMode, setInputMode] = useState("upload");
  const [paste, setPaste] = useState("");
  const [fName, setFName] = useState("");
  const [fData, setFData] = useState(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState([]);
  const [results, setResults] = useState({});
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState([]);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveId, setSaveId] = useState(null);
  const [readySections, setReadySections] = useState(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [docText, setDocText] = useState("");
  const fileRef = useRef();
  const chatEndRef = useRef();
  const chatInputRef = useRef();
  const resultsRef = useRef({});

  useEffect(() => {
    ldIdx().then(setSaved);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, chatLoading]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const addProg = useCallback(
    (m) =>
      setProgress((p) => [
        ...p,
        { msg: m, time: new Date().toLocaleTimeString() },
      ]),
    []
  );

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFName(f.name);
    const r = new FileReader();
    r.onload = () =>
      setFData({ base64: r.result.split(",")[1], type: f.type });
    r.readAsDataURL(f);
  };

  const bC = useCallback(
    (x = "") => {
      if (fData)
        return [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: fData.type || "application/pdf",
              data: fData.base64,
            },
          },
          { type: "text", text: `Analyze this RFP/RFI. ${x}` },
        ];
      return `Analyze this RFP/RFI. ${x}\n\n---BEGIN---\n${paste}\n---END---`;
    },
    [fData, paste]
  );

  const analyze = useCallback(async () => {
    setStatus("analyzing");
    setResults({});
    setProgress([]);
    setError("");
    setActiveTab("overview");
    setSaveId(null);
    setSaveMsg("");
    setReadySections(new Set());
    setChatMsgs([]);
    setView("results");
    if (paste) setDocText(paste);
    else setDocText("[PDF document uploaded]");
    try {
      addProg("Analyzing executive overview...");
      const ov = await callAPI(
        ovP,
        bC("Focus on overview, dates, eval criteria, submission reqs.")
      );
      setResults((r) => {
        const n = { ...r, overview: ov };
        resultsRef.current = n;
        return n;
      });
      setReadySections((s) => new Set([...s, ...PHASE_SECTIONS[0]]));
      addProg("✓ Executive overview complete");

      addProg("Strategy, Creative, Media...");
      const b1 = await callAPI(
        dP(["strategy", "creative", "media"]),
        bC("Strategy, Creative, Media depts.")
      );
      if (b1)
        setResults((r) => {
          const n = { ...r, departments: { ...r.departments, ...b1 } };
          resultsRef.current = n;
          return n;
        });
      setReadySections((s) => new Set([...s, ...PHASE_SECTIONS[1]]));
      addProg("✓ Strategy, Creative, Media complete");

      addProg("SEO/Web, Data, Client Service...");
      const b2 = await callAPI(
        dP(["seo_web", "data", "client"]),
        bC("SEO & Web, Data & Analytics, Client Service.")
      );
      if (b2)
        setResults((r) => {
          const n = { ...r, departments: { ...r.departments, ...b2 } };
          resultsRef.current = n;
          return n;
        });
      setReadySections((s) => new Set([...s, ...PHASE_SECTIONS[2]]));
      addProg("✓ SEO/Web, Data, Client Service complete");

      addProg("PM, Finance, Operations...");
      const b3 = await callAPI(
        dP(["pm", "finance", "ops"]),
        bC("Project Management, Finance, Operations/Legal.")
      );
      if (b3)
        setResults((r) => {
          const n = { ...r, departments: { ...r.departments, ...b3 } };
          resultsRef.current = n;
          return n;
        });
      setReadySections((s) => new Set([...s, ...PHASE_SECTIONS[3]]));
      addProg("✓ PM, Finance, Operations complete");

      addProg("Go/No-Go assessment...");
      const gng = await callAPI(
        gP,
        bC("Go/No-Go recommendation and checklist.")
      );
      if (gng)
        setResults((r) => {
          const n = { ...r, gonogo: gng };
          resultsRef.current = n;
          return n;
        });
      setReadySections((s) => new Set([...s, ...PHASE_SECTIONS[4]]));
      addProg("✓ Go/No-Go complete");

      addProg("🎉 Analysis complete!");
      setStatus("complete");
    } catch (err) {
      setError(err.message || "Failed.");
      setStatus("error");
    }
  }, [bC, addProg]);

  const sendChat = async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    const newMsgs = [...chatMsgs, { role: "user", content: q }];
    setChatMsgs(newMsgs);
    setChatInput("");
    setChatLoading(true);
    try {
      const ctx = JSON.stringify(resultsRef.current, null, 1).substring(
        0,
        12000
      );
      const sys = `You are a helpful assistant that answers questions about an RFP/RFI document that has been analyzed for Envisionit, a Chicago-based full-service digital marketing agency. Here is the structured analysis of the document:\n\n${ctx}\n\nAnswer questions about this RFP/RFI based on the analysis data. Be specific, reference section numbers and exact requirements when possible. If the answer isn't in the analysis, say so. Keep answers concise and actionable.`;
      const apiMsgs = newMsgs.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const resp = await chatAPI(sys, apiMsgs);
      setChatMsgs((prev) => [...prev, { role: "assistant", content: resp }]);
    } catch (err) {
      setChatMsgs((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err.message}. Please try again.`,
        },
      ]);
    }
    setChatLoading(false);
  };

  const handleSave = async () => {
    if (saveId) {
      setSaveMsg("Already saved");
      setTimeout(() => setSaveMsg(""), 2000);
      return;
    }
    const id = await svAn(results);
    if (id) {
      setSaveId(id);
      setSaveMsg("✓ Saved!");
      setSaved(await ldIdx());
    } else setSaveMsg("Failed");
    setTimeout(() => setSaveMsg(""), 2500);
  };

  const loadSaved = async (id) => {
    const d = await ldAn(id);
    if (d) {
      setResults(d);
      resultsRef.current = d;
      setSaveId(id);
      setStatus("complete");
      setActiveTab("overview");
      setView("results");
      setSaveMsg("");
      setReadySections(new Set(SECTIONS.map((s) => s.id)));
      setChatMsgs([]);
      setDocText("[Loaded from saved]");
    }
  };

  const deleteSaved = async (id) => {
    await dlAn(id);
    setSaved(await ldIdx());
    if (saveId === id) setSaveId(null);
  };

  const reset = () => {
    setView("home");
    setStatus("idle");
    setResults({});
    setProgress([]);
    setFName("");
    setFData(null);
    setPaste("");
    setError("");
    setSaveId(null);
    setSaveMsg("");
    setReadySections(new Set());
    setChatOpen(false);
    setChatMsgs([]);
  };

  const canSubmit = fData || paste.trim().length > 100;

  // ─── HOME / SAVED ───
  if (view === "home" || view === "saved") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#22d3ee",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Envisionit
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 700,
                margin: "0 0 12px",
                color: "#f8fafc",
              }}
            >
              RFP / RFI Analyst
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "#94a3b8",
                maxWidth: 500,
                margin: "0 auto",
              }}
            >
              Upload or paste an RFP/RFI for department-specific questions,
              deliverables, and actionable breakdowns.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 28,
              justifyContent: "center",
              background: "#0c1322",
              borderRadius: 10,
              padding: 4,
              width: "fit-content",
              margin: "0 auto 28px",
            }}
          >
            {[
              ["home", "📄 New Analysis"],
              ["saved", `📁 Saved (${saved.length})`],
            ].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: "none",
                  background:
                    view === v ? "rgba(34,211,238,0.12)" : "transparent",
                  color: view === v ? "#22d3ee" : "#94a3b8",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {l}
              </button>
            ))}
          </div>

          {view === "saved" ? (
            saved.length === 0 ? (
              <div
                style={{ textAlign: "center", padding: 48, color: "#64748b" }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
                <p>No saved analyses yet.</p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {saved.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 18px",
                      borderRadius: 10,
                      background: "rgba(15,23,42,0.6)",
                      border: "1px solid #1e293b",
                      cursor: "pointer",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.borderColor = "#22d3ee")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.borderColor = "#1e293b")
                    }
                  >
                    <div style={{ flex: 1 }} onClick={() => loadSaved(i.id)}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "#f8fafc",
                          marginBottom: 4,
                        }}
                      >
                        {i.title}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          fontSize: 13,
                          color: "#94a3b8",
                          flexWrap: "wrap",
                        }}
                      >
                        {i.org && <span>{i.org}</span>}
                        {i.deadline && <span>📅 {i.deadline}</span>}
                        {i.rec && (
                          <span
                            style={{
                              color:
                                i.rec === "GO"
                                  ? "#34d399"
                                  : i.rec === "NO-GO"
                                    ? "#f87171"
                                    : "#fbbf24",
                              fontWeight: 600,
                            }}
                          >
                            {i.rec}
                          </span>
                        )}
                        <span>{new Date(i.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSaved(i.id);
                      }}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #334155",
                        background: "transparent",
                        color: "#64748b",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 24,
                  justifyContent: "center",
                }}
              >
                {["upload", "paste"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setInputMode(m)}
                    style={{
                      padding: "8px 20px",
                      borderRadius: 8,
                      border:
                        "1px solid " +
                        (inputMode === m ? "#22d3ee" : "#334155"),
                      background:
                        inputMode === m
                          ? "rgba(34,211,238,0.1)"
                          : "transparent",
                      color: inputMode === m ? "#22d3ee" : "#94a3b8",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {m === "upload" ? "📎 Upload PDF" : "📝 Paste Text"}
                  </button>
                ))}
              </div>

              {inputMode === "upload" ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: "2px dashed #334155",
                    borderRadius: 12,
                    padding: 48,
                    textAlign: "center",
                    cursor: "pointer",
                    background: "rgba(30,41,59,0.5)",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.borderColor = "#22d3ee")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.borderColor = "#334155")
                  }
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFile}
                    style={{ display: "none" }}
                  />
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                  {fName ? (
                    <div style={{ color: "#22d3ee", fontWeight: 600 }}>
                      {fName}
                    </div>
                  ) : (
                    <>
                      <div style={{ color: "#cbd5e1", marginBottom: 4 }}>
                        Click to upload
                      </div>
                      <div style={{ fontSize: 13, color: "#64748b" }}>
                        PDF recommended
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Paste full RFP/RFI text..."
                  style={{
                    width: "100%",
                    minHeight: 220,
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #334155",
                    background: "#1e293b",
                    color: "#e2e8f0",
                    fontSize: 14,
                    lineHeight: 1.6,
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              )}

              {error && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 14,
                    borderRadius: 8,
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#fca5a5",
                    fontSize: 14,
                  }}
                >
                  <strong>Error:</strong> {error}
                </div>
              )}

              <button
                onClick={analyze}
                disabled={!canSubmit}
                style={{
                  width: "100%",
                  marginTop: 24,
                  padding: "14px 24px",
                  borderRadius: 10,
                  border: "none",
                  background: canSubmit
                    ? "linear-gradient(135deg, #0891b2, #22d3ee)"
                    : "#334155",
                  color: canSubmit ? "#0f172a" : "#64748b",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: canSubmit ? "pointer" : "default",
                }}
              >
                Analyze Document →
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── RESULTS (progressive + chat) ───
  const ov = results.overview || {},
    ds = results.departments || {},
    gn = results.gonogo || {};
  const isAnalyzing = status === "analyzing";
  const secReady = readySections.has(activeTab);

  const rL = (items, c) => {
    if (!items?.length)
      return (
        <p style={{ color: "#64748b", fontStyle: "italic", margin: "8px 0" }}>
          No specific items identified
        </p>
      );
    return items.map((i, x) => (
      <div
        key={x}
        style={{
          display: "flex",
          gap: 10,
          padding: "10px 0",
          borderBottom: "1px solid rgba(51,65,85,0.4)",
        }}
      >
        <span style={{ color: c, fontSize: 8, marginTop: 6 }}>●</span>
        <span style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
          {typeof i === "string"
            ? i
            : i.task || i.milestone || JSON.stringify(i)}
        </span>
      </div>
    ));
  };

  const rDept = (id) => {
    const d = ds[id];
    if (!d)
      return (
        <p style={{ color: "#64748b", fontStyle: "italic" }}>Not available.</p>
      );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#38bdf8",
              margin: "0 0 12px",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Questions to Answer
          </h3>
          <div
            style={{
              background: "rgba(15,23,42,0.5)",
              borderRadius: 10,
              padding: 16,
              border: "1px solid rgba(56,189,248,0.15)",
            }}
          >
            {rL(d.questions, "#38bdf8")}
          </div>
        </div>
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#34d399",
              margin: "0 0 12px",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Deliverables to Produce
          </h3>
          <div
            style={{
              background: "rgba(15,23,42,0.5)",
              borderRadius: 10,
              padding: 16,
              border: "1px solid rgba(52,211,153,0.15)",
            }}
          >
            {rL(d.deliverables, "#34d399")}
          </div>
        </div>
        <div>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#fbbf24",
              margin: "0 0 12px",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Requirements & Constraints
          </h3>
          <div
            style={{
              background: "rgba(15,23,42,0.5)",
              borderRadius: 10,
              padding: 16,
              border: "1px solid rgba(251,191,36,0.15)",
            }}
          >
            {rL(d.requirements, "#fbbf24")}
          </div>
        </div>
        {d.notes && !d.notes.startsWith("No specific") && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "rgba(51,65,85,0.25)",
              border: "1px solid #334155",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
              📌{" "}
            </span>
            <span style={{ fontSize: 14, color: "#cbd5e1" }}>{d.notes}</span>
          </div>
        )}
      </div>
    );
  };

  const rContent = () => {
    if (!secReady)
      return (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
          <div
            style={{
              fontSize: 32,
              marginBottom: 12,
              animation: "spin 2s linear infinite",
            }}
          >
            ⏳
          </div>
          <p style={{ fontSize: 15 }}>Analyzing this section...</p>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      );

    if (activeTab === "overview")
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {[
              ["Opportunity", ov.opportunity_title],
              ["Issuing Org", ov.issuing_org],
              ["Type", ov.type],
              ["Industry", ov.industry],
              ["Budget", ov.budget],
              ["Duration", ov.contract_duration],
              ["Incumbent", ov.incumbent],
              ["Deadline", ov.submission_deadline],
            ].map(([k, v], i) => (
              <div
                key={i}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "rgba(15,23,42,0.5)",
                  border: "1px solid #1e293b",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  {k}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: k === "Deadline" ? "#f87171" : "#e2e8f0",
                    fontWeight: k === "Deadline" ? 600 : 400,
                  }}
                >
                  {v || "—"}
                </div>
              </div>
            ))}
          </div>
          {ov.scope_summary && (
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#f8fafc",
                  margin: "0 0 8px",
                }}
              >
                Scope Summary
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: "#cbd5e1",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                {ov.scope_summary}
              </p>
            </div>
          )}
          {ov.strategic_fit && (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: "rgba(34,211,238,0.05)",
                border: "1px solid rgba(34,211,238,0.15)",
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#22d3ee",
                  margin: "0 0 6px",
                }}
              >
                Strategic Fit
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: "#cbd5e1",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {ov.strategic_fit}
              </p>
            </div>
          )}
          {ov.services_requested?.length > 0 && (
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#f8fafc",
                  margin: "0 0 10px",
                }}
              >
                Services Requested
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ov.services_requested.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 20,
                      background: "rgba(34,211,238,0.08)",
                      border: "1px solid rgba(34,211,238,0.2)",
                      color: "#22d3ee",
                      fontSize: 13,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ov.critical_dates?.length > 0 && (
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#f8fafc",
                  margin: "0 0 12px",
                }}
              >
                Critical Dates
              </h3>
              <div
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid #1e293b",
                }}
              >
                {ov.critical_dates.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background:
                        i % 2 === 0
                          ? "rgba(15,23,42,0.5)"
                          : "rgba(30,41,59,0.3)",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{ fontSize: 14, color: "#cbd5e1", flex: 1 }}
                    >
                      {d.milestone}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#94a3b8" }}>
                        {d.date}
                      </span>
                      {d.days_until !== undefined && (
                        <span
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background:
                              d.days_until <= 7
                                ? "rgba(239,68,68,0.2)"
                                : "rgba(51,65,85,0.5)",
                            color:
                              d.days_until <= 7 ? "#fca5a5" : "#94a3b8",
                            fontWeight: 600,
                          }}
                        >
                          {d.days_until}d
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ov.evaluation_criteria?.length > 0 && (
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#f8fafc",
                  margin: "0 0 12px",
                }}
              >
                Evaluation Criteria
              </h3>
              <div
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid #1e293b",
                }}
              >
                {ov.evaluation_criteria.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background:
                        i % 2 === 0
                          ? "rgba(15,23,42,0.5)"
                          : "rgba(30,41,59,0.3)",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 14, color: "#cbd5e1" }}>
                        {c.category}
                      </span>
                      {c.notes && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            marginTop: 2,
                          }}
                        >
                          {c.notes}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 14,
                        color: "#22d3ee",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {c.weight}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ov.top_scoring_areas?.length > 0 && (
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                background: "rgba(34,211,238,0.05)",
                border: "1px solid rgba(34,211,238,0.15)",
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#22d3ee",
                  margin: "0 0 10px",
                }}
              >
                🎯 Top Areas to Invest Effort
              </h3>
              {ov.top_scoring_areas.map((a, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 14,
                    color: "#cbd5e1",
                    padding: "5px 0",
                    lineHeight: 1.5,
                  }}
                >
                  {i + 1}. {a}
                </div>
              ))}
            </div>
          )}
        </div>
      );

    if (activeTab === "gonogo")
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              padding: 24,
              borderRadius: 12,
              textAlign: "center",
              background:
                gn.recommendation === "GO"
                  ? "rgba(34,197,94,0.1)"
                  : gn.recommendation === "NO-GO"
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(251,191,36,0.1)",
              border:
                "2px solid " +
                (gn.recommendation === "GO"
                  ? "rgba(34,197,94,0.3)"
                  : gn.recommendation === "NO-GO"
                    ? "rgba(239,68,68,0.3)"
                    : "rgba(251,191,36,0.3)"),
            }}
          >
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color:
                  gn.recommendation === "GO"
                    ? "#34d399"
                    : gn.recommendation === "NO-GO"
                      ? "#f87171"
                      : "#fbbf24",
              }}
            >
              {gn.recommendation || "PENDING"}
            </div>
            <p
              style={{
                fontSize: 15,
                color: "#cbd5e1",
                margin: "10px 0 0",
                lineHeight: 1.6,
              }}
            >
              {gn.rationale}
            </p>
          </div>
          <div>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#34d399",
                margin: "0 0 8px",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Strengths
            </h3>
            {rL(gn.strengths, "#34d399")}
          </div>
          <div>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#f87171",
                margin: "0 0 8px",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Risks
            </h3>
            {rL(gn.risks, "#f87171")}
          </div>
          <div>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fbbf24",
                margin: "0 0 8px",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Open Questions
            </h3>
            {rL(gn.open_questions, "#fbbf24")}
          </div>
          <div>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#22d3ee",
                margin: "0 0 8px",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Differentiators
            </h3>
            {rL(gn.differentiators, "#22d3ee")}
          </div>
        </div>
      );

    if (activeTab === "checklist") {
      const cats = {};
      (gn.checklist || []).forEach((i) => {
        const c = i.category || "Other";
        if (!cats[c]) cats[c] = [];
        cats[c].push(i);
      });
      if (!Object.keys(cats).length)
        return <p style={{ color: "#64748b" }}>No items.</p>;
      return (
        <div>
          {Object.entries(cats).map(([c, its]) => (
            <div key={c} style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  margin: "0 0 10px",
                  paddingBottom: 6,
                  borderBottom: "1px solid #1e293b",
                }}
              >
                {c}
              </h3>
              {its.map((i, x) => (
                <div
                  key={x}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "9px 12px",
                    borderBottom: "1px solid rgba(51,65,85,0.3)",
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ color: "#475569", fontSize: 16, lineHeight: 1 }}>
                    ☐
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: "#cbd5e1",
                      flex: 1,
                      lineHeight: 1.5,
                    }}
                  >
                    {i.task}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "#22d3ee",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {i.owner}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    return rDept(activeTab);
  };

  const sec = SECTIONS.find((s) => s.id === activeTab);
  const slug = (s) =>
    s
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 40);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          background: "#0c1322",
          borderRight: "1px solid #1e293b",
          padding: "16px 0",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "8px 16px 16px",
            borderBottom: "1px solid #1e293b",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#22d3ee",
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Envisionit
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>
            RFP Analyst
          </div>
        </div>
        {SECTIONS.map((s) => {
          const ready = readySections.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => ready && setActiveTab(s.id)}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "9px 16px",
                border: "none",
                background:
                  activeTab === s.id
                    ? "rgba(34,211,238,0.1)"
                    : "transparent",
                color:
                  activeTab === s.id
                    ? "#22d3ee"
                    : ready
                      ? "#94a3b8"
                      : "#334155",
                cursor: ready ? "pointer" : "default",
                fontSize: 13,
                textAlign: "left",
                borderLeft:
                  activeTab === s.id
                    ? "2px solid #22d3ee"
                    : "2px solid transparent",
                width: "100%",
                opacity: ready ? 1 : 0.4,
              }}
            >
              <span style={{ fontSize: 15 }}>{ready ? s.icon : "○"}</span>
              <span>{s.name}</span>
              {!ready && isAnalyzing && (
                <span
                  style={{ marginLeft: "auto", fontSize: 10, color: "#64748b" }}
                >
                  ...
                </span>
              )}
            </button>
          );
        })}
        <div
          style={{
            marginTop: "auto",
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {(status === "complete" || Object.keys(results).length > 0) && (
            <button
              onClick={handleSave}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "none",
                background: saveId ? "#1e293b" : "#0891b2",
                color: saveId ? "#64748b" : "#0f172a",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {saveMsg || (saveId ? "✓ Saved" : "💾 Save")}
            </button>
          )}
          <button
            onClick={() => setChatOpen((o) => !o)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "none",
              background: chatOpen
                ? "rgba(168,85,247,0.2)"
                : "#334155",
              color: chatOpen ? "#c084fc" : "#94a3b8",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {chatOpen ? "✕ Close Chat" : "💬 Ask Questions"}
          </button>
          <button
            onClick={reset}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #334155",
              background: "transparent",
              color: "#94a3b8",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← Home
          </button>
        </div>
      </div>

      {/* Main */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {/* Progress bar during analysis */}
        {isAnalyzing && (
          <div
            style={{
              padding: "8px 16px",
              background: "rgba(34,211,238,0.05)",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: "#1e293b",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  background: "linear-gradient(90deg, #0891b2, #22d3ee)",
                  borderRadius: 2,
                  width: `${Math.min(95, (readySections.size / SECTIONS.length) * 100)}%`,
                  transition: "width 0.5s",
                }}
              />
            </div>
            <span
              style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}
            >
              {readySections.size}/{SECTIONS.length} sections
            </span>
          </div>
        )}

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Content area */}
          <div style={{ flex: 1, padding: "28px 36px", overflowY: "auto" }}>
            <div style={{ maxWidth: 820 }}>
              <div
                style={{
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontSize: 26 }}>{sec?.icon}</span>
                  <h2
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "#f8fafc",
                      margin: 0,
                    }}
                  >
                    {sec?.name}
                  </h2>
                </div>
                {secReady && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        const { html, title } = expFull(results);
                        dlHTML(
                          html,
                          `Envisionit_RFP_${slug(title)}.html`
                        );
                      }}
                      style={BT("#0891b2")}
                    >
                      ⬇ Full Report
                    </button>
                    <button
                      onClick={() => {
                        const { html } = expSec(activeTab, results);
                        dlHTML(
                          html,
                          `${slug(sec?.name || "section")}.html`
                        );
                      }}
                      style={BT("#334155")}
                    >
                      ⬇ This Section
                    </button>
                  </div>
                )}
              </div>
              <div
                style={{
                  height: 1,
                  background: "#1e293b",
                  marginBottom: 24,
                }}
              />
              {rContent()}
            </div>
          </div>

          {/* Chat panel */}
          {chatOpen && (
            <div
              style={{
                width: 360,
                borderLeft: "1px solid #1e293b",
                background: "#0c1322",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #1e293b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#f8fafc",
                    }}
                  >
                    Ask the RFP
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    Questions about this document
                  </div>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    fontSize: 18,
                  }}
                >
                  ✕
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {chatMsgs.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "32px 16px",
                      color: "#475569",
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                    <p style={{ fontSize: 14, marginBottom: 16 }}>
                      Ask anything about this RFP/RFI
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {[
                        "What are the key deadlines?",
                        "What's the budget?",
                        "What makes us competitive?",
                        "Summarize the scope of work",
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setChatInput(q);
                            setTimeout(
                              () => chatInputRef.current?.focus(),
                              50
                            );
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid #1e293b",
                            background: "rgba(15,23,42,0.5)",
                            color: "#94a3b8",
                            fontSize: 13,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMsgs.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent:
                        m.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "85%",
                        padding: "10px 14px",
                        borderRadius: 12,
                        background:
                          m.role === "user"
                            ? "#0891b2"
                            : "rgba(30,41,59,0.8)",
                        color:
                          m.role === "user" ? "#f8fafc" : "#cbd5e1",
                        fontSize: 14,
                        lineHeight: 1.6,
                        borderBottomRightRadius:
                          m.role === "user" ? 4 : 12,
                        borderBottomLeftRadius:
                          m.role === "user" ? 12 : 4,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div
                    style={{ display: "flex", justifyContent: "flex-start" }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: "rgba(30,41,59,0.8)",
                        color: "#64748b",
                        fontSize: 14,
                        borderBottomLeftRadius: 4,
                      }}
                    >
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid #1e293b",
                  display: "flex",
                  gap: 8,
                }}
              >
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && sendChat()
                  }
                  placeholder="Ask a question..."
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #334155",
                    background: "#1e293b",
                    color: "#e2e8f0",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "none",
                    background:
                      chatInput.trim() && !chatLoading
                        ? "#0891b2"
                        : "#334155",
                    color:
                      chatInput.trim() && !chatLoading
                        ? "#f8fafc"
                        : "#64748b",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor:
                      chatInput.trim() && !chatLoading
                        ? "pointer"
                        : "default",
                  }}
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
