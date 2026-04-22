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

    const GOALFY_BASE_URL = process.env.GOALFY_BASE_URL || "";
    // TODO: usar para autenticar os downloads quando a API real estiver configurada
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
      if (!doc.url) {
        // Mock: documeto sem URL real — criar entrada marcada como pendente
        // TODO: remover este bloco quando as URLs reais forem fornecidas.
        uploadedDocs.push({
          id: doc.id,
          blob_url: "",
          filename: doc.filename,
          doc_type: doc.type,
          size_bytes: doc.size_bytes ?? 0,
          status: "mock_no_url",
        });
        continue;
      }

      // Download do arquivo da Goalfy
      const headers: Record<string, string> = {};
      if (goalfyApiKey && GOALFY_BASE_URL && doc.url.includes(GOALFY_BASE_URL)) {
        headers["Authorization"] = `Bearer ${goalfyApiKey}`;
      }

      const fileRes = await fetch(doc.url, { headers });
      if (!fileRes.ok) {
        console.warn(`[goalfy/importar] falha ao baixar ${doc.filename}: ${fileRes.status}`);
        continue;
      }

      const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
      const safeName   = doc.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const blobPath   = `goalfy/${user.id}/${operation.id}/${safeName}`;

      const { url: blobUrl } = await put(blobPath, fileBuffer, {
        access: "public",
        contentType: fileRes.headers.get("content-type") || "application/pdf",
      });

      uploadedDocs.push({
        id: doc.id,
        blob_url: blobUrl,
        filename: doc.filename,
        doc_type: doc.type,
        size_bytes: fileBuffer.length,
        status: "uploaded",
      });
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
    console.error("[goalfy/importar]", error);
    return Response.json({ error: "Erro ao importar operação Goalfy" }, { status: 500 });
  }
}
