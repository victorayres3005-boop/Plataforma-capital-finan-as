export const runtime  = "nodejs";
export const maxDuration = 60;

import { createServerSupabase } from "@/lib/supabase/server";
import { put } from "@vercel/blob";
import type { GoalfyOperation } from "../listar/route";

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { operation: GoalfyOperation };
    const { operation } = body;
    if (!operation?.id) return Response.json({ error: "operation.id obrigatório" }, { status: 400 });

    const goalfyApiKey = process.env.GOALFY_API_KEY || "";

    // ─── Passo 1: obter detalhes da operação (e URLs de download) ─────────────
    // Se a lista já veio com os documentos preenchidos, usamos direto.
    // Caso a API retorne apenas IDs e seja necessário um segundo GET, implemente abaixo.
    //
    // TODO: Se precisar buscar detalhes extras:
    // const detailRes = await fetch(`${GOALFY_BASE_URL}/operations/${operation.id}`, {
    //   headers: { "Authorization": `Bearer ${GOALFY_API_KEY}` },
    // });
    // const detail = await detailRes.json();
    // const documents = detail.documents; // ajustar conforme schema real
    const documents = operation.documents;

    // ─── Passo 2: baixar e fazer re-upload para Vercel Blob ──────────────────
    const uploadedDocs: {
      id: string;
      blob_url: string;
      filename: string;
      doc_type: string;
      size_bytes: number;
      status: string;
    }[] = [];

    for (const doc of documents) {
      // Validar URL completa antes de tentar fetch
      const urlStr = typeof doc.url === "string" ? doc.url : "";
      const isValidUrl = urlStr.startsWith("http://") || urlStr.startsWith("https://");

      if (!isValidUrl) {
        uploadedDocs.push({
          id: doc.id,
          blob_url: "",
          filename: doc.filename,
          doc_type: doc.type,
          size_bytes: doc.size_bytes ?? 0,
          status: "pending_upload",
        });
        continue;
      }

      try {
        // Arquivo da Goalfy: POST /api/files/download com { filePath, filename }
        // Se a URL já for http completa, faz GET direto; caso contrário usa o endpoint da Goalfy
        const isFullUrl = urlStr.startsWith("http://") || urlStr.startsWith("https://");
        const GOALFY_BASE = process.env.GOALFY_BASE_URL || "https://api.goalfy.com.br";
        const fileRes = isFullUrl
          ? await fetch(urlStr, { headers: goalfyApiKey ? { "Authorization": `Token ${goalfyApiKey}` } : {} })
          : await fetch(`${GOALFY_BASE}/api/files/download`, {
              method: "POST",
              headers: {
                "Authorization": `Token ${goalfyApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ filePath: urlStr, filename: doc.filename }),
            });

        if (!fileRes.ok) {
          console.warn(`[goalfy/importar] falha ao baixar ${doc.filename}: ${fileRes.status}`);
          uploadedDocs.push({ id: doc.id, blob_url: "", filename: doc.filename, doc_type: doc.type, size_bytes: 0, status: "download_failed" });
          continue;
        }

        const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
        const safeName   = doc.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const blobPath   = `goalfy/${user.id}/${operation.id}/${safeName}`;

        const { url: blobUrl } = await put(blobPath, fileBuffer, {
          access: "public",
          contentType: fileRes.headers.get("content-type") || "application/pdf",
        });

        uploadedDocs.push({ id: doc.id, blob_url: blobUrl, filename: doc.filename, doc_type: doc.type, size_bytes: fileBuffer.length, status: "uploaded" });
      } catch (downloadErr) {
        console.warn(`[goalfy/importar] erro ao processar ${doc.filename}:`, downloadErr);
        uploadedDocs.push({ id: doc.id, blob_url: "", filename: doc.filename, doc_type: doc.type, size_bytes: 0, status: "pending_upload" });
      }
    }

    // ─── Passo 3: criar document_collection no Supabase ──────────────────────
    const cnpjClean = (operation.cnpj || "").replace(/\D/g, "");

    const { data: collection, error: insertError } = await supabase
      .from("document_collections")
      .insert({
        user_id:      user.id,
        company_name: operation.company_name,
        cnpj:         cnpjClean || null,
        label:        operation.company_name,
        status:       "in_progress",
        documents:    uploadedDocs.map(d => ({
          id:        d.id,
          blob_url:  d.blob_url,
          filename:  d.filename,
          doc_type:  d.doc_type,
          size_bytes:d.size_bytes,
          status:    d.status,
        })),
        ai_analysis: {
          goalfy_operation_id: operation.id,
          goalfy_manager:      operation.manager_name,
          goalfy_imported_at:  new Date().toISOString(),
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[goalfy/importar] supabase insert:", insertError);
      return Response.json({ error: "Erro ao criar coleta no banco" }, { status: 500 });
    }

    // ─── Passo 4: marcar operação como importada na tabela goalfy_pending_operations
    if (operation.id) {
      await supabase
        .from("goalfy_pending_operations")
        .update({ status: "imported", collection_id: collection.id, updated_at: new Date().toISOString() })
        .eq("goalfy_card_id", operation.id)
        .maybeSingle();
    }

    return Response.json({
      success: true,
      collection_id: collection.id,
      documents_imported: uploadedDocs.filter(d => d.status === "uploaded").length,
      documents_total:    documents.length,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[goalfy/importar]", msg);
    return Response.json({ error: `Erro ao importar: ${msg}` }, { status: 500 });
  }
}
