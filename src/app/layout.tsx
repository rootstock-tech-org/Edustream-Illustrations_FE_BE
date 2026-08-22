import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { FloatingLearnButton } from "../components/FloatingLearnButton";

// The AVSAR type system: Inter for body AND display (the platform deliberately
// runs one typeface rather than a body/display pairing), JetBrains Mono for the
// uppercase telemetry eyebrows. Matches avsar_frontend/tailwind.config.ts.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VLSI News · AVSAR",
  description: "Semiconductor and VLSI news for AVSAR learners.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <FloatingLearnButton />
      </body>
    </html>
  );
}
