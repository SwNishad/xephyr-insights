// src/lib/types.ts
export type Table = { columns: string[]; rows: Record<string, any>[] };

export type NumericSummary = {
  n: number; mean: number; median: number; min: number; max: number;
  stdev: number; q1: number; q3: number; iqr: number; outliersIqr: number; outliersZ: number;
};

export type ColumnProfile = {
  name: string;
  type: "number" | "string" | "date" | "unknown";
  missingPct: number;
  distinct: number;
  numeric?: NumericSummary | null;
};

export type ChartConfig =
  | { type: "line"; x: string; y: string; title: string }
  | { type: "area"; x: string; y: string; title: string }              // NEW
  | { type: "barTopK"; cat: string; k: number; title: string }
  | { type: "donut"; cat: string; k: number; title: string }           // NEW
  | { type: "scatter"; x: string; y: string; title: string }
  | { type: "hist"; col: string; bins: number; title: string }
  | { type: "box"; col: string; title: string }
  | { type: "corrHeatmap"; cols: string[]; title: string };
