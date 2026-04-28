export const runtime = "nodejs";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { put } from "@vercel/blob";

const WEBHOOK_SECRET = process.env.GOALFY_WEBHOOK_SECRET || "";

// ── Mapa de nome de campo → tipo de documento ────────────────────────────────
const DOC_TYPE_MAP: Record<string, string> = {
  "última alteração contratual": "contrato_social",
  "contrato social":             "contrato_social",
  "contrato":                    "contrato_social",
  "faturamento dos últimos 12m": "faturamento",
  "faturamento":                 "faturamento",
  "extrato":                     "faturamento",
  "relatório de visitas":        "relatorio_visita",
  "relatorio de visitas":        "relatorio_visita",
  "visita":                      "relatorio_visita",
  "credithub":                   "scr",
  "scr":                         "scr",
  "dre":                         "dre",
  "balanço":                     "balanco",
  "balanco":                     "balanco",
  "balancete":                   "balanco",
  "curva abc":                   "curva_abc",
  "curva_abc":                   "curva_abc",
  "docs de identificação dos sócios": "qsa",
  "qsa":                         "qsa",
  "ir dos sócios":               "ir_socio",
  "ir socio":                    "ir_socio",
  "imposto de renda":            "ir_socio",
};

function mapDocType(name: string): string {
  return DOC_TYPE_MAP[name.toLowerCase().trim()] || "outro";
}

function isUrl(v: unknown): v is string {
  return typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"));
}

// ── Extrai todos os documentos do payload, independente do formato ────────────
// Suporta:
//   1. Campo com URL direta:          { "contrato social": "https://..." }
//   2. Array de URLs:                 { "documentos": ["https://...", "https://..."] }
//   3. Array de objetos com url/link: { "anexos": [{ "nome": "doc.pdf", "url": "https://..." }] }
//   4. Campo "link" ou "url" único:   { "link": "https://..." }
//   5. "fields" como array de pares:  { "fields": [{ "name": "DRE", "value": "https://..." }] }
interface RawDoc { title: string; url: string }

function extractDocuments(body: Record<string, unknown>): RawDoc[] {
  const docs: RawDoc[] = [];
  const TEXT_FIELDS = new Set([
    "cardId","id","card_id","cardid","razao_social","razaoSocial","Razão Social",
    "Razão social","company_name","empresa","CNPJ","cnpj","gerente","Gerente",
    "Gerente de Vendas","manager","manager_name","phase","fase","faseAtual",
    "faseNome","createdAt","created_at","updated_at","status","titulo","title",
    "secret","token",
  ]);

  for (const [key, value] of Object.entries(body)) {
    if (TEXT_FIELDS.has(key)) continue;

    // Padrão 1: valor direto é URL
    if (isUrl(value)) {
      docs.push({ title: key, url: value });
      continue;
    }

    // Padrão 2: valor é array
    if (Array.isArray(value)) {
      for (const item of value) {
        // Array de URLs simples
        if (isUrl(item)) {
          docs.push({ title: key, url: item });
          continue;
        }
        // Array de objetos com campo url/link/download_url
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const url = obj.url ?? obj.link ?? obj.download_url ?? obj.downloadUrl ?? obj.file_url ?? obj.fileUrl;
          if (isUrl(url)) {
            const name = String(obj.name ?? obj.nome ?? obj.filename ?? obj.title ?? obj.tipo ?? key);
            docs.push({ title: name, url: url as string });
          }
        }
      }
      continue;
    }

    // Padrão 3: valor é objeto com campo url/link
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;

      // Se for { "fields": [...] } com pares nome/valor
      if (key === "fields" && Array.isArray(obj)) continue; // tratado como array acima

      const url = obj.url ?? obj.link ?? obj.download_url ?? obj.downloadUrl ?? obj.file_url;
      if (isUrl(url)) {
        const name = String(obj.name ?? obj.nome ?? obj.filename ?? obj.title ?? key);
        docs.push({ title: name, url: url as string });
      }
    }
  }

  // Padrão 4: campo raiz "link" ou "url" único (fallback)
  const rootUrl = body.link ?? body.url ?? body.file ?? body.arquivo;
  if (isUrl(rootUrl) && !docs.some(d => d.url === rootUrl)) {
    docs.push({ title: "documento", url: rootUrl as string });
  }

  // Padrão 5: campo "fields" como array de objetos { name, value }
  const fields = body.fields ?? body.campos;
  if (Array.isArray(fields)) {
    for (const f of fields) {
      if (!f || typeof f !== "object") continue;
      const obj = f as Record<string, unknown>;
      const fieldVal = obj.value ?? obj.valor;
      if (isUrl(fieldVal) && !docs.some(d => d.url === fieldVal)) {
        const name = String(obj.name ?? obj.nome ?? obj.label ?? "documento");
        docs.push({ title: name, url: fieldVal as string });
      }
    }
  }

  return docs;
}

// ── Extrai metadados do card (nome, cnpj, gerente) ───────────────────────────
function extractMeta(body: Record<string, unknown>) {
  const razao = String(
    body["Razão Social"] ?? body["Razão social"] ?? body.razaoSocial ??
    body.razao_social ?? body.company_name ?? body.empresa ?? body.titulo ??
    body.title ?? "Empresa não identificada"
  );
  const cnpj = String(
    body.CNPJ ?? body.cnpj ?? body.documento ?? ""
  ).replace(/\D/g, "");
  const gerente = String(
    body["Gerente de Vendas"] ?? body.Gerente ?? body.gerente ??
    body.manager ?? body.manager_name ?? ""
  );
  const cardId = String(
    body.cardId ?? body.id ?? body.card_id ?? body.cardid ?? crypto.randomUUID()
  );
  return { razao, cnpj, gerente, cardId };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // Autenticação opcional via secret
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

  console.log("[goalfy/webhook] payload recebido — chaves:", Object.keys(body).join(", "));
  console.log("[goalfy/webhook] payload completo:", JSON.stringify(body).slice(0, 800));

  const { razao, cnpj, gerente, cardId } = extractMeta(body);
  const rawDocs = extractDocuments(body);

  console.log(`[goalfy/webhook] empresa="${razao}" cnpj="${cnpj}" docs encontrados: ${rawDocs.length}`);
  rawDocs.forEach((d, i) => console.log(`  [${i}] title="${d.title}" url=${d.url.slice(0, 80)}`));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Baixa cada arquivo e re-sobe no Vercel Blob ──────────────────────────
  const documents: {
    id: string; blob_url: string; filename: string;
    doc_type: string; size_bytes: number; status: string;
  }[] = [];

  for (let i = 0; i < rawDocs.length; i++) {
    const { title, url } = rawDocs[i];
    const docId   = `${cardId}-${i}`;
    const docType = mapDocType(title);
    const rawName = decodeURIComponent(url.split("/").pop()?.split("?")[0] || `doc_${i}.pdf`);
    const safeName = rawName.replace(/[^a-zA-Z0-9.\-_]/g, "_") || `doc_${docId}.pdf`;

    try {
      const fileRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!fileRes.ok) {
        console.warn(`[goalfy/webhook] falha ao baixar "${safeName}": ${fileRes.status}`);
        documents.push({ id: docId, blob_url: url, filename: safeName, doc_type: docType, size_bytes: 0, status: "download_failed" });
        continue;
      }
      const buf = Buffer.from(await fileRes.arrayBuffer());
      const blobPath = `goalfy/webhook/${cardId}/${safeName}`;
      const { url: blobUrl } = await put(blobPath, buf, {
        access: "public",
        contentType: fileRes.headers.get("content-type") || "application/octet-stream",
      });
      console.log(`[goalfy/webhook] ✓ "${safeName}" (${docType}) → ${blobUrl.slice(0, 60)}`);
      documents.push({ id: docId, blob_url: blobUrl, filename: safeName, doc_type: docType, size_bytes: buf.length, status: "uploaded" });
    } catch (err) {
      console.warn(`[goalfy/webhook] erro ao processar "${safeName}":`, String(err));
      documents.push({ id: docId, blob_url: url, filename: safeName, doc_type: docType, size_bytes: 0, status: "pending_download" });
    }
  }

  // ── Salva em goalfy_pending_operations ───────────────────────────────────
  const { error } = await supabase
    .from("goalfy_pending_operations")
    .upsert(
      {
        goalfy_card_id: cardId,
        company_name:   razao,
        cnpj:           cnpj || null,
        manager_name:   gerente,
        documents,
        raw_payload:    { ...body, _source: "webhook" },
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
    card_id:             cardId,
    empresa:             razao,
    documents_received:  rawDocs.length,
    documents_uploaded:  documents.filter(d => d.status === "uploaded").length,
    documents_failed:    documents.filter(d => d.status !== "uploaded").length,
  });
}
