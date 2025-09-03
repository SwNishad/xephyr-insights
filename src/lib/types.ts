// src/lib/types.ts
export type ColType = "number" | "string" | "date" | "unknown";

export type Table = {
  columns: string[];
  rows: Record<string, any>[];
};

export type ColumnProfile = {
  name: string;
  type: ColType;
  missingPct: number;     // 0..100
  distinct: number;
  // numeric-only stats (undefined if not number)
  numeric?: {
    n: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    stdev: number;
    outliers: number; // z-score > 3
  };
};
