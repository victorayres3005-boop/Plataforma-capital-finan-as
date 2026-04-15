import { NextRequest, NextResponse } from "next/server";
import { gerarHtmlRelatorio } from "@/lib/pdf/template";
import type { PDFReportParams } from "@/lib/generators/pdf";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function getBrowser() {
  const isServerless =
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.CHROMIUM_URL;

  if (isServerless) {
    // Produção (Vercel / Lambda) — Chromium otimizado
    const Chromium = (await import("@sparticuz/chromium-min")).default;
    const puppeteerCore = (await import("puppeteer-core")).default;

    const executablePath = process.env.CHROMIUM_URL
      ? await Chromium.executablePath(process.env.CHROMIUM_URL)
      : await Chromium.executablePath();

    return puppeteerCore.launch({
      args: Chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath,
      headless: true,
    });
  } else {
    // Desenvolvimento local — puppeteer completo (Chromium embutido)
    const puppeteer = (await import("puppeteer")).default;
    return puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
}

export async function POST(req: NextRequest) {
  let browser;
  try {
    const dados: PDFReportParams = await req.json();

    const { html, headerTemplate, footerTemplate } = gerarHtmlRelatorio(dados);

    browser = await getBrowser();
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });

    // Aguarda fontes carregarem
    await page.evaluateHandle("document.fonts.ready");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: "28mm", bottom: "18mm", left: "16mm", right: "16mm" },
      preferCSSPageSize: false,
    });

    const cnpj = dados.data?.cnpj?.cnpj ?? "cedente";
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="capital-financas-${cnpj}-${dateStr}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Erro ao gerar PDF:", error);
    return NextResponse.json(
      { error: "Erro ao gerar PDF", details: String(error) },
      { status: 500 }
    );
  } finally {
    if (browser) await browser.close();
  }
}
