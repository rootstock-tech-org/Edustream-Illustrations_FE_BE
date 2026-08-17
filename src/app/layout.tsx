import type { Metadata, Viewport } from 'next';
import { Open_Sans, Lora, Share_Tech_Mono } from 'next/font/google';
import './globals.css';

// Open Sans (body, per the reference) + Lora (an elegant serif for the display
// face — headings + instrument labels, replacing the previous geometric face).
// Self-hosted by next/font — no layout shift, no runtime fetch. System
// fallbacks keep the build resilient offline.
const sans = Open_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Lora({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-display', display: 'swap' });
const digital = Share_Tech_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-digital', display: 'swap' });

export const metadata: Metadata = {
  title: 'Probe Station — Semiconductor Explorer',
  description: 'A premium interactive semiconductor laboratory: explainable CMOS/VLSI device simulation.',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

// Set the theme class before paint to avoid a flash (default light).
const themeScript = `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${digital.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
