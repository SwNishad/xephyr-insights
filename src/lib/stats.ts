// src/lib/stats.ts
import type { Table, ColumnProfile, ColType } from "./types";

// ---------- helpers ----------
export function isFiniteNumber(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function summarizeNumeric(arr: number[]) {
  const clean = arr.filter(isFiniteNumber);
  const n = clean.length;
  if (!n) return { n: 0, mean: 0, median: 0, min: 0, max: 0, stdev: 0 };

  const sorted = [...clean].sort((a, b) => a - b);
  const sum = clean.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  return { n, mean, median, min, max, stdev };
}

export function zScoreOutliers(arr: number[], threshold = 3) {
  const { n, mean, stdev } = summarizeNumeric(arr);
  if (n === 0 || stdev === 0) return 0;
  return arr.filter((v) => isFiniteNumber(v) && Math.abs((v - mean) / stdev) > threshold).length;
}

// Pearson correlation for numeric arrays (returns -1..1)
export function pearson(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  if (!n) return 0;
  const xx = x.filter(isFiniteNumber);
  const yy = y.filter(isFiniteNumber);
  const m = Math.min(xx.length, yy.length);
  if (!m) return 0;

  const mx = xx.reduce((a, b) => a + b, 0) / m;
  const my = yy.reduce((a, b) => a + b, 0) / m;

  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < m; i++) {
    const ax = xx[i] - mx;
    const by = yy[i] - my;
    num += ax * by;
    dx += ax * ax;
    dy += by * by;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

// Simple trend using OLS slope over index (0..n-1)
export function simpleTrend(values: number[]) {
  const n = values.length;
  if (!n) return { slope: 0, dir: "flat" as const };
  const xs = Array.from({ length: n }, (_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const dir = slope > 0 ? "up" : slope < 0 ? "down" : "flat";
  return { slope, dir };
}

// ---------- type inference ----------
export function inferType(values: any[]): ColType {
  // decide based on majority of non-empty values
  let num = 0, str = 0, dat = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) { num++; continue; }
    // try numeric-like strings
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) { num++; continue; }
    // date-like (very naive; good enough for demo)
    const d = new Date(v as any);
    if (!isNaN(d.getTime())) { dat++; continue; }
    str++;
  }
  if (num >= dat && num >= str) return "number";
  if (dat >= num && dat >= str) return "date";
  if (str > 0) return "string";
  return "unknown";
}

// ---------- main: profile ----------
export function profileTable(table: Table): ColumnProfile[] {
  const total = table.rows.length || 0;

  return table.columns.map((name) => {
    const colVals = table.rows.map((r) => r?.[name]);
    const missing = colVals.filter((v) => v === null || v === undefined || v === "").length;
    const missingPct = total ? Math.round((missing / total) * 100) : 0;
    const distinct = new Set(colVals.map((v) => String(v))).size;

    const type = inferType(colVals);

    let numeric: ColumnProfile["numeric"];
    if (type === "number") {
      const nums = colVals.map((v) => (typeof v === "number" ? v : Number(v)));
      const summary = summarizeNumeric(nums);
      numeric = {
        ...summary,
        outliers: zScoreOutliers(nums, 3),
      };
    }

    return { name, type, missingPct, distinct, numeric };
  });
}

// ---------- extra: correlations & best trend ----------
export function topCorrelations(table: Table, limit = 3) {
  // find numeric columns
  const numericCols = table.columns.filter((c) => inferType(table.rows.map((r) => r[c])) === "number");
  const results: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const a = numericCols[i], b = numericCols[j];
      const ax = table.rows.map((r) => Number(r[a]));
      const by = table.rows.map((r) => Number(r[b]));
      const r = pearson(ax, by);
      if (!Number.isNaN(r)) results.push({ a, b, r });
    }
  }
  return results
    .sort((x, y) => Math.abs(y.r) - Math.abs(x.r))
    .slice(0, limit);
}

export function firstDateTrend(table: Table) {
  const dateCol = table.columns.find((c) => inferType(table.rows.map((r) => r[c])) === "date");
  const numCol = table.columns.find((c) => inferType(table.rows.map((r) => r[c])) === "number");
  if (!dateCol || !numCol) return null;

  // sort by date ascending using Date constructor
  const rows = [...table.rows].filter((r) => r?.[dateCol]).sort(
    (a, b) => new Date(a[dateCol]).getTime() - new Date(b[dateCol]).getTime()
  );
  const values = rows.map((r) => Number(r[numCol])).filter((v) => Number.isFinite(v));
  const { slope, dir } = simpleTrend(values);
  return { dateCol, numCol, slope, dir };
}
