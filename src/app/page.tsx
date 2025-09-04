// src/app/page.tsx
"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import html2canvas from "html2canvas";

import { Table } from "@/lib/types";
import {
  coerceTable,
  profileTable,
  topCorrelations,
  firstDateTrend,
  duplicateRows,
  categoryImbalance,
  weekdaySeasonality,
} from "@/lib/stats";
import {
  suggestCharts,
  buildLineData,
  buildBarTopK,
  buildScatterData,
  buildHistData,
  buildBoxSummary,
  buildCorrHeatmap,
} from "@/lib/charts";
import { generateInsightsAll, buildAiAnalysisPayload } from "@/lib/insights";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  Brush,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

/* ------------------------- utils ------------------------- */
function isArrayOfObjects(d: unknown): d is Record<string, unknown>[] {
  return Array.isArray(d) && d.length > 0 && d.every(x => x && typeof x === "object" && !Array.isArray(x));
}
const numFmt = (v: number) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v * 100) / 100);
};
const dateFmt = (v: any) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

const axisTick = { fill: "#e5e7eb", fontSize: 12 };
const axisStroke = "rgba(255,255,255,0.25)";
const gridStroke = "rgba(255,255,255,0.12)";

// palette for pie/donut segments
const palette = ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#f59e0b", "#22d3ee", "#f87171", "#93c5fd"];

/* small helpers for the new charts */
function buildDonutTopK(table: Table, cat: string, k = 6) {
  const counts: Record<string, number> = {};
  for (const r of table.rows) {
    const key = String((r as any)?.[cat] ?? "Unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, k).map(([name, value]) => ({ name, value }));
  const rest = sorted.slice(k).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) top.push({ name: "Other", value: rest });
  return top;
}

function buildAreaSeries(table: Table, xDateCol: string, yNumCol: string) {
  return table.rows
    .map(r => ({ x: r?.[xDateCol], y: Number((r as any)?.[yNumCol]) }))
    .filter(d => d.x && Number.isFinite(d.y))
    .sort((a, b) => new Date(a.x as any).getTime() - new Date(b.x as any).getTime());
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  async function exportPNG() {
    if (!ref.current) return;
    const canvas = await html2canvas(ref.current);
    const link = document.createElement("a");
    link.download = `${title.replace(/\s+/g, "_")}.png`;
    link.href = canvas.toDataURL();
    link.click();
  }
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/90">{title}</p>
        <button className="btn text-xs" onClick={exportPNG}>Export PNG</button>
      </div>
      <div ref={ref} style={{ width: "100%", height: 340 }}>{children}</div>
    </div>
  );
}

/* ------------------------- component ------------------------- */
type TabKey = "Load" | "Preview" | "Profile" | "Insights" | "Charts";

export default function Home() {
  const [active, setActive] = useState<TabKey>("Load");
  const [table, setTable] = useState<Table | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiPath, setApiPath] = useState("");
  const [profile, setProfile] = useState<ReturnType<typeof profileTable> | null>(null);
  const [correls, setCorrels] = useState<{ a: string; b: string; r: number }[] | null>(null);
  const [trend, setTrend] = useState<ReturnType<typeof firstDateTrend> | null>(null);
  const [charts, setCharts] = useState<ReturnType<typeof suggestCharts> | null>(null);
  const [insights, setInsights] = useState<{ bullets: string[]; narrative: string } | null>(null);
  const [toast, setToast] = useState<string>("");
  const [dzHover, setDzHover] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");

  // AI state (Insights tab)
  const [aiLoading, setAiLoading] = useState(false);
  const [ai, setAi] = useState<{
    status?: "ai" | "fallback";
    narrative?: string;
    recommendations?: string[];
    risks?: string[];
    nextCharts?: string[];
  } | null>(null);

  // AI state (Charts tab summarize)
  const [chartsAI, setChartsAI] = useState<{ narrative?: string; bullets?: string[] } | null>(null);
  const [chartsAiLoading, setChartsAiLoading] = useState(false);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2600); }

  function afterLoad(raw: Table) {
    const newTable = coerceTable(raw);
    setTable(newTable);

    const p = profileTable(newTable);
    const cs = topCorrelations(newTable, 3);
    const tr = firstDateTrend(newTable);
    const full = generateInsightsAll(newTable);
    const cfgs = suggestCharts(newTable);

    setProfile(p);
    setCorrels(cs);
    setTrend(tr);
    setInsights({ bullets: full.bullets, narrative: full.narrative });
    setCharts(cfgs);
    setAi(null);
    setChartsAI(null);
    setActive("Preview");
  }

  // CSV upload
  function loadCSVFile(file: File) {
    setCsvFileName(file.name);
    Papa.parse(file, {
      header: true, skipEmptyLines: true, dynamicTyping: true,
      complete: (res) => {
        const rows = (res.data as any[]).filter(Boolean);
        if (!rows.length) { showToast("No rows found in CSV"); return; }
        const columns = Object.keys(rows[0]);
        afterLoad({ columns, rows });
        showToast(`Loaded CSV: ${rows.length} rows`);
      },
      error: () => showToast("Failed to parse CSV"),
    });
  }

  // Manual JSON
  function loadJSONText(text: string) {
    try {
      const parsed = JSON.parse(text);
      if (!isArrayOfObjects(parsed)) return showToast("Expected a non-empty array of objects");
      const rows = parsed; const columns = Object.keys(rows[0] as object);
      setCsvFileName("");
      afterLoad({ columns, rows });
      showToast(`Loaded JSON: ${rows.length} rows`);
    } catch { showToast("Invalid JSON"); }
  }

  // Samples
  async function loadSampleCSV() {
    const text = await fetch("/sample-data/sales.csv", { cache: "no-store" }).then(r=>r.text());
    const res = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const rows = (res.data as any[]).filter(Boolean);
    if (!rows.length) return showToast("No rows in sample CSV");
    const columns = Object.keys(rows[0]);
    setCsvFileName("sales.csv");
    afterLoad({ columns, rows });
    showToast(`Loaded sample CSV (${rows.length} rows)`);
  }
  async function loadSampleJSON() {
    const res = await fetch("/sample-data/users.json", { cache: "no-store" });
    if (!res.ok) return showToast(`Sample JSON not found (HTTP ${res.status})`);
    const data = await res.json();
    if (!isArrayOfObjects(data)) return showToast("Sample JSON must be array of objects");
    const rows = data as Record<string, unknown>[]; const columns = Object.keys(rows[0]);
    setCsvFileName("");
    afterLoad({ columns, rows });
    showToast(`Loaded sample JSON (${rows.length} rows)`);
  }

  // Fetch URL
  async function fetchFromUrl() {
    try {
      const res = await fetch("/api/fetch-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: apiUrl, recordsPath: apiPath || undefined }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data?.error || "Fetch error");
      setCsvFileName("");
      afterLoad({ columns: data.columns, rows: data.rows });
      showToast(`Fetched ${data?.rows?.length ?? 0} records`);
    } catch { showToast("Fetch failed"); }
  }

  function clearAll() {
    setTable(null); setJsonText(""); setApiUrl(""); setApiPath("");
    setProfile(null); setCorrels(null); setTrend(null); setInsights(null); setCharts(null);
    setCsvFileName(""); setAi(null); setChartsAI(null); setActive("Load");
  }

  async function generateAI() {
    if (!table) return;
    setAiLoading(true);
    try {
      const det = generateInsightsAll(table);
      const analysis = buildAiAnalysisPayload(det);
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json();

      if ((!data?.narrative || !data?.recommendations?.length) && data?.status !== "fallback") {
        setAi({ status: "fallback", narrative: "Deterministic fallback based on metrics.", recommendations: [], risks: [], nextCharts: [] });
        return;
      }
      setAi(data);
    } catch {
      setAi({ status: "fallback", narrative: "Deterministic fallback (AI request failed).", recommendations: [], risks: [], nextCharts: [] });
    } finally { setAiLoading(false); }
  }

  // --- AI summarize charts (Charts tab) ---
  async function summarizeChartsAI() {
    if (!table) return;
    setChartsAiLoading(true);
    try {
      // Build tiny chart stats snapshot (safe to send)
      const lineCandidate = charts?.find(c => c.type === "line");
      const barCandidate  = charts?.find(c => c.type === "barTopK");
      const scatterCand   = charts?.find(c => c.type === "scatter");

      const summary: any = { charts: [] as any[] };

      if (lineCandidate) {
        const data = buildLineData(table, lineCandidate.x, lineCandidate.y);
        const n = data.length;
        const yVals = data.map(d => Number(d.y)).filter(Number.isFinite);
        const min = Math.min(...yVals), max = Math.max(...yVals);
        summary.charts.push({
          type: "line",
          x: lineCandidate.x, y: lineCandidate.y,
          points: n, yMin: isFinite(min) ? min : null, yMax: isFinite(max) ? max : null
        });
      }
      if (barCandidate) {
        const data = buildBarTopK(table, barCandidate.cat, barCandidate.k);
        summary.charts.push({
          type: "barTopK",
          cat: barCandidate.cat,
          k: barCandidate.k,
          top: data.slice(0, 5)
        });
      }
      if (scatterCand) {
        const data = buildScatterData(table, scatterCand.x, scatterCand.y);
        summary.charts.push({
          type: "scatter",
          x: scatterCand.x, y: scatterCand.y, points: data.length
        });
      }

      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: { chartsSummary: summary } }),
      });
      const data = await res.json();
      const narrative = data?.narrative || "AI summary unavailable.";
      const bullets   = Array.isArray(data?.recommendations) ? data.recommendations.slice(0, 6) : [];
      setChartsAI({ narrative, bullets });
    } catch {
      setChartsAI({ narrative: "AI summary unavailable (request failed).", bullets: [] });
    } finally {
      setChartsAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <nav className="tabs sticky top-4 z-10">
        {["Load","Preview","Profile","Insights","Charts"].map((t) => (
          <button key={t} className="tab" data-active={active === t} onClick={() => setActive(t as TabKey)}>{t}</button>
        ))}
        <div className="ml-auto flex gap-2">
          <button className="btn text-white" onClick={loadSampleCSV}>Sample CSV</button>
          <button className="btn text-white" onClick={loadSampleJSON}>Sample JSON</button>
          <button className="btn text-white" onClick={clearAll}>Reset</button>
        </div>
      </nav>

      {/* LOAD */}
      {active === "Load" && (
        <section id="load" className="card p-5">
          <h2 className="section-title mb-3">1) Load Data</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {/* CSV */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload a CSV file</label>
              <div
                className="dropzone"
                data-hover={dzHover}
                onDragOver={(e) => { e.preventDefault(); setDzHover(true); }}
                onDragLeave={() => setDzHover(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDzHover(false);
                  const f = e.dataTransfer.files?.[0];
                  if ((f && f.type.includes("csv")) || f?.name.endsWith(".csv")) loadCSVFile(f);
                }}
              >
                <div className="space-y-2">
                  <p className="text-sm opacity-90">Drag & drop CSV here</p>
                  <p className="text-xs small-muted">or</p>
                  <button className="btn" onClick={() => (document.getElementById("csvFileInput") as HTMLInputElement)?.click()}>Browse</button>
                  {csvFileName && <div className="file-pill" title={csvFileName}>{csvFileName}</div>}
                </div>
                <input id="csvFileInput" type="file" accept=".csv" hidden onChange={(e)=> e.target.files && loadCSVFile(e.target.files[0])} />
              </div>
            </div>

            {/* JSON */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Paste a JSON array of objects</label>
              <textarea
                className="input h-36 w-full font-mono text-sm"
                placeholder='[{"id":1,"age":22},{"id":2,"age":27}]'
                value={jsonText}
                onChange={(e)=>setJsonText(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={()=>loadJSONText(jsonText)}>Load JSON</button>
                <button className="btn" onClick={loadSampleJSON}>Use sample JSON</button>
                <button className="btn" onClick={clearAll}>Clear</button>
              </div>
            </div>
          </div>

          {/* Fetch URL */}
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="grid gap-1 md:col-span-2">
              <label className="text-sm font-medium">Public JSON URL</label>
              <input className="input" placeholder="https://jsonplaceholder.typicode.com/posts" value={apiUrl} onChange={(e)=>setApiUrl(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Records path <span className="small-muted">(optional)</span></label>
              <input className="input" placeholder="data.items" value={apiPath} onChange={(e)=>setApiPath(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <button className="btn" onClick={fetchFromUrl}>Fetch & Load</button>
            </div>
          </div>
        </section>
      )}

      {/* PREVIEW */}
      {active === "Preview" && table && (
        <section id="preview" className="card p-5">
          <h2 className="section-title mb-2">2) Preview</h2>
          <p className="mb-3 small-muted text-white/80">
            Loaded <b className="text-white/90">{table.rows.length}</b> rows • <b className="text-white/90">{table.columns.length}</b> columns
          </p>
          <div className="table-wrap">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white/5 backdrop-blur">
                  {table.columns.map((c) => (
                    <th key={c} className="border px-3 py-2 text-left font-medium text-white/95">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="odd:bg-white/0 even:bg-white/5">
                    {table.columns.map((c) => (
                      <td key={c} className="border px-3 py-2 text-white/90">{String((row as any)[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs small-muted">Showing first 10 rows.</p>
        </section>
      )}

      {/* PROFILE */}
      {active === "Profile" && profile && (
        <section id="profile" className="card p-5">
          <h2 className="section-title mb-2">3) Profile</h2>
          <div className="table-wrap">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/5 backdrop-blur">
                  <th className="border px-3 py-2 text-left font-medium text-white/95">Column</th>
                  <th className="border px-3 py-2 text-left font-medium text-white/95">Type</th>
                  <th className="border px-3 py-2 text-left font-medium text-white/95">Missing %</th>
                  <th className="border px-3 py-2 text-left font-medium text-white/95">Distinct</th>
                  <th className="border px-3 py-2 text-left font-medium text-white/95">Numeric Summary</th>
                </tr>
              </thead>
              <tbody>
                {profile.map((p) => (
                  <tr key={p.name} className="odd:bg-white/0 even:bg-white/5">
                    <td className="border px-3 py-2 text-white/90">{p.name}</td>
                    <td className="border px-3 py-2 text-white/90">{p.type}</td>
                    <td className="border px-3 py-2 text-white/90">{p.missingPct}%</td>
                    <td className="border px-3 py-2 text-white/90">{p.distinct}</td>
                    <td className="border px-3 py-2 text-white/90">
                      {p.numeric
                        ? `n=${p.numeric.n}, mean=${p.numeric.mean.toFixed(2)}, med=${p.numeric.median.toFixed(2)}, min=${p.numeric.min}, max=${p.numeric.max}, sd=${p.numeric.stdev.toFixed(2)}, Q1=${p.numeric.q1.toFixed(2)}, Q3=${p.numeric.q3.toFixed(2)}, IQR=${p.numeric.iqr.toFixed(2)}, outliers(IQR)=${p.numeric.outliersIqr}, outliers(z)=${p.numeric.outliersZ}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* INSIGHTS */}
      {active === "Insights" && insights && (
        <section id="insights" className="card p-5 space-y-3">
          <h2 className="section-title mb-2">4) Insights</h2>

          {insights.narrative && <p className="text-sm text-white/95">{insights.narrative}</p>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {insights.bullets.length > 0
              ? insights.bullets.map((b, i) => (
                  <li key={i} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90">{b}</li>
                ))
              : <li className="text-sm">No noteworthy issues detected.</li>}
          </ul>

          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <p className="text-sm font-medium text-white/90">AI-powered recommendations</p>
            <div className="flex items-center gap-2">
              {ai?.status && (
                <span className={`text-[11px] px-2 py-1 rounded-full border ${
                  ai.status === "ai"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                    : "border-sky-400/40 bg-sky-400/10 text-sky-100"
                }`}>
                  {ai.status === "ai" ? "AI (Groq)" : "Deterministic fallback"}
                </span>
              )}
              <button className="btn text-xs" disabled={aiLoading} onClick={generateAI}>
                {aiLoading ? "Generating…" : "Generate AI recommendations"}
              </button>
            </div>
          </div>

          {ai && (ai.narrative || (ai.recommendations?.length ?? 0) > 0) && (
            <div className="mt-3 space-y-3">
              {ai.narrative && <p className="text-sm text-white/90">{ai.narrative}</p>}

              {ai.recommendations && ai.recommendations.length > 0 && (
                <div>
                  <p className="text-xs small-muted mb-1">Recommendations</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {ai.recommendations.map((r, i) => (
                      <li key={i} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90">{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {ai.risks && ai.risks.length > 0 && (
                <div>
                  <p className="text-xs small-muted mb-1">Risks / Caveats</p>
                  <ul className="grid gap-2">
                    {ai.risks.map((r, i) => (
                      <li key={i} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {ai.nextCharts && ai.nextCharts.length > 0 && (
                <div>
                  <p className="text-xs small-muted mb-1">Suggested follow-up charts</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {ai.nextCharts.map((r, i) => (
                      <li key={i} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90">{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* CHARTS */}
      {active === "Charts" && table && charts && charts.length > 0 && (
        <section id="charts" className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">5) Charts</h2>
            <button className="btn text-xs" onClick={summarizeChartsAI} disabled={chartsAiLoading}>
              {chartsAiLoading ? "Summarizing…" : "Summarize charts with AI"}
            </button>
          </div>

          {chartsAI && (chartsAI.narrative || (chartsAI.bullets?.length ?? 0) > 0) && (
            <div className="rounded-xl border border-white/15 bg-white/5 p-3">
              {chartsAI.narrative && <p className="text-sm text-white/90 mb-2">{chartsAI.narrative}</p>}
              {chartsAI.bullets && chartsAI.bullets.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {chartsAI.bullets.map((b, i) => (
                    <li key={i} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90">{b}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {charts.map((cfg, idx) => {
              if (cfg.type === "line") {
                const data = buildLineData(table, cfg.x, cfg.y);
                return (
                  <ChartCard key={`line-${idx}`} title={`${cfg.title}`}>
                    <ResponsiveContainer>
                      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="x"
                          tick={axisTick}
                          axisLine={{ stroke: axisStroke }}
                          tickLine={{ stroke: axisStroke }}
                          tickFormatter={dateFmt}
                        />
                        <YAxis
                          tick={axisTick}
                          axisLine={{ stroke: axisStroke }}
                          tickLine={{ stroke: axisStroke }}
                          tickFormatter={numFmt}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          labelFormatter={dateFmt}
                          contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                          formatter={(v) => [numFmt(Number(v)), cfg.y]}
                        />
                        <Legend />
                        <Brush dataKey="x" height={20} stroke="#8884d8" />
                        <Line type="monotone" dataKey="y" stroke="#93c5fd" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                );
              }
              if (cfg.type === "barTopK") {
                const data = buildBarTopK(table, cfg.cat, cfg.k);
                return (
                  <ChartCard key={`bar-${idx}`} title={`${cfg.title}`}>
                    <ResponsiveContainer>
                      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} />
                        <YAxis tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} tickFormatter={numFmt} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                                 formatter={(v) => [numFmt(Number(v)), "count"]} />
                        <Legend />
                        <Brush dataKey="name" height={20} stroke="#8884d8" />
                        <Bar dataKey="count" fill="#60a5fa" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                );
              }
              if (cfg.type === "scatter") {
                const data = buildScatterData(table, cfg.x, cfg.y);
                return (
                  <ChartCard key={`scatter-${idx}`} title={`${cfg.title}`}>
                    <ResponsiveContainer>
                      <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                        <XAxis dataKey="x" name={cfg.x} tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} tickFormatter={numFmt} />
                        <YAxis dataKey="y" name={cfg.y} tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} tickFormatter={numFmt} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                                 formatter={(v, name) => [numFmt(Number(v)), String(name)]} />
                        <Legend />
                        <Brush dataKey="x" height={20} stroke="#8884d8" />
                        <Scatter data={data} fill="#a78bfa" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </ChartCard>
                );
              }
              if (cfg.type === "hist") {
                const data = buildHistData(table, cfg.col, cfg.bins);
                return (
                  <ChartCard key={`hist-${idx}`} title={`${cfg.title}`}>
                    <ResponsiveContainer>
                      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                        <XAxis dataKey="bin" tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} tickFormatter={numFmt} />
                        <YAxis tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} tickFormatter={numFmt} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                                 formatter={(v) => [numFmt(Number(v)), "count"]} />
                        <Legend />
                        <Brush dataKey="bin" height={20} stroke="#8884d8" />
                        <Bar dataKey="count" fill="#34d399" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                );
              }
              if (cfg.type === "box") {
                const s = buildBoxSummary(table, cfg.col);
                return (
                  <div key={`box-${idx}`} className="rounded-xl border border-white/15 bg-white/5 p-3">
                    <p className="mb-2 text-sm font-medium text-white/90">{cfg.title}</p>
                    {!s ? (
                      <p className="text-sm">Not enough data</p>
                    ) : (
                      <div className="text-sm text-white/90">
                        <div>Q1: {s.q1.toFixed(2)} | Median: {s.q2.toFixed(2)} | Q3: {s.q3.toFixed(2)}</div>
                        <div>Whiskers: {s.whiskerLo.toFixed(2)} — {s.whiskerHi.toFixed(2)}</div>
                        <div>Min/Max: {s.min} / {s.max}</div>
                      </div>
                    )}
                  </div>
                );
              }
              if (cfg.type === "corrHeatmap") {
                const hm = buildCorrHeatmap(table, cfg.cols);
                return (
                  <div key={`hm-${idx}`} className="rounded-xl border border-white/15 bg-white/5 p-3 overflow-auto">
                    <p className="mb-2 text-sm font-medium text-white/90">{cfg.title}</p>
                    <div className="overflow-auto">
                      <table className="text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="p-1 text-white/90"></th>
                            {hm.cols.map(c => <th key={c} className="p-1 text-left text-white/90">{c}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {hm.cols.map((rowC, i) => (
                            <tr key={rowC}>
                              <th className="p-1 text-left text-white/90">{rowC}</th>
                              {hm.cols.map((colC, j) => {
                                const r = hm.data[i * hm.cols.length + j].r;
                                const val = Number.isFinite(r) ? r : 0;
                                const intensity = Math.round(Math.abs(val) * 255);
                                const bg = `rgb(${val >= 0 ? 32 + intensity/4 : 32}, ${32 + (255 - intensity)/4}, ${val >= 0 ? 32 : 32 + intensity/4})`;
                                return (
                                  <td key={colC} className="p-2 border text-white/90" title={`r=${val.toFixed(2)}`} style={{ background: bg }}>
                                    {val.toFixed(2)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              }
              return null;
            })}

            {/* New: Donut (Top category) */}
            {(() => {
              // find first string column
              if (!table) return null;
              const firstRow = table.rows[0] || {};
              const catCol = table.columns.find(c => typeof (firstRow as any)?.[c] === "string");
              if (!catCol) return null;
              const pieData = buildDonutTopK(table, catCol, 6);
              return (
                <ChartCard key="donut-1" title={`Share of ${catCol} (top categories)`}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} stroke="none">
                        {pieData.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                               formatter={(v, n) => [numFmt(Number(v)), String(n)]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              );
            })()}

            {/* New: Area (time series) */}
            {(() => {
              if (!trend || !table) return null;
              const series = buildAreaSeries(table, trend.dateCol, trend.numCol);
              if (series.length < 2) return null;
              return (
                <ChartCard key="area-1" title={`Area • ${trend.numCol} over ${trend.dateCol}`}>
                  <ResponsiveContainer>
                    <AreaChart data={series} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                      <XAxis dataKey="x" tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} tickFormatter={dateFmt} />
                      <YAxis tick={axisTick} axisLine={{ stroke: axisStroke }} tickLine={{ stroke: axisStroke }} tickFormatter={numFmt} />
                      <Tooltip labelFormatter={dateFmt}
                               contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                               formatter={(v) => [numFmt(Number(v)), trend.numCol]} />
                      <Legend />
                      <Area type="monotone" dataKey="y" fill="#22d3ee44" stroke="#22d3ee" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              );
            })()}
          </div>
        </section>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
