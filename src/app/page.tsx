// src/app/page.tsx
"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Table as TTable } from "@/lib/types";
import { profileTable, topCorrelations, firstDateTrend } from "@/lib/stats";

type Table = TTable;

function isArrayOfObjects(data: unknown): data is Record<string, any>[] {
  return Array.isArray(data) && data.length > 0 && data.every(
    (x) => x !== null && typeof x === "object" && !Array.isArray(x)
  );
}

export default function Home() {
  const [table, setTable] = useState<Table | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [profile, setProfile] = useState<ReturnType<typeof profileTable> | null>(null);
  const [correls, setCorrels] = useState<{ a: string; b: string; r: number }[] | null>(null);
  const [trend, setTrend] = useState<ReturnType<typeof firstDateTrend> | null>(null);

  function afterLoad(newTable: Table) {
    setTable(newTable);
    const p = profileTable(newTable);
    setProfile(p);
    setCorrels(topCorrelations(newTable, 3));
    setTrend(firstDateTrend(newTable));
  }

  // CSV: file upload
  function loadCSVFile(file: File) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true, dynamicTyping: true,
      complete: (res) => {
        const rows = (res.data as any[]).filter(Boolean);
        if (!rows.length) return alert("No rows found in CSV");
        const columns = Object.keys(rows[0]);
        afterLoad({ columns, rows });
      },
      error: () => alert("Failed to parse CSV"),
    });
  }

  // CSV: sample
  async function loadSampleCSV() {
    try {
      const text = await fetch("/sample-data/sales.csv", { cache: "no-store" }).then((r) => r.text());
      const res = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
      const rows = (res.data as any[]).filter(Boolean);
      if (!rows.length) return alert("No rows in sample CSV");
      const columns = Object.keys(rows[0]);
      afterLoad({ columns, rows });
    } catch (e) {
      console.error(e); alert("Could not load sample CSV.");
    }
  }

  // JSON: textarea
  function loadJSONText(text: string) {
    try {
      const parsed = JSON.parse(text);
      if (!isArrayOfObjects(parsed)) return alert("Invalid JSON: expected a non-empty array of objects");
      const rows = parsed; const columns = Object.keys(rows[0]);
      afterLoad({ columns, rows });
    } catch { alert("Invalid JSON string"); }
  }

  // JSON: sample
  async function loadSampleJSON() {
    try {
      const res = await fetch("/sample-data/users.json", { cache: "no-store" });
      if (!res.ok) return alert(`Sample JSON not found (HTTP ${res.status}). Check public/sample-data/users.json`);
      const data = await res.json();
      if (!isArrayOfObjects(data)) return alert("Sample JSON is not a non-empty array of objects");
      const rows = data; const columns = Object.keys(rows[0]);
      afterLoad({ columns, rows });
    } catch (e) {
      console.error(e); alert("Could not load sample JSON (network/parse error).");
    }
  }

  function clearAll() {
    setTable(null); setJsonText(""); setProfile(null); setCorrels(null); setTrend(null);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Smart Data Insights Dashboard</h1>
        <p className="small-muted">Upload CSV or paste JSON, preview the data, and prepare for analysis.</p>
      </header>

      {/* LOAD DATA */}
      <section className="card p-5">
        <h2 className="mb-3 text-lg font-semibold">1) Load Data</h2>

        {/* CSV */}
        <div className="mb-5 grid gap-2">
          <label className="text-sm font-medium">Upload a CSV file</label>
          <input type="file" accept=".csv" onChange={(e) => e.target.files && loadCSVFile(e.target.files[0])} className="input"/>
          <div><button className="btn" onClick={loadSampleCSV}>Use sample CSV</button></div>
        </div>

        {/* JSON */}
        <div className="grid gap-2">
          <label className="text-sm font-medium">Or paste a JSON array of objects</label>
          <textarea className="input h-32 w-full font-mono text-sm" placeholder='Example: [{"id":1,"age":22},{"id":2,"age":27}]'
            value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => loadJSONText(jsonText)}>Load JSON</button>
            <button className="btn" onClick={loadSampleJSON}>Use sample JSON</button>
            <button className="btn" onClick={clearAll}>Clear</button>
          </div>
        </div>
      </section>

      {/* PREVIEW */}
      {table && (
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">2) Preview</h2>
          <p className="mb-3 small-muted">
            Loaded <b className="text-gray-900">{table.rows.length}</b> rows •{" "}
            <b className="text-gray-900">{table.columns.length}</b> columns
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  {table.columns.map((c) => (
                    <th key={c} className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50/70">
                    {table.columns.map((c) => (
                      <td key={c} className="border border-gray-200 px-3 py-2 text-gray-900">
                        {String(row[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs small-muted">Showing first 10 rows.</p>
        </section>
      )}

      {/* PROFILE */}
      {profile && (
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">3) Profile</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium">Column</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium">Type</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium">Missing %</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium">Distinct</th>
                  <th className="border border-gray-200 px-3 py-2 text-left font-medium">Numeric Summary</th>
                </tr>
              </thead>
              <tbody>
                {profile.map((p) => (
                  <tr key={p.name} className="odd:bg-white even:bg-gray-50/70">
                    <td className="border border-gray-200 px-3 py-2">{p.name}</td>
                    <td className="border border-gray-200 px-3 py-2">{p.type}</td>
                    <td className="border border-gray-200 px-3 py-2">{p.missingPct}%</td>
                    <td className="border border-gray-200 px-3 py-2">{p.distinct}</td>
                    <td className="border border-gray-200 px-3 py-2">
                      {p.numeric
                        ? `n=${p.numeric.n}, mean=${p.numeric.mean.toFixed(2)}, med=${p.numeric.median.toFixed(2)}, min=${p.numeric.min}, max=${p.numeric.max}, sd=${p.numeric.stdev.toFixed(2)}, outliers=${p.numeric.outliers}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* QUICK INSIGHTS FROM STATS */}
      {table && (
        <section className="card p-5">
          <h2 className="mb-2 text-lg font-semibold">4) Quick Stats</h2>
          <ul className="list-disc pl-5 text-sm">
            {correls && correls.length > 0 && (
              <li>
                <b>Top correlations:</b>{" "}
                {correls.map((c, i) => `${c.a}↔${c.b} (r=${c.r.toFixed(2)})`).join(", ")}
              </li>
            )}
            {trend && (
              <li>
                <b>Trend:</b> {trend.numCol} appears to trend <b>{trend.dir}</b> over {trend.dateCol}
              </li>
            )}
            {(!correls || correls.length === 0) && <li>No strong correlations found.</li>}
            {!trend && <li>No date/number trend found.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
