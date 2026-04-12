export const runtime = "nodejs";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/debug-extraction?collectionId=XXX
 * Returns the full JSON extracted by the AI for each document type
 * Used to debug when values look wrong in the report.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const collectionId = url.searchParams.get("collectionId");
  if (!collectionId) {
    return Response.json({ error: "collectionId required" }, { status: 400 });
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaKey) {
    return Response.json({ error: "supabase not configured" }, { status: 500 });
  }

  const db = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("document_collections")
    .select("id, cnpj, company_name, documents, fmm_12m, rating, decisao, created_at")
    .eq("id", collectionId)
    .single();

  if (error || !data) {
    return Response.json({ error: "collection not found", details: error }, { status: 404 });
  }

  // Build a summary with raw extracted data per document
  type Doc = { type?: string; filename?: string; extracted_data?: unknown };
  const docs = (data.documents as Doc[] | null) || [];

  const summary = {
    collectionId: data.id,
    cnpj: data.cnpj,
    companyName: data.company_name,
    createdAt: data.created_at,
    fmm_12m_saved: data.fmm_12m,
    rating: data.rating,
    decisao: data.decisao,
    documents: docs.map((d: Doc) => ({
      type: d.type,
      filename: d.filename,
      // Full raw data
      extracted_data: d.extracted_data,
    })),
    sanityChecks: [] as string[],
  };

  // Run sanity checks on faturamento
  const fatDoc = docs.find((d: Doc) => d.type === "faturamento");
  if (fatDoc?.extracted_data) {
    const fat = fatDoc.extracted_data as { meses?: Array<{ mes: string; valor: string }>; fmm12m?: string };
    if (fat.meses && fat.meses.length > 0) {
      const values = fat.meses.map(m => parseFloat(String(m.valor).replace(/[^\d.,\-]/g, "").replace(/\./g, "").replace(",", ".")) || 0);
      const max = Math.max(...values);
      const min = Math.min(...values.filter(v => v > 0));
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      summary.sanityChecks.push(`[Faturamento] ${values.length} meses | min=${min.toLocaleString("pt-BR")} | max=${max.toLocaleString("pt-BR")} | avg=${avg.toLocaleString("pt-BR")}`);
      if (max > 100_000_000) {
        summary.sanityChecks.push(`⚠️ [Faturamento] MAX > R$ 100M — valor suspeito, verificar separador`);
      }
      if (fat.fmm12m) {
        const fmmRaw = parseFloat(String(fat.fmm12m).replace(/[^\d.,\-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
        summary.sanityChecks.push(`[Faturamento] fmm12m extraido = ${fmmRaw.toLocaleString("pt-BR")} | media calculada = ${avg.toLocaleString("pt-BR")} | razao = ${(fmmRaw / avg).toFixed(2)}x`);
      }
    }
  }

  // Sanity check on Balanço
  const balDoc = docs.find((d: Doc) => d.type === "balanco");
  if (balDoc?.extracted_data) {
    const bal = balDoc.extracted_data as { anos?: Array<{ ano: string; ativoTotal?: string; patrimonioLiquido?: string }> };
    if (bal.anos && bal.anos.length > 0) {
      summary.sanityChecks.push(`[Balanço] ${bal.anos.length} anos: ${bal.anos.map(a => a.ano).join(", ")}`);
      const duplicateAnos = bal.anos.map(a => a.ano).filter((a, i, arr) => arr.indexOf(a) !== i);
      if (duplicateAnos.length > 0) {
        summary.sanityChecks.push(`⚠️ [Balanço] anos duplicados: ${duplicateAnos.join(", ")}`);
      }
    }
  }

  // Sanity check on SCR
  const scrDoc = docs.find((d: Doc) => d.type === "scr");
  if (scrDoc?.extracted_data) {
    const scr = scrDoc.extracted_data as { totalDividasAtivas?: string; tipoPessoa?: string };
    summary.sanityChecks.push(`[SCR] tipoPessoa = ${scr.tipoPessoa || "?"} | totalDividas = ${scr.totalDividasAtivas || "?"}`);
  }

  // Visita
  const visitaDoc = docs.find((d: Doc) => d.type === "relatorio_visita");
  if (visitaDoc?.extracted_data) {
    const v = visitaDoc.extracted_data as { modalidade?: string; pleito?: string; taxaConvencional?: string; taxaComissaria?: string };
    summary.sanityChecks.push(`[Visita] modalidade=${v.modalidade || "?"} | pleito=${v.pleito || "?"} | taxas: conv=${v.taxaConvencional || "-"}, com=${v.taxaComissaria || "-"}`);
  }

  return Response.json(summary, { status: 200 });
}
