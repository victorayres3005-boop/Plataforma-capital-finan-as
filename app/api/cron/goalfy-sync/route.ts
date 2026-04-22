export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const GOALFY_BASE_URL = process.env.GOALFY_BASE_URL || "https://api.goalfy.com.br";
const GOALFY_API_KEY  = process.env.GOALFY_API_KEY  || "";
// Board "Análise de Crédito" — ID fixo descoberto via API
const BOARD_ID = process.env.GOALFY_BOARD_ID || "38e78384-2a7d-49a2-9127-3b65ecb4e97f";

// Vercel chama o cron com este header para autenticar
const CRON_SECRET = process.env.CRON_SECRET || "";

interface GoalfyField {
  fieldType: string;
  title: string;
  value: string;
  valueTitle?: string;
}

interface GoalfyCard {
  cardId?: string;
  id?: string;
  createdAt: string;
  createdBy?: { username?: string; email?: string };
  form?: { fields: GoalfyField[] };
}

function extractField(fields: GoalfyField[], title: string) {
  return fields.find(f => f.title === title)?.value || "";
}

export async function GET(req: Request) {
  // Verificar autorização do cron (Vercel injeta o header automaticamente)
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!GOALFY_API_KEY) {
    return Response.json({ error: "GOALFY_API_KEY não configurado" }, { status: 500 });
  }

  try {
    // 1. Buscar cards do board "Análise de Crédito" na Goalfy
    const res = await fetch(`${GOALFY_BASE_URL}/api/cards/board/${BOARD_ID}`, {
      headers: { "Authorization": `Token ${GOALFY_API_KEY}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[goalfy-sync] erro na API Goalfy:", res.status, err);
      return Response.json({ error: `Goalfy API error: ${res.status}` }, { status: 502 });
    }

    const cards: GoalfyCard[] = await res.json();

    // 2. Filtrar cards das últimas 48h para não reprocessar tudo sempre
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recent = cards.filter(c => c.createdAt >= cutoff);

    if (recent.length === 0) {
      return Response.json({ synced: 0, message: "Sem novos cards nas últimas 48h" });
    }

    // 3. Upsert no Supabase (goalfy_card_id é unique — sem duplicatas)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const rows = recent.map(card => {
      const cardId = card.cardId || card.id || "";
      const fields: GoalfyField[] = card.form?.fields || [];

      const razaoSocial = extractField(fields, "Razão Social") || extractField(fields, "Razão social");
      const cnpj        = extractField(fields, "CNPJ").replace(/\D/g, "");
      const gerente     = extractField(fields, "Gerente de Vendas") || card.createdBy?.username || "";

      // Campos de anexo com valores preenchidos
      const attachmentFields = fields.filter(f => f.fieldType === "attachment" && f.value);
      const documents = attachmentFields.map((f, i) => ({
        id:        `${cardId}-att-${i}`,
        blob_url:  f.value,
        filename:  `${f.title}.pdf`,
        doc_type:  f.title.toLowerCase().replace(/\s+/g, "_"),
        size_bytes: 0,
        status:    f.value ? "pending_download" : "no_url",
      }));

      return {
        goalfy_card_id: cardId,
        company_name:   razaoSocial || "Empresa não identificada",
        cnpj:           cnpj || null,
        manager_name:   gerente,
        documents,
        raw_payload:    card,
        status:         "pending",
        created_at:     card.createdAt,
      };
    });

    const { error } = await supabase
      .from("goalfy_pending_operations")
      .upsert(rows, { onConflict: "goalfy_card_id", ignoreDuplicates: true });

    if (error) {
      console.error("[goalfy-sync] supabase upsert:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log(`[goalfy-sync] sincronizados ${rows.length} cards`);
    return Response.json({ synced: rows.length, total_checked: cards.length });

  } catch (err) {
    console.error("[goalfy-sync]", err);
    return Response.json({ error: "Erro interno" }, { status: 500 });
  }
}
