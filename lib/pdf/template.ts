import type { PDFReportParams } from "@/lib/generators/pdf";
import type { FundCriterion } from "@/types";

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
    <div><div class="logo">capital<span>finanças</span></div><div class="meta">CONSOLIDADOR DE DOCUMENTOS</div></div>
    <div style="display:flex;align-items:center"><div class="meta">Relatório de Due Diligence · ${date}</div><div class="pg">${pageNum}</div></div>
  </div>
  <div class="ct">${content}</div>
</div>`;
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function buildBars(meses: {mes:string;valor:string}[]): string {
  const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  function parseMesLabel(mes: string): string {
    // "01/2025" or "1/2025"
    const mSlash = mes.match(/^(\d{1,2})\//);
    if (mSlash) { const idx = parseInt(mSlash[1]) - 1; return MONTHS[idx] ?? mes; }
    // "2025-01"
    const mDash = mes.match(/^(\d{4})-(\d{2})/);
    if (mDash) { const idx = parseInt(mDash[2]) - 1; return MONTHS[idx] ?? mes; }
    // Already short label or unknown — take first 3 chars as fallback
    return mes.slice(0, 3);
  }
  const vals = meses.map(m => numVal(m.valor));
  const max = Math.max(...vals, 1);
  return meses.map(m => {
    const v = numVal(m.valor);
    const pct = Math.round((v/max)*100);
    const lbl = fmtMoneyAbr(v).replace("R$\u00a0","");
    return `<div class="bar-col"><div class="bar nv" style="height:${pct}%"><div class="bar-v">${lbl}</div></div><div class="bar-l">${esc(parseMesLabel(m.mes))}</div></div>`;
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
@page{size:A4;margin:14mm 16mm}
@media print{
  body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .page{page-break-after:always}
  .avoid-break{page-break-inside:avoid}
}
:root{--n9:#0c1b3a;--n8:#132952;--n7:#1a3a6b;--n1:#dce6f5;--n0:#eef3fb;--a5:#d4940a;--a1:#fdf3d7;--a0:#fef9ec;--r6:#c53030;--r1:#fee2e2;--r0:#fef2f2;--g6:#16653a;--g1:#d1fae5;--g0:#ecfdf5;--x9:#111827;--x7:#374151;--x5:#6b7280;--x4:#9ca3af;--x3:#d1d5db;--x2:#e5e7eb;--x1:#f3f4f6;--x0:#f9fafb;--gl:#73b815}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;background:#f0f2f7;color:var(--x9);-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',monospace}
.page{max-width:860px;margin:20px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(12,27,58,0.07)}
.hdr{background:var(--n9);padding:14px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--gl)}
.hdr .logo{font-size:15px;font-weight:700;color:#fff}
.hdr .logo span{color:var(--gl)}
.hdr .meta{font-size:10px;color:rgba(255,255,255,0.5)}
.hdr .pg{background:var(--gl);color:#fff;font-size:11px;font-weight:700;padding:3px 11px;border-radius:10px;margin-left:12px}
.ct{padding:28px 32px 40px}
.stitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--x5);margin:24px 0 10px;display:flex;align-items:center;gap:8px}
.stitle:first-child{margin-top:0}
.stitle .line{flex:1;height:1px;background:var(--x2)}
.emp{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--x2);margin-bottom:20px}
.emp-name{font-size:18px;font-weight:700;color:var(--n9);margin-bottom:3px}
.emp-fan{font-size:11px;color:var(--x5);margin-bottom:6px}
.emp-cnpj{font-size:12px;color:var(--x5)}
.emp-cnpj b{color:var(--x7);font-family:'JetBrains Mono',monospace}
.sit{display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:var(--g1);color:var(--g6);margin-left:8px}
.sit.inactive{background:var(--r1);color:var(--r6)}
.rat{text-align:center;min-width:110px}
.rat-c{width:72px;height:72px;border-radius:50%;border:3px solid var(--r6);display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px}
.rat-n{font-size:26px;font-weight:700;line-height:1}
.rat-d{font-size:10px;color:var(--x4)}
.rat-l{font-size:10px;font-weight:700}
.dec{display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:var(--r6);color:#fff;margin-top:4px}
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
.icell .l{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x4);margin-bottom:4px}
.icell .v{font-size:14px;font-weight:700;color:var(--n9)}
.icell .v.sm{font-size:11px}
.icell .v.red{color:var(--r6)}
.icell .v.green{color:var(--g6)}
.icell .v.muted{color:var(--x4)}
.icell .sub{font-size:9px;color:var(--x5);margin-top:2px}
.seg{padding:12px 16px;background:var(--n0);border-radius:6px;border:1px solid var(--n1);margin-bottom:18px;font-size:12px;color:var(--n7)}
.seg b{color:var(--n9)}
.seg .sec{font-size:10px;color:var(--x5);margin-top:4px}
.map-row{display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:18px}
.map-frame{border-radius:8px;overflow:hidden;border:1px solid var(--x2);height:220px;position:relative;background:var(--x1)}
.map-frame img{width:100%;height:100%;object-fit:cover}
.addr-box{padding:16px;background:var(--x0);border-radius:8px;border:1px solid var(--x1);display:flex;flex-direction:column;justify-content:center}
.addr-box .l{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x4);margin-bottom:8px}
.addr-box .a{font-size:13px;color:var(--x7);line-height:1.6}
.addr-box .t{font-size:10px;color:var(--x5);margin-top:auto;padding-top:10px}
.soc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:6px}
.soc-tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left}
.soc-tbl tbody td{padding:10px 14px;border-bottom:1px solid var(--x1);color:var(--x7)}
.soc-tbl tbody tr:last-child td{border-bottom:none}
.soc-extra{font-size:11px;color:var(--x5);margin-bottom:18px}
.soc-extra b{color:var(--x9)}
.risk-section{background:var(--x0);border-radius:10px;border:1px solid var(--x2);padding:20px;margin-bottom:18px}
.risk-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.risk-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--x5)}
.risk-score{font-size:10px;font-weight:600;padding:3px 10px;border-radius:4px;background:var(--r1);color:var(--r6)}
.risk-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.risk-block{background:#fff;border-radius:8px;border:1px solid var(--x2);overflow:hidden}
.risk-block-hdr{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--x1)}
.risk-block-hdr .title{font-size:12px;font-weight:700;color:var(--n9)}
.risk-block-hdr .big{font-size:22px;font-weight:700}
.risk-block-hdr .big.red{color:var(--r6)}
.risk-block-hdr .big.green{color:var(--g6)}
.risk-block-body{padding:12px 14px}
.risk-detail{font-size:11px;color:var(--x7);padding:4px 0;display:flex;justify-content:space-between}
.risk-detail .label{color:var(--x5)}
.risk-detail .val{font-weight:600}
.risk-detail .val.red{color:var(--r6)}
.risk-sep{height:1px;background:var(--x1);margin:6px 0}
.risk-tag{display:inline-block;font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;margin-right:4px}
.risk-tag.exec{background:#e8d5f5;color:#6b21a8}
.risk-tag.sust{background:var(--a1);color:var(--a5)}
.risk-tag.np{background:var(--n1);color:var(--n7)}
.risk-tag.banco{background:#dbeafe;color:#1d4ed8}
.risk-tag.fidc{background:var(--g1);color:var(--g6)}
.risk-item{font-size:10px;color:var(--x7);padding:5px 0;border-bottom:1px solid var(--x1);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.risk-item:last-child{border-bottom:none}
.risk-item .date{color:var(--x4);font-size:9px;min-width:70px}
.risk-item .desc{flex:1}
.risk-item .amt{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:10px}
.risk-item .amt.red{color:var(--r6)}
.scr-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}
.scr-card{padding:8px 10px;background:#fff;border-radius:6px;border:1px solid var(--x2)}
.scr-card .l{font-size:8px;font-weight:600;text-transform:uppercase;color:var(--x4);margin-bottom:3px}
.scr-card .v{font-size:14px;font-weight:700;color:var(--n9)}
.scr-card .v.green{color:var(--g6)}
.alert{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;font-size:11px;margin-bottom:6px}
.alert.alta{background:var(--r0);border:1px solid var(--r1);color:var(--r6)}
.alert.mod{background:var(--a0);border:1px solid var(--a1);color:var(--a5)}
.alert.info{background:var(--n0);border:1px solid var(--n1);color:var(--n7)}
.alert.ok{background:var(--g0);border:1px solid var(--g1);color:var(--g6)}
.atag{font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;flex-shrink:0}
.alert.alta .atag{background:var(--r1)}
.alert.mod .atag{background:var(--a1)}
.alert.info .atag{background:var(--n1)}
.alert.ok .atag{background:var(--g1)}
.fin-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
.fin-box{background:var(--x0);border-radius:8px;border:1px solid var(--x1);padding:16px}
.fin-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x5);margin-bottom:12px}
.chart{display:flex;align-items:flex-end;gap:5px;height:100px;margin-bottom:8px}
.bar-col{flex:1;display:flex;flex-direction:column;align-items:center}
.bar{width:100%;border-radius:3px 3px 0 0;min-height:2px;position:relative}
.bar.navy,.bar.nv{background:var(--n8)}
.bar.light,.bar.lt{background:var(--n1)}
.bar-val,.bar-v{position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:7px;color:var(--x5);white-space:nowrap;font-family:'JetBrains Mono',monospace}
.bar-lbl,.bar-l{font-size:8px;color:var(--x4);margin-top:5px}
.kpi-row{display:flex;gap:16px;font-size:11px;color:var(--x5);padding-top:8px;border-top:1px solid var(--x1);margin-top:8px}
.kpi-row b{color:var(--n9)}
.kpi-row .down{color:var(--r6);font-weight:600}
.kpi-row .up{color:var(--g6);font-weight:600}
.scr-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:11px}
.scr-tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:8px 10px;text-align:left}
.scr-tbl thead th:not(:first-child){text-align:right}
.scr-tbl tbody td{padding:7px 10px;border-bottom:1px solid var(--x1);color:var(--x7)}
.scr-tbl tbody td:not(:first-child){text-align:right;font-family:'JetBrains Mono',monospace;font-size:10px}
.scr-tbl tbody tr:last-child td{border-bottom:none}
.scr-tbl .total td{font-weight:700;background:var(--x0);color:var(--n9)}
.scr-tbl .var-cell.down{color:var(--g6);font-weight:600}
.scr-tbl .var-cell.up{color:var(--r6);font-weight:600}
.scr-tbl .var-cell.neutral{color:var(--x4)}
.ifs-note{font-size:9px;color:var(--x4);margin-top:6px}
.abc-wrap{background:var(--x0);border-radius:10px;border:1px solid var(--x2);padding:16px;margin-bottom:18px}
.abc-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;margin-bottom:8px}
.abc-tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:8px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:9px 12px;text-align:left}
.abc-tbl thead th.r{text-align:right}
.abc-tbl tbody td{padding:9px 12px;border-bottom:1px solid var(--x1)}
.abc-tbl tbody td.r{text-align:right;font-family:'JetBrains Mono',monospace}
.abc-tbl tbody td.bold{font-weight:600}
.abc-tbl tbody tr:last-child td{border-bottom:none}
.abc-rank{display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--n8);color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center}
.abc-cl{padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700}
.abc-cl.a{background:var(--r1);color:var(--r6)}
.abc-cl.b{background:var(--a1);color:var(--a5)}
.abc-cl.c{background:var(--x1);color:var(--x5)}
.abc-bar{height:5px;border-radius:3px;background:var(--n8);display:block;margin-top:3px}
.abc-summary{font-size:11px;color:var(--x5)}
.abc-summary b{color:var(--x9)}
.pleito-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}
.pl-card{padding:12px 14px;background:var(--n0);border-radius:6px;border:1px solid var(--n1)}
.pl-card .l{font-size:8px;font-weight:700;text-transform:uppercase;color:var(--x4);margin-bottom:4px}
.pl-card .v{font-size:14px;font-weight:700;color:var(--n9)}
.ana-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px}
.ana-col{border-radius:8px;padding:14px 16px}
.ana-col.f{background:var(--g0);border:1px solid var(--g1)}
.ana-col.w{background:var(--r0);border:1px solid var(--r1)}
.ana-col.a{background:var(--a0);border:1px solid var(--a1)}
.ana-col.n{background:var(--x0);border:1px solid var(--x1)}
.ana-h{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.06)}
.ana-col.f .ana-h{color:var(--g6)}
.ana-col.w .ana-h{color:var(--r6)}
.ana-col.a .ana-h{color:var(--a5)}
.ana-col.n .ana-h{color:var(--x5)}
.ana-item,.ana-i{font-size:11px;color:var(--x7);padding:3px 0;line-height:1.5}
.ana-item::before{content:'•';margin-right:6px;font-weight:700}
.ana-col.f .ana-item::before{color:var(--g6)}
.ana-col.w .ana-item::before{color:var(--r6)}
.ana-col.a .ana-item::before{color:var(--a5)}
.perc{padding:16px 18px;background:var(--x0);border-radius:8px;border:1px solid var(--x2)}
.perc p,.perc-text{font-size:12px;color:var(--x7);line-height:1.7}
.perc-rec{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--x2);font-size:11px;color:var(--x5)}
.tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:10px}
.tbl thead th{background:var(--n9);color:rgba(255,255,255,0.85);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left}
.tbl thead th.r{text-align:right}
.tbl tbody td{padding:10px 14px;border-bottom:1px solid var(--x1);color:var(--x7)}
.tbl tbody td.r{text-align:right;font-family:'JetBrains Mono',monospace;font-size:10px}
.tbl tbody td.b{font-weight:600;color:var(--x9)}
.tbl tbody td.red{color:var(--r6);font-weight:600}
.tbl tbody td.green{color:var(--g6);font-weight:600}
.tbl tbody tr:last-child td{border-bottom:none}
.tbl tbody tr:nth-child(even){background:var(--x0)}
.tbl .total td{font-weight:700;background:var(--n0);color:var(--n9)}
.pf-row{display:grid;grid-template-columns:28px 1fr 160px 160px;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--x1)}
.pf-row:last-child{border-bottom:none}
.pf-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.pf-icon.pass{background:var(--g1);color:var(--g6)}
.pf-icon.fail{background:var(--r1);color:var(--r6)}
.pf-name{font-size:12px;color:var(--x9)}
.pf-tag{display:inline-block;font-size:7px;font-weight:700;text-transform:uppercase;padding:2px 5px;border-radius:3px;background:var(--r1);color:var(--r6);margin-left:6px;vertical-align:middle}
.pf-lim .lbl,.pf-val .lbl{font-size:7px;font-weight:600;text-transform:uppercase;color:var(--x4);margin-bottom:1px}
.pf-val .v{font-weight:600}
.pf-val .v.pass{color:var(--g6)}
.pf-val .v.fail{color:var(--r6)}
.pf-note{font-size:9px;color:var(--r6);margin-top:2px}
.verdict{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-radius:8px;margin-top:14px}
.verdict.fail{background:var(--r0);border:1px solid var(--r1)}
.verdict.pass{background:var(--g0);border:1px solid var(--g1)}
.verdict .vt{font-size:13px;font-weight:600;color:var(--x9)}
.verdict .vs{font-size:10px;color:var(--x5);margin-top:2px}
.verdict .vb{padding:5px 16px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;color:#fff}
.verdict.fail .vb{background:var(--r6)}
.verdict.pass .vb{background:var(--g6)}
.chart-box{background:var(--x0);border-radius:8px;border:1px solid var(--x1);padding:18px;margin-bottom:14px}
.chart-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--x5);margin-bottom:14px}
.bars{display:flex;align-items:flex-end;gap:5px;height:120px;margin-bottom:6px}
.prop-row{display:flex;align-items:center;gap:10px;padding:6px 0}
.prop-label{font-size:11px;width:200px;color:var(--x7)}
.prop-fill{height:6px;border-radius:3px;background:var(--n8)}
.prop-fill.red{background:var(--r6)}
.prop-pct{font-size:10px;font-weight:600;color:var(--x5);min-width:60px}
.avatar{width:36px;height:36px;border-radius:50%;background:var(--n0);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--n8);flex-shrink:0}
.inf{font-size:11px;color:var(--x5);margin-bottom:12px}
.inf b{color:var(--x9)}
.badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase}
.badge.red{background:var(--r6);color:#fff}
.badge.green{background:var(--g6);color:#fff}
.badge.amber{background:var(--a5);color:#fff}
.pb{border-top:2px dashed var(--x3);margin:28px 0;position:relative}
.pb::after{content:attr(data-label);position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#f0f2f7;padding:0 12px;font-size:9px;color:var(--x4)}
.prog-outer{height:8px;border-radius:4px;background:var(--x2);margin:8px 0 16px;overflow:hidden}
.prog-inner{height:100%;border-radius:4px;background:var(--gl)}
.doc-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--x2);border-radius:8px;overflow:hidden}
.doc-grid .pf-row{padding:9px 14px;border-bottom:1px solid var(--x1);margin:0;border-radius:0}
.doc-grid .pf-row:nth-child(odd){border-right:1px solid var(--x1)}
.dist-bar{height:5px;border-radius:3px;background:var(--n8);display:inline-block;vertical-align:middle}
.dist-bar.red{background:var(--r6)}
.kpi-snap{display:grid;gap:8px;margin-bottom:14px}
.kpi-snap.c4{grid-template-columns:repeat(4,1fr)}
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
<div class="page" style="background:var(--n8);min-height:700px;display:flex;flex-direction:column;padding:0;position:relative;overflow:hidden">
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

    <!-- Score circular -->
    <div style="margin-top:36px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <div style="width:100px;height:100px;border-radius:50%;border:4px solid ${sb};display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05)">
        <div style="font-size:36px;font-weight:700;color:${sc};line-height:1">${score.toFixed(1)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.35)">/10</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:${sc}">${esc(ratingLabel)}</div>
      <div style="padding:6px 22px;border-radius:5px;font-size:12px;font-weight:700;text-transform:uppercase;background:${decBg};color:#fff;letter-spacing:0.05em">${esc(params.decision ?? "—")}</div>
    </div>

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

  // Sócios
  const socios = d.qsa?.quadroSocietario ?? [];
  const irMap: Record<string, string> = {};
  (d.irSocios ?? []).forEach(ir => { irMap[ir.cpf] = ir.patrimonioLiquido; });

  const socRows = socios.map(s => {
    const pl = irMap[s.cpfCnpj] ? fmtMoneyAbr(irMap[s.cpfCnpj]) : "—";
    return `<tr><td><b>${esc(s.nome)}</b></td><td style="font-family:'JetBrains Mono',monospace;font-size:11px">${fmtCpf(s.cpfCnpj)}</td><td>${esc(s.qualificacao)}</td><td style="color:var(--x4)">${fmt(s.participacao)}</td><td><b>${pl}</b></td></tr>`;
  }).join("");

  // SCR cards
  const scr = d.scr;
  const totalDivida = scr?.totalDividasAtivas || scr?.carteiraAVencer || "—";
  const vencidos = scr?.vencidos ?? "—";
  const vencNum = numVal(vencidos);
  const totalNum = numVal(totalDivida);
  const pctVencido = totalNum > 0 && vencNum >= 0 ? ((vencNum / totalNum) * 100).toFixed(1) + "%" : "0,0%";
  const nIfs = scr?.qtdeInstituicoes ?? "—";
  const alavStr = params.alavancagem != null ? params.alavancagem.toFixed(1) + "x" : "—";

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
    const tag2 = p.tipo.toLowerCase().includes("fiscal") ? "exec" :
                 p.tipo.toLowerCase().includes("banco") || p.tipo.toLowerCase().includes("fidc") ? "banco" :
                 p.tipo.toLowerCase().includes("trab") ? "np" : "sust";
    return `<div class="risk-item"><span class="risk-tag ${tag2}">${esc(p.tipo)}</span><span class="desc">${esc(p.tipo)}</span><span class="amt red">${esc(p.qtd)} proc.</span></div>`;
  }).join("");
  const lastProc = (proc?.top10Recentes ?? [])[0];

  // CCF
  const ccfQtd = d.ccf?.qtdRegistros ?? 0;
  const ccfText = ccfQtd === 0 ? `<span style="color:var(--g6);font-size:13px">0 — limpo</span>` : `<span style="color:var(--r6);font-size:13px">${ccfQtd} registros</span>`;

  // Alerts from params
  const alertsHtml = (params.alertsHigh ?? []).slice(0, 4).map(a => {
    const cls = a.severity === "ALTA" ? "alta" : a.severity === "MODERADA" ? "mod" : "info";
    const tag3 = a.severity === "ALTA" ? "ALTA" : a.severity === "MODERADA" ? "MOD" : "INFO";
    return `<div class="alert ${cls}"><span class="atag">${tag3}</span> ${esc(a.message)}</div>`;
  }).join("");

  // Faturamento chart
  const fatMeses = (d.faturamento?.meses ?? []).slice(-12);
  const fatBars = fatMeses.length > 0 ? buildBars(fatMeses) : "";
  const fmm = d.faturamento?.fmm12m ?? d.faturamento?.mediaAno ?? "—";
  const total12 = d.faturamento?.somatoriaAno ?? "—";
  const tendencia = d.faturamento?.tendencia ?? "indefinido";
  const tendLabel = tendencia === "crescimento" ? "↑ crescimento" : tendencia === "queda" ? "↓ queda" : "→ estável";
  const tendColor = tendencia === "crescimento" ? "var(--g6)" : tendencia === "queda" ? "var(--r6)" : "var(--x5)";

  // SCR table
  const scrAnt = d.scrAnterior;
  let scrTable = "";
  if (scr && scrAnt) {
    type SCRRow = {label:string;curr:string;prev:string;varCls:string;varVal:string};
    const mkRow = (label:string, currV:string|null|undefined, prevV:string|null|undefined, fmt2:(v:string|number|null|undefined)=>string, higherIsBad:boolean): SCRRow => {
      const v = scrVar(currV, prevV, higherIsBad);
      return {label, curr:fmt2(currV), prev:fmt2(prevV), varCls:v.cls, varVal:v.val};
    };
    const rows: SCRRow[] = [
      mkRow("Curto Prazo",  scr.carteiraCurtoPrazo,  scrAnt.carteiraCurtoPrazo,  fmtMoneyAbr, true),
      mkRow("Longo Prazo",  scr.carteiraLongoPrazo,  scrAnt.carteiraLongoPrazo,  fmtMoneyAbr, true),
      mkRow("Vencidos",     scr.vencidos,             scrAnt.vencidos,             fmtMoneyAbr, true),
      mkRow("Prejuízos",    scr.prejuizos,            scrAnt.prejuizos,            fmtMoneyAbr, true),
      mkRow("Limite Créd.", scr.limiteCredito,        scrAnt.limiteCredito,        fmtMoneyAbr, false),
    ];
    const vTotal = scrVar(scr.totalDividasAtivas, scrAnt.totalDividasAtivas, true);
    const totalRows = `<tr class="total"><td>Total Dívidas</td><td>${fmtMoneyAbr(scr.totalDividasAtivas)}</td><td>${fmtMoneyAbr(scrAnt.totalDividasAtivas)}</td><td class="var-cell ${vTotal.cls}">${esc(vTotal.val)}</td></tr>`;
    scrTable = `<table class="scr-tbl">
      <thead><tr><th>Métrica</th><th>Atual</th><th>Anterior</th><th>Var.</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${r.curr}</td><td>${r.prev}</td><td class="var-cell ${r.varCls}">${r.varVal}</td></tr>`).join("")}${totalRows}</tbody>
    </table>
    <div class="ifs-note">Instituições financeiras: ${fmt(scr.qtdeInstituicoes)} · Operações: ${fmt(scr.qtdeOperacoes)}</div>`;
  } else if (scr) {
    scrTable = `<table class="scr-tbl">
      <thead><tr><th>Métrica</th><th>Valor</th></tr></thead>
      <tbody>
        <tr><td>Carteira A Vencer</td><td>${fmtMoneyAbr(scr.carteiraAVencer)}</td></tr>
        <tr><td>Vencidos</td><td>${fmtMoneyAbr(scr.vencidos)}</td></tr>
        <tr><td>Prejuízos</td><td>${fmtMoneyAbr(scr.prejuizos)}</td></tr>
        <tr><td>Limite de Crédito</td><td>${fmtMoneyAbr(scr.limiteCredito)}</td></tr>
        <tr class="total"><td>Total Dívidas</td><td>${fmtMoneyAbr(scr.totalDividasAtivas)}</td></tr>
      </tbody>
    </table>
    <div class="ifs-note">Instituições financeiras: ${fmt(scr.qtdeInstituicoes)} · Operações: ${fmt(scr.qtdeOperacoes)}</div>`;
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
    abcHtml = `${stitle("Concentração de clientes")}
    <div class="abc-wrap">
      <table class="abc-tbl">
        <thead><tr><th style="width:40px">#</th><th>Cliente</th><th class="r">Faturamento</th><th class="r">% Rec.</th><th class="r">% Acum.</th><th style="width:50px">Cl.</th></tr></thead>
        <tbody>${rows2}</tbody>
      </table>
      <div class="abc-summary">Top 3: <b>${fmt(abc.concentracaoTop3)}</b> · Top 5: <b>${fmt(abc.concentracaoTop5)}</b> · Total clientes: <b>${abc.totalClientesNaBase}</b></div>
    </div>`;
  }

  // Pleito (from relatorioVisita)
  const rv = d.relatorioVisita;
  const modalidade = rv?.modalidade ? rv.modalidade.toUpperCase() : "—";
  const pleitoHtml = `${stitle("Pleito")}
  <div class="pleito-grid">
    <div class="pl-card"><div class="l">Valor Pleiteado</div><div class="v" style="color:var(--x4)">${rv?.pleito ? fmtMoneyAbr(rv.pleito) : "—"}</div></div>
    <div class="pl-card"><div class="l">Modalidade</div><div class="v">${fmt(modalidade)}</div></div>
    <div class="pl-card"><div class="l">Prazo Máx.</div><div class="v" style="color:var(--x4)">${fmt(rv?.prazoMaximoOp)}</div></div>
    <div class="pl-card"><div class="l">Taxa</div><div class="v" style="color:var(--x4)">${rv?.taxaConvencional ?? rv?.taxaComissaria ?? "—"}</div></div>
  </div>`;

  // Analise
  const fortes = params.pontosFortes ?? [];
  const fracos = params.pontosFracos ?? [];
  const alertsArr = (params.alerts ?? []).filter(a => a.severity === "ALTA" || a.severity === "MODERADA").slice(0, 5).map(a => a.message);
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
    <div class="perc-text">${esc(resumo) || "—"}</div>
    <div class="perc-rec">Recomendação: <span class="dec" style="background:${decBg};font-size:10px">${esc(params.decision ?? "—")}</span></div>
  </div>`;

  // Map/address
  let mapHtml = "";
  if (params.streetViewBase64 || params.mapStaticBase64) {
    const imgSrc = params.streetViewBase64 ?? params.mapStaticBase64 ?? "";
    mapHtml = `
    <div class="map-row">
      <div class="map-frame"><img src="${esc(imgSrc)}" alt="Localização" /></div>
      <div class="addr-box">
        <div class="l">Endereço</div>
        <div class="a">${esc(cnpj?.endereco ?? "—")}</div>
        <div class="t">Tipo: ${esc(cnpj?.tipoEmpresa ?? "Matriz")}</div>
      </div>
    </div>`;
  } else {
    mapHtml = `<div class="addr-box" style="margin-bottom:18px">
      <div class="l">Endereço</div>
      <div class="a">${esc(cnpj?.endereco ?? "—")}</div>
      <div class="t">Tipo: ${esc(cnpj?.tipoEmpresa ?? "Matriz")}</div>
    </div>`;
  }

  const content = `
    <!-- 1. Empresa + Rating -->
    <div class="emp">
      <div>
        <div class="emp-name">${esc(cnpj?.razaoSocial ?? "—")}</div>
        ${cnpj?.nomeFantasia ? `<div class="emp-fan">${esc(cnpj.nomeFantasia)}</div>` : ""}
        <div class="emp-cnpj">CNPJ: <b>${fmtCnpj(cnpj?.cnpj)}</b> <span class="sit${isAtiva ? "" : " inactive"}">${esc(cnpj?.situacaoCadastral ?? "—")}</span></div>
      </div>
      <div class="rat">
        <div class="rat-c" style="border-color:${sb}">
          <div class="rat-n" style="color:${sc}">${score.toFixed(1)}</div>
          <div class="rat-d">/10</div>
        </div>
        <div class="rat-l" style="color:${sc}">${ratingLabel}</div>
        <div class="dec" style="background:${decBg}">${esc(params.decision ?? "—")}</div>
      </div>
    </div>

    <!-- 2. Info strip -->
    <div class="istrip c6">
      <div class="icell"><div class="l">Fundação</div><div class="v">${fmt(cnpj?.dataAbertura)}</div></div>
      <div class="icell"><div class="l">Idade</div><div class="v">${fmt(params.companyAge)}</div></div>
      <div class="icell"><div class="l">Porte</div><div class="v">${fmt(cnpj?.porte)}</div></div>
      <div class="icell"><div class="l">Capital Social</div><div class="v mono">${fmtMoneyAbr(capitalSocial)}</div></div>
      <div class="icell"><div class="l">Tipo</div><div class="v">${fmt(cnpj?.tipoEmpresa ?? "Matriz")}</div></div>
      <div class="icell"><div class="l">Local</div><div class="v">${fmt(local)}</div></div>
    </div>
    ${(cnpj?.telefone || cnpj?.email || cnpj?.naturezaJuridica || cnpj?.regimeTributario) ? `<div class="istrip c4">
      ${cnpj?.naturezaJuridica ? `<div class="icell"><div class="l">Natureza Jurídica</div><div class="v sm">${esc(cnpj.naturezaJuridica)}</div></div>` : ""}
      ${cnpj?.regimeTributario ? `<div class="icell"><div class="l">Regime Tributário</div><div class="v sm">${esc(cnpj.regimeTributario)}</div></div>` : ""}
      ${cnpj?.telefone ? `<div class="icell"><div class="l">Telefone</div><div class="v sm mono">${esc(cnpj.telefone)}</div></div>` : ""}
      ${cnpj?.email ? `<div class="icell"><div class="l">E-mail</div><div class="v sm">${esc(cnpj.email)}</div></div>` : ""}
    </div>` : ""}

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
    <div class="soc-extra">Capital Social: <b>${fmtMoney(capitalSocial)}</b> · Grupo Econômico: <b>${d.grupoEconomico?.empresas?.length > 0 ? d.grupoEconomico.empresas.length + " empresa(s)" : "Não identificado"}</b></div>

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
      <div class="risk-detail" style="padding:6px 0"><span class="label" style="font-size:11px">CCF (Cheques sem Fundo)</span>${ccfText}</div>
      <div style="margin-top:10px">${alertsHtml}</div>
    </div>

    <!-- 7. Faturamento + SCR -->
    ${stitle("Faturamento & SCR")}
    <div class="fin-row">
      <div class="fin-box">
        <div class="fin-title">Faturamento mensal — últimos 12 meses</div>
        <div class="chart">${fatBars}</div>
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
  `;

  return page(content, 2, date);
}

// ─── Page 3: Cartão CNPJ + Quadro Societário ─────────────────────────────────
function pageCNPJQSA(params: PDFReportParams, date: string): string {
  const cnpj = params.data.cnpj;
  const qsa = params.data.qsa;
  const contrato = params.data.contrato;
  const grupo = params.data.grupoEconomico;
  const isAtiva = (cnpj?.situacaoCadastral ?? "").toUpperCase().includes("ATIVA");

  type IRSocio = NonNullable<typeof params.data.irSocios>[0];
  const irMap: Record<string, IRSocio> = {};
  (params.data.irSocios ?? []).forEach(ir => { irMap[ir.cpf] = ir; });

  // Sócios com dados do IR
  const socios = qsa?.quadroSocietario ?? [];
  const socRows = socios.map(s => {
    const ir = irMap[s.cpfCnpj];
    const pl = ir?.patrimonioLiquido ? fmtMoneyAbr(ir.patrimonioLiquido) : "—";
    const renda = ir?.rendimentoTotal ? fmtMoneyAbr(ir.rendimentoTotal) : "—";
    return `<tr>
      <td class="b">${esc(s.nome)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:10px">${fmtCpf(s.cpfCnpj)}</td>
      <td>${esc(s.qualificacao)}</td>
      <td class="r">${fmt(s.participacao)}</td>
      ${s.dataEntrada ? `<td class="r">${fmtDate(s.dataEntrada)}</td>` : `<td class="r" style="color:var(--x4)">—</td>`}
      <td class="r">${renda}</td>
      <td class="r">${pl}</td>
    </tr>`;
  }).join("");

  // Endereços adicionais
  const enderecos = cnpj?.enderecos ?? [];
  const endAddHtml = enderecos.length > 1 ? `
    ${stitle("Endereços cadastrados")}
    <table class="tbl">
      <thead><tr><th>#</th><th>Endereço</th></tr></thead>
      <tbody>${enderecos.map((e, i) => `<tr><td class="r" style="width:32px">${i+1}</td><td>${esc(e)}</td></tr>`).join("")}</tbody>
    </table>` : "";

  // Grupo econômico
  const grupoEmpresas = grupo?.empresas ?? [];
  const grupoHtml = grupoEmpresas.length > 0 ? `
    ${stitle("Grupo econômico")}
    <table class="tbl">
      <thead><tr><th>Razão Social</th><th>CNPJ</th><th>Participação</th><th>Situação</th></tr></thead>
      <tbody>${grupoEmpresas.map(e => `<tr>
        <td class="b">${esc(e.razaoSocial)}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:10px">${fmtCnpj(e.cnpj)}</td>
        <td class="r">${fmt(e.participacao)}</td>
        <td>${esc(e.situacao ?? "—")}</td>
      </tr>`).join("")}</tbody>
    </table>` : "";

  const content = `
    ${stitle("12 · Cartão CNPJ — dados cadastrais")}
    <div class="istrip c4" style="margin-bottom:8px">
      <div class="icell ${isAtiva ? "success" : "danger"}">
        <div class="l">Situação Cadastral</div>
        <div class="v ${isAtiva ? "green" : "red"} sm">${esc(cnpj?.situacaoCadastral ?? "—")}</div>
        ${cnpj?.dataSituacaoCadastral ? `<div class="sub">desde ${fmtDate(cnpj.dataSituacaoCadastral)}</div>` : ""}
      </div>
      <div class="icell"><div class="l">CNPJ</div><div class="v sm mono">${fmtCnpj(cnpj?.cnpj)}</div></div>
      <div class="icell"><div class="l">Fundação</div><div class="v">${fmt(cnpj?.dataAbertura)}</div></div>
      <div class="icell"><div class="l">Porte</div><div class="v">${fmt(cnpj?.porte)}</div></div>
    </div>
    <div class="istrip c4" style="margin-bottom:8px">
      <div class="icell"><div class="l">Natureza Jurídica</div><div class="v sm">${esc(cnpj?.naturezaJuridica ?? "—")}</div></div>
      <div class="icell"><div class="l">Regime Tributário</div><div class="v sm">${esc(cnpj?.regimeTributario ?? "—")}</div></div>
      <div class="icell"><div class="l">Capital Social</div><div class="v sm mono">${fmtMoney(cnpj?.capitalSocialCNPJ)}</div></div>
      <div class="icell"><div class="l">Tipo</div><div class="v">${esc(cnpj?.tipoEmpresa ?? "Matriz")}</div></div>
    </div>
    <div class="istrip c4" style="margin-bottom:8px">
      <div class="icell"><div class="l">Telefone</div><div class="v sm mono">${esc(cnpj?.telefone ?? "—")}</div></div>
      <div class="icell"><div class="l">E-mail</div><div class="v sm">${esc(cnpj?.email ?? "—")}</div></div>
      ${cnpj?.site ? `<div class="icell"><div class="l">Site</div><div class="v sm">${esc(cnpj.site)}</div></div>` : ""}
      ${cnpj?.funcionarios ? `<div class="icell"><div class="l">Funcionários</div><div class="v">${esc(cnpj.funcionarios)}</div></div>` : ""}
    </div>
    <div class="seg" style="margin-bottom:8px"><b>${esc(cnpj?.cnaePrincipal ?? "—")}</b>${cnpj?.cnaeSecundarios ? `<div class="sec">CNAEs sec.: ${esc(cnpj.cnaeSecundarios)}</div>` : ""}</div>
    ${cnpj?.motivoSituacao && !isAtiva ? `<div class="alert alta" style="margin-bottom:14px"><span class="atag">ALTA</span> Motivo: ${esc(cnpj.motivoSituacao)}</div>` : ""}
    <div class="addr-box" style="margin-bottom:18px">
      <div class="l">Endereço</div>
      <div class="a">${esc(cnpj?.endereco ?? "—")}</div>
    </div>
    ${endAddHtml}

    ${stitle("13 · Quadro societário")}
    <table class="tbl">
      <thead><tr><th>Sócio</th><th>CPF/CNPJ</th><th>Qualificação</th><th class="r">Part.</th><th class="r">Entrada</th><th class="r">Renda (IR)</th><th class="r">Patrim. (IR)</th></tr></thead>
      <tbody>${socRows || `<tr><td colspan="7" style="color:var(--x4);text-align:center">—</td></tr>`}</tbody>
    </table>
    <div class="inf">Capital Social: <b>${fmtMoney(qsa?.capitalSocial || cnpj?.capitalSocialCNPJ)}</b></div>

    ${contrato ? `${stitle("14 · Contrato Social")}
    <div class="istrip c4" style="margin-bottom:8px">
      <div class="icell"><div class="l">Constituição</div><div class="v">${fmt(contrato.dataConstituicao)}</div></div>
      <div class="icell"><div class="l">Capital Social</div><div class="v sm mono">${fmtMoney(contrato.capitalSocial)}</div></div>
      <div class="icell"><div class="l">Prazo de Duração</div><div class="v sm">${fmt(contrato.prazoDuracao) || "Indeterminado"}</div></div>
      <div class="icell"><div class="l">Alterações</div><div class="v ${contrato.temAlteracoes ? "" : "green"}">${contrato.temAlteracoes ? "Sim" : "Não"}</div></div>
    </div>
    ${contrato.objetoSocial ? `<div class="perc" style="margin-bottom:8px"><div class="l" style="font-size:9px;font-weight:700;text-transform:uppercase;color:var(--x4);margin-bottom:6px">Objeto Social</div><div class="perc-text">${esc(contrato.objetoSocial)}</div></div>` : ""}
    ${contrato.administracao ? `<div class="inf">Administração: <b>${esc(contrato.administracao)}</b>${contrato.foro ? ` · Foro: <b>${esc(contrato.foro)}</b>` : ""}</div>` : ""}` : ""}

    ${grupoHtml}
  `;

  return page(content, 3, date);
}

// ─── Page 4: Parecer Preliminar ───────────────────────────────────────────────
function pageParecer(params: PDFReportParams, date: string): string {
  const ai = params.aiAnalysis;
  const parecer = ai?.parecer;
  const resumo = params.resumoExecutivo ||
    (typeof parecer === "object" ? parecer?.resumoExecutivo : "") ||
    ai?.resumoExecutivo || "";
  const fortes = params.pontosFortes?.length ? params.pontosFortes :
    (typeof parecer === "object" ? parecer?.pontosFortes : []) ??
    ai?.pontosFortes ?? [];
  const fracos = params.pontosFracos?.length ? params.pontosFracos :
    (typeof parecer === "object" ? parecer?.pontosNegativosOuFracos : []) ??
    ai?.pontosFracos ?? [];
  const perguntas = params.perguntasVisita?.length ? params.perguntasVisita :
    (typeof parecer === "object" ? parecer?.perguntasVisita : []) ??
    ai?.perguntasVisita ?? [];

  const score = params.finalRating ?? 0;
  const sc = scoreColor(score);
  const sb = scoreBorder(score);
  const decBg2 = decisionBg(params.decision ?? "");

  let content = "";
  if (!resumo && !ai) {
    content = `<div style="text-align:center;padding:40px;color:var(--x4)">Parecer pendente — análise de IA não disponível</div>`;
  } else {
    content = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:20px">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--n9);margin-bottom:8px">Resumo Executivo</div>
        <div style="font-size:12px;color:var(--x7);line-height:1.7">${esc(resumo) || "—"}</div>
      </div>
      <div style="text-align:center;min-width:100px">
        <div style="width:72px;height:72px;border-radius:50%;border:3px solid ${sb};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px">
          <div style="font-size:26px;font-weight:700;color:${sc};line-height:1">${score.toFixed(1)}</div>
          <div style="font-size:10px;color:var(--x4)">/10</div>
        </div>
        <div style="display:inline-block;padding:4px 14px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:${decBg2};color:#fff">${esc(params.decision ?? "—")}</div>
      </div>
    </div>
    ${stitle("Pontos Fortes & Fracos")}
    <div class="ana-grid" style="grid-template-columns:1fr 1fr;margin-bottom:18px">
      <div class="ana-col f">
        <div class="ana-h">Pontos Fortes</div>
        ${(fortes as string[]).map((f: string) => `<div class="ana-item">${esc(f)}</div>`).join("") || '<div class="ana-item" style="color:var(--x4)">—</div>'}
      </div>
      <div class="ana-col w">
        <div class="ana-h">Pontos Fracos</div>
        ${(fracos as string[]).map((f: string) => `<div class="ana-item">${esc(f)}</div>`).join("") || '<div class="ana-item" style="color:var(--x4)">—</div>'}
      </div>
    </div>
    ${perguntas.length > 0 ? `
    ${stitle("Perguntas para visita")}
    <div class="perc" style="margin-bottom:0">
      ${(perguntas as {pergunta:string;contexto:string}[]).map((p: {pergunta:string;contexto:string}) => `<div style="padding:8px 0;border-bottom:1px solid var(--x1)">
        <div style="font-size:12px;font-weight:600;color:var(--x9)">${esc(p.pergunta)}</div>
        ${p.contexto ? `<div style="font-size:11px;color:var(--x5);margin-top:3px">${esc(p.contexto)}</div>` : ""}
      </div>`).join("")}
    </div>` : ""}
    ${params.observacoes ? `${stitle("Observações")}
    <div class="perc"><div class="perc-text">${esc(params.observacoes)}</div></div>` : ""}
    `;
  }

  return page(`${stitle("03 · Parecer Preliminar")}${content}`, 4, date);
}

// ─── Page 4: Parâmetros + Conformidade ───────────────────────────────────────
function pageParametros(params: PDFReportParams, date: string): string {
  const rv = params.data.relatorioVisita;
  const fv = params.fundValidation;
  const contrato = params.data.contrato;

  const criteriaRows = (fv?.criteria ?? []).map((c: FundCriterion) => {
    const isPass = c.status === "ok";
    const iconCls = isPass ? "pass" : "fail";
    const iconChar = isPass ? "✓" : "✗";
    const valCls = isPass ? "pass" : "fail";
    return `<div class="pf-row">
      <div class="pf-icon ${iconCls}">${iconChar}</div>
      <div class="pf-name">${esc(c.label)}${c.eliminatoria ? `<span class="pf-tag">Eliminatório</span>` : ""}</div>
      <div class="pf-lim"><div class="lbl">Limite</div>${esc(c.threshold)}</div>
      <div class="pf-val"><div class="lbl">Apurado</div><div class="v ${valCls}">${esc(c.actual)}</div>${c.detail ? `<div class="pf-note">${esc(c.detail)}</div>` : ""}</div>
    </div>`;
  }).join("");

  const hasEliminatoria = fv?.hasEliminatoria ?? false;
  const failCount = fv?.failCount ?? 0;
  const passCount = fv?.passCount ?? 0;
  const totalCount = fv?.criteria?.length ?? 0;
  const verdictCls = failCount > 0 ? "fail" : "pass";
  const verdictText = failCount > 0 ? (hasEliminatoria ? "Empresa não elegível — critério eliminatório" : "Empresa com restrições") : "Empresa elegível";
  const verdictSub = `${passCount} de ${totalCount} critérios aprovados · ${failCount} reprovado(s)`;
  const verdictBtn = failCount > 0 ? "Não elegível" : "Elegível";

  const content = `
    ${stitle("04 · Parâmetros operacionais do cedente")}
    <div class="stitle" style="margin-top:8px">Taxas e limites</div>
    <div class="istrip c4">
      <div class="icell navy"><div class="l">Taxa Convencional</div><div class="v ${rv?.taxaConvencional ? "" : "muted"}">${rv?.taxaConvencional ? esc(rv.taxaConvencional) + "%" : "—"}</div></div>
      <div class="icell navy"><div class="l">Taxa Comissária</div><div class="v ${rv?.taxaComissaria ? "" : "muted"}">${rv?.taxaComissaria ? esc(rv.taxaComissaria) + "%" : "—"}</div></div>
      <div class="icell navy"><div class="l">Limite Total</div><div class="v sm mono">${rv?.limiteTotal ? fmtMoneyAbr(rv.limiteTotal) : "—"}</div></div>
      <div class="icell navy"><div class="l">Limite por Sacado</div><div class="v sm mono">${rv?.limitePorSacado ? fmtMoneyAbr(rv.limitePorSacado) : "—"}</div></div>
    </div>
    <div class="istrip c4">
      <div class="icell navy"><div class="l">Ticket Médio</div><div class="v sm mono">${rv?.ticketMedio ? fmtMoneyAbr(rv.ticketMedio) : "—"}</div></div>
      <div class="icell navy"><div class="l">Cobr. Boleto</div><div class="v ${rv?.valorCobrancaBoleto ? "" : "muted"}">${rv?.valorCobrancaBoleto ? fmtMoney(rv.valorCobrancaBoleto) : "—"}</div></div>
      <div class="icell navy"><div class="l">Modalidade</div><div class="v sm">${rv?.modalidade ? esc(rv.modalidade.toUpperCase()) : "—"}</div></div>
      <div class="icell navy"><div class="l">Prazo Máximo</div><div class="v ${rv?.prazoMaximoOp ? "" : "muted"}">${rv?.prazoMaximoOp ? esc(rv.prazoMaximoOp) + " dias" : "—"}</div></div>
    </div>
    <div class="stitle">Condições</div>
    <div class="istrip c4">
      <div class="icell"><div class="l">Prazo Recompra</div><div class="v ${rv?.prazoRecompraCedente ? "" : "muted"}">${rv?.prazoRecompraCedente ? esc(rv.prazoRecompraCedente) + " dias" : "—"}</div></div>
      <div class="icell"><div class="l">Envio Cartório</div><div class="v ${rv?.prazoEnvioCartorio ? "" : "muted"}">${rv?.prazoEnvioCartorio ? esc(rv.prazoEnvioCartorio) + " dias" : "—"}</div></div>
      <div class="icell"><div class="l">Cobrança TAC</div><div class="v ${rv?.cobrancaTAC ? "" : "muted"}">${rv?.cobrancaTAC ? esc(rv.cobrancaTAC) : "—"}</div></div>
      <div class="icell"><div class="l">Tranche</div><div class="v ${rv?.tranche ? "" : "muted"}">${rv?.tranche ? fmtMoneyAbr(rv.tranche) : "—"}</div></div>
    </div>
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
    </div>` : ""}
    ${stitle("05 · Conformidade com políticas do fundo")}
    ${criteriaRows || '<div style="color:var(--x4);font-size:12px;padding:12px 0">Validação de fundo não disponível</div>'}
    ${fv ? `<div class="verdict ${verdictCls}">
      <div><div class="vt">${verdictText}</div><div class="vs">${verdictSub}</div></div>
      <div class="vb">${verdictBtn}</div>
    </div>` : ""}

    ${contrato ? `${stitle("Contrato Social")}
    <div class="istrip c4" style="margin-bottom:10px">
      <div class="icell"><div class="l">Constituição</div><div class="v">${fmt(contrato.dataConstituicao)}</div></div>
      <div class="icell"><div class="l">Capital Social</div><div class="v sm mono">${fmtMoney(contrato.capitalSocial)}</div></div>
      <div class="icell"><div class="l">Prazo de Duração</div><div class="v sm">${fmt(contrato.prazoDuracao) || "Indeterminado"}</div></div>
      <div class="icell"><div class="l">Alterações</div><div class="v ${contrato.temAlteracoes ? "" : "green"}">${contrato.temAlteracoes ? "Sim" : "Não"}</div></div>
    </div>
    ${contrato.objetoSocial ? `<div class="perc" style="margin-bottom:10px"><div class="l" style="font-size:9px;font-weight:700;text-transform:uppercase;color:var(--x4);margin-bottom:6px">Objeto Social</div><div class="perc-text">${esc(contrato.objetoSocial)}</div></div>` : ""}
    ${contrato.administracao ? `<div class="inf">Administração: <b>${esc(contrato.administracao)}</b>${contrato.foro ? ` · Foro: <b>${esc(contrato.foro)}</b>` : ""}</div>` : ""}` : ""}
  `;

  return page(content, 5, date);
}

// ─── Page 6: Faturamento Detalhado ────────────────────────────────────────────
function pageFaturamento(params: PDFReportParams, date: string): string {
  const fat = params.data.faturamento;
  const meses = (fat?.meses ?? []).slice(-12);
  const fmm = fat?.fmm12m ?? fat?.mediaAno ?? "—";
  const total12 = fat?.somatoriaAno ?? "—";
  const nMeses = meses.length;
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

  // Monthly table — 2 columns (last 12)
  const meses12 = meses.slice(-12);
  const half = Math.ceil(meses12.length / 2);
  const col1 = meses12.slice(0, half);
  const col2 = meses12.slice(half);
  const maxFat = Math.max(...meses12.map(m => numVal(m.valor)), 1);
  const fmtRow = (m: {mes:string;valor:string}) => {
    const v = numVal(m.valor);
    const barW = Math.round((v/maxFat)*60);
    const isZero = v === 0;
    return `<tr ${isZero ? 'style="opacity:0.5"' : ""}><td><span style="display:inline-block;width:${barW}px;height:4px;border-radius:2px;background:var(--n8);vertical-align:middle;margin-right:6px"></span>${esc(m.mes)}</td><td class="r mono" style="color:${isZero ? "var(--x4)" : "var(--n9)"}">${fmtMoney(m.valor)}</td></tr>`;
  };
  const col1Rows = col1.map(fmtRow).join("");
  const col2Rows = col2.map(fmtRow).join("");

  const content = `
    ${stitle("06 · Faturamento")}
    <div class="istrip c4" style="margin-bottom:16px">
      <div class="icell navy"><div class="l">FMM 12M</div><div class="v">${fmtMoneyAbr(fmm)}</div><div class="sub">média mensal</div></div>
      <div class="icell navy"><div class="l">Total 12M</div><div class="v">${fmtMoneyAbr(total12)}</div><div class="sub">soma 12 meses</div></div>
      <div class="icell"><div class="l">Meses</div><div class="v">${nMeses}</div><div class="sub">dados disponíveis</div></div>
      <div class="icell ${tendCell}"><div class="l">Tendência</div><div class="v" style="color:${tendColor2}">${esc(tendLabel)}</div><div class="sub">últ. 3 vs anteriores</div></div>
    </div>
    <div class="chart-box">
      <div class="chart-title">Faturamento mensal — últimos 12 meses</div>
      <div class="bars">${bars || '<div style="color:var(--x4);font-size:12px;align-self:center">Dados não disponíveis</div>'}</div>
      <div class="kpi-row"><span>FMM: <b>${fmtMoneyAbr(fmm)}</b></span><span>Total: <b>${fmtMoneyAbr(total12)}</b></span><span>Var: <b style="color:${tendColor2}">${esc(tendLabel)}</b></span></div>
    </div>
    ${zeradosNote}
    ${fmmAnualHtml}
    ${col1Rows ? `${stitle("Detalhe mensal")}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div>
        <table class="tbl" style="margin:0">
          <thead><tr><th>Mês</th><th class="r">Faturamento</th></tr></thead>
          <tbody>${col1Rows}</tbody>
        </table>
      </div>
      <div>
        <table class="tbl" style="margin:0">
          <thead><tr><th>Mês</th><th class="r">Faturamento</th></tr></thead>
          <tbody>${col2Rows}</tbody>
        </table>
      </div>
    </div>` : ""}
  `;

  return page(content, 6, date);
}

// ─── Page 7: Protestos + Processos ───────────────────────────────────────────
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
    const isFiscal = d.tipo.toLowerCase().includes("fiscal");
    return `<div class="prop-row"><span class="prop-label">${esc(d.tipo)}</span><div class="prop-fill${isFiscal ? " red" : ""}" style="width:${Math.min(pct,100)}%"></div><span class="prop-pct">${d.qtd} (${d.pct})</span></div>`;
  }).join("");

  const top5Proc = (proc?.top10Recentes ?? []).slice(0,5);
  const top5ProcRows = top5Proc.map(p =>
    `<tr><td class="${p.tipo.toLowerCase().includes("fiscal") ? "red" : ""}">${esc(p.tipo)}</td><td>${fmtDate(p.data)}</td><td>${esc(p.assunto)}</td><td>${fmt(p.fase)}</td></tr>`
  ).join("");

  // Top 10 por valor
  const top10Valor = (proc?.top10Valor ?? []).slice(0,10);
  const top10ValorRows = top10Valor.map(p => {
    const isFiscal = p.tipo.toLowerCase().includes("fiscal");
    return `<tr>
      <td class="${isFiscal ? "red" : "b"}">${esc(p.tipo)}</td>
      <td>${esc(p.partes)}</td>
      <td>${fmtDate(p.data)}</td>
      <td class="r red">${p.valor && p.valor !== "0" ? fmtMoney(p.valor) : "—"}</td>
      <td>${fmt(p.fase)}</td>
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

  // Top 10 mais recentes protestos
  const top10ProtRecentes = [...(prot?.detalhes ?? [])].filter(p => !p.regularizado).sort((a,b) => b.data.localeCompare(a.data)).slice(0,10);
  const top10ProtRecentesRows = top10ProtRecentes.map(p =>
    `<tr><td>${fmtDate(p.data)}</td><td class="b">${esc(p.credor)}</td><td class="r red">${fmtMoney(p.valor)}</td><td>${p.regularizado ? '<span style="color:var(--g6)">Reg.</span>' : '<span style="color:var(--r6)">Vigente</span>'}</td></tr>`
  ).join("");

  const content = `
    ${stitle("07 · Protestos")}
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

    ${stitle("08 · Processos judiciais")}
    <div class="istrip c4" style="margin-bottom:14px">
      <div class="icell ${totalProc > 5 ? "danger" : totalProc > 0 ? "warn" : "success"}"><div class="l">Total Passivo</div><div class="v ${totalProc > 5 ? "red" : totalProc > 0 ? "" : "green"}">${totalProc}</div></div>
      <div class="icell ${numVal(passivo) > 5 ? "danger" : ""}"><div class="l">Polo Passivo</div><div class="v ${numVal(passivo) > 5 ? "red" : ""}">${fmt(passivo)}</div></div>
      <div class="icell"><div class="l">Polo Ativo</div><div class="v">${fmt(ativo)}</div></div>
      <div class="icell ${temRJ ? "danger" : "success"}"><div class="l">Falência / RJ</div><div class="v ${temRJ ? "red" : "green"}">${temRJ ? "Sim" : "Não"}</div></div>
    </div>
    ${proc?.valorTotalEstimado ? `<div class="icell navy" style="margin-bottom:14px;display:inline-block;min-width:200px"><div class="l">Valor Total Estimado</div><div class="v sm mono">${fmtMoney(proc.valorTotalEstimado)}</div></div>` : ""}
    ${distRows ? `${stitle("Distribuição por tipo")}<div style="margin-bottom:14px">${distRows}</div>` : ""}
    ${top10ValorRows ? `${stitle("Top 10 por valor")}
    <table class="tbl">
      <thead><tr><th>Tipo</th><th>Contraparte</th><th>Data</th><th class="r">Valor</th><th>Fase</th></tr></thead>
      <tbody>${top10ValorRows}</tbody>
    </table>` : top5ProcRows ? `${stitle("Top 5 mais recentes")}
    <table class="tbl">
      <thead><tr><th>Tipo</th><th>Data</th><th>Assunto</th><th>Fase</th></tr></thead>
      <tbody>${top5ProcRows}</tbody>
    </table>` : ""}
    ${totalProc > 5 ? `<div class="alert alta"><span class="atag">ALTA</span> ${totalProc} processos em polo passivo — verificar detalhes</div>` : ""}
    ${temRJ ? `<div class="alert alta"><span class="atag">ALTA</span> Pedido de falência ou recuperação judicial identificado</div>` : ""}
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

// ─── Page 7: SCR + DRE ───────────────────────────────────────────────────────
function pageSCRDRE(params: PDFReportParams, date: string): string {
  const scr = params.data.scr;
  const scrAnt = params.data.scrAnterior;
  const dre = params.data.dre;

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
    const vTotal = scrVar(scr.totalDividasAtivas, scrAnt?.totalDividasAtivas, true);
    scrRows += `<tr class="total"><td class="b">Total Dívidas</td><td>Resumo</td><td class="r">${fmtMoneyAbr(scrAnt?.totalDividasAtivas)}</td><td class="r">${fmtMoneyAbr(scr.totalDividasAtivas)}</td><td class="r var-cell ${vTotal.cls}">${esc(vTotal.val)}</td></tr>`;
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
    ${stitle("17 · Modalidades SCR")}
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
    sociosSCRSection = `${stitle("18 · SCR dos Sócios (PF)")}${blocks}`;
  }

  // DRE table
  let dreRows = "";
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
    dreRows = fields.map(f => {
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

    // DRE alerts
    const lastAno = dre.anos[dre.anos.length - 1];
    const ml = numVal(lastAno?.margemLiquida ?? "0");
    const dreAlerts = [
      ml < -30 ? `<div class="alert alta"><span class="atag">ALTA</span> Margem líquida ${fmtPct(lastAno?.margemLiquida)} — operação deficitária</div>` : "",
      numVal(lastAno?.ebitda ?? "0") < 0 ? `<div class="alert alta"><span class="atag">ALTA</span> EBITDA negativo ${fmtMoneyAbr(lastAno?.ebitda)} — não gera caixa operacional</div>` : "",
    ].filter(Boolean).join("");

    dreRows = `<thead><tr><th>Métrica</th>${headers}</tr></thead><tbody>${dreRows}</tbody>`;
    dreRows += dreAlerts ? `__ALERTS__${dreAlerts}` : "";
  }

  const scrPeriodoAtual = scr?.periodoReferencia ?? "—";
  const scrPeriodoAnt = scrAnt?.periodoReferencia ?? "—";

  let scrSection = "";
  if (scr) {
    const vencNum2 = numVal(scr.vencidos ?? "0");
    const totalNum2 = numVal(scr.totalDividasAtivas ?? "0");
    const pctVenc2 = totalNum2 > 0 ? ((vencNum2/totalNum2)*100).toFixed(1)+"%" : "0,0%";
    const vKPIVenc = scrVar(scr.vencidos, scrAnt?.vencidos, true);
    const vKPITotal = scrVar(scr.totalDividasAtivas, scrAnt?.totalDividasAtivas, true);
    scrSection = `
    ${stitle("16 · Comparativo SCR — Empresa (PJ)")}
    <div class="kpi-snap c4" style="margin-bottom:14px">
      <div class="icell ${totalNum2 > 0 ? "navy" : ""}">
        <div class="l">Total Dívidas Ativas</div>
        <div class="v sm mono">${fmtMoneyAbr(scr.totalDividasAtivas)}</div>
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

  let dreSection = "";
  if (dre && dre.anos.length > 0) {
    const [tableBody, ...alertParts] = dreRows.split("__ALERTS__");
    const lastDre = dre.anos[dre.anos.length - 1];
    const ml2 = numVal(lastDre?.margemLiquida ?? "0");
    const mb2 = numVal(lastDre?.margemBruta ?? "0");
    const me2 = numVal(lastDre?.margemEbitda ?? "0");
    dreSection = `
    ${stitle("19 · Demonstração de Resultado (DRE)")}
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
    ${alertParts[0] ?? ""}`;
  }

  const content = `${scrSection}${dreSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de SCR/DRE não disponíveis</div>`, 8, date);
}

// ─── Page 8: Balanço + ABC ───────────────────────────────────────────────────
function pageBalancoABC(params: PDFReportParams, date: string): string {
  const bal = params.data.balanco;
  const abc = params.data.curvaABC;

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
    ${stitle("20 · Balanço Patrimonial")}
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
    const abcRows = abc.clientes.slice(0, 7).map((c, i) => {
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
    ${stitle("11 · Concentração de clientes (Curva ABC)")}
    <div class="istrip c3" style="margin-bottom:10px">
      <div class="icell warn"><div class="l">Top 3 Clientes</div><div class="v" style="color:var(--a5)">${fmt(top3Pct)}</div></div>
      <div class="icell warn"><div class="l">Top 5 Clientes</div><div class="v" style="color:var(--a5)">${fmt(top5Pct)}</div></div>
      <div class="icell"><div class="l">Total Clientes</div><div class="v">${totalCli}</div></div>
    </div>
    <div class="abc-wrap">
      <table class="tbl" style="border:none;margin:0">
        <thead><tr><th style="width:40px">#</th><th>Cliente</th><th class="r">Faturamento</th><th class="r">% Rec.</th><th class="r">% Acum.</th><th style="width:50px">Cl.</th></tr></thead>
        <tbody>${abcRows}</tbody>
      </table>
    </div>
    <div class="abc-summary">Top 3: <b>${fmt(top3Pct)}</b> · Top 5: <b>${fmt(top5Pct)}</b> · Total clientes: <b>${totalCli}</b></div>
    ${abc.alertaConcentracao && abc.clientes[0] ? `<div class="alert alta" style="margin-top:8px"><span class="atag">ALTA</span> ${esc(abc.clientes[0].nome)} concentra ${fmtPct(abc.clientes[0].percentualReceita)} da receita — acima do limite recomendado</div>` : ""}`;
  }

  const content = `${balSection}${abcSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de balanço/ABC não disponíveis</div>`, 9, date);
}

// ─── Page 9: IR Sócios + Visita ───────────────────────────────────────────────
function pageIRVisita(params: PDFReportParams, date: string): string {
  const irSocios = params.data.irSocios ?? [];
  const rv = params.data.relatorioVisita;

  let irSection = "";
  if (irSocios.length > 0) {
    const irBlocks = irSocios.map(ir => {
      const initials = ir.nomeSocio.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
      const pl = numVal(ir.patrimonioLiquido ?? "0");
      const plBorder = pl > 500000 ? "var(--g6)" : pl > 0 ? "var(--a5)" : "var(--r6)";
      const impostoPago = ir.impostoPago ?? "0";
      const impostoRestituir = ir.impostoRestituir ?? "0";
      const dividasOnus = ir.dividasOnus ?? "0";
      const bensImoveis = ir.bensImoveis ?? "0";
      const bensVeiculos = ir.bensVeiculos ?? "0";
      return `<div style="margin-bottom:20px;padding:16px;background:var(--x0);border-radius:10px;border:1px solid var(--x2)">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--x2)">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--n0);border:2px solid ${plBorder};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--n8);flex-shrink:0">${esc(initials)}</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--n9)">${esc(ir.nomeSocio)}</div>
            <div style="font-size:10px;color:var(--x5);font-family:'JetBrains Mono',monospace;margin-top:2px">CPF: ${fmtCpf(ir.cpf)} · Ano-base: ${fmt(ir.anoBase)}</div>
          </div>
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
      </div>`;
    }).join("");
    irSection = `${stitle("22 · IR dos sócios")}${irBlocks}`;
  }

  let visitaSection = "";
  if (rv) {
    const recMap = {aprovado:"green", condicional:"warn", reprovado:"danger"} as const;
    const recCls = recMap[rv.recomendacaoVisitante] ?? "";
    const recLabel = {aprovado:"Aprovado", condicional:"Condicional", reprovado:"Reprovado"}[rv.recomendacaoVisitante] ?? fmt(rv.recomendacaoVisitante);

    const positRows = rv.pontosPositivos?.map(p => `<div class="ana-i">• ${esc(p)}</div>`).join("") || '<div class="ana-i" style="color:var(--x4)">—</div>';
    const atencRows = rv.pontosAtencao?.map(p => `<div class="ana-i">• ${esc(p)}</div>`).join("") || '<div class="ana-i" style="color:var(--x4)">—</div>';
    const ctxText = rv.observacoesLivres || rv.descricaoEstrutura || "";

    visitaSection = `
    ${stitle("23 · Relatório de visita")}
    <div class="istrip c3" style="margin-bottom:14px">
      <div class="icell"><div class="l">Responsável</div><div class="v sm">${fmt(rv.responsavelVisita)}</div></div>
      <div class="icell"><div class="l">Local</div><div class="v sm">${fmt(rv.localVisita)}</div></div>
      <div class="icell ${recCls}"><div class="l">Recomendação</div><div class="v ${recCls === "green" ? "green" : recCls === "danger" ? "red" : ""} sm">${esc(recLabel)}</div></div>
    </div>
    <div class="ana-grid">
      <div class="ana-col f"><div class="ana-h">Pontos positivos</div>${positRows}</div>
      <div class="ana-col a"><div class="ana-h">Pontos de atenção</div>${atencRows}</div>
      <div class="ana-col n"><div class="ana-h">Contexto</div><div class="ana-i" style="line-height:1.6">${esc(ctxText) || "—"}</div></div>
    </div>
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
    </div>`;
  }

  // Histórico de Consultas
  let historicoSection = "";
  const historico = params.data.historicoConsultas ?? [];
  if (historico.length > 0) {
    const histRows = historico.map(h =>
      `<tr><td>${esc(h.usuario)}</td><td class="r">${fmt(h.ultimaConsulta)}</td></tr>`
    ).join("");
    historicoSection = `
    ${stitle("21 · Histórico de consultas ao CNPJ")}
    <table class="tbl">
      <thead><tr><th>Instituição / Consulente</th><th class="r">Última Consulta</th></tr></thead>
      <tbody>${histRows}</tbody>
    </table>
    <div class="inf" style="margin-top:4px">${historico.length} consulta(s) nos últimos 6 meses</div>`;
  }

  const content = `${irSection}${historicoSection}${visitaSection}`;
  return page(content || `<div style="color:var(--x4);text-align:center;padding:40px">Dados de IR/Visita não disponíveis</div>`, 10, date);
}

// ─── Page 11: Checklist de Documentos ─────────────────────────────────────────
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

  const lista = docs.length > 0 ? docs : fallback;
  const presentes = lista.filter(d => d.presente).length;
  const obrigTotal = lista.filter(d => d.obrigatorio).length;
  const obrigPres = lista.filter(d => d.obrigatorio && d.presente).length;
  const nivel = presentes >= lista.length * 0.8 ? "completa" : presentes >= lista.length * 0.5 ? "parcial" : "minima";
  const nivelCls = nivel === "completa" ? "ok" : nivel === "parcial" ? "mod" : "alta";
  const nivelLabel = nivel === "completa" ? "Cobertura completa" : nivel === "parcial" ? "Cobertura parcial" : "Cobertura mínima";

  const docRows = lista.map(d => {
    const iconCls = d.presente ? "pass" : "fail";
    const iconChar = d.presente ? "✓" : "—";
    const obadge = d.obrigatorio
      ? `<span style="font-size:7px;font-weight:700;padding:2px 5px;border-radius:3px;background:var(--n1);color:var(--n7);margin-left:6px">OBR</span>`
      : `<span style="font-size:7px;font-weight:700;padding:2px 5px;border-radius:3px;background:var(--x1);color:var(--x5);margin-left:6px">OPC</span>`;
    return `<div class="pf-row">
      <div class="pf-icon ${iconCls}" style="width:20px;height:20px;font-size:11px">${iconChar}</div>
      <div class="pf-name">${esc(d.label)}${obadge}</div>
      <div class="pf-val"><div class="v ${d.presente ? "pass" : "fail"}" style="font-size:10px">${d.presente ? "Entregue" : "Ausente"}</div></div>
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
  `;

  return page(content, 11, date);
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function gerarHtmlRelatorio(params: PDFReportParams): { html: string; headerTemplate: string; footerTemplate: string } {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const pages = [
    pageCapa(params, date),
    pageSintese(params, date),
    pageCNPJQSA(params, date),
    pageParecer(params, date),
    pageParametros(params, date),
    pageFaturamento(params, date),
    pageProtestosProcessos(params, date),
    pageSCRDRE(params, date),
    pageBalancoABC(params, date),
    pageIRVisita(params, date),
    pageChecklist(params, date),
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
${pages}
</body>
</html>`;

  return { html, headerTemplate: "", footerTemplate: "" };
}
