// src/app/api/ai-insights/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.1-70b-versatile";

function ok<T>(data: T, status = 200) { return NextResponse.json(data as any, { status }); }
function err(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

/* ---------------------- Fallbacks ---------------------- */

// Old deterministic fallback from full analysis (unchanged, trimmed)
function fallbackFromAnalysis(analysis: any) {
  const recs: string[] = [];
  const risks: string[] = [];

  const prof = Array.isArray(analysis?.profile) ? analysis.profile : [];
  const missingCols = prof
    .filter((c: any) => (c?.missingPct ?? 0) >= 10)
    .sort((a: any, b: any) => b.missingPct - a.missingPct)
    .slice(0, 3)
    .map((c: any) => `${c.name} (~${c.missingPct}%)`);
  if (missingCols.length) {
    recs.push(`Handle missing values: ${missingCols.join(", ")}. Try imputation (median/mode) or drop if non-critical.`);
  }

  const outlierCols = prof
    .filter((c: any) => (c?.numeric?.outliersIqr ?? 0) > 0 || (c?.numeric?.outliersZ ?? 0) > 0)
    .sort((a: any, b: any) =>
      (b?.numeric?.outliersIqr ?? 0) + (b?.numeric?.outliersZ ?? 0) -
      ((a?.numeric?.outliersIqr ?? 0) + (a?.numeric?.outliersZ ?? 0))
    )
    .slice(0, 3)
    .map((c: any) => c.name);
  if (outlierCols.length) {
    recs.push(`Mitigate outliers in ${outlierCols.join(", ")} via winsorization or robust scaling; compare metrics pre/post.`);
  }

  const corrs = Array.isArray(analysis?.correlations) ? analysis.correlations : [];
  const strongCorrs = corrs.filter((c: any) => Math.abs(c?.r ?? 0) >= 0.7).slice(0, 3);
  for (const c of strongCorrs) {
    recs.push(`Probe relationship ${c.a} ↔ ${c.b} (r=${Number(c.r).toFixed(2)}): scatter + partial correlation; watch multicollinearity.`);
  }

  if (analysis?.trend?.dir && analysis?.trend?.r2) {
    recs.push(`Model time trend on "${analysis.trend.numCol}" vs "${analysis.trend.dateCol}" (R²=${analysis.trend.r2}); check changepoints.`);
  }

  if (analysis?.imbalance?.topShare) {
    recs.push(`Rebalance "${analysis.imbalance.column}" (top category ~${analysis.imbalance.topShare}%): stratified sampling or class weights.`);
  }
  if ((analysis?.duplicates ?? 0) > 0) {
    risks.push(`Dataset contains ${analysis.duplicates} duplicate rows — deduplicate before training.`);
  }

  const catCatTop = Array.isArray(analysis?.categorical?.catCatTop) ? analysis.categorical.catCatTop : [];
  for (const x of catCatTop.filter((x: any) => (x?.v ?? 0) >= 0.5).slice(0, 2)) {
    recs.push(`Assess categorical association "${x.a}" ↔ "${x.b}" (Cramér’s V=${x.v.toFixed(2)}); consider redundancy or interactions.`);
  }
  const catNumTop = Array.isArray(analysis?.categorical?.catNumTop) ? analysis.categorical.catNumTop : [];
  for (const x of catNumTop.filter((x: any) => (x?.eta2 ?? 0) >= 0.2).slice(0, 2)) {
    recs.push(`"${x.cat}" explains ~${Math.round(x.eta2 * 100)}% variance in "${x.num}" (η²); consider one-hot/target encoding + regularization.`);
  }

  const uniq = Array.from(new Set(recs)).slice(0, 8);
  return {
    status: "fallback" as const,
    narrative: "AI fallback: actionable, rule-based recommendations.",
    recommendations: uniq,
    risks: Array.from(new Set(risks)).slice(0, 4),
    nextCharts: [],
  };
}

// NEW: deterministic fallback from charts-only summary
function fallbackFromCharts(chartsSummary: any) {
  const bullets: string[] = [];
  const charts = Array.isArray(chartsSummary?.charts) ? chartsSummary.charts : [];

  const line = charts.find((c: any) => c.type === "line");
  if (line && Number.isFinite(line.yMin) && Number.isFinite(line.yMax)) {
    const range = Number(line.yMax) - Number(line.yMin);
    const dir = range > 0 ? "increasing" : "flat";
    bullets.push(
      `Line • ${line.y} over ${line.x}: range ${line.yMin} → ${line.yMax} (${dir}). Check trend stability and seasonality.`
    );
  }

  const bar = charts.find((c: any) => c.type === "barTopK");
  if (bar?.top?.length) {
    const total = bar.top.reduce((s: number, t: any) => s + (t?.count ?? t?.value ?? 0), 0);
    const [first] = bar.top;
    const share = total ? Math.round(((first?.count ?? first?.value ?? 0) / total) * 100) : null;
    bullets.push(
      `Bar • Top ${bar.k} of ${bar.cat}: “${first?.name}” leads${share !== null ? ` (~${share}%)` : ""}. Consider long tail vs head strategy.`
    );
  }

  const scatter = charts.find((c: any) => c.type === "scatter");
  if (scatter?.points) {
    bullets.push(`Scatter • ${scatter.x} vs ${scatter.y}: ${scatter.points} points. Inspect nonlinearity/outliers; fit robust regression if needed.`);
  }

  return {
    status: "fallback" as const,
    narrative: "Charts summary (deterministic): quick, action-oriented takeaways.",
    recommendations: bullets.slice(0, 6),
    risks: [],
    nextCharts: [],
  };
}

/* ---------------------- Route ---------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const analysis = body?.analysis;
    if (!analysis || typeof analysis !== "object") return err("Missing 'analysis' object in body.");

    // If the request is coming from the Charts tab
    const chartsSummary = (analysis as any)?.chartsSummary;
    const isChartsOnly = chartsSummary && typeof chartsSummary === "object";

    // If no Groq, always deterministic (different fallback for charts-only)
    if (provider !== "groq") {
      return ok(isChartsOnly ? fallbackFromCharts(chartsSummary) : fallbackFromAnalysis(analysis));
    }

    const key = process.env.GROQ_API_KEY;
    if (!key) return err("GROQ_API_KEY missing in environment.");

    const systemPromptForAnalysis =
      [
        "You are a senior data analyst.",
        "You will receive a compact analysis JSON with metrics (types, missing%, outliers, correlations, trend R2, seasonality, imbalance, duplicates, Cramér’s V, η²).",
        "Return a JSON OBJECT ONLY (no prose outside JSON). Do not invent numbers.",
        "{",
        '  "narrative": string,',
        '  "recommendations": string[],',
        '  "risks": string[],',
        '  "nextCharts": string[]',
        "}",
        "Be concise, actionable, business-friendly.",
      ].join("\n");

    // NEW: prompt specialized for charts-only summaries
    const systemPromptForCharts =
      [
        "You are a senior data analyst summarizing visualizations.",
        "You will receive a minimal JSON describing rendered charts (e.g., line yMin/yMax, bar top categories, scatter point count).",
        "Infer trends, dominance/imbalance, and suggested follow-ups. Do NOT invent metrics not implied by the JSON.",
        "Return a JSON OBJECT ONLY:",
        "{",
        '  "narrative": string,',
        '  "recommendations": string[],',
        '  "risks": string[],',
        '  "nextCharts": string[]',
        "}",
        "Keep it short, pragmatic, and decision-focused.",
      ].join("\n");

    const systemPrompt = isChartsOnly ? systemPromptForCharts : systemPromptForAnalysis;

    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(isChartsOnly ? chartsSummary : analysis) },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[ai-insights] Groq error", resp.status, text);
      return ok(isChartsOnly ? fallbackFromCharts(chartsSummary) : fallbackFromAnalysis(analysis));
    }

    const json = await resp.json().catch(() => ({}));
    const text = json?.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }

    const out = {
      status: "ai" as const,
      narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((x: any) => typeof x === "string") : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.filter((x: any) => typeof x === "string") : [],
      nextCharts: Array.isArray(parsed.nextCharts) ? parsed.nextCharts.filter((x: any) => typeof x === "string") : [],
    };

    // If model returned nothing meaningful → deterministic
    if ((!out.narrative || out.narrative.trim() === "") && out.recommendations.length === 0) {
      return ok(isChartsOnly ? fallbackFromCharts(chartsSummary) : fallbackFromAnalysis(analysis));
    }

    return ok(out);
  } catch (e) {
    console.error("[ai-insights] Unexpected error", e);
    return ok({ status: "fallback", narrative: "", recommendations: [], risks: [], nextCharts: [] });
  }
}
