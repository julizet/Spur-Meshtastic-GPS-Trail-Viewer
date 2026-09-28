import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Spur",
  description: "Wanderungen aus Meshtastic-Exporten auf der Karte zeigen, auswerten und teilen.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d2a24",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
