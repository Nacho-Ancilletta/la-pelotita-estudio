import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Space_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "La Pelotita Estudio",
  description: "Herramienta de análisis táctico de fútbol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${geist.variable} ${spaceMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-bg-deep text-cream">
        {/* ── Header ── */}
        <header className="border-b border-bg-card px-5 py-2 flex items-center justify-between">
          <span className="font-mono text-xs text-orange tracking-widest">
            ⚽  GOL A GOL · ANÁLISIS TÁCTICO
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.25em] text-cream">
            LA PELOTITA ESTUDIO
          </span>
          <span className="font-mono text-xs text-orange flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-orange opacity-40" />
            PRE-MATCH
          </span>
        </header>

        {/* ── Contenido principal ── */}
        <main className="flex-1 flex flex-col">{children}</main>

        {/* ── Footer ── */}
        <footer className="border-t border-bg-card px-5 py-2 flex items-center justify-between font-mono text-xs">
          <span className="text-orange/40">| ⚽ |  PELOTITA ESTUDIO · v0.1</span>
          <span className="text-cream/20">ANÁLISIS TÁCTICO · BUENOS AIRES</span>
          <span className="text-orange/40">2026  |⚽|</span>
        </footer>
      </body>
    </html>
  );
}
