import type { Metadata, Viewport } from 'next';
import { Open_Sans, Orbitron } from 'next/font/google';
import './globals.css';

// Open Sans (body, per the reference) + Orbitron (wide geometric display for
// instrument labels). Self-hosted by next/font — no layout shift, no runtime
// fetch. System fallbacks keep the build resilient offline.
const sans = Open_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Orbitron({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: 'Probe Station — Semiconductor Explorer',
  description: 'A premium interactive semiconductor laboratory: explainable CMOS/VLSI device simulation.',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
