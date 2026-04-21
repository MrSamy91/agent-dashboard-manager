import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { ToasterProvider } from "@/components/toaster-provider";
import "./globals.css";

/* Trois polices distinctives qui créent la tension visuelle du dashboard :
   - Instrument Serif : headings éditoriaux, élégance inattendue dans un contexte tech
   - DM Sans : body text propre et géométrique
   - JetBrains Mono : terminal, données, code */
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Agent Dashboard — Claude Agent SDK",
  description: "Dashboard pour orchestrer et monitorer vos agents Claude en temps réel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-body antialiased`}
      >
        <ToasterProvider />
        {children}
      </body>
    </html>
  );
}
