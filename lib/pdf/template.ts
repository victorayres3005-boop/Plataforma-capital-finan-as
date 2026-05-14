import type { PDFReportParams } from "@/lib/generators/pdf";
import type { FundCriterion } from "@/types";
import type { RespostaCriterio } from "@/types/politica-credito";
import { CAPITAL_LOGO_B64 } from "@/lib/assets/capital-logo-b64";
import { recomputeSCRTotals, periodoRefToKey } from "@/lib/hydrateFromCollection";
import { calcScrTotal } from "@/lib/scrTotal";
import {
  calcularIndicadores,
  classificarIndicador,
  formatarIndicador,
  tendencia,
  INDICADORES_TABELA,
} from "@/lib/analyze/indicadoresFinanceiros";

// ─── Logo base64 ─────────────────────────────────────────────────────────────
// Reaproveita a constante compartilhada em lib/assets/capital-logo-b64.ts —
// mesma logo usada pelo gerador jsPDF. Trocar a logo agora é um único ponto.
const LOGO_B64 = CAPITAL_LOGO_B64;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return esc(String(v));
}
function numVal(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  let s = String(v).replace(/[R$\s%]/g, "").trim();
  if (!s) return 0;
  // Brazilian format: dots=thousands separator, comma=decimal separator
  // e.g. "303.842,32" → remove dots → "303842,32" → comma→dot → "303842.32"
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s.replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
function fmtMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = numVal(v);
  if (isNaN(n)) return esc(String(v));
  return "R$\u00a0" + n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtMoneyAbr(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = numVal(v);
  if (isNaN(n)) return esc(String(v));
  if (Math.abs(n) >= 1_000_000) return "R$\u00a0" + (n/1_000_000).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"M";
  if (Math.abs(n) >= 1_000) return "R$\u00a0" + (n/1_000).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0})+"k";
  return "R$\u00a0" + Math.round(n).toLocaleString("pt-BR");
}
function fmtPct(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const s = String(v).trim();
  if (s.endsWith("%")) return esc(s);
  const n = parseFloat(s.replace(",","."));
  if (isNaN(n)) return esc(s);
  return n.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
}
function fmtCnpj(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g,"");
  if (d.length !== 14) return esc(v);
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}
function fmtCpf(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g,"");
  if (d.length !== 11) return esc(v);
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return esc(v);
}

// ─── Decision label helper ─────────────────────────────────────────────────────
function fmtDecision(d: string | null | undefined): string {
  if (!d) return "Pendente";
  const u = d.toUpperCase().replace(/_/g, " ");
  if (u.includes("APROVAD") && !u.includes("COND")) return "Tend. Aprovação";
  if (u.includes("COND")) return "Tend. Condicional";
  if (u.includes("REPROVAD")) return "Tend. Reprovação";
  return esc(d);
}

// ─── Score helpers ─────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 8) return "var(--g6)";
  if (score >= 5) return "var(--a5)";
  return "var(--r6)";
}
function scoreBorder(score: number): string {
  if (score >= 8) return "var(--g6)";
  if (score >= 5) return "var(--a5)";
  return "var(--r6)";
}
function decisionBg(decision: string): string {
  const d = decision.toUpperCase();
  if (d.includes("APROVADO") && !d.includes("COND")) return "var(--g6)";
  if (d.includes("COND")) return "var(--a5)";
  return "var(--r6)";
}

// ⚠️ TEMP: rating numérico + decisão (APROVADO/REPROVADO) escondidos do PDF/HTML
// enquanto a avaliação automatizada está em calibração. Trocar para `false` quando
// a nota voltar a ser confiável. Tela do app continua mostrando normalmente.
const HIDE_AVALIACAO = true;
const BANNER_CALIBRACAO = `<div style="display:inline-block;padding:8px 18px;border-radius:6px;font-size:11px;font-weight:600;background:rgba(115,184,21,0.12);color:#73b815;border:1px solid rgba(115,184,21,0.3);letter-spacing:0.02em">Rating em calibração — siga pela análise quantitativa</div>`;
const BANNER_CALIBRACAO_LIGHT = `<div style="display:inline-block;padding:6px 14px;border-radius:5px;font-size:10px;font-weight:600;background:#f8fafc;color:#64748b;border:1px solid #e2e8f0">Rating em calibração</div>`;

// ─── Page header wrapper ───────────────────────────────────────────────────────
function page(content: string, pageNum: number, date: string): string {
  return `
<div class="page">
  <div class="hdr">
    <div><img src="data:image/png;base64,${LOGO_B64}" alt="Capital Finanças" style="height:18px;object-fit:contain;display:block;filter:brightness(0) invert(1)" /></div>
    <div style="display:flex;align-items:center"><div class="meta">Relatório de Due Diligence · ${date}</div><div class="pg">${pageNum}</div></div>
  </div>
  <div class="ct">${content}</div>
  <div class="ftr">
    <span>Capital Finanças · Relatório de Due Diligence · Documento Confidencial</span>
    <span>Pág. ${pageNum}</span>
  </div>
</div>`;
}

// ─── Ordena meses cronologicamente (jan/2024 < fev/2024 < ... < dez/2025) ─────
function sortMesCrono(ms: Array<{mes:string;valor:string}>): Array<{mes:string;valor:string}> {
  const key = (s: string) => {
    const p = s.split("/");
    if (p.length !== 2) return 0;
    const mm: Record<string,number> = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
    const m = isNaN(Number(p[0])) ? (mm[p[0].toLowerCase()] || 0) : Number(p[0]);
    const y = Number(p[1]) < 100 ? Number(p[1]) + 2000 : Number(p[1]);
    return y * 100 + m;
  };
  return [...ms].sort((a, b) => key(a.mes) - key(b.mes));
}

// ─── Trend line SVG overlay (linear regression over bar chart) ────────────────
function buildTrendSvg(meses: {mes:string;valor:string}[], maxBarPx = 80): string {
  if (meses.length < 2) return "";
  const vals = meses.map(m => numVal(m.valor));
  const max = Math.max(...vals, 1);
  const n = vals.length;
  const H = 120; // matches .bars height in px

  // Linear regression: y = slope * x + intercept (x = index 0..n-1)
  const mx = (n - 1) / 2;
  const my = vals.reduce((s, v) => s + v, 0) / n;
  const num = vals.reduce((s, v, i) => s + (i - mx) * (v - my), 0);
  const den = vals.reduce((s, _, i) => s + (i - mx) * (i - mx), 0);
  const slope = den !== 0 ? num / den : 0;
  const intercept = my - slope * mx;

  // SVG coords: x = 0..100 (percentage), y = 0..H (top=0)
  const toX = (i: number) => ((i + 0.5) / n * 100).toFixed(1);
  const toY = (i: number) => {
    const v = Math.max(0, slope * i + intercept);
    return Math.max(0, Math.min(H, H - (v / max) * maxBarPx)).toFixed(1);
  };

  // Color: green if growing > 0.5% of mean per month, red if declining, gray if flat
  const color = slope > my * 0.005 ? "#16a34a" : slope < -(my * 0.005) ? "#dc2626" : "#64748b";

  return `<svg style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 100 ${H}" preserveAspectRatio="none">
    <line x1="${toX(0)}" y1="${toY(0)}" x2="${toX(n-1)}" y2="${toY(n-1)}"
      stroke="${color}" stroke-opacity="0.8" stroke-width="1.5" stroke-dasharray="5 3" stroke-linecap="round"
      vector-effect="non-scaling-stroke"/>
  </svg>`;
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function buildBars(meses: {mes:string;valor:string}[], maxBarPx = 80): string {
  const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  function parseMesLabel(mes: string): string {
    // "01/2025" or "1/2025"
    const mSlash = mes.match(/^(\d{1,2})\//);
    if (mSlash) { const idx = parseInt(mSlash[1]) - 1; return MONTHS[idx] ?? mes; }
    // "2025-01"
    const mDash = mes.match(/^(\d{4})-(\d{2})/);
    if (mDash) { const idx = parseInt(mDash[2]) - 1; return MONTHS[idx] ?? mes; }
    return mes.slice(0, 3);
  }
  const vals = meses.map(m => numVal(m.valor));
  const max = Math.max(...vals, 1);
  return meses.map(m => {
    const v = numVal(m.valor);
    const barH = Math.max(Math.round((v / max) * maxBarPx), v > 0 ? 2 : 0);
    const lbl = fmtMoneyAbr(v).replace("R$\u00a0","");
    const cls = v === 0 ? "lt" : "nv";
    return `<div class="bar-col"><div class="bar ${cls}" style="height:${barH}px"><div class="bar-v">${lbl}</div></div><div class="bar-l">${esc(parseMesLabel(m.mes))}</div></div>`;
  }).join("");
}

// ─── Stitle ───────────────────────────────────────────────────────────────────
function stitle(label: string): string {
  const m = label.match(/^(\d{2})\s*[·•]\s*(.+)$/);
  if (m) {
    return `<div class="stitle"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:16px;border-radius:3px;background:var(--n9);color:#fff;font-size:8px;font-weight:700;padding:0 5px;margin-right:6px">${esc(m[1])}</span>${esc(m[2])} <div class="line"></div></div>`;
  }
  return `<div class="stitle">${esc(label)} <div class="line"></div></div>`;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
@page{size:210mm auto;margin:14mm 18mm}
@media print{
  body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;margin:0;padding:0;background:#fff}
  /* ── Cada .page = uma página no PDF ── */
  .page{break-after:page;page-break-after:always}
  .page-capa{overflow:hidden!important;min-height:269mm}
  /* ── Resetar card styles no print ── */
  /* max-width: 174mm = 210mm A4 - 18mm margem × 2 (definida em @page).
     Sem isso, o .page em print herdava largura da viewport e o .ftr
     esticava lateralmente — bug reportado em 2026-05-10 (rodapé pág 3).
     overflow:visible mantido pra conteúdo alto (tabelas, blocos ABC)
     fluir verticalmente entre páginas físicas. */
  /* Não aplicar reset de fundo em páginas com fundo escuro próprio:
     .page-capa (capa) e .page-divider (divisor de seção). Sem o exclude,
     a regra .page:not(.page-capa) zerava o background:var(--n8) inline
     dessas páginas, deixando texto branco invisível em fundo branco
     (bug AGROPECUARIA NUNES LTDA reportado 2026-05-14). */
  .page:not(.page-capa):not(.page-divider){margin:0 auto!important;padding:0!important;max-width:174mm!important;width:100%!important;box-shadow:none!important;border-radius:0!important;overflow:visible!important;background:transparent!important}
  .ftr{width:100%!important;box-sizing:border-box!important;max-width:100%!important}
  /* ── Content: padding leve no topo e fundo entre seções ── */
  .ct{padding:2px 0 24px}
  /* ── Esconder header/footer por-seção no print (sem rodapé em todas as páginas) ── */
  .hdr,.ftr{display:none!important}
  .avoid-break{page-break-inside:avoid}
  /* ── Permit tall containers to flow across page boundaries (removes clip) ── */
  .tbl,.ge-block,.ge-tbl,.soc-tbl,.risk-section,.risk-cols,.risk-block,.perc,.ana-grid,
  .prop-row,.scr-tbl,.mod-tbl,.abc-tbl,.bal-tbl,.dre-tbl{overflow:visible!important}
  /* ── Keep short atomic blocks on a single page ── */
  .istrip,.kpi-snap,.scr-strip,.fin-row,.fin-box,.icell,.emp,.seg,.rat,
  .kpi-row,.bar-chart,.scr-card,.fmm-anual,.perc-rec{break-inside:avoid;page-break-inside:avoid}
  /* ── Allow tall list containers to break across pages (no avoid-break) ── */
  .doc-grid,.crit-box,.abc-wrap{overflow:visible!important}
  /* ── Keep section titles glued to their content ── */
  .stitle{break-after:avoid;page-break-after:avoid}
  /* ── Keep alert boxes intact ── */
  .alert{break-inside:avoid;page-break-inside:avoid}
  /* ── Repeat table header on every page ── */
  thead{display:table-header-group;break-after:avoid;page-break-after:avoid}
  /* ── Keep table rows from being split ── */
  tbody tr{break-inside:avoid;page-break-inside:avoid}
}
/* ══════════════════════════════════════════════════════
   ESCALA TIPOGRÁFICA — alterar aqui propaga para todo o relatório
   fs-kpi   → valores de KPI / métricas grandes
   fs-h3    → texto de corpo principal, parágrafos, células de tabela
   fs-body  → texto secundário, alertas, notas
   fs-label → rótulos em maiúsculas (8×uppercase)
   fs-tag   → badges, tags, micro-rótulos
   fs-chart → valores nos gráficos de barra
   ══════════════════════════════════════════════════════ */
:root{
  --n9:#163269;--n8:#1F478E;--n7:#2a5aad;--n3:#a8c3e8;--n1:#ccd9f0;--n0:#e8eef8;
  --a5:#d4940a;--a1:#fdf3d7;--a0:#fef9ec;
  --r6:#c53030;--r1:#fee2e2;--r0:#fef2f2;
  --g6:#5a8a2a;--g1:#dff0c0;--g0:#f0f9e6;
  --x9:#111827;--x7:#374151;--x5:#6b7280;--x4:#9ca3af;--x3:#d1d5db;--x2:#e5e7eb;--x1:#f3f4f6;--x0:#f9fafb;
  --gl:#84BF41;
  /* ── Escala tipográfica ── */
  --fs-kpi:   14px;   /* valores numéricos / KPI */
  --fs-h3:    12px;   /* texto primário / parágrafos / células principais */
  --fs-body:  11px;   /* texto secundário / alertas / notas */
  --fs-label:  9px;   /* rótulos uppercase */
  --fs-tag:    8px;   /* badges / tags / micro */
  --fs-chart:  7.5px; /* valores nos gráficos */
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;font-size:var(--fs-body);background:#fff;color:var(--x9);-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',monospace}
.page{max-width:860px;margin:20px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(12,27,58,0.07)}
/* ── Header / Footer ── */
.hdr{background:var(--n9);padding:14px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--gl)}
.hdr .meta{font-size:var(--fs-label);color:rgba(255,255,255,0.5)}
.hdr .pg{background:var(--gl);color:#fff;font-size:var(--fs-body);font-weight:700;padding:3px 11px;border-radius:10px;margin-left:12px}
.ct{padding:28px 32px 32px}
/* Rodapé fixo — blindado contra herança de .s-wrap (síntese) e outras
   regras que possam vazar font-size do conteúdo da página. !important
   garante que o rodapé fica uniforme em TODAS as páginas. */
.ftr{background:var(--x0);border-top:1px solid var(--x2);padding:10px 32px!important;display:flex!important;justify-content:space-between!important;align-items:center!important;font-size:var(--fs-label)!important;line-height:1.3!important}
.ftr span{font-size:var(--fs-label)!important;color:var(--x4);letter-spacing:0.04em;line-height:1.3!important}
/* ── Section title ── */
.stitle{font-size:var(--fs-body);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--x5);margin:24px 0 10px;display:flex;align-items:center;gap:8px}
.stitle:first-child{margin-top:0}
.stitle .line{flex:1;height:1px;background:var(--x2)}
/* ── Empresa header ── */
.emp{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--x2);margin-bottom:20px}
.emp-name{font-size:18px;font-weight:700;color:var(--n9);margin-bottom:3px}
.emp-fan{font-size:var(--fs-body);color:var(--x5);margin-bottom:6px}
.emp-cnpj{font-size:var(--fs-h3);color:var(--x5)}
.emp-cnpj b{color:var(--x7);font-family:'JetBrains Mono',monospace}
.sit{display:inline-block;padding:2px 10px;border-radius:4px;font-size:var(--fs-label);font-weight:600;background:var(--g1);color:var(--g6);margin-left:8px}
.sit.inactive{background:var(--r1);color:var(--r6)}
/* ── Rating circle ── */
.rat{text-align:center;min-width:110px}
.rat-c{width:72px;height:72px;border-radius:50%;border:3px solid var(--r6);display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px}
.rat-n{font-size:26px;font-weight:700;line-height:1}
.rat-d{font-size:var(--fs-label);color:var(--x4)}
.rat-l{font-size:var(--fs-label);font-weight:700}
.dec{display:inline-block;padding:4px 14px;border-radius:4px;font-size:var(--fs-label);font-weight:700;background:var(--r6);color:#fff;margin-top:4px;white-space:nowrap}
/* ── Info strips (icell grid) ── */
.istrip{display:grid;gap:8px;margin-bottom:18px}
.istrip.c2{grid-template-columns:1fr 1fr}
.istrip.c3{grid-template-columns:1fr 1fr 1fr}
.istrip.c4{grid-template-columns:1fr 1fr 1fr 1fr}
.istrip.c5{grid-template-columns:1fr 1fr 1fr 1fr 1fr}
.istrip.c6{grid-template-columns:repeat(6,1fr)}
.icell{padding:10px 12px;background:var(--x0);border-radius:6px;border:1px solid var(--x1)}
.icell.danger{background:#fff;border-color:var(--r1);border-left:3px solid var(--r6)}
.icell.success{background:#fff;border-color:var(--g1);border-left:3px solid var(--g6)}
.icell.warn{background:#fff;border-color:var(--a1);border-left:3px solid var(--a5)}
.icell.navy{background:#fff;border-color:var(--n1);border-left:3px solid var(--n8)}
.icell .l{font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x4);margin-bottom:4px}
.icell .v{font-size:var(--fs-kpi);font-weight:700;color:var(--n9)}
.icell .v.sm{font-size:var(--fs-h3)}
.icell .v.red{color:var(--r6)}
.icell .v.green{color:var(--g6)}
.icell .v.muted{color:var(--x4)}
.icell .sub{font-size:var(--fs-label);color:var(--x5);margin-top:2px}
.icell .ajustes{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.ajuste-tag{font-size:10px;background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#64748b}
/* ── Segmento / CNAE ── */
.seg{padding:12px 16px;background:var(--n0);border-radius:6px;border:1px solid var(--n1);margin-bottom:18px;font-size:var(--fs-h3);color:var(--n7)}
.seg b{color:var(--n9)}
.seg .sec{font-size:var(--fs-body);color:var(--x5);margin-top:4px}
/* ── Mapa ── */
.map-row{display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:18px}
.map-frame{border-radius:8px;overflow:hidden;border:1px solid var(--x2);height:220px;position:relative;background:var(--x1)}
.map-frame img{width:100%;height:100%;object-fit:cover}
.addr-box{padding:16px;background:var(--x0);border-radius:8px;border:1px solid var(--x1);display:flex;flex-direction:column;justify-content:center}
.addr-box .l{font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x4);margin-bottom:8px}
.addr-box .a{font-size:var(--fs-h3);color:var(--x7);line-height:1.6}
.addr-box .t{font-size:var(--fs-body);color:var(--x5);margin-top:auto;padding-top:10px}
/* ── Sócios table (legacy) ── */
.soc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--fs-h3);border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:6px}
.soc-tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:var(--fs-label);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left}
.soc-tbl tbody td{padding:10px 14px;border-bottom:1px solid var(--x1);color:var(--x7)}
.soc-tbl tbody tr:last-child td{border-bottom:none}
.soc-extra{font-size:var(--fs-body);color:var(--x5);margin-bottom:10px}
.soc-extra b{color:var(--x9)}
/* ── Grupo econômico ── */
.ge-block{background:var(--x0);border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:18px}
.ge-header{background:var(--n9);padding:8px 14px;display:flex;justify-content:space-between;align-items:center}
.ge-header .title{font-size:var(--fs-h3);font-weight:700;color:#fff}
.ge-header .count{font-size:var(--fs-label);color:rgba(255,255,255,0.7);font-weight:500}
.ge-socio-hdr{padding:7px 14px;background:var(--n0);border-bottom:1px solid var(--n1);font-size:var(--fs-label);font-weight:700;color:var(--n7);text-transform:uppercase;letter-spacing:0.06em;display:flex;align-items:center;gap:6px}
.ge-tbl{width:100%;border-collapse:collapse;font-size:var(--fs-body)}
.ge-tbl th{padding:6px 12px;font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x4);border-bottom:1px solid var(--x1);text-align:left}
.ge-tbl td{padding:7px 12px;border-bottom:1px solid var(--x1);color:var(--x7);vertical-align:middle}
.ge-tbl tr:last-child td{border-bottom:none}
.ge-tbl .mono{font-family:'JetBrains Mono',monospace;font-size:var(--fs-tag)}
.ge-badge{display:inline-block;font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;padding:2px 7px;border-radius:3px;white-space:nowrap}
.ge-badge.ativa{background:var(--g1);color:var(--g6)}
.ge-badge.baixada{background:var(--r1);color:var(--r6)}
.ge-badge.suspensa{background:var(--a1);color:var(--a5)}
.ge-badge.inapta{background:var(--r1);color:var(--r6)}
.ge-badge.outro{background:var(--x1);color:var(--x5)}
.ge-rel{display:inline-block;font-size:var(--fs-tag);font-weight:600;padding:2px 7px;border-radius:3px;background:var(--n0);color:var(--n7);white-space:nowrap}
.ge-parentesco{display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--a0);border-top:1px solid var(--a1);font-size:var(--fs-body);color:var(--a5)}
.ge-parentesco .atag{background:var(--a1)}
/* ── Risk blocks ── */
.risk-section{background:var(--x0);border-radius:10px;border:1px solid var(--x2);padding:20px;margin-bottom:18px}
.risk-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.risk-title{font-size:var(--fs-body);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x5)}
.risk-score{font-size:var(--fs-label);font-weight:600;padding:3px 10px;border-radius:4px;background:var(--r1);color:var(--r6)}
.risk-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.risk-block{background:#fff;border-radius:8px;border:1px solid var(--x2);overflow:hidden}
.risk-block-hdr{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--x1)}
.risk-block-hdr .title{font-size:var(--fs-h3);font-weight:700;color:var(--n9)}
.risk-block-hdr .big{font-size:22px;font-weight:700}
.risk-block-hdr .big.red{color:var(--r6)}
.risk-block-hdr .big.green{color:var(--g6)}
.risk-block-body{padding:12px 14px}
.risk-detail{font-size:var(--fs-body);color:var(--x7);padding:4px 0;display:flex;justify-content:space-between}
.risk-detail .label{color:var(--x5)}
.risk-detail .val{font-weight:600}
.risk-detail .val.red{color:var(--r6)}
.risk-sep{height:1px;background:var(--x1);margin:6px 0}
.risk-tag{display:inline-block;font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;margin-right:4px}
.risk-tag.exec{background:#e8d5f5;color:#6b21a8}
.risk-tag.sust{background:var(--a1);color:var(--a5)}
.risk-tag.np{background:var(--n1);color:var(--n7)}
.risk-tag.banco{background:#dbeafe;color:#1d4ed8}
.risk-tag.fidc{background:var(--g1);color:var(--g6)}
.risk-item{font-size:var(--fs-body);color:var(--x7);padding:5px 0;border-bottom:1px solid var(--x1);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.risk-item:last-child{border-bottom:none}
.risk-item .date{color:var(--x4);font-size:var(--fs-label);min-width:70px}
.risk-item .desc{flex:1}
.risk-item .amt{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:var(--fs-body)}
.risk-item .amt.red{color:var(--r6)}
/* ── SCR strip ── */
.scr-strip{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:10px}
.scr-card{padding:8px 10px;background:#fff;border-radius:6px;border:1px solid var(--x2)}
.scr-card .l{font-size:var(--fs-tag);font-weight:600;text-transform:uppercase;color:var(--x4);margin-bottom:3px}
.scr-card .v{font-size:var(--fs-kpi);font-weight:700;color:var(--n9)}
.scr-card .v.green{color:var(--g6)}
/* ── Alerts ── */
.alert{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;font-size:var(--fs-body);margin-bottom:6px}
.alert.alta{background:var(--r0);border:1px solid var(--r1);color:var(--r6)}
.alert.mod{background:var(--a0);border:1px solid var(--a1);color:var(--a5)}
.alert.info{background:var(--n0);border:1px solid var(--n1);color:var(--n7)}
.alert.ok{background:var(--g0);border:1px solid var(--g1);color:var(--g6)}
.atag{font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;flex-shrink:0}
.alert.alta .atag{background:var(--r1)}
.alert.mod .atag{background:var(--a1)}
.alert.info .atag{background:var(--n1)}
.alert.ok .atag{background:var(--g1)}
/* ── Chart / bars ── */
.fin-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
.fin-box{background:var(--x0);border-radius:8px;border:1px solid var(--x1);padding:16px}
.fin-title{font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x5);margin-bottom:22px}
.chart{display:flex;align-items:flex-end;gap:3px;height:100px;margin-bottom:8px;overflow:visible}
/* height aumentado de 120 → 140 e adicionado padding-top de 22 pra acomodar
   o label .bar-v que sai 16px acima do topo de cada barra. Sem isso, em
   barras com altura próxima a height total, o label colidia com .fin-title
   e ficava sobreposto (caso CHR PRODUTOS MEDICOS LTDA, 2026-05-14). */
.bars{display:flex;align-items:flex-end;gap:4px;height:140px;padding-top:22px;margin-bottom:8px;overflow:visible}
.bar-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;overflow:visible}
.bar{width:100%;border-radius:3px 3px 0 0;min-height:2px;position:relative;flex-shrink:0;overflow:visible}
.bar.navy,.bar.nv{background:var(--n8)}
.bar.green,.bar.gn{background:var(--g6)}
.bar.light,.bar.lt{background:var(--n3)}
.bar-val,.bar-v{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:var(--fs-chart);color:var(--x5);white-space:nowrap;font-family:'JetBrains Mono',monospace;pointer-events:none}
.bar-lbl,.bar-l{font-size:var(--fs-tag);color:var(--x4);margin-top:4px;text-align:center;white-space:nowrap}
.kpi-row{display:flex;gap:16px;font-size:var(--fs-body);color:var(--x5);padding-top:8px;border-top:1px solid var(--x1);margin-top:8px}
.kpi-row b{color:var(--n9)}
.kpi-row .down{color:var(--r6);font-weight:600}
.kpi-row .up{color:var(--g6);font-weight:600}
/* ── SCR table ── */
.scr-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--fs-body)}
.scr-tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:var(--fs-tag);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:8px 10px;text-align:left}
.scr-tbl thead th:not(:first-child){text-align:right}
.scr-tbl tbody td{padding:7px 10px;border-bottom:1px solid var(--x1);color:var(--x7)}
.scr-tbl tbody td:not(:first-child){text-align:right;font-family:'JetBrains Mono',monospace;font-size:var(--fs-body)}
.scr-tbl tbody tr:last-child td{border-bottom:none}
.scr-tbl .total td{font-weight:700;background:var(--x0);color:var(--n9)}
.scr-tbl .var-cell.down{color:var(--g6);font-weight:600}
.scr-tbl .var-cell.up{color:var(--r6);font-weight:600}
.scr-tbl .var-cell.neutral{color:var(--x4)}
.ifs-note{font-size:var(--fs-label);color:var(--x4);margin-top:6px}
/* ── ABC table ── */
.abc-wrap{background:var(--x0);border-radius:10px;border:1px solid var(--x2);padding:16px;margin-bottom:18px}
.abc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--fs-body);margin-bottom:8px}
.abc-tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:var(--fs-tag);font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px;text-align:left}
.abc-tbl thead th.r{text-align:right}
.abc-tbl tbody td{padding:9px 12px;border-bottom:1px solid var(--x1)}
.abc-tbl tbody td.r{text-align:right;font-family:'JetBrains Mono',monospace}
.abc-tbl tbody td.bold{font-weight:600}
.abc-tbl tbody tr:last-child td{border-bottom:none}
.abc-rank{display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--n8);color:#fff;font-size:var(--fs-body);font-weight:700;align-items:center;justify-content:center}
.abc-cl{padding:2px 8px;border-radius:4px;font-size:var(--fs-label);font-weight:700}
.abc-cl.a{background:var(--r1);color:var(--r6)}
.abc-cl.b{background:var(--a1);color:var(--a5)}
.abc-cl.c{background:var(--x1);color:var(--x5)}
.abc-bar{height:5px;border-radius:3px;background:var(--n8);display:block;margin-top:3px}
.abc-summary{font-size:var(--fs-body);color:var(--x5)}
.abc-summary b{color:var(--x9)}
/* ── Pleito (legacy cards — mantido p/ compatibilidade) ── */
.pleito-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}
.pl-card{padding:12px 14px;background:var(--n0);border-radius:6px;border:1px solid var(--n1)}
.pl-card .l{font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;color:var(--x4);margin-bottom:4px}
.pl-card .v{font-size:var(--fs-kpi);font-weight:700;color:var(--n9)}
/* ── Pleito do Comitê — inputs editáveis ── */
.pc-input{width:100%;padding:3px 6px;border:1px solid var(--n2);border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:var(--fs-body);text-align:right;color:var(--n9);background:#fff;outline:none;box-sizing:border-box}
.pc-input:hover{border-color:var(--cf-primary)}
.pc-input:focus{border-color:var(--cf-primary);box-shadow:0 0 0 2px rgba(26,43,94,.08)}
.pc-input.saving{border-color:#f59e0b;background:#fffbeb}
.pc-input.saved{border-color:#10b981;background:#ecfdf5}
.pc-input.error{border-color:#ef4444;background:#fef2f2}
@media print{.pc-input{border:none!important;background:transparent!important;box-shadow:none!important;padding:0!important}}
.pc-download-btn,.pc-view-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:5px;font-size:11px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;transition:background .15s,transform .1s,border-color .15s}
.pc-download-btn{background:#1a2b5e;color:#fff;border:1px solid #1a2b5e;box-shadow:0 1px 3px rgba(15,23,42,.1)}
.pc-download-btn:hover{background:#243a80;border-color:#243a80;transform:translateY(-1px)}
.pc-download-btn:active{transform:translateY(0)}
.pc-download-btn:disabled,.pc-view-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
.pc-view-btn{background:#fff;color:#1a2b5e;border:1px solid #cbd5e1}
.pc-view-btn:hover{background:#f1f5f9;border-color:#1a2b5e;transform:translateY(-1px)}
.pc-view-btn:active{transform:translateY(0)}
@media print{.pc-download-btn,.pc-view-btn{display:none!important}}
/* ── Análise (pontos fortes/fracos) ── */
.ana-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px}
.ana-col{border-radius:8px;padding:14px 16px}
.ana-col.f{background:var(--g0);border:1px solid var(--g1)}
.ana-col.w{background:var(--r0);border:1px solid var(--r1)}
.ana-col.a{background:var(--a0);border:1px solid var(--a1)}
.ana-col.n{background:var(--x0);border:1px solid var(--x1)}
.ana-h{font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.06)}
.ana-col.f .ana-h{color:var(--g6)}
.ana-col.w .ana-h{color:var(--r6)}
.ana-col.a .ana-h{color:var(--a5)}
.ana-col.n .ana-h{color:var(--x5)}
.ana-item,.ana-i{font-size:var(--fs-body);color:var(--x7);padding:3px 0;line-height:1.5}
.ana-item::before{content:'•';margin-right:6px;font-weight:700}
.ana-col.f .ana-item::before{color:var(--g6)}
.ana-col.w .ana-item::before{color:var(--r6)}
.ana-col.a .ana-item::before{color:var(--a5)}
/* ── Percepção / Parecer ── */
.perc{padding:16px 18px;background:var(--x0);border-radius:8px;border:1px solid var(--x2)}
.perc p,.perc-text{font-size:var(--fs-h3);color:var(--x7);line-height:1.7}
.perc-rec{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--x2);font-size:var(--fs-body);color:var(--x5)}
/* ── Generic table (.tbl) ── */
.tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--fs-body);border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:10px}
.tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:var(--fs-label);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left}
.tbl thead th.r{text-align:right}
.tbl tbody td{padding:9px 14px;border-bottom:1px solid var(--x1);color:var(--x7)}
.tbl tbody td.r{text-align:right;font-family:'JetBrains Mono',monospace}
.tbl tbody td.b{font-weight:600;color:var(--x9)}
.tbl tbody td.red{color:var(--r6);font-weight:600}
.tbl tbody td.green{color:var(--g6);font-weight:600}
.tbl tbody tr:last-child td{border-bottom:none}
.tbl tbody tr:nth-child(even){background:var(--x0)}
.tbl .total td{font-weight:700;background:var(--n0);color:var(--n9)}
/* ── Conformidade ── */
.pf-row{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--x1);border-radius:0;transition:background 0.1s}
.pf-row:first-child{border-radius:8px 8px 0 0}
.pf-row:last-child{border-bottom:none;border-radius:0 0 8px 8px}
.pf-row.pass-row{border-left:3px solid var(--g6);background:#fff}
.pf-row.fail-row{border-left:3px solid var(--r6);background:var(--r0)}
.pf-row.warn-row{border-left:3px solid var(--a5);background:var(--a0)}
.pf-icon{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:var(--fs-h3);font-weight:700;flex-shrink:0}
.pf-icon.pass{background:var(--g1);color:var(--g6)}
.pf-icon.fail{background:var(--r1);color:var(--r6)}
.pf-icon.warn{background:var(--a1);color:var(--a5)}
.pf-name{flex:1;font-size:var(--fs-h3);color:var(--x9);font-weight:500}
.pf-tag{display:inline-block;font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;background:var(--r1);color:var(--r6);margin-left:6px;vertical-align:middle;letter-spacing:0.05em}
.pf-meta{display:flex;gap:14px;flex-shrink:0}
.pf-lim,.pf-act{text-align:right;min-width:90px}
.pf-lim .lbl,.pf-act .lbl{font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;color:var(--x4);margin-bottom:2px;letter-spacing:0.06em}
.pf-lim .val{font-size:var(--fs-body);color:var(--x7);font-family:'JetBrains Mono',monospace}
.pf-act .val{font-size:var(--fs-h3);font-weight:700}
.pf-act .val.pass{color:var(--g6)}
.pf-act .val.fail{color:var(--r6)}
.pf-act .val.warn{color:var(--a5)}
.pf-note{font-size:var(--fs-label);color:var(--r6);margin-top:2px}
.pf-val .v{font-weight:600}
.pf-val .v.pass{color:var(--g6)}
.pf-val .v.fail{color:var(--r6)}
.crit-box{border:1px solid var(--x2);border-radius:10px;overflow:hidden;margin-bottom:14px}
/* ── Verdict ── */
.verdict{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-radius:10px;margin-top:14px;gap:16px}
.verdict.fail{background:var(--r0);border:2px solid var(--r1)}
.verdict.pass{background:var(--g0);border:2px solid var(--g1)}
.verdict .vt{font-size:var(--fs-kpi);font-weight:700;color:var(--x9)}
.verdict .vs{font-size:var(--fs-label);color:var(--x5);margin-top:3px}
.verdict .vb{padding:8px 20px;border-radius:6px;font-size:var(--fs-body);font-weight:700;text-transform:uppercase;color:#fff;letter-spacing:0.04em;flex-shrink:0}
.verdict.fail .vb{background:var(--r6)}
.verdict.pass .vb{background:var(--g6)}
/* ── Checklist / doc-grid ── */
.doc-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:14px}
.doc-grid .pf-row{padding:9px 14px;border-bottom:1px solid var(--x1);margin:0;border-radius:0}
.doc-grid .pf-row:nth-child(odd){border-right:1px solid var(--x1)}
.doc-grid .pf-row.present{border-left:3px solid var(--g6)}
.doc-grid .pf-row.absent{border-left:3px solid var(--a5)}
.doc-grid .pf-row.absent-obr{border-left:3px solid var(--r6);background:var(--r0)}
.prog-outer{height:8px;border-radius:4px;background:var(--x2);margin:8px 0 16px;overflow:hidden}
.prog-inner{height:100%;border-radius:4px;background:var(--gl)}
/* ── Mapa interativo ── */
.map-interactive{margin-bottom:18px;border-radius:10px;overflow:hidden;border:1px solid var(--x2)}
.map-interactive iframe{display:block;width:100%;height:300px;border:0}
@media print{.map-interactive{display:none!important}}
@media screen{.map-static-pdf{display:none!important}}
/* ── Chart box ── */
.chart-box{background:var(--x0);border-radius:8px;border:1px solid var(--x1);padding:18px;margin-bottom:14px}
.chart-title{font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x5);margin-bottom:14px}
/* ── Proportion bars ── */
.prop-row{display:flex;align-items:center;gap:10px;padding:6px 0}
.prop-label{font-size:var(--fs-body);width:200px;color:var(--x7)}
.prop-fill{height:6px;border-radius:3px;background:var(--n8)}
.prop-fill.red{background:var(--r6)}
.prop-pct{font-size:var(--fs-body);font-weight:600;color:var(--x5);min-width:60px}
/* ── Misc ── */
.avatar{width:36px;height:36px;border-radius:50%;background:var(--n0);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:var(--fs-kpi);color:var(--n8);flex-shrink:0}
.inf{font-size:var(--fs-body);color:var(--x5);margin-bottom:12px}
.inf b{color:var(--x9)}
.badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:var(--fs-label);font-weight:700;text-transform:uppercase}
.badge-manual{display:inline-block;font-size:11px;color:#2563eb;background:#eff6ff;padding:2px 8px;border-radius:4px;margin-bottom:6px;font-weight:600}
.badge.red{background:var(--r6);color:#fff}
.badge.green{background:var(--g6);color:#fff}
.badge.amber{background:var(--a5);color:#fff}
.pb{border-top:2px dashed var(--x3);margin:28px 0;position:relative}
.pb::after{content:attr(data-label);position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#fff;padding:0 12px;font-size:var(--fs-label);color:var(--x4)}
.dist-bar{height:5px;border-radius:3px;background:var(--n8);display:inline-block;vertical-align:middle}
.dist-bar.red{background:var(--r6)}
.kpi-snap{display:grid;gap:8px;margin-bottom:14px}
.kpi-snap.c4{grid-template-columns:repeat(4,1fr)}
/* ── Síntese Preliminar — versão compacta para print ────────────────────────── */
@media print{
  .s-wrap{font-size:10px}
  .s-wrap .stitle{margin:8px 0 5px}
  .s-wrap .stitle:first-child{margin-top:0}
  .s-wrap .emp{padding-bottom:10px;margin-bottom:10px}
  .s-wrap .emp-name{font-size:14px}
  .s-wrap .rat-c{width:54px;height:54px}
  .s-wrap .rat-n{font-size:19px}
  .s-wrap .istrip{gap:4px;margin-bottom:8px}
  .s-wrap .icell{padding:5px 8px}
  .s-wrap .icell .v{font-size:10.5px}
  .s-wrap .icell .l{font-size:7.5px}
  .s-wrap .icell .sub{font-size:7.5px}
  .s-wrap .seg{padding:7px 11px;margin-bottom:8px;font-size:10px}
  .s-wrap .map-frame{height:120px!important}
  .s-wrap .addr-box{margin-bottom:10px;padding:10px 12px}
  .s-wrap .addr-box .a{font-size:10px}
  .s-wrap .soc-tbl thead th{padding:5px 10px;font-size:8px}
  .s-wrap .soc-tbl tbody td{padding:4px 10px;font-size:10px}
  .s-wrap .soc-extra{font-size:8.5px;margin-bottom:6px}
  .s-wrap .ge-header{padding:5px 10px}
  .s-wrap .ge-socio-hdr{padding:4px 10px;font-size:9px}
  .s-wrap .ge-tbl th{padding:3px 8px;font-size:7.5px}
  .s-wrap .ge-tbl td{padding:3px 8px;font-size:9.5px}
  .s-wrap .risk-section{padding:10px;margin-bottom:10px}
  .s-wrap .risk-cols{gap:7px;margin-bottom:8px}
  .s-wrap .risk-block-hdr{padding:5px 10px}
  .s-wrap .risk-block-hdr .big{font-size:16px}
  .s-wrap .risk-block-body{padding:5px 10px}
  .s-wrap .risk-detail{padding:2px 0;font-size:9.5px}
  .s-wrap .risk-sep{margin:2px 0}
  .s-wrap .risk-item{padding:3px 0;font-size:9.5px}
  .s-wrap .scr-strip{gap:4px;margin-bottom:6px}
  .s-wrap .scr-card{padding:5px 8px}
  .s-wrap .scr-card .v{font-size:10.5px}
  .s-wrap .fin-row{gap:8px;margin-bottom:10px}
  .s-wrap .fin-box{padding:10px}
  .s-wrap .bars{height:65px!important}
  .s-wrap .bar{min-height:1px}
  .s-wrap .bar-v{font-size:6.5px;top:-13px}
  .s-wrap .bar-l{font-size:6.5px}
  .s-wrap .kpi-row{padding-top:5px;margin-top:4px;font-size:9px}
  .s-wrap .tbl thead th{padding:5px 10px;font-size:8px}
  .s-wrap .tbl tbody td{padding:4px 10px;font-size:9.5px}
  .s-wrap .scr-tbl thead th{padding:4px 8px;font-size:7.5px}
  .s-wrap .scr-tbl tbody td{padding:3px 8px;font-size:9.5px}
  .s-wrap .abc-wrap{padding:10px;margin-bottom:8px}
  .s-wrap .abc-tbl thead th{padding:4px 8px;font-size:7.5px}
  .s-wrap .abc-tbl tbody td{padding:3px 8px;font-size:9.5px}
  .s-wrap .ana-grid{gap:5px;margin-bottom:10px}
  .s-wrap .ana-col{padding:7px 9px}
  .s-wrap .ana-h{margin-bottom:5px;padding-bottom:4px;font-size:8px}
  .s-wrap .ana-item{padding:2px 0;font-size:9.5px}
  .s-wrap .perc{padding:9px 11px}
  .s-wrap .perc-text,.s-wrap .perc p{font-size:9.5px;line-height:1.55}
  .s-wrap .perc-rec{margin-top:7px;padding-top:6px;font-size:9px}
  .s-wrap .alert{padding:5px 10px;margin-bottom:4px;font-size:9.5px}
}
</style>`;

// ─── Page 1: Capa ─────────────────────────────────────────────────────────────
function pageCapa(params: PDFReportParams, date: string): string {
  const d = params.data;
  const cnpj = d.cnpj;
  const score = params.finalRating ?? 0;
  const sc = scoreColor(score);
  const sb = scoreBorder(score);
  const decBg = decisionBg(params.decision ?? "");
  const ratingLabel = score >= 8 ? "Baixo Risco" : score >= 5 ? "Risco Moderado" : "Alto Risco";

  // Data por extenso (ex: 15 de abril de 2026)
  const now = new Date();
  const MESES_EXT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const dateExt = `${now.getDate()} de ${MESES_EXT[now.getMonth()]} de ${now.getFullYear()}`;

  // Código de verificação — últimos 8 chars do CNPJ sem formatação + score
  const cnpjRaw = (cnpj?.cnpj ?? "").replace(/\D/g,"");
  const verCode = cnpjRaw.length >= 8 ? `${cnpjRaw.slice(0,4)}-${cnpjRaw.slice(4,8)}-${score.toFixed(1).replace(".","")}-CF` : "CF-2026";

  return `
<div class="page page-capa" style="background:var(--n8);min-height:700px;display:flex;flex-direction:column;padding:0;position:relative;overflow:hidden">
  <!-- topo: barra com logo -->
  <div style="padding:32px 48px 0;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:22px;font-weight:700;color:#fff">capital<span style="color:#73b815">finanças</span></div>
    <div style="font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.12em">ANÁLISE DE CRÉDITO · DUE DILIGENCE</div>
  </div>

  <!-- divisor verde -->
  <div style="height:2px;background:linear-gradient(90deg,#73b815,rgba(115,184,21,0.3));margin:28px 48px"></div>

  <!-- bloco central -->
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 48px">
    <div style="font-size:11px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.18em;margin-bottom:18px">Relatório de Crédito</div>
    <div style="font-size:26px;font-weight:700;color:#fff;max-width:500px;line-height:1.25">${esc(cnpj?.razaoSocial ?? "—")}</div>
    ${cnpj?.nomeFantasia ? `<div style="font-size:13px;color:rgba(255,255,255,0.45);margin-top:6px">${esc(cnpj.nomeFantasia)}</div>` : ""}
    <div style="font-size:12px;font-family:'JetBrains Mono',monospace;color:rgba(255,255,255,0.4);margin-top:10px">CNPJ: ${fmtCnpj(cnpj?.cnpj)}</div>

    <!-- Score principal -->
    ${HIDE_AVALIACAO ? `<div style="margin-top:36px">${BANNER_CALIBRACAO}</div>` : (params.scoreV2 ? (() => {
      const v2 = params.scoreV2!;
      const ratingCores: Record<string, string> = { A:"#16a34a", B:"#65a30d", C:"#d97706", D:"#ea580c", E:"#dc2626", F:"#991b1b" };
      const v2cor = ratingCores[v2.rating] ?? "#6b7280";
      const confiancaLabel = v2.confianca_score === "alta" ? "Alta confiança" : v2.confianca_score === "parcial" ? "Confiança parcial" : "Confiança baixa";
      return `<div style="margin-top:36px;display:flex;flex-direction:column;align-items:center;gap:10px">
        <div style="display:flex;align-items:center;gap:16px">
          <div style="width:100px;height:100px;border-radius:50%;border:4px solid ${v2cor};display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05)">
            <div style="font-size:40px;font-weight:900;color:${v2cor};line-height:1">${v2.rating}</div>
          </div>
          <div style="text-align:left">
            <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Score V2</div>
            <div style="font-size:28px;font-weight:800;color:${v2cor};line-height:1">${v2.score_final.toFixed(0)}<span style="font-size:14px;font-weight:500;color:rgba(255,255,255,0.35)">&nbsp;/ 100 pts</span></div>
            <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:4px">${confiancaLabel}</div>
          </div>
        </div>
        <div style="padding:6px 22px;border-radius:5px;font-size:12px;font-weight:700;background:${decBg};color:#fff;letter-spacing:0.03em;white-space:nowrap">${fmtDecision(params.decision)}</div>
        ${score > 0 ? `<div style="font-size:10px;color:rgba(255,255,255,0.3)">Opinião IA: ${score.toFixed(1)}/10</div>` : ""}
      </div>`;
    })() : `<div style="margin-top:36px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <div style="width:100px;height:100px;border-radius:50%;border:4px solid ${sb};display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05)">
        <div style="font-size:36px;font-weight:700;color:${sc};line-height:1">${score.toFixed(1)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.35)">/10</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:${sc}">${esc(ratingLabel)}</div>
      <div style="padding:6px 22px;border-radius:5px;font-size:12px;font-weight:700;background:${decBg};color:#fff;letter-spacing:0.03em;white-space:nowrap">${fmtDecision(params.decision)}</div>
    </div>`)}

    <!-- Comitê -->
    ${params.committeMembers ? `<div style="margin-top:24px;font-size:10px;color:rgba(255,255,255,0.3)">Comitê: ${esc(params.committeMembers)}</div>` : ""}
  </div>

  <!-- rodapé -->
  <div style="padding:20px 48px 28px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(255,255,255,0.08)">
    <div>
      <div style="font-size:10px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.1em">Data de emissão</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.55);margin-top:2px">${esc(dateExt || date)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.1em">Cód. verificação</div>
      <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:rgba(255,255,255,0.4);margin-top:2px">${esc(verCode)}</div>
    </div>
  </div>
</div>`;
}

// ─── Page 2: Síntese Preliminar ───────────────────────────────────────────────
function pageSintese(params: PDFReportParams, date: string): string {
  // Recalcula CP/LP/Total a partir das faixas. Protege contra dados antigos no banco
  // com carteiraCurtoPrazo gravado errado (versão pre-fix do adapter SCR).
  if (params.data?.scr) params.data.scr = recomputeSCRTotals(params.data.scr);
  if (params.data?.scrAnterior) params.data.scrAnterior = recomputeSCRTotals(params.data.scrAnterior);
  const d = params.data;
  const cnpj = d.cnpj;
  const score = params.finalRating ?? 0;
  const sc = scoreColor(score);
  const sb = scoreBorder(score);
  const decBg = decisionBg(params.decision ?? "");
  const ratingLabel = score >= 8 ? "Baixo Risco" : score >= 5 ? "Risco Moderado" : "Alto Risco";
  const isAtiva = (cnpj?.situacaoCadastral ?? "").toUpperCase().includes("ATIVA");

  // Info strip values
  // municipio/uf may be embedded in the endereco field
  const endStr = cnpj?.endereco ?? "";
  const localMatch = endStr.match(/([A-Za-zÀ-ÿ\s]+)\/([A-Z]{2})\b/);
  const local = localMatch ? `${localMatch[1].trim()}/${localMatch[2]}` : endStr.split(",").pop()?.trim() ?? "";
  const capitalSocial = d.qsa?.capitalSocial || cnpj?.capitalSocialCNPJ || "—";

  // Sócios — CPF normalizado (só dígitos) para evitar mismatch entre
  // "123.456.789-10" (IR) e "12345678910" (QSA) ou variantes.
  const normCpf = (v: string | undefined | null) => (v ?? "").replace(/\D/g, "");
  const normNome = (v: string | undefined | null) => (v ?? "").toUpperCase().trim().replace(/\s+/g, " ");
  const socios = d.qsa?.quadroSocietario ?? [];

  // Patrimônio líquido: IR dos sócios, chaveado por CPF
  const irMap: Record<string, string> = {};
  (d.irSocios ?? []).forEach(ir => {
    const k = normCpf(ir.cpf);
    if (k) irMap[k] = ir.patrimonioLiquido;
  });

  // Enriquecimento via Contrato Social: CPF e participação quando ausentes no QSA
  const contratoMap: Record<string, { cpf: string; participacao: string }> = {};
  (d.contrato?.socios ?? []).forEach((cs: { nome?: string; cpf?: string; participacao?: string }) => {
    const k = normNome(cs.nome);
    if (k) contratoMap[k] = { cpf: normCpf(cs.cpf), participacao: cs.participacao ?? "" };
  });

  // Participação via IR das sociedades (fallback final)
  const cnpjEmpresa = normCpf(d.cnpj?.cnpj);
  const irPartMap: Record<string, string> = {};
  (d.irSocios ?? []).forEach(ir => {
    const cpfK = normCpf(ir.cpf);
    if (!cpfK) return;
    const soc = (ir.sociedades ?? []).find((s: { cnpj?: string; participacao?: string }) => normCpf(s.cnpj) === cnpjEmpresa);
    if (soc?.participacao) irPartMap[cpfK] = soc.participacao;
  });

  // Deduplicate by normalized name — merges two rows for the same person (e.g. one with CPF, one with participation)
  const seenSocios = new Map<string, typeof socios[0]>();
  socios.forEach(s => {
    const k = normNome(s.nome);
    if (!k) return;
    const ex = seenSocios.get(k);
    if (!ex) {
      seenSocios.set(k, s);
    } else {
      const mergedCpf = normCpf(ex.cpfCnpj ?? "").length >= 11 ? ex.cpfCnpj : (s.cpfCnpj || ex.cpfCnpj);
      const mergedPart = ex.participacao || s.participacao;
      const rawQual = ex.qualificacao || s.qualificacao || "";
      seenSocios.set(k, { ...ex, cpfCnpj: mergedCpf, participacao: mergedPart, qualificacao: rawQual });
    }
  });

  const socRows = Array.from(seenSocios.values()).map(s => {
    const nomeKey = normNome(s.nome);
    const contratoEntry = contratoMap[nomeKey];

    // CPF/CNPJ: QSA → Contrato Social (fallback)
    const cpfRaw = normCpf(s.cpfCnpj ?? "").length >= 11
      ? s.cpfCnpj
      : (contratoEntry?.cpf ? contratoEntry.cpf : s.cpfCnpj);
    const cpfK = normCpf(cpfRaw ?? "");

    // Participação: QSA → Contrato Social → IR sociedades (fallback)
    const part = s.participacao || contratoEntry?.participacao || irPartMap[cpfK] || "—";

    // Strip leading QSA numeric code prefix (e.g. "49-Sócio-Administrador" → "Sócio-Administrador")
    const cleanQual = (s.qualificacao ?? "").replace(/^\d{1,3}[-\s]+/, "").trim();

    // Patrimônio Líq. do IR; fallback: renda presumida Assertiva ou faixa BDC
    const plIR = irMap[cpfK];
    const rendaAss = (s as any).rendaPresumida as string | undefined;
    const incomeRange = (s as any).estimatedIncomeRange as string | undefined;
    const assetsRange = (s as any).totalAssetsRange as string | undefined;
    const pl = plIR
      ? `<span style="font-weight:700">${fmtMoneyAbr(plIR)}</span>`
      : rendaAss
        ? `<span style="color:var(--a5);font-size:10px" title="Renda mensal presumida — Assertiva (sem IR enviado)">~${fmtMoneyAbr(rendaAss)}<span style="font-size:8px;color:var(--x4)">/mês est.</span></span>`
        : (incomeRange || assetsRange)
          ? (() => {
              const SM_2026 = 1518;
              const raw = (incomeRange ?? assetsRange ?? "").toUpperCase().replace(/\s+/g, " ").trim();
              const m = raw.match(/^(\d+)\s*[AaÀà]\s*(\d+)\s*SM/);
              if (m) {
                const min = Math.round(parseInt(m[1]) * SM_2026 / 1000);
                const max = Math.round(parseInt(m[2]) * SM_2026 / 1000);
                return `<span style="font-weight:600;color:var(--x7)">R$ ${min}k – R$ ${max}k</span><br><span style="font-size:9px;color:var(--x4)">BDC · faixa estimada (sem IR)</span>`;
              }
              return `<span style="color:var(--x4);font-size:10px">${esc(raw)}</span><br><span style="font-size:9px;color:var(--x4)">BDC · faixa estimada</span>`;
            })()
          : "—";
    const obitBadge = (s as any).hasObitIndication
      ? `<span style="display:inline-block;margin-left:5px;padding:1px 5px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:0.05em;vertical-align:middle">ÓBITO</span>`
      : "";
    const cpfStatus = (s as any).taxIdStatus as string | undefined;
    const cpfBadge = cpfStatus && cpfStatus !== "REGULAR"
      ? `<span style="display:inline-block;margin-left:5px;padding:1px 5px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:0.05em;vertical-align:middle">CPF ${esc(cpfStatus.replace(/_/g, " "))}</span>`
      : "";
    const scorePFVal = (s as any).scoreAssertivaPF as number | undefined;
    const scorePFBadge = (scorePFVal ?? 0) > 0
      ? `<span style="display:inline-block;margin-left:5px;padding:1px 5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:0.05em;vertical-align:middle">SCORE ${scorePFVal}</span>`
      : "";
    const validacao = (s as any).validacaoIdentidade as string | undefined;
    const validacaoBadge = validacao === "reprovado"
      ? `<span style="display:inline-block;margin-left:5px;padding:1px 5px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:0.05em;vertical-align:middle">ID REPROVADA</span>`
      : validacao === "alerta"
        ? `<span style="display:inline-block;margin-left:5px;padding:1px 5px;background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;border-radius:3px;font-size:8.5px;font-weight:700;letter-spacing:0.05em;vertical-align:middle">ID ALERTA</span>`
        : "";
    return `<tr><td><b>${esc(s.nome)}</b>${obitBadge}${cpfBadge}${scorePFBadge}${validacaoBadge}</td><td style="font-family:'JetBrains Mono',monospace;font-size:11px">${fmtCpf(cpfRaw)}</td><td>${esc(cleanQual)}</td><td style="color:var(--x4)">${fmt(part)}</td></tr>`;
  }).join("");

  // SCR cards — usa helper único `calcScrTotal` (carteira+vencidos+prejuízos)
  // para garantir consistência com comparativo, alavancagem e score V2.
  // Detalhes do bug CRAVINFOODS em lib/scrTotal.ts.
  const scr = d.scr;
  const totalNum = calcScrTotal(scr);
  const totalDivida = totalNum > 0
    ? totalNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (scr?.totalDividasAtivas || scr?.carteiraAVencer || "—");
  const vencidos = scr?.vencidos ?? "—";
  const vencNum = numVal(vencidos);
  const pctVencido = totalNum > 0 && vencNum >= 0 ? ((vencNum / totalNum) * 100).toFixed(1) + "%" : "0,0%";
  const nIfs = scr?.qtdeInstituicoes ?? "—";
  // Prejuízo SCR (write-off Bacen) — indicador crítico de crédito
  const prejuizoSCR = scr?.prejuizos ?? "—";
  const prejuizoSCRNum = numVal(prejuizoSCR);
  // Dívida Ativa — vem do upload manual de certidão (data.dividaAtiva).
  // Quando analista subiu certidão NADA CONSTA, certidaoNegativa=true.
  const dividaAtiva = d.dividaAtiva;
  const dividaAtivaTemDados = !!dividaAtiva;
  const dividaAtivaNum = dividaAtiva ? numVal(dividaAtiva.valorTotal) : 0;
  const dividaAtivaNegativa = !!dividaAtiva?.certidaoNegativa;
  const fmmNumVal = numVal(d.faturamento?.fmm12m ?? d.faturamento?.mediaAno ?? "0");
  const alavAtual = params.alavancagem ?? (fmmNumVal > 0 ? totalNum / fmmNumVal : 0);
  const alavStr = alavAtual > 0 ? alavAtual.toFixed(2) + "x" : "—";

  // Protestos
  const prot = d.protestos;
  const protQtd = numVal(prot?.vigentesQtd ?? "0");
  const protVal = prot?.vigentesValor ?? "0";
  const protColor = protQtd > 0 ? "red" : "green";
  const protDetails = (prot?.detalhes ?? []).slice(0, 4);
  const protRows = protDetails.map(p => {
    const tag = (p.especie ?? "").toLowerCase().includes("prom") ? "np" :
                (p.apresentante ?? "").toLowerCase().includes("banco") || (p.apresentante ?? "").toLowerCase().includes("bradesco") || (p.apresentante ?? "").toLowerCase().includes("itaú") ? "banco" :
                (p.especie ?? "").toLowerCase().includes("sust") ? "sust" : "exec";
    const tagLabel = tag === "np" ? "Nota Prom." : tag === "banco" ? "Banco" : tag === "sust" ? "Sustação" : "Execução";
    return `<div class="risk-item"><span class="risk-tag ${tag}">${tagLabel}</span><span class="desc">${esc(p.credor)}</span><span class="amt red">${fmtMoney(p.valor)}</span></div>`;
  }).join("");
  const lastProt = (prot?.detalhes ?? []).filter(p => !p.regularizado)[0];

  // Processos
  // procTotal = polo passivo + polo ativo (decisão produto 2026-05-10).
  // Antes mostrava só passivo no número grande; agora soma os dois pra
  // dar visão completa de litigiosidade. Polo passivo continua sendo
  // o número crítico pra cor (subtítulo abaixo separa os dois).
  const proc = d.processos;
  const procPassivo = numVal(proc?.poloPassivoQtd ?? proc?.passivosTotal ?? "0");
  const procAtivo = numVal(proc?.poloAtivoQtd ?? proc?.ativosTotal ?? "0");
  const procTotal = procPassivo + procAtivo;
  const procColor = procPassivo > 5 ? "red" : procPassivo > 0 ? "red" : "green";
  const procDist = (proc?.distribuicao ?? []).slice(0, 4);
  const procDistRows = procDist.map(p => {
    const tipoLc2 = (p.tipo ?? "").toLowerCase();
    const tag2 = tipoLc2.includes("fiscal") ? "exec" :
                 tipoLc2.includes("banco") || tipoLc2.includes("fidc") ? "banco" :
                 tipoLc2.includes("trab") ? "np" : "sust";
    const tagLabel2 = tag2 === "exec" ? "FISCAL" : tag2 === "banco" ? "BANCO" : tag2 === "np" ? "TRAB" : "CÍVEL";
    return `<div class="risk-item"><span class="risk-tag ${tag2}">${tagLabel2}</span><span class="desc">${esc(p.tipo)}</span><span class="amt red">${esc(p.qtd)} proc.</span></div>`;
  }).join("");
  const lastProc = (proc?.top10Recentes ?? [])[0];

  // CCF
  const ccfQtd = d.ccf?.qtdRegistros ?? 0;
  const ccfBancos = d.ccf?.bancos ?? [];
  let ccfBlock = "";
  if (ccfQtd === 0) {
    ccfBlock = `<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--g0);border:1px solid var(--g1);border-radius:6px;margin-top:6px">
      <span style="font-size:16px">✓</span>
      <span style="font-size:var(--fs-body);color:var(--g6);font-weight:600">Nenhum CCF vigente</span>
    </div>`;
  } else {
    const ccfRows = ccfBancos.length > 0
      ? ccfBancos.map(b => `<tr>
          <td>${esc(b.banco)}</td>
          <td>${esc(b.agencia ?? "—")}</td>
          <td style="text-align:center;color:var(--r6);font-weight:700">${b.quantidade}</td>
          <td>${b.dataUltimo ? fmtDate(b.dataUltimo) : "—"}</td>
          <td style="font-size:var(--fs-tag);color:var(--x5)">${esc(b.motivo ?? "—")}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" style="text-align:center;color:var(--x4)">${ccfQtd} registro(s) — detalhes não disponíveis</td></tr>`;
    ccfBlock = `<table class="tbl" style="margin-top:6px">
      <thead><tr><th>Banco</th><th>Agência</th><th style="text-align:center">Qtd.</th><th>Último</th><th>Motivo</th></tr></thead>
      <tbody>${ccfRows}</tbody>
    </table>`;
  }

  // Alerts from params
  const alertsHtml = (params.alertsHigh ?? []).slice(0, 4).map(a => {
    const cls = a.severity === "CRÍTICO" ? "alta" : a.severity === "RESTRITIVO" ? "mod" : "info";
    const tag3 = a.severity === "CRÍTICO" ? "CRÍTICO" : a.severity === "RESTRITIVO" ? "RESTRITIVO" : "OBSERVAÇÃO";
    return `<div class="alert ${cls}"><span class="atag">${tag3}</span> ${esc(a.message)}</div>`;
  }).join("");

  // Faturamento chart
  const fatMeses = sortMesCrono(d.faturamento?.meses ?? []).slice(-12);
  const fatBars = fatMeses.length > 0 ? buildBars(fatMeses, 90) : "";
  // Defensivo 2026-05-12: recalcula total12 e FMM direto dos meses
  // visíveis, em vez de ler somatoriaAno/fmm12m do banco. Garante que o
  // total bate com a soma das barras (bug histórico: fillDefaults filtrava
  // meses sem ano e somatoriaAno ficava muito menor que a soma real
  // visualizável — caso GLOBOPACK 36.481.684/0001-38: barra mostrava
  // 12 meses somando ~30M mas relatório dizia "Total 12M: 7,50M").
  const fatSomaVis = fatMeses.reduce((s, m) => s + numVal(m.valor), 0);
  const fatFMMVis  = fatMeses.length > 0 ? fatSomaVis / fatMeses.length : 0;
  const fmm = fatMeses.length > 0 ? String(fatFMMVis) : (d.faturamento?.fmm12m ?? d.faturamento?.mediaAno ?? "—");
  const total12 = fatMeses.length > 0 ? String(fatSomaVis) : (d.faturamento?.somatoriaAno ?? "—");
  const tendencia = d.faturamento?.tendencia ?? "indefinido";
  const tendLabel = tendencia === "crescimento" ? "↑ crescimento" : tendencia === "queda" ? "↓ queda" : "→ estável";
  const tendColor = tendencia === "crescimento" ? "var(--g6)" : tendencia === "queda" ? "var(--r6)" : "var(--x5)";

  // SCR table
  const scrAnt = d.scrAnterior;
  let scrTable = "";
  if (scr && scrAnt) {
    // Sort by period: scrCur = more recent (Atual), scrPrv = older (Anterior).
    // Antes parseava só "MM/YYYY" (BACEN); DataBox360 retorna "YYYY-MM" e caía em 0,
    // gerando ordem indeterminada na comparação. periodoRefToKey aceita ambos.
    const kCur = periodoRefToKey(scr.periodoReferencia);
    const kAnt = periodoRefToKey(scrAnt.periodoReferencia);
    const scrCur = kCur >= kAnt ? scr : scrAnt;
    const scrPrv = kCur >= kAnt ? scrAnt : scr;
    // Compute totals from components (BACEN Responsabilidade Total = A Vencer + Vencidos + Prejuízos)
    const calcScrTotal = (s: typeof scr) => numVal(s.carteiraCurtoPrazo || s.carteiraAVencer || "0") + numVal(s.carteiraLongoPrazo || "0") + numVal(s.vencidos || "0") + numVal(s.prejuizos || "0");
    type SCRRow = {label:string;curr:string;prev:string;varCls:string;varVal:string};
    const mkRow = (label:string, currV:string|null|undefined, prevV:string|null|undefined, fmt2:(v:string|number|null|undefined)=>string, higherIsBad:boolean): SCRRow => {
      const v = scrVar(currV, prevV, higherIsBad);
      return {label, curr:fmt2(currV), prev:fmt2(prevV), varCls:v.cls, varVal:v.val};
    };
    const rows: SCRRow[] = [
      mkRow("Curto Prazo",  scrCur.carteiraCurtoPrazo,  scrPrv.carteiraCurtoPrazo,  fmtMoneyAbr, true),
      mkRow("Longo Prazo",  scrCur.carteiraLongoPrazo,  scrPrv.carteiraLongoPrazo,  fmtMoneyAbr, true),
      mkRow("Vencidos",     scrCur.vencidos,             scrPrv.vencidos,             fmtMoneyAbr, true),
      mkRow("Prejuízos",    scrCur.prejuizos,            scrPrv.prejuizos,            fmtMoneyAbr, true),
      mkRow("Limite Créd.", scrCur.limiteCredito,        scrPrv.limiteCredito,        fmtMoneyAbr, false),
    ];
    const totalCurN = calcScrTotal(scrCur);
    const totalPrvN = calcScrTotal(scrPrv);
    const vTotal = scrVar(String(totalCurN), String(totalPrvN), true);
    const totalRows = `<tr class="total"><td>Total Dívidas</td><td>${fmtMoneyAbr(totalPrvN)}</td><td>${fmtMoneyAbr(totalCurN)}</td><td class="var-cell ${vTotal.cls}">${esc(vTotal.val)}</td></tr>`;
    const alavCurN = fmmNumVal > 0 ? totalCurN / fmmNumVal : 0;
    const alavPrvN = fmmNumVal > 0 ? totalPrvN / fmmNumVal : 0;
    const alavVarR = alavPrvN > 0 ? ((alavCurN - alavPrvN) / Math.abs(alavPrvN)) * 100 : 0;
    const alavVarCls = Math.abs(alavVarR) < 0.5 ? "neutral" : alavVarR > 0 ? "up" : "down";
    const alavVarStr = Math.abs(alavVarR) < 0.5 ? "—" : alavVarR > 0 ? `+${Math.abs(alavVarR).toFixed(1)}%` : `-${Math.abs(alavVarR).toFixed(1)}%`;
    const alavCurrS = alavCurN > 0 ? alavCurN.toFixed(2) + "x" : "—";
    const alavPrevS = alavPrvN > 0 ? alavPrvN.toFixed(2) + "x" : "—";
    const alavRow = `<tr><td>Alavancagem</td><td>${alavPrevS}</td><td>${alavCurrS}</td><td class="var-cell ${alavVarCls}">${alavVarStr}</td></tr>`;
    const periodoAtual = scrCur.periodoReferencia ?? "";
    const periodoAnt   = scrPrv.periodoReferencia ?? "";
    const hAtual   = periodoAtual ? `Atual (${esc(periodoAtual)})`   : "Atual";
    const hAnterior = periodoAnt  ? `Anterior (${esc(periodoAnt)})`  : "Anterior";
    scrTable = `<table class="scr-tbl">
      <thead><tr><th>Métrica</th><th>${hAnterior}</th><th>${hAtual}</th><th>Var.</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${r.prev}</td><td>${r.curr}</td><td class="var-cell ${r.varCls}">${r.varVal}</td></tr>`).join("")}${alavRow}${totalRows}</tbody>
    </table>
    <div class="ifs-note">Instituições financeiras: ${fmt(scrCur.qtdeInstituicoes)} · Operações: ${fmt(scrCur.qtdeOperacoes)}</div>`;
  } else if (scr) {
    if (scr.semDados) {
      const bureau = scr.fonteBureau ? ` — fonte: ${esc(scr.fonteBureau)}` : "";
      scrTable = `<div style="padding:14px;background:var(--x0);border:1px solid var(--x2);border-radius:8px;color:var(--x5);font-size:var(--fs-body);text-align:center">
        SCR sem dados disponíveis${bureau}. Verifique o relatório original.
      </div>`;
    } else {
      const curtoPrazo = scr.carteiraCurtoPrazo ?? scr.carteiraAVencer;
      const periodoLabel = scr.periodoReferencia ? `Atual (${esc(scr.periodoReferencia)})` : "Valor";
      const sandboxNote = d.scrSandboxSemHistorico
        ? `<div class="ifs-note" style="font-style:italic;color:var(--x5);margin-top:4px">Comparativo histórico requer credenciais de produção DataBox360.</div>`
        : "";
      scrTable = `<table class="scr-tbl">
        <thead><tr><th>Métrica</th><th>${periodoLabel}</th></tr></thead>
        <tbody>
          <tr><td>Curto Prazo</td><td>${fmtMoneyAbr(curtoPrazo)}</td></tr>
          <tr><td>Longo Prazo</td><td>${fmtMoneyAbr(scr.carteiraLongoPrazo)}</td></tr>
          <tr><td>Vencidos</td><td>${fmtMoneyAbr(scr.vencidos)}</td></tr>
          <tr><td>Prejuízos</td><td>${fmtMoneyAbr(scr.prejuizos)}</td></tr>
          <tr><td>Limite de Crédito</td><td>${fmtMoneyAbr(scr.limiteCredito)}</td></tr>
          <tr><td>Alavancagem</td><td>${alavAtual > 0 ? alavAtual.toFixed(2) + "x" : "—"}</td></tr>
          <tr class="total"><td>Total Dívidas</td><td>${fmtMoneyAbr(scr.totalDividasAtivas)}</td></tr>
        </tbody>
      </table>
      <div class="ifs-note">Instituições financeiras: ${fmt(scr.qtdeInstituicoes)} · Operações: ${fmt(scr.qtdeOperacoes)}</div>${sandboxNote}`;
    }
  }

  // Curva ABC + Sacados — agora renderizado como tabela única dentro de .s-wrap
  // (ver bloco "8. Curva ABC + Bureau + Partes Relacionadas" abaixo).

  // Pleito (from relatorioVisita) — tabela completa de parâmetros
  const rv = d.relatorioVisita;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toS = (val: any): string => Array.isArray(val) ? val.join(", ") : (val == null ? "" : String(val));
  const v_ = (val: unknown) => { const s = toS(val).trim(); return s || "—"; };
  const vMoney = (val: unknown) => { const s = toS(val).trim(); return s ? fmtMoney(s) : "—"; };
  const vDias  = (val: unknown) => { const s = toS(val).trim(); return s ? `${s} dias` : "—"; };
  const pleitoRows: Array<[string, string]> = [
    ["Limite Global",                    vMoney(rv?.limiteTotal)],
    ["Tranche Limite Global",            vMoney(rv?.tranche)],
    ["Limite Convencional",              vMoney(rv?.limiteConvencional)],
    ["Limite Comissária",                vMoney(rv?.limiteComissaria)],
    ["Limite Sacados Pulverizados",      vMoney(rv?.limitePorSacado)],
    ["Limite Principais Sacados",        vMoney(rv?.limitePrincipaisSacados)],
    ["Taxa Convencional",                v_(rv?.taxaConvencional)],
    ["Taxa Comissária",                  v_(rv?.taxaComissaria)],
    ["Boleto",                           vMoney(rv?.valorCobrancaBoleto)],
    ["Prazo Máximo",                     vDias(rv?.prazoMaximoOp)],
    ["TAC",                              v_(rv?.cobrancaTAC)],
    ["Prazo de Recompra",                vDias(rv?.prazoRecompraCedente)],
    ["Prazo de Cartório",                vDias(rv?.prazoEnvioCartorio)],
    ["Tranche Checagem",                 v_(rv?.trancheChecagem)],
    ["Prazo Tranche",                    vDias(rv?.prazoTranche)],
  ];
  const half = Math.ceil(pleitoRows.length / 2);
  const col1r = pleitoRows.slice(0, half);
  const col2r = pleitoRows.slice(half);
  const pleitoTableCol = (rows: Array<[string, string]>) => rows.map(([lbl, val]) => {
    const isEmpty = val === "—";
    return `<tr>
      <td style="width:58%;color:var(--x5);font-size:var(--fs-body);padding:5px 8px">${esc(lbl)}</td>
      <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:var(--fs-body);padding:5px 8px;color:${isEmpty ? "var(--x3)" : "var(--n9)"};">${esc(val)}</td>
    </tr>`;
  }).join("");
  const pleitoHtml = `${stitle("Pleito do cedente")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
    <table class="tbl" style="margin:0"><tbody>${pleitoTableCol(col1r)}</tbody></table>
    <table class="tbl" style="margin:0"><tbody>${pleitoTableCol(col2r)}</tbody></table>
  </div>`;

  // Pleito do Comitê — mesma estrutura, mas com inputs editáveis e autosave
  // via PATCH /api/r/[id]/pleito-comite. Mapeia label → key da whitelist
  // do endpoint (espelha os 15 campos do pleito do cedente).
  const pleitoComiteFields: Array<[string, string]> = [
    ["Limite Global",               "limiteTotal"],
    ["Tranche Limite Global",       "tranche"],
    ["Limite Convencional",         "limiteConvencional"],
    ["Limite Comissária",           "limiteComissaria"],
    ["Limite Sacados Pulverizados", "limitePorSacado"],
    ["Limite Principais Sacados",   "limitePrincipaisSacados"],
    ["Taxa Convencional",           "taxaConvencional"],
    ["Taxa Comissária",             "taxaComissaria"],
    ["Boleto",                      "valorCobrancaBoleto"],
    ["Prazo Máximo",                "prazoMaximoOp"],
    ["TAC",                         "cobrancaTAC"],
    ["Prazo de Recompra",           "prazoRecompraCedente"],
    ["Prazo de Cartório",           "prazoEnvioCartorio"],
    ["Tranche Checagem",            "trancheChecagem"],
    ["Prazo Tranche",               "prazoTranche"],
  ];
  const halfC = Math.ceil(pleitoComiteFields.length / 2);
  const col1c = pleitoComiteFields.slice(0, halfC);
  const col2c = pleitoComiteFields.slice(halfC);
  const pleitoComiteTableCol = (rows: Array<[string, string]>) => rows.map(([lbl, key]) => `<tr>
      <td style="width:58%;color:var(--x5);font-size:var(--fs-body);padding:5px 8px">${esc(lbl)}</td>
      <td style="text-align:right;padding:5px 8px"><input class="pc-input" data-pc-key="${key}" value="" placeholder="—" /></td>
    </tr>`).join("");
  const pleitoComiteHtml = `${stitle("Pleito do Comitê")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:6px">
    <table class="tbl" style="margin:0"><tbody>${pleitoComiteTableCol(col1c)}</tbody></table>
    <table class="tbl" style="margin:0"><tbody>${pleitoComiteTableCol(col2c)}</tbody></table>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:12px">
    <div style="display:flex;gap:6px;align-items:center">
      <button type="button" id="pcDownloadBtn" class="pc-download-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Baixar PDF
      </button>
      <button type="button" id="pcViewBtn" class="pc-view-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Ver em HTML
      </button>
    </div>
    <div id="pcStatus" style="font-size:11px;color:var(--x4);min-height:14px"></div>
  </div>`;

  // Analise
  const fortes = params.pontosFortes ?? [];
  const fracos = params.pontosFracos ?? [];
  const alertsArr = (params.alerts ?? [])
    .filter(a => (a.severity === "CRÍTICO" || a.severity === "RESTRITIVO") && a.message?.trim() && a.message.trim() !== "—")
    .slice(0, 5).map(a => a.message);
  // Cada bloco entre marcadores EDIT:<sec>:START/END é substituível pelo
  // route.ts em /r/[id] quando há overrides salvos no Supabase.
  const renderItems = (arr: string[]): string =>
    arr.map(x => `<div class="ana-item" data-edit-item>${esc(x)}</div>`).join("")
    || '<div class="ana-item ana-item-empty" data-edit-empty style="color:var(--x4)">—</div>';
  const analiseHtml = `${stitle("Análise")}
  <div class="ana-grid">
    <div class="ana-col f" data-edit-section="fortes">
      <div class="ana-h">Pontos Fortes</div>
      <div class="ana-list" data-edit-list="fortes"><!--EDIT:fortes:START-->${renderItems(fortes)}<!--EDIT:fortes:END--></div>
    </div>
    <div class="ana-col w" data-edit-section="fracos">
      <div class="ana-h">Pontos Fracos</div>
      <div class="ana-list" data-edit-list="fracos"><!--EDIT:fracos:START-->${renderItems(fracos)}<!--EDIT:fracos:END--></div>
    </div>
    <div class="ana-col a" data-edit-section="alertas">
      <div class="ana-h">Alertas</div>
      <div class="ana-list" data-edit-list="alertas"><!--EDIT:alertas:START-->${renderItems(alertsArr)}<!--EDIT:alertas:END--></div>
    </div>
  </div>`;

  // Percepção — prioridade: texto manual do analista > resumo gerado pela IA
  const isManualPerc = !!(params.observacoes?.trim());
  const resumo = params.observacoes?.trim() || params.resumoExecutivo || (typeof params.aiAnalysis?.parecer === "object" ? params.aiAnalysis.parecer.resumoExecutivo : "") || "";
  const percHtml = `${stitle("Percepção do analista")}
  <div class="perc" data-edit-section="percepcao">
    ${isManualPerc ? `<span class="badge-manual">&#9998; Percep&ccedil;&atilde;o do Analista</span>` : ""}
    <!--EDIT:percepcao:START--><div class="perc-text" data-edit-percepcao style="text-align:justify">${esc(resumo) || "—"}</div><!--EDIT:percepcao:END-->
    ${HIDE_AVALIACAO ? "" : `<div class="perc-rec">Recomendação: <span class="dec" style="background:${decBg};font-size:10px">${fmtDecision(params.decision)}</span></div>`}
  </div>`;

  // Map/address — Street View 360° (4 ângulos) + mapa aéreo + link interativo
  let mapHtml = "";
  const sv0   = params.streetViewBase64;
  const sv90  = params.streetView90Base64;
  const sv180 = params.streetView180Base64;
  const sv270 = params.streetView270Base64;
  const mp    = params.mapStaticBase64;
  const svUrl = params.streetViewInteractiveUrl;
  const svList: Array<{ img: string; label: string }> = [];
  if (sv0)   svList.push({ img: sv0,   label: "Frente (0°)" });
  if (sv90)  svList.push({ img: sv90,  label: "Direita (90°)" });
  if (sv180) svList.push({ img: sv180, label: "Atrás (180°)" });
  if (sv270) svList.push({ img: sv270, label: "Esquerda (270°)" });

  if (svList.length > 0 || mp) {
    // Vista principal: a primeira Street View disponível (geralmente 0°) — grande
    const primary = svList[0];
    const thumbs  = svList.slice(1); // 90°, 180°, 270°

    // Renderiza mini-strip com thumbnails dos outros ângulos + mapa aéreo
    const thumbWidth = thumbs.length + (mp ? 1 : 0);
    const thumbCols = thumbWidth > 0 ? `repeat(${thumbWidth},1fr)` : "1fr";
    const thumbItems = [
      ...thumbs.map(t => `
        <div class="map-frame" style="height:95px;position:relative">
          <img src="${esc(t.img)}" alt="${esc(t.label)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px" />
          <div style="position:absolute;bottom:4px;left:6px;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.7);letter-spacing:0.02em">${esc(t.label)}</div>
        </div>`),
      mp ? `
        <div class="map-frame" style="height:95px;position:relative">
          <img src="${esc(mp)}" alt="Mapa aéreo" style="width:100%;height:100%;object-fit:cover;border-radius:6px" />
          <div style="position:absolute;bottom:4px;left:6px;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.7);letter-spacing:0.02em">Mapa aéreo</div>
        </div>` : "",
    ].filter(Boolean).join("");

    mapHtml = `
    ${primary ? `
    <div class="map-frame" style="height:220px;margin-bottom:8px;position:relative">
      <img src="${esc(primary.img)}" alt="${esc(primary.label)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px" />
      <div style="position:absolute;top:8px;left:10px;background:rgba(0,0,0,0.6);color:#fff;padding:3px 9px;border-radius:12px;font-size:10px;font-weight:700;letter-spacing:0.02em">${esc(primary.label)}</div>
      ${svUrl ? `<a href="${esc(svUrl)}" target="_blank" rel="noopener" style="position:absolute;top:8px;right:10px;background:#84BF41;color:#fff;padding:5px 11px;border-radius:12px;font-size:10px;font-weight:700;text-decoration:none;letter-spacing:0.02em;box-shadow:0 2px 6px rgba(0,0,0,0.25)">Ver 360° no Google Maps ↗</a>` : ""}
    </div>` : ""}
    ${thumbItems ? `<div style="display:grid;grid-template-columns:${thumbCols};gap:8px;margin-bottom:14px">${thumbItems}</div>` : ""}
    <div class="addr-box" style="margin-bottom:18px">
      <div class="l">Endereço</div>
      <div class="a">${esc(cnpj?.endereco ?? "—")}</div>
      <div class="t">Tipo: ${esc(cnpj?.tipoEmpresa ?? "Matriz")}</div>
      ${params.mapaContextoAviso ? `<div style="margin-top:6px;font-size:10px;color:#92400e;background:#fef9c3;border:1px solid #fde68a;border-radius:6px;padding:5px 9px;line-height:1.4">⚠ ${esc(params.mapaContextoAviso)} — verificar manualmente</div>` : ""}
    </div>`;
  } else {
    mapHtml = `
    <div class="addr-box" style="margin-bottom:18px">
      <div class="l">Endereço</div>
      <div class="a">${esc(cnpj?.endereco ?? "—")}</div>
      <div class="t">Tipo: ${esc(cnpj?.tipoEmpresa ?? "Matriz")}</div>
      ${params.mapaContextoAviso ? `<div style="margin-top:6px;font-size:10px;color:#92400e;background:#fef9c3;border:1px solid #fde68a;border-radius:6px;padding:5px 9px;line-height:1.4">⚠ ${esc(params.mapaContextoAviso)} — verificar manualmente</div>` : ""}
    </div>`;
  }

  const content = `<div class="s-wrap">
    <!-- 1. Empresa + Rating -->
    <div class="emp">
      <div>
        <div class="emp-name">${esc(cnpj?.razaoSocial ?? "—")}</div>
        ${cnpj?.nomeFantasia ? `<div class="emp-fan">${esc(cnpj.nomeFantasia)}</div>` : ""}
        <div class="emp-cnpj">CNPJ: <b>${fmtCnpj(cnpj?.cnpj)}</b> <span class="sit${isAtiva ? "" : " inactive"}">${esc(cnpj?.situacaoCadastral ?? "—")}</span></div>
        ${rv?.responsavelVisita ? `<div style="font-size:11px;color:var(--x5);margin-top:4px">Gerente: <b style="color:var(--x7)">${esc(rv.responsavelVisita)}</b></div>` : ""}
      </div>
      <div class="rat">
        ${HIDE_AVALIACAO ? BANNER_CALIBRACAO_LIGHT : `
        <div class="rat-c" style="border-color:${sb}">
          <div class="rat-n" style="color:${sc}">${score.toFixed(1)}</div>
          <div class="rat-d">/10</div>
        </div>
        <div class="rat-l" style="color:${sc}">${ratingLabel}</div>
        <div class="dec" style="background:${decBg}">${fmtDecision(params.decision)}</div>`}
      </div>
    </div>

    <!-- 2. Info strip — todos em uma linha -->
    <div class="istrip" style="grid-template-columns:repeat(6,1fr)">
      <div class="icell"><div class="l">Tempo de Fundação</div><div class="v sm">${fmt(params.companyAge)}</div></div>
      <div class="icell"><div class="l">Porte</div><div class="v sm">${fmt(cnpj?.porte)}</div></div>
      <div class="icell"><div class="l">Capital Social</div><div class="v sm mono">${fmtMoney(capitalSocial)}</div></div>
      <div class="icell"><div class="l">Tipo</div><div class="v sm">${fmt(cnpj?.tipoEmpresa ?? "Matriz")}</div></div>
      <div class="icell"><div class="l">Local</div><div class="v sm">${fmt(local)}</div></div>
      <div class="icell"><div class="l">Natureza Jurídica</div><div class="v sm">${cnpj?.naturezaJuridica ? esc(cnpj.naturezaJuridica) : "—"}</div></div>
    </div>

    <!-- 3. Segmento -->
    ${cnpj?.cnaePrincipal ? `<div class="seg"><b>${esc(cnpj.cnaePrincipal)}</b>${cnpj.cnaeSecundarios ? `<div class="sec">CNAEs sec.: ${esc(cnpj.cnaeSecundarios)}</div>` : ""}</div>` : ""}

    <!-- 4. Localização -->
    ${stitle("Localização")}
    ${mapHtml}

    <!-- 5. Sócios (Quadro societário) — vem ANTES do Endividamento SCR
         (decisão Victor 2026-05-08): primeiro identifica QUEM são os sócios,
         depois Grupo Econômico (empresas vinculadas), depois Endividamento. -->
    ${stitle("Quadro societário")}
    <table class="soc-tbl">
      <thead><tr><th>Sócio</th><th>CPF/CNPJ</th><th>Qualificação</th><th>Part.</th></tr></thead>
      <tbody>${socRows || `<tr><td colspan="4" style="color:var(--x4);text-align:center">—</td></tr>`}</tbody>
    </table>
    <div class="soc-extra">Grupo Econômico: <b>${d.grupoEconomico?.empresas?.length > 0 ? d.grupoEconomico.empresas.length + " empresa(s) identificada(s)" : "Não identificado"}</b></div>

    <!-- 5b. Grupo Econômico dos Sócios — logo após o Quadro Societário
         (decisão Victor 2026-05-08): empresas vinculadas via sócios fica perto
         da identificação dos sócios, antes do Endividamento SCR. -->
    ${(() => {
      const ge = d.grupoEconomico;
      if (!ge?.empresas?.length) return "";

      // Agrupa por sócio de origem
      const porSocio: Record<string, typeof ge.empresas> = {};
      ge.empresas.forEach((e: typeof ge.empresas[0]) => {
        const key = e.socioOrigem || "Sem identificação";
        if (!porSocio[key]) porSocio[key] = [];
        porSocio[key].push(e);
      });

      // Normaliza situação evitando bug histórico de "INATIVA".includes("ATIVA")
      // → vinha aparecendo como ATIVA empresas que estavam INATIVA/INAPTA/BAIXADA.
      // Word-boundary + ordem específica (variantes negativas primeiro).
      const normSituacao = (sit: string | undefined): string => {
        const s = (sit ?? "").toUpperCase().trim();
        if (!s) return "";
        if (/\bINAPTA\b/.test(s))   return "INAPTA";
        if (/\bINATIVA\b/.test(s))  return "INATIVA";
        if (/\bBAIXADA\b/.test(s))  return "BAIXADA";
        if (/\bSUSPENSA\b/.test(s)) return "SUSPENSA";
        if (/\bNULA\b/.test(s))     return "NULA";
        if (/\bATIVA\b/.test(s))    return "ATIVA";
        return s; // preserva original se não bate em nenhum termo canônico
      };
      const sitClass = (sit: string) => {
        const n = normSituacao(sit);
        if (n === "ATIVA")    return "ativa";
        if (n === "BAIXADA")  return "baixada";
        if (n === "SUSPENSA") return "suspensa";
        if (n === "INAPTA" || n === "INATIVA") return "inapta";
        return "outro";
      };

      const socioBlocks = Object.entries(porSocio).map(([socio, emps]) => {
        const empsAtivas = emps.filter(e => {
          const cnpjNum = (e.cnpj ?? "").replace(/\D/g, "");
          // Mostra só empresas REALMENTE ativas (INATIVA/INAPTA/BAIXADA são
          // filtradas — entram em bloco separado abaixo se quiser ver depois).
          return cnpjNum.length === 14 && normSituacao(e.situacao) === "ATIVA";
        });
        const empsNaoAtivas = emps.filter(e => {
          const cnpjNum = (e.cnpj ?? "").replace(/\D/g, "");
          if (cnpjNum.length !== 14) return false;
          const n = normSituacao(e.situacao);
          return n !== "" && n !== "ATIVA";
        });
        if (empsAtivas.length === 0 && empsNaoAtivas.length === 0) return "";
        const renderRow = (e: typeof emps[0]) => {
          const cnpjFmt = e.cnpj ? e.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—";
          const sitCls = sitClass(e.situacao ?? "");
          const sitDisplay = normSituacao(e.situacao) || (e.situacao ?? "—");
          const hasSCR = e.scrTotal && e.scrTotal !== "—";
          const hasVenc = !!e.scrVencidos;
          const hasProt = e.protestos && e.protestos !== "—";
          const hasProc = e.processos && e.processos !== "—";
          const hasVal  = e.valorProcessos && e.valorProcessos !== "—";
          return `<tr>
            <td><b>${esc(e.razaoSocial)}</b></td>
            <td class="mono">${cnpjFmt}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums;color:${e.participacao ? "var(--n8)" : "var(--x4)"};font-weight:${e.participacao ? "600" : "400"}">${e.participacao ? esc(e.participacao) : "—"}</td>
            <td><span class="ge-badge ${sitCls}">${esc(sitDisplay)}</span></td>
            <td class="mono" style="color:${hasSCR ? "var(--n9)" : "var(--x4)"}">${hasSCR ? fmtMoneyAbr(e.scrTotal) : "—"}</td>
            <td class="mono" style="text-align:right;color:${hasVenc ? "var(--r6)" : "var(--x4)"};font-weight:${hasVenc ? "700" : "400"}">${hasVenc ? fmtMoneyAbr(e.scrVencidos) : "—"}</td>
            <td style="text-align:center;color:${hasProt && e.protestos !== "0" ? "var(--r6)" : "var(--g6)"};font-weight:600">${hasProt ? e.protestos : "—"}</td>
            <td style="text-align:center;color:${hasProc && e.processos !== "0" ? "var(--r6)" : "var(--g6)"};font-weight:600">${hasProc ? e.processos : "—"}</td>
            <td class="mono" style="color:${hasVal && e.valorProcessos !== "R$ 0,00" ? "var(--r6)" : "var(--x4)"}">${hasVal ? esc(e.valorProcessos!) : "—"}</td>
          </tr>`;
        };
        const rowsAtivas = empsAtivas.map(renderRow).join("");
        const rowsNaoAtivas = empsNaoAtivas.map(renderRow).join("");
        const totalEmps = empsAtivas.length + empsNaoAtivas.length;
        const headerCols = `<thead><tr><th>Razão Social</th><th>CNPJ</th><th style="text-align:right">% Part.</th><th>Situação</th><th>SCR Total</th><th style="text-align:right;color:var(--r6)">Vencidos</th><th style="text-align:center">Prot.</th><th style="text-align:center">Proc.</th><th style="text-align:right">Valor Proc.</th></tr></thead>`;

        return `<div class="ge-socio-hdr">
          <span style="font-size:14px">👤</span> Via sócio: ${esc(socio)}
          <span style="font-weight:500;color:var(--n8);margin-left:auto">${totalEmps} empresa${totalEmps > 1 ? "s" : ""}${empsNaoAtivas.length > 0 ? ` <span style="color:var(--x4)">(${empsAtivas.length} ativa${empsAtivas.length !== 1 ? "s" : ""})</span>` : ""}</span>
        </div>
        ${rowsAtivas ? `<table class="ge-tbl">${headerCols}<tbody>${rowsAtivas}</tbody></table>` : ""}
        ${rowsNaoAtivas ? `<table class="ge-tbl" style="opacity:0.85;${rowsAtivas ? "margin-top:8px" : ""}">${headerCols}<tbody>${rowsNaoAtivas}</tbody></table>` : ""}`;
      }).join("");

      const alertaParentesco = ge.alertaParentesco && (ge.parentescosDetectados ?? []).length > 0
        ? `<div class="ge-parentesco"><span class="atag alert mod" style="padding:2px 8px;border-radius:3px;font-size:var(--fs-tag);font-weight:700">ATENÇÃO</span>
           Possível parentesco entre sócios: ${ge.parentescosDetectados!.map((p: {socio1:string;socio2:string;sobrenomeComum:string}) => `<b>${esc(p.socio1)}</b> e <b>${esc(p.socio2)}</b> (sobrenome <i>${esc(p.sobrenomeComum)}</i>)`).join("; ")}</div>`
        : "";

      const scrSandboxNote = d.grupoEconomicoScrSandbox
        ? `<div style="font-size:10px;color:var(--x5);font-style:italic;margin-top:6px">SCR Total das empresas vinculadas requer credenciais de produção DataBox360.</div>`
        : "";

      return `${stitle("Grupo econômico dos sócios")}
      <div class="ge-block">
        <div class="ge-header">
          <span class="title">Empresas vinculadas via sócios</span>
          <span class="count">${ge.empresas.length} empresa${ge.empresas.length > 1 ? "s" : ""} identificada${ge.empresas.length > 1 ? "s" : ""}</span>
        </div>
        ${socioBlocks}
        ${alertaParentesco}
        ${scrSandboxNote}
      </div>`;
    })()}

    <!-- 5c. Endividamento dos Sócios (SCR Bacen via DataBox360) — KPIs da
         empresa removidos em 2026-05-08 (já aparecem no Risco Consolidado).
         Só a tabela de sócios PF fica, pois é info única do DataBox360. -->
    ${(() => {
      const scrSocs = d.scrSocios ?? [];
      if (scrSocs.length === 0) return "";

      const rows = scrSocs.map(ss => {
        const sa = ss.periodoAtual;
        const respAtiva = numVal(sa.carteiraAVencer ?? "0") + numVal(sa.vencidos ?? "0");
        const venc = numVal(sa.vencidos ?? "0");
        const prej = numVal(sa.prejuizos ?? "0");
        return `<tr>
          <td class="b" style="white-space:nowrap">${esc(ss.nomeSocio)}<div style="font-size:9px;color:var(--x5);font-family:'JetBrains Mono',monospace;font-weight:400">${fmtCpf(ss.cpfSocio)}</div></td>
          <td class="r mono">${fmtMoneyAbr(String(respAtiva))}</td>
          <td class="r mono ${venc > 0 ? "red" : ""}">${venc > 0 ? fmtMoneyAbr(sa.vencidos) : "—"}</td>
          <td class="r mono ${prej > 0 ? "red" : ""}">${prej > 0 ? fmtMoneyAbr(sa.prejuizos) : "—"}</td>
          <td class="r">${fmt(sa.qtdeInstituicoes)}</td>
        </tr>`;
      }).join("");

      return `${stitle("Posição de Crédito dos Sócios — SCR")}
      <table class="tbl" style="margin-bottom:0">
        <thead><tr><th>Sócio</th><th class="r">Dívida em Aberto</th><th class="r">Vencidos</th><th class="r">Prejuízos</th><th class="r">IFs</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    })()}

    <!-- 5d. Alertas KYC sócios (óbito / CPF irregular) -->
    ${(() => {
      const alertas: string[] = [];
      if ((d as any).sociosFalecidos?.length) {
        const nomes = ((d as any).sociosFalecidos as string[]).map(n => `<b>${esc(n)}</b>`).join(", ");
        alertas.push(`<div class="alert alta" style="margin-top:8px"><span class="atag">CRÍTICO</span> Sócio(s) com indicação de óbito: ${nomes}. Verificar sucessão e situação jurídica da empresa.</div>`);
      }
      const sociosIrr = (d.qsa?.quadroSocietario ?? []).filter((s: any) => s.taxIdStatus && s.taxIdStatus !== "REGULAR");
      if (sociosIrr.length > 0) {
        const lista = sociosIrr.map((s: any) => `<b>${esc(s.nome)}</b> (${esc(String(s.taxIdStatus).replace(/_/g, " "))})`).join(", ");
        alertas.push(`<div class="alert mod" style="margin-top:8px"><span class="atag">RESTRITIVO</span> CPF com situação irregular: ${lista}. Consultar Receita Federal.</div>`);
      }
      return alertas.join("");
    })()}

    <!-- 6. Risco Consolidado -->
    ${stitle("Risco consolidado")}
    ${(() => {
      const sPJ = cnpj?.scoreAssertivaPJ;
      const neg = cnpj?.negativacoesAssertiva;
      if (!(sPJ ?? 0)) return "";
      const lvl = (sPJ ?? 0) >= 700 ? "g" : (sPJ ?? 0) >= 400 ? "a" : "r";
      const scoreStyle = `color:var(--${lvl}6);font-weight:700`;
      return `<div style="display:flex;gap:8px;margin-bottom:8px">
        <div class="scr-card" style="flex:1"><div class="l">Score Assertiva PJ</div><div class="v" style="${scoreStyle}">${sPJ}</div><div class="sub">0–1000 · Assertiva Score</div></div>
        ${(neg ?? 0) >= 0 && neg !== undefined ? `<div class="scr-card" style="flex:1"><div class="l">Negativações</div><div class="v" style="color:${neg > 0 ? "var(--r6)" : "var(--g6)"};font-weight:700">${neg}</div><div class="sub">Assertiva Score</div></div>` : ""}
      </div>`;
    })()}
    <div class="risk-section">
      <div class="scr-strip">
        <div class="scr-card"><div class="l">SCR Total</div><div class="v mono">${fmtMoneyAbr(totalDivida)}</div></div>
        <div class="scr-card"><div class="l">SCR Vencido</div><div class="v ${vencNum > 0 ? "" : "green"}">${fmtMoneyAbr(vencidos)}</div></div>
        <div class="scr-card"><div class="l">% Vencido</div><div class="v ${vencNum > 0 ? "" : "green"}">${pctVencido}</div></div>
        <div class="scr-card" title="${prejuizoSCRNum > 0 ? "Write-off Bacen" : "Sem prejuízo SCR"}"><div class="l">Prejuízo SCR</div><div class="v mono ${prejuizoSCRNum > 0 ? "red" : ""}">${prejuizoSCRNum > 0 ? fmtMoneyAbr(prejuizoSCR) : "—"}</div></div>
        <div class="scr-card" title="${
          !dividaAtivaTemDados ? "Não possui registros" :
          dividaAtivaNegativa ? "Certidão negativa" :
          `${dividaAtiva!.qtdRegistros} inscrição(ões)`
        }"><div class="l">Dívida Ativa</div>${
          !dividaAtivaTemDados
            ? `<div class="v" style="color:var(--x4)">—</div>`
            : dividaAtivaNegativa
              ? `<div class="v green">Nada consta</div>`
              : `<div class="v mono ${dividaAtivaNum > 0 ? "red" : ""}">${dividaAtivaNum > 0 ? fmtMoneyAbr(dividaAtiva!.valorTotal) : "—"}</div>`
        }</div>
        <div class="scr-card"><div class="l">Alavancagem</div><div class="v" style="color:var(--x4)">${esc(alavStr)}</div></div>
        <div class="scr-card"><div class="l">Nº IFs</div><div class="v">${fmt(nIfs)}</div></div>
      </div>
      <div class="risk-cols">
        <div class="risk-block">
          <div class="risk-block-hdr">
            <div><div class="title">Protestos</div><div style="font-size:10px;color:var(--x5)">${fmtMoneyAbr(protVal)} vigentes</div></div>
            <div class="big ${protColor}">${protQtd}</div>
          </div>
          <div class="risk-block-body">
            <div class="risk-detail"><span class="label">Por tipo</span></div>
            ${protRows || '<div class="risk-detail"><span class="label" style="color:var(--g6)">Sem protestos vigentes</span></div>'}
            ${lastProt ? `<div class="risk-sep"></div>
            <div class="risk-detail"><span class="label">Último protesto</span><span class="val">${fmtDate(lastProt.data)}</span></div>
            <div class="risk-detail"><span class="label">Apresentante</span><span class="val" style="font-size:10px">${esc(lastProt.apresentante ?? lastProt.credor)}</span></div>
            <div class="risk-detail"><span class="label">Valor</span><span class="val red">${fmtMoney(lastProt.valor)}</span></div>` : ""}
          </div>
        </div>
        <div class="risk-block">
          <div class="risk-block-hdr">
            <div><div class="title">Processos Judiciais</div><div style="font-size:10px;color:var(--x5)">Passivo: ${fmt(proc?.poloPassivoQtd ?? proc?.passivosTotal)} · Ativo: ${fmt(proc?.poloAtivoQtd ?? proc?.ativosTotal)}</div></div>
            <div class="big ${procColor}">${procTotal}</div>
          </div>
          <div class="risk-block-body">
            <div class="risk-detail"><span class="label">Por tipo</span></div>
            ${procDistRows || '<div class="risk-detail"><span class="label" style="color:var(--g6)">Sem processos</span></div>'}
            ${lastProc ? `<div class="risk-sep"></div>
            <div class="risk-detail"><span class="label">Último processo</span><span class="val">${fmtDate(lastProc.data)}</span></div>
            <div class="risk-detail"><span class="label">Tipo</span><span class="val" style="font-size:10px">${esc(lastProc.tipo)}</span></div>
            <div class="risk-detail"><span class="label">Fase</span><span class="val" style="font-size:10px">${fmt(lastProc.fase)}</span></div>` : ""}
          </div>
        </div>
      </div>
      ${(() => {
        const todosSocios = (d.qsa?.quadroSocietario ?? []).filter((s: any) => s.nome);
        if (!todosSocios.length) return "";
        const rows = todosSocios.map((s: any) => {
          const temCPF  = (s.cpfCnpj ?? "").replace(/\D/g, "").length === 11;
          const temProt = (s.protestosSocioQtd ?? 0) > 0;
          const temProc = (s.processosTotal ?? 0) > 0;
          const semDados = !temCPF || (s.processosTotal === undefined && s.protestosSocioQtd === undefined);
          const val = s.protestosSocioValor ?? 0;
          const valStr = val > 0 ? `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";
          const nd = `<span style="color:var(--x4);font-size:10px">${temCPF ? "N/D" : "PJ"}</span>`;
          const fmtDC = (d: string | undefined) => {
            if (!d) return "";
            const m = d.match(/^(\d{4})-(\d{2})/);
            return m ? `${m[2]}/${m[1]}` : d.slice(0, 7);
          };
          const dpProc = fmtDC(s.ultimoProcessoData);
          const dpProt = fmtDC(s.ultimoProtestoData);
          const subDates = [dpProc ? `proc ${dpProc}` : "", dpProt ? `prot ${dpProt}` : ""].filter(Boolean).join(" · ");
          return `<tr>
            <td><b>${esc(s.nome)}</b>${subDates ? `<br><span style="font-size:10px;color:var(--x4)">${subDates}</span>` : ""}</td>
            <td style="text-align:center;font-weight:700;color:${temProt ? "var(--r6)" : "var(--g6)"}">${semDados ? nd : (s.protestosSocioQtd ?? 0)}</td>
            <td style="text-align:right;color:${temProt ? "var(--r6)" : "var(--x4)"}" class="mono">${semDados ? "—" : valStr}</td>
            <td style="text-align:center;font-weight:700;color:${temProc ? "var(--r6)" : "var(--g6)"}">${semDados ? nd : (s.processosTotal ?? 0)}</td>
            <td style="text-align:center;color:${(s.processosPassivo ?? 0) > 0 ? "var(--r6)" : "var(--x7)"}">${semDados ? "—" : (s.processosPassivo ?? 0)}</td>
            <td style="text-align:right;color:var(--x5);font-size:var(--fs-tag)" class="mono">${semDados ? "—" : (s.processosValorTotal ?? "—")}</td>
          </tr>`;
        }).join("");
        return `<div style="margin-top:10px">
          <div class="label" style="font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x4);margin-bottom:6px">Sócios — Processos & Protestos</div>
          <table class="ge-tbl">
            <thead><tr>
              <th>Sócio</th>
              <th style="text-align:center">Prot. Qtd</th>
              <th style="text-align:right">Prot. Valor</th>
              <th style="text-align:center">Proc. Total</th>
              <th style="text-align:center">Polo Passivo</th>
              <th style="text-align:right">Valor Est.</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      })()}
      <div style="margin-top:8px">
        <div class="label" style="font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x4);margin-bottom:4px">CCF — Cheques Sem Fundo</div>
        ${ccfBlock}
      </div>
      ${(() => {
        const pefin = d.pefin;
        const refin  = d.refin;
        const card2 = (label: string, fonte: string, data: typeof pefin) => {
          const qtd = data?.qtd ?? 0;
          const vlr = data?.valor ?? 0;
          const hasData = data !== undefined;
          const hasNeg = qtd > 0;
          const borderColor = hasNeg ? "var(--r1)" : "var(--g1)";
          const bg = hasNeg ? "var(--r0)" : "var(--g0)";
          const numColor = hasNeg ? "var(--r6)" : "var(--g6)";
          const sub = !hasData
            ? `<div style="font-size:var(--fs-label);color:var(--x4);margin-top:3px">Não possui registros</div>`
            : vlr > 0
              ? `<div style="font-size:var(--fs-label);color:var(--r6);margin-top:3px">${fmtMoneyAbr(vlr)} total</div>`
              : `<div style="font-size:var(--fs-label);color:var(--g6);font-weight:600;margin-top:3px">Sem pendências</div>`;
          return `<div style="background:${bg};border:1px solid ${borderColor};border-radius:6px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x5)">${esc(label)}</div>
              <div style="font-size:var(--fs-tag);color:var(--x4);margin-top:1px">${esc(fonte)}</div>
              ${sub}
            </div>
            <div style="font-size:22px;font-weight:700;color:${numColor};min-width:28px;text-align:right">${hasData ? qtd : "—"}</div>
          </div>`;
        };
        return `<div style="margin-top:8px">
          <div class="label" style="font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x4);margin-bottom:6px">PEFIN &amp; REFIN — Pendências Financeiras</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            ${card2("PEFIN", "Boa Vista / SCPC", pefin)}
            ${card2("REFIN", "Serasa", refin)}
          </div>
        </div>`;
      })()}
      <div style="margin-top:10px">${alertsHtml}</div>
    </div>

    <!-- 7. Faturamento + SCR -->
    ${stitle("Faturamento & SCR")}
    <div class="fin-row">
      <div class="fin-box">
        <div class="fin-title">Faturamento — últimos 12 meses</div>
        <div class="bars">${fatBars}</div>
        <div class="kpi-row">
          <span>FMM: <b>${fmtMoneyAbr(fmm)}</b></span>
          <span>Total 12M: <b>${fmtMoneyAbr(total12)}</b></span>
          <span>Tendência: <span style="color:${tendColor};font-weight:600">${esc(tendLabel)}</span></span>
        </div>
      </div>
      <div class="fin-box">
        <div class="fin-title">SCR comparativo</div>
        ${scrTable || '<div style="color:var(--x4);font-size:12px">SCR não disponível</div>'}
      </div>
    </div>

    <!-- Caixa de Percepção do Analista — Faturamento.
         Movida da pág 9 pra cá em 2026-05-11 (decisão Victor) pra ficar
         abaixo do assunto correspondente. Reusa toda a infra de edição
         inline (data-edit-text + marcador EDIT:faturamento). -->
    <div class="perc-box" data-edit-section="faturamento">
      <div class="l">Percepção do Analista — Faturamento</div>
      <!--EDIT:faturamento:START--><div class="perc-box-content" data-edit-text="faturamento" data-empty="true"></div><!--EDIT:faturamento:END-->
    </div>

    <!-- 8. Curva ABC + Bureau + Partes Relacionadas (tabela única) -->
    ${(() => {
      const abcLocal = d.curvaABC;
      if (!abcLocal || abcLocal.clientes.length === 0) return "";

      const fmtCnpj14 = (c: string) =>
        c?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") ?? "—";

      // Index dos sacados analisados por CNPJ canonicalizado para lookup O(1).
      // CNPJ pode vir formatado ou cru no JSON original — sempre compara só dígitos.
      const sacadosArr = d.sacadosAnalisados ?? [];
      const sacadosByCnpj = new Map<string, typeof sacadosArr[number]>();
      sacadosArr.forEach((s) => {
        const k = (s.cnpj ?? "").replace(/\D/g, "");
        if (k) sacadosByCnpj.set(k, s);
      });

      // Limpa nome retroativamente — extrações antigas podem ter código do ERP
      // colado no início ("000001ALIRIO...") e quantidade no fim ("... 847.562")
      const cleanName = (nome: string): string => {
        if (!nome) return "";
        return String(nome)
          .replace(/^(\d{3,})(?=[A-Za-zÀ-ÿ])/, "")
          .replace(/\s+\d[\d.,]+\s*$/, "")
          .replace(/\s+\d[\d.,]+\s*$/, "")
          .replace(/\s+/g, " ")
          .trim();
      };
      // Top 5 da Curva ABC, filtrando linhas de totalizador que extrações
      // antigas podem ter incluído ("Totais listados ....: 451 ...").
      const isLixoTotal = (nome: string): boolean => {
        const t = (nome || "").trim();
        if (!t) return true;
        if (/^[\s\d.,:/\-R$%()]+$/.test(t)) return true;
        if (/^\s*(totais?|total|subtotal|sub\s*total|soma|geral)\b/i.test(t)) return true;
        if (/totais?\s+listad/i.test(t)) return true;
        const letras = (t.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
        const compact = t.replace(/\s+/g, "").length;
        if (compact >= 6 && letras / compact < 0.25) return true;
        return false;
      };
      const top = abcLocal.clientes
        .filter(c => !isLixoTotal(c.nome))
        .map(c => ({ ...c, nome: cleanName(c.nome) || c.nome }))
        .slice(0, 5);
      const maxValSint = numVal(top[0]?.valorFaturado ?? "0");

      const linhas = top.map((c, i) => {
        const cnpjCanon = (c.cnpjCpf ?? "").replace(/\D/g, "");
        // Tenta lookup por cnpjCpf direto e por CNPJ embutido no nome (caso prod 2026-05-08)
        let s = cnpjCanon.length === 14 ? sacadosByCnpj.get(cnpjCanon) : undefined;
        if (!s) {
          const m = (c.nome ?? "").match(/(\d{2}\.?\d{3}\.?\d{3}[/.-]?\d{4}[-.]?\d{2})/);
          if (m) {
            const cnpjFromName = m[1].replace(/\D/g, "");
            s = sacadosByCnpj.get(cnpjFromName);
          }
        }

        const isPF = cnpjCanon.length === 11;
        const barW = maxValSint > 0 ? Math.round((numVal(c.valorFaturado) / maxValSint) * 100) : 0;
        const clsCls = (c.classe ?? "c").toLowerCase();
        const cnpjFmt = s?.cnpj
          ? fmtCnpj14(s.cnpj)
          : cnpjCanon.length === 14
            ? fmtCnpj14(cnpjCanon)
            : "";

        // Bureau cells — só preenchem quando há sacado analisado
        const protRed = (s?.protestosQtd ?? 0) > 0;
        const procRed = (s?.processosPassivos ?? 0) > 0;
        const scoreCell = s?.score
          ? `${s.score}${s.scoreClasse ? ` <span style="font-size:9px;color:var(--x5)">${esc(s.scoreClasse)}</span>` : ""}`
          : isPF ? `<span style="font-size:9px;color:var(--x4)">PF</span>` : "—";

        // Vínculo
        let chipVinculo = `<span style="color:var(--x4);font-size:10px">—</span>`;
        if (s?.vinculos?.temVinculo) {
          const tipos: string[] = [];
          if (s.vinculos.cpfSocioComum.length > 0) tipos.push("CPF comum");
          if (s.vinculos.maesComuns.length > 0) tipos.push("mãe comum");
          if (s.vinculos.parentescoBDC.length > 0) tipos.push("parentesco");
          if (s.vinculos.enderecoIdentico) tipos.push("endereço");
          if (s.vinculos.sobrenomesUF.length > 0) tipos.push("sobrenome+UF");
          chipVinculo = `<span style="display:inline-block;padding:2px 6px;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em" title="${esc(tipos.join(", "))}">🚩 ${esc(tipos[0] ?? "vínculo")}${tipos.length > 1 ? ` +${tipos.length - 1}` : ""}</span>`;
        }

        const nomeLimpo = s?.razaoSocial ?? c.nome;
        const ufExtra = s?.uf ? ` · ${esc(s.uf)}` : "";

        const rowBg = s?.vinculos?.temVinculo ? ` style="background:#FEF2F2"` : "";

        // Cells separadas: Protestos / Processos
        // Sem bureau (s ausente) → "—" cinza
        // Bureau consultado, qtd 0 → "✓" verde
        // Bureau consultado, qtd > 0 → número vermelho com valor total em linha menor
        const protCell = !s
          ? `<span style="color:var(--x4);font-size:10px">—</span>`
          : (s.protestosQtd ?? 0) === 0
            ? `<span style="color:var(--g6);font-weight:700">✓</span>`
            : `<div style="font-weight:700;color:#991B1B;line-height:1.25">${s.protestosQtd}${s.protestosValorTotal ? `<div style="font-size:9px;color:var(--x5);font-weight:400">${esc(s.protestosValorTotal)}</div>` : ""}</div>`;
        const procCell = !s
          ? `<span style="color:var(--x4);font-size:10px">—</span>`
          : (s.processosPassivos ?? 0) === 0
            ? `<span style="color:var(--g6);font-weight:700">✓</span>`
            : `<div style="font-weight:700;color:#991B1B;line-height:1.25">${s.processosPassivos}${s.processosValorTotal ? `<div style="font-size:9px;color:var(--x5);font-weight:400">${esc(s.processosValorTotal)}</div>` : ""}</div>`;

        // % Rec com acumulado em linha menor
        const pctCell = `<b>${fmtPct(c.percentualReceita)}</b><div style="font-size:9px;color:var(--x5);font-weight:400">acum ${fmtPct(c.percentualAcumulado)}</div>`;

        return `<tr${rowBg}>
          <td style="text-align:center;color:var(--x5);font-weight:600">${i + 1}</td>
          <td>
            <b>${esc(nomeLimpo)}</b>
            ${cnpjFmt ? `<div style="font-size:9px;color:var(--x5);font-family:'JetBrains Mono',monospace;font-weight:400;margin-top:1px">${cnpjFmt}${ufExtra}</div>` : ""}
          </td>
          <td style="text-align:center"><span class="abc-cl ${clsCls}">${esc(c.classe)}</span></td>
          <td class="r mono" style="font-weight:600;color:var(--n9)">${fmtMoney(c.valorFaturado)}</td>
          <td class="r">${pctCell}</td>
          <td class="r mono">${scoreCell}</td>
          <td style="text-align:center">${protCell}</td>
          <td style="text-align:center">${procCell}</td>
          <td>${chipVinculo}</td>
        </tr>`;
      }).join("");

      const totalComVinculo = (d.sacadosAnalisados ?? []).filter(s => s.vinculos?.temVinculo).length;
      const totalSacadosAnalisados = (d.sacadosAnalisados ?? []).length;
      const totalClientesABC = abcLocal.totalClientesNaBase ?? 0;

      return `${stitle("Principais Sacados da Carteira")}
      <div class="ge-block">
        <div class="ge-header">
          <span class="title">Top ${top.length} sacados por concentração de receita</span>
          <span class="count">${totalClientesABC} cliente${totalClientesABC > 1 ? "s" : ""} na base · Top 3: ${fmtPct(abcLocal.concentracaoTop3)} · Top 5: ${fmtPct(abcLocal.concentracaoTop5)}</span>
        </div>
        ${totalComVinculo > 0 ? `<div style="padding:8px 14px;background:#FEF2F2;border-bottom:1px solid var(--x1);font-size:11px;color:#991B1B"><b>⚠ ${totalComVinculo} de ${totalSacadosAnalisados}</b> sacado(s) com vínculo detectado — detalhe na pág 9.</div>` : ""}
        <table class="ge-tbl">
          <thead><tr>
            <th style="width:30px">#</th>
            <th>Sacado</th>
            <th style="width:54px;text-align:center">Cl.</th>
            <th class="r" style="width:100px">Faturamento</th>
            <th class="r" style="width:90px">% Rec. (acum)</th>
            <th class="r" style="width:78px">Score</th>
            <th style="text-align:center;width:54px" title="Protestos vigentes">Prot.</th>
            <th style="text-align:center;width:54px" title="Processos passivos">Proc.</th>
            <th style="width:120px">Vínculo</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
    })()}

    <!-- 9. Pleito -->
    ${pleitoHtml}

    <!-- 9.5 Pleito do Comitê -->
    ${pleitoComiteHtml}

    <!-- 9b. Sugestão do Analista (lida no comitê) — texto livre -->
    ${(() => {
      const txt = (d.relatorioVisita?.sugestaoAnalista ?? "").trim();
      if (!txt) return "";
      // Preserva quebras de linha do textarea como <br>; escapa HTML antes.
      const html = esc(txt).replace(/\n/g, "<br>");
      return `${stitle("Sugestão do Analista")}
      <div style="background:#FFF8E1;border:1px solid #FCD34D;border-left:4px solid #D97706;border-radius:8px;padding:14px 16px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:#1F2937">${html}</div>`;
    })()}

    <!-- 9c. Análise Contábil — Vanessa -->
    ${(() => {
      const txt = ((d as { analiseContabil?: string }).analiseContabil ?? "").trim();
      if (!txt) return "";
      const html = esc(txt).replace(/\n/g, "<br>");
      return `${stitle("Análise Contábil — Vanessa")}
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-left:4px solid #2563EB;border-radius:8px;padding:14px 16px;margin-bottom:12px;font-size:12.5px;line-height:1.55;color:#1F2937">${html}</div>`;
    })()}

    <!-- 9d. GEFIP — resumo executivo (detalhe na pág 9) -->
    ${(() => {
      const g = d.gefip;
      if (!g || (g.competencias?.length ?? 0) === 0) return "";
      const atrasos = g.competenciasEmAtraso ?? 0;
      const danger = atrasos > 0;
      return `${stitle("Compliance Trabalhista (GEFIP)")}
      <div class="kpi-snap c4" style="margin-bottom:10px">
        <div class="icell ${danger ? "danger" : "success"}">
          <div class="l">Situação</div>
          <div class="v sm ${danger ? "red" : "green"}">${danger ? `${atrasos} em atraso` : "Regular"}</div>
        </div>
        <div class="icell"><div class="l">Período</div><div class="v sm">${esc(g.competenciaInicio || "—")} → ${esc(g.competenciaFim || "—")}</div></div>
        <div class="icell"><div class="l">Funcionários</div><div class="v sm">${g.totalFuncionarios ?? 0}</div></div>
        <div class="icell"><div class="l">FGTS + INSS</div><div class="v sm mono" style="font-size:10px">${esc(g.valorFgtsTotal || "—")} / ${esc(g.valorInssTotal || "—")}</div></div>
      </div>`;
    })()}

    <!-- 10. Análise -->
    ${analiseHtml}

    <!-- 11. Percepção -->
    ${percHtml}
  </div>`;

  return page(content, 3, date);
}


// ─── Parecer Preliminar (última página) ───────────────────────────────────────
function pageParecer(params: PDFReportParams, date: string, pageNum = 10): string {
  const ai = params.aiAnalysis;
  const parecer = ai?.parecer;
  const resumo = params.resumoExecutivo ||
    (typeof parecer === "object" ? parecer?.resumoExecutivo : "") ||
    ai?.resumoExecutivo || "";

  const score = params.finalRating ?? 0;
  const sc = scoreColor(score);
  const sb = scoreBorder(score);
  const decBg2 = decisionBg(params.decision ?? "");

  // Pleito info for the pending state
  const cl = params.creditLimit;
  const pleitoSummary = cl ? `
    <div class="istrip ${HIDE_AVALIACAO ? "c2" : "c4"}" style="margin-top:20px">
      ${HIDE_AVALIACAO ? "" : `<div class="icell ${cl.classificacao === "APROVADO" ? "success" : cl.classificacao === "CONDICIONAL" ? "warn" : "danger"}">
        <div class="l">Decisão</div>
        <div class="v sm ${cl.classificacao === "APROVADO" ? "green" : cl.classificacao === "CONDICIONAL" ? "" : "red"}">${esc(cl.classificacao ?? "—")}</div>
      </div>`}
      <div class="icell"><div class="l">Limite Aprovado</div><div class="v sm mono">${cl.limiteAjustado ? "R$\u00a0" + cl.limiteAjustado.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</div></div>
      <div class="icell"><div class="l">Prazo</div><div class="v">${cl.prazo ? cl.prazo + " dias" : "—"}</div></div>
      ${HIDE_AVALIACAO ? "" : `<div class="icell"><div class="l">Score</div><div class="v" style="color:${sc}">${score > 0 ? score.toFixed(1) : "—"}</div></div>`}
    </div>` : "";

  let content = "";
  if (!resumo && !ai) {
    content = `
    <div style="text-align:center;padding:32px 0 16px;color:var(--x4);font-size:12px">Parecer pendente — análise de IA não disponível</div>
    ${pleitoSummary}`;
  } else {
    content = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:20px">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--n9);margin-bottom:8px">Resumo Executivo</div>
        <div style="font-size:12px;color:var(--x7);line-height:1.7;text-align:justify">${esc(resumo) || "—"}</div>
      </div>
      ${HIDE_AVALIACAO ? `<div style="text-align:center;min-width:100px;align-self:center">${BANNER_CALIBRACAO_LIGHT}</div>` : `<div style="text-align:center;min-width:100px">
        <div style="width:72px;height:72px;border-radius:50%;border:3px solid ${sb};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px">
          <div style="font-size:26px;font-weight:700;color:${sc};line-height:1">${score.toFixed(1)}</div>
          <div style="font-size:10px;color:var(--x4)">/10</div>
        </div>
        <div style="display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;background:${decBg2};color:#fff">${fmtDecision(params.decision)}</div>
      </div>`}
    </div>
    ${params.observacoes ? `${stitle("Observações")}
    <div class="perc"><div class="perc-text">${esc(params.observacoes)}</div></div>` : ""}
    `;
  }

  return page(`${stitle("Parecer Preliminar")}${content}`, pageNum, date);
}

// ─── Page 4: Divisor — Avaliação Estratégica de Crédito ──────────────────────
function pageDivisorAvaliacaoEstrategica(): string {
  return `
<div class="page page-divider" style="background:var(--n8);display:flex;flex-direction:column;align-items:stretch;justify-content:center;padding:0;position:relative;overflow:hidden;min-height:700px">
  <!-- Barra verde no topo -->
  <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#73b815,rgba(115,184,21,0.2))"></div>

  <!-- Conteúdo central -->
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center;padding:0 60px">
    <div style="width:48px;height:2px;background:#73b815;border-radius:2px"></div>
    <div style="font-size:11px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.22em;font-weight:600">Relatório de Crédito</div>
    <div style="font-size:32px;font-weight:800;color:#fff;line-height:1.2;max-width:480px">Avalia&ccedil;&atilde;o Estrat&eacute;gica de Cr&eacute;dito</div>
    <div style="width:48px;height:2px;background:#73b815;border-radius:2px"></div>
    <div style="font-size:10px;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.15em;margin-top:8px">capital<span style="color:#73b815">finan&ccedil;as</span></div>
  </div>

  <!-- Rodapé padrão (mesmo tamanho/estrutura das demais páginas; cores invertidas pro fundo escuro) -->
  <div class="ftr" style="background:rgba(0,0,0,0.25);border-top:1px solid rgba(255,255,255,0.1)">
    <span style="color:rgba(255,255,255,0.5)">Capital Finanças · Relatório de Due Diligence · Documento Confidencial</span>
    <span style="color:rgba(255,255,255,0.5)">Pág. 4</span>
  </div>
</div>`;
}

// ─── Page 5: Parâmetros (Limite de Crédito) ──────────────────────────────────
function pageParametros(params: PDFReportParams, date: string): string {
  const content = `
    ${params.creditLimit ? `${stitle("Limite de Crédito Calculado")}
    <div class="istrip c4" style="margin-bottom:8px">
      <div class="icell ${params.creditLimit.classificacao === "APROVADO" ? "success" : params.creditLimit.classificacao === "CONDICIONAL" ? "warn" : "danger"}">
        <div class="l">Limite Aprovado</div>
        <div class="v ${params.creditLimit.classificacao === "APROVADO" ? "green" : params.creditLimit.classificacao === "CONDICIONAL" ? "" : "red"}">${params.creditLimit.limiteAjustado ? "R$\u00a0" + params.creditLimit.limiteAjustado.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</div>
        <div class="sub">${esc(params.creditLimit.classificacao)}</div>
      </div>
      <div class="icell"><div class="l">Limite Base</div><div class="v sm mono">${params.creditLimit.limiteBase ? "R$\u00a0" + params.creditLimit.limiteBase.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</div></div>
      <div class="icell"><div class="l">Prazo</div><div class="v">${params.creditLimit.prazo ? params.creditLimit.prazo + " dias" : "—"}</div></div>
      <div class="icell"><div class="l">Revisão em</div><div class="v sm">${params.creditLimit.revisaoDias ? params.creditLimit.revisaoDias + " dias" : "—"}</div>${params.creditLimit.dataRevisao ? `<div class="sub">${fmtDate(params.creditLimit.dataRevisao)}</div>` : ""}</div>
    </div>
    <div class="istrip c3" style="margin-bottom:8px">
      <div class="icell"><div class="l">FMM Base</div><div class="v sm mono">${params.creditLimit.fmmBase ? "R$\u00a0" + params.creditLimit.fmmBase.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</div></div>
      <div class="icell"><div class="l">Fator de Redução</div><div class="v sm">${params.creditLimit.fatorReducao ? (params.creditLimit.fatorReducao * 100).toFixed(0) + "%" : "—"}</div></div>
      <div class="icell"><div class="l">Conc. máx. sacado</div><div class="v sm">${params.creditLimit.concentracaoMaxPct ? params.creditLimit.concentracaoMaxPct.toFixed(0) + "%" : "—"}</div></div>
    </div>
    ${(params.creditLimit.taxaSugerida ?? 0) > 0 ? `
    <div class="istrip c3" style="margin-bottom:8px">
      <div class="icell navy">
        <div class="l">Taxa Sugerida</div>
        <div class="v">${params.creditLimit.taxaSugerida!.toFixed(2)}% a.m.</div>
        <div class="sub">Base: ${params.creditLimit.taxaBase?.toFixed(2)}% · Rating ${esc(params.creditLimit.ratingV2 ?? "—")}</div>
        ${params.creditLimit.taxaAjustes && params.creditLimit.taxaAjustes.length > 0 ? `<div class="ajustes">${params.creditLimit.taxaAjustes.map(a => `<span class="ajuste-tag">${esc(a)}</span>`).join("")}</div>` : ""}
      </div>
    </div>` : `
    <div class="istrip c3" style="margin-bottom:8px">
      <div class="icell danger">
        <div class="l">Taxa</div>
        <div class="v red">Não opera</div>
        <div class="sub">Rating ${esc(params.creditLimit.ratingV2 ?? "F")} — operação não recomendada</div>
      </div>
    </div>`}` : '<div style="color:var(--x4);font-size:12px;padding:20px;text-align:center">Limite de crédito não calculado</div>'}
  `;

  return page(content, 5, date);
}

// ─── Page 7: Faturamento Detalhado ────────────────────────────────────────────
function pageFaturamento(params: PDFReportParams, date: string): string {
  const fat = params.data.faturamento;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meses = sortMesCrono(Array.from(new Map((fat?.meses ?? []).map((m: any) => [m.mes as string, m])).values())).slice(-12);
  // Mesmo fix defensivo da síntese: recalcula direto dos meses visíveis.
  const _fatSomaVis = meses.reduce((s, m) => s + numVal((m as { valor: string }).valor), 0);
  const _fatFMMVis  = meses.length > 0 ? _fatSomaVis / meses.length : 0;
  const fmm = meses.length > 0 ? String(_fatFMMVis) : (fat?.fmm12m ?? fat?.mediaAno ?? "—");
  const total12 = meses.length > 0 ? String(_fatSomaVis) : (fat?.somatoriaAno ?? "—");
  const fmmMedio = fat?.fmmMedio ?? "";
  const ultimoMesComDados = fat?.ultimoMesComDados ?? "";
  const tendencia = fat?.tendencia ?? "indefinido";
  const tendLabel = tendencia === "crescimento" ? "↑ crescimento" : tendencia === "queda" ? "↓ queda" : "→ estável";
  const tendColor2 = tendencia === "crescimento" ? "var(--g6)" : tendencia === "queda" ? "var(--r6)" : "var(--x5)";
  const tendCell = tendencia === "queda" ? "danger" : tendencia === "crescimento" ? "success" : "";

  const bars = meses.length > 0 ? buildBars(meses) : "";

  // Meses zerados
  const mesesZerados = fat?.mesesZerados ?? [];
  const zeradosNote = mesesZerados.length > 0
    ? `<div class="alert mod" style="margin-top:8px"><span class="atag">MOD</span> ${mesesZerados.length} mês(es) com faturamento zerado: ${mesesZerados.map(m => esc(m.mes)).join(", ")}</div>`
    : "";

  // FMM por ano
  const fmmAnual = fat?.fmmAnual ? Object.entries(fat.fmmAnual) : [];
  const fmmAnualHtml = fmmAnual.length > 1 ? `${stitle("FMM por ano")}
    <div class="istrip" style="grid-template-columns:repeat(${Math.min(fmmAnual.length,4)},1fr)">
      ${fmmAnual.slice(-4).map(([ano, v]) => `<div class="icell"><div class="l">${esc(ano)}</div><div class="v sm mono">${fmtMoneyAbr(v)}</div></div>`).join("")}
    </div>` : "";

  const content = `
    ${stitle("02 · Faturamento")}
    <div class="istrip c4" style="margin-bottom:16px">
      <div class="icell navy"><div class="l">FMM 12M</div><div class="v">${fmtMoneyAbr(fmm)}</div><div class="sub">média últimos 12m</div></div>
      <div class="icell navy"><div class="l">Total 12M</div><div class="v">${fmtMoneyAbr(total12)}</div><div class="sub">soma 12 meses</div></div>
      <div class="icell"><div class="l">FMM Médio</div><div class="v">${fmmMedio ? fmtMoneyAbr(fmmMedio) : esc(String(meses.length))}</div><div class="sub">${fmmMedio ? "média anos completos" : "meses disponíveis"}</div></div>
      <div class="icell ${tendCell}"><div class="l">Tendência</div><div class="v" style="color:${tendColor2}">${esc(tendLabel)}</div><div class="sub">${ultimoMesComDados ? `até ${esc(ultimoMesComDados)}` : "ano a ano"}</div></div>
    </div>
    <div class="chart-box">
      <div class="chart-title">Faturamento mensal — últimos 12 meses</div>
      <div style="position:relative">
        <div class="bars">${bars || '<div style="color:var(--x4);font-size:12px;align-self:center">Dados não disponíveis</div>'}</div>
        ${meses.length > 1 ? buildTrendSvg(meses) : ""}
      </div>
      <div class="kpi-row"><span>FMM: <b>${fmtMoneyAbr(fmm)}</b></span><span>Total: <b>${fmtMoneyAbr(total12)}</b></span><span>Var: <b style="color:${tendColor2}">${esc(tendLabel)}</b></span></div>
    </div>
    ${zeradosNote}
    ${fmmAnualHtml}
  `;

  return page(content, 6, date);
}

// ─── Page 9: SCR + DRE ───────────────────────────────────────────────────────
function pageProtestosProcessos(params: PDFReportParams, date: string): string {
  const prot = params.data.protestos;
  const proc = params.data.processos;

  // Protestos
  const vigQtd = numVal(prot?.vigentesQtd ?? "0");
  const vigVal = prot?.vigentesValor ?? "0";
  const regQtd = numVal(prot?.regularizadosQtd ?? "0");
  const regVal = prot?.regularizadosValor ?? "0";
  const fiscQtd = numVal(prot?.fiscaisQtd ?? "0");
  const fiscVal = prot?.fiscaisValor ?? "0";
  const pefinData = params.data.pefin;
  const refinData = params.data.refin;
  const pefinQtd = pefinData?.qtd ?? 0;
  const refinQtd = refinData?.qtd ?? 0;
  const pefinVal = pefinData?.valor ?? 0;
  const refinVal = refinData?.valor ?? 0;

  // Group credores
  const credorMap: Record<string, {qtd:number;valor:number;ultimo:string}> = {};
  (prot?.detalhes ?? []).filter(p => !p.regularizado).forEach(p => {
    const k = p.credor || "Desconhecido";
    if (!credorMap[k]) credorMap[k] = {qtd:0,valor:0,ultimo:""};
    credorMap[k].qtd++;
    credorMap[k].valor += numVal(p.valor);
    if (!credorMap[k].ultimo || p.data > credorMap[k].ultimo) credorMap[k].ultimo = p.data;
  });
  const credorRows = Object.entries(credorMap).slice(0, 5).map(([nome, d]) =>
    `<tr><td class="b">${esc(nome)}</td><td class="r">${d.qtd}</td><td class="r red">${fmtMoney(d.valor)}</td><td class="r">${fmtDate(d.ultimo)}</td></tr>`
  ).join("");

  const top5Prot = [...(prot?.detalhes ?? [])].filter(p => !p.regularizado).sort((a,b) => numVal(b.valor)-numVal(a.valor)).slice(0,5);
  const top5ProtRows = top5Prot.map(p =>
    `<tr><td>${fmtDate(p.data)}</td><td>${esc(p.credor)}</td><td class="r red">${fmtMoney(p.valor)}</td><td>${p.regularizado ? "Regularizado" : "Vigente"}</td></tr>`
  ).join("");

  // Processos — total = passivo + ativo (decisão produto 2026-05-10)
  const passivo = proc?.poloPassivoQtd ?? proc?.passivosTotal ?? "—";
  const ativo = proc?.poloAtivoQtd ?? proc?.ativosTotal ?? "—";
  const totalProc = numVal(passivo) + numVal(ativo);
  const temRJ = proc?.temRJ || proc?.temFalencia;

  const distRows = (proc?.distribuicao ?? []).map(d => {
    const pct = parseFloat(d.pct) || 0;
    const isFiscal = (d.tipo ?? "").toLowerCase().includes("fiscal");
    return `<div class="prop-row"><span class="prop-label">${esc(d.tipo)}</span><div class="prop-fill${isFiscal ? " red" : ""}" style="width:${Math.min(pct,100)}%"></div><span class="prop-pct">${d.qtd} proc. <span style="color:var(--x4);font-weight:400">${d.pct ? "· " + d.pct + "%" : ""}</span></span></div>`;
  }).join("");

  const top5Proc = (proc?.top10Recentes ?? []).slice(0,5);
  const top5ProcRows = top5Proc.map(p =>
    `<tr><td class="${(p.tipo ?? "").toLowerCase().includes("fiscal") ? "red" : ""}">${esc(p.tipo)}</td><td>${esc(p.partes || "—")}</td><td>${fmtDate(p.data)}</td><td>${esc(p.assunto)}</td><td>${fmt(p.fase)}</td></tr>`
  ).join("");

  // Top 10 por valor — suprimido se todos os valores forem zero
  const top10Valor = (proc?.top10Valor ?? []).slice(0,10);
  const hasNonZeroValues = top10Valor.some(p => numVal(p.valor) > 0);
  const top10ValorRows = hasNonZeroValues ? top10Valor.map(p => {
    const isFiscal = (p.tipo ?? "").toLowerCase().includes("fiscal");
    return `<tr>
      <td class="${isFiscal ? "red" : "b"}">${esc(p.tipo)}</td>
      <td>${esc(p.partes)}</td>
      <td>${fmtDate(p.data)}</td>
      <td class="r red">${p.valor && p.valor !== "0" ? fmtMoney(p.valor) : "—"}</td>
      <td>${fmt(p.fase)}</td>
    </tr>`;
  }).join("") : "";

  // Distribuição temporal de processos
  const distTempProc = (proc?.distribuicaoTemporal ?? []);
  const distTempProcRows = distTempProc.map(d =>
    `<tr><td class="b">${esc(d.periodo)}</td><td class="r">${esc(d.qtd)}</td><td class="r" style="color:var(--x5)">${fmtMoneyAbr(d.valor)}</td></tr>`
  ).join("");

  // Distribuição por faixa de valor de processos
  const distFaixaProc = (proc?.distribuicaoPorFaixa ?? []);
  const distFaixaProcRows = distFaixaProc.map(d => {
    const pct = parseFloat(String(d.pct)) || 0;
    return `<tr>
      <td class="b">${esc(d.faixa)}</td>
      <td class="r">${esc(d.qtd)}</td>
      <td class="r" style="color:var(--x5)">${fmtMoneyAbr(d.valor)}</td>
      <td><span class="dist-bar" style="width:${Math.min(pct,100)}px"></span> ${esc(d.pct)}</td>
    </tr>`;
  }).join("");

  // Distribuição temporal de protestos (campo extra não obrigatório no tipo)
  type DistTempItem = {periodo:string;qtd:string;valor:string};
  type DistFaixaItem = {faixa:string;qtd:string;valor:string;pct:string};
  const distTempProt = ((prot as unknown as {distribuicaoTemporal?:DistTempItem[]})?.distribuicaoTemporal ?? []);
  const distTempProtRows = distTempProt.map((d: DistTempItem) =>
    `<tr><td class="b">${esc(d.periodo)}</td><td class="r">${esc(d.qtd)}</td><td class="r red">${fmtMoney(d.valor)}</td></tr>`
  ).join("");

  // Distribuição por faixa de protestos
  const distFaixaProt = ((prot as unknown as {distribuicaoPorFaixa?:DistFaixaItem[]})?.distribuicaoPorFaixa ?? []);
  const distFaixaProtRows = distFaixaProt.map((d: DistFaixaItem) => {
    const pct = parseFloat(String(d.pct)) || 0;
    return `<tr>
      <td class="b">${esc(d.faixa)}</td>
      <td class="r">${esc(d.qtd)}</td>
      <td class="r red">${fmtMoney(d.valor)}</td>
      <td><span class="dist-bar" style="width:${Math.min(pct,100)}px"></span> ${esc(d.pct)}</td>
    </tr>`;
  }).join("");

  // Top 10 mais recentes protestos — ordena por data ISO-comparável para suportar formato BR "DD/MM/AAAA"
  const dateKey = (d: string): string => {
    if (!d) return "";
    const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return d; // já ISO ou outro formato — fica como está
  };
  const top10ProtRecentes = [...(prot?.detalhes ?? [])].filter(p => !p.regularizado).sort((a,b) => dateKey(b.data).localeCompare(dateKey(a.data))).slice(0,10);
  const top10ProtRecentesRows = top10ProtRecentes.map(p =>
    `<tr><td>${fmtDate(p.data)}</td><td class="b">${esc(p.credor)}</td><td class="r red">${fmtMoney(p.valor)}</td><td>${p.regularizado ? '<span style="color:var(--g6)">Reg.</span>' : '<span style="color:var(--r6)">Vigente</span>'}</td></tr>`
  ).join("");

  const content = `
    ${stitle("03 · Protestos")}
    <div class="istrip c4" style="margin-bottom:8px">
      <div class="icell ${vigQtd > 0 ? "danger" : "success"}"><div class="l">Vigentes (Qtd)</div><div class="v ${vigQtd > 0 ? "red" : "green"}">${vigQtd}</div></div>
      <div class="icell ${vigQtd > 0 ? "danger" : ""}"><div class="l">Vigentes (R$)</div><div class="v ${vigQtd > 0 ? "red" : "muted"} sm mono">${fmtMoney(vigVal)}</div></div>
      <div class="icell ${regQtd > 0 ? "success" : ""}"><div class="l">Regularizados (Qtd)</div><div class="v ${regQtd > 0 ? "green" : "muted"}">${regQtd}</div></div>
      <div class="icell"><div class="l">Regularizados (R$)</div><div class="v muted sm mono">${fmtMoney(regVal)}</div></div>
    </div>
    ${(fiscQtd > 0 || pefinQtd > 0 || refinQtd > 0) ? `
    <div class="istrip c4" style="margin-bottom:14px">
      <div class="icell ${fiscQtd > 0 ? "warn" : ""}"><div class="l">Fiscais / Impostos</div><div class="v ${fiscQtd > 0 ? "" : "muted"}">${fiscQtd > 0 ? fiscQtd : "—"}</div>${fiscQtd > 0 ? `<div class="sub mono" style="font-size:10px;color:var(--a5)">${fmtMoney(fiscVal)}</div>` : ""}</div>
      <div class="icell ${pefinQtd > 0 ? "danger" : ""}"><div class="l">PEFIN (SPC)</div><div class="v ${pefinQtd > 0 ? "red" : "muted"}">${pefinQtd > 0 ? pefinQtd : "—"}</div>${pefinQtd > 0 ? `<div class="sub mono" style="font-size:10px;color:var(--r6)">${fmtMoney(String(pefinVal))}</div>` : ""}</div>
      <div class="icell ${refinQtd > 0 ? "danger" : ""}"><div class="l">REFIN (Serasa)</div><div class="v ${refinQtd > 0 ? "red" : "muted"}">${refinQtd > 0 ? refinQtd : "—"}</div>${refinQtd > 0 ? `<div class="sub mono" style="font-size:10px;color:var(--r6)">${fmtMoney(String(refinVal))}</div>` : ""}</div>
      <div class="icell"><div class="l">Total Negativações</div><div class="v ${(pefinQtd+refinQtd) > 0 ? "red" : "muted"}">${pefinQtd + refinQtd > 0 ? pefinQtd + refinQtd : "—"}</div></div>
    </div>` : ""}
    ${fiscQtd > 0 ? `${stitle("Protestos Fiscais / Impostos")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Data</th><th>Credor / Órgão</th><th class="r">Valor</th><th>Status</th></tr></thead>
      <tbody>${(prot?.detalhes ?? []).filter(p => p.tipoCredor === "fiscal" && !p.regularizado).map(p =>
        `<tr><td>${fmtDate(p.data)}</td><td class="b">${esc(p.credor || p.apresentante || "—")}</td><td class="r red">${fmtMoney(p.valor)}</td><td><span style="color:var(--a5)">Fiscal</span></td></tr>`
      ).join("")}</tbody>
    </table>` : ""}
    ${pefinQtd > 0 ? `${stitle("PEFIN — Pendências SPC")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Data</th><th>Credor</th><th class="r">Valor</th><th>Modalidade</th></tr></thead>
      <tbody>${(pefinData?.lista ?? []).map((r: {data?:string;valor?:number;credor?:string;modalidade?:string;contrato?:string}) =>
        `<tr><td>${fmtDate(r.data ?? "")}</td><td>${esc(r.credor ?? "—")}</td><td class="r red">${fmtMoney(String(r.valor ?? 0))}</td><td style="color:var(--x5)">${esc(r.modalidade ?? "—")}</td></tr>`
      ).join("")}</tbody>
    </table>` : ""}
    ${refinQtd > 0 ? `${stitle("REFIN — Pendências Serasa")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Data</th><th>Credor</th><th class="r">Valor</th><th>Modalidade</th></tr></thead>
      <tbody>${(refinData?.lista ?? []).map((r: {data?:string;valor?:number;credor?:string;modalidade?:string;contrato?:string}) =>
        `<tr><td>${fmtDate(r.data ?? "")}</td><td>${esc(r.credor ?? "—")}</td><td class="r red">${fmtMoney(String(r.valor ?? 0))}</td><td style="color:var(--x5)">${esc(r.modalidade ?? "—")}</td></tr>`
      ).join("")}</tbody>
    </table>` : ""}
    ${distTempProtRows ? `${stitle("Distribuição temporal")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Período</th><th class="r">Qtd</th><th class="r">Valor</th></tr></thead>
      <tbody>${distTempProtRows}</tbody>
    </table>` : ""}
    ${distFaixaProtRows ? `${stitle("Distribuição por faixa de valor")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Faixa</th><th class="r">Qtd</th><th class="r">Valor</th><th>Proporção</th></tr></thead>
      <tbody>${distFaixaProtRows}</tbody>
    </table>` : credorRows ? `${stitle("Agrupamento por credor")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Credor</th><th class="r">Qtd</th><th class="r">Valor Total</th><th class="r">Último</th></tr></thead>
      <tbody>${credorRows}</tbody>
    </table>` : ""}
    ${top10ProtRecentesRows ? `${stitle("Top 10 mais recentes")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Data</th><th>Credor</th><th class="r">Valor</th><th>Status</th></tr></thead>
      <tbody>${top10ProtRecentesRows}</tbody>
    </table>` : top5ProtRows ? `${stitle("Top 5 por valor")}
    <table class="tbl">
      <thead><tr><th>Data</th><th>Credor</th><th class="r">Valor</th><th>Status</th></tr></thead>
      <tbody>${top5ProtRows}</tbody>
    </table>` : ""}
    ${vigQtd > 2 ? `<div class="alert alta"><span class="atag">ALTA</span> ${vigQtd} protestos vigentes — ${fmtMoneyAbr(vigVal)}</div>` : ""}

    ${stitle("04 · Processos judiciais")}
    <div class="istrip c4" style="margin-bottom:14px">
      <div class="icell ${totalProc > 5 ? "warn" : totalProc > 0 ? "" : "success"}"><div class="l">Total Processos</div><div class="v ${totalProc > 5 ? "" : totalProc > 0 ? "" : "green"}">${totalProc}</div></div>
      <div class="icell ${numVal(passivo) > 5 ? "danger" : ""}"><div class="l">Polo Passivo</div><div class="v ${numVal(passivo) > 5 ? "red" : ""}">${fmt(passivo)}</div></div>
      <div class="icell"><div class="l">Polo Ativo</div><div class="v">${fmt(ativo)}</div></div>
      <div class="icell ${temRJ ? "danger" : "success"}"><div class="l">Falência / RJ</div><div class="v ${temRJ ? "red" : "green"}">${temRJ ? "Sim" : "Não"}</div></div>
    </div>
    ${proc?.valorTotalEstimado ? `<div class="icell navy" style="margin-bottom:14px;display:inline-block;min-width:200px"><div class="l">Valor Total Estimado</div><div class="v sm mono">${fmtMoney(proc.valorTotalEstimado)}</div></div>` : ""}
    ${distRows ? `${stitle("Distribuição por tipo")}<div style="margin-bottom:14px">${distRows}</div>` : ""}
    ${top10ValorRows ? `${stitle("Top 10 por valor")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Tipo</th><th>Contraparte</th><th>Data</th><th class="r">Valor</th><th>Fase</th></tr></thead>
      <tbody>${top10ValorRows}</tbody>
    </table>` : top5ProcRows ? `${stitle("Top 5 mais recentes")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Tipo</th><th>Credor</th><th>Data</th><th>Assunto</th><th>Fase</th></tr></thead>
      <tbody>${top5ProcRows}</tbody>
    </table>` : ""}
    ${distTempProcRows ? `${stitle("Distribuição temporal")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Período</th><th class="r">Qtd</th><th class="r">Valor Est.</th></tr></thead>
      <tbody>${distTempProcRows}</tbody>
    </table>` : ""}
    ${distFaixaProcRows ? `${stitle("Distribuição por faixa de valor")}
    <table class="tbl" style="margin-bottom:12px">
      <thead><tr><th>Faixa</th><th class="r">Qtd</th><th class="r">Valor</th><th>Proporção</th></tr></thead>
      <tbody>${distFaixaProcRows}</tbody>
    </table>` : ""}
    ${numVal(passivo) > 5 ? `<div class="alert alta"><span class="atag">ALTA</span> ${fmt(passivo)} processos no polo passivo — verificar detalhes</div>` : totalProc > 5 ? `<div class="alert mod"><span class="atag">MOD</span> ${totalProc} processos judiciais identificados — verificar detalhes</div>` : ""}
    ${temRJ ? `<div class="alert alta"><span class="atag">ALTA</span> Pedido de falência ou recuperação judicial identificado</div>` : ""}

    ${(() => {
      const ccf = params.data.ccf;
      if (!ccf) return "";
      const ccfQtd = ccf.qtdRegistros ?? 0;
      const tendLabel = (ccf.tendenciaLabel ?? "").toLowerCase();
      const tendCls = tendLabel === "crescimento" ? "danger" : tendLabel === "queda" ? "success" : "";
      const tendValCls = tendLabel === "crescimento" ? "red" : tendLabel === "queda" ? "green" : "muted";
      const tendStr = tendLabel ? (tendLabel.charAt(0).toUpperCase() + tendLabel.slice(1)) + (ccf.tendenciaVariacao != null ? ` (${ccf.tendenciaVariacao > 0 ? "+" : ""}${ccf.tendenciaVariacao.toFixed(0)}%)` : "") : "—";
      const bancosRows = (ccf.bancos ?? []).map(b =>
        `<tr>
          <td class="b">${esc(b.banco)}</td>
          <td style="color:var(--x5)">${b.agencia ?? "—"}</td>
          <td class="r ${b.quantidade > 0 ? "red" : "muted"}"><b>${b.quantidade}</b></td>
          <td class="r" style="color:var(--x5)">${b.dataUltimo ?? "—"}</td>
          <td style="color:var(--x5)">${b.motivo ?? "—"}</td>
        </tr>`
      ).join("");
      return `
        ${stitle("05 · CCF — Cheques Sem Fundo")}
        <div class="istrip c3" style="margin-bottom:10px">
          <div class="icell ${ccfQtd > 0 ? "danger" : "success"}"><div class="l">Registros CCF</div><div class="v ${ccfQtd > 0 ? "red" : "green"}">${ccfQtd > 0 ? `<b>${ccfQtd}</b>` : "Sem ocorrências"}</div></div>
          <div class="icell ${tendCls}"><div class="l">Tendência 6 meses</div><div class="v ${tendValCls} sm">${tendStr}</div></div>
        </div>
        ${bancosRows ? `${stitle("Registros por banco")}
        <table class="tbl" style="margin-bottom:10px">
          <thead><tr><th>Banco</th><th>Agência</th><th class="r">Qtd</th><th class="r">Último</th><th>Motivo</th></tr></thead>
          <tbody>${bancosRows}</tbody>
        </table>` : ""}
        ${ccfQtd > 0 && tendLabel === "crescimento" ? `<div class="alert mod"><span class="atag">MOD</span> CCF em crescimento — ${ccfQtd} registro(s) com tendência de alta nos últimos 6 meses</div>` : ccfQtd > 0 ? `<div class="alert alta"><span class="atag">ALTA</span> ${ccfQtd} registro(s) de cheque sem fundo identificado(s)</div>` : ""}
      `;
    })()}

    ${(() => {
      const da = params.data.dividaAtiva;
      if (!da || (da.qtdRegistros === 0 && !da.certidaoNegativa)) return "";
      if (da.certidaoNegativa) {
        return `${stitle("Dívida Ativa (PGFN/UF/Município)")}
        <div class="alert" style="background:#f0fdf4;border-color:#bbf7d0;color:#15803d"><span class="atag" style="background:#16a34a;color:#fff">NEGATIVA</span> Certidão negativa — sem débitos inscritos${da.dataConsulta ? ` (consulta ${esc(da.dataConsulta)})` : ""}</div>`;
      }
      // Ordena inscrições do mais RECENTE pro mais antigo (decisão Victor 2026-05-11).
      // Converte DD/MM/AAAA → AAAA-MM-DD pra comparação lexicográfica correta.
      // Datas vazias/inválidas vão pro fim.
      const dataKey = (s: string | undefined): string => {
        const m = (s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
      };
      const registrosSorted = [...(da.registros ?? [])].sort(
        (a, b) => dataKey(b.dataInscricao).localeCompare(dataKey(a.dataInscricao))
      );
      const rows = registrosSorted.map(r => `<tr>
        <td>${esc(r.origem || "—")}</td>
        <td class="mono" style="font-size:10px">${esc(r.numeroInscricao || "—")}</td>
        <td class="r red mono">${esc(r.valor || "—")}</td>
        <td>${esc(r.situacao || "—")}</td>
        <td style="white-space:nowrap">${esc(r.dataInscricao || "—")}</td>
        <td>${esc(r.natureza || "—")}</td>
      </tr>`).join("");
      // Comparativo BDC × PGFN: só renderiza quando temos AMBOS (analista
      // subiu certidão E orquestrador consultou BDC pra snapshot). Categoriza
      // as inscrições do BDC em "confirmadas" (também no PGFN), "fora da lista"
      // (BDC tem, PGFN não — provavelmente parceladas/SISPAR/pagas) e mostra
      // "novas no PGFN" (no PGFN mas não no BDC — BDC desatualizado).
      const bdc = params.data.dividaAtivaBDC;
      let comparativoBlock = "";
      if (bdc && bdc.qtdRegistros > 0 && da.qtdRegistros > 0) {
        const normInsc = (s: string | undefined) => (s ?? "").replace(/\D/g, "");
        const pgfnIds = new Set((da.registros ?? []).map(r => normInsc(r.numeroInscricao)).filter(Boolean));
        const bdcIds = new Set((bdc.registros ?? []).map(r => normInsc(r.numeroInscricao)).filter(Boolean));
        const foraDaLista = (bdc.registros ?? []).filter(r => {
          const id = normInsc(r.numeroInscricao);
          return id && !pgfnIds.has(id);
        });
        const novasPGFN = (da.registros ?? []).filter(r => {
          const id = normInsc(r.numeroInscricao);
          return id && !bdcIds.has(id);
        });
        const confirmadasQtd = bdcIds.size - foraDaLista.length;
        const deltaValor = numVal(da.valorTotal) - numVal(bdc.valorTotal);
        const deltaPct = numVal(bdc.valorTotal) > 0 ? Math.round((deltaValor / numVal(bdc.valorTotal)) * 100) : 0;
        const foraRows = foraDaLista.map(r => `<tr style="opacity:0.6">
          <td class="mono" style="font-size:10px">${esc(r.numeroInscricao || "—")}</td>
          <td style="font-size:11px">${esc(r.origem || "—")}</td>
          <td class="r mono" style="text-decoration:line-through;color:var(--x5)">${esc(r.valor || "—")}</td>
          <td style="font-size:10px;color:var(--x5)">${esc(r.situacao || "—")}</td>
        </tr>`).join("");
        const novasRows = novasPGFN.map(r => `<tr style="background:#fff7ed">
          <td class="mono" style="font-size:10px">${esc(r.numeroInscricao || "—")}</td>
          <td style="font-size:11px">${esc(r.origem || "—")}</td>
          <td class="r red mono">${esc(r.valor || "—")}</td>
          <td style="font-size:10px">${esc(r.situacao || "—")}</td>
        </tr>`).join("");
        comparativoBlock = `
        <div style="margin-top:14px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:9px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--x5)">Comparativo BDC × PGFN</span>
            <span style="flex:1;height:1px;background:var(--x2)"></span>
            <span style="font-size:10px;color:var(--x5)">PGFN é fonte autoritativa</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;font-size:11px">
            <div><div style="font-size:9px;color:var(--x4);text-transform:uppercase;letter-spacing:0.06em">BDC (snapshot)</div><div class="mono">${esc(bdc.valorTotal || "—")} · ${bdc.qtdRegistros}</div></div>
            <div><div style="font-size:9px;color:var(--x4);text-transform:uppercase;letter-spacing:0.06em">PGFN (oficial)</div><div class="mono"><b>${esc(da.valorTotal || "—")} · ${da.qtdRegistros}</b></div></div>
            <div><div style="font-size:9px;color:var(--x4);text-transform:uppercase;letter-spacing:0.06em">Confirmadas em ambos</div><div>${confirmadasQtd}</div></div>
            <div><div style="font-size:9px;color:var(--x4);text-transform:uppercase;letter-spacing:0.06em">Delta</div><div style="color:${deltaValor > 0 ? "var(--r6)" : "var(--g6)"}">${deltaValor > 0 ? "+" : ""}${deltaPct}%</div></div>
          </div>
          ${foraDaLista.length > 0 ? `
          <div style="margin-top:8px">
            <div style="font-size:10px;color:var(--x5);margin-bottom:4px">⊘ ${foraDaLista.length} inscrição(ões) no BDC ausente(s) do PGFN — provavelmente parceladas/quitadas após o snapshot</div>
            <table class="tbl" style="font-size:10px"><thead><tr><th>Inscrição</th><th>Origem</th><th class="r">Valor BDC</th><th>Situação BDC</th></tr></thead><tbody>${foraRows}</tbody></table>
          </div>` : ""}
          ${novasPGFN.length > 0 ? `
          <div style="margin-top:8px">
            <div style="font-size:10px;color:var(--a5);margin-bottom:4px">⚠ ${novasPGFN.length} inscrição(ões) no PGFN ausente(s) do BDC — provavelmente inscritas após o último crawl do BDC</div>
            <table class="tbl" style="font-size:10px"><thead><tr><th>Inscrição</th><th>Origem</th><th class="r">Valor PGFN</th><th>Situação</th></tr></thead><tbody>${novasRows}</tbody></table>
          </div>` : ""}
        </div>`;
      }
      return `${stitle("Dívida Ativa (PGFN/UF/Município)")}
      <div class="alert alta"><span class="atag">ALTA</span> <b>${da.qtdRegistros}</b> inscrição(ões) — total <b>${esc(da.valorTotal || "—")}</b>${da.dataConsulta ? ` · consulta ${esc(da.dataConsulta)}` : ""}${bdc ? ` · <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:99px;background:#dcfce7;color:#15803d;margin-left:4px">PGFN ✓</span>` : ""}</div>
      ${rows ? `<table class="tbl"><thead><tr><th>Origem</th><th>Inscrição</th><th class="r">Valor</th><th>Situação</th><th>Data</th><th>Natureza</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
      ${comparativoBlock}`;
    })()}

    ${(() => {
      const cen = params.data.cenprot;
      if (!cen || (cen.qtdRegistros === 0 && !cen.certidaoNegativa)) return "";
      const bureauVig = parseInt(params.data.protestos?.vigentesQtd || "0", 10);
      const div = cen.qtdRegistros !== bureauVig;
      const divergenciaBlock = div
        ? `<div class="alert mod"><span class="atag">MOD</span> Divergência: bureau registra <b>${bureauVig}</b> protesto(s) vigente(s); CENPROT (oficial) registra <b>${cen.qtdRegistros}</b>. Verificar manualmente.</div>`
        : "";
      if (cen.certidaoNegativa) {
        return `${stitle("CENPROT — Certidão Oficial de Protestos")}
        ${divergenciaBlock}
        <div class="alert" style="background:#f0fdf4;border-color:#bbf7d0;color:#15803d"><span class="atag" style="background:#16a34a;color:#fff">NEGATIVA</span> Certidão CENPROT negativa${cen.dataConsulta ? ` (emitida ${esc(cen.dataConsulta)})` : ""}</div>`;
      }
      // Helper de badge pra status do protesto (campo novo opcional).
      const statusCorCenprot = (s: string | undefined): string => {
        const lower = (s ?? "").toLowerCase();
        if (/pag|cancel|regular/.test(lower)) return "var(--g6)";  // verde — resolvido
        if (/sust/.test(lower)) return "var(--a5)";                 // âmbar — em discussão
        return "var(--r6)";                                          // vermelho — vigente/default
      };
      // Se algum registro tem status ou tipoTitulo, mostra as colunas novas.
      const algumStatus = (cen.registros ?? []).some(r => !!r.status);
      const algumTipo = (cen.registros ?? []).some(r => !!r.tipoTitulo);
      const rows = (cen.registros ?? []).map(r => `<tr>
        <td>${esc(r.cartorio || "—")}</td>
        <td style="white-space:nowrap">${esc([r.cidade, r.uf].filter(Boolean).join("/") || "—")}</td>
        <td style="white-space:nowrap">${esc(r.data || "—")}</td>
        <td class="r red mono">${esc(r.valor || "—")}</td>
        <td>${esc(r.cedente || "—")}</td>
        ${algumTipo ? `<td style="font-size:10px;color:var(--x7)">${esc(r.tipoTitulo || "—")}</td>` : ""}
        ${algumStatus ? `<td><span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:99px;background:rgba(0,0,0,0.04);color:${statusCorCenprot(r.status)}">${esc(r.status || "Vigente")}</span></td>` : ""}
      </tr>`).join("");
      return `${stitle("CENPROT — Certidão Oficial de Protestos")}
      ${divergenciaBlock}
      <div class="alert alta"><span class="atag">ALTA</span> <b>${cen.qtdRegistros}</b> protesto(s) certificado(s) — total <b>${esc(cen.valorTotal || "—")}</b>${cen.dataConsulta ? ` · emitida ${esc(cen.dataConsulta)}` : ""}</div>
      ${rows ? `<table class="tbl"><thead><tr><th>Cartório</th><th>Cidade/UF</th><th>Data</th><th class="r">Valor</th><th>Cedente</th>${algumTipo ? "<th>Tipo do título</th>" : ""}${algumStatus ? "<th>Status</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>` : ""}
      ${cen.chaveValidacao ? `<div style="margin-top:6px;font-size:9px;color:var(--x4);font-family:'JetBrains Mono',monospace;letter-spacing:0.04em">Validação: ${esc(cen.chaveValidacao)}</div>` : ""}`;
    })()}
  `;

  return page(content, 7, date);
}

// ─── SCR variation helper ──────────────────────────────────────────────────────
function scrVar(currV: string | undefined | null, prevV: string | undefined | null, higherIsBad: boolean): {cls:string;val:string} {
  const c = numVal(currV);
  const p = numVal(prevV);
  if (!p || p === 0) return {cls:"neutral",val:"—"};
  const diff = ((c - p) / Math.abs(p)) * 100;
  const absDiff = Math.abs(diff).toFixed(1);
  if (Math.abs(diff) < 0.5) return {cls:"neutral",val:"—"};
  if (diff > 0) return {cls: higherIsBad ? "up" : "down", val:`+${absDiff}%`};
  return {cls: higherIsBad ? "down" : "up", val:`-${absDiff}%`};
}

// ─── Page 9: SCR ─────────────────────────────────────────────────────────────
function pageSCRDRE(params: PDFReportParams, date: string): string {
  // Recalcula CP/LP/Total a partir das faixas (idempotente; protege dados antigos)
  if (params.data?.scr) params.data.scr = recomputeSCRTotals(params.data.scr);
  if (params.data?.scrAnterior) params.data.scrAnterior = recomputeSCRTotals(params.data.scrAnterior);
  const scrRawDRE = params.data.scr;
  const scrAntRawDRE = params.data.scrAnterior;
  // Sort by period: scr = more recent (Atual), scrAnt = older (Anterior)
  const parseScrPrdDRE = (s: string) => { const p = (s ?? "").split("/"); return p.length === 2 ? parseInt(p[1], 10) * 100 + parseInt(p[0], 10) : 0; };
  const shouldSwapDRE = scrRawDRE && scrAntRawDRE && parseScrPrdDRE(scrRawDRE.periodoReferencia) < parseScrPrdDRE(scrAntRawDRE.periodoReferencia);
  const scr = shouldSwapDRE ? scrAntRawDRE : scrRawDRE;
  const scrAnt = shouldSwapDRE ? scrRawDRE : scrAntRawDRE;
  // Compute totals from components (BACEN Responsabilidade Total = A Vencer + Vencidos + Prejuízos)
  const calcScrTotalDRE = (s: typeof scr) => !s ? 0 : numVal(s.carteiraCurtoPrazo || s.carteiraAVencer || "0") + numVal(s.carteiraLongoPrazo || "0") + numVal(s.vencidos || "0") + numVal(s.prejuizos || "0");
  const totalCurDRE = calcScrTotalDRE(scr);
  const totalPrvDRE = scrAnt ? calcScrTotalDRE(scrAnt) : null;

  // SCR comparative table with real variation
  let scrRows = "";
  if (scr) {
    type SCRMoneyField = "carteiraCurtoPrazo"|"carteiraLongoPrazo"|"carteiraAVencer"|"vencidos"|"prejuizos"|"limiteCredito"|"totalDividasAtivas";
    type SCRStrField = "qtdeInstituicoes"|"qtdeOperacoes";
    const moneyRow = (label:string, cat:string, field:SCRMoneyField, higherIsBad:boolean) => {
      const c = scr[field] ?? "—"; const p = scrAnt ? scrAnt[field] ?? "—" : "—";
      const v = scrVar(c, p, higherIsBad);
      return `<tr><td class="b">${esc(label)}</td><td style="color:var(--x4)">${esc(cat)}</td><td class="r">${fmtMoneyAbr(p)}</td><td class="r">${fmtMoneyAbr(c)}</td><td class="r var-cell ${v.cls}">${esc(v.val)}</td></tr>`;
    };
    const strRow = (label:string, cat:string, field:SCRStrField, higherIsBad:boolean) => {
      const c = scr[field] ?? "—"; const p = scrAnt ? scrAnt[field] ?? "—" : "—";
      const v = scrVar(c, p, higherIsBad);
      return `<tr><td class="b">${esc(label)}</td><td style="color:var(--x4)">${esc(cat)}</td><td class="r">${fmt(p)}</td><td class="r">${fmt(c)}</td><td class="r var-cell ${v.cls}">${esc(v.val)}</td></tr>`;
    };
    scrRows = [
      moneyRow("Curto Prazo","Carteira","carteiraCurtoPrazo",true),
      moneyRow("Longo Prazo","Carteira","carteiraLongoPrazo",true),
      moneyRow("A Vencer","Carteira","carteiraAVencer",true),
      moneyRow("Vencidos","Inadimplência","vencidos",true),
      // Prejuízos: write-off do BACEN. Estava ausente da tabela
      // (Total Dívidas já somava via calcScrTotalDRE, mas a linha intermediária
      // não aparecia — inconsistência reportada com seção "Risco Consolidado").
      moneyRow("Prejuízos","Inadimplência","prejuizos",true),
      moneyRow("Limite Crédito","Capacidade","limiteCredito",false),
      strRow("IFs","Capacidade","qtdeInstituicoes",false),
      strRow("Operações","Capacidade","qtdeOperacoes",false),
    ].join("");
    const vTotal = scrVar(String(totalCurDRE), totalPrvDRE !== null ? String(totalPrvDRE) : undefined, true);
    scrRows += `<tr class="total"><td class="b">Total Dívidas</td><td>Resumo</td><td class="r">${fmtMoneyAbr(totalPrvDRE)}</td><td class="r">${fmtMoneyAbr(totalCurDRE)}</td><td class="r var-cell ${vTotal.cls}">${esc(vTotal.val)}</td></tr>`;
  }

  // SCR Modalidades
  let modalSection = "";
  if (scr?.modalidades?.length) {
    const modRows = scr.modalidades.map(m => `<tr>
      <td class="b">${esc(m.nome)}</td>
      <td class="r">${fmtMoneyAbr(m.total)}</td>
      <td class="r">${fmtMoneyAbr(m.aVencer)}</td>
      <td class="r ${numVal(m.vencido) > 0 ? "red" : ""}">${fmtMoneyAbr(m.vencido)}</td>
      <td class="r">${fmtPct(m.participacao)}</td>
    </tr>`).join("");
    modalSection = `
    ${stitle("07 · Modalidades SCR")}
    <table class="tbl">
      <thead><tr><th>Modalidade</th><th class="r">Total</th><th class="r">A Vencer</th><th class="r">Vencido</th><th class="r">%</th></tr></thead>
      <tbody>${modRows}</tbody>
    </table>`;
  }

  // SCR Sócios PF
  let sociosSCRSection = "";
  if (params.data.scrSocios && params.data.scrSocios.length > 0) {
    const blocks = params.data.scrSocios.map(ss => {
      const sa = ss.periodoAtual;
      const sp = ss.periodoAnterior;
      const respAtiva = numVal(sa.carteiraAVencer) + numVal(sa.vencidos);
      const respAtivaAnt = sp ? numVal(sp.carteiraAVencer) + numVal(sp.vencidos) : null;
      const prejVal = numVal(sa.prejuizos);
      const semDivida = respAtiva === 0 && prejVal > 0;
      const vRespAtiva = respAtivaAnt !== null ? scrVar(String(respAtiva), String(respAtivaAnt), true) : { val: "—", cls: "" };
      const vPrej = sp ? scrVar(sa.prejuizos, sp.prejuizos, true) : { val: "—", cls: "" };
      const vAVencer = sp ? scrVar(sa.carteiraAVencer, sp.carteiraAVencer, false) : { val: "—", cls: "" };
      const vVencidos = sp ? scrVar(sa.vencidos, sp.vencidos, true) : { val: "—", cls: "" };
      const vencSocio = numVal(sa.vencidos);
      return `<div style="margin-bottom:14px;padding:14px;background:var(--x0);border-radius:8px;border:1px solid var(--x2)">
        <div style="font-size:12px;font-weight:700;color:var(--n9);margin-bottom:10px">${esc(ss.nomeSocio)} <span style="font-size:10px;color:var(--x5);font-family:'JetBrains Mono',monospace">${fmtCpf(ss.cpfSocio)}</span></div>
        <div class="istrip c6">
          <div class="icell"${semDivida ? ` title="Crédito baixado para prejuízo — sem dívida em cobrança ativa"` : ""}><div class="l">Dívida em Aberto</div><div class="v sm mono">${fmtMoneyAbr(String(respAtiva))}</div>${vRespAtiva.val !== "—" ? `<div class="sub var-cell ${vRespAtiva.cls}" style="font-size:9px">${esc(vRespAtiva.val)}</div>` : ""}${semDivida ? `<div class="sub" style="font-size:9px;font-style:italic;color:var(--x4)">sem cobrança ativa</div>` : ""}</div>
          <div class="icell ${prejVal > 0 ? "danger" : ""}"><div class="l">Prejuízos</div><div class="v sm mono ${prejVal > 0 ? "red" : ""}">${prejVal > 0 ? fmtMoneyAbr(sa.prejuizos) : "—"}</div>${prejVal > 0 ? `<div class="sub" style="font-size:9px;font-weight:700;color:#DC2626">⚠ Write-off</div>` : ""}${sp && vPrej.val !== "—" ? `<div class="sub var-cell ${vPrej.cls}" style="font-size:9px">${esc(vPrej.val)}</div>` : ""}</div>
          <div class="icell"><div class="l">A Vencer</div><div class="v sm mono">${fmtMoneyAbr(sa.carteiraAVencer)}</div>${sp && vAVencer.val !== "—" ? `<div class="sub var-cell ${vAVencer.cls}" style="font-size:9px">${esc(vAVencer.val)}</div>` : ""}</div>
          <div class="icell ${vencSocio > 0 ? "danger" : ""}"><div class="l">Vencidos</div><div class="v sm mono ${vencSocio > 0 ? "red" : ""}">${vencSocio > 0 ? fmtMoneyAbr(sa.vencidos) : "—"}</div>${sp && vVencidos.val !== "—" ? `<div class="sub var-cell ${vVencidos.cls}" style="font-size:9px">${esc(vVencidos.val)}</div>` : ""}</div>
          <div class="icell"><div class="l">Limite</div><div class="v sm mono ${numVal(sa.limiteCredito) === 0 ? "muted" : ""}">${numVal(sa.limiteCredito) > 0 ? fmtMoneyAbr(sa.limiteCredito) : "Não informado"}</div></div>
          <div class="icell"><div class="l">IFs</div><div class="v">${fmt(sa.qtdeInstituicoes)}</div></div>
        </div>
        <div class="inf" style="margin-top:6px;margin-bottom:0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <span>Período: <b>${esc(sa.periodoReferencia ?? "—")}</b>${sp ? ` · Anterior: <b>${esc(sp.periodoReferencia ?? "—")}</b>` : ""}</span>
          ${sa.urlRelatorio ? `<a href="${esc(sa.urlRelatorio)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;font-weight:600;color:var(--n8);text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid var(--n1);border-radius:4px;background:var(--n0)">🔗 Ver consulta DataBox360</a>` : ""}
        </div>
      </div>`;
    }).join("");
    // Patrimônio & bens Assertiva PF
    const bensSocios = (params.data.scrSocios ?? []).filter(ss =>
      ss.patrimonioEstimado || (ss.bensVeiculos?.length ?? 0) > 0 || (ss.bensImoveis?.length ?? 0) > 0
    );
    const bensSection = bensSocios.length > 0 ? `
      ${stitle("Patrimônio & Bens — Assertiva PF")}
      ${bensSocios.map(ss => `
        <div style="margin-bottom:14px;padding:14px;background:var(--x0);border-radius:8px;border:1px solid var(--x2)">
          <div style="font-size:12px;font-weight:700;color:var(--n9);margin-bottom:8px">${esc(ss.nomeSocio)}</div>
          ${ss.patrimonioEstimado ? `<div style="margin-bottom:8px;padding:8px 10px;background:var(--n0);border-radius:6px;display:inline-block">
            <div style="font-size:9px;color:var(--x4);font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Patrimônio Estimado</div>
            <div style="font-size:14px;font-weight:700;color:var(--n8)">${esc(ss.patrimonioEstimado)}</div>
          </div>` : ""}
          ${(ss.bensVeiculos?.length ?? 0) > 0 ? `
            <div style="margin-top:8px">
              <div style="font-size:10px;font-weight:700;color:var(--x4);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Veículos</div>
              <table class="tbl"><thead><tr><th>Placa</th><th>Modelo</th><th>Ano</th><th class="r">Valor FIPE</th><th>Situação</th></tr></thead>
              <tbody>${(ss.bensVeiculos ?? []).slice(0,5).map(v => `<tr>
                <td class="mono">${esc(v.placa || "—")}</td>
                <td>${esc(v.modelo || "—")}</td>
                <td>${v.ano || "—"}</td>
                <td class="r mono">${esc(v.valorFipe || "—")}</td>
                <td><span style="color:var(--x5);font-size:10px">${esc(v.situacao || "—")}</span></td>
              </tr>`).join("")}</tbody></table>
            </div>` : ""}
          ${(ss.bensImoveis?.length ?? 0) > 0 ? `
            <div style="margin-top:8px">
              <div style="font-size:10px;font-weight:700;color:var(--x4);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Imóveis</div>
              <table class="tbl"><thead><tr><th>Município/UF</th><th class="r">Área</th><th class="r">Valor Estimado</th><th>Matrícula</th></tr></thead>
              <tbody>${(ss.bensImoveis ?? []).slice(0,5).map(v => `<tr>
                <td>${esc(v.municipio || "—")}/${esc(v.uf || "—")}</td>
                <td class="r mono">${v.areaM2 ? `${v.areaM2}m²` : "—"}</td>
                <td class="r mono">${esc(v.valorEstimado || "—")}</td>
                <td style="color:var(--x5);font-size:10px">${esc(v.matricula || "—")}</td>
              </tr>`).join("")}</tbody></table>
            </div>` : ""}
        </div>`).join("")}` : "";

    sociosSCRSection = `${stitle("08 · SCR dos Sócios (PF)")}${blocks}${bensSection}`;
  }

  const scrPeriodoAtual = scr?.periodoReferencia ?? "—";
  const scrPeriodoAnt = scrAnt?.periodoReferencia ?? "—";

  let scrSection = "";
  if (scr) {
    const vencNum2 = numVal(scr.vencidos ?? "0");
    const pctVenc2 = totalCurDRE > 0 ? ((vencNum2/totalCurDRE)*100).toFixed(1)+"%" : "0,0%";
    const vKPIVenc = scrVar(scr.vencidos, scrAnt?.vencidos, true);
    const vKPITotal = scrVar(String(totalCurDRE), totalPrvDRE !== null ? String(totalPrvDRE) : undefined, true);
    scrSection = `
    ${stitle("06 · Comparativo SCR — Empresa (PJ)")}
    <div class="kpi-snap c4" style="margin-bottom:14px">
      <div class="icell ${totalCurDRE > 0 ? "navy" : ""}">
        <div class="l">Total Dívidas Ativas</div>
        <div class="v sm mono">${fmtMoneyAbr(totalCurDRE)}</div>
        ${vKPITotal.val !== "—" ? `<div class="sub var-cell ${vKPITotal.cls}">${esc(vKPITotal.val)} vs anterior</div>` : ""}
      </div>
      <div class="icell ${vencNum2 > 0 ? "danger" : "success"}">
        <div class="l">Vencidos</div>
        <div class="v sm mono ${vencNum2 > 0 ? "red" : "green"}">${fmtMoneyAbr(scr.vencidos)}</div>
        ${vKPIVenc.val !== "—" ? `<div class="sub var-cell ${vKPIVenc.cls}">${esc(vKPIVenc.val)} vs anterior</div>` : ""}
      </div>
      <div class="icell">
        <div class="l">% Vencido / Total</div>
        <div class="v ${vencNum2 > 0 ? "red" : "green"}">${pctVenc2}</div>
        <div class="sub">inadimplência</div>
      </div>
      <div class="icell navy">
        <div class="l">Limite de Crédito</div>
        <div class="v sm mono">${fmtMoneyAbr(scr.limiteCredito)}</div>
        <div class="sub">${fmt(scr.qtdeInstituicoes)} IFs · ${fmt(scr.qtdeOperacoes)} ops</div>
      </div>
    </div>
    <div class="inf" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <span>Período anterior: <b>${esc(scrPeriodoAnt)}</b> · Período atual: <b>${esc(scrPeriodoAtual)}</b></span>
      ${scr.urlRelatorio ? `<a href="${esc(scr.urlRelatorio)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;font-weight:600;color:var(--n8);text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid var(--n1);border-radius:4px;background:var(--n0)">🔗 Ver consulta DataBox360</a>` : ""}
    </div>
    <table class="tbl">
      <thead><tr><th>Métrica</th><th>Categoria</th><th class="r">${esc(scrPeriodoAnt)}</th><th class="r">${esc(scrPeriodoAtual)}</th><th class="r">Var.</th></tr></thead>
      <tbody>${scrRows}</tbody>
    </table>
    ${modalSection}
    ${sociosSCRSection}`;
  }

  const content = `${scrSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de SCR não disponíveis</div>`, 8, date);
}

// ─── Page 10: DRE + Balanço + ABC ────────────────────────────────────────────
function pageBalancoABC(params: PDFReportParams, date: string): string {
  const dre = params.data.dre;
  const bal = params.data.balanco;
  const abc = params.data.curvaABC;

  // Caixa de percepção editável inline. Sempre renderiza com placeholder
  // (vazia) — o renderer /r/[id]/route.ts substitui o conteúdo quando o
  // texto vem do banco (campos percepcao_dre/_faturamento/_balanco). Print:
  // se vazia, o ::before com texto italic é exibido pra deixar evidente
  // que o analista pode editar quando abrir com ?k=<token>.
  const editBox = (key: string, label: string) => `
    <div class="perc-box" data-edit-section="${key}">
      <div class="l">${esc(label)}</div>
      <!--EDIT:${key}:START--><div class="perc-box-content" data-edit-text="${key}" data-empty="true"></div><!--EDIT:${key}:END-->
    </div>`;

  // ── DRE ──────────────────────────────────────────────────────────────────────
  let dreSection = "";
  if (dre && dre.anos.length > 0) {
    const anos = dre.anos.slice(-2);
    const headers = anos.map(a => `<th class="r">${esc(a.ano)}</th>`).join("");
    const PCT_FIELDS = new Set(["margemBruta","margemEbitda","margemLiquida"]);
    // Tabela DRE detalhada (linha-a-linha) — extraída integralmente do
    // documento. Linhas com `subtle` ficam com fonte cinza (subitens das
    // despesas). Linhas com `total` ganham destaque negrito.
    type DreField = { label: string; key: keyof typeof anos[0]; subtle?: boolean; total?: boolean };
    const fields: DreField[] = [
      { label: "Receita Bruta",                 key: "receitaBruta",                   total: true },
      { label: "Deduções",                      key: "deducoes",                       subtle: true },
      { label: "Receita Líquida",               key: "receitaLiquida",                 total: true },
      { label: "CMV / Custos",                  key: "custoProdutosServicos",          subtle: true },
      { label: "Lucro Bruto",                   key: "lucroBruto",                     total: true },
      { label: "Margem Bruta",                  key: "margemBruta" },
      { label: "Despesas comerciais",           key: "despesasComerciais",             subtle: true },
      { label: "Despesas com pessoal",          key: "despesasPessoal",                subtle: true },
      { label: "Despesas gerais",               key: "despesasGerais",                 subtle: true },
      { label: "Despesas financeiras",          key: "despesaFinanceira",              subtle: true },
      { label: "Receitas financeiras",          key: "receitasFinanceiras",            subtle: true },
      { label: "Resultado operacional (EBIT)",  key: "resultadoOperacional",           total: true },
      { label: "EBITDA",                        key: "ebitda" },
      { label: "Margem EBITDA",                 key: "margemEbitda" },
      { label: "Despesas não operacionais",     key: "despesasNaoOperacionais",        subtle: true },
      { label: "Receitas não operacionais",     key: "receitasNaoOperacionais",        subtle: true },
      { label: "Resultado antes IR/CSLL",       key: "lucroAntesIR",                   total: true },
      { label: "Provisão IR/CSLL",              key: "impostoRenda",                   subtle: true },
      { label: "Lucro Líquido do Exercício",    key: "lucroLiquido",                   total: true },
      { label: "Margem Líquida",                key: "margemLiquida" },
    ];
    // Filtra linhas onde TODOS os anos estão vazios — campos opcionais (ex:
    // não operacionais) podem não aparecer em todas as DREs.
    const visibleFields = fields.filter(f => {
      return anos.some(a => {
        const v = a[f.key];
        return v != null && v !== "" && v !== "—" && v !== "0,00";
      });
    });

    const dreRows = visibleFields.map(f => {
      const isPct = PCT_FIELDS.has(f.key as string);
      const labelStyle = f.total
        ? `font-weight:700;color:var(--n9)`
        : f.subtle
          ? `font-weight:400;color:var(--x5);padding-left:14px`
          : `font-weight:600;color:var(--x7)`;
      const rowBg = f.total ? `background:var(--x0)` : "";
      const cells = anos.map(a => {
        const v = a[f.key];
        if (v == null || v === "" || v === "—") return `<td class="r" style="color:var(--x4)">—</td>`;
        if (isPct) {
          const formatted = fmtPct(v);
          const isNeg = numVal(v) < 0;
          return `<td class="r ${isNeg ? "red" : ""}">${formatted}</td>`;
        }
        const isNeg = numVal(v) < 0;
        const weight = f.total ? "font-weight:700" : "";
        return `<td class="r ${isNeg ? "red" : ""}" style="${weight}">${fmtMoney(v)}</td>`;
      }).join("");
      return `<tr style="${rowBg}"><td style="${labelStyle}">${esc(f.label)}</td>${cells}</tr>`;
    }).join("");

    const lastAno = dre.anos[dre.anos.length - 1];
    const ml = numVal(lastAno?.margemLiquida ?? "0");
    const dreAlerts = [
      ml < -30 ? `<div class="alert alta"><span class="atag">ALTA</span> Margem líquida ${fmtPct(lastAno?.margemLiquida)} — operação deficitária</div>` : "",
      numVal(lastAno?.ebitda ?? "0") < 0 ? `<div class="alert alta"><span class="atag">ALTA</span> EBITDA negativo ${fmtMoneyAbr(lastAno?.ebitda)} — não gera caixa operacional</div>` : "",
    ].filter(Boolean).join("");

    const tableBody = `<thead><tr><th>Métrica</th>${headers}</tr></thead><tbody>${dreRows}</tbody>`;

    const lastDre = dre.anos[dre.anos.length - 1];
    const ml2 = numVal(lastDre?.margemLiquida ?? "0");
    const mb2 = numVal(lastDre?.margemBruta ?? "0");
    const me2 = numVal(lastDre?.margemEbitda ?? "0");
    dreSection = `
    ${stitle("09 · Demonstração de Resultado (DRE)")}
    <div class="kpi-snap c4" style="margin-bottom:14px">
      <div class="icell navy">
        <div class="l">Receita Bruta (${esc(lastDre?.ano ?? "—")})</div>
        <div class="v sm mono">${fmtMoneyAbr(lastDre?.receitaBruta)}</div>
      </div>
      <div class="icell ${mb2 < 0 ? "danger" : mb2 < 15 ? "warn" : "success"}">
        <div class="l">Margem Bruta</div>
        <div class="v ${mb2 < 0 ? "red" : mb2 < 15 ? "" : "green"}">${fmtPct(lastDre?.margemBruta)}</div>
      </div>
      <div class="icell ${me2 < 0 ? "danger" : me2 < 10 ? "warn" : "success"}">
        <div class="l">Margem EBITDA</div>
        <div class="v ${me2 < 0 ? "red" : me2 < 10 ? "" : "green"}">${fmtPct(lastDre?.margemEbitda)}</div>
      </div>
      <div class="icell ${ml2 < 0 ? "danger" : ml2 < 5 ? "warn" : "success"}">
        <div class="l">Margem Líquida</div>
        <div class="v ${ml2 < 0 ? "red" : ml2 < 5 ? "" : "green"}">${fmtPct(lastDre?.margemLiquida)}</div>
      </div>
    </div>
    <table class="tbl">${tableBody}</table>
    ${dreAlerts}
    ${editBox("dre", "Percepção do Analista — DRE")}`;
    // Caixa "Percepção do Analista — Faturamento" foi movida pra pág 3
    // (síntese), abaixo do bloco "Faturamento & SCR", pra ficar próxima
    // do conteúdo do assunto (decisão Victor 2026-05-11).
  }

  let balSection = "";
  if (bal && bal.anos.length > 0) {
    const anos = bal.anos.slice(-2);
    const headers = anos.map(a => `<th class="r" style="width:90px">${esc(a.ano)}</th>`).join("");

    // Renderiza uma "sub-row" indentada — total, item canônico ou subconta.
    type SubRow = { label: string; values: string[]; emphasis?: "total" | "subtotal" | "sub" };
    const renderRow = (r: SubRow): string => {
      const labelStyle = r.emphasis === "total"
        ? `font-weight:700;color:var(--n9)`
        : r.emphasis === "subtotal"
          ? `font-weight:700;color:var(--x9)`
          : `font-weight:400;color:var(--x5);padding-left:14px;font-size:11px`;
      const rowBg = r.emphasis === "total" ? `background:var(--x0)` : "";
      const cells = r.values.map(v => {
        if (!v || v === "—" || v === "0,00") return `<td class="r" style="color:var(--x4)">—</td>`;
        const isNeg = numVal(v) < 0;
        const weight = r.emphasis === "total" || r.emphasis === "subtotal" ? "font-weight:700" : "";
        return `<td class="r mono ${isNeg ? "red" : ""}" style="${weight}">${fmtMoney(v)}</td>`;
      }).join("");
      return `<tr style="${rowBg}"><td style="${labelStyle}">${esc(r.label)}</td>${cells}</tr>`;
    };

    // Pretty-print de chave snake_case do JSON do Gemini → "Title Case BR".
    const labelFromKey = (k: string): string => {
      return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    };

    // Constrói linhas de uma seção: subtotal + canônicos não-zero + detalhes
    // livres. Pula campos que não existem em todos os anos (nem 1).
    const buildSection = (
      label: string,
      totalKey: keyof import("@/types").BalancoAno,
      canonical: Array<{ label: string; key: keyof import("@/types").BalancoAno }>,
      detalhesKey: keyof import("@/types").BalancoAno,
    ): SubRow[] => {
      const out: SubRow[] = [];
      out.push({
        label,
        values: anos.map(a => String(a[totalKey] ?? "—")),
        emphasis: "subtotal",
      });
      for (const c of canonical) {
        const values = anos.map(a => String(a[c.key] ?? ""));
        const algumPreenchido = values.some(v => v && v !== "—" && v !== "0,00");
        if (!algumPreenchido) continue;
        out.push({ label: c.label, values, emphasis: "sub" });
      }
      // Une as chaves dos `detalhes` de TODOS os anos, sem duplicar
      const allDetalhesKeys = new Set<string>();
      for (const a of anos) {
        const d = a[detalhesKey] as Record<string, string> | undefined;
        if (d) Object.keys(d).forEach(k => allDetalhesKeys.add(k));
      }
      for (const k of Array.from(allDetalhesKeys).sort()) {
        const values = anos.map(a => {
          const d = a[detalhesKey] as Record<string, string> | undefined;
          return d?.[k] ?? "";
        });
        out.push({ label: labelFromKey(k), values, emphasis: "sub" });
      }
      return out;
    };

    // ── Coluna ATIVO ─────────────────────────────────────────────────────────
    const ativoRows: SubRow[] = [
      ...buildSection(
        "Ativo Circulante",
        "ativoCirculante",
        [
          { label: "Disponível",         key: "caixaEquivalentes" },
          { label: "Clientes",           key: "contasAReceber" },
          { label: "Estoque",            key: "estoques" },
          { label: "Outros",             key: "outrosAtivosCirculantes" },
        ],
        "detalhesAtivoCirculante",
      ),
      ...buildSection(
        "Ativo Não Circulante",
        "ativoNaoCirculante",
        [
          { label: "Realizável a LP",    key: "realizavelLongoPrazo" },
          { label: "Imobilizado",        key: "imobilizado" },
          { label: "Intangível",         key: "intangivel" },
          { label: "Outros",             key: "outrosAtivosNaoCirculantes" },
        ],
        "detalhesAtivoNaoCirculante",
      ),
      { label: "Total Ativos", values: anos.map(a => String(a.ativoTotal ?? "—")), emphasis: "total" },
    ];

    // ── Coluna PASSIVO + PL ──────────────────────────────────────────────────
    const passivoRows: SubRow[] = [
      ...buildSection(
        "Passivo Circulante",
        "passivoCirculante",
        [
          { label: "Fornecedores",       key: "fornecedores" },
          { label: "Empréstimos CP",     key: "emprestimosCP" },
          { label: "Outros",             key: "outrosPassivosCirculantes" },
        ],
        "detalhesPassivoCirculante",
      ),
      ...buildSection(
        "Passivo Não Circulante",
        "passivoNaoCirculante",
        [
          { label: "Empréstimos LP",     key: "emprestimosLP" },
          { label: "Outros",             key: "outrosPassivosNaoCirculantes" },
        ],
        "detalhesPassivoNaoCirculante",
      ),
      ...buildSection(
        "Patrimônio Líquido",
        "patrimonioLiquido",
        [
          { label: "Capital Social",     key: "capitalSocial" },
          { label: "Lucros Acumulados",  key: "lucrosAcumulados" },
          { label: "Reservas",           key: "reservas" },
        ],
        "detalhesPL",
      ),
      // Total Passivo + PL = passivoTotal (que já inclui PL no balanço Brasil)
      { label: "Total Passivo + PL", values: anos.map(a => String(a.passivoTotal ?? "—")), emphasis: "total" },
    ];

    const subTable = (titulo: string, rows: SubRow[]) => `
      <table class="tbl" style="margin:0">
        <thead><tr><th>${titulo}</th>${headers}</tr></thead>
        <tbody>${rows.map(renderRow).join("")}</tbody>
      </table>`;

    const lastBal = bal.anos[bal.anos.length - 1];
    const pl = numVal(lastBal?.patrimonioLiquido ?? "0");

    balSection = `
    ${stitle("10 · Balanço Patrimonial")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:10px">
      ${subTable("ATIVO", ativoRows)}
      ${subTable("PASSIVO + PL", passivoRows)}
    </div>
    ${pl < 0 ? `<div class="alert alta" style="margin-top:8px"><span class="atag">ALTA</span> PL negativo ${fmtMoneyAbr(lastBal?.patrimonioLiquido)} — passivo a descoberto</div>` : ""}
    ${editBox("balanco", "Percepção do Analista — Balanço Patrimonial")}`;
  }

  // ── Indicadores Financeiros (Balanço + DRE) ─────────────────────────────────
  // Tabela de 15 indicadores calculados deterministicamente em lib/analyze/.
  // Cores por threshold (verde/amarelo/vermelho) — sem alertas automáticos.
  // Mostra até 3 anos do mais antigo pro mais recente quando disponível.
  let indicadoresSection = "";
  {
    const ind = calcularIndicadores(bal, dre);
    if (ind.anos.length > 0) {
      const anosShow = ind.anos.slice(-3); // últimos 3 anos
      const headerCells = anosShow.map(a => `<th class="r" style="width:80px">${esc(a.ano)}</th>`).join("");
      const showDelta = anosShow.length >= 2;
      const deltaHeader = showDelta ? `<th style="text-align:center;width:36px" title="Tendência último vs penúltimo ano">Δ</th>` : "";

      const linhas = INDICADORES_TABELA.map(({ chave, nome }) => {
        const cells = anosShow.map(a => {
          const v = a[chave];
          // Quando PL ≤ 0, Dívida÷PL e Participação de Terceiros não fazem sentido.
          // Mostra "PL≤0" em vermelho pra deixar explícito que é contexto crítico,
          // não simples falta de dado.
          if (a.plNegativo && (chave === "dividaPL" || chave === "participacaoTerceiros")) {
            return `<td class="r mono" style="color:var(--r6);font-weight:600;font-size:10px" title="Patrimônio Líquido negativo — fórmula perde sentido">PL≤0</td>`;
          }
          const sev = classificarIndicador(chave, v);
          const txt = formatarIndicador(chave, v);
          const color =
            sev === "g" ? "var(--g6)" :
            sev === "a" ? "var(--a5)" :
            sev === "r" ? "var(--r6)" : "var(--x7)";
          const weight = sev === "" ? "400" : "600";
          return `<td class="r mono" style="color:${color};font-weight:${weight}">${esc(txt)}</td>`;
        }).join("");

        let deltaCell = "";
        if (showDelta) {
          const prev = anosShow[anosShow.length - 2][chave];
          const curr = anosShow[anosShow.length - 1][chave];
          const arrow = tendencia(prev, curr);
          deltaCell = `<td style="text-align:center;color:var(--x5);font-weight:700">${arrow || "—"}</td>`;
        }

        return `<tr>
          <td><b>${esc(nome)}</b></td>
          ${cells}
          ${deltaCell}
        </tr>`;
      }).join("");

      const analiseTexto = (params.indicadoresAnalise ?? "").trim();
      const analiseBlock = analiseTexto
        ? `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-left:4px solid #2563EB;border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:12px;line-height:1.55;color:#1F2937">
            <div style="font-size:9px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Análise · gerada por IA</div>
            ${esc(analiseTexto)}
          </div>`
        : "";

      indicadoresSection = `
      ${stitle("11 · Indicadores Financeiros")}
      <div style="font-size:11px;color:var(--x5);margin-bottom:10px">Indicadores calculados a partir do Balanço Patrimonial e DRE. Cores indicam zona de atenção (verde = saudável, amarelo = atenção, vermelho = crítico).</div>
      <table class="ge-tbl" style="margin-bottom:${analiseTexto ? "12px" : "14px"}">
        <thead><tr>
          <th>Indicador</th>
          ${headerCells}
          ${deltaHeader}
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      ${analiseBlock}`;
    }
  }

  let abcSection = "";
  if (abc && abc.clientes.length > 0) {
    const top3Pct = abc.concentracaoTop3 ?? "—";
    const top5Pct = abc.concentracaoTop5 ?? "—";
    const totalCli = abc.totalClientesNaBase ?? 0;
    const maxVal2 = numVal(abc.clientes[0]?.valorFaturado ?? "0");
    const abcRows = abc.clientes.slice(0, 10).map((c, i) => {
      const barW2 = maxVal2 > 0 ? Math.round((numVal(c.valorFaturado)/maxVal2)*100) : 0;
      const clsCls2 = (c.classe ?? "c").toLowerCase();
      return `<tr>
        <td><span class="abc-rank">${i+1}</span></td>
        <td class="b">${esc(c.nome)}<div class="abc-bar" style="width:${barW2}%"></div></td>
        <td class="r">${fmtMoney(c.valorFaturado)}</td>
        <td class="r b">${fmtPct(c.percentualReceita)}</td>
        <td class="r b">${fmtPct(c.percentualAcumulado)}</td>
        <td><span class="abc-cl ${clsCls2}">${esc(c.classe)}</span></td>
      </tr>`;
    }).join("");

    abcSection = `
    ${stitle("12 · Curva ABC — Concentração de sacados")}
    <div class="istrip c3" style="margin-bottom:10px">
      <div class="icell warn"><div class="l">Top 3 Clientes</div><div class="v" style="color:var(--a5)">${fmtPct(top3Pct)}</div></div>
      <div class="icell warn"><div class="l">Top 5 Clientes</div><div class="v" style="color:var(--a5)">${fmtPct(top5Pct)}</div></div>
      <div class="icell"><div class="l">Total Clientes</div><div class="v">${totalCli}</div></div>
    </div>
    <div class="abc-wrap">
      <table class="tbl" style="border:none;margin:0">
        <thead><tr><th style="width:40px">#</th><th>Cliente</th><th class="r">Faturamento</th><th class="r">% Rec.</th><th class="r">% Acum.</th><th style="width:50px">Cl.</th></tr></thead>
        <tbody>${abcRows}</tbody>
      </table>
    </div>
    <div class="abc-summary">Top 3: <b>${fmtPct(top3Pct)}</b> · Top 5: <b>${fmtPct(top5Pct)}</b> · Total clientes: <b>${totalCli}</b></div>
    ${abc.alertaConcentracao && abc.clientes[0] ? `<div class="alert alta" style="margin-top:8px"><span class="atag">ALTA</span> ${esc(abc.clientes[0].nome)} concentra ${fmtPct(abc.clientes[0].percentualReceita)} da receita — acima do limite recomendado</div>` : ""}`;
  }

  // ── Sacados analisados (top 5 PJ da Curva ABC com bureau + cruzamento) ──
  let sacadosSection = "";
  const sacados = params.data.sacadosAnalisados ?? [];
  if (sacados.length > 0) {
    const fmtCnpj14 = (c: string) =>
      c?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") ?? "—";

    const sacadoBlocks = sacados.map((s) => {
      // Conjunto de tipos de vínculo detectados — formatado como chips
      const tiposVinculo: string[] = [];
      if (s.vinculos.cpfSocioComum.length > 0) tiposVinculo.push("CPF de sócio em comum");
      if (s.vinculos.maesComuns.length > 0) tiposVinculo.push("mãe comum");
      if (s.vinculos.parentescoBDC.length > 0) tiposVinculo.push("parentesco");
      if (s.vinculos.enderecoIdentico) tiposVinculo.push("endereço idêntico");
      if (s.vinculos.sobrenomesUF.length > 0) tiposVinculo.push("sobrenome + UF");

      // Detalhamento expandido — qual sócio cedente bate com qual sócio sacado
      const detalheLinhas: string[] = [];
      s.vinculos.cpfSocioComum.forEach((v) => {
        detalheLinhas.push(`<li><b>CPF comum</b> — ${esc(v.nomeSocioCedente)} (cedente) ↔ ${esc(v.nomeSocioSacado)} (sacado)</li>`);
      });
      s.vinculos.maesComuns.forEach((v) => {
        detalheLinhas.push(`<li><b>Mesma mãe</b> — ${esc(v.socioCedenteNome)} ↔ ${esc(v.socioSacadoNome)} (mãe: ${esc(v.maeComum)})</li>`);
      });
      s.vinculos.parentescoBDC.forEach((v) => {
        detalheLinhas.push(`<li><b>Parentesco BDC</b> — ${esc(v.nome)} (${esc(v.tipo)}, origem: ${esc(v.origem)})</li>`);
      });
      if (s.vinculos.enderecoIdentico) {
        detalheLinhas.push(`<li><b>Endereço idêntico</b> — ${esc(s.vinculos.enderecoCedente ?? "")}</li>`);
      }
      s.vinculos.sobrenomesUF.forEach((v) => {
        detalheLinhas.push(`<li><b>Sobrenome ${esc(v.sobrenome)}</b> (${esc(v.uf)}) — ${esc(v.nomeSocioCedente)} ↔ ${esc(v.nomeSocioSacado)}</li>`);
      });

      const chipVinculo = s.vinculos.temVinculo
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">🚩 Parte relacionada</span>`
        : `<span style="display:inline-flex;padding:3px 8px;background:var(--x1);color:var(--x5);border-radius:4px;font-size:10px;font-weight:600">Sem vínculo</span>`;

      const fonteLabel: Record<string, string> = {
        credithub: "CreditHub",
        bdc: "BigDataCorp",
        ambos: "CH + BDC",
      };
      const fonteChip = s.fonteBureau
        ? `<span style="font-size:9px;color:var(--x5);padding:2px 6px;background:var(--x1);border-radius:3px;text-transform:uppercase;letter-spacing:0.04em">${esc(fonteLabel[s.fonteBureau] ?? s.fonteBureau)}</span>`
        : "";

      const protRed = (s.protestosQtd ?? 0) > 0;
      const procRed = (s.processosPassivos ?? 0) > 0;

      return `
      <div style="margin-bottom:12px;padding:14px;background:var(--x0);border-radius:8px;border:1px solid var(--x2);${s.vinculos.temVinculo ? "border-left:4px solid #DC2626;" : ""}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:var(--n9);margin-bottom:2px">
              <span style="display:inline-block;background:var(--n8);color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;margin-right:6px;font-weight:700">${s.posicao ?? "—"}</span>
              ${esc(s.razaoSocial)}
            </div>
            <div style="font-size:10px;color:var(--x5);font-family:'JetBrains Mono',monospace">${fmtCnpj14(s.cnpj)}${s.uf ? ` · ${esc(s.uf)}` : ""}${s.classe ? ` · Classe <b>${esc(s.classe)}</b>` : ""}${s.participacaoFaturamentoPct ? ` · ${esc(s.participacaoFaturamentoPct)} do faturamento` : ""}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${fonteChip}${chipVinculo}</div>
        </div>
        <div class="istrip c4">
          <div class="icell"><div class="l">Score (Assertiva)</div><div class="v sm">${s.score ?? "—"}${s.scoreClasse ? ` <span style="font-size:9px;color:var(--x5)">${esc(s.scoreClasse)}</span>` : ""}</div></div>
          <div class="icell ${protRed ? "danger" : ""}"><div class="l">Protestos vigentes</div><div class="v sm ${protRed ? "red" : ""}">${s.protestosQtd ?? 0}${s.protestosValorTotal ? ` <span style="font-size:9px;color:var(--x5)">${esc(s.protestosValorTotal)}</span>` : ""}</div></div>
          <div class="icell ${procRed ? "danger" : ""}"><div class="l">Processos passivos</div><div class="v sm ${procRed ? "red" : ""}">${s.processosPassivos ?? 0}${s.processosValorTotal ? ` <span style="font-size:9px;color:var(--x5)">${esc(s.processosValorTotal)}</span>` : ""}</div></div>
          <div class="icell"><div class="l">Sócios identificados</div><div class="v sm">${s.socios.length}</div></div>
        </div>
        ${tiposVinculo.length > 0 ? `<div style="margin-top:8px;font-size:10px;color:var(--x5)"><b style="color:#991B1B">Vínculos detectados:</b> ${tiposVinculo.map(t => esc(t)).join(" · ")}</div>` : ""}
        ${detalheLinhas.length > 0 ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:10px;color:var(--x4);line-height:1.5">${detalheLinhas.join("")}</ul>` : ""}
        ${(s.protestosDetalhes?.length ?? 0) > 0 ? `
        <div style="margin-top:10px">
          <div style="font-size:10px;font-weight:700;color:var(--x4);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Protestos vigentes</div>
          <table class="tbl" style="margin:0;font-size:10px">
            <thead><tr><th>Data</th><th>Credor</th><th class="r">Valor</th><th>Cidade/UF</th></tr></thead>
            <tbody>${(s.protestosDetalhes ?? []).map(p => `<tr>
              <td style="white-space:nowrap">${esc(p.data || "—")}</td>
              <td>${esc(p.credor || "—")}</td>
              <td class="r mono ${p.regularizado ? "" : "red"}">${esc(p.valor || "—")}</td>
              <td style="white-space:nowrap">${esc([p.cidade, p.uf].filter(Boolean).join("/") || "—")}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>` : ""}
        ${(s.processosDetalhes?.length ?? 0) > 0 ? `
        <div style="margin-top:10px">
          <div style="font-size:10px;font-weight:700;color:var(--x4);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Processos passivos (top 10 por valor)</div>
          <table class="tbl" style="margin:0;font-size:10px">
            <thead><tr><th>Data</th><th>Contraparte</th><th>Tipo</th><th>Status</th><th class="r">Valor</th></tr></thead>
            <tbody>${(s.processosDetalhes ?? []).map(p => `<tr>
              <td style="white-space:nowrap">${esc(p.data || "—")}</td>
              <td>${esc(p.contraparte || "—")}</td>
              <td><span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:var(--x1);color:var(--x5)">${esc(p.tipo || "—")}</span></td>
              <td><span style="font-size:9px;color:var(--x5)">${esc(p.status || "—")}</span></td>
              <td class="r mono red">${esc(p.valor || "—")}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>` : ""}
      </div>`;
    }).join("");

    const totalComVinculo = sacados.filter(s => s.vinculos.temVinculo).length;
    sacadosSection = `
    ${stitle("12 · Análise dos Top 5 Sacados — Bureau + Partes Relacionadas")}
    <div style="font-size:11px;color:var(--x5);margin-bottom:10px">Consulta CreditHub + BigDataCorp para os principais sacados da Curva ABC. Cruzamento de sócios indica possível parte relacionada (CPF comum, mãe comum, endereço, sobrenome + UF).</div>
    ${totalComVinculo > 0 ? `<div class="alert alta" style="margin-bottom:10px"><span class="atag">ATENÇÃO</span> <b>${totalComVinculo} de ${sacados.length}</b> sacado(s) com vínculo detectado com o cedente — verificar relacionamento societário/familiar antes da operação.</div>` : ""}
    ${sacadoBlocks}`;
  }

  // ── GEFIP / FGTS / INSS — Compliance Trabalhista ──
  let gefipSection = "";
  const gefip = params.data.gefip;
  if (gefip && (gefip.competencias?.length ?? 0) > 0) {
    const atrasos = gefip.competenciasEmAtraso ?? 0;
    const danger = atrasos > 0;
    // Mostra coluna Folha só se alguma competência tem o dado
    const algumaFolha = gefip.competencias.some(c => !!c.folhaPagamento);
    // Validação de cabeçalho: alerta visual se cnpj declarado ≠ cnpj do cedente
    const cnpjCedente = (params.data.cnpj?.cnpj ?? "").replace(/\D/g, "");
    const cnpjDecl = (gefip.cnpjDeclarado ?? "").replace(/\D/g, "");
    const cnpjDivergente = !!cnpjDecl && !!cnpjCedente && cnpjDecl !== cnpjCedente;
    // Título adapta ao tipo de declaração detectado
    const tituloGefip = gefip.tipoDeclaracao
      ? `12 · ${esc(gefip.tipoDeclaracao)} (FGTS/INSS) — Compliance Trabalhista`
      : "12 · GEFIP / FGTS / INSS — Compliance Trabalhista";

    const compRows = gefip.competencias.map(c => {
      const atraso = !!c.situacao && !/recolhid|quitad|regular/i.test(c.situacao);
      const temPenalidade = !!(c.valorMultas || c.valorJuros);
      return `<tr style="${atraso ? "background:#FEF2F2" : ""}">
        <td class="b mono" style="font-size:10px">${esc(c.mes || "—")}</td>
        <td class="r">${c.funcionarios ?? 0}</td>
        ${algumaFolha ? `<td class="r mono" style="font-size:10px;color:var(--x7)">${esc(c.folhaPagamento || "—")}</td>` : ""}
        <td class="r mono ${atraso ? "red" : ""}">${esc(c.valorFgts || "—")}</td>
        <td class="r mono ${atraso ? "red" : ""}">${esc(c.valorInss || "—")}</td>
        <td>
          <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:99px;background:${atraso ? "#fee2e2" : "#dcfce7"};color:${atraso ? "#991b1b" : "#15803d"}">${esc(c.situacao || "—")}</span>
          ${temPenalidade ? `<div style="font-size:9px;color:#991B1B;margin-top:2px">${c.valorMultas ? `+ multa ${esc(c.valorMultas)}` : ""}${c.valorMultas && c.valorJuros ? " · " : ""}${c.valorJuros ? `juros ${esc(c.valorJuros)}` : ""}</div>` : ""}
        </td>
      </tr>`;
    }).join("");

    gefipSection = `
    ${stitle(tituloGefip)}
    ${cnpjDivergente ? `<div class="alert mod" style="margin-bottom:6px"><span class="atag">ATENÇÃO</span> CNPJ no cabeçalho do GEFIP (${esc(gefip.cnpjDeclarado || "—")}) diverge do CNPJ do cedente — verificar se o documento é da empresa correta.</div>` : ""}
    ${danger ? `<div class="alert alta"><span class="atag">ALTA</span> <b>${atrasos}</b> competência(s) em atraso — passivo trabalhista identificado.</div>` : `<div class="alert" style="background:#f0fdf4;border-color:#bbf7d0;color:#15803d"><span class="atag" style="background:#16a34a;color:#fff">REGULAR</span> Recolhimentos em dia.</div>`}
    <div class="kpi-snap c4" style="margin-bottom:10px">
      <div class="icell"><div class="l">Período</div><div class="v sm">${esc(gefip.competenciaInicio || "—")} → ${esc(gefip.competenciaFim || "—")}</div></div>
      <div class="icell"><div class="l">Funcionários</div><div class="v sm">${gefip.totalFuncionarios ?? 0}</div></div>
      <div class="icell"><div class="l">Total FGTS</div><div class="v sm mono">${esc(gefip.valorFgtsTotal || "—")}</div></div>
      <div class="icell"><div class="l">Total INSS</div><div class="v sm mono">${esc(gefip.valorInssTotal || "—")}</div></div>
    </div>
    <table class="tbl">
      <thead><tr><th>Competência</th><th class="r">Funcs</th>${algumaFolha ? "<th class=\"r\">Folha</th>" : ""}<th class="r">FGTS</th><th class="r">INSS</th><th>Situação</th></tr></thead>
      <tbody>${compRows}</tbody>
    </table>`;
  }

  const content = `${dreSection}${balSection}${indicadoresSection}${abcSection}${sacadosSection}${gefipSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de DRE/balanço/ABC não disponíveis</div>`, 9, date);
}

// ─── Page 11: IR Sócios + Visita ───────────────────────────────────────────────
function pageIRVisita(params: PDFReportParams, date: string): string {
  const irSocios = params.data.irSocios ?? [];
  const rv = params.data.relatorioVisita;

  // Mapa CPF → participação societária (do QSA / contrato social)
  const normCpfIR = (v: string | undefined | null) => (v ?? "").replace(/\D/g, "");
  const qsaPartMap: Record<string, string> = {};
  (params.data.qsa?.quadroSocietario ?? []).forEach(s => {
    const k = normCpfIR(s.cpfCnpj);
    if (k && s.participacao) qsaPartMap[k] = s.participacao;
  });

  let irSection = "";
  if (irSocios.length > 0) {
    const irBlocks = irSocios.map(ir => {
      const initials = (ir.nomeSocio ?? "").split(" ").slice(0,2).map((w: string) => w[0] ?? "").join("").toUpperCase();
      const pl = numVal(ir.patrimonioLiquido ?? "0");
      const plBorder = pl > 500000 ? "var(--g6)" : pl > 0 ? "var(--a5)" : "var(--r6)";
      const impostoPago = ir.impostoPago ?? "0";
      const impostoRestituir = ir.impostoRestituir ?? "0";
      const dividasOnus = ir.dividasOnus ?? "0";
      const bensImoveis = ir.bensImoveis ?? "0";
      const bensVeiculos = ir.bensVeiculos ?? "0";
      const partSocIR = qsaPartMap[normCpfIR(ir.cpf)] ?? null;
      const partPct = partSocIR ? (partSocIR.replace("%","").trim() + "%") : null;
      return `<div style="margin-bottom:20px;padding:16px;background:var(--x0);border-radius:10px;border:1px solid var(--x2)">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--x2)">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--n0);border:2px solid ${plBorder};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--n8);flex-shrink:0">${esc(initials)}</div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700;color:var(--n9)">${esc(ir.nomeSocio)}</div>
            <div style="font-size:10px;color:var(--x5);font-family:'JetBrains Mono',monospace;margin-top:2px">CPF: ${fmtCpf(ir.cpf)} · Ano-base: ${fmt(ir.anoBase)}</div>
          </div>
          ${partPct ? `<div style="text-align:right;background:var(--n0);border:1px solid var(--n1);border-radius:8px;padding:6px 12px;min-width:80px"><div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--x4)">Part. Societária</div><div style="font-size:16px;font-weight:700;color:var(--n7);margin-top:2px">${esc(partPct)}</div></div>` : ""}
        </div>
        <div class="istrip c4" style="margin-bottom:8px">
          <div class="icell"><div class="l">Renda Total</div><div class="v sm mono">${fmtMoneyAbr(ir.rendimentoTotal)}</div></div>
          <div class="icell"><div class="l">Rend. Tributáveis</div><div class="v sm mono">${fmtMoneyAbr(ir.rendimentosTributaveis)}</div></div>
          <div class="icell"><div class="l">Rend. Isentos</div><div class="v sm mono">${fmtMoneyAbr(ir.rendimentosIsentos)}</div></div>
          <div class="icell ${pl > 0 ? "success" : "danger"}"><div class="l">Patrimônio Líq.</div><div class="v ${pl > 0 ? "green" : "red"} sm mono">${fmtMoneyAbr(ir.patrimonioLiquido)}</div></div>
        </div>
        <div class="istrip c4" style="margin-bottom:8px">
          <div class="icell"><div class="l">Bens e Direitos</div><div class="v sm mono">${fmtMoneyAbr(ir.totalBensDireitos)}</div></div>
          <div class="icell"><div class="l">Imóveis</div><div class="v sm mono">${fmtMoneyAbr(bensImoveis)}</div></div>
          <div class="icell"><div class="l">Veículos</div><div class="v sm mono">${fmtMoneyAbr(bensVeiculos)}</div></div>
          <div class="icell ${numVal(dividasOnus) > 0 ? "warn" : ""}"><div class="l">Dívidas / Ônus</div><div class="v sm mono ${numVal(dividasOnus) > 0 ? "" : "muted"}">${fmtMoneyAbr(dividasOnus)}</div></div>
        </div>
        <div class="istrip c4" style="margin-bottom:8px">
          <div class="icell"><div class="l">Imposto Pago</div><div class="v sm mono">${fmtMoneyAbr(impostoPago)}</div></div>
          <div class="icell"><div class="l">A Restituir</div><div class="v sm mono ${numVal(impostoRestituir) > 0 ? "green" : "muted"}">${fmtMoneyAbr(impostoRestituir)}</div></div>
          <div class="icell"><div class="l">Apl. Financeiras</div><div class="v sm mono">${fmtMoneyAbr(ir.aplicacoesFinanceiras)}</div></div>
          <div class="icell ${ir.coerenciaComEmpresa ? "success" : "warn"}"><div class="l">Coerência c/ empresa</div><div class="v ${ir.coerenciaComEmpresa ? "green" : ""} sm">${ir.coerenciaComEmpresa ? "Sim" : "Verificar"}</div></div>
        </div>
        ${(() => {
          const quotasVal = (ir as { participacoesSocietarias?: string }).participacoesSocietarias || (ir as { outrosBens?: string }).outrosBens;
          if (!quotasVal || numVal(quotasVal) <= 0) return "";
          return `<div class="istrip c4" style="margin-bottom:8px">
            <div class="icell" style="border:1px solid var(--n1);background:var(--n0)"><div class="l" style="color:var(--n7);font-weight:700">Quotas Societárias</div><div class="v sm mono" style="color:var(--n8);font-weight:700">${fmtMoneyAbr(quotasVal)}</div></div>
            <div class="icell" style="grid-column:span 3"><div class="l" style="color:var(--x4)">Participações em sociedades declaradas no Grupo 03 da DIRPF</div></div>
          </div>`;
        })()}
        ${(() => {
          const divs = ir.dividasOnusReais ?? [];
          if (divs.length === 0) return "";
          const totalDivs = divs.reduce((s, d) => s + (d.situacao_atual ?? 0), 0);
          const rows = divs.map(d => `<tr>
            <td style="padding:4px 8px;border-top:1px solid var(--r1);color:var(--n8);font-size:10px">${esc(d.discriminacao || "—")}</td>
            <td style="padding:4px 8px;border-top:1px solid var(--r1);text-align:right;font-family:'JetBrains Mono',monospace;color:var(--r6);font-weight:600;font-size:10px;white-space:nowrap">${fmtMoneyAbr(d.situacao_atual ?? 0)}</td>
          </tr>`).join("");
          return `<div style="margin:8px 0 8px;border:1px solid var(--r2);background:var(--r0);border-radius:8px;overflow:hidden">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(220,38,38,0.08);border-bottom:1px solid var(--r2)">
              <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--r6)">Dívidas e Ônus Reais</span>
              <span style="font-size:11px;font-weight:700;color:var(--r6);font-family:'JetBrains Mono',monospace">${fmtMoneyAbr(totalDivs)}</span>
            </div>
            <table style="width:100%;border-collapse:collapse">${rows}</table>
          </div>`;
        })()}
        ${!ir.debitosEmAberto ? `<div class="alert ok" style="margin:0"><span class="atag">OK</span> Sem débitos com a Receita Federal</div>` : `<div class="alert alta" style="margin:0"><span class="atag">ALTA</span> Débitos em aberto: ${esc(ir.descricaoDebitos ?? "")}</div>`}
        ${(() => {
          const quotasV = numVal((ir as { participacoesSocietarias?: string }).participacoesSocietarias ?? (ir as { outrosBens?: string }).outrosBens ?? "0");
          const soma = numVal(bensImoveis) + numVal(bensVeiculos) + numVal(ir.aplicacoesFinanceiras) + quotasV;
          const total = numVal(ir.totalBensDireitos);
          if (soma <= 0 || total <= 0) return "";
          const maxV = Math.max(soma, total);
          if (Math.abs(soma - total) <= maxV * 0.05) return "";
          return `<div class="alert mod" style="margin:6px 0 0"><span class="atag">MODERADA</span> Subcategorias de bens (${fmtMoneyAbr(soma)}) divergem do total declarado (${fmtMoneyAbr(total)}) — extração pode estar incompleta, revisar documento fonte.</div>`;
        })()}
      </div>`;
    }).join("");
    irSection = `${stitle("12 · IR dos sócios")}${irBlocks}`;
  }

  let visitaSection = "";
  if (rv) {
    const recMap = {aprovado:"green", condicional:"warn", reprovado:"danger"} as const;
    const recCls = recMap[rv.recomendacaoVisitante] ?? "";
    const recLabel = {aprovado:"Aprovado", condicional:"Condicional", reprovado:"Reprovado"}[rv.recomendacaoVisitante] ?? fmt(rv.recomendacaoVisitante);

    const toSrv = (v: unknown) => Array.isArray(v) ? (v as string[]).join(" ") : (v == null ? "" : String(v));
    const ctxText = toSrv(rv.observacoesLivres) || toSrv(rv.descricaoEstrutura) || "";

    visitaSection = `
    ${stitle("14 · Relatório de visita")}
    <div class="istrip c3" style="margin-bottom:14px">
      <div class="icell"><div class="l">Responsável</div><div class="v sm">${fmt(rv.responsavelVisita)}</div></div>
      <div class="icell"><div class="l">Local</div><div class="v sm">${fmt(rv.localVisita)}</div></div>
      <div class="icell ${recCls}"><div class="l">Recomendação</div><div class="v ${recCls === "green" ? "green" : recCls === "danger" ? "red" : ""} sm">${esc(recLabel)}</div></div>
    </div>
    ${ctxText ? `<div class="ana-grid"><div class="ana-col n" style="grid-column:1/-1"><div class="ana-h">Contexto</div><div class="ana-i" style="line-height:1.6">${esc(ctxText)}</div></div></div>` : ""}
    ${stitle("Dados da empresa")}
    <div class="istrip c4">
      <div class="icell"><div class="l">Funcionários</div><div class="v">${rv.funcionariosObservados ?? "—"}</div></div>
      <div class="icell"><div class="l">Folha Pagamento</div><div class="v sm mono">${fmtMoneyAbr(rv.folhaPagamento)}</div></div>
      <div class="icell"><div class="l">Vendas Duplicata</div><div class="v">${fmt(rv.vendasDuplicata)}</div></div>
      <div class="icell"><div class="l">Vendas Outras</div><div class="v">${fmt(rv.vendasOutras)}</div></div>
    </div>
    <div class="istrip c4">
      <div class="icell"><div class="l">Prazo Faturamento</div><div class="v sm">${fmt(rv.prazoMedioFaturamento)}</div></div>
      <div class="icell"><div class="l">Prazo Entrega</div><div class="v sm">${fmt(rv.prazoMedioEntrega)}</div></div>
      <div class="icell"><div class="l">Endiv. Banco</div><div class="v ${rv.endividamentoBanco ? "" : "muted"}">${fmtMoneyAbr(rv.endividamentoBanco)}</div></div>
      <div class="icell"><div class="l">Endiv. FIDC</div><div class="v ${rv.endividamentoFactoring ? "" : "muted"}">${fmtMoneyAbr(rv.endividamentoFactoring)}</div></div>
    </div>
    ${(() => {
      const rf = rv.referenciasFornecedores;
      const rfStr = Array.isArray(rf) ? rf.join("; ") : (typeof rf === "string" ? rf : "");
      if (!rfStr.trim()) return "";
      const items = rfStr.split(/[;,]/).map((r: string) => r.trim()).filter(Boolean);
      return `${stitle("Referências Comerciais / Fornecedores")}
    <div style="background:var(--wh);border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:14px">
      <div style="background:var(--n9);padding:6px 12px;font-size:11px;font-weight:700;color:#fff">
        ${items.length} referência(s) informada(s)
      </div>
      ${items.map((r: string, i: number) =>
        `<div style="padding:5px 12px;font-size:11px;color:var(--x7);${i % 2 !== 0 ? "background:var(--x0)" : ""}">• ${esc(r)}</div>`
      ).join("")}
    </div>`;
    })()}`;
  }

  // Histórico de Consultas
  let historicoSection = "";
  const historico = params.data.historicoConsultas ?? [];
  if (historico.length > 0) {
    const histRows = historico.map(h =>
      `<tr><td>${esc(h.usuario)}</td><td class="r">${fmt(h.ultimaConsulta)}</td></tr>`
    ).join("");
    historicoSection = `
    ${stitle("13 · Histórico de consultas ao CNPJ")}
    <table class="tbl">
      <thead><tr><th>Instituição / Consulente</th><th class="r">Última Consulta</th></tr></thead>
      <tbody>${histRows}</tbody>
    </table>
    <div class="inf" style="margin-top:4px">${historico.length} consulta(s) nos últimos 6 meses</div>`;
  }

  const content = `${irSection}${historicoSection}${visitaSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de IR/Visita não disponíveis</div>`, 10, date);
}

// ─── Page 2: Checklist de Documentos ─────────────────────────────────────────
function pageChecklist(params: PDFReportParams, date: string): string {
  const cob = params.aiAnalysis?.coberturaAnalise;
  const docs = cob?.documentos ?? [];

  // Fallback: deduzir cobertura pelos campos presentes em ExtractedData.
  // FIX 2026-05-11: verifica campo-chave em vez de objeto inteiro (evita
  // falso positivo quando Gemini retorna `{}` vazio em vez de undefined).
  // DRE e Balanço viraram obrigatórios — são fundamentais pra análise de
  // crédito (decisão Victor 2026-05-11).
  const fallback = [
    { tipo:"cnpj",          label:"Cartão CNPJ",             presente: !!params.data.cnpj?.razaoSocial,        obrigatorio:true  },
    { tipo:"qsa",           label:"Quadro Societário",        presente: !!(params.data.qsa?.quadroSocietario?.length), obrigatorio:true  },
    { tipo:"contrato",      label:"Contrato Social",          presente: !!params.data.contrato?.objetoSocial,  obrigatorio:false },
    { tipo:"faturamento",   label:"Extrato de Faturamento",   presente: !!(params.data.faturamento?.meses?.length), obrigatorio:true  },
    { tipo:"scr",           label:"SCR (Banco Central)",      presente: !!params.data.scr?.totalDividasAtivas,  obrigatorio:true  },
    // scrAnterior: verifica se tem dado real (não só objeto vazio)
    { tipo:"scrAnterior",   label:"SCR Período Anterior",     presente: !!params.data.scrAnterior?.totalDividasAtivas, obrigatorio:false },
    { tipo:"scrSocios",     label:"SCR dos Sócios (PF)",      presente: !!(params.data.scrSocios?.length),      obrigatorio:false },
    { tipo:"protestos",     label:"Certidão de Protestos",    presente: !!params.data.protestos?.vigentesQtd,   obrigatorio:true  },
    { tipo:"processos",     label:"Processos Judiciais",      presente: !!params.data.processos?.passivosTotal, obrigatorio:true  },
    { tipo:"dre",           label:"DRE",                      presente: !!(params.data.dre?.anos?.length),       obrigatorio:true  },
    { tipo:"balanco",       label:"Balanço Patrimonial",      presente: !!(params.data.balanco?.anos?.length),   obrigatorio:true  },
    { tipo:"curvaABC",      label:"Curva ABC / Clientes",     presente: !!(params.data.curvaABC?.clientes?.length), obrigatorio:false },
    { tipo:"irSocios",      label:"IR dos Sócios",            presente: !!(params.data.irSocios?.length),        obrigatorio:false },
    // relatorioVisita: verifica campo-chave em vez de objeto vazio
    { tipo:"relatorioVisita",label:"Relatório de Visita",     presente: !!(params.data.relatorioVisita?.dataVisita || params.data.relatorioVisita?.responsavelVisita), obrigatorio:false },
    // ccf: usa campo qtdRegistros pra distinguir consulta real de objeto vazio
    { tipo:"ccf",           label:"CCF (Cheques Sem Fundo)",  presente: params.data.ccf != null && (params.data.ccf.qtdRegistros !== undefined || params.data.ccf.bancos != null), obrigatorio:true  },
    { tipo:"grupoEconomico",label:"Grupo Econômico",          presente: !!(params.data.grupoEconomico?.empresas?.length), obrigatorio:false },
    // Onda Checklist 2026-05-14: 3 documentos novos (fase 2) — todos opcionais.
    // Cada cedente decide se faz sentido subir; ausência não bloqueia análise.
    { tipo:"divida_ativa",  label:"Certidão de Dívida Ativa", presente: params.data.dividaAtiva != null && (params.data.dividaAtiva.qtdRegistros !== undefined || params.data.dividaAtiva.certidaoNegativa === true), obrigatorio:false },
    { tipo:"cenprot",       label:"CENPROT (Protestos)",       presente: params.data.cenprot != null && (params.data.cenprot.qtdRegistros !== undefined || params.data.cenprot.certidaoNegativa === true), obrigatorio:false },
    { tipo:"gefip",         label:"GEFIP (FGTS/INSS)",         presente: !!(params.data.gefip?.competencias?.length), obrigatorio:false },
  ];

  // Merge: IA `coberturaAnalise` (quando presente) preenche/sobrescreve por
  // tipo, mas fallback continua cobrindo os tipos que a IA não listou.
  // Antes (FIX 2026-05-11): se IA listava só 5 docs, os outros 11 sumiam.
  const byTipo = new Map<string, typeof fallback[0]>();
  for (const f of fallback) byTipo.set(f.tipo, f);
  for (const d of docs) byTipo.set(d.tipo, d as typeof fallback[0]);

  // CCF: o AI avalia "empresa tem CCF" mas o checklist pergunta "documento
  // foi entregue". Override com a checagem do extractor (mesma do fallback).
  const lista = Array.from(byTipo.values()).map(item =>
    item.tipo === "ccf"
      ? { ...item, presente: params.data.ccf != null && (params.data.ccf.qtdRegistros !== undefined || params.data.ccf.bancos != null) }
      : item
  );
  const presentes = lista.filter(d => d.presente).length;
  const obrigTotal = lista.filter(d => d.obrigatorio).length;
  const obrigPres = lista.filter(d => d.obrigatorio && d.presente).length;
  const nivel = presentes >= lista.length * 0.8 ? "completa" : presentes >= lista.length * 0.5 ? "parcial" : "minima";
  const nivelCls = nivel === "completa" ? "ok" : nivel === "parcial" ? "mod" : "alta";
  const nivelLabel = nivel === "completa" ? "Cobertura completa" : nivel === "parcial" ? "Cobertura parcial" : "Cobertura mínima";

  const docRows = lista.map(d => {
    const rowCls = d.presente ? "present" : d.obrigatorio ? "absent-obr" : "absent";
    const iconCls = d.presente ? "pass" : d.obrigatorio ? "fail" : "warn";
    const iconChar = d.presente ? "✓" : d.obrigatorio ? "✗" : "—";
    const statusLabel = d.presente ? "Entregue" : "Ausente";
    // Onda Checklist 2026-05-14: opcional ausente vai pra amarelo (--a5),
    // consistente com o ícone "—" que já era amarelo. Antes era cinza (--x4).
    const statusColor = d.presente ? "var(--g6)" : d.obrigatorio ? "var(--r6)" : "var(--a5)";
    const obadge = d.obrigatorio
      ? `<span style="font-size:7px;font-weight:700;padding:2px 5px;border-radius:3px;background:var(--n1);color:var(--n7);margin-left:6px">OBR</span>`
      : `<span style="font-size:7px;font-weight:700;padding:2px 5px;border-radius:3px;background:var(--x1);color:var(--x5);margin-left:6px">OPC</span>`;
    return `<div class="pf-row ${rowCls}">
      <div class="pf-icon ${iconCls}" style="width:22px;height:22px;font-size:12px">${iconChar}</div>
      <div class="pf-name">${esc(d.label)}${obadge}</div>
      <div style="font-size:10px;font-weight:700;color:${statusColor};flex-shrink:0">${statusLabel}</div>
    </div>`;
  }).join("");

  const pctPres = lista.length > 0 ? Math.round((presentes / lista.length) * 100) : 0;

  const content = `
    ${stitle("01 · Checklist de documentos analisados")}
    <div class="istrip c4" style="margin-bottom:8px">
      <div class="icell navy"><div class="l">Total entregues</div><div class="v">${presentes} / ${lista.length}</div></div>
      <div class="icell ${obrigPres < obrigTotal ? "danger" : "success"}"><div class="l">Obrigatórios</div><div class="v ${obrigPres < obrigTotal ? "red" : "green"}">${obrigPres} / ${obrigTotal}</div></div>
      <div class="icell"><div class="l">Cobertura</div><div class="v">${pctPres}%</div></div>
      <div class="icell ${nivelCls === "ok" ? "success" : nivelCls === "mod" ? "warn" : "danger"}"><div class="l">Nível</div><div class="v sm ${nivelCls === "ok" ? "green" : nivelCls === "mod" ? "" : "red"}">${esc(nivelLabel)}</div></div>
    </div>
    <div class="prog-outer"><div class="prog-inner" style="width:${pctPres}%"></div></div>
    <div class="doc-grid" style="margin-bottom:14px">
      ${docRows}
    </div>
    ${params.data.bureausConsultados?.length ? `${stitle("Bureaus consultados")}
    <div class="istrip c4">
      ${params.data.bureausConsultados.map(b => `<div class="icell success"><div class="l">Bureau</div><div class="v sm green">${esc(b)}</div></div>`).join("")}
    </div>` : ""}
    ${params.data.score?.serasa ? `${stitle("Bureau Score")}
    <div class="istrip c4">
      <div class="icell"><div class="l">Serasa Score</div><div class="v">${params.data.score.serasa.score}</div><div class="sub">${esc(params.data.score.serasa.faixa)}</div></div>
      <div class="icell ${params.data.score.serasa.inadimplente ? "danger" : "success"}"><div class="l">Inadimplente</div><div class="v ${params.data.score.serasa.inadimplente ? "red" : "green"}">${params.data.score.serasa.inadimplente ? "Sim" : "Não"}</div></div>
    </div>` : ""}
    ${(() => {
      const fv = params.fundValidation;
      if (!fv?.criteria?.length) return "";
      if (!params.settings?.exibir_conformidade) return "";
      const criteriaRows = fv.criteria.map((c: FundCriterion) => {
        const isPass = c.status === "ok";
        const isWarn = c.status === "warning";
        const iconCls = isPass ? "pass" : isWarn ? "warn" : "fail";
        const iconChar = isPass ? "✓" : isWarn ? "!" : "✗";
        const rowCls = isPass ? "pass-row" : isWarn ? "warn-row" : "fail-row";
        return `<div class="pf-row ${rowCls}">
          <div class="pf-icon ${iconCls}">${iconChar}</div>
          <div class="pf-name">${esc(c.label)}${c.eliminatoria ? `<span class="pf-tag">Eliminatório</span>` : ""}</div>
          <div class="pf-meta">
            <div class="pf-lim"><div class="lbl">Limite</div><div class="val">${esc(c.threshold)}</div></div>
            <div class="pf-act"><div class="lbl">Apurado</div><div class="val ${iconCls}">${esc(c.actual)}</div>${c.detail ? `<div class="pf-note">${esc(c.detail)}</div>` : ""}</div>
          </div>
        </div>`;
      }).join("");
      const failCount = fv.failCount ?? 0;
      const passCount = fv.passCount ?? 0;
      const totalCount = fv.criteria.length;
      const verdictCls = failCount > 0 ? "fail" : "pass";
      const verdictText = failCount > 0 ? (fv.hasEliminatoria ? "Empresa não elegível — critério eliminatório" : "Empresa com restrições") : "Empresa elegível";
      const verdictSub = `${passCount} de ${totalCount} critérios aprovados · ${failCount} reprovado(s)`;
      const verdictBtn = failCount > 0 ? "Não elegível" : "Elegível";
      return `${stitle("Conformidade com políticas do fundo")}
      <div class="crit-box">${criteriaRows}</div>
      <div class="verdict ${verdictCls}">
        <div><div class="vt">${verdictText}</div><div class="vs">${verdictSub}</div></div>
        <div class="vb">${verdictBtn}</div>
      </div>`;
    })()}
  `;

  return page(content, 2, date);
}

// ─── Page: Score de Crédito V2 ────────────────────────────────────────────────
function pageScoreV2(params: PDFReportParams, date: string): string {
  const s = params.scoreV2;
  if (!s) return "";

  const respostas: RespostaCriterio[] = params.scoreV2Respostas ?? [];

  const PILAR_NOMES: Record<string, string> = {
    perfil_empresa: "Perfil da Empresa",
    saude_financeira: "Saúde Financeira",
    risco_compliance: "Risco e Compliance",
    socios_governanca: "Sócios e Governança",
    estrutura_operacao: "Estrutura da Operação",
  };
  const PILAR_PESOS: Record<string, number> = {
    perfil_empresa: 15, saude_financeira: 15, risco_compliance: 25,
    socios_governanca: 10, estrutura_operacao: 35,
  };
  const CRITERIO_NOMES: Record<string, string> = {
    segmento: "Segmento de Atuação", localizacao: "Localização",
    capacidade_operacional: "Capacidade Operacional",
    estrutura_fisica: "Estrutura Física", patrimonio_empresa: "Patrimônio da Empresa",
    qualidade_faturamento: "Faturamento (qualidade e consistência)",
    analise_financeira: "Análise Financeira (DRE / Balanço)",
    alavancagem: "Alavancagem (SCR / FMM)",
    situacao_juridica: "Situação Jurídica", protestos: "Protestos Vigentes",
    scr_endividamento: "SCR — Endividamento e Vencidos",
    pefin_refin: "Negativações (Pefin / Refin / SPC)",
    processos_judiciais: "Processos Judiciais",
    endividamento_socios: "Endividamento dos Sócios",
    tempo_empresa: "Tempo dos Sócios na Empresa",
    patrimonio_socios: "Patrimônio Declarado dos Sócios",
    risco_sucessao: "Risco de Sucessão",
    confirmacao_lastro: "Confirmação de Lastro",
    perfil_sacados: "Perfil e Qualidade dos Sacados",
    tipo_operacao: "Tipo de Operação",
    garantias: "Garantias Adicionais",
    quantidade_fundos: "Relacionamento com Outros Fundos",
  };

  const RATING_CORES: Record<string, string> = {
    A: "#16a34a", B: "#65a30d", C: "#d97706", D: "#ea580c", E: "#dc2626", F: "#991b1b",
  };
  const RATING_BGS: Record<string, string> = {
    A: "#f0fdf4", B: "#f7fee7", C: "#fffbeb", D: "#fff7ed", E: "#fef2f2", F: "#fff1f2",
  };
  const RATING_LBLS: Record<string, string> = {
    A: "EXCELENTE", B: "BOM", C: "MODERADO", D: "FRACO", E: "RUIM", F: "CRÍTICO",
  };
  const ratingCor = RATING_CORES[s.rating] ?? "#64748b";
  const ratingBg = RATING_BGS[s.rating] ?? "#f1f5f9";
  const ratingLbl = RATING_LBLS[s.rating] ?? s.rating;

  const confiancaLabel = s.confianca_score === "alta" ? "Alta — todos os pilares preenchidos"
    : s.confianca_score === "parcial" ? "Parcial — alguns pilares pendentes"
    : "Baixa — múltiplos pilares sem preenchimento";
  const confiancaCor = s.confianca_score === "alta" ? "#16a34a"
    : s.confianca_score === "parcial" ? "#d97706" : "#dc2626";

  const pilaresOrdem = ["estrutura_operacao", "risco_compliance", "saude_financeira", "perfil_empresa", "socios_governanca"];

  // ── Resumo por pilar (tabela superior) ────────────────────────────────────
  const pilaresRows = pilaresOrdem.map(pid => {
    const nome = PILAR_NOMES[pid] ?? pid;
    const peso = PILAR_PESOS[pid] ?? 0;
    const bruto = s.pontos_brutos[pid] ?? 0;
    const ponderado = s.pontuacao_ponderada[pid] ?? 0;
    const isPendente = s.pilares_pendentes.includes(pid);
    const barW = isPendente ? 0 : Math.min(100, Math.round(ponderado / peso * 100));
    const scoreBar = isPendente
      ? `<span style="font-size:9px;color:#d97706;background:#fef3c7;border:1px solid #fbbf24;border-radius:3px;padding:1px 6px">Pendente</span>`
      : `<div style="background:#e2e8f0;border-radius:3px;height:6px;width:100%"><div style="background:${ratingCor};height:6px;border-radius:3px;width:${barW}%"></div></div>`;
    return `<tr>
      <td style="padding:7px 10px;font-size:10.5px;font-weight:600;color:#0f172a">${esc(nome)}</td>
      <td style="padding:7px 10px;font-size:10px;color:#64748b;text-align:center">${peso}%</td>
      <td style="padding:7px 10px;font-size:10px;color:#374151;text-align:center;font-family:'JetBrains Mono',monospace">${isPendente ? "—" : bruto.toFixed(1)}</td>
      <td style="padding:7px 10px;font-size:11px;font-weight:700;color:${isPendente ? "#94a3b8" : ratingCor};text-align:center;font-family:'JetBrains Mono',monospace">${isPendente ? "—" : ponderado.toFixed(1)}</td>
      <td style="padding:7px 10px;width:110px">${scoreBar}</td>
    </tr>`;
  }).join("");

  // ── Detalhamento por pilar (critérios respondidos) ─────────────────────────
  const pilaresDetalhe = pilaresOrdem.map(pid => {
    const nome = PILAR_NOMES[pid] ?? pid;
    const peso = PILAR_PESOS[pid] ?? 0;
    const ponderado = s.pontuacao_ponderada[pid] ?? 0;
    const isPendente = s.pilares_pendentes.includes(pid);
    const criteriosPilar = respostas.filter(r => r.pilar_id === pid);

    if (isPendente) {
      return `<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:10px">
        <div style="background:#f8fafc;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:10.5px;font-weight:700;color:#374151">${esc(nome)}</div>
          <span style="font-size:9px;background:#fef3c7;color:#d97706;border:1px solid #fbbf24;border-radius:3px;padding:1px 6px;font-weight:700">PENDENTE</span>
        </div>
      </div>`;
    }

    if (criteriosPilar.length === 0) return "";

    const criteriosHtml = criteriosPilar.map(r => {
      const nomeC = CRITERIO_NOMES[r.criterio_id] ?? r.criterio_id;
      const modStr = r.modificador_label
        ? `<span style="font-size:9px;color:#64748b;margin-left:4px">× ${r.modificador_multiplicador} (${esc(r.modificador_label)})</span>`
        : "";
      const ptsFinal = r.pontos_final.toFixed(1);
      const ptsBase = r.pontos_base;
      const ptsColor = r.pontos_final >= ptsBase * 0.7 ? "#16a34a" : r.pontos_final >= ptsBase * 0.3 ? "#d97706" : "#dc2626";
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid #f1f5f9">
        <div style="flex:1;font-size:10px;color:#374151">${esc(nomeC)}</div>
        <div style="font-size:10px;color:#64748b;max-width:200px;text-align:right">${esc(r.opcao_label)}${modStr}</div>
        <div style="font-size:10.5px;font-weight:700;color:${ptsColor};min-width:40px;text-align:right;font-family:'JetBrains Mono',monospace">${ptsFinal}</div>
      </div>`;
    }).join("");

    return `<div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:10px">
      <div style="background:#f8fafc;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:10.5px;font-weight:700;color:#374151">${esc(nome)}</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Peso ${peso}%</span>
          <span style="font-size:11px;font-weight:800;color:${ratingCor};font-family:'JetBrains Mono',monospace">${ponderado.toFixed(1)} pts</span>
        </div>
      </div>
      <div style="background:#fff">${criteriosHtml}<div style="height:1px;display:none"></div></div>
    </div>`;
  }).join("");

  const content = `
    ${stitle(HIDE_AVALIACAO ? "Análise por Pilares — Conformidade" : "Score de Crédito V2 — Capital Finanças")}

    <!-- Score hero + tabela resumo -->
    <div style="${HIDE_AVALIACAO ? "margin-bottom:18px" : "display:flex;align-items:flex-start;gap:20px;margin-bottom:18px"}">
      ${HIDE_AVALIACAO ? "" : `<!-- Círculo de rating -->
      <div style="text-align:center;flex-shrink:0;min-width:100px">
        <div style="width:84px;height:84px;border-radius:50%;border:4px solid ${ratingCor};background:${ratingBg};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px">
          <div style="font-size:30px;font-weight:900;color:${ratingCor};line-height:1">${s.score_final.toFixed(0)}</div>
          <div style="font-size:9px;color:#94a3b8;margin-top:1px">/100</div>
        </div>
        <div style="display:inline-block;padding:3px 12px;border-radius:5px;font-size:12px;font-weight:900;background:${ratingCor};color:#fff;margin-bottom:3px;letter-spacing:0.04em">
          Rating ${esc(s.rating)}
        </div>
        <div style="font-size:9px;font-weight:700;color:${ratingCor};text-transform:uppercase;letter-spacing:0.08em">${esc(ratingLbl)}</div>
        <div style="font-size:8.5px;color:#94a3b8;margin-top:2px">Política ${esc(s.versao_politica)}</div>
      </div>`}

      <!-- Tabela de pilares -->
      <div style="${HIDE_AVALIACAO ? "" : "flex:1;"}border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#163269">
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.7);text-align:left;text-transform:uppercase;letter-spacing:0.05em">Pilar</th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.7);text-align:center;text-transform:uppercase;letter-spacing:0.05em">Peso</th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.7);text-align:center;text-transform:uppercase;letter-spacing:0.05em">Pts brutos</th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.7);text-align:center;text-transform:uppercase;letter-spacing:0.05em">Contribuição</th>
              <th style="padding:7px 10px;font-size:9px;font-weight:700;color:rgba(255,255,255,0.7);text-align:left;text-transform:uppercase;letter-spacing:0.05em">Aproveitamento</th>
            </tr>
          </thead>
          <tbody>
            ${pilaresRows}
            ${HIDE_AVALIACAO ? "" : `<tr style="background:#eef3ff;border-top:2px solid #c7d2fe">
              <td style="padding:8px 10px;font-size:11px;font-weight:800;color:#1e3a8a">SCORE FINAL</td>
              <td style="padding:8px 10px;font-size:10px;font-weight:700;color:#374151;text-align:center">100%</td>
              <td style="padding:8px 10px;text-align:center;color:#94a3b8">—</td>
              <td style="padding:8px 10px;font-size:14px;font-weight:900;color:${ratingCor};text-align:center;font-family:'JetBrains Mono',monospace">${s.score_final.toFixed(1)}</td>
              <td style="padding:8px 10px"></td>
            </tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Confiança + pendentes -->
    <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
        <span style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Confiança do score:</span>
        <span style="font-size:10px;font-weight:700;color:${confiancaCor}">${esc(confiancaLabel)}</span>
      </div>
      ${s.pilares_pendentes.length > 0 ? `
      <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px">
        <span style="font-size:9px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.05em">Pendentes:</span>
        <span style="font-size:10px;color:#92400e">${s.pilares_pendentes.map(p => PILAR_NOMES[p] ?? p).join(", ")}</span>
      </div>` : `
      <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px">
        <span style="font-size:10px;font-weight:600;color:#16a34a">✓ Todos os pilares preenchidos</span>
      </div>`}
    </div>

    <!-- Detalhamento por critério (se respostas disponíveis) -->
    ${respostas.length > 0 ? `
    ${stitle("Critérios Avaliados por Pilar")}
    ${pilaresDetalhe}
    ` : ""}`;

  return page(content, 11, date);
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function gerarHtmlRelatorio(params: PDFReportParams): { html: string; headerTemplate: string; footerTemplate: string } {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const scorePageHtml = pageScoreV2(params, date);
  const totalPages = 11 + (scorePageHtml ? 1 : 0); // 11 sem score, 12 com score
  const pages = [
    pageCapa(params, date),
    pageChecklist(params, date),
    pageSintese(params, date),
    pageDivisorAvaliacaoEstrategica(),
    pageParametros(params, date),
    pageFaturamento(params, date),
    pageProtestosProcessos(params, date),
    pageSCRDRE(params, date),
    pageBalancoABC(params, date),
    pageIRVisita(params, date),
    ...(scorePageHtml ? [scorePageHtml] : []),
    pageParecer(params, date, totalPages),
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório Capital Finanças — ${esc(params.data.cnpj?.razaoSocial ?? "")}</title>
${CSS}
</head>
<body>
<button class="print-fab" id="printBtn">
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
  Salvar como PDF
</button>
<style>
  .print-fab{position:fixed;bottom:28px;right:28px;z-index:9999;display:flex;align-items:center;gap:8px;padding:11px 20px;background:#1a2b5e;color:#fff;border:none;border-radius:50px;font-size:13px;font-weight:600;font-family:sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:background .15s,transform .1s}
  .print-fab:hover{background:#243a80;transform:translateY(-1px)}
  .print-fab:active{transform:translateY(0)}
  .print-fab:disabled{opacity:.6;cursor:not-allowed;transform:none}
</style>
<script>
document.getElementById('printBtn').addEventListener('click', async function() {
  var btn = this;
  btn.disabled = true;
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Gerando PDF...';
  try {
    var html = document.documentElement.outerHTML;
    var cnpj = document.title.replace(/[^0-9]/g,'').slice(0,14) || 'relatorio';
    var res = await fetch('__BASE_URL__/api/exportar-pdf-html', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ html: html, filename: 'relatorio-' + cnpj + '.pdf' })
    });
    if (!res.ok) throw new Error('Erro ' + res.status);
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'relatorio-' + cnpj + '.pdf';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
  } catch(e) {
    alert('Erro ao gerar PDF: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Salvar como PDF';
  }
});
</script>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>

<!-- ═══ Editor de Pontos Fortes / Fracos / Alertas (só ativa com ?k=token válido) ═══ -->
<style>
  .edit-bar{position:fixed;top:16px;right:16px;z-index:9998;display:none;align-items:center;gap:8px;padding:8px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 6px 24px rgba(15,23,42,.12);font-family:'DM Sans',sans-serif;font-size:12px}
  .edit-bar.show{display:flex}
  .edit-bar button{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#1f2937;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
  .edit-bar button:hover{background:#f8fafc}
  .edit-bar button.primary{background:#1a2b5e;border-color:#1a2b5e;color:#fff}
  .edit-bar button.primary:hover{background:#243a80}
  .edit-bar button.danger{background:#fff;border-color:#fecaca;color:#b91c1c}
  .edit-bar button:disabled{opacity:.5;cursor:not-allowed}
  .edit-bar select{padding:5px 8px;border-radius:6px;border:1px solid #cbd5e1;font-size:12px;font-family:inherit;background:#fff}
  .edit-bar .meta{color:#64748b;font-size:11px;margin-right:4px}
  body.editing [data-edit-section]{outline:2px dashed #84BF41;outline-offset:6px;border-radius:8px;position:relative}
  body.editing [data-edit-item]{cursor:text;padding:4px 22px 4px 8px;border-radius:4px;position:relative;transition:background .1s;display:block}
  body.editing [data-edit-item]:hover{background:rgba(132,191,65,.08)}
  body.editing [data-edit-item][contenteditable="true"]:focus{outline:1px solid #84BF41;background:#fff}
  body.editing [data-edit-percepcao]{cursor:text;padding:8px;border-radius:6px;min-height:40px;transition:background .1s}
  body.editing [data-edit-percepcao]:hover{background:rgba(132,191,65,.06)}
  body.editing [data-edit-percepcao][contenteditable="true"]:focus{outline:1px solid #84BF41;background:#fff}
  /* Caixas de Percepção por seção (DRE, Faturamento, Balanço) — sempre
     visíveis no relatório; placeholder em italic quando vazias. */
  .perc-box{border:1px dashed var(--x3);border-radius:6px;padding:10px 12px;margin-top:10px;margin-bottom:10px;background:var(--x0)}
  .perc-box .l{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x5);margin-bottom:4px}
  .perc-box-content{font-size:12px;line-height:1.55;color:var(--x9);min-height:18px;text-align:justify}
  .perc-box-content:empty::before,.perc-box-content[data-empty="true"]::before{content:"Clique para adicionar percepção…";color:var(--x4);font-style:italic}
  body.editing .perc-box{border-style:solid;border-color:#84BF41;background:#fff;cursor:text}
  body.editing [data-edit-text]{cursor:text;padding:4px 6px;border-radius:4px;transition:background .1s}
  body.editing [data-edit-text]:hover{background:rgba(132,191,65,.06)}
  body.editing [data-edit-text][contenteditable="true"]:focus{outline:1px solid #84BF41;background:#fff}
  body.editing .ana-item-empty{display:none}
  .edit-rm{position:absolute;top:50%;right:4px;transform:translateY(-50%);width:18px;height:18px;border-radius:50%;border:none;background:#fee2e2;color:#b91c1c;font-size:13px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;font-family:inherit;transition:all .15s}
  body.editing .edit-rm{display:inline-flex}
  .edit-rm.confirming{background:#dc2626;color:#fff;width:auto;padding:0 8px;border-radius:9px;font-size:10px;font-weight:700;animation:rmPulse 1.5s ease-in-out infinite}
  @keyframes rmPulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.4)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}
  .edit-add{display:none;margin-top:8px;padding:5px 10px;font-size:11px;border:1px dashed #84BF41;background:#f0f9e6;color:#5a8a2a;border-radius:5px;cursor:pointer;font-family:inherit;font-weight:600}
  body.editing .edit-add{display:inline-block}
  .edit-saved{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 18px;background:#16a34a;color:#fff;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.15);display:none}
  .edit-saved.show{display:block}
  @media print{.edit-bar,.edit-add,.edit-rm,.edit-saved{display:none!important}}
</style>
<div class="edit-bar" id="editBar">
  <span class="meta">Autor:</span>
  <select id="editAutor">
    <option value="Victor">Victor</option>
    <option value="Vanessa">Vanessa</option>
    <option value="Débora">Débora</option>
    <option value="Nayara">Nayara</option>
    <option value="Gleyso">Gleyso</option>
    <option value="Luiz">Luiz</option>
  </select>
  <button id="editToggle">&#9998; Editar</button>
  <button id="editSave" class="primary" style="display:none">&#128190; Salvar</button>
  <button id="editCancel" style="display:none">Cancelar</button>
</div>
<div class="edit-saved" id="editSaved">Alterações salvas</div>
<script>
(function(){
  var TOKEN = "__EDIT_TOKEN__";
  // route.ts substitui __EDIT_TOKEN__ por token real (quando ?k= bate) ou string vazia.
  if (!TOKEN || TOKEN === "__" + "EDIT_TOKEN__") return;
  var m = location.pathname.match(/\\/r\\/([a-z0-9]{8,16})/);
  if (!m) return;
  var REPORT_ID = m[1];

  var bar     = document.getElementById('editBar');
  var btnTog  = document.getElementById('editToggle');
  var btnSave = document.getElementById('editSave');
  var btnCanc = document.getElementById('editCancel');
  var selAut  = document.getElementById('editAutor');
  var toast   = document.getElementById('editSaved');
  bar.classList.add('show');

  var SECTIONS = ['fortes','fracos','alertas'];
  // Caixas de texto livre — Percepção (caixa antiga) + caixas por seção
  // (DRE, Faturamento, Balanço). Todas usam o mesmo padrão de contenteditable.
  var TEXT_KEYS = ['dre','faturamento','balanco'];
  var snapshot = null;
  var snapshotPerc = null;
  var snapshotTexts = {};
  var editing = false;

  function lists(){ return SECTIONS.map(function(s){ return [s, document.querySelector('[data-edit-list="'+s+'"]')]; }); }
  function percEl(){ return document.querySelector('[data-edit-percepcao]'); }
  function textEl(key){ return document.querySelector('[data-edit-text="'+key+'"]'); }

  function takeSnapshot(){
    var snap = {};
    lists().forEach(function(p){ snap[p[0]] = p[1] ? p[1].innerHTML : ''; });
    var pe = percEl();
    snapshotPerc = pe ? pe.innerHTML : null;
    snapshotTexts = {};
    TEXT_KEYS.forEach(function(k){ var el = textEl(k); if (el) snapshotTexts[k] = el.innerHTML; });
    return snap;
  }
  function restoreSnapshot(snap){
    lists().forEach(function(p){ if (p[1] && snap[p[0]] != null) p[1].innerHTML = snap[p[0]]; });
    var pe = percEl();
    if (pe && snapshotPerc != null) pe.innerHTML = snapshotPerc;
    TEXT_KEYS.forEach(function(k){
      var el = textEl(k);
      if (el && snapshotTexts[k] != null) el.innerHTML = snapshotTexts[k];
    });
  }

  function decorate(list){
    // Remove placeholder vazio (data-edit-empty) ao entrar em modo edição —
    // ele não tem contenteditable e estava confundindo: usuário clicava nele
    // achando que ia editar, mas o texto digitado não era coletado.
    Array.prototype.forEach.call(list.querySelectorAll('[data-edit-empty]'), function(ph){ ph.remove(); });
    Array.prototype.forEach.call(list.querySelectorAll('[data-edit-item]'), function(item){
      item.setAttribute('contenteditable','true');
      if (!item.querySelector('.edit-rm')){
        var rm = document.createElement('button');
        rm.type='button'; rm.className='edit-rm'; rm.textContent='×'; rm.title='Clique para remover (precisa confirmar)';
        rm.contentEditable = 'false';
        // ANTI-ACIDENTE: 1º click vira "Confirmar?" pulsante. 2º click em até
        // 3s remove. Reverte sozinho após 3s. Resolve sintoma 2026-05-12 onde
        // items sumiam silenciosamente pelo click acidental.
        var confirmTimer = null;
        rm.addEventListener('click', function(e){
          e.preventDefault(); e.stopPropagation();
          if (rm.classList.contains('confirming')) {
            if (confirmTimer) clearTimeout(confirmTimer);
            item.remove();
            return;
          }
          rm.classList.add('confirming');
          rm.textContent = 'Confirmar?';
          confirmTimer = setTimeout(function(){
            rm.classList.remove('confirming');
            rm.textContent = '×';
          }, 3000);
        });
        item.appendChild(rm);
      }
    });
    if (!list.parentElement.querySelector('.edit-add')){
      var add = document.createElement('button');
      add.type='button'; add.className='edit-add'; add.textContent='+ Adicionar';
      add.addEventListener('click', function(){
        var d = document.createElement('div');
        d.className='ana-item'; d.setAttribute('data-edit-item','');
        d.setAttribute('contenteditable','true');
        d.textContent='Novo ponto';
        var rm = document.createElement('button');
        rm.type='button'; rm.className='edit-rm'; rm.textContent='×'; rm.contentEditable='false';
        rm.addEventListener('click', function(){ d.remove(); });
        d.appendChild(rm);
        list.appendChild(d);
        // Seleciona o texto "Novo ponto" pra usuário substituir digitando.
        // Antes o cursor caía DEPOIS do button × — texto digitado virava
        // child do button (bug que confundia o collect).
        d.focus();
        var textNode = d.firstChild;
        if (textNode && textNode.nodeType === 3) {
          var range = document.createRange();
          range.setStart(textNode, 0);
          range.setEnd(textNode, textNode.nodeValue.length);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        }
      });
      list.parentElement.appendChild(add);
    }
  }
  function undecorate(list){
    Array.prototype.forEach.call(list.querySelectorAll('[data-edit-item]'), function(item){
      item.removeAttribute('contenteditable');
      var rm = item.querySelector('.edit-rm'); if (rm) rm.remove();
    });
    var add = list.parentElement.querySelector('.edit-add'); if (add) add.remove();
  }

  function startEdit(){
    snapshot = takeSnapshot();
    lists().forEach(function(p){ if (p[1]) decorate(p[1]); });
    var pe = percEl();
    if (pe) { pe.setAttribute('contenteditable','true'); pe.classList.add('perc-editing'); }
    TEXT_KEYS.forEach(function(k){
      var el = textEl(k);
      if (el) { el.setAttribute('contenteditable','true'); el.removeAttribute('data-empty'); }
    });
    document.body.classList.add('editing');
    btnTog.style.display='none';
    btnSave.style.display='inline-flex';
    btnCanc.style.display='inline-flex';
    editing = true;
  }
  function cancelEdit(){
    if (snapshot) restoreSnapshot(snapshot);
    lists().forEach(function(p){ if (p[1]) undecorate(p[1]); });
    var pe = percEl();
    if (pe) { pe.removeAttribute('contenteditable'); pe.classList.remove('perc-editing'); }
    TEXT_KEYS.forEach(function(k){
      var el = textEl(k);
      if (el) {
        el.removeAttribute('contenteditable');
        if (!(el.textContent || '').trim()) el.setAttribute('data-empty','true');
      }
    });
    document.body.classList.remove('editing');
    btnTog.style.display='inline-flex';
    btnSave.style.display='none';
    btnCanc.style.display='none';
    editing = false;
  }
  function collect(){
    var out = {};
    lists().forEach(function(p){
      var sec = p[0], list = p[1];
      if (!list) { out[sec] = []; return; }
      var items = list.querySelectorAll('[data-edit-item]');
      var arr = [];
      Array.prototype.forEach.call(items, function(item){
        var clone = item.cloneNode(true);
        var rm = clone.querySelector('.edit-rm'); if (rm) rm.remove();
        var t = (clone.textContent || '').trim();
        if (t) arr.push(t);
      });
      out[sec] = arr;
    });
    // Percepção: pega texto livre (preserva quebras como newline)
    var pe = percEl();
    if (pe) {
      // Substitui <br> por newline antes de pegar textContent
      var clone = pe.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('br'), function(br){
        br.replaceWith('\\n');
      });
      out.percepcao = (clone.textContent || '').trim();
    }
    // Caixas por seção (DRE, Faturamento, Balanço) — mesma lógica do textEl
    TEXT_KEYS.forEach(function(k){
      var el = textEl(k);
      if (!el) return;
      var clone = el.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll('br'), function(br){
        br.replaceWith('\\n');
      });
      out['percepcao' + k.charAt(0).toUpperCase() + k.slice(1)] = (clone.textContent || '').trim();
    });
    return out;
  }
  function saveEdit(){
    var data = collect();
    btnSave.disabled = true; btnSave.textContent = 'Salvando...';
    fetch('__BASE_URL__/api/r/' + REPORT_ID + '/edit', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        fortes:               data.fortes,
        fracos:               data.fracos,
        alertas:              data.alertas,
        percepcao:            data.percepcao,
        percepcaoDre:         data.percepcaoDre,
        percepcaoFaturamento: data.percepcaoFaturamento,
        percepcaoBalanco:     data.percepcaoBalanco,
        autor:                selAut.value,
        token:                TOKEN
      })
    }).then(function(r){
      if (!r.ok) return r.text().then(function(t){ throw new Error(t || ('HTTP '+r.status)); });
      return r.json();
    }).then(function(resp){
      lists().forEach(function(p){ if (p[1]) undecorate(p[1]); });
      var pe = percEl();
      if (pe) { pe.removeAttribute('contenteditable'); pe.classList.remove('perc-editing'); }
      TEXT_KEYS.forEach(function(k){
        var el = textEl(k);
        if (el) {
          el.removeAttribute('contenteditable');
          if (!(el.textContent || '').trim()) el.setAttribute('data-empty','true');
          else el.removeAttribute('data-empty');
        }
      });
      document.body.classList.remove('editing');
      btnTog.style.display='inline-flex';
      btnSave.style.display='none';
      btnCanc.style.display='none';
      editing = false;
      // Toast detalhado: mostra exatamente o que o backend gravou.
      // Antes era "Alterações salvas" genérico — usuário ficava sem saber
      // se algo passou batido (caso real 2026-05-12).
      var parts = [];
      var nF = (resp && resp.fortes  ? resp.fortes.length  : 0);
      var nW = (resp && resp.fracos  ? resp.fracos.length  : 0);
      var nA = (resp && resp.alertas ? resp.alertas.length : 0);
      if (nF) parts.push(nF + ' forte' + (nF !== 1 ? 's' : ''));
      if (nW) parts.push(nW + ' fraco' + (nW !== 1 ? 's' : ''));
      if (nA) parts.push(nA + ' alerta' + (nA !== 1 ? 's' : ''));
      if (resp && resp.percepcao && resp.percepcao.length)               parts.push('percepção ✓');
      if (resp && resp.percepcaoDre && resp.percepcaoDre.length)         parts.push('DRE ✓');
      if (resp && resp.percepcaoFaturamento && resp.percepcaoFaturamento.length) parts.push('Faturamento ✓');
      if (resp && resp.percepcaoBalanco && resp.percepcaoBalanco.length) parts.push('Balanço ✓');
      toast.textContent = parts.length ? ('Salvo: ' + parts.join(' · ')) : 'Salvo (nada para gravar)';
      toast.classList.add('show');
      setTimeout(function(){ toast.classList.remove('show'); }, 3500);
    }).catch(function(e){
      alert('Erro ao salvar: ' + (e && e.message ? e.message : e));
    }).finally(function(){
      btnSave.disabled = false; btnSave.innerHTML = '&#128190; Salvar';
    });
  }
  btnTog.addEventListener('click', startEdit);
  btnCanc.addEventListener('click', cancelEdit);
  btnSave.addEventListener('click', saveEdit);
  window.addEventListener('beforeunload', function(e){
    if (editing){ e.preventDefault(); e.returnValue = ''; }
  });
})();
</script>

${pages}

<script>
// Autosave do Pleito do Comitê: PATCH /api/r/{id}/pleito-comite debounced 800ms.
// Edição livre (sem token) — qualquer um com o link pode preencher.
(function(){
  var m = location.pathname.match(/\\/r\\/([a-z0-9]{8,16})/);
  if (!m) return;
  var REPORT_ID = m[1];
  var inputs = document.querySelectorAll('.pc-input');
  if (inputs.length === 0) return;
  var status = document.getElementById('pcStatus');
  var saveTimer = null;
  function setState(cls){
    inputs.forEach(function(el){ el.classList.remove('saving','saved','error'); if (cls) el.classList.add(cls); });
  }
  function pad(n){ return n < 10 ? '0' + n : '' + n; }
  function fmtNow(){ var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function collect(){
    var v = {};
    inputs.forEach(function(el){
      var k = el.getAttribute('data-pc-key');
      var val = (el.value || '').trim();
      if (k && val) v[k] = val;
    });
    return v;
  }
  function save(){
    setState('saving');
    if (status) status.textContent = 'Salvando…';
    fetch('/api/r/' + REPORT_ID + '/pleito-comite', {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ values: collect() })
    }).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(){
      setState('saved');
      if (status) status.textContent = 'Salvo às ' + fmtNow();
      setTimeout(function(){ setState(''); }, 1500);
    }).catch(function(err){
      setState('error');
      if (status) status.textContent = 'Erro ao salvar: ' + err.message;
    });
  }
  inputs.forEach(function(el){
    el.addEventListener('input', function(){
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 800);
    });
  });

  // Botão "Baixar Parecer (PDF)" — chama endpoint /api/r/{id}/parecer-pdf
  // que monta o documento "Decisão do Comitê" no servidor (cabeçalho +
  // comparativo pleito × aprovado + observações). Antes de chamar, força
  // um save imediato do autosave pra garantir que o servidor leia o que
  // o comitê acabou de digitar.
  function ensureSaved(){
    return saveTimer
      ? new Promise(function(res){ clearTimeout(saveTimer); save(); setTimeout(res, 600); })
      : Promise.resolve();
  }

  var dl = document.getElementById('pcDownloadBtn');
  if (dl) {
    dl.addEventListener('click', function(){
      dl.disabled = true;
      var orig = dl.innerHTML;
      dl.textContent = 'Gerando...';
      ensureSaved().then(function(){
        return fetch('/api/r/' + REPORT_ID + '/parecer-pdf', { method: 'POST' });
      }).then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      }).then(function(blob){
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'parecer-' + REPORT_ID + '.pdf';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 10000);
      }).catch(function(err){
        alert('Erro ao gerar PDF: ' + err.message);
      }).finally(function(){
        dl.disabled = false;
        dl.innerHTML = orig;
      });
    });
  }

  var vw = document.getElementById('pcViewBtn');
  if (vw) {
    vw.addEventListener('click', function(){
      vw.disabled = true;
      var orig = vw.innerHTML;
      vw.textContent = 'Abrindo...';
      ensureSaved().then(function(){
        window.open('/api/r/' + REPORT_ID + '/parecer-html', '_blank');
      }).finally(function(){
        vw.disabled = false;
        vw.innerHTML = orig;
      });
    });
  }
})();
</script>

</body>
</html>`;

  return { html, headerTemplate: "", footerTemplate: "" };
}
