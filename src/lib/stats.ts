// src/lib/stats.ts
import type { Table, ColumnProfile, NumericSummary } from "./types";

/** ======================= Type Coercion & Detection ======================= */

const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;

export function coerceValue(v: any): any {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (NUMERIC_RE.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? n : v;
    }
    // ISO or parseable date strings
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return v;
}

export function coerceTable(table: Table): Table {
  const rows = table.rows.map((r) => {
    const out: Record<string, any> = {};
    for (const k of table.columns) out[k] = coerceValue(r?.[k]);
    return out;
  });
  return { columns: [...table.columns], rows };
}

/** ---- type inference ---- */
export function inferType(values: any[]): "number" | "string" | "date" | "unknown" {
  let n = 0, s = 0, d = 0;
  for (const v of values) {
    if (v === null) continue;
    if (typeof v === "number" && Number.isFinite(v)) n++;
    else if (v instanceof Date && !Number.isNaN(v.getTime())) d++;
    else if (typeof v === "string") {
      // try parse
      if (NUMERIC_RE.test(v)) n++;
      else if (!Number.isNaN(Date.parse(v))) d++;
      else s++;
    } else s++;
  }
  const max = Math.max(n, s, d);
  if (max === 0) return "unknown";
  if (max === n) return "number";
  if (max === d) return "date";
  return "string";
}

/** ======================= Basic Stats ======================= */

function quantile(sortedNums: number[], q: number) {
  if (sortedNums.length === 0) return NaN;
  const pos = (sortedNums.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedNums[base + 1] !== undefined) return sortedNums[base] + rest * (sortedNums[base + 1] - sortedNums[base]);
  return sortedNums[base];
}

function median(sortedNums: number[]) { return quantile(sortedNums, 0.5); }

function stdev(nums: number[], mean: number) {
  if (nums.length <= 1) return 0;
  const v = nums.reduce((a, x) => a + (x - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

export function profileTable(table: Table): ColumnProfile[] {
  const prof: ColumnProfile[] = [];
  for (const c of table.columns) {
    const colVals = table.rows.map(r => r?.[c] ?? null);
    const missing = colVals.filter(v => v === null).length;
    const missingPct = Math.round((missing / Math.max(1, table.rows.length)) * 100);
    const type = inferType(colVals);
    const distinct = new Set(colVals.filter(v => v !== null)).size;

    let numeric: NumericSummary | null = null;
    if (type === "number") {
      const nums = colVals.map(Number).filter(Number.isFinite);
      const sorted = [...nums].sort((a, b) => a - b);
      const n = nums.length;
      const mean = n ? nums.reduce((a, x) => a + x, 0) / n : 0;
      const med = n ? median(sorted) : 0;
      const min = n ? sorted[0] : 0;
      const max = n ? sorted[sorted.length - 1] : 0;
      const sd = stdev(nums, mean);
      const q1 = n ? quantile(sorted, 0.25) : 0;
      const q3 = n ? quantile(sorted, 0.75) : 0;
      const iqr = q3 - q1;

      const outliersIqr = nums.filter(x => (x < q1 - 1.5 * iqr) || (x > q3 + 1.5 * iqr)).length;
      const outliersZ = sd ? nums.filter(x => Math.abs((x - mean) / sd) > 3).length : 0;

      numeric = { n, mean, median: med, min, max, stdev: sd, q1, q3, iqr, outliersIqr, outliersZ };
    }

    prof.push({ name: c, type, missingPct, distinct, numeric });
  }
  return prof;
}

/** ======================= Associations ======================= */

export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const x = xs.slice(0, n), y = ys.slice(0, n);
  const mx = x.reduce((a, v) => a + v, 0) / n;
  const my = y.reduce((a, v) => a + v, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den ? num / den : NaN;
}

// Average ranks with ties
function rank(vals: number[]): number[] {
  const idx = vals.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r: number[] = Array(vals.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j + 2) / 2; // 1-based average rank
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const xr = rank(xs.slice(0, n));
  const yr = rank(ys.slice(0, n));
  return pearson(xr, yr);
}

// Cramér’s V for categorical-categorical association
export function cramersV(a: (string | number | null)[], b: (string | number | null)[]) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return NaN;
  const A: Record<string, number> = {};
  const B: Record<string, number> = {};
  const table: Record<string, Record<string, number>> = {};
  for (let i = 0; i < n; i++) {
    const ka = String(a[i] ?? "∅");
    const kb = String(b[i] ?? "∅");
    A[ka] = (A[ka] || 0) + 1;
    B[kb] = (B[kb] || 0) + 1;
    table[ka] = table[ka] || {};
    table[ka][kb] = (table[ka][kb] || 0) + 1;
  }
  const rows = Object.keys(A), cols = Object.keys(B);
  if (rows.length < 2 || cols.length < 2) return NaN;

  let chi2 = 0;
  for (const ra of rows) {
    for (const cb of cols) {
      const obs = table[ra]?.[cb] || 0;
      const exp = (A[ra] * B[cb]) / n;
      chi2 += exp ? (obs - exp) ** 2 / exp : 0;
    }
  }
  const k = Math.min(rows.length - 1, cols.length - 1);
  return Math.sqrt(chi2 / (n * k));
}

// η² (eta squared) — variance explained of numeric by categorical
export function etaSquared(cat: (string | number | null)[], num: number[]) {
  const n = Math.min(cat.length, num.length);
  const valid: { g: string; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const y = num[i];
    if (y === null || y === undefined || !Number.isFinite(y)) continue;
    valid.push({ g: String(cat[i] ?? "∅"), y });
  }
  if (valid.length < 3) return NaN;

  const grandMean = valid.reduce((a, p) => a + p.y, 0) / valid.length;
  const byGroup: Record<string, { n: number; sum: number }> = {};
  for (const p of valid) {
    byGroup[p.g] = byGroup[p.g] || { n: 0, sum: 0 };
    byGroup[p.g].n++; byGroup[p.g].sum += p.y;
  }
  const sst = valid.reduce((a, p) => a + (p.y - grandMean) ** 2, 0);
  const ssb = Object.values(byGroup).reduce((a, g) => a + g.n * ((g.sum / g.n) - grandMean) ** 2, 0);
  return sst ? ssb / sst : NaN;
}

/** ======================= Correlations Top-K ======================= */

export function topCorrelations(table: Table, k = 3) {
  const numCols = table.columns.filter(c => inferType(table.rows.map(r => r[c])) === "number");
  const pairs: { a: string; b: string; r: number; kind: "pearson" | "spearman" }[] = [];
  for (let i = 0; i < numCols.length; i++) {
    for (let j = i + 1; j < numCols.length; j++) {
      const a = numCols[i], b = numCols[j];
      const xs = table.rows.map(r => Number(r[a])).filter(Number.isFinite);
      const ys = table.rows.map(r => Number(r[b])).filter(Number.isFinite);
      if (Math.min(xs.length, ys.length) < 3) continue;
      const rp = pearson(xs, ys);
      const rs = spearman(xs, ys);
      if (Number.isFinite(rp)) pairs.push({ a, b, r: rp, kind: "pearson" });
      if (Number.isFinite(rs)) pairs.push({ a, b, r: rs, kind: "spearman" });
    }
  }
  return pairs
    .sort((p, q) => Math.abs(q.r) - Math.abs(p.r))
    .slice(0, k);
}

/** ======================= Trends, Seasonality, Anomalies ======================= */

export function firstDateTrend(table: Table) {
  const dateCol = table.columns.find(c => inferType(table.rows.map(r => r[c])) === "date");
  const numCol = table.columns.find(c => inferType(table.rows.map(r => r[c])) === "number");
  if (!dateCol || !numCol) return null;
  const points = table.rows
    .map(r => ({ t: new Date(r[dateCol]), y: Number(r[numCol]) }))
    .filter(p => !isNaN(p.t.getTime()) && Number.isFinite(p.y))
    .sort((a, b) => a.t.getTime() - b.t.getTime());
  if (points.length < 3) return null;

  const xs = points.map((_, i) => i); // index proxy
  const ys = points.map(p => p.y);
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length;
  const my = ys.reduce((a, v) => a + v, 0) / ys.length;
  let num = 0, den = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; dy2 += (ys[i] - my) ** 2; }
  const slope = den ? num / den : 0;
  const r = Math.sqrt(den && dy2 ? (num ** 2) / (den * dy2) : 0) * (slope >= 0 ? 1 : -1);
  const r2 = r * r;

  // simple single-changepoint scan (piecewise constant baseline)
  let best = { idx: -1, gain: 0 };
  const mean = my;
  const sseFull = ys.reduce((a, y) => a + (y - mean) ** 2, 0);
  for (let split = 3; split <= ys.length - 3; split++) {
    const m1 = ys.slice(0, split).reduce((a, v) => a + v, 0) / split;
    const m2 = ys.slice(split).reduce((a, v) => a + v, 0) / (ys.length - split);
    const sse1 = ys.slice(0, split).reduce((a, y) => a + (y - m1) ** 2, 0);
    const sse2 = ys.slice(split).reduce((a, y) => a + (y - m2) ** 2, 0);
    const gain = sseFull ? 1 - (sse1 + sse2) / sseFull : 0; // proportion improvement
    if (gain > best.gain) best = { idx: split, gain };
  }

  const dir: "up" | "down" | "flat" = Math.abs(slope) < 1e-8 ? "flat" : slope > 0 ? "up" : "down";
  const changepoint = best.gain >= 0.3 ? { atIndex: best.idx, improvement: +best.gain.toFixed(2) } : null;

  // anomalies (global z-score)
  const sd = stdev(ys, my);
  const anomalies = sd ? ys.map((y, i) => ({ i, y, z: (y - my) / sd })).filter(p => Math.abs(p.z) > 3).length : 0;

  return { dateCol, numCol, slope, r2: +r2.toFixed(3), dir, changepoint, anomalies };
}

export function duplicateRows(table: Table) {
  const seen = new Set<string>();
  let dup = 0;
  for (const r of table.rows) {
    const key = JSON.stringify(r);
    if (seen.has(key)) dup++; else seen.add(key);
  }
  return dup;
}

export function categoryImbalance(table: Table) {
  const cols = table.columns.filter(c => inferType(table.rows.map(r => r[c])) === "string");
  if (cols.length === 0) return null;
  const c = cols[0];
  const counts: Record<string, number> = {};
  for (const r of table.rows) {
    const k = String(r?.[c] ?? "Unknown");
    counts[k] = (counts[k] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = entries[0]?.[1] ?? 0, n = table.rows.length || 1;
  return { column: c, topCategory: entries[0]?.[0] ?? "Unknown", topShare: +(top / n * 100).toFixed(1) };
}

export function weekdaySeasonality(table: Table) {
  const dateCol = table.columns.find(c => inferType(table.rows.map(r => r[c])) === "date");
  const numCol  = table.columns.find(c => inferType(table.rows.map(r => r[c])) === "number");
  if (!dateCol || !numCol) return null;
  const sums = Array(7).fill(0), counts = Array(7).fill(0);
  for (const r of table.rows) {
    const d = new Date(r[dateCol]); if (isNaN(d.getTime())) continue;
    const w = d.getDay();
    const v = Number(r[numCol]); if (!Number.isFinite(v)) continue;
    sums[w]+=v; counts[w]++;
  }
  const avgs = sums.map((s,i)=> counts[i]? s/counts[i] : 0);
  const maxIdx = avgs.reduce((m,_,i)=> avgs[i]>avgs[m]? i:m,0);
  return { dateCol, numCol, bestWeekday: maxIdx, bestWeekdayAvg: avgs[maxIdx] };
}

export function monthSeasonality(table: Table) {
  const dateCol = table.columns.find(c => inferType(table.rows.map(r => r[c])) === "date");
  const numCol  = table.columns.find(c => inferType(table.rows.map(r => r[c])) === "number");
  if (!dateCol || !numCol) return null;
  const sums = Array(12).fill(0), counts = Array(12).fill(0);
  for (const r of table.rows) {
    const d = new Date(r[dateCol]); if (isNaN(d.getTime())) continue;
    const m = d.getMonth();
    const v = Number(r[numCol]); if (!Number.isFinite(v)) continue;
    sums[m]+=v; counts[m]++;
  }
  const avgs = sums.map((s,i)=> counts[i]? s/counts[i] : 0);
  const maxIdx = avgs.reduce((m,_,i)=> avgs[i]>avgs[m]? i:m,0);
  const minIdx = avgs.reduce((m,_,i)=> avgs[i]<avgs[m]? i:m,0);
  const amplitude = avgs[maxIdx] - avgs[minIdx];
  const mean = avgs.reduce((a,v)=>a+v,0) / (counts.filter(c=>c>0).length || 1);
  const strong = mean ? amplitude / mean >= 0.3 : false;
  return { dateCol, numCol, peakMonth: maxIdx, troughMonth: minIdx, strong };
}

/** ======================= Histogram/Box/Heatmap helpers ======================= */

export function histogram(values: number[], bins = 10) {
  const nums = values.filter(Number.isFinite);
  if (nums.length === 0) return { bins: [], counts: [] as number[], edges: [] as number[] };
  const min = Math.min(...nums), max = Math.max(...nums);
  const width = (max - min) || 1;
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + (i * width) / bins);
  const counts = Array(bins).fill(0);
  for (const v of nums) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / width) * bins)));
    counts[idx]++;
  }
  const centers = counts.map((_, i) => (edges[i] + edges[i + 1]) / 2);
  return { bins: centers, counts, edges };
}

export function corrMatrix(table: Table) {
  const cols = table.columns.filter(c => inferType(table.rows.map(r => r[c])) === "number");
  const mat: number[][] = cols.map(() => cols.map(() => NaN));
  for (let i = 0; i < cols.length; i++) {
    for (let j = i; j < cols.length; j++) {
      if (i === j) { mat[i][j] = 1; continue; }
      const a = cols[i], b = cols[j];
      const xs = table.rows.map(r => Number(r[a])).filter(Number.isFinite);
      const ys = table.rows.map(r => Number(r[b])).filter(Number.isFinite);
      const n = Math.min(xs.length, ys.length);
      const r = n >= 3 ? pearson(xs.slice(0, n), ys.slice(0, n)) : NaN;
      mat[i][j] = mat[j][i] = r;
    }
  }
  return { cols, mat };
}
