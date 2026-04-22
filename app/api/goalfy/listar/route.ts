export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/supabase/server";

export interface GoalfyDocument {
  id: string;
  filename: string;
  type: string;
  url: string;
  size_bytes?: number;
}

export interface GoalfyOperation {
  id: string;
  company_name: string;
  cnpj: string;
  manager_name: string;
  created_at: string;
  document_count: number;
  documents: GoalfyDocument[];
}

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Buscar operações recebidas via webhook push da Goalfy
    const { data: rows, error } = await supabase
      .from("goalfy_pending_operations")
      .select("id, goalfy_card_id, company_name, cnpj, manager_name, documents, status, collection_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // Tabela ainda não criada — retornar lista vazia com aviso
      if (error.code === "42P01") {
        return Response.json({
          operations: [],
          mock: false,
          setup_required: true,
          message: "Execute a migration 16_goalfy_pending_operations.sql no Supabase para ativar o receptor.",
        });
      }
      throw error;
    }

    const operations = (rows || []).map(row => {
      const docs: GoalfyDocument[] = (row.documents || []).map((d: Record<string, string>) => ({
        id:         d.id || d.blob_url || String(Math.random()),
        filename:   d.filename || "documento.pdf",
        type:       d.doc_type || d.type || "outro",
        url:        d.blob_url || d.url || "",
        size_bytes: Number(d.size_bytes) || 0,
      }));

      return {
        id:             row.goalfy_card_id,
        company_name:   row.company_name,
        cnpj:           row.cnpj ? row.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "",
        manager_name:   row.manager_name || "",
        created_at:     row.created_at,
        document_count: docs.length,
        documents:      docs,
        already_imported: row.status === "imported" || !!row.collection_id,
        _internal_id:   row.id,
      };
    });

    return Response.json({ operations, mock: false });

  } catch (error) {
    console.error("[goalfy/listar]", error);
    return Response.json({ error: "Erro ao listar operações Goalfy" }, { status: 500 });
  }
}
