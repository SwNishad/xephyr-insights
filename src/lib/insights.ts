// src/lib/insights.ts
import type { Table, ColumnProfile } from "./types";
import {
  profileTable, topCorrelations, firstDateTrend,
  duplicateRows, categoryImbalance, weekdaySeasonality, monthSeasonality,
  inferType, cramersV, etaSquared
} from "./stats";

export function generateInsightsAll(table: Table) {
  const profile = profileTable(table);
  const corrs = topCorrelations(table, 5);
  const trend = firstDateTrend(table);
  const dup = duplicateRows(table);
  const imb = categoryImbalance(table);
  const wSeason = weekdaySeasonality(table);
  const mSeason = monthSeasonality(table);

  // cat↔cat (Cramér’s V) and cat→num (η²)
  const cats = table.columns.filter(c => inferType(table.rows.map(r => r[c])) === "string");
  const nums = table.columns.filter(c => inferType(table.rows.map(r => r[c])) === "number");

  const catCat: { a: string; b: string; v: number }[] = [];
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const a = cats[i], b = cats[j];
      const v = cramersV(table.rows.map(r => r[a] ?? null), table.rows.map(r => r[b] ?? null));
      if (Number.isFinite(v)) catCat.push({ a, b, v });
    }
  }
  catCat.sort((p, q) => q.v - p.v);

  const catNum: { cat: string; num: string; eta2: number }[] = [];
  for (const c of cats) {
    for (const n of nums) {
      const e2 = etaSquared(table.rows.map(r => r[c] ?? null), table.rows.map(r => Number(r[n])));
      if (Number.isFinite(e2)) catNum.push({ cat: c, num: n, eta2: e2 });
    }
  }
  catNum.sort((p, q) => q.eta2 - p.eta2);

  const bullets: string[] = [];

  for (const col of profile) {
    if (col.missingPct >= 10) bullets.push(`"${col.name}" has ~${col.missingPct}% missing values.`);
    if (col.numeric?.outliersIqr) bullets.push(`"${col.name}" has ${col.numeric.outliersIqr} IQR outlier(s).`);
    if (col.numeric?.outliersZ) bullets.push(`"${col.name}" has ${col.numeric.outliersZ} 3σ outlier(s).`);
  }

  for (const c of corrs.filter(c => Math.abs(c.r) >= 0.7).slice(0, 3)) {
    bullets.push(`${c.kind === "spearman" ? "Monotonic" : "Linear"} correlation: "${c.a}" ↔ "${c.b}" (r=${c.r.toFixed(2)}).`);
  }

  if (trend && trend.dir !== "flat") {
    bullets.push(`Trend: "${trend.numCol}" is trending ${trend.dir} over "${trend.dateCol}" (R²=${trend.r2}).`);
    if (trend.changepoint) bullets.push(`Structural shift near index ${trend.changepoint.atIndex} (fit improvement ≈ ${Math.round(trend.changepoint.improvement*100)}%).`);
    if (trend.anomalies) bullets.push(`${trend.anomalies} timepoint(s) flagged as anomalies (|z|>3).`);
  }

  if (dup > 0) bullets.push(`Detected ${dup} duplicate row(s).`);
  if (imb) bullets.push(`Category imbalance: "${imb.column}" dominated by "${imb.topCategory}" (~${imb.topShare}%).`);
  if (wSeason) bullets.push(`Weekday seasonality: "${wSeason.numCol}" peaks on weekday=${wSeason.bestWeekday}.`);
  if (mSeason?.strong) bullets.push(`Monthly seasonality: peaks in month=${mSeason.peakMonth+1}, trough in month=${mSeason.troughMonth+1}.`);

  const strongV = catCat.filter(x => x.v >= 0.6).slice(0, 2);
  for (const x of strongV) bullets.push(`Strong association (Cramér’s V): "${x.a}" ↔ "${x.b}" (V=${x.v.toFixed(2)}).`);

  const strongEta = catNum.filter(x => x.eta2 >= 0.25).slice(0, 2);
  for (const x of strongEta) bullets.push(`"${x.cat}" explains ~${Math.round(x.eta2*100)}% variance in "${x.num}" (η²).`);

  const narrative = buildNarrative(profile, bullets.length);

  return {
    profile,
    bullets: Array.from(new Set(bullets)),
    narrative,
    extras: { corrs, catCat: catCat.slice(0, 5), catNum: catNum.slice(0, 5), trend, wSeason, mSeason, dup, imb },
  };
}

function buildNarrative(profile: ColumnProfile[], bulletCount: number) {
  const cols = profile.length;
  const missingCols = profile.filter((c) => c.missingPct >= 10).length;
  const outlierCols = profile.filter((c) => (c.numeric?.outliersIqr ?? 0) + (c.numeric?.outliersZ ?? 0) > 0).length;
  let s = `Dataset summary: ${cols} column(s).`;
  if (missingCols > 0) s += ` ${missingCols} column(s) with notable missing values.`;
  if (outlierCols > 0) s += ` Outliers present in ${outlierCols} numeric column(s).`;
  if (bulletCount > 0) s += ` Key findings listed below.`;
  return s;
}

/** Build compact analysis for LLM (no raw rows) */
export function buildAiAnalysisPayload(det: ReturnType<typeof generateInsightsAll>) {
  const cols: { name: string; type: string; missingPct: number; numeric?: any }[] =
    det.profile.map((c) => ({
      name: c.name,
      type: c.type,
      missingPct: c.missingPct,
      numeric: c.numeric ? {
        n: c.numeric.n,
        mean: +c.numeric.mean.toFixed(4),
        median: +c.numeric.median.toFixed(4),
        min: c.numeric.min,
        max: c.numeric.max,
        stdev: +c.numeric.stdev.toFixed(4),
        q1: +c.numeric.q1.toFixed(4),
        q3: +c.numeric.q3.toFixed(4),
        iqr: +c.numeric.iqr.toFixed(4),
        outliersIqr: c.numeric.outliersIqr,
        outliersZ: c.numeric.outliersZ,
      } : undefined
    }));

  const corrs = det.extras.corrs.map(c => ({ a: c.a, b: c.b, r: +c.r.toFixed(4), kind: c.kind }));
  const trend = det.extras.trend ? {
    dateCol: det.extras.trend.dateCol,
    numCol: det.extras.trend.numCol,
    r2: det.extras.trend.r2,
    dir: det.extras.trend.dir,
    anomalies: det.extras.trend.anomalies,
    changepoint: det.extras.trend.changepoint || null,
  } : null;

  const seasonal = {
    weekday: det.extras.wSeason ? {
      dateCol: det.extras.wSeason.dateCol,
      numCol: det.extras.wSeason.numCol,
      bestWeekday: det.extras.wSeason.bestWeekday,
      bestWeekdayAvg: +det.extras.wSeason.bestWeekdayAvg.toFixed(4),
    } : null,
    month: det.extras.mSeason ? {
      dateCol: det.extras.mSeason.dateCol,
      numCol: det.extras.mSeason.numCol,
      peakMonth: det.extras.mSeason.peakMonth,
      troughMonth: det.extras.mSeason.troughMonth,
      strong: det.extras.mSeason.strong,
    } : null
  };

  return {
    summary: det.narrative,
    bullets: det.bullets,
    profile: cols,
    correlations: corrs,
    trend,
    seasonality: seasonal,
    duplicates: det.extras.dup || 0,
    imbalance: det.extras.imb || null,
    categorical: {
      catCatTop: det.extras.catCat || [],
      catNumTop: det.extras.catNum || [],
    },
  };
}
