/**
 * Lista central das colunas editáveis em `shared_reports`.
 *
 * Antes da Onda 2 (#2.4), essa lista era hardcoded em `app/r/[id]/route.ts`
 * dentro do `hasOverrides`. Qualquer coluna editável nova (ex: futuro
 * `sugestao_analista`) precisava ser lembrada manualmente — esquecer fazia
 * o CDN cachear 1h a versão IA antiga (bug histórico 2026-05-12).
 *
 * Agora qualquer parte da plataforma que precise saber "essa coluna é
 * editável pelo analista?" deve consultar `EDITABLE_COLUMNS` ou usar
 * `hasAnyOverride()`.
 *
 * Quando adicionar uma nova coluna editável:
 * 1. Migration no Supabase (adicionar coluna em shared_reports)
 * 2. Adicionar entry aqui
 * 3. Endpoint de edição (`/api/r/[id]/edit/route.ts`)
 * 4. Template HTML com marcador `<!--EDIT:KEY:START-->...<!--EDIT:KEY:END-->`
 * 5. Aplicador de override no `app/r/[id]/route.ts`
 */

export type EditableColumnType = "list" | "text";

export interface EditableColumnDef {
  /** Nome da coluna em shared_reports e chave no objeto data. */
  key: string;
  /** "list" = array de strings; "text" = string única. */
  type: EditableColumnType;
}

export const EDITABLE_COLUMNS: ReadonlyArray<EditableColumnDef> = [
  // Listas (renderizadas como bullets na revisão / relatório)
  { key: "pontos_fortes",          type: "list" },
  { key: "pontos_fracos",          type: "list" },
  { key: "alertas",                type: "list" },
  // Textos livres por seção do relatório
  { key: "percepcao",              type: "text" },
  { key: "percepcao_dre",          type: "text" },
  { key: "percepcao_faturamento",  type: "text" },
  { key: "percepcao_balanco",      type: "text" },
];

/**
 * Detecta se `data` tem QUALQUER override do analista preenchido.
 * Usado em `/r/[id]` pra decidir Cache-Control: no-store vs public 1h.
 *
 * @param data Linha da tabela shared_reports.
 */
export function hasAnyOverride(data: Record<string, unknown>): boolean {
  return EDITABLE_COLUMNS.some(col => {
    const v = data[col.key];
    if (col.type === "list") {
      return Array.isArray(v) && v.length > 0;
    }
    return typeof v === "string" && v.trim().length > 0;
  });
}
