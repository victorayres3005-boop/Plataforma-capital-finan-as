/**
 * Parser markdown LEVE para o campo "Percepção do Analista" (e similares).
 * Não usa biblioteca externa — escopo limitado, parsing manual + sanitização.
 *
 * Sintaxe suportada:
 *  - **texto**          → <strong>
 *  - _texto_            → <em>
 *  - - item             → <ul><li>
 *  - :alerta[texto]     → pill vermelha
 *  - :atencao[texto]    → pill amarela
 *  - :positivo[texto]   → pill verde
 *
 * Segurança: HTML é escapado ANTES de qualquer parsing — não há risco de
 * XSS via texto colado pelo analista.
 *
 * Compatível retroativamente: texto sem nenhuma marcação markdown vira
 * `<p>texto</p>` normal — análises antigas continuam exibindo igual.
 */

const PILL_STYLES = {
  alerta: 'background:#FEE2E2;color:#991b1b;border:1px solid #FCA5A5;padding:1px 6px;border-radius:3px;font-weight:700',
  atencao: 'background:#FEF3C7;color:#92400e;border:1px solid #FDE68A;padding:1px 6px;border-radius:3px;font-weight:700',
  positivo: 'background:#DCFCE7;color:#15803d;border:1px solid #86EFAC;padding:1px 6px;border-radius:3px;font-weight:700',
} as const;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Converte markdown leve em HTML pronto pra inserir no template do relatório.
 * @param text Texto bruto do banco (markdown). Aceita null/undefined.
 * @returns HTML escapado + transformado. String vazia se entrada vazia.
 */
export function renderPercepcaoToHtml(text: string | null | undefined): string {
  if (!text || !text.trim()) return "";

  // 1. Escapa HTML primeiro — qualquer < ou > do analista vira &lt; &gt;
  let html = escapeHtml(text);

  // 2. Cores semânticas (precisa vir ANTES de negrito/itálico pra não
  //    consumir os asteriscos/underlines dentro do conteúdo da pill)
  html = html.replace(/:alerta\[([^\]\n]+)\]/g, `<span style="${PILL_STYLES.alerta}">$1</span>`);
  html = html.replace(/:atencao\[([^\]\n]+)\]/g, `<span style="${PILL_STYLES.atencao}">$1</span>`);
  html = html.replace(/:positivo\[([^\]\n]+)\]/g, `<span style="${PILL_STYLES.positivo}">$1</span>`);

  // 3. Negrito **texto** — guloso o suficiente pra cobrir frases curtas,
  //    bloqueado por quebra de linha pra não atravessar parágrafos
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

  // 4. Itálico _texto_ — exige boundary não-alfanumérico antes/depois pra
  //    não converter snake_case em itálico acidental.
  html = html.replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, "$1<em>$2</em>");

  // 5. Listas: linhas começando com "- " viram <li>, agrupadas em <ul>.
  //    Linhas vazias separam blocos. Outras linhas viram <p>.
  const lines = html.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.replace(/\s+$/, "");
    const liMatch = trimmed.match(/^- (.+)$/);
    if (liMatch) {
      if (!inList) { out.push("<ul style=\"padding-left:22px;margin:6px 0\">"); inList = true; }
      out.push(`<li style="margin-bottom:4px">${liMatch[1]}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      if (trimmed === "") {
        // Linha vazia: ignorada se já estiver entre <p>s (espaço natural)
        continue;
      }
      out.push(`<p style="margin-bottom:8px">${trimmed}</p>`);
    }
  }
  if (inList) out.push("</ul>");

  return out.join("");
}

/**
 * Remove todas as marcações markdown — retorna texto puro pra contagens
 * de caracteres, snapshots em /custos, ou outros usos não-visuais.
 */
export function stripPercepcaoMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/:(alerta|atencao|positivo)\[([^\]\n]+)\]/g, "$2")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, "$1$2")
    .replace(/^- /gm, "");
}
