export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  // DO NOT log the full key; just whether it's present and its length
  const ok = !!process.env.OPENAI_API_KEY;
  const len = process.env.OPENAI_API_KEY?.length || 0;
  return NextResponse.json({ hasKey: ok, length: len });
}