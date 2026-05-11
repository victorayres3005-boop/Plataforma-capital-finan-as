// PDF "Decisão do Comitê" gerado a partir dos dados do /r/{id}.
// Layout portado de buildDecisaoHtml (app/parecer/page.tsx), mas:
//   • Decisão e Rating ficam em "—" (a serem preenchidos à mão ou via /parecer)
//   • Bloco "Condições e Garantias" omitido (sem origem no /r/{id} hoje)
//   • Observações = 4 percepções (geral+DRE+Faturamento+Balanço) + Fortes/Fracos/Alertas

import Chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type SharedReportRow = {
  html: string;
  expires_at: string | null;
  company: string | null;
  pontos_fortes?: unknown;
  pontos_fracos?: unknown;
  alertas?: unknown;
  percepcao?: string | null;
  percepcao_dre?: string | null;
  percepcao_faturamento?: string | null;
  percepcao_balanco?: string | null;
  pleito_comite?: unknown;
};

// Whitelist do Pleito do Comitê + mapeamento label PT-BR.
// Espelha o array `pleitoComiteFields` em template.ts.
const PLEITO_LABELS: Array<[string, string]> = [
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

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Extrai os 15 valores do "Pleito do cedente" do HTML armazenado via regex
// nas tabelas da seção 9. Layout fixo: <tr><td>LABEL</td><td>VALUE</td></tr>.
function extractPleitoCedente(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Recorta o bloco entre <!-- 9. Pleito --> e <!-- 9.5 ou <!-- 9b
  const start = html.indexOf("<!-- 9. Pleito -->");
  if (start < 0) return out;
  const endA = html.indexOf("<!-- 9.5", start);
  const endB = html.indexOf("<!-- 9b", start);
  const end = [endA, endB].filter(x => x > 0).sort((a, b) => a - b)[0] || (start + 5000);
  const chunk = html.slice(start, end);

  const labelToKey = new Map(PLEITO_LABELS.map(([l, k]) => [l, k]));
  const trRe = /<tr>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(chunk)) !== null) {
    const label = m[1].replace(/\s+/g, " ").trim();
    const value = m[2].replace(/\s+/g, " ").trim();
    const key = labelToKey.get(label);
    if (key) out[key] = value;
  }
  return out;
}

// Extrai CNPJ do HTML armazenado (procura padrão XX.XXX.XXX/XXXX-XX).
function extractCnpj(html: string): string {
  const m = html.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  return m?.[1] || "—";
}

function buildParecerHtml(data: SharedReportRow): string {
  const company = data.company || "—";
  const cnpj = extractCnpj(data.html);
  const pleitoCed = extractPleitoCedente(data.html);
  const pleitoComite = (data.pleito_comite && typeof data.pleito_comite === "object")
    ? data.pleito_comite as Record<string, string>
    : {};

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric"
  });

  const rows = PLEITO_LABELS.map(([label, key]) => {
    const p = (pleitoCed[key] || "").trim() || "—";
    const a = (pleitoComite[key] || "").trim() || "—";
    return { label, pleito: p, aprovado: a };
  }).filter(r => r.pleito !== "—" || r.aprovado !== "—");

  const fortes = Array.isArray(data.pontos_fortes) ? data.pontos_fortes as string[] : [];
  const fracos = Array.isArray(data.pontos_fracos) ? data.pontos_fracos as string[] : [];
  const alertas = Array.isArray(data.alertas) ? data.alertas as string[] : [];

  const percepcoes: Array<[string, string]> = [];
  if (data.percepcao?.trim())              percepcoes.push(["Percepção Geral", data.percepcao]);
  if (data.percepcao_dre?.trim())          percepcoes.push(["DRE", data.percepcao_dre]);
  if (data.percepcao_faturamento?.trim())  percepcoes.push(["Faturamento", data.percepcao_faturamento]);
  if (data.percepcao_balanco?.trim())      percepcoes.push(["Balanço Patrimonial", data.percepcao_balanco]);

  const hasObs = percepcoes.length > 0 || fortes.length > 0 || fracos.length > 0 || alertas.length > 0;

  const logoSvg = (whiteFill: boolean) => {
    const blue = whiteFill ? "#ffffff" : "#163269";
    const green = "#84BF41";
    return `<svg width="170" height="22" viewBox="0 0 451 58" xmlns="http://www.w3.org/2000/svg">
      <circle cx="31" cy="27" r="22" stroke="${blue}" stroke-width="4.5" fill="none"/>
      <circle cx="31" cy="49" r="4.5" fill="${blue}"/>
      <text x="66" y="46" font-family="DM Sans,Arial,sans-serif" font-weight="700" font-size="38" letter-spacing="-0.3">
        <tspan fill="${blue}">capital</tspan><tspan fill="${green}">finanças</tspan>
      </text>
    </svg>`;
  };

  const bulletList = (arr: string[]) => arr.map(x =>
    `<li style="margin-bottom:4px;line-height:1.5">${esc(x)}</li>`
  ).join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Parecer — ${esc(company)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --n9:#163269;--n8:#1F478E;--n7:#2a5aad;--n1:#ccd9f0;--n0:#e8eef8;
  --a5:#d4940a;--a1:#fdf3d7;
  --r6:#c53030;--r1:#fee2e2;
  --g6:#5a8a2a;--g1:#dff0c0;
  --x9:#111827;--x7:#374151;--x5:#6b7280;--x4:#9ca3af;--x2:#e5e7eb;--x1:#f3f4f6;--x0:#f9fafb;
  --gl:#84BF41;
  --fs-kpi:14px;--fs-h3:12px;--fs-body:11px;--fs-label:9px;--fs-tag:8px;
}
body{font-family:'DM Sans',sans-serif;font-size:var(--fs-body);color:var(--x9);background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',monospace}
@page{size:210mm auto;margin:14mm 18mm}
@media print{body{margin:0;padding:0} .page{max-width:none!important;margin:0!important;box-shadow:none!important;border-radius:0!important}}
.page{max-width:860px;margin:20px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(12,27,58,0.07);display:flex;flex-direction:column;min-height:100vh}
.hdr{background:var(--n9);padding:14px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--gl)}
.hdr .meta{font-size:var(--fs-label);color:rgba(255,255,255,0.5);letter-spacing:0.04em}
.hdr .pg{background:var(--gl);color:#fff;font-size:var(--fs-body);font-weight:700;padding:3px 11px;border-radius:10px;margin-left:12px}
.ct{padding:28px 32px 32px;flex:1}
.emp{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--x2);margin-bottom:24px;gap:24px}
.emp-name{font-size:20px;font-weight:700;color:var(--n9);margin-bottom:4px;line-height:1.2}
.emp-cnpj{font-size:var(--fs-h3);color:var(--x5)}
.emp-cnpj b{color:var(--x7);font-family:'JetBrains Mono',monospace}
.dec-pend{display:inline-block;padding:3px 12px;border-radius:4px;font-size:var(--fs-label);font-weight:700;letter-spacing:0.06em;margin-top:8px;background:var(--x1);color:var(--x5);border:1px dashed var(--x4)}
.rat-pend{text-align:center;min-width:120px;flex-shrink:0}
.rat-c-pend{width:72px;height:72px;border-radius:50%;border:3px dashed var(--x4);display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto 6px;color:var(--x4)}
.rat-n-pend{font-size:26px;font-weight:700;line-height:1}
.rat-d-pend{font-size:var(--fs-label);color:var(--x4);margin-top:2px}
.rat-l-pend{font-size:var(--fs-label);font-weight:700;letter-spacing:0.06em;color:var(--x4)}
.stitle{font-size:var(--fs-body);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--x5);margin:28px 0 12px;display:flex;align-items:center;gap:10px}
.stitle:first-child{margin-top:0}
.stitle .tag{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:18px;border-radius:3px;background:var(--n9);color:#fff;font-size:var(--fs-tag);font-weight:700;padding:0 6px;letter-spacing:0.04em}
.stitle .line{flex:1;height:1px;background:var(--x2)}
.cmp{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--fs-h3);border:1px solid var(--x2);border-radius:8px;overflow:hidden;margin-bottom:8px}
.cmp thead th{background:var(--n9);color:rgba(255,255,255,0.9);font-size:var(--fs-label);font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:10px 14px;text-align:left}
.cmp thead th.c{text-align:center}
.cmp tbody td{padding:9px 14px;border-bottom:1px solid var(--x1);color:var(--x7);font-size:var(--fs-body)}
.cmp tbody tr:last-child td{border-bottom:none}
.cmp tbody tr:nth-child(even){background:var(--x0)}
.cmp td.label{color:var(--x5);font-weight:600}
.cmp td.val,.cmp td.appr{font-family:'JetBrains Mono',monospace;text-align:center}
.cmp td.appr.changed{color:var(--g6);font-weight:700;position:relative}
.cmp td.appr.changed .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--g6);margin-left:6px;vertical-align:middle}
.note{background:#fff;border:1px solid var(--x2);border-left:4px solid var(--n8);border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:10px}
.note.analyst{border-left-color:var(--x4)}
.note .l{font-size:var(--fs-tag);font-weight:700;color:var(--n8);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
.note.analyst .l{color:var(--x5)}
.note .body{font-size:var(--fs-h3);color:var(--x7);line-height:1.6;white-space:pre-wrap}
.bullets{padding:14px 18px 14px 36px;background:#fff;border:1px solid var(--x2);border-radius:8px;margin-bottom:10px}
.bullets .h{font-size:var(--fs-tag);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--n8);margin-bottom:6px;margin-left:-18px}
.bullets.f .h{color:var(--g6)}
.bullets.w .h{color:var(--a5)}
.bullets.a .h{color:var(--r6)}
.bullets ul{font-size:var(--fs-h3);color:var(--x7);padding-left:18px}
.ftr{background:var(--x0);border-top:1px solid var(--x2);padding:10px 32px;display:flex;justify-content:space-between;align-items:center}
.ftr span{font-size:var(--fs-label);color:var(--x4);letter-spacing:0.04em}
.ftr .logo{opacity:0.5;display:flex;align-items:center}
</style></head><body>

<div class="page">

  <div class="hdr">
    <div style="display:flex;align-items:center">${logoSvg(true)}</div>
    <div style="display:flex;align-items:center">
      <div class="meta">Decisão do Comitê de Crédito · ${esc(hoje)}</div>
      <div class="pg">1</div>
    </div>
  </div>

  <div class="ct">

    <div class="emp">
      <div style="flex:1">
        <div class="emp-name">${esc(company)}</div>
        <div class="emp-cnpj">CNPJ <b>${esc(cnpj)}</b></div>
        <span class="dec-pend">DECISÃO PENDENTE</span>
      </div>
      <div class="rat-pend">
        <div class="rat-c-pend">
          <div class="rat-n-pend">—</div>
          <div class="rat-d-pend">/ 10</div>
        </div>
        <div class="rat-l-pend">RATING PENDENTE</div>
      </div>
    </div>

    ${rows.length > 0 ? `
    <div class="stitle"><span class="tag">01</span>Comparativo: Pleito × Aprovado<div class="line"></div></div>
    <table class="cmp">
      <thead><tr>
        <th>Parâmetro</th>
        <th class="c">Pleito do Cedente</th>
        <th class="c">Aprovado pelo Comitê</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
          const diff = r.pleito !== "—" && r.aprovado !== "—" && r.pleito !== r.aprovado;
          return `<tr>
            <td class="label">${esc(r.label)}</td>
            <td class="val">${esc(r.pleito)}</td>
            <td class="appr${diff ? " changed" : ""}">${esc(r.aprovado)}${diff ? '<span class="dot"></span>' : ""}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    ` : ""}

    ${hasObs ? `
    <div class="stitle"><span class="tag">02</span>Observações<div class="line"></div></div>
    ${percepcoes.map(([label, text]) => `
    <div class="note">
      <div class="l">${esc(label)}</div>
      <div class="body">${esc(text)}</div>
    </div>`).join("")}
    ${fortes.length > 0 ? `
    <div class="bullets f">
      <div class="h">Pontos Fortes</div>
      <ul>${bulletList(fortes)}</ul>
    </div>` : ""}
    ${fracos.length > 0 ? `
    <div class="bullets w">
      <div class="h">Pontos Fracos</div>
      <ul>${bulletList(fracos)}</ul>
    </div>` : ""}
    ${alertas.length > 0 ? `
    <div class="bullets a">
      <div class="h">Alertas</div>
      <ul>${bulletList(alertas)}</ul>
    </div>` : ""}
    ` : ""}

  </div>

  <div class="ftr">
    <div class="logo">${logoSvg(false)}</div>
    <span>Capital Finanças · Decisão do Comitê · Documento Confidencial</span>
    <span>Pág. 1</span>
  </div>

</div>

</body></html>`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id || !/^[a-z0-9]{8,16}$/.test(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return Response.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const supabase = createClient(url, key);

  // Mesmo padrão de SELECT em 2 etapas do GET /r/[id] — evita falhar
  // se PostgREST não viu colunas das migrations recentes.
  const { data: base, error: errBase } = await supabase
    .from("shared_reports")
    .select("html, expires_at, company, pontos_fortes, pontos_fracos, alertas, percepcao, pleito_comite")
    .eq("id", id)
    .single<SharedReportRow>();

  if (errBase || !base) {
    return Response.json({ error: "Relatório não encontrado" }, { status: 404 });
  }
  if (base.expires_at && new Date(base.expires_at) < new Date()) {
    return Response.json({ error: "Link expirado" }, { status: 410 });
  }

  let data: SharedReportRow = base;
  const extra = await supabase
    .from("shared_reports")
    .select("percepcao_dre, percepcao_faturamento, percepcao_balanco")
    .eq("id", id)
    .single<Pick<SharedReportRow, "percepcao_dre" | "percepcao_faturamento" | "percepcao_balanco">>();
  if (extra.data && !extra.error) {
    data = { ...data, ...extra.data };
  }

  const parecerHtml = buildParecerHtml(data);

  const chromiumUrl = process.env.CHROMIUM_URL;
  if (!chromiumUrl) {
    return Response.json({ error: "CHROMIUM_URL não configurado" }, { status: 500 });
  }

  const browser = await puppeteer.launch({
    args: Chromium.args,
    defaultViewport: { width: 794, height: 1200 },
    executablePath: await Chromium.executablePath(chromiumUrl),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(parecerHtml, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");
    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });

    const safeName = (data.company || "parecer").replace(/[^a-zA-Z0-9\-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "parecer";
    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="parecer-${safeName}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
