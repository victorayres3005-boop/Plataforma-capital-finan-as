export const runtime  = "nodejs";
export const maxDuration = 60;

import { createServerSupabase } from "@/lib/supabase/server";
import { put } from "@vercel/blob";
import type { GoalfyOperation } from "../listar/route";
import { toCollectionType } from "@/lib/goalfy/webhookParser";

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

    const GOALFY_BASE = process.env.GOALFY_BASE_URL || "https://api.goalfy.com.br";

    for (const doc of documents) {
      const urlStr   = typeof doc.url === "string" ? doc.url.trim() : "";
      const isHttp   = urlStr.startsWith("http://") || urlStr.startsWith("https://");
      // Sem URL alguma e sem path interno → não há o que baixar
      if (!urlStr) {
        uploadedDocs.push({
          id: doc.id,
          blob_url: "",
          filename: doc.filename,
          doc_type: doc.type,
          size_bytes: doc.size_bytes ?? 0,
          status: "no_url",
        });
        continue;
      }

      try {
        // Dois caminhos de download:
        //   (1) URL HTTP completa (ex.: presigned S3 da Goalfy ou link público) → GET direto
        //   (2) Caminho interno (ex.: "uuid/arquivo.pdf") → POST /api/files/download autenticado.
        //       Reabilitado em 2026-05-05: antes a guarda early-return matava esse fluxo.
        let fileRes: Response;
        if (isHttp) {
          fileRes = await fetch(urlStr, {
            headers: goalfyApiKey ? { Authorization: `Token ${goalfyApiKey}` } : {},
          });
          console.log(`[goalfy/importar] GET direto ${doc.filename} → ${fileRes.status}`);
        } else {
          if (!goalfyApiKey) {
            console.warn(`[goalfy/importar] sem GOALFY_API_KEY → não consegue baixar caminho interno "${urlStr}"`);
            uploadedDocs.push({ id: doc.id, blob_url: "", filename: doc.filename, doc_type: doc.type, size_bytes: 0, status: "no_api_key" });
            continue;
          }
          fileRes = await fetch(`${GOALFY_BASE}/api/files/download`, {
            method: "POST",
            headers: {
              Authorization: `Token ${goalfyApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ filePath: urlStr, filename: doc.filename }),
          });
          console.log(`[goalfy/importar] POST /api/files/download ${doc.filename} (filePath=${urlStr}) → ${fileRes.status}`);
        }

        if (!fileRes.ok) {
          const errBody = await fileRes.text().catch(() => "");
          console.warn(`[goalfy/importar] falha ao baixar ${doc.filename} via ${isHttp ? "GET" : "API"}: ${fileRes.status} ${errBody.slice(0, 200)}`);
          uploadedDocs.push({
            id: doc.id,
            blob_url: "",
            filename: doc.filename,
            doc_type: doc.type,
            size_bytes: 0,
            status: `download_failed_${fileRes.status}`,
          });
          continue;
        }

        const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
        if (fileBuffer.length < 100) {
          // Resposta minúscula provavelmente é JSON de erro disfarçado
          console.warn(`[goalfy/importar] ${doc.filename} retornou ${fileBuffer.length} bytes — provável erro disfarçado`);
          uploadedDocs.push({ id: doc.id, blob_url: "", filename: doc.filename, doc_type: doc.type, size_bytes: fileBuffer.length, status: "download_empty" });
          continue;
        }

        const safeName = doc.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const blobPath = `goalfy/${user.id}/${operation.id}/${safeName}`;

        const { url: blobUrl } = await put(blobPath, fileBuffer, {
          access: "public",
          contentType: fileRes.headers.get("content-type") || "application/pdf",
        });

        uploadedDocs.push({ id: doc.id, blob_url: blobUrl, filename: doc.filename, doc_type: doc.type, size_bytes: fileBuffer.length, status: "uploaded" });
      } catch (downloadErr) {
        const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
        console.warn(`[goalfy/importar] erro ao processar ${doc.filename}:`, msg);
        uploadedDocs.push({ id: doc.id, blob_url: "", filename: doc.filename, doc_type: doc.type, size_bytes: 0, status: "exception" });
      }
    }

    // ─── Passo 3: criar document_collection no Supabase ──────────────────────
    const cnpjClean = (operation.cnpj || "").replace(/\D/g, "");

    // Shape canônico esperado por hydrateFromCollection / UploadStep:
    // - campo `type` (não `doc_type`)
    // - `extracted_data: {}` vazio (será preenchido na revisão pelo /api/extract
    //   quando o usuário disparar a extração no UploadStep)
    // - tipo do parser ("scr") mapeado pro canônico de CollectionDocument ("scr_bacen")
    // Filtra apenas docs que efetivamente foram baixados — docs com status de erro
    // entram como "outro" e seriam invisíveis no UploadStep.
    const collectionDocs = uploadedDocs
      .filter(d => d.status === "uploaded" && d.blob_url)
      .map(d => ({
        id:             d.id,
        type:           toCollectionType(d.doc_type),
        filename:       d.filename,
        blob_url:       d.blob_url,
        size_bytes:     d.size_bytes,
        status:         d.status,
        extracted_data: {},
      }));

    const { data: collection, error: insertError } = await supabase
      .from("document_collections")
      .insert({
        user_id:      user.id,
        company_name: operation.company_name,
        cnpj:         cnpjClean || null,
        label:        operation.company_name,
        status:       "in_progress",
        documents:    collectionDocs,
        ai_analysis: {
          goalfy_operation_id: operation.id,
          goalfy_manager:      operation.manager_name,
          goalfy_imported_at:  new Date().toISOString(),
          // Preserva docs que falharam download para auditoria/diagnóstico
          goalfy_failed_docs:  uploadedDocs.filter(d => d.status !== "uploaded").map(d => ({
            filename: d.filename, type: d.doc_type, status: d.status,
          })),
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
