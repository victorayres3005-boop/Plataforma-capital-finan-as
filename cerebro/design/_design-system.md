> Hub: [[CAPITAL]]

# _design-system

Design system, layout shell e primitives da plataforma Capital Finanças.

**Como usar com Claude/ChatGPT:** envie este arquivo PRIMEIRO, depois o arquivo da aba específica que você quer redesenhar. Assim a IA tem o contexto de tokens, sidebar, topbar e componentes UI base antes de propor mudanças visuais.

**O que está aqui:**
- `tailwind.config.ts` — paleta de cores, tipografia, breakpoints, animações
- `app/globals.css` — variáveis CSS, reset, classes utilitárias globais
- `app/layout.tsx` — root layout (fontes, providers)
- `components/layout/*` — Sidebar (navegação principal), Topbar, LayoutShell
- `components/ui/*` — primitives shadcn (button, card, dialog, input, table, tabs, etc.)
- Auxiliares de UX (CommandPalette, OnboardingTooltip, ThemeToggle, PageTransition)

Gerado em 2026-05-05T12:26:17.739Z

---

## Sumário
- `tailwind.config.ts`
- `app/layout.tsx`
- `app/globals.css`
- `components/layout/LayoutShell.tsx`
- `components/layout/Sidebar.tsx`
- `components/layout/Topbar.tsx`
- `components/Logo.tsx`
- `components/ThemeToggle.tsx`
- `components/PageTransition.tsx`
- `components/CommandPalette.tsx`
- `components/DevBanner.tsx`
- `components/OnboardingTooltip.tsx`
- `components\ui\badge.tsx`
- `components\ui\breadcrumb.tsx`
- `components\ui\button.tsx`
- `components\ui\card.tsx`
- `components\ui\confirm-dialog.tsx`
- `components\ui\dialog.tsx`
- `components\ui\dropdown-menu.tsx`
- `components\ui\input.tsx`
- `components\ui\label.tsx`
- `components\ui\progress.tsx`
- `components\ui\select.tsx`
- `components\ui\separator.tsx`
- `components\ui\skeleton.tsx`
- `components\ui\table.tsx`
- `components\ui\tabs.tsx`
- `components\ui\textarea.tsx`
- `components\ui\tooltip.tsx`

---

## tailwind.config.ts

```tsx
import type { Config } from "tailwindcss";

const config: Config = {
  // darkMode "class" — toggle via document.documentElement.classList.toggle('dark').
  // Aplicado pragmaticamente: páginas Tailwind com dark: prefix; Sidebar/Topbar com
  // inline styles ainda não convertidos (sessão dedicada).
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cf: {
          navy:        "#203b88",
          "navy-dark": "#162d6e",
          "navy-deep": "#0f1f5c",
          green:       "#73b815",
          "green-dark":"#5a9010",
          "green-light":"#a8d96b",
          "green-pale": "#f0f9e0",
          white:       "#ffffff",
          "bg":        "#f5f7fb",
          "surface":   "#edf2fb",
          "surface-2": "#dce8f8",
          border:      "#d1dcf0",
          "border-2":  "#b8cce8",
          dark:        "#111827",
          "dark-2":    "#1f2937",
          "text-1":    "#111827",
          "text-2":    "#374151",
          "text-3":    "#6b7280",
          "text-4":    "#9ca3af",
          danger:      "#dc2626",
          "danger-bg": "#fef2f2",
          warning:     "#d97706",
          "warning-bg":"#fffbeb",
          success:     "#16a34a",
          "success-bg":"#f0fdf4",
        },
        navy: {
          50:  "#eef3fb",
          100: "#dce6f5",
          200: "#b5c8ea",
          800: "#132952",
          900: "#0c1b3a",
        },
        amber: {
          50:  "#fef9ec",
          100: "#fdf3d7",
          500: "#d4940a",
        },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "'DM Sans'", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        sm:    "0 1px 3px rgba(32,59,136,0.07), 0 1px 2px rgba(32,59,136,0.05)",
        md:    "0 4px 12px rgba(32,59,136,0.10), 0 2px 4px rgba(32,59,136,0.06)",
        lg:    "0 8px 24px rgba(32,59,136,0.12), 0 4px 8px rgba(32,59,136,0.08)",
        navy:  "0 4px 16px rgba(32,59,136,0.40)",
        green: "0 4px 16px rgba(115,184,21,0.40)",
        input: "0 0 0 3px rgba(32,59,136,0.12)",
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(135deg, #0f1f5c 0%, #203b88 60%, #1a4fa8 100%)",
        "navy-gradient": "linear-gradient(180deg, #203b88 0%, #162d6e 100%)",
        "surface-gradient": "linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%)",
      },
      animation: {
        // Padrão único de transição da plataforma: fade puro em 200ms
        // (carga inicial F5, navegação SPA entre rotas, modais e drawers).
        // Mantemos slide-up/scale-in para casos pontuais (KPIs, banners),
        // mas containers de página usam fade-in.
        "fade-in":  "fadeIn 0.2s ease-out both",
        "slide-up": "slideUp 0.35s ease-out both",
        "scale-in": "scaleIn 0.3s ease-out both",
        "stagger-1": "fadeSlideUp 0.4s ease-out 0.05s both",
        "stagger-2": "fadeSlideUp 0.4s ease-out 0.10s both",
        "stagger-3": "fadeSlideUp 0.4s ease-out 0.15s both",
        "stagger-4": "fadeSlideUp 0.4s ease-out 0.20s both",
        "stagger-5": "fadeSlideUp 0.4s ease-out 0.25s both",
        "stagger-6": "fadeSlideUp 0.4s ease-out 0.30s both",
        "stagger-7": "fadeSlideUp 0.4s ease-out 0.35s both",
        "stagger-8": "fadeSlideUp 0.4s ease-out 0.40s both",
        "number-in": "numberIn 0.5s ease-out both",
        pulse: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        scaleIn: { "0%": { opacity: "0", transform: "scale(0.85)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        fadeSlideUp: { "0%": { opacity: "0", transform: "translateY(16px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        numberIn: { "0%": { opacity: "0", transform: "translateY(8px) scale(0.9)" }, "100%": { opacity: "1", transform: "translateY(0) scale(1)" } },
      },
    },
  },
  plugins: [],
};
export default config;

```

## app/layout.tsx

```tsx
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
      <body className={`${openSans.variable} ${dmSans.variable} ${jetbrainsMono.variable} ${dmSans.className} antialiased animate-fade-in`}>
        <LayoutShell>
          {children}
        </LayoutShell>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}

```

## app/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Acessibilidade: respeitar preferência do usuário por menos animação.
   Desliga as transições padronizadas (fade/slide/scale) sem mexer em
   indicadores que precisam animar (loaders, spinners). */
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in,
  .animate-slide-up,
  .animate-scale-in,
  .animate-fade-in-fast,
  .fade-stagger > * {
    animation: none !important;
  }
}

/* ── Dark mode base — sobrescreve --bg e cores semânticas mais usadas.
   Sidebar/Topbar com inline styles ainda não respeitam (sessão dedicada). */
html.dark {
  color-scheme: dark;
  --bg:          #0f172a;
  --surface:     #1e293b;
  --surface-2:   #334155;
  --border:      #334155;
  --border-2:    #475569;
  --text-1:      #f1f5f9;
  --text-2:      #cbd5e1;
  --text-3:      #94a3b8;
  --text-4:      #64748b;
}
html.dark body { background: #0f172a; color: #f1f5f9; }

/* ── Design tokens ── */
:root {
  --navy:        #203b88;
  --navy-dark:   #162d6e;
  --navy-deep:   #0f1f5c;
  --green:       #73b815;
  --green-dark:  #5a9010;
  --green-light: #a8d96b;
  --bg:          #f5f7fb;
  --surface:     #edf2fb;
  --surface-2:   #dce8f8;
  --border:      #d1dcf0;
  --border-2:    #b8cce8;
  --dark:        #111827;
  --text-1:      #111827;
  --text-2:      #374151;
  --text-3:      #6b7280;
  --text-4:      #9ca3af;
  --danger:      #dc2626;
  --warning:     #d97706;
  --shadow-sm:   0 1px 3px rgba(32,59,136,0.07), 0 1px 2px rgba(32,59,136,0.05);
  --shadow-md:   0 4px 12px rgba(32,59,136,0.10), 0 2px 4px rgba(32,59,136,0.06);
  --shadow-navy: 0 4px 16px rgba(32,59,136,0.40);
  --shadow-green:0 4px 16px rgba(115,184,21,0.40);
  --shadow-input:0 0 0 3px rgba(32,59,136,0.12);

  /* ── Design-system semantic tokens ── */
  --ds-danger-text:    #c0392b;
  --ds-danger-bg:      #FCEBEB;
  --ds-danger-border:  #f0c4c4;
  --ds-warning-text:   #b96b00;
  --ds-warning-bg:     #fef8e7;
  --ds-warning-border: #e8d490;
  --ds-success-text:   #1a7a4a;
  --ds-success-bg:     #EAF3DE;
  --ds-success-border: #b5d6a0;
  --ds-surface-2:      #f7f8fa;
  --ds-border-t:       rgba(17,24,39,0.08);
  --ds-border-s:       rgba(17,24,39,0.16);

  /* Radius escalonado — institucional (radius baixo = "documento", radius alto = "consumer/SaaS").
     Usar --ds-radius-tag (4px) para sinais técnicos (badge de tipo, ratings); --ds-radius-md (8px)
     para inputs/botões; --ds-radius-lg (10px) para cards. Pill (999px) só onde a forma é a função
     (avatar circle, dot indicators). */
  --ds-radius-tag:     4px;
  --ds-radius-sm:      6px;
  --ds-radius-md:      8px;
  --ds-radius-lg:      10px;
  --ds-radius-xl:      14px;

  /* Letter-spacing institucional para headings */
  --ds-tracking-tight: -0.012em;
  --ds-tracking-meta:  0.06em;
}

@layer base {
  *, *::before, *::after { box-sizing: border-box; }
  html { font-size: 16px; scroll-behavior: smooth; }

  body {
    background-color: var(--bg);
    color: var(--text-1);
    font-family: 'Open Sans', 'DM Sans', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.6;
  }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: var(--surface); }
  ::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--navy); }

  input, textarea, select { font-family: inherit; }
}

@layer components {
  /* Buttons — using direct CSS for colors to avoid @apply custom class issues */
  .btn-primary {
    @apply inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed;
    background-color: var(--navy);
    box-shadow: var(--shadow-navy);
  }
  .btn-primary:hover:not(:disabled) { background-color: var(--navy-dark); }
  .btn-primary:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }
  .btn-primary:disabled { box-shadow: none; }

  .btn-secondary {
    @apply inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold active:scale-95 transition-all duration-150 bg-white;
    color: var(--navy);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover {
    border-color: var(--navy);
    background-color: var(--surface);
  }
  .btn-secondary:focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; }

  .btn-green {
    @apply inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed;
    background-color: var(--green);
    box-shadow: var(--shadow-green);
  }
  .btn-green:hover:not(:disabled) { background-color: var(--green-dark); }
  .btn-green:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
  .btn-green:disabled { box-shadow: none; }

  /* Card — radius reduzido (1rem → 10px) pra ar mais institucional/documento.
     Sombra mantida; hover só intensifica sutilmente. */
  .card {
    background-color: #ffffff;
    border-radius: var(--ds-radius-lg);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    transition: box-shadow 0.2s ease;
  }
  .card:hover { box-shadow: var(--shadow-md); }

  /* ── Sinais técnicos (badges) ──────────────────────────────────────────────
     `.tag` = sinal categórico (tipo de doc, rating letter, REVISAR). Radius baixo,
     borda 1px, peso forte. Use em vez de `rounded-full` para coisas que são DADOS.
     `.pill` = mantém forma circular para casos onde a forma carrega significado
     (avatar, status com dot+texto, identidade visual). */
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border-radius: var(--ds-radius-tag);
    border: 1px solid var(--border);
    background: #fff;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: 0.04em;
    color: var(--text-2);
    font-feature-settings: 'tnum';
  }
  .tag-danger  { color: var(--danger);   background: var(--ds-danger-bg);  border-color: var(--ds-danger-border); }
  .tag-warning { color: var(--warning);  background: var(--ds-warning-bg); border-color: var(--ds-warning-border); }
  .tag-success { color: var(--ds-success-text); background: var(--ds-success-bg); border-color: var(--ds-success-border); }
  .tag-neutral { color: var(--text-3);   background: transparent;          border-color: var(--border); }

  /* ── Status inline (sem fundo, só dot + texto) ─────────────────────────────
     Padrão "instituição financeira": status do ciclo NÃO precisa de fundo
     pastel — basta dot colorido + texto colorido. Reduz ruído visual. */
  .status-inline {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-2);
    letter-spacing: 0;
    white-space: nowrap;
  }
  .status-inline .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    flex-shrink: 0;
  }

  /* ── Label institucional (column header, KPI label) ─────────────────────── */
  .label-meta {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: var(--ds-tracking-meta);
  }

  /* ── Heading institucional ───────────────────────────────────────────────── */
  .heading-tight {
    letter-spacing: var(--ds-tracking-tight);
    font-weight: 700;
  }

  /* Input */
  .input-field {
    @apply w-full rounded-lg px-3.5 py-2.5 text-sm transition-all duration-150;
    background-color: #ffffff;
    border: 1px solid var(--border);
    color: var(--text-1);
  }
  .input-field::placeholder { color: var(--text-4); }
  .input-field:hover:not(:focus) { border-color: var(--border-2); }
  .input-field:focus {
    outline: none;
    border-color: var(--navy);
    box-shadow: var(--shadow-input);
  }
  .input-field:disabled {
    background-color: var(--surface);
    color: var(--text-3);
    cursor: not-allowed;
  }

  /* Label */
  .section-label {
    @apply text-xs font-semibold uppercase tracking-widest;
    color: var(--text-3);
  }
}

@layer utilities {
  .text-balance { text-wrap: balance; }
  .bg-hero-gradient { background: linear-gradient(135deg, #0f1f5c 0%, #203b88 60%, #1a4fa8 100%); }

  /* Tabular numerals — colunas alinham, valores não dançam.
     Marca registrada de produto financeiro sério. Aplicar em todo número
     que entra em coluna ou tabela. */
  .num,
  .tabular { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }

  /* Mini-bar inline (alternativa ao pill colorido para indicar tier numérico).
     Usar com `.bar` colorida internamente. */
  .bar-inline {
    display: inline-block;
    width: 38px;
    height: 4px;
    background: var(--surface);
    border-radius: 2px;
    margin-left: 7px;
    vertical-align: middle;
    overflow: hidden;
  }
  .bar-inline > i {
    display: block;
    height: 100%;
    background: var(--text-4);
    border-radius: 2px;
  }
}

/* ── Responsive KPI grid ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

/* ── Skeleton shimmer ── */
@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}
.skeleton {
  background: linear-gradient(90deg, #edf2fb 25%, #dce8f8 50%, #edf2fb 75%);
  background-size: 600px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}

/* ── Page fade-in ── */
@keyframes cf-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cf-page-enter {
  animation: cf-fade-in 0.22s ease-out both;
}

/* ── KPI card hover lift ── */
.kpi-card {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  cursor: default;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(32,59,136,0.13) !important;
}

/* ── Fade staggered por filho ──────────────────────────────────────────────
   Usado em conteúdo composto que aparece de uma vez (ex: GenerateStep ao
   carregar análise do cache). Cada filho fade em 220ms (padrão fade puro
   da plataforma — decisão estética 2026-05-04: sem slide-up), com delay
   incremental que cria sensação de cascata sem ferir o padrão. */
@keyframes cf-fade-in-pure {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.fade-stagger > * {
  animation: cf-fade-in-pure 0.22s ease-out both;
}
.fade-stagger > *:nth-child(1)   { animation-delay: 0ms; }
.fade-stagger > *:nth-child(2)   { animation-delay: 50ms; }
.fade-stagger > *:nth-child(3)   { animation-delay: 100ms; }
.fade-stagger > *:nth-child(4)   { animation-delay: 150ms; }
.fade-stagger > *:nth-child(5)   { animation-delay: 200ms; }
.fade-stagger > *:nth-child(6)   { animation-delay: 240ms; }
.fade-stagger > *:nth-child(7)   { animation-delay: 280ms; }
.fade-stagger > *:nth-child(n+8) { animation-delay: 320ms; }

```

## components/layout/LayoutShell.tsx

```tsx
"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import CommandPalette from "@/components/CommandPalette";
import ThemeToggle from "@/components/ThemeToggle";

const NO_SHELL_ROUTES = ["/login", "/auth", "/v2"];
const COLLAPSED_KEY   = "cf_sidebar_collapsed";


function RouteProgress({ pathname }: { pathname: string }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const prev = useRef(pathname);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;

    timers.current.forEach(clearTimeout);
    timers.current = [];

    setVisible(true);
    setWidth(25);
    timers.current.push(setTimeout(() => setWidth(60), 120));
    timers.current.push(setTimeout(() => setWidth(85), 350));
    timers.current.push(setTimeout(() => setWidth(100), 600));
    timers.current.push(setTimeout(() => { setVisible(false); setWidth(0); }, 800));

    return () => timers.current.forEach(clearTimeout);
  }, [pathname]);

  if (!visible) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 9999, pointerEvents: "none" }}>
      <div
        style={{
          height: "100%",
          background: "linear-gradient(90deg, #73b815, #a8d96b)",
          width: `${width}%`,
          transition: width === 0 ? "none" : "width 0.4s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "0 0 8px rgba(168,217,107,0.6)",
        }}
      />
    </div>
  );
}

function PageContent({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  // `key={pathname}` força remount em mudança de rota, disparando o fade-in.
  // Mesma classe é aplicada na carga inicial (F5) — comportamento idêntico.
  //
  // `transform: translateZ(0)` cria um "containing block" para descendentes com
  // `position: fixed` (barras sticky bottom em GenerateStep e /parecer). Sem ele,
  // essas barras escapariam para o viewport inteiro e passariam por baixo da
  // sidebar. O slide-up anterior fornecia esse containing block via transform —
  // ao migrar para fade puro (só opacity), precisamos manter o transform aqui.
  // Custo: zero visual, força composited layer (já era assim com slide-up).
  return (
    <div
      key={pathname}
      className="animate-fade-in flex flex-col flex-1 min-w-0"
      style={{ transform: "translateZ(0)" }}
    >
      {children}
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const router      = useRouter();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });

  // Mobile drawer (sidebar overlay) — fechado por padrão. Em <lg sidebar
  // some do layout normal e só abre como overlay quando o usuário toca
  // no botão hambúrguer.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  // Fecha o drawer ao navegar.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Bloqueia scroll do body quando drawer está aberto.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const noShell = NO_SHELL_ROUTES.some(r => pathname.startsWith(r));
  if (noShell) return <>{children}</>;
  // CommandPalette só faz sentido com sessão; ele próprio checa user via useAuth.

  const hasResume      = searchParams.has("resume");
  const hasStep        = searchParams.has("step");
  const isInsideColeta = pathname === "/" && (hasResume || hasStep);
  const showDashboard  = pathname === "/" && !isInsideColeta;

  function goToDashboard() {
    try { sessionStorage.removeItem("cf_nav_state"); } catch {/* */}
    if (pathname === "/") {
      // Já em "/", mas pode estar dentro de uma coleta (showDashboard=false em
      // app/page.tsx). `router.refresh()` sozinho não remonta o componente,
      // então o state local (step, showDashboard) persiste e a tela continua
      // mostrando a coleta. Solução: limpa querystring e dispara um evento que
      // o page.tsx escuta para resetar para o dashboard.
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new CustomEvent("cf:go-to-dashboard"));
      router.refresh();
    } else {
      router.push("/");
    }
  }

  function startNewColeta() {
    try { sessionStorage.removeItem("cf_nav_state"); } catch {/* */}
    window.location.href = "/?nova=true";
  }

  return (
    <div className="bg-cf-bg flex h-screen overflow-hidden">
      <RouteProgress pathname={pathname} />
      <CommandPalette />
      <ThemeToggle />
      {/* Sidebar desktop (visível >= lg) */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
        onGoToDashboard={goToDashboard}
        onNewColeta={startNewColeta}
        showDashboard={showDashboard}
        isInsideColeta={isInsideColeta}
      />

      {/* Sidebar mobile (overlay drawer) — só renderiza quando aberta para
          evitar foco/teclado capturado em desktop. */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="lg:hidden fixed inset-y-0 left-0 z-50 animate-slide-up">
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => setMobileOpen(false)}
              onGoToDashboard={() => { goToDashboard(); setMobileOpen(false); }}
              onNewColeta={() => { startNewColeta(); setMobileOpen(false); }}
              showDashboard={showDashboard}
              isInsideColeta={isInsideColeta}
              forceVisible
            />
          </div>
        </>
      )}

      <div
        id="cf-right-col"
        className="flex flex-col flex-1 min-w-0 overflow-y-auto"
        style={{ marginLeft: 0 }}
      >
        {/* Topbar mobile com hambúrguer — só aparece em <lg */}
        <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="p-2 -ml-1 rounded-md text-slate-600 hover:bg-slate-100 transition"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => { goToDashboard(); setMobileOpen(false); }}
            aria-label="Ir para Visão Geral"
            className="bg-transparent border-none p-0 cursor-pointer flex items-center"
          >
            <svg
              width="120" height="18" viewBox="0 0 451 58"
              xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
            >
              <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
              <circle cx="31" cy="49" r="4.5" fill="#203b88" />
              <text x="66" y="46" fontFamily="'Open Sans',Arial,sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
                <tspan fill="#203b88">capital</tspan>
                <tspan fill="#73b815">finanças</tspan>
              </text>
            </svg>
          </button>
          <div className="w-9" />
        </div>
        <PageContent pathname={pathname}>
          {children}
        </PageContent>
      </div>
    </div>
  );
}

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cf-bg">{children}</div>}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}

```

## components/layout/Sidebar.tsx

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Plus, Clock, Settings, HelpCircle, Activity, ClipboardList, Zap, ReceiptText, BarChart2,
  ChevronLeft, ChevronRight, LogOut,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onGoToDashboard: () => void;
  onNewColeta: () => void;
  showDashboard: boolean;
  isInsideColeta: boolean;
  // Quando true, ignora a media-query "hidden lg:flex" e força visibilidade.
  // Usado pelo overlay mobile (drawer) renderizado em <lg.
  forceVisible?: boolean;
};

// LogoFull/LogoIcon antigos foram substituídos pelo componente <Logo /> compartilhado
// (variant "full"/"icon", light=true para fundo navy do sidebar).

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  action?: "dashboard" | "coleta";
};

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "PRINCIPAL",
    items: [
      { icon: Home,     label: "Visão Geral", action: "dashboard", href: "/" },
      { icon: Plus,     label: "Nova Coleta", action: "coleta",    href: "/" },
    ],
  },
  {
    label: "OPERAÇÕES",
    items: [
      { icon: Clock,         label: "Histórico",    href: "/historico" },
      { icon: Activity,      label: "Em Andamento", href: "/operacoes" },
      { icon: ClipboardList, label: "Pareceres",    href: "/pareceres" },
      { icon: BarChart2,     label: "Métricas",     href: "/metricas" },
      { icon: ReceiptText,   label: "Custos",       href: "/custos" },
    ],
  },
  {
    label: "INTEGRAÇÕES",
    items: [
      { icon: Zap, label: "Goalfy", href: "/importar-goalfy" },
    ],
  },
  {
    label: "CONFIGURAÇÕES",
    items: [
      { icon: Settings,   label: "Política de Fundo", href: "/configuracoes" },
      { icon: HelpCircle, label: "Suporte",        href: "/ajuda" },
    ],
  },
];

const NAVY = "#1a2f6b";
const ACTIVE_BG  = "rgba(255,255,255,0.14)";
const HOVER_BG   = "rgba(255,255,255,0.07)";
const TEXT_IDLE  = "rgba(255,255,255,0.62)";
const TEXT_ACT   = "#ffffff";
const ICON_IDLE  = "rgba(255,255,255,0.50)";

export default function Sidebar({
  collapsed, onToggleCollapse,
  onGoToDashboard, onNewColeta,
  showDashboard, isInsideColeta,
  forceVisible = false,
}: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string, action?: "dashboard" | "coleta") => {
    if (action === "dashboard") return pathname === "/" && showDashboard && !isInsideColeta;
    if (action === "coleta")   return pathname === "/" && isInsideColeta;
    return pathname === href.split("?")[0];
  };

  function itemStyle(active: boolean, center = false): React.CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: center ? "center" : "flex-start",
      gap: "9px",
      padding: collapsed ? "9px 0" : "8px 10px 8px 8px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: active ? 600 : 400,
      color: active ? TEXT_ACT : TEXT_IDLE,
      background: active ? ACTIVE_BG : "transparent",
      cursor: "pointer",
      border: "none",
      borderLeft: center ? undefined : (active ? "2px solid #a8d96b" : "2px solid transparent"),
      width: "100%",
      textAlign: "left",
      textDecoration: "none",
      transition: "background 0.15s, color 0.15s, border-left-color 0.15s",
    };
  }

  function onHover(e: React.MouseEvent<HTMLElement>, active: boolean, enter: boolean) {
    if (active) return;
    const el = e.currentTarget as HTMLElement;
    el.style.background = enter ? HOVER_BG  : "transparent";
    el.style.color       = enter ? "#fff"    : TEXT_IDLE;
  }

  function renderItem(item: NavItem) {
    const active = isActive(item.href, item.action);
    const Icon   = item.icon;
    const style  = itemStyle(active, collapsed);
    const iconEl = (
      <Icon
        size={collapsed ? 18 : 15}
        style={{ flexShrink: 0, color: active ? "#fff" : ICON_IDLE }}
      />
    );

    const content = (
      <>
        {iconEl}
        {!collapsed && item.label}
      </>
    );

    const hoverProps = {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => onHover(e, active, true),
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => onHover(e, active, false),
    };

    const title = collapsed ? item.label : undefined;

    if (item.action === "dashboard") {
      return (
        <button key={item.label} onClick={onGoToDashboard} style={style} title={title} {...hoverProps}>
          {content}
        </button>
      );
    }
    if (item.action === "coleta") {
      return (
        <button key={item.label} onClick={onNewColeta} style={style} title={title} {...hoverProps}>
          {content}
        </button>
      );
    }
    return (
      <Link key={item.label} href={item.href} style={style} title={title} {...hoverProps}>
        {content}
      </Link>
    );
  }

  return (
    <aside
      className={forceVisible ? "flex flex-col flex-shrink-0" : "hidden lg:flex flex-col flex-shrink-0"}
      style={{
        width: collapsed ? 60 : 220,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        background: `linear-gradient(180deg, ${NAVY} 0%, #132055 100%)`,
        zIndex: 40,
        transition: "width 0.25s ease",
      }}
    >
      {/* Logo + toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "18px 0 16px" : "18px 12px 16px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          gap: "8px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onGoToDashboard}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          title="Visão Geral"
        >
          {collapsed ? <Logo variant="icon" light height={26} /> : <Logo light height={22} />}
        </button>

        {/* Toggle chevron — só visível quando expandido */}
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            title="Minimizar menu"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              color: "rgba(255,255,255,0.5)",
              flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
            }}
          >
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ padding: collapsed ? "14px 6px" : "14px 10px", flex: 1 }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: collapsed ? "16px" : "22px" }}>
            {!collapsed && (
              <p style={{
                fontSize: "10px", fontWeight: 700,
                color: "rgba(255,255,255,0.28)",
                letterSpacing: "0.08em",
                padding: "0 10px", marginBottom: "4px",
              }}>
                {section.label}
              </p>
            )}
            {collapsed && <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "0 0 8px" }} />}
            {section.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Rodapé — expand (collapsed) ou logout (expanded) */}
      <div style={{ padding: collapsed ? "12px 6px" : "12px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
        {collapsed ? (
          <>
            <button
              onClick={onToggleCollapse}
              title="Expandir menu"
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                padding: "8px 0", borderRadius: "8px",
                background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.5)", transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)";
                (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
              }}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={handleLogout}
              title="Sair da conta"
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                padding: "8px 0", borderRadius: "8px",
                background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.4)", transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.18)";
                (e.currentTarget as HTMLElement).style.color = "#fca5a5";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)";
              }}
            >
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <button
            onClick={handleLogout}
            title="Sair da conta"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "9px",
              padding: "8px 10px 8px 8px", borderRadius: "8px",
              background: "rgba(255,255,255,0.04)", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.45)", fontSize: "13px", fontWeight: 400,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.18)";
              (e.currentTarget as HTMLElement).style.color = "#fca5a5";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
            }}
          >
            <LogOut size={15} style={{ flexShrink: 0 }} />
            Sair da conta
          </button>
        )}
      </div>
    </aside>
  );
}

```

## components/layout/Topbar.tsx

```tsx
"use client";

import { Bell, Settings, LogOut, Menu, X } from "lucide-react";

type NotificationItem = {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
};

type AuthUser = {
  email?: string;
  user_metadata?: { full_name?: string };
} | null;

type TopbarProps = {
  user: AuthUser;
  authLoading: boolean;
  unreadCount: number;
  notifications: NotificationItem[];
  showNotifications: boolean;
  mobileMenuOpen: boolean;
  onToggleNotifications: () => void;
  onToggleMobileMenu: () => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onSignOut: () => void;
  // logo click on mobile (sidebar hidden)
  onGoToDashboard: () => void;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days === 1) return "ontem";
  return `há ${days} dias`;
}

function LogoSmall({ height = 22 }: { height?: number }) {
  const w = Math.round(height * 7.26);
  return (
    <svg width={w} height={height} viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke="#203b88" strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill="#203b88" />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill="#203b88">capital</tspan>
        <tspan fill="#73b815">finanças</tspan>
      </text>
    </svg>
  );
}

const iconBtn: React.CSSProperties = {
  width: "34px", height: "34px",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#94A3B8", borderRadius: "8px",
  border: "none", background: "transparent",
  cursor: "pointer", flexShrink: 0,
  transition: "background 0.15s, color 0.15s",
};

export default function Topbar({
  user, authLoading, unreadCount, notifications, showNotifications, mobileMenuOpen,
  onToggleNotifications, onToggleMobileMenu, onMarkAllRead, onClearAll, onSignOut,
  onGoToDashboard,
}: TopbarProps) {
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "U";
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <header
      style={{
        height: "56px",
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #F1F5F9",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Mobile: logo (sidebar is hidden on mobile) */}
      <button
        onClick={onGoToDashboard}
        className="lg:hidden"
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
      >
        <LogoSmall height={22} />
      </button>

      {/* Desktop: spacer so actions stay right */}
      <div className="hidden lg:block" />

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>

        {/* Notifications */}
        {!authLoading && user && (
          <div className="relative">
            <button
              onClick={onToggleNotifications}
              style={iconBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; (e.currentTarget as HTMLElement).style.color = "#475569"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: "7px", right: "7px",
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: "#22c55e", border: "1.5px solid #fff",
                }} />
              )}
            </button>

            {showNotifications && (
              <div
                className="absolute right-0 bg-white rounded-xl border border-[#E5E7EB] shadow-lg z-50 overflow-hidden"
                style={{ top: "44px", width: "300px" }}
              >
                <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] flex items-center justify-between">
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
                    Notificações {unreadCount > 0 && `(${unreadCount})`}
                  </p>
                  {notifications.length > 0 && (
                    <button
                      onClick={onClearAll}
                      style={{ fontSize: "11px", color: "#94A3B8", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Limpar todas
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "#94A3B8", textAlign: "center", padding: "28px 16px" }}>
                      Nenhuma notificação
                    </p>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #F1F5F9",
                        background: n.read ? "transparent" : "rgba(32,59,136,0.03)",
                      }}
                    >
                      <p style={{ fontSize: "12px", color: "#374151" }}>{n.message}</p>
                      <p style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px" }}>{timeAgo(n.created_at)}</p>
                    </div>
                  ))}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllRead}
                    style={{
                      width: "100%", fontSize: "12px", fontWeight: 600, color: "#203b88",
                      padding: "10px", border: "none", background: "transparent",
                      borderTop: "1px solid #E5E7EB", cursor: "pointer",
                    }}
                  >
                    Marcar todas como lidas
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings — hidden on mobile (sidebar not visible) */}
        <a
          href="/configuracoes"
          className="hidden lg:flex"
          style={{ ...iconBtn, textDecoration: "none" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F1F5F9"; (e.currentTarget as HTMLElement).style.color = "#475569"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
        >
          <Settings size={17} />
        </a>

        {/* Avatar + name */}
        {!authLoading && user && (
          <a
            href="/perfil"
            className="hidden sm:flex items-center gap-2"
            style={{ padding: "4px 8px", borderRadius: "8px", textDecoration: "none", marginLeft: "4px", transition: "background 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "linear-gradient(135deg, #1a3560 0%, #203b88 100%)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "white" }}>{initials}</span>
            </div>
            <span style={{
              fontSize: "13px", fontWeight: 500, color: "#374151",
              maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {displayName}
            </span>
          </a>
        )}

        {/* Sign out */}
        {!authLoading && user && (
          <button
            onClick={onSignOut}
            style={iconBtn}
            title="Sair"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#FEF2F2"; (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94A3B8"; }}
          >
            <LogOut size={16} />
          </button>
        )}

        {/* Mobile hamburger */}
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden"
          style={{ ...iconBtn, marginLeft: "4px" }}
          aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}

```

## components/Logo.tsx

```tsx
// Logo da Capital Finanças. Variante "full" inclui o nome; "icon" só o círculo.
// `light` inverte para branco (uso sobre fundo navy/escuro).
//
// Antes existiam 7+ cópias divergentes do SVG espalhadas em login, perfil, ajuda,
// page.tsx, parecer, WelcomeModal, Sidebar, Topbar — todas substituídas por este
// componente.

type LogoProps = {
  variant?: "full" | "icon";
  light?: boolean;
  height?: number;
  className?: string;
};

export default function Logo({
  variant = "full",
  light = false,
  height = 26,
  className,
}: LogoProps) {
  const blue = light ? "#ffffff" : "#203b88";
  const green = light ? "#a8d96b" : "#73b815";

  if (variant === "icon") {
    return (
      <svg
        width={height}
        height={height}
        viewBox="0 0 62 62"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Capital Finanças"
        className={className}
      >
        <circle cx="31" cy="27" r="22" stroke={blue} strokeWidth="4.5" fill="none" />
        <circle cx="31" cy="49" r="4.5" fill={blue} />
      </svg>
    );
  }

  const w = Math.round(height * 7.26);
  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 451 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Capital Finanças"
      className={className}
    >
      <circle cx="31" cy="27" r="22" stroke={blue} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={blue} />
      <text
        x="66"
        y="46"
        fontFamily="'Open Sans', Arial, sans-serif"
        fontWeight="700"
        fontSize="38"
        letterSpacing="-0.3"
      >
        <tspan fill={blue}>capital</tspan>
        <tspan fill={green}>finanças</tspan>
      </text>
    </svg>
  );
}

```

## components/ThemeToggle.tsx

```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

// Botão flutuante no canto inferior direito que alterna dark/light.
// Posicionamento fixed para não exigir alteração nas headers de cada página.
// Sidebar/Topbar com inline styles seguem em modo claro até overhaul dedicado;
// páginas que usam classes Tailwind respeitam o `dark:` correto.
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
      aria-label={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
      className="fixed bottom-4 right-4 z-30 w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-600 hover:text-cf-navy hover:border-slate-300 shadow-md transition-colors flex items-center justify-center dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-amber-300"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

```

## components/PageTransition.tsx

```tsx
"use client";
import { usePathname } from "next/navigation";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}

```

## components/CommandPalette.tsx

```tsx
"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, ClipboardList, X, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";

// Resultado vindo de document_collections + pareceres (busca por empresa/CNPJ).
type Result =
  | { kind: "coleta"; id: string; company: string; cnpj: string | null; status: string }
  | { kind: "parecer"; id: string; collectionId: string; company: string; cnpj: string | null; decisao: string };

const KEY = "k";

// Detecta Ctrl+K (Win/Linux) ou Cmd+K (Mac). Ignora se foco está em <input>/<textarea>
// que já está digitando — exceto quando combo é explícito com modifier.
function isShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === KEY;
}

export default function CommandPalette() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hotkey global Ctrl/Cmd+K — abre o palette de qualquer página com sessão.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isShortcut(e)) {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Foca no input quando abre, limpa estado quando fecha.
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      // pequeno timeout para não competir com a animação
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Busca debounced — 250ms — em coletas e pareceres.
  const search = useCallback(async (q: string) => {
    if (!user || !q.trim() || q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const term = q.trim();
      const cnpjDigits = term.replace(/\D/g, "");
      // OR entre company_name LIKE e cnpj LIKE (precisa virgular escapada).
      const safe = term.replace(/,/g, " ").replace(/%/g, "").replace(/'/g, "''");
      const orFilter = cnpjDigits.length >= 3
        ? `company_name.ilike.%${safe}%,cnpj.ilike.%${cnpjDigits}%`
        : `company_name.ilike.%${safe}%`;

      const [colRes, parRes] = await Promise.all([
        supabase
          .from("document_collections")
          .select("id, company_name, cnpj, label, status")
          .eq("user_id", user.id)
          .or(orFilter)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("pareceres")
          .select("id, collection_id, razao_social, cnpj, decisao_comite")
          .eq("user_id", user.id)
          .or(
            cnpjDigits.length >= 3
              ? `razao_social.ilike.%${safe}%,cnpj.ilike.%${cnpjDigits}%`
              : `razao_social.ilike.%${safe}%`,
          )
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      const next: Result[] = [];
      for (const c of colRes.data ?? []) {
        next.push({
          kind: "coleta",
          id: c.id,
          company: c.company_name || c.label || "Empresa sem nome",
          cnpj: c.cnpj,
          status: c.status,
        });
      }
      for (const p of parRes.data ?? []) {
        next.push({
          kind: "parecer",
          id: p.id,
          collectionId: p.collection_id,
          company: p.razao_social || "Empresa sem nome",
          cnpj: p.cnpj,
          decisao: p.decisao_comite,
        });
      }
      setResults(next);
      setActiveIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const flatResults = useMemo(() => results, [results]);

  const navigate = useCallback((r: Result) => {
    setOpen(false);
    if (r.kind === "coleta") {
      router.push(`/historico?highlight=${r.id}`);
    } else {
      router.push(`/parecer?id=${r.collectionId}`);
    }
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flatResults[activeIdx];
      if (r) navigate(r);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Busca global"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in"
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar coletas e pareceres por empresa ou CNPJ"
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" />}
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
            aria-label="Fechar busca"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Digite pelo menos 2 caracteres para buscar.
              <p className="text-xs text-slate-400 mt-2">
                Atalho: <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px]">Ctrl</kbd>
                {" + "}
                <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px]">K</kbd>
              </p>
            </div>
          ) : flatResults.length === 0 && !loading ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          ) : (
            <ul role="listbox">
              {flatResults.map((r, idx) => {
                const Icon = r.kind === "coleta" ? Building2 : ClipboardList;
                const isActive = idx === activeIdx;
                const subtitle = r.kind === "coleta"
                  ? `Coleta · ${r.cnpj ?? "sem CNPJ"} · ${r.status}`
                  : `Parecer · ${r.cnpj ?? "sem CNPJ"} · ${r.decisao.replace("_", " ")}`;
                return (
                  <li key={`${r.kind}-${r.id}`} role="option" aria-selected={isActive}>
                    <button
                      onClick={() => navigate(r)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isActive ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        r.kind === "coleta" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{r.company}</p>
                        <p className="text-xs text-slate-500 truncate">{subtitle}</p>
                      </div>
                      <ArrowRight className={`w-4 h-4 shrink-0 ${isActive ? "text-slate-700" : "text-slate-300"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">
          <span><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">↑↓</kbd> navegar</span>
          <span><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">↵</kbd> abrir</span>
          <span><kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}

```

## components/DevBanner.tsx

```tsx
import { Construction } from "lucide-react";

// Banner amarelo no topo de páginas em desenvolvimento (/v2, /admin/*).
// Avisa Victor de que pode haver bugs ou dados parciais.
export default function DevBanner({ message }: { message?: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <Construction className="h-4 w-4 shrink-0" />
      <span>
        {message ?? "Esta página está em desenvolvimento — dados podem estar incompletos ou apresentar bugs."}
      </span>
    </div>
  );
}

```

## components/OnboardingTooltip.tsx

```tsx
"use client";

import { useState, useEffect } from "react";

interface OnboardingTooltipProps {
  id: string;
  message: string;
  position?: "top" | "bottom" | "left" | "right";
  isSeen: boolean;
  onSeen: () => void;
  children: React.ReactNode;
}

export default function OnboardingTooltip({ id, message, position = "bottom", isSeen, onSeen, children }: OnboardingTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isSeen) return;
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, [isSeen]);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => { setVisible(false); onSeen(); }, 8000);
    return () => clearTimeout(timer);
  }, [visible, onSeen]);

  const handleDismiss = () => {
    setVisible(false);
    onSeen();
  };

  if (isSeen) return <>{children}</>;

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses: Record<string, string> = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-[#1e3a5f] border-x-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[#1e3a5f] border-x-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-[#1e3a5f] border-y-transparent border-r-transparent",
    right: "right-full top-1/2 -translate-y-1/2 border-r-[#1e3a5f] border-y-transparent border-l-transparent",
  };

  return (
    <div className="relative" data-tooltip-id={id}>
      {children}
      {visible && (
        <div className={`absolute z-50 ${positionClasses[position]} animate-fade-in`} style={{ width: "clamp(200px, 280px, 90vw)" }}>
          <div className="bg-[#1e3a5f] text-white rounded-xl px-4 py-3 shadow-lg relative">
            <p className="text-xs leading-relaxed">{message}</p>
            <button
              onClick={handleDismiss}
              className="mt-2 text-[10px] font-semibold text-white/70 hover:text-white underline transition-colors"
              style={{ minHeight: "auto" }}
            >
              Entendi
            </button>
            <div className={`absolute w-0 h-0 border-[6px] ${arrowClasses[position]}`} />
          </div>
        </div>
      )}
    </div>
  );
}

```

## components/ui/badge.tsx

```tsx
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }

```

## components/ui/breadcrumb.tsx

```tsx
"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  showHome?: boolean;
  className?: string;
};

// Breadcrumb compacto para uso em /parecer, /perfil, /configuracoes,
// /custos, /metricas, /admin/*. O primeiro item geralmente é o ícone Home
// linkando para "/".
export function Breadcrumb({ items, showHome = true, className }: BreadcrumbProps) {
  const allItems = showHome ? [{ label: "Início", href: "/" }, ...items] : items;

  return (
    <nav aria-label="Navegação" className={cn("flex items-center text-sm", className)}>
      <ol className="flex items-center gap-1.5 flex-wrap">
        {allItems.map((item, idx) => {
          const isLast = idx === allItems.length - 1;
          const isCurrent = item.current || isLast;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              {isCurrent || !item.href ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    isCurrent ? "text-cf-text-1 font-medium" : "text-cf-text-3",
                  )}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {idx === 0 && showHome && <Home className="h-3.5 w-3.5" />}
                  {!(idx === 0 && showHome) && item.label}
                  {idx === 0 && showHome && <span className="sr-only">{item.label}</span>}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1.5 text-cf-text-3 hover:text-cf-navy transition-colors"
                >
                  {idx === 0 && showHome && <Home className="h-3.5 w-3.5" />}
                  {!(idx === 0 && showHome) && item.label}
                  {idx === 0 && showHome && <span className="sr-only">{item.label}</span>}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

```

## components/ui/button.tsx

```tsx
"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

```

## components/ui/card.tsx

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

```

## components/ui/confirm-dialog.tsx

```tsx
"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

// Modal de confirmação reutilizável para ações destrutivas (deletar coleta,
// excluir parecer, descartar política não salva). Substitui o uso de
// `window.confirm()` espalhado no app, que era inconsistente e bloqueava o
// thread.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";

  async function handleConfirm() {
    await onConfirm();
    if (!loading) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showClose={!loading}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            {isDestructive && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-cf-text-2 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium text-white transition disabled:opacity-50 inline-flex items-center justify-center gap-2",
              isDestructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-cf-navy hover:bg-cf-navy-dark",
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

```

## components/ui/dialog.tsx

```tsx
"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Backdrop>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Backdrop
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px]",
      "data-[open]:animate-fade-in",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Popup> & {
    showClose?: boolean;
  }
>(({ className, children, showClose = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Popup
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
        "bg-white rounded-xl border border-slate-200 shadow-lg p-6",
        "focus:outline-none",
        "data-[open]:animate-fade-in",
        className,
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cf-navy/30"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Popup>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-left mb-4", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6 pt-4 border-t border-slate-100",
        className,
      )}
      {...props}
    />
  );
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-tight tracking-tight text-cf-text-1", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-cf-text-3 mt-1", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};

```

## components/ui/dropdown-menu.tsx

```tsx
"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import * as React from "react";
import { cn } from "@/lib/utils";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuPortal = MenuPrimitive.Portal;
const DropdownMenuGroup = MenuPrimitive.Group;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Popup> & {
    sideOffset?: number;
  }
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPortal>
    <MenuPrimitive.Positioner sideOffset={sideOffset}>
      <MenuPrimitive.Popup
        ref={ref}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-md",
          "data-[open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Positioner>
  </DropdownMenuPortal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <MenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors",
      "data-[highlighted]:bg-slate-100 data-[highlighted]:text-cf-text-1",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      destructive
        ? "text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"
        : "text-cf-text-2",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-3 py-1.5 text-xs font-semibold text-cf-text-3 uppercase tracking-wider", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-slate-100", className)} role="separator" />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
};

```

## components/ui/input.tsx

```tsx
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }

```

## components/ui/label.tsx

```tsx
"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }

```

## components/ui/progress.tsx

```tsx
"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  children,
  value,
  ...props
}: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("h-full bg-primary transition-all", className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-sm font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}

```

## components/ui/select.tsx

```tsx
"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDown, Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectGroup = SelectPrimitive.Group;
const SelectGroupLabel = SelectPrimitive.GroupLabel;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm",
      "text-cf-text-1 placeholder:text-cf-text-3",
      "focus:outline-none focus:ring-2 focus:ring-cf-navy/30 focus:border-cf-navy/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "[&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon className="ml-2 text-slate-400">
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner sideOffset={4}>
      <SelectPrimitive.Popup
        ref={ref}
        className={cn(
          "z-50 max-h-72 min-w-[var(--anchor-width)] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-md",
          "data-[open]:animate-fade-in",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.List>{children}</SelectPrimitive.List>
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-8 pr-3 text-sm",
      "text-cf-text-2 outline-none transition-colors",
      "data-[highlighted]:bg-slate-100 data-[highlighted]:text-cf-text-1",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-cf-navy" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
};

```

## components/ui/separator.tsx

```tsx
"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }

```

## components/ui/skeleton.tsx

```tsx
import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/80", className)}
      {...props}
    />
  );
}

// Skeleton de tabela: configurável com colunas e linhas. Renderiza header
// "fantasma" + N linhas. Usado em /historico, /pareceres, /operacoes,
// /custos, /metricas enquanto o Supabase responde.
type TableSkeletonProps = {
  cols?: number;
  rows?: number;
  className?: string;
};

export function TableSkeleton({ cols = 5, rows = 6, className }: TableSkeletonProps) {
  return (
    <div className={cn("w-full overflow-hidden rounded-xl border border-slate-200 bg-white", className)}>
      <div className="grid border-b border-slate-200 bg-slate-50 p-3 gap-3"
           style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid p-3 gap-3"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-4", c === 0 && "w-3/4", c === cols - 1 && "w-1/2")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

```

## components/ui/table.tsx

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

// Wrapper sempre com overflow-x-auto — garante que tabelas viram scrollable
// em mobile sem quebrar layout. Antes havia tabelas que vazavam para fora
// da viewport em /historico, /pareceres, /operacoes.
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }
>(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn("relative w-full overflow-x-auto rounded-xl border border-slate-200 bg-white", wrapperClassName)}>
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("bg-slate-50 border-b border-slate-200 [&_tr]:border-0", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-slate-100 transition-colors hover:bg-slate-50/60 data-[state=selected]:bg-slate-100",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-3 text-left align-middle text-xs font-semibold text-cf-text-3 uppercase tracking-wider whitespace-nowrap",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("px-3 py-2.5 align-middle text-sm text-cf-text-2", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-3 text-sm text-cf-text-3", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};

```

## components/ui/tabs.tsx

```tsx
"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-start gap-1 rounded-lg bg-slate-100 p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Tab>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Tab>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Tab
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
      "text-cf-text-3 transition-colors hover:text-cf-text-1",
      "data-[selected]:bg-white data-[selected]:text-cf-navy data-[selected]:shadow-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cf-navy/30",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Panel>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Panel
    ref={ref}
    className={cn("mt-3 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };

```

## components/ui/textarea.tsx

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

```

## components/ui/tooltip.tsx

```tsx
"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> & {
    sideOffset?: number;
  }
>(({ className, sideOffset = 6, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner sideOffset={sideOffset}>
      <TooltipPrimitive.Popup
        ref={ref}
        className={cn(
          "z-50 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-md",
          "data-[open]:animate-fade-in",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Popup>
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

```
