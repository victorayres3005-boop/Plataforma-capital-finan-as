import type { Metadata } from "next";
import { Open_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import LayoutShell from "@/components/layout/LayoutShell";
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
        {/* Tema dark/light: aplicado antes do React hidratar para evitar flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cf_theme');var sys=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t==='dark'||(t!=='light'&&sys);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${openSans.variable} ${dmSans.variable} ${jetbrainsMono.variable} ${dmSans.className} antialiased`}>
        <LayoutShell>
          {children}
        </LayoutShell>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
