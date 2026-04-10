import type { Metadata } from "next";
import { Open_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import PageTransition from "@/components/PageTransition";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-open-sans",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Capital Finanças — Consolidador de Documentos",
  description:
    "Plataforma para upload de PDFs de due diligence, extração automática de campos e geração de relatório consolidado.",
  icons: {
    icon: "/icon.svg",
  },
  other: {
    "theme-color": "#203b88",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="theme-color" content="#203b88" />
        {/* Disable browser scroll restoration so pages always start at top */}
        <script
          dangerouslySetInnerHTML={{
            __html: `history.scrollRestoration = 'manual'; window.scrollTo(0, 0);`,
          }}
        />
      </head>
      <body className={`${openSans.variable} ${dmSans.variable} ${jetbrainsMono.variable} ${dmSans.className} antialiased`}>
        <PageTransition>{children}</PageTransition>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
