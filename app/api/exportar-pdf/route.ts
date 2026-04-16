import Chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { gerarHtmlRelatorio } from "@/lib/pdf/template";
import type { PDFReportParams } from "@/lib/generators/pdf";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const chromiumUrl = process.env.CHROMIUM_URL;
  if (!chromiumUrl) {
    return new Response(
      JSON.stringify({ error: "CHROMIUM_URL não configurado" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const dados: PDFReportParams = await req.json();

  const browser = await puppeteer.launch({
    args: Chromium.args,
    defaultViewport: { width: 1280, height: 900 },
    executablePath: await Chromium.executablePath(chromiumUrl),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const { html } = gerarHtmlRelatorio(dados);
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");

    const reportDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;width:100%;height:100%;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;box-sizing:border-box;background:#163269;border-bottom:2px solid #84BF41">
        <span style="font-size:11px;font-weight:700;color:#fff">capital<span style="color:#84BF41">finanças</span></span>
        <span style="font-size:8px;color:rgba(255,255,255,0.55)">Relatório de Due Diligence · ${reportDate}</span>
        <span style="background:#84BF41;color:#fff;font-size:8px;font-weight:700;padding:2px 10px;border-radius:10px">Pág. <span class="pageNumber"></span></span>
      </div>`,
      footerTemplate: `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;width:100%;height:100%;padding:0 16mm;display:flex;justify-content:space-between;align-items:center;box-sizing:border-box;background:#f9fafb;border-top:1px solid #e5e7eb">
        <span style="font-size:8px;color:#9ca3af">Capital Finanças</span>
        <span style="font-size:8px;color:#9ca3af">Documento Confidencial</span>
        <span style="font-size:8px;color:#9ca3af">Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
      margin: { top: "13mm", bottom: "11mm", left: "0mm", right: "0mm" },
      preferCSSPageSize: false,
    });

    const cnpj = dados.data?.cnpj?.cnpj ?? "cedente";
    return new Response(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${cnpj}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
