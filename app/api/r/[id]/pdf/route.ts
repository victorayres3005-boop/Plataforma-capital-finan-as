// Variante pública de /api/exportar-pdf-html para uso a partir do /r/{id}.
// Diferenças vs. a rota original:
//   • Sem auth Supabase (decisão de produto: comitê externo precisa baixar)
//   • Valida que o id (8-16 chars) existe e não expirou em shared_reports
//   • Limite explícito de tamanho do HTML (5 MB) — protege gerador de abuso
//
// Nota: o HTML enviado vem do cliente (`document.documentElement.outerHTML`).
// Não há como provar que é o HTML "oficial" do relatório, mas a vinculação
// ao id garante que só ids válidos consomem tempo de Chromium.

import Chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: NextRequest,
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
  // maybeSingle: distingue "não existe" (404) de erro técnico (500)
  // (auditoria 2026-05-12 #8).
  const { data: row, error: selErr } = await supabase
    .from("shared_reports")
    .select("expires_at")
    .eq("id", id)
    .maybeSingle();
  if (selErr) return Response.json({ error: selErr.message }, { status: 500 });
  if (!row) return Response.json({ error: "Relatório não encontrado" }, { status: 404 });
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return Response.json({ error: "Link expirado" }, { status: 410 });
  }

  const chromiumUrl = process.env.CHROMIUM_URL;
  if (!chromiumUrl) {
    return Response.json({ error: "CHROMIUM_URL não configurado" }, { status: 500 });
  }

  let html: string;
  let filename: string | undefined;
  try {
    const body = await req.json() as { html: string; filename?: string };
    html = body.html;
    filename = body.filename;
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 });
  }
  if (!html || typeof html !== "string") {
    return Response.json({ error: "html obrigatório" }, { status: 400 });
  }
  if (html.length > MAX_HTML_BYTES) {
    return Response.json({ error: `HTML excede ${MAX_HTML_BYTES} bytes` }, { status: 413 });
  }

  const A4_W_PX = 794;
  const browser = await puppeteer.launch({
    args: Chromium.args,
    defaultViewport: { width: A4_W_PX, height: 1200 },
    executablePath: await Chromium.executablePath(chromiumUrl),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");
    await page.emulateMediaType("print");

    const pageHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".page")).map(
        (el) => el.getBoundingClientRect().height
      );
    });

    const MM = 25.4 / 96;
    const MARGIN_V = 28;
    const MIN_PX = 300;

    const groups: number[][] = [];
    let current: number[] = [];
    for (let i = 0; i < pageHeights.length; i++) {
      current.push(i);
      const total = current.reduce((s, idx) => s + pageHeights[idx], 0);
      if (total >= MIN_PX || i === pageHeights.length - 1) {
        groups.push(current);
        current = [];
      }
    }

    let css = "";
    groups.forEach((group, gi) => {
      const totalH = group.reduce((s, idx) => s + pageHeights[idx], 0);
      const hMm = Math.ceil(totalH * MM) + MARGIN_V;
      css += `@page pg${gi}{size:210mm ${hMm}mm;margin:14mm 18mm} `;
      group.forEach((idx, pos) => {
        css += `.pgx${idx}{page:pg${gi}} `;
        if (pos === group.length - 1) {
          css += `.pgx${idx}{break-after:page!important;page-break-after:always!important} `;
        } else {
          css += `.pgx${idx}{break-after:avoid!important;page-break-after:avoid!important} `;
        }
      });
    });

    await page.evaluate((cssText) => {
      const btn = document.getElementById("printBtn");
      if (btn) btn.remove();
      const style = document.createElement("style");
      style.textContent = cssText;
      document.head.appendChild(style);
      document.querySelectorAll(".page").forEach((el, i) =>
        el.classList.add("pgx" + i)
      );
    }, css);

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });

    const name = filename ?? `relatorio-${id}.pdf`;
    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } finally {
    await browser.close();
  }
}
