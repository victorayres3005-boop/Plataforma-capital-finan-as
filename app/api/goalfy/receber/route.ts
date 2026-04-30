export const runtime = "nodejs";

import { createClient } from "@supabase/supabase-js";

// Endpoint público — Goalfy faz POST aqui via automação quando um card é criado.
// Opcionalmente protegido por um secret na query string:
// Goalfy configura a URL como: /api/goalfy/receber?secret=SEU_SECRET
const WEBHOOK_SECRET = process.env.GOALFY_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
  try {
    // Fail-closed: sem GOALFY_WEBHOOK_SECRET configurado, ninguém posta (era aberto antes)
    if (!WEBHOOK_SECRET) {
      return Response.json({ error: "GOALFY_WEBHOOK_SECRET não configurado" }, { status: 503 });
    }
    const { searchParams } = new URL(req.url);
    if (searchParams.get("secret") !== WEBHOOK_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    // Extrair campos flexivelmente — o Goalfy envia os campos do formulário como JSON
    const cardId       = String(body.cardId       || body.card_id       || body.id              || crypto.randomUUID());
    const companyName  = String(body.razaoSocial   || body.empresa        || body.company_name    || body.nome || "Não informado");
    const cnpj         = String(body.cnpj          || body.CNPJ           || "").replace(/\D/g, "");
    const managerName  = String(body.gerente        || body.responsavel    || body.manager         || body.nome_gerente || "");
    const phone        = String(body.telefone       || body.phone          || "");
    const email        = String(body.email          || "");
    const notes        = String(body.observacoes    || body.obs            || body.notes           || "");

    // Documentos — Goalfy pode enviar como array de objetos ou URLs avulsas
    const rawDocs: { filename?: string; url?: string; type?: string; nome?: string }[] =
      Array.isArray(body.documentos)  ? body.documentos  :
      Array.isArray(body.documents)   ? body.documents   :
      Array.isArray(body.arquivos)    ? body.arquivos     :
      [];

    const documents = rawDocs.map((d, i) => ({
      id:        String(d.url || `goalfy-${cardId}-${i}`),
      blob_url:  String(d.url || ""),
      filename:  String(d.filename || d.nome || `documento_${i + 1}.pdf`),
      doc_type:  String(d.type || "outro"),
      size_bytes: 0,
      status:    d.url ? "pending_download" : "no_url",
    }));

    // Salvar no Supabase como operação pendente de importação
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.from("goalfy_pending_operations").insert({
      goalfy_card_id: cardId,
      company_name:   companyName,
      cnpj:           cnpj || null,
      manager_name:   managerName,
      phone,
      email,
      notes,
      documents,
      raw_payload:    body,
      status:         "pending",
    });

    if (error) {
      // Tabela pode ainda não existir — logar mas não falhar para Goalfy
      console.error("[goalfy/receber] supabase insert:", error.message);
    }

    // Goalfy espera 200 para confirmar recebimento
    return Response.json({ received: true, cardId });

  } catch (err) {
    console.error("[goalfy/receber]", err);
    // Retornar 200 mesmo assim para Goalfy não retentar indefinidamente
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
