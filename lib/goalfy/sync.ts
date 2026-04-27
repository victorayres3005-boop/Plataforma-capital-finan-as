import { createClient } from "@supabase/supabase-js";

const GOALFY_BASE_URL    = process.env.GOALFY_BASE_URL    || "https://api.goalfy.com.br";
const GOALFY_API_KEY     = process.env.GOALFY_API_KEY     || "";
const GOALFY_STORAGE_URL = process.env.GOALFY_STORAGE_URL || ""; // TODO: confirmar URL base com Goalfy
const BOARD_ID           = process.env.GOALFY_BOARD_ID    || "38e78384-2a7d-49a2-9127-3b65ecb4e97f";

interface GoalfyField {
  fieldType: string;
  title: string;
  value: string | string[];
  valueTitle?: string;
}

interface GoalfyCard {
  cardId?: string;
  id?: string;
  createdAt: string;
  createdBy?: { username?: string; email?: string };
  form?: { fields: GoalfyField[] };
  phase?: { id: string; title: string };
}

const DOC_TYPE_MAP: Record<string, string> = {
  "última alteração contratual":       "contrato_social",
  "contrato social":                   "contrato_social",
  "faturamento dos últimos 12m":       "faturamento",
  "faturamento":                       "faturamento",
  "relatório de visitas":              "relatorio_visita",
  "relatorio de visitas":              "relatorio_visita",
  "credithub":                         "scr",
  "scr":                               "scr",
  "dre":                               "dre",
  "balanço":                           "balanco",
  "balanco":                           "balanco",
  "curva abc":                         "curva_abc",
  "docs de identificação dos sócios":  "qsa",
  "qsa":                               "qsa",
  "ir dos sócios":                     "ir_socio",
  "ir socio":                          "ir_socio",
};

function mapDocType(title: string): string {
  return DOC_TYPE_MAP[title.toLowerCase().trim()] || "outro";
}

function extractField(fields: GoalfyField[], title: string): string {
  return String(fields.find(f => f.title === title)?.value || "");
}

function parseAttachments(fields: GoalfyField[], cardId: string) {
  const docs: { id: string; blob_url: string; filename: string; doc_type: string; size_bytes: number; status: string }[] = [];

  fields.filter(f => f.fieldType === "attachment").forEach((f, fi) => {
    const paths: string[] = Array.isArray(f.value)
      ? f.value.filter((p): p is string => typeof p === "string" && !!p.trim())
      : typeof f.value === "string" && f.value.trim()
        ? [f.value]
        : [];

    paths.forEach((p, pi) => {
      const filename = p.split("/").pop() || `doc_${fi}_${pi}.pdf`;
      const blobUrl  = GOALFY_STORAGE_URL ? `${GOALFY_STORAGE_URL}/${p}` : "";
      docs.push({
        id:         `${cardId}-${fi}-${pi}`,
        blob_url:   blobUrl,
        filename,
        doc_type:   mapDocType(f.title),
        size_bytes: 0,
        status:     blobUrl ? "pending_download" : "pending_url",
      });
    });
  });

  return docs;
}

export async function syncGoalfyCards(): Promise<{ synced: number; total: number; error?: string }> {
  if (!GOALFY_API_KEY) return { synced: 0, total: 0, error: "GOALFY_API_KEY não configurado" };

  const res = await fetch(`${GOALFY_BASE_URL}/api/cards/board/${BOARD_ID}`, {
    headers: { "Authorization": `Token ${GOALFY_API_KEY}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.text();
    return { synced: 0, total: 0, error: `Goalfy API ${res.status}: ${err.slice(0, 200)}` };
  }

  const cards: GoalfyCard[] = await res.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const rows = cards.map(card => {
    const cardId    = card.cardId || card.id || "";
    const fields    = card.form?.fields || [];
    const razao     = extractField(fields, "Razão Social") || extractField(fields, "Razão social");
    const cnpj      = extractField(fields, "CNPJ").replace(/\D/g, "");
    const gerente   = extractField(fields, "Gerente de Vendas") || extractField(fields, "Gerente") || card.createdBy?.username || "";
    const documents = parseAttachments(fields, cardId);
    const fase      = card.phase?.title || "";

    return {
      goalfy_card_id: cardId,
      company_name:   razao || "Empresa não identificada",
      cnpj:           cnpj || null,
      manager_name:   gerente,
      documents,
      raw_payload:    { ...card, _fase: fase }, // fase armazenada dentro do raw_payload
      status:         "pending",
      created_at:     card.createdAt,
    };
  });

  const { error } = await supabase
    .from("goalfy_pending_operations")
    .upsert(rows, { onConflict: "goalfy_card_id", ignoreDuplicates: true });

  if (error) return { synced: 0, total: cards.length, error: error.message };

  return { synced: rows.length, total: cards.length };
}
