// src/app/api/fetch-json/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

type Records = Record<string, any>[];
type Jsonish = any;

function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function coerceToRows(data: Jsonish): Records {
  if (Array.isArray(data)) {
    // If array items are not objects, wrap them
    return (data as any[]).map((x) => (typeof x === "object" && x !== null ? x : { value: x }));
  }
  if (data && typeof data === "object") {
    // Try common wrappers (data/items/results) when no recordsPath is provided
    const candidates = ["data", "items", "results", "records"];
    for (const c of candidates) {
      const v = (data as any)[c];
      if (Array.isArray(v)) {
        return v.map((x) => (typeof x === "object" && x !== null ? x : { value: x }));
      }
    }
    // Fallback: single object → one-row table
    return [data as Record<string, any>];
  }
  // Primitive → one-row table
  return [{ value: data }];
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url || "").trim();
    const recordsPath: string | undefined = body?.recordsPath
      ? String(body.recordsPath).trim()
      : undefined;

    if (!url) {
      return NextResponse.json({ error: "Missing 'url' in body." }, { status: 400 });
    }

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) {
      return NextResponse.json({ error: `Upstream HTTP ${resp.status}` }, { status: 400 });
    }

    const raw = (await resp.json()) as Jsonish;
    const picked = recordsPath ? getByPath(raw, recordsPath) : raw;
    const rows: Records = coerceToRows(picked);

    // Build column list from union of object keys
    const colSet = new Set<string>();
    for (const r of rows) {
      if (r && typeof r === "object" && !Array.isArray(r)) {
        Object.keys(r).forEach((k) => colSet.add(k));
      }
    }
    const columns = Array.from(colSet);

    return NextResponse.json({ columns, rows });
  } catch (e) {
    return NextResponse.json({ error: "Fetch/parse failed." }, { status: 400 });
  }
}
