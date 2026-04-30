import Chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { gerarHtmlRelatorio } from "@/lib/pdf/template";
import type { PDFReportParams } from "@/lib/generators/pdf";
import { createServerSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Auth — Chromium gasta tempo de função; bloqueia abuso anônimo
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

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      preferCSSPageSize: true,
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
