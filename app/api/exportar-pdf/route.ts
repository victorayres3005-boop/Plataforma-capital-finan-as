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
    const { html, headerTemplate, footerTemplate } = gerarHtmlRelatorio(dados);
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: "28mm", bottom: "18mm", left: "16mm", right: "16mm" },
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
