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

// Endpoint público — Goalfy faz POST aqui via automação quando um card é criado.
// Auth opcional via query string: /api/goalfy/receber?secret=SEU_SECRET
//
// Comportamento (atualizado 2026-05-06):
// 1) Aceita 5 formatos de payload (ver webhookParser.extractDocuments)
// 2) Para cada URL recebida, BAIXA o arquivo imediatamente e re-sobe pro
//    Vercel Blob — antes só guardava a URL crua, e URLs S3 presignadas
//    expiravam antes do clique em "Importar".
// 3) Idempotente: upsert por goalfy_card_id.
// 4) Retorna 200 mesmo em erro interno para Goalfy não retentar
//    indefinidamente.
const WEBHOOK_SECRET = process.env.GOALFY_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
  try {
    if (WEBHOOK_SECRET) {
      const { searchParams } = new URL(req.url);
      if (searchParams.get("secret") !== WEBHOOK_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.warn("[goalfy/receber] GOALFY_WEBHOOK_SECRET não configurado — webhook está ABERTO. Configure pra evitar abuso.");
    }

    const body = await req.json().catch(() => ({}));

    console.log("[goalfy/receber] payload — chaves:", Object.keys(body).join(", "));
    console.log("[goalfy/receber] payload completo:", JSON.stringify(body).slice(0, 800));

    const meta = extractMeta(body);
    const cardId = meta.cardId || crypto.randomUUID();
    const rawDocs = extractDocuments(body);

    console.log(`[goalfy/receber] empresa="${meta.razao}" cnpj="${meta.cnpj}" docs encontrados: ${rawDocs.length}`);
    rawDocs.forEach((d, i) => console.log(`  [${i}] title="${d.title}" url=${d.url.slice(0, 80)}`));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // ── Baixa cada arquivo e re-sobe no Vercel Blob ──────────────────────────
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
          console.warn(`[goalfy/receber] falha ao baixar "${safeName}": ${fileRes.status}`);
          documents.push({ id: docId, blob_url: url, filename: safeName, doc_type: docType, size_bytes: 0, status: "download_failed" });
          continue;
        }
        const buf = Buffer.from(await fileRes.arrayBuffer());
        const blobPath = `goalfy/receber/${cardId}/${safeName}`;
        const { url: blobUrl } = await put(blobPath, buf, {
          access: "public",
          contentType: fileRes.headers.get("content-type") || "application/octet-stream",
        });
        console.log(`[goalfy/receber] ✓ "${safeName}" (${docType}) → ${blobUrl.slice(0, 60)}`);
        documents.push({ id: docId, blob_url: blobUrl, filename: safeName, doc_type: docType, size_bytes: buf.length, status: "uploaded" });
      } catch (err) {
        console.warn(`[goalfy/receber] erro ao processar "${safeName}":`, String(err));
        documents.push({ id: docId, blob_url: url, filename: safeName, doc_type: docType, size_bytes: 0, status: "pending_download" });
      }
    }

    const { error } = await supabase.from("goalfy_pending_operations").upsert(
      {
        goalfy_card_id: cardId,
        company_name:   meta.razao,
        cnpj:           meta.cnpj || null,
        manager_name:   meta.gerente,
        phone:          meta.phone || null,
        email:          meta.email || null,
        notes:          meta.notes || null,
        documents,
        raw_payload:    { ...body, _source: "receber" },
        status:         "pending",
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "goalfy_card_id" },
    );

    if (error) {
      console.error("[goalfy/receber] supabase upsert:", error.message);
      // Continua retornando 200 — Goalfy não deve retentar
    }

    return Response.json({
      received: true,
      card_id: cardId,
      empresa: meta.razao,
      documents_received: rawDocs.length,
      documents_uploaded: documents.filter(d => d.status === "uploaded").length,
      documents_failed: documents.filter(d => d.status !== "uploaded").length,
    });
  } catch (err) {
    console.error("[goalfy/receber]", err);
    return Response.json({ received: true, warning: "Erro interno ao processar" });
  }
}

// GET para verificar se o endpoint está ativo (útil para testes na Goalfy)
export async function GET() {
  return Response.json({
    status: "ok",
    endpoint: "Capital Finanças — receptor Goalfy",
    protected: !!WEBHOOK_SECRET,
  });
}
