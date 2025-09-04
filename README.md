# 📊 Smart Data Insights Dashboard

A full-stack web application that transforms raw data into **actionable insights**.  
It ingests CSV/JSON/API data, performs **automated analysis & pattern detection**, and generates **interactive visualizations** with **AI-powered recommendations**.

---

## 🚀 Live Demo
[Live URL](https://your-vercel-app.vercel.app)

---

## 📦 Repository
[GitHub Repo](https://github.com/SwNishad/xephyr-insights)

---

## ✨ Features

- **Flexible Data Ingestion**
  - Upload CSV (drag & drop or browse)
  - Paste JSON array of objects
  - Fetch from public JSON API

- **Automated Analysis & Pattern Detection**
  - Column profiling (types, missing %, distinct counts)
  - Numeric stats (mean, median, stdev, IQR, outliers)
  - Correlations (Pearson) + heatmap
  - Trend detection
  - Duplicate detection
  - Category imbalance
  - Weekday/monthly seasonality

- **Interactive Visualizations**
  - Line, Bar (Top-K), Scatter, Histogram, Box, Correlation heatmap, Pie
  - Tooltips, legends, axis formatting, zoom/brush
  - Export charts as PNG

- **AI-powered Insights (Groq)**
  - Recommendations & risks
  - Suggested follow-up charts
  - Deterministic fallback if AI is unavailable

- **Modern UX**
  - Dark, sleek responsive UI (TailwindCSS)
  - Tabbed flow: Load → Preview → Profile → Insights → Charts
  - File-pill for uploaded CSVs

---

## 🛠️ Tech Stack

- **Next.js 15** (App Router) + TypeScript  
- **TailwindCSS** (custom dark theme)  
- **PapaParse** (CSV parsing)  
- **Recharts** (interactive charts)  
- **Groq LLM (Llama 3.1-70B)** for insights  
- **Vercel** (deployment)

---

## 📂 Project Structure

```
xephyr-insights/
├── .env.local                 # Local secrets (ignored in Git)
├── .env.example               # Template env (committed)
├── package.json
├── public/
│   └── sample-data/
│       ├── sales.csv
│       └── users.json
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── ai-insights/route.ts   # Groq + fallback logic
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                   # Main dashboard
│   └── lib/
│       ├── stats.ts                   # Profiling & analysis
│       ├── charts.ts                  # Chart builders
│       ├── insights.ts                # Insights + AI payloads
│       └── types.ts
```

---

## ⚡ Quick Start (Local)

```bash
git clone https://github.com/SwNishad/xephyr-insights.git
cd xephyr-insights
npm install
```

Copy the env template and fill it:

```bash
cp .env.example .env.local
# then edit .env.local with your Groq API key
```

Run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🔐 Environment Variables

Create `.env.local`:

```dotenv
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.1-70b-versatile
```

- `.env.local` is ignored in Git  
- `.env.example` is included for others to copy  
- On Vercel, add the same variables under **Project → Settings → Environment Variables**  

If missing, the app falls back to deterministic recommendations.

---

## 🧭 Usage

1. **Load Data**  
   Upload CSV, paste JSON, or fetch from API. App switches to Preview.

2. **Preview**  
   See first 10 rows and dataset shape.

3. **Profile**  
   Column types, missing %, distinct counts, numeric summaries.

4. **Insights**  
   Rule-based insights + AI recommendations (Groq).  
   Chip shows **AI (Groq)** or **Deterministic fallback**.

5. **Charts**  
   Suggested charts (Line, Bar, Scatter, Histogram, Box, Heatmap, Pie).  
   Axis formatting, tooltips, legends, export to PNG.

---

## 🤖 AI Integration

- API route: `src/app/api/ai-insights/route.ts`  
- If `AI_PROVIDER=groq` and `GROQ_API_KEY` exist → uses Groq  
- Else → deterministic fallback  

### On Vercel
Add these in **Settings → Environment Variables**:
- `AI_PROVIDER=groq`
- `GROQ_API_KEY=your_key`
- `GROQ_MODEL=llama-3.1-70b-versatile`

---

## 🚀 Deployment (Vercel)

1. Push repo to GitHub  
2. Import project into Vercel  
3. Add environment variables in Settings  
4. Deploy → app is live  

---

## 🧪 Troubleshooting

- **Line ending warnings (LF ↔ CRLF)** → safe to ignore. To silence:  
  ```bash
  git config core.autocrlf true
  ```

- **AI always fallback** → check env vars exist locally & on Vercel.

- **CSV not loading** → ensure file has headers and valid rows.

- **JSON errors** → must be array of objects:  
  ```json
  [{ "id": 1, "value": 10 }, { "id": 2, "value": 20 }]
  ```

---

## 🧭 Technical Decisions

See [docs/TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md) for details:
- Problem interpretation & approach  
- Stack reasoning  
- AI tools used  
- Architectural choices  
- Trade-offs  
- Improvements with more time  

---

## 🛡 Security

- `.env.local` not committed  
- Secrets injected via Vercel  
- App still works without keys (fallback)  

---

## 📜 License

MIT

---

## 👤 Maintainer

**Sw Nishad**  
GitHub: [@SwNishad](https://github.com/SwNishad)
