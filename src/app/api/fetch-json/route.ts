// src/app/api/fetch-json/route.ts
export const runtime = "edge";
import { NextResponse } from "next/server";

type Req = { url: string; recordsPath?: string };

function pickRecords(root: any, path?: string) {
  if (!path) return root;
  const parts = path.split(".").filter(Boolean);
  let cur = root;
  for (const p of parts) cur = cur?.[p];
  return cur;
}

function toArrayOfObjects(data: unknown): Record<string, any>[] {
  if (Array.isArray(data) && data.every(x => x && typeof x === "object" && !Array.isArray(x))) {
    return data as Record<string, any>[];
  }
  return [];
}

export async function POST(req: Request) {
  try {
    const { url, recordsPath } = (await req.json()) as Req;
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return NextResponse.json({ error: `HTTP ${resp.status}` }, { status: 400 });

    const json = await resp.json();
    const maybeRecords = pickRecords(json, recordsPath);
    const rows = toArrayOfObjects(maybeRecords);
    if (!rows.length) return NextResponse.json({ error: "Expected an array of objects" }, { status: 400 });

    const columns = Array.from(
      rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set<string>())
    );
    return NextResponse.json({ columns, rows });
  } catch (e) {
    return NextResponse.json({ error: "Fetch error" }, { status: 400 });
  }
}
