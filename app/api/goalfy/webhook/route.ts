export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";
import { put } from "@vercel/blob";

const WEBHOOK_SECRET = process.env.GOALFY_WEBHOOK_SECRET || "";

const DOC_TYPE_MAP: Record<string, string> = {
  "última alteração contratual": "contrato_social",
  "contrato social":             "contrato_social",
  "faturamento dos últimos 12m": "faturamento",
  "faturamento":                 "faturamento",
  "relatório de visitas":        "relatorio_visita",
  "relatorio de visitas":        "relatorio_visita",
  "credithub":                   "scr",
  "scr":                         "scr",
  "dre":                         "dre",
  "balanço":                     "balanco",
  "balanco":                     "balanco",
  "curva abc":                   "curva_abc",
  "docs de identificação dos sócios": "qsa",
  "qsa":                         "qsa",
  "ir dos sócios":               "ir_socio",
  "ir socio":                    "ir_socio",
};

const TEXT_FIELDS = new Set([
  "cardId", "id", "card_id", "cardid",
  "Razão Social", "Razão social", "razao_social", "razaoSocial", "company_name",
  "CNPJ", "cnpj",
  "Gerente de Vendas", "Gerente", "gerente", "manager", "manager_name",
  "phase", "fase", "faseAtual", "faseNome",
  "createdAt", "created_at",
]);

function mapDocType(title: string): string {
  return DOC_TYPE_MAP[title.toLowerCase().trim()] || "outro";
}

function isUrl(val: unknown): val is string {
  return typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://"));
}

function extractUrls(value: unknown): string[] {
  if (isUrl(value)) return [value];
  if (Array.isArray(value)) return value.filter(isUrl) as string[];
  return [];
}

export async function POST(req: Request) {
  if (WEBHOOK_SECRET) {
    const auth = req.headers.get("x-goalfy-secret") || req.headers.get("authorization") || "";
    const valid = auth === WEBHOOK_SECRET || auth === `Bearer ${WEBHOOK_SECRET}`;
    if (!valid) return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  console.log("[goalfy/webhook] payload recebido:", JSON.stringify(body).slice(0, 500));

  const cardId = String(
    body.cardId || body.id || body.card_id || body.cardid || crypto.randomUUID()
  );
  const razao = String(
    body["Razão Social"] || body["Razão social"] || body.razaoSocial ||
    body.razao_social || body.company_name || "Empresa não identificada"
  );
  const cnpj = String(body["CNPJ"] || body.cnpj || "").replace(/\D/g, "");
  const gerente = String(
    body["Gerente de Vendas"] || body["Gerente"] || body.gerente ||
    body.manager || body.manager_name || ""
  );
  const phase = String(body.phase || body.fase || body.faseAtual || body.faseNome || "");

  // Download e re-upload dos anexos imediatamente (URLs S3 expiram)
  const documents: {
    id: string; blob_url: string; filename: string;
    doc_type: string; size_bytes: number; status: string;
  }[] = [];

  let docIndex = 0;
  for (const [fieldTitle, fieldValue] of Object.entries(body)) {
    if (TEXT_FIELDS.has(fieldTitle)) continue;

    const urls = extractUrls(fieldValue);
    if (urls.length === 0) continue;

    for (const url of urls) {
      const docId = `${cardId}-${docIndex++}`;
      const rawName = decodeURIComponent(url.split("/").pop()?.split("?")[0] || `doc_${docId}`);
      const safeName = rawName.replace(/[^a-zA-Z0-9.\-_]/g, "_") || `doc_${docId}.pdf`;
      const docType = mapDocType(fieldTitle);

      try {
        const fileRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!fileRes.ok) {
          console.warn(`[goalfy/webhook] falha ao baixar ${safeName}: ${fileRes.status}`);
          documents.push({ id: docId, blob_url: "", filename: safeName, doc_type: docType, size_bytes: 0, status: "download_failed" });
          continue;
        }
        const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
        const blobPath = `goalfy/webhook/${cardId}/${safeName}`;
        const { url: blobUrl } = await put(blobPath, fileBuffer, {
          access: "public",
          contentType: fileRes.headers.get("content-type") || "application/octet-stream",
        });
        documents.push({ id: docId, blob_url: blobUrl, filename: safeName, doc_type: docType, size_bytes: fileBuffer.length, status: "uploaded" });
      } catch (err) {
        console.warn(`[goalfy/webhook] erro ao processar ${safeName}:`, err);
        documents.push({ id: docId, blob_url: url, filename: safeName, doc_type: docType, size_bytes: 0, status: "pending_download" });
      }
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("goalfy_pending_operations")
    .upsert(
      {
        goalfy_card_id: cardId,
        company_name:   razao,
        cnpj:           cnpj || null,
        manager_name:   gerente,
        documents,
        raw_payload:    { ...body, _fase: phase, _source: "webhook" },
        status:         "pending",
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "goalfy_card_id" }
    );

  if (error) {
    console.error("[goalfy/webhook] supabase:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    card_id: cardId,
    documents_received: documents.length,
    documents_uploaded: documents.filter(d => d.status === "uploaded").length,
  });
}
