export const runtime = "nodejs";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { put } from "@vercel/blob";
import {
  extractDocuments,
  extractMeta,
  mapDocType,
  safeFilenameFromUrl,
} from "@/lib/goalfy/webhookParser";

// ⚠️ DEPRECATED — use /api/goalfy/receber em automações novas do Goalfy.
// Este endpoint continua funcional para automações antigas que apontavam aqui.
// Lógica idêntica à de /receber, exceto auth (header em vez de query string).

const WEBHOOK_SECRET = process.env.GOALFY_WEBHOOK_SECRET || "";

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

  console.log("[goalfy/webhook] (deprecated) payload — chaves:", Object.keys(body).join(", "));

  const meta = extractMeta(body);
  const cardId = meta.cardId || crypto.randomUUID();
  const rawDocs = extractDocuments(body);

  console.log(`[goalfy/webhook] empresa="${meta.razao}" cnpj="${meta.cnpj}" docs encontrados: ${rawDocs.length}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const documents: {
    id: string; blob_url: string; filename: string;
    doc_type: string; size_bytes: number; status: string;
  }[] = [];

  for (let i = 0; i < rawDocs.length; i++) {
    const { title, url } = rawDocs[i];
    const docId = `${cardId}-${i}`;
    const docType = mapDocType(title);
    const safeName = safeFilenameFromUrl(url, `doc_${docId}.pdf`);

    try {
      const fileRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!fileRes.ok) {
        documents.push({ id: docId, blob_url: url, filename: safeName, doc_type: docType, size_bytes: 0, status: "download_failed" });
        continue;
      }
      const buf = Buffer.from(await fileRes.arrayBuffer());
      const blobPath = `goalfy/webhook/${cardId}/${safeName}`;
      const { url: blobUrl } = await put(blobPath, buf, {
        access: "public",
        contentType: fileRes.headers.get("content-type") || "application/octet-stream",
      });
      documents.push({ id: docId, blob_url: blobUrl, filename: safeName, doc_type: docType, size_bytes: buf.length, status: "uploaded" });
    } catch {
      documents.push({ id: docId, blob_url: url, filename: safeName, doc_type: docType, size_bytes: 0, status: "pending_download" });
    }
  }

  const { error } = await supabase
    .from("goalfy_pending_operations")
    .upsert(
      {
        goalfy_card_id: cardId,
        company_name:   meta.razao,
        cnpj:           meta.cnpj || null,
        manager_name:   meta.gerente,
        documents,
        raw_payload:    { ...body, _source: "webhook" },
        status:         "pending",
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "goalfy_card_id" },
    );

  if (error) {
    console.error("[goalfy/webhook] supabase:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    card_id:             cardId,
    empresa:             meta.razao,
    documents_received:  rawDocs.length,
    documents_uploaded:  documents.filter(d => d.status === "uploaded").length,
    documents_failed:    documents.filter(d => d.status !== "uploaded").length,
  });
}
