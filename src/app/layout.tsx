// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Poppins } from "next/font/google";
import "./globals.css";

/* Load fonts as CSS variables so globals.css can use them */
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const poppins   = Poppins({
  subsets: ["latin"],
  weight: ["400","500","600","700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Smart Data Insights Dashboard",
  description: "Upload CSV/JSON, preview, and analyze quickly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} antialiased`}>
        <div className="min-h-dvh bg-grid-surface text-[15px]">
          {/* Top gradient header */}
          <header className="bg-gradient-to-r from-primary-600 via-fuchsia-600 to-cyan-500 text-white shadow-sm">
            <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-inner">
                  <span className="text-lg">📊</span>
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Smart Data Insights</h1>
                  <p className="text-xs/5 opacity-90">Because data deserves more than rows and columns; it deserves insights, clarity, and a little personality</p>
                </div>
              </div>

            </div>
          </header>

          <main className="mx-auto max-w-6xl p-6 text-foreground">{children}</main>
        </div>
      </body>
    </html>
  );
}
