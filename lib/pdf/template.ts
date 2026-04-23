import type { PDFReportParams } from "@/lib/generators/pdf";
import type { FundCriterion } from "@/types";
import type { RespostaCriterio } from "@/types/politica-credito";
import { CAPITAL_LOGO_B64 } from "@/lib/assets/capital-logo-b64";
import { recomputeSCRTotals } from "@/lib/hydrateFromCollection";

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
  if (score >= 7) return "var(--g6)";
  if (score >= 4) return "var(--a5)";
  return "var(--r6)";
}
function scoreBorder(score: number): string {
  if (score >= 7) return "var(--g6)";
  if (score >= 4) return "var(--a5)";
  return "var(--r6)";
}
function decisionBg(decision: string): string {
  const d = decision.toUpperCase();
  if (d.includes("APROVADO") && !d.includes("COND")) return "var(--g6)";
  if (d.includes("COND")) return "var(--a5)";
  return "var(--r6)";
}

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
    <img src="data:image/png;base64,${LOGO_B64}" alt="Capital Finanças" style="height:13px;object-fit:contain;display:block;opacity:0.5" />
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
  .page:not(.page-capa){margin:0!important;padding:0!important;max-width:none!important;box-shadow:none!important;border-radius:0!important;overflow:visible!important;background:transparent!important}
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
.ftr{background:var(--x0);border-top:1px solid var(--x2);padding:10px 32px;display:flex;justify-content:space-between;align-items:center}
.ftr span{font-size:var(--fs-label);color:var(--x4);letter-spacing:0.04em}
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
.scr-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}
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
.fin-title{font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x5);margin-bottom:12px}
.chart{display:flex;align-items:flex-end;gap:3px;height:100px;margin-bottom:8px;overflow:visible}
.bars{display:flex;align-items:flex-end;gap:4px;height:120px;margin-bottom:8px;overflow:visible}
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
.doc-grid .pf-row.absent{border-left:3px solid var(--x3)}
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
  const ratingLabel = score >= 7 ? "Baixo Risco" : score >= 4 ? "Risco Moderado" : "Alto Risco";

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
    ${params.scoreV2 ? (() => {
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
    </div>`}

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
  const ratingLabel = score >= 7 ? "Baixo Risco" : score >= 4 ? "Risco Moderado" : "Alto Risco";
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

    const pl = irMap[cpfK] ? fmtMoneyAbr(irMap[cpfK]) : "—";
    return `<tr><td><b>${esc(s.nome)}</b></td><td style="font-family:'JetBrains Mono',monospace;font-size:11px">${fmtCpf(cpfRaw)}</td><td>${esc(cleanQual)}</td><td style="color:var(--x4)">${fmt(part)}</td><td><b>${pl}</b></td></tr>`;
  }).join("");

  // SCR cards
  const scr = d.scr;
  const totalDivida = scr?.totalDividasAtivas || scr?.carteiraAVencer || "—";
  const vencidos = scr?.vencidos ?? "—";
  const vencNum = numVal(vencidos);
  const totalNum = numVal(totalDivida);
  const pctVencido = totalNum > 0 && vencNum >= 0 ? ((vencNum / totalNum) * 100).toFixed(1) + "%" : "0,0%";
  const nIfs = scr?.qtdeInstituicoes ?? "—";
  const alavStr = params.alavancagem != null ? params.alavancagem.toFixed(2) + "x" : "—";
  const fmmNumVal = numVal(d.faturamento?.fmm12m ?? d.faturamento?.mediaAno ?? "0");
  const alavAtual = params.alavancagem ?? (fmmNumVal > 0 ? totalNum / fmmNumVal : 0);

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
  const proc = d.processos;
  const procTotal = numVal(proc?.passivosTotal ?? "0");
  const procColor = procTotal > 5 ? "red" : procTotal > 0 ? "red" : "green";
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
  const fmm = d.faturamento?.fmm12m ?? d.faturamento?.mediaAno ?? "—";
  const total12 = d.faturamento?.somatoriaAno ?? "—";
  const tendencia = d.faturamento?.tendencia ?? "indefinido";
  const tendLabel = tendencia === "crescimento" ? "↑ crescimento" : tendencia === "queda" ? "↓ queda" : "→ estável";
  const tendColor = tendencia === "crescimento" ? "var(--g6)" : tendencia === "queda" ? "var(--r6)" : "var(--x5)";

  // SCR table
  const scrAnt = d.scrAnterior;
  let scrTable = "";
  if (scr && scrAnt) {
    // Sort by period: scrCur = more recent (Atual), scrPrv = older (Anterior)
    const parseScrPrd = (s: string) => { const p = (s ?? "").split("/"); return p.length === 2 ? parseInt(p[1], 10) * 100 + parseInt(p[0], 10) : 0; };
    const scrCur = parseScrPrd(scr.periodoReferencia ?? "") >= parseScrPrd(scrAnt.periodoReferencia ?? "") ? scr : scrAnt;
    const scrPrv = parseScrPrd(scr.periodoReferencia ?? "") >= parseScrPrd(scrAnt.periodoReferencia ?? "") ? scrAnt : scr;
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
      scrTable = `<table class="scr-tbl">
        <thead><tr><th>Métrica</th><th>Valor</th></tr></thead>
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
      <div class="ifs-note">Instituições financeiras: ${fmt(scr.qtdeInstituicoes)} · Operações: ${fmt(scr.qtdeOperacoes)}</div>`;
    }
  }

  // Curva ABC (inline in page 2)
  const abc = d.curvaABC;
  let abcHtml = "";
  if (abc && abc.clientes.length > 0) {
    const maxVal = numVal(abc.clientes[0]?.valorFaturado ?? "0");
    const rows2 = abc.clientes.slice(0, 5).map((c, i) => {
      const barW = maxVal > 0 ? Math.round((numVal(c.valorFaturado)/maxVal)*100) : 0;
      const clsCls = (c.classe ?? "c").toLowerCase();
      return `<tr>
        <td><span class="abc-rank">${i+1}</span></td>
        <td><b>${esc(c.nome)}</b><div class="abc-bar" style="width:${barW}%"></div></td>
        <td class="r">${fmtMoney(c.valorFaturado)}</td>
        <td class="r bold">${fmtPct(c.percentualReceita)}</td>
        <td class="r bold">${fmtPct(c.percentualAcumulado)}</td>
        <td><span class="abc-cl ${clsCls}">${esc(c.classe)}</span></td>
      </tr>`;
    }).join("");
    abcHtml = `${stitle("Curva ABC (Top 5)")}
    <div class="abc-wrap">
      <table class="abc-tbl">
        <thead><tr><th style="width:40px">#</th><th>Cliente</th><th class="r">Faturamento</th><th class="r">% Rec.</th><th class="r">% Acum.</th><th style="width:50px">Cl.</th></tr></thead>
        <tbody>${rows2}</tbody>
      </table>
      <div class="abc-summary">Top 3: <b>${fmtPct(abc.concentracaoTop3)}</b> · Top 5: <b>${fmtPct(abc.concentracaoTop5)}</b> · Total clientes: <b>${abc.totalClientesNaBase}</b></div>
    </div>`;
  }

  // Pleito (from relatorioVisita) — tabela completa de parâmetros
  const rv = d.relatorioVisita;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toS = (val: any): string => Array.isArray(val) ? val.join(", ") : (val == null ? "" : String(val));
  const v_ = (val: unknown) => { const s = toS(val).trim(); return s || "—"; };
  const vMoney = (val: unknown) => { const s = toS(val).trim(); return s ? fmtMoneyAbr(s) : "—"; };
  const vDias  = (val: unknown) => { const s = toS(val).trim(); return s ? `${s} dias` : "—"; };
  const pleitoRows: Array<[string, string]> = [
    ["Limite Global",                    vMoney(rv?.limiteTotal)],
    ["Tranche Limite Global",            vMoney(rv?.tranche)],
    ["Limite Convencional",              vMoney(rv?.limiteConvencional)],
    ["Limite Comissária",                vMoney(rv?.limiteComissaria)],
    ["Limite por Sacado (20 a 30%)",     vMoney(rv?.limitePorSacado)],
    ["Limite Principais Sacados (30 a 40%)", vMoney(rv?.limitePrincipaisSacados)],
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
  const pleitoHtml = `${stitle("Pleito")}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
    <table class="tbl" style="margin:0"><tbody>${pleitoTableCol(col1r)}</tbody></table>
    <table class="tbl" style="margin:0"><tbody>${pleitoTableCol(col2r)}</tbody></table>
  </div>`;

  // Analise
  const fortes = params.pontosFortes ?? [];
  const fracos = params.pontosFracos ?? [];
  const alertsArr = (params.alerts ?? [])
    .filter(a => (a.severity === "CRÍTICO" || a.severity === "RESTRITIVO") && a.message?.trim() && a.message.trim() !== "—")
    .slice(0, 5).map(a => a.message);
  const analiseHtml = `${stitle("Análise")}
  <div class="ana-grid">
    <div class="ana-col f"><div class="ana-h">Pontos Fortes</div>${fortes.map(f=>`<div class="ana-item">${esc(f)}</div>`).join("") || '<div class="ana-item" style="color:var(--x4)">—</div>'}</div>
    <div class="ana-col w"><div class="ana-h">Pontos Fracos</div>${fracos.map(f=>`<div class="ana-item">${esc(f)}</div>`).join("") || '<div class="ana-item" style="color:var(--x4)">—</div>'}</div>
    <div class="ana-col a"><div class="ana-h">Alertas</div>${alertsArr.map(a=>`<div class="ana-item">${esc(a)}</div>`).join("") || '<div class="ana-item" style="color:var(--x4)">—</div>'}</div>
  </div>`;

  // Percepção
  const resumo = params.resumoExecutivo || (typeof params.aiAnalysis?.parecer === "object" ? params.aiAnalysis.parecer.resumoExecutivo : "") || "";
  const percHtml = `${stitle("Percepção do analista")}
  <div class="perc">
    <div class="perc-text" style="text-align:justify">${esc(resumo) || "—"}</div>
    <div class="perc-rec">Recomendação: <span class="dec" style="background:${decBg};font-size:10px">${fmtDecision(params.decision)}</span></div>
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
    </div>`;
  } else {
    mapHtml = `
    <div class="addr-box" style="margin-bottom:18px">
      <div class="l">Endereço</div>
      <div class="a">${esc(cnpj?.endereco ?? "—")}</div>
      <div class="t">Tipo: ${esc(cnpj?.tipoEmpresa ?? "Matriz")}</div>
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
        <div class="rat-c" style="border-color:${sb}">
          <div class="rat-n" style="color:${sc}">${score.toFixed(1)}</div>
          <div class="rat-d">/10</div>
        </div>
        <div class="rat-l" style="color:${sc}">${ratingLabel}</div>
        <div class="dec" style="background:${decBg}">${fmtDecision(params.decision)}</div>
      </div>
    </div>

    <!-- 2. Info strip — todos em uma linha -->
    <div class="istrip" style="grid-template-columns:repeat(6,1fr)">
      <div class="icell"><div class="l">Tempo de Fundação</div><div class="v sm">${fmt(params.companyAge)}</div></div>
      <div class="icell"><div class="l">Porte</div><div class="v sm">${fmt(cnpj?.porte)}</div></div>
      <div class="icell"><div class="l">Capital Social</div><div class="v sm mono">${fmtMoneyAbr(capitalSocial)}</div></div>
      <div class="icell"><div class="l">Tipo</div><div class="v sm">${fmt(cnpj?.tipoEmpresa ?? "Matriz")}</div></div>
      <div class="icell"><div class="l">Local</div><div class="v sm">${fmt(local)}</div></div>
      <div class="icell"><div class="l">Natureza Jurídica</div><div class="v sm">${cnpj?.naturezaJuridica ? esc(cnpj.naturezaJuridica) : "—"}</div></div>
    </div>

    <!-- 3. Segmento -->
    ${cnpj?.cnaePrincipal ? `<div class="seg"><b>${esc(cnpj.cnaePrincipal)}</b>${cnpj.cnaeSecundarios ? `<div class="sec">CNAEs sec.: ${esc(cnpj.cnaeSecundarios)}</div>` : ""}</div>` : ""}

    <!-- 4. Localização -->
    ${stitle("Localização")}
    ${mapHtml}

    <!-- 5. Sócios -->
    ${stitle("Quadro societário")}
    <table class="soc-tbl">
      <thead><tr><th>Sócio</th><th>CPF/CNPJ</th><th>Qualificação</th><th>Part.</th><th>Patrim. (IR)</th></tr></thead>
      <tbody>${socRows || `<tr><td colspan="5" style="color:var(--x4);text-align:center">—</td></tr>`}</tbody>
    </table>
    <div class="soc-extra">Capital Social: <b>${fmtMoney(capitalSocial)}</b> · Grupo Econômico: <b>${d.grupoEconomico?.empresas?.length > 0 ? d.grupoEconomico.empresas.length + " empresa(s) identificada(s)" : "Não identificado"}</b></div>

    <!-- 5b. Grupo Econômico dos Sócios -->
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

      const sitClass = (sit: string) => {
        const u = (sit ?? "").toUpperCase();
        if (u.includes("ATIVA")) return "ativa";
        if (u.includes("BAIXA")) return "baixada";
        if (u.includes("SUSP")) return "suspensa";
        if (u.includes("INAPT")) return "inapta";
        return "outro";
      };

      const socioBlocks = Object.entries(porSocio).map(([socio, emps]) => {
        const rows = emps.map(e => {
          const cnpjFmt = e.cnpj ? e.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—";
          const sitCls = sitClass(e.situacao ?? "");
          const hasSCR = e.scrTotal && e.scrTotal !== "—";
          const hasProt = e.protestos && e.protestos !== "—";
          const hasProc = e.processos && e.processos !== "—";
          const relacaoLabel = (e.relacao ?? "")
            .replace(/\bRéu\b/gi, "Polo Passivo")
            .replace(/\bAutor\b(?=\s*\(Processo\))/gi, "Polo Ativo");
          return `<tr>
            <td><b>${esc(e.razaoSocial)}</b>${e.participacao ? `<span style="color:var(--x4);font-size:var(--fs-tag);margin-left:6px">${esc(e.participacao)}</span>` : ""}</td>
            <td class="mono">${cnpjFmt}</td>
            <td><span class="ge-rel">${esc(relacaoLabel)}</span></td>
            <td><span class="ge-badge ${sitCls}">${esc(e.situacao ?? "—")}</span></td>
            <td class="mono" style="color:${hasSCR ? "var(--n9)" : "var(--x4)"}">${hasSCR ? fmtMoneyAbr(e.scrTotal) : "—"}</td>
            <td style="text-align:center;color:${hasProt && e.protestos !== "0" ? "var(--r6)" : "var(--g6)"};font-weight:600">${hasProt ? e.protestos : "—"}</td>
            <td style="text-align:center;color:${hasProc && e.processos !== "0" ? "var(--r6)" : "var(--g6)"};font-weight:600">${hasProc ? e.processos : "—"}</td>
          </tr>`;
        }).join("");

        return `<div class="ge-socio-hdr">
          <span style="font-size:14px">👤</span> Via sócio: ${esc(socio)}
          <span style="font-weight:500;color:var(--n8);margin-left:auto">${emps.length} empresa${emps.length > 1 ? "s" : ""}</span>
        </div>
        <table class="ge-tbl">
          <thead><tr><th>Razão Social</th><th>CNPJ</th><th>Relação</th><th>Situação</th><th>SCR</th><th style="text-align:center">Prot.</th><th style="text-align:center">Proc.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      }).join("");

      const alertaParentesco = ge.alertaParentesco && (ge.parentescosDetectados ?? []).length > 0
        ? `<div class="ge-parentesco"><span class="atag alert mod" style="padding:2px 8px;border-radius:3px;font-size:var(--fs-tag);font-weight:700">ATENÇÃO</span>
           Possível parentesco entre sócios: ${ge.parentescosDetectados!.map((p: {socio1:string;socio2:string;sobrenomeComum:string}) => `<b>${esc(p.socio1)}</b> e <b>${esc(p.socio2)}</b> (sobrenome <i>${esc(p.sobrenomeComum)}</i>)`).join("; ")}</div>`
        : "";

      return `${stitle("Grupo econômico dos sócios")}
      <div class="ge-block">
        <div class="ge-header">
          <span class="title">Empresas vinculadas via sócios</span>
          <span class="count">${ge.empresas.length} empresa${ge.empresas.length > 1 ? "s" : ""} identificada${ge.empresas.length > 1 ? "s" : ""}</span>
        </div>
        ${socioBlocks}
        ${alertaParentesco}
      </div>`;
    })()}

    <!-- 6. Risco Consolidado -->
    ${stitle("Risco consolidado")}
    <div class="risk-section">
      <div class="scr-strip">
        <div class="scr-card"><div class="l">SCR Total</div><div class="v mono">${fmtMoneyAbr(totalDivida)}</div></div>
        <div class="scr-card"><div class="l">SCR Vencido</div><div class="v ${vencNum > 0 ? "" : "green"}">${fmtMoneyAbr(vencidos)}</div></div>
        <div class="scr-card"><div class="l">% Vencido</div><div class="v ${vencNum > 0 ? "" : "green"}">${pctVencido}</div></div>
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
      <div style="margin-top:8px">
        <div class="label" style="font-size:var(--fs-label);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x4);margin-bottom:4px">CCF — Cheques Sem Fundo</div>
        ${ccfBlock}
      </div>
      <div style="margin-top:10px">${alertsHtml}</div>
    </div>

    <!-- 7. Faturamento + SCR -->
    ${stitle("Faturamento & SCR")}
    <div class="fin-row">
      <div class="fin-box">
        <div class="fin-title">Faturamento mensal — últimos 12 meses</div>
        <div class="bars" style="padding-top:18px">${fatBars}</div>
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

    <!-- 8. Curva ABC -->
    ${abcHtml}

    <!-- 9. Pleito -->
    ${pleitoHtml}

    <!-- 10. Análise -->
    ${analiseHtml}

    <!-- 11. Percepção -->
    ${percHtml}
  </div>`;

  return page(content, 3, date);
}


// ─── Parecer Preliminar (última página) ───────────────────────────────────────
function pageParecer(params: PDFReportParams, date: string): string {
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
    <div class="istrip c4" style="margin-top:20px">
      <div class="icell ${cl.classificacao === "APROVADO" ? "success" : cl.classificacao === "CONDICIONAL" ? "warn" : "danger"}">
        <div class="l">Decisão</div>
        <div class="v sm ${cl.classificacao === "APROVADO" ? "green" : cl.classificacao === "CONDICIONAL" ? "" : "red"}">${esc(cl.classificacao ?? "—")}</div>
      </div>
      <div class="icell"><div class="l">Limite Aprovado</div><div class="v sm mono">${cl.limiteAjustado ? "R$\u00a0" + cl.limiteAjustado.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</div></div>
      <div class="icell"><div class="l">Prazo</div><div class="v">${cl.prazo ? cl.prazo + " dias" : "—"}</div></div>
      <div class="icell"><div class="l">Score</div><div class="v" style="color:${sc}">${score > 0 ? score.toFixed(1) : "—"}</div></div>
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
      <div style="text-align:center;min-width:100px">
        <div style="width:72px;height:72px;border-radius:50%;border:3px solid ${sb};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px">
          <div style="font-size:26px;font-weight:700;color:${sc};line-height:1">${score.toFixed(1)}</div>
          <div style="font-size:10px;color:var(--x4)">/10</div>
        </div>
        <div style="display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;background:${decBg2};color:#fff">${fmtDecision(params.decision)}</div>
      </div>
    </div>
    ${params.observacoes ? `${stitle("Observações")}
    <div class="perc"><div class="perc-text">${esc(params.observacoes)}</div></div>` : ""}
    `;
  }

  const totalPages = 12;
  return page(`${stitle("Parecer Preliminar")}${content}`, totalPages, date);
}

// ─── Page 6: Parâmetros (Limite de Crédito) ──────────────────────────────────
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

  return page(content, 6, date);
}

// ─── Page 7: Faturamento Detalhado ────────────────────────────────────────────
function pageFaturamento(params: PDFReportParams, date: string): string {
  const fat = params.data.faturamento;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meses = sortMesCrono(Array.from(new Map((fat?.meses ?? []).map((m: any) => [m.mes as string, m])).values())).slice(-12);
  const fmm = fat?.fmm12m ?? fat?.mediaAno ?? "—";
  const total12 = fat?.somatoriaAno ?? "—";
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

  return page(content, 7, date);
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

  // Processos
  const totalProc = numVal(proc?.passivosTotal ?? "0");
  const passivo = proc?.poloPassivoQtd ?? proc?.passivosTotal ?? "—";
  const ativo = proc?.poloAtivoQtd ?? proc?.ativosTotal ?? "—";
  const temRJ = proc?.temRJ || proc?.temFalencia;

  const distRows = (proc?.distribuicao ?? []).map(d => {
    const pct = parseFloat(d.pct) || 0;
    const isFiscal = (d.tipo ?? "").toLowerCase().includes("fiscal");
    return `<div class="prop-row"><span class="prop-label">${esc(d.tipo)}</span><div class="prop-fill${isFiscal ? " red" : ""}" style="width:${Math.min(pct,100)}%"></div><span class="prop-pct">${d.qtd} proc. <span style="color:var(--x4);font-weight:400">${d.pct ? "· " + d.pct + "%" : ""}</span></span></div>`;
  }).join("");

  const top5Proc = (proc?.top10Recentes ?? []).slice(0,5);
  const top5ProcRows = top5Proc.map(p =>
    `<tr><td class="${(p.tipo ?? "").toLowerCase().includes("fiscal") ? "red" : ""}">${esc(p.tipo)}</td><td>${fmtDate(p.data)}</td><td>${esc(p.assunto)}</td><td>${fmt(p.fase)}</td></tr>`
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
    <div class="istrip c4" style="margin-bottom:14px">
      <div class="icell ${vigQtd > 0 ? "danger" : "success"}"><div class="l">Vigentes (Qtd)</div><div class="v ${vigQtd > 0 ? "red" : "green"}">${vigQtd}</div></div>
      <div class="icell ${vigQtd > 0 ? "danger" : ""}"><div class="l">Vigentes (R$)</div><div class="v ${vigQtd > 0 ? "red" : "muted"} sm mono">${fmtMoney(vigVal)}</div></div>
      <div class="icell ${regQtd > 0 ? "success" : ""}"><div class="l">Regularizados (Qtd)</div><div class="v ${regQtd > 0 ? "green" : "muted"}">${regQtd}</div></div>
      <div class="icell"><div class="l">Regularizados (R$)</div><div class="v muted sm mono">${fmtMoney(regVal)}</div></div>
    </div>
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
      <thead><tr><th>Tipo</th><th>Data</th><th>Assunto</th><th>Fase</th></tr></thead>
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
          <div class="icell ${ccfQtd > 0 ? "danger" : "success"}"><div class="l">Registros CCF</div><div class="v ${ccfQtd > 0 ? "red" : "green"}">${ccfQtd > 0 ? `<b>${ccfQtd}</b>` : "0 — limpo"}</div></div>
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
  `;

  return page(content, 8, date);
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
    type SCRMoneyField = "carteiraCurtoPrazo"|"carteiraLongoPrazo"|"carteiraAVencer"|"vencidos"|"limiteCredito"|"totalDividasAtivas";
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
      const vVenc = scrVar(sa.vencidos, sp?.vencidos, true);
      const vTotal2 = scrVar(sa.totalDividasAtivas, sp?.totalDividasAtivas, true);
      return `<div style="margin-bottom:14px;padding:14px;background:var(--x0);border-radius:8px;border:1px solid var(--x2)">
        <div style="font-size:12px;font-weight:700;color:var(--n9);margin-bottom:10px">${esc(ss.nomeSocio)} <span style="font-size:10px;color:var(--x5);font-family:'JetBrains Mono',monospace">${fmtCpf(ss.cpfSocio)}</span></div>
        <div class="istrip c4">
          <div class="icell"><div class="l">Total Dívidas</div><div class="v sm mono">${fmtMoneyAbr(sa.totalDividasAtivas)}</div>${sp ? `<div class="sub var-cell ${vTotal2.cls}" style="font-size:9px">${esc(vTotal2.val)}</div>` : ""}</div>
          <div class="icell ${numVal(sa.vencidos) > 0 ? "danger" : ""}"><div class="l">Vencidos</div><div class="v sm mono ${numVal(sa.vencidos) > 0 ? "red" : "green"}">${fmtMoneyAbr(sa.vencidos)}</div>${sp ? `<div class="sub var-cell ${vVenc.cls}" style="font-size:9px">${esc(vVenc.val)}</div>` : ""}</div>
          <div class="icell"><div class="l">A Vencer</div><div class="v sm mono">${fmtMoneyAbr(sa.carteiraAVencer)}</div></div>
          <div class="icell"><div class="l">IFs</div><div class="v">${fmt(sa.qtdeInstituicoes)}</div></div>
        </div>
        <div class="inf" style="margin-top:6px;margin-bottom:0">Período: <b>${esc(sa.periodoReferencia ?? "—")}</b>${sp ? ` · Anterior: <b>${esc(sp.periodoReferencia ?? "—")}</b>` : ""}</div>
      </div>`;
    }).join("");
    sociosSCRSection = `${stitle("08 · SCR dos Sócios (PF)")}${blocks}`;
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
    <div class="inf">Período anterior: <b>${esc(scrPeriodoAnt)}</b> · Período atual: <b>${esc(scrPeriodoAtual)}</b></div>
    <table class="tbl">
      <thead><tr><th>Métrica</th><th>Categoria</th><th class="r">${esc(scrPeriodoAnt)}</th><th class="r">${esc(scrPeriodoAtual)}</th><th class="r">Var.</th></tr></thead>
      <tbody>${scrRows}</tbody>
    </table>
    ${modalSection}
    ${sociosSCRSection}`;
  }

  const content = `${scrSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de SCR não disponíveis</div>`, 9, date);
}

// ─── Page 10: DRE + Balanço + ABC ────────────────────────────────────────────
function pageBalancoABC(params: PDFReportParams, date: string): string {
  const dre = params.data.dre;
  const bal = params.data.balanco;
  const abc = params.data.curvaABC;

  // ── DRE ──────────────────────────────────────────────────────────────────────
  let dreSection = "";
  if (dre && dre.anos.length > 0) {
    const anos = dre.anos.slice(-2);
    const headers = anos.map(a => `<th class="r">${esc(a.ano)}</th>`).join("");
    const PCT_FIELDS = new Set(["margemBruta","margemEbitda","margemLiquida"]);
    const fields: Array<{label:string;key:keyof typeof anos[0]}> = [
      {label:"Receita Bruta",key:"receitaBruta"},
      {label:"Receita Líquida",key:"receitaLiquida"},
      {label:"Lucro Bruto",key:"lucroBruto"},
      {label:"Margem Bruta",key:"margemBruta"},
      {label:"EBITDA",key:"ebitda"},
      {label:"Margem EBITDA",key:"margemEbitda"},
      {label:"Lucro Líquido",key:"lucroLiquido"},
      {label:"Margem Líquida",key:"margemLiquida"},
    ];
    const dreRows = fields.map(f => {
      const isPct = PCT_FIELDS.has(f.key as string);
      const cells = anos.map(a => {
        const v = a[f.key];
        if (v == null || v === "" || v === "—") return `<td class="r">—</td>`;
        if (isPct) {
          const formatted = fmtPct(v);
          const isNeg = numVal(v) < 0;
          return `<td class="r ${isNeg ? "red" : ""}">${formatted}</td>`;
        }
        const isNeg = numVal(v) < 0;
        return `<td class="r ${isNeg ? "red" : ""}">${fmtMoney(v)}</td>`;
      }).join("");
      return `<tr><td class="b">${esc(f.label)}</td>${cells}</tr>`;
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
    ${dreAlerts}`;
  }

  let balSection = "";
  if (bal && bal.anos.length > 0) {
    const anos = bal.anos.slice(-2);
    const headers = anos.map(a => `<th class="r">${esc(a.ano)}</th>`).join("");
    const indentStyle = "padding-left:28px;color:var(--x5)";
    type BalRow = {label:string;key:keyof import("@/types").BalancoAno;bold:boolean;indent?:boolean;total?:boolean};
    const rows: BalRow[] = [
      {label:"Ativo Total",key:"ativoTotal",bold:true},
      {label:"Ativo Circulante",key:"ativoCirculante",bold:false,indent:true},
      {label:"Ativo Não Circulante",key:"ativoNaoCirculante",bold:false,indent:true},
      {label:"Passivo Circulante",key:"passivoCirculante",bold:true},
      {label:"Passivo Não Circulante",key:"passivoNaoCirculante",bold:true},
      {label:"Patrimônio Líquido",key:"patrimonioLiquido",bold:true,total:true},
    ];
    const balRows = rows.map(r => {
      const cells = anos.map(a => {
        const v = String(a[r.key] ?? "—");
        const isNeg = numVal(v) < 0;
        return `<td class="r ${isNeg ? "red" : ""}">${fmtMoney(v)}</td>`;
      }).join("");
      const tdStyle = r.indent ? ` style="${indentStyle}"` : "";
      const cls = r.total || r.bold ? " class=\"b\"" : "";
      const rowCls = r.total ? " class=\"total\"" : "";
      return `<tr${rowCls}><td${cls}${tdStyle}>${esc(r.label)}</td>${cells}</tr>`;
    }).join("");

    const lastBal = bal.anos[bal.anos.length - 1];
    const lc = numVal(lastBal?.liquidezCorrente ?? "0");
    const enDiv = numVal(lastBal?.endividamentoTotal ?? "0");
    const cg = numVal(lastBal?.capitalDeGiroLiquido ?? "0");
    const pl = numVal(lastBal?.patrimonioLiquido ?? "0");

    balSection = `
    ${stitle("10 · Balanço Patrimonial")}
    <table class="tbl">
      <thead><tr><th>Métrica</th>${headers}</tr></thead>
      <tbody>${balRows}</tbody>
    </table>
    ${stitle("Indicadores")}
    <div class="istrip c4">
      <div class="icell ${lc < 1 ? "danger" : ""}"><div class="l">Liquidez Corrente</div><div class="v ${lc < 1 ? "red" : "green"}">${lc > 0 ? lc.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"x" : "—"}</div></div>
      <div class="icell ${enDiv > 100 ? "danger" : ""}"><div class="l">Endividamento</div><div class="v ${enDiv > 100 ? "red" : "green"} sm">${fmtPct(lastBal?.endividamentoTotal)}</div></div>
      <div class="icell ${cg < 0 ? "danger" : ""}"><div class="l">Capital de Giro</div><div class="v ${cg < 0 ? "red" : "green"} sm">${fmtMoneyAbr(lastBal?.capitalDeGiroLiquido)}</div></div>
      <div class="icell ${pl < 0 ? "danger" : ""}"><div class="l">Patrimônio Líq.</div><div class="v ${pl < 0 ? "red" : "green"} sm">${fmtMoneyAbr(lastBal?.patrimonioLiquido)}</div></div>
    </div>
    ${pl < 0 ? `<div class="alert alta"><span class="atag">ALTA</span> PL negativo ${fmtMoneyAbr(lastBal?.patrimonioLiquido)} — passivo a descoberto</div>` : ""}
    ${lc < 0.5 ? `<div class="alert alta"><span class="atag">ALTA</span> Liquidez ${lastBal?.liquidezCorrente} — incapaz de cobrir obrigações de curto prazo</div>` : ""}`;
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
    ${stitle("11 · Curva ABC — Concentração de sacados")}
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

  const content = `${dreSection}${balSection}${abcSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de DRE/balanço/ABC não disponíveis</div>`, 10, date);
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
        ${!ir.debitosEmAberto ? `<div class="alert ok" style="margin:0"><span class="atag">OK</span> Sem débitos com a Receita Federal</div>` : `<div class="alert alta" style="margin:0"><span class="atag">ALTA</span> Débitos em aberto: ${esc(ir.descricaoDebitos ?? "")}</div>`}
        ${(() => {
          const soma = numVal(bensImoveis) + numVal(bensVeiculos) + numVal(ir.aplicacoesFinanceiras) + numVal((ir as { outrosBens?: string }).outrosBens ?? "0");
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
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de IR/Visita não disponíveis</div>`, 11, date);
}

// ─── Page 2: Checklist de Documentos ─────────────────────────────────────────
function pageChecklist(params: PDFReportParams, date: string): string {
  const cob = params.aiAnalysis?.coberturaAnalise;
  const docs = cob?.documentos ?? [];

  // Fallback: deduzir cobertura pelos campos presentes em ExtractedData
  const fallback = [
    { tipo:"cnpj",          label:"Cartão CNPJ",             presente: !!params.data.cnpj?.razaoSocial,        obrigatorio:true  },
    { tipo:"qsa",           label:"Quadro Societário",        presente: !!(params.data.qsa?.quadroSocietario?.length), obrigatorio:true  },
    { tipo:"contrato",      label:"Contrato Social",          presente: !!params.data.contrato?.objetoSocial,  obrigatorio:false },
    { tipo:"faturamento",   label:"Extrato de Faturamento",   presente: !!(params.data.faturamento?.meses?.length), obrigatorio:true  },
    { tipo:"scr",           label:"SCR (Banco Central)",      presente: !!params.data.scr?.totalDividasAtivas,  obrigatorio:true  },
    { tipo:"scrAnterior",   label:"SCR Período Anterior",     presente: !!params.data.scrAnterior,              obrigatorio:false },
    { tipo:"scrSocios",     label:"SCR dos Sócios (PF)",      presente: !!(params.data.scrSocios?.length),      obrigatorio:false },
    { tipo:"protestos",     label:"Certidão de Protestos",    presente: !!params.data.protestos?.vigentesQtd,   obrigatorio:true  },
    { tipo:"processos",     label:"Processos Judiciais",      presente: !!params.data.processos?.passivosTotal, obrigatorio:true  },
    { tipo:"dre",           label:"DRE",                      presente: !!(params.data.dre?.anos?.length),       obrigatorio:false },
    { tipo:"balanco",       label:"Balanço Patrimonial",      presente: !!(params.data.balanco?.anos?.length),   obrigatorio:false },
    { tipo:"curvaABC",      label:"Curva ABC / Clientes",     presente: !!(params.data.curvaABC?.clientes?.length), obrigatorio:false },
    { tipo:"irSocios",      label:"IR dos Sócios",            presente: !!(params.data.irSocios?.length),        obrigatorio:false },
    { tipo:"relatorioVisita",label:"Relatório de Visita",     presente: !!params.data.relatorioVisita,           obrigatorio:false },
    { tipo:"ccf",           label:"CCF (Cheques Sem Fundo)",  presente: params.data.ccf != null,                obrigatorio:true  },
    { tipo:"grupoEconomico",label:"Grupo Econômico",          presente: !!(params.data.grupoEconomico?.empresas?.length), obrigatorio:false },
  ];

  // When using AI coberturaAnalise, override CCF presence with extractor data.
  // The AI evaluates "company has CCF records", but the checklist asks "was the document provided".
  const lista = (docs.length > 0 ? docs : fallback).map(item =>
    item.tipo === "ccf" ? { ...item, presente: params.data.ccf != null } : item
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
    const statusColor = d.presente ? "var(--g6)" : d.obrigatorio ? "var(--r6)" : "var(--x4)";
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
    ${stitle("Score de Crédito V2 — Capital Finanças")}

    <!-- Score hero + tabela resumo -->
    <div style="display:flex;align-items:flex-start;gap:20px;margin-bottom:18px">
      <!-- Círculo de rating -->
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
      </div>

      <!-- Tabela de pilares -->
      <div style="flex:1;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
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
            <tr style="background:#eef3ff;border-top:2px solid #c7d2fe">
              <td style="padding:8px 10px;font-size:11px;font-weight:800;color:#1e3a8a">SCORE FINAL</td>
              <td style="padding:8px 10px;font-size:10px;font-weight:700;color:#374151;text-align:center">100%</td>
              <td style="padding:8px 10px;text-align:center;color:#94a3b8">—</td>
              <td style="padding:8px 10px;font-size:14px;font-weight:900;color:${ratingCor};text-align:center;font-family:'JetBrains Mono',monospace">${s.score_final.toFixed(1)}</td>
              <td style="padding:8px 10px"></td>
            </tr>
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
  const pages = [
    pageCapa(params, date),
    pageChecklist(params, date),
    pageSintese(params, date),
    pageParametros(params, date),
    pageFaturamento(params, date),
    pageProtestosProcessos(params, date),
    pageSCRDRE(params, date),
    pageBalancoABC(params, date),
    pageIRVisita(params, date),
    ...(scorePageHtml ? [scorePageHtml] : []),
    pageParecer(params, date),
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
${pages}
</body>
</html>`;

  return { html, headerTemplate: "", footerTemplate: "" };
}
