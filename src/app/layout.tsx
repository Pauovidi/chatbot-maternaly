import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({
  display: "swap",
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    <html lang="es" className={quicksand.variable}>
      <body>{children}</body>
    </html>
  );
}
