/**
 * Parser de payload de webhook do Goalfy.
 *
 * Goalfy envia payloads em formatos diferentes dependendo de como a automação
 * está configurada. Este parser aceita 5 padrões e normaliza para a estrutura
 * que `app/api/goalfy/receber/route.ts` consome.
 *
 * Funções puras — ideais para teste unit.
 */

// Mapa de nome de campo (label do Goalfy) → tipo canônico de documento.
// Match estrito após `lowercase().trim()`. Para fazer fuzzy/normalize de acento,
// passar por `mapDocType()`, que já normaliza diacríticos.
export const DOC_TYPE_MAP: Record<string, string> = {
  "ultima alteracao contratual": "contrato_social",
  "última alteração contratual": "contrato_social",
  "contrato social":             "contrato_social",
  "contrato":                    "contrato_social",
  "faturamento dos ultimos 12m": "faturamento",
  "faturamento dos últimos 12m": "faturamento",
  "faturamento":                 "faturamento",
  "extrato":                     "faturamento",
  "relatorio de visitas":        "relatorio_visita",
  "relatório de visitas":        "relatorio_visita",
  "visita":                      "relatorio_visita",
  "credithub":                   "scr",
  "scr":                         "scr",
  "dre":                         "dre",
  "balanco":                     "balanco",
  "balanço":                     "balanco",
  "balancete":                   "balanco",
  "curva abc":                   "curva_abc",
  "curva_abc":                   "curva_abc",
  "docs de identificacao dos socios":  "qsa",
  "docs de identificação dos sócios":  "qsa",
  "qsa":                                "qsa",
  "ir dos socios":              "ir_socio",
  "ir dos sócios":              "ir_socio",
  "ir socio":                   "ir_socio",
  "imposto de renda":           "ir_socio",
};

/** Normaliza string lowercased + sem diacríticos (Á → a, ç → c). */
function normalizeKey(s: string): string {
  return s.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Mapeia label do Goalfy para tipo canônico, ou "outro" se não reconhecer. */
export function mapDocType(name: string): string {
  const direct = DOC_TYPE_MAP[name.toLowerCase().trim()];
  if (direct) return direct;
  // Tentativa com normalização de acentos (fallback resiliente)
  const normalized = normalizeKey(name);
  for (const [key, value] of Object.entries(DOC_TYPE_MAP)) {
    if (normalizeKey(key) === normalized) return value;
  }
  return "outro";
}

/** Aceita string como URL se começar com http:// ou https://. */
export function isUrl(v: unknown): v is string {
  return typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"));
}

export interface RawDoc { title: string; url: string }

/**
 * Extrai documentos de um payload Goalfy. Suporta 5 formatos:
 *  1. Campo com URL direta:          { "contrato social": "https://..." }
 *  2. Array de URLs:                 { "documentos": ["https://...", "https://..."] }
 *  3. Array de objetos com url/link: { "anexos": [{ "nome": "doc.pdf", "url": "..." }] }
 *  4. Campo "link" ou "url" único:   { "link": "https://..." }
 *  5. "fields" como array de pares:  { "fields": [{ "name": "DRE", "value": "https://..." }] }
 */
export function extractDocuments(body: Record<string, unknown>): RawDoc[] {
  const docs: RawDoc[] = [];
  // Campos textuais conhecidos — não tentar extrair URL deles
  const TEXT_FIELDS = new Set([
    "cardId","id","card_id","cardid","razao_social","razaoSocial","Razão Social",
    "Razão social","company_name","empresa","CNPJ","cnpj","gerente","Gerente",
    "Gerente de Vendas","manager","manager_name","phase","fase","faseAtual",
    "faseNome","createdAt","created_at","updated_at","status","titulo","title",
    "secret","token","telefone","phone","email","observacoes","obs","notes",
  ]);
  // Chaves reservadas para Padrão 4 (fallback genérico "documento") — não devem
  // virar título de doc no Padrão 1; ficam pro fallback nomeá-las "documento".
  const ROOT_DOC_KEYS = new Set(["link", "url", "file", "arquivo"]);

  for (const [key, value] of Object.entries(body)) {
    if (TEXT_FIELDS.has(key)) continue;
    if (ROOT_DOC_KEYS.has(key)) continue; // tratado pelo Padrão 4

    // Padrão 1: valor direto é URL
    if (isUrl(value)) {
      docs.push({ title: key, url: value });
      continue;
    }

    // Padrão 2: valor é array
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isUrl(item)) {
          docs.push({ title: key, url: item });
          continue;
        }
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

export interface GoalfyMeta {
  razao: string;
  cnpj: string;
  gerente: string;
  cardId: string;
  phone?: string;
  email?: string;
  notes?: string;
}

/** Extrai metadados do card (razão, cnpj, gerente, telefone, email, observações). */
export function extractMeta(body: Record<string, unknown>): GoalfyMeta {
  const razao = String(
    body["Razão Social"] ?? body["Razão social"] ?? body.razaoSocial ??
    body.razao_social ?? body.company_name ?? body.empresa ?? body.titulo ??
    body.title ?? "Empresa não identificada"
  );
  const cnpj = String(body.CNPJ ?? body.cnpj ?? body.documento ?? "").replace(/\D/g, "");
  const gerente = String(
    body["Gerente de Vendas"] ?? body.Gerente ?? body.gerente ??
    body.manager ?? body.manager_name ?? ""
  );
  const cardId = String(body.cardId ?? body.id ?? body.card_id ?? body.cardid ?? "");
  const phone = String(body.telefone ?? body.phone ?? "");
  const email = String(body.email ?? "");
  const notes = String(body.observacoes ?? body.obs ?? body.notes ?? "");
  return { razao, cnpj, gerente, cardId, phone, email, notes };
}

/**
 * Converte o tipo "amigável" do webhook (scr, contrato_social, etc.) para o
 * tipo canônico aceito por `CollectionDocument.type` em `types/index.ts`.
 *
 * O webhook parser usa nomes simples ("scr"); o tipo canônico tem variações
 * históricas como "scr_bacen". Sem esse mapeamento, `UploadStep` e
 * `hydrateFromCollection` ignoram silenciosamente os docs vindos do Goalfy
 * (campo `type` não bate com nenhum slot).
 */
export function toCollectionType(parserType: string): string {
  const map: Record<string, string> = {
    scr: "scr_bacen",
    // os demais tipos do parser já batem com CollectionDocument.type
    contrato_social: "contrato_social",
    faturamento: "faturamento",
    relatorio_visita: "relatorio_visita",
    dre: "dre",
    balanco: "balanco",
    curva_abc: "curva_abc",
    qsa: "qsa",
    ir_socio: "ir_socio",
    outro: "outro",
  };
  return map[parserType] ?? parserType;
}

/** Sanitiza nome de arquivo a partir de URL. Trunca caracteres especiais. */
export function safeFilenameFromUrl(url: string, fallback: string): string {
  let raw: string;
  try {
    raw = decodeURIComponent(url.split("/").pop()?.split("?")[0] || fallback);
  } catch {
    // URLs com % escapado mal podem quebrar decodeURIComponent
    raw = url.split("/").pop()?.split("?")[0] || fallback;
  }
  const safe = raw.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return safe || fallback;
}
