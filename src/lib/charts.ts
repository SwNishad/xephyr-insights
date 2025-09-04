// src/lib/charts.ts
import type { Table, ChartConfig } from "./types";
import { inferType, histogram, corrMatrix } from "./stats";

export function suggestCharts(table: Table): ChartConfig[] {
  const types: Record<string, "number" | "string" | "date" | "unknown"> =
    Object.fromEntries(table.columns.map((c) => [c, inferType(table.rows.map((r) => r[c]))])) as any;

  const dateCols = table.columns.filter((c) => types[c] === "date");
  const numCols  = table.columns.filter((c) => types[c] === "number");
  const strCols  = table.columns.filter((c) => types[c] === "string");

  const cfgs: ChartConfig[] = [];

  // time series → line + area
  if (dateCols[0] && numCols[0]) {
    cfgs.push({ type: "line", x: dateCols[0], y: numCols[0], title: `Trend of ${numCols[0]} over ${dateCols[0]}` });
    cfgs.push({ type: "area", x: dateCols[0], y: numCols[0], title: `Area trend of ${numCols[0]} over ${dateCols[0]}` });
  }

  // categories → bar + donut
  if (strCols[0]) {
    cfgs.push({ type: "barTopK", cat: strCols[0], k: 10, title: `Top ${strCols[0]}` });
    cfgs.push({ type: "donut", cat: strCols[0], k: 6,  title: `Share of ${strCols[0]} (top ${Math.min(6, 10)})` });
  }

  // scatter of first two numerics
  if (numCols.length >= 2) cfgs.push({ type: "scatter", x: numCols[0], y: numCols[1], title: `${numCols[0]} vs ${numCols[1]}` });

  // hist + box for first numeric
  if (numCols[0]) {
    cfgs.push({ type: "hist", col: numCols[0], bins: 12, title: `Distribution of ${numCols[0]}` });
    cfgs.push({ type: "box", col: numCols[0], title: `Boxplot of ${numCols[0]}` });
  }

  // correlation heatmap for numerics
  if (numCols.length >= 3) cfgs.push({ type: "corrHeatmap", cols: numCols.slice(0, 6), title: "Correlation heatmap" });

  return cfgs.slice(0, 8);
}

// -------- builders --------
export function buildLineData(table: Table, x: string, y: string) {
  return table.rows.map((r) => ({ x: r?.[x], y: Number(r?.[y]) })).filter((d) => d.x && Number.isFinite(d.y));
}
export function buildAreaData(table: Table, x: string, y: string) {  // NEW
  return buildLineData(table, x, y);
}
export function buildBarTopK(table: Table, cat: string, k = 10) {
  const counts: Record<string, number> = {};
  for (const r of table.rows) {
    const key = String(r?.[cat] ?? "Unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, count]) => ({ name, count }));
}
export function buildPieTopK(table: Table, cat: string, k = 6) {     // NEW
  return buildBarTopK(table, cat, k).map(d => ({ name: d.name, value: d.count }));
}
export function buildScatterData(table: Table, x: string, y: string) {
  return table.rows.map((r) => ({ x: Number(r?.[x]), y: Number(r?.[y]) })).filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));
}
export function buildHistData(table: Table, col: string, bins = 12) {
  const vals = table.rows.map((r) => Number(r?.[col]));
  const { bins: centers, counts } = histogram(vals, bins);
  return centers.map((c, i) => ({ bin: c, count: counts[i] }));
}
export function buildBoxSummary(table: Table, col: string) {
  const vals = table.rows.map((r) => Number(r?.[col])).filter(Number.isFinite).sort((a, b) => a - b);
  if (!vals.length) return null;
  const q1 = vals[Math.floor((vals.length - 1) * 0.25)];
  const q2 = vals[Math.floor((vals.length - 1) * 0.5)];
  const q3 = vals[Math.floor((vals.length - 1) * 0.75)];
  const iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const min = vals[0], max = vals[vals.length - 1];
  const whiskerLo = vals.find((v) => v >= lo) ?? min;
  const whiskerHi = [...vals].reverse().find((v) => v <= hi) ?? max;
  return { q1, q2, q3, whiskerLo, whiskerHi, min, max };
}
export function buildCorrHeatmap(table: Table, cols?: string[]) {
  const { cols: all, mat } = corrMatrix(table);
  const chosen = cols && cols.length ? cols : all;
  const data: { x: string; y: string; r: number }[] = [];
  for (let i = 0; i < chosen.length; i++) {
    for (let j = 0; j < chosen.length; j++) {
      const ia = all.indexOf(chosen[i]), jb = all.indexOf(chosen[j]);
      const r = (ia >= 0 && jb >= 0) ? mat[ia][jb] : NaN;
      data.push({ x: chosen[i], y: chosen[j], r: Number.isFinite(r) ? r : 0 });
    }
  }
  return { cols: chosen, data };
}
