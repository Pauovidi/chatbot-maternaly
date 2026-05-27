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
  title: "Chat web para el hotel canino | Somos Muy Perros",
  description:
    "Resuelve preguntas frecuentes, deriva al formulario web y deja preparada la revisión operativa de la reserva.",
  openGraph: {
    title: "Chat web para el hotel canino | Somos Muy Perros",
    description:
      "Resuelve preguntas frecuentes, deriva al formulario web y deja preparada la revisión operativa de la reserva.",
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
