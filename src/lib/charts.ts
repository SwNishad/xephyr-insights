// src/lib/charts.ts
import type { Table } from "./types";
import { inferType } from "./stats";

// What we'll render
export type ChartConfig =
  | { type: "line"; x: string; y: string; title: string }
  | { type: "bar"; cat: string; title: string }
  | { type: "scatter"; x: string; y: string; title: string };

// Choose up to 3 charts that make sense for the loaded table
export function suggestCharts(table: Table): ChartConfig[] {
  const types = Object.fromEntries(
    table.columns.map((c) => [c, inferType(table.rows.map((r) => r[c]))])
  ) as Record<string, "number" | "string" | "date" | "unknown">;

  const dateCols = table.columns.filter((c) => types[c] === "date");
  const numCols  = table.columns.filter((c) => types[c] === "number");
  const strCols  = table.columns.filter((c) => types[c] === "string");

  const configs: ChartConfig[] = [];

  // 1) Line: first date vs first numeric
  if (dateCols[0] && numCols[0]) {
    configs.push({
      type: "line",
      x: dateCols[0],
      y: numCols[0],
      title: `Trend of ${numCols[0]} over ${dateCols[0]}`,
    });
  }

  // 2) Bar: top counts of first string column
  if (strCols[0]) {
    configs.push({
      type: "bar",
      cat: strCols[0],
      title: `Counts by ${strCols[0]}`,
    });
  }

  // 3) Scatter: first two numeric columns
  if (numCols.length >= 2) {
    configs.push({
      type: "scatter",
      x: numCols[0],
      y: numCols[1],
      title: `${numCols[0]} vs ${numCols[1]}`,
    });
  }

  return configs.slice(0, 3);
}

// Helpers to build data for charts
export function buildLineData(table: Table, x: string, y: string) {
  // keep order; Recharts will plot as-is
  return table.rows
    .map((r) => ({ x: r?.[x], y: Number(r?.[y]) }))
    .filter((d) => Number.isFinite(d.y));
}

export function buildBarData(table: Table, cat: string) {
  const counts: Record<string, number> = {};
  for (const r of table.rows) {
    const k = String(r?.[cat] ?? "Unknown");
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

export function buildScatterData(table: Table, x: string, y: string) {
  return table.rows
    .map((r) => ({ x: Number(r?.[x]), y: Number(r?.[y]) }))
    .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));
}
