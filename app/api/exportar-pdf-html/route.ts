import Chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { createServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Auth — Chromium gasta tempo de função
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const chromiumUrl = process.env.CHROMIUM_URL;
  if (!chromiumUrl) {
    return new Response(
      JSON.stringify({ error: "CHROMIUM_URL não configurado" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { html, filename } = await req.json() as { html: string; filename?: string };

  // Viewport = largura A4 a 96dpi (210mm) para correspondência 1:1 com o PDF
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

    // Mede alturas em modo print — mesmo modo do PDF gerado
    await page.emulateMediaType("print");

    const pageHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".page")).map(
        (el) => el.getBoundingClientRect().height
      );
    });

    // px → mm a 96dpi (1px = 25.4/96 mm)
    const MM = 25.4 / 96;
    const MARGIN_V = 28;  // 14mm topo + 14mm fundo
    const MIN_PX = 300;   // páginas menores que isso são mescladas com a próxima

    // Agrupa páginas muito pequenas com a seguinte
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
      // Remove botão de impressão
      const btn = document.getElementById("printBtn");
      if (btn) btn.remove();
      // Injeta CSS de páginas nomeadas
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

    const name = filename ?? "relatorio.pdf";
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
