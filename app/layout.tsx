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
        {/* Defesa contra ChunkLoadError do Next.js: quando o usuário fica com
            o app aberto após um deploy, os hashes dos chunks mudam e o
            lazy-load falha (chunk 2219 / 1234 etc). Auto-reload disfarça o
            erro — usuário só vê a página "piscar" e tudo volta a funcionar.
            Flag em sessionStorage evita loop infinito de reload se o erro
            for permanente (servidor caído etc). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              function isChunkError(e){
                var m=(e && (e.message||(e.reason&&e.reason.message)))||"";
                var n=(e && (e.name||(e.reason&&e.reason.name)))||"";
                return /Loading chunk \\d+ failed|ChunkLoadError|Loading CSS chunk/i.test(m) || n==="ChunkLoadError";
              }
              function reloadOnce(){
                try {
                  if (sessionStorage.getItem("cf_chunk_reload")==="1") return;
                  sessionStorage.setItem("cf_chunk_reload","1");
                  setTimeout(function(){ try { sessionStorage.removeItem("cf_chunk_reload"); } catch(_){} }, 8000);
                  window.location.reload();
                } catch(_) { window.location.reload(); }
              }
              window.addEventListener("error", function(e){ if(isChunkError(e)) reloadOnce(); }, true);
              window.addEventListener("unhandledrejection", function(e){ if(isChunkError(e)) reloadOnce(); });
            })();`,
          }}
        />
      </head>
      <body className={`${openSans.variable} ${dmSans.variable} ${jetbrainsMono.variable} ${dmSans.className} antialiased animate-fade-in`}>
        <LayoutShell>
          {children}
        </LayoutShell>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
