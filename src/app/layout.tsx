import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chatbot WhatsApp Maternaly",
  description:
    "Chatbot WhatsApp con LLM estructurado, Google Sheets en dry-run y panel de conversaciones para Maternaly.",
  openGraph: {
    title: "Chatbot WhatsApp Maternaly",
    description:
      "Chatbot WhatsApp con LLM estructurado, Google Sheets en dry-run y panel de conversaciones para Maternaly.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${fraunces.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
