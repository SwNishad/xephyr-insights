// src/app/api/generate-data/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { columns, rows = 50, topic = "sales ledger" } = await req.json();

    // default columns if none provided
    const defaultCols = [
      { name: "date", type: "string", format: "date" },
      { name: "region", type: "string", enum: ["North","South","East","West"] },
      { name: "sales", type: "number" },
      { name: "ad_spend", type: "number" }
    ];
    const cols = Array.isArray(columns) && columns.length ? columns : defaultCols;

    // build JSON Schema for rows
    const properties: Record<string, any> = {};
    for (const c of cols) {
      if (c.type === "number") properties[c.name] = { type: "number" };
      else if (c.format === "date") properties[c.name] = { type: "string", format: "date" };
      else if (Array.isArray(c.enum)) properties[c.name] = { type: "string", enum: c.enum };
      else properties[c.name] = { type: "string" };
    }

    const schema = {
      type: "object",
      properties: {
        rows: {
          type: "array",
          minItems: Math.min(rows, 500),
          maxItems: Math.min(rows, 500),
          items: {
            type: "object",
            properties,
            required: cols.map((c: any) => c.name),
            additionalProperties: false
          }
        }
      },
      required: ["rows"],
      additionalProperties: false
    };

    const sys = `You generate realistic tabular datasets for analytics demos.
Respect business realism (ranges, relationships like sales~ad_spend correlation, slight noise/outliers).
Never produce PII. Use ${rows} rows. Topic: ${topic}.`;

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: sys },
        { role: "user", content: "Return only JSON that matches the provided schema." }
      ],
      response_format: { // OpenAI Structured Outputs
        type: "json_schema",
        json_schema: { name: "synthetic_table", schema }
      },
      temperature: 0.2
    });

    const json = resp.output_text ? JSON.parse(resp.output_text) : null;
    if (!json || !Array.isArray(json.rows)) {
      return NextResponse.json({ error: "Bad LLM output" }, { status: 500 });
    }
    return NextResponse.json(json);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
