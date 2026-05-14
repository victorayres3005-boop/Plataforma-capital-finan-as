// PDF "Decisão do Comitê" — gerado a partir dos dados do /r/{id}.
// Builder do HTML mora em lib/parecer/buildHtml.ts (compartilhado com /parecer-html).

import Chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildParecerHtml, SharedReportRow } from "@/lib/parecer/buildHtml";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const isMissing = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" ||
          /could not find the .* column/i.test(e.message ?? "") ||
          /column .* does not exist/i.test(e.message ?? ""));

async function loadReport(id: string): Promise<SharedReportRow | { error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // SERVICE_ROLE-only: shared_reports será protegida por RLS, ANON não tem acesso.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: "SUPABASE_SERVICE_ROLE_KEY ausente", status: 500 };

  const supabase = createClient(url, key);
  const baseQ = await supabase
    .from("shared_reports")
    .select("html, expires_at, company")
    .eq("id", id)
    .single<Pick<SharedReportRow, "html" | "expires_at" | "company">>();
  if (baseQ.error || !baseQ.data) return { error: "Relatório não encontrado", status: 404 };
  if (baseQ.data.expires_at && new Date(baseQ.data.expires_at) < new Date()) {
    return { error: "Link expirado", status: 410 };
  }

  let data: SharedReportRow = {
    ...baseQ.data,
    pontos_fortes: null, pontos_fracos: null, alertas: null,
    percepcao: null, percepcao_dre: null, percepcao_faturamento: null, percepcao_balanco: null,
    pleito_comite: null,
  };

  const editQ = await supabase.from("shared_reports")
    .select("pontos_fortes, pontos_fracos, alertas, percepcao").eq("id", id).single();
  if (editQ.data && !editQ.error) data = { ...data, ...editQ.data };
  else if (editQ.error && !isMissing(editQ.error)) console.warn("[parecer-pdf] etapa 2:", editQ.error.message);

  const pcQ = await supabase.from("shared_reports")
    .select("pleito_comite").eq("id", id).single();
  if (pcQ.data && !pcQ.error) data = { ...data, ...pcQ.data };
  else if (pcQ.error && !isMissing(pcQ.error)) console.warn("[parecer-pdf] etapa 3:", pcQ.error.message);

  const psQ = await supabase.from("shared_reports")
    .select("percepcao_dre, percepcao_faturamento, percepcao_balanco").eq("id", id).single();
  if (psQ.data && !psQ.error) data = { ...data, ...psQ.data };
  else if (psQ.error && !isMissing(psQ.error)) console.warn("[parecer-pdf] etapa 4:", psQ.error.message);

  return data;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id || !/^[a-z0-9]{8,16}$/.test(id)) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }
  const loaded = await loadReport(id);
  if ("error" in loaded) {
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }

  const parecerHtml = buildParecerHtml(loaded);

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

    const safeName = (loaded.company || "parecer").replace(/[^a-zA-Z0-9\-_ ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "parecer";
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
