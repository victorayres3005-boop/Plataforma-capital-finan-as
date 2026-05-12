// Inferência cronológica de ano em meses de faturamento (criado 2026-05-12).
//
// Bug que motivou: Gemini ocasionalmente extrai meses sem o campo `ano`
// (especialmente em documentos onde a tabela tem só nome do mês). O adapter
// caía no fallback `_s(m.mes)` → ficava só "Abril", o filtro do fillDefaults
// descartava (formato MM/YYYY inválido), e o cálculo de somatoriaAno/FMM
// somava só os meses que ainda tinham ano. Caso real: GLOBOPACK 36.481.684
// mostrava 12 meses na barra mas Total 12M dizia R$ 7,50M (soma dos 3
// últimos meses que tinham ano).
//
// Esta função RECEBE um array possivelmente misturado (alguns "MM/YYYY",
// outros só nome de mês) e RETORNA todos como "MM/YYYY", inferindo o ano
// dos que faltavam por posição cronológica relativa.

const NOME_MES_PARA_NUM: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, "março": 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function parseNomeMes(s: string): number | null {
  const norm = normalizar(s).replace(/\.$/, "");  // "jan." → "jan"
  return NOME_MES_PARA_NUM[norm] ?? null;
}

const RE_MM_YYYY = /^(\d{1,2})\/(\d{4})$/;

type MesItem = { mes: string; valor: string };

export function inferirAnosCronologicamente(meses: MesItem[]): MesItem[] {
  if (meses.length === 0) return meses;

  // Primeira passada: extrai mesNum e ano (quando disponíveis)
  const items = meses.map((m, idx) => {
    const match = m.mes.match(RE_MM_YYYY);
    if (match) {
      return { idx, valor: m.valor, mesOriginal: m.mes,
               mesNum: parseInt(match[1], 10),
               ano: parseInt(match[2], 10) as number | null };
    }
    return { idx, valor: m.valor, mesOriginal: m.mes,
             mesNum: parseNomeMes(m.mes), ano: null as number | null };
  });

  // Se NENHUM tem ano: assume que o último item é o último mês "fechado"
  // antes do mês atual (ex: hoje é mai/2026 e o último mês é Abr → Abr/2026;
  // se o último mês é Mai → Mai/2026; se é Jun → Jun/2025, pois ainda não
  // chegou em Jun/2026 e a empresa não pode ter faturado mês futuro).
  const algumComAno = items.some(it => it.ano !== null);
  if (!algumComAno) {
    const ultimo = items[items.length - 1];
    if (!ultimo.mesNum) return meses;  // sem como ancorar
    const hoje = new Date();
    const mesHoje = hoje.getMonth() + 1;
    const anoHoje = hoje.getFullYear();
    const anoUltimo = ultimo.mesNum > mesHoje ? anoHoje - 1 : anoHoje;
    ultimo.ano = anoUltimo;
  }

  // Encontra primeira âncora (com ano conhecido)
  const firstAnchor = items.findIndex(it => it.ano !== null);
  if (firstAnchor === -1) return meses;

  // Propaga PARA TRÁS — quando o mês anterior tem número MAIOR que o seguinte,
  // virou o ano (ex: ..., Dez (12) ← Jan (1, ano N) → Dez está em N-1).
  for (let i = firstAnchor - 1; i >= 0; i--) {
    const cur = items[i];
    const next = items[i + 1];
    if (!cur.mesNum || !next.mesNum || next.ano === null) continue;
    cur.ano = cur.mesNum > next.mesNum ? next.ano - 1 : next.ano;
  }

  // Propaga PARA FRENTE — análogo na direção oposta. Só atualiza meses que
  // ainda não têm ano (preserva outras âncoras se houver várias).
  for (let i = firstAnchor + 1; i < items.length; i++) {
    const cur = items[i];
    const prev = items[i - 1];
    if (cur.ano !== null) continue;
    if (!cur.mesNum || !prev.mesNum || prev.ano === null) continue;
    cur.ano = cur.mesNum < prev.mesNum ? prev.ano + 1 : prev.ano;
  }

  // Reconstrói. Se um item não conseguiu ser inferido (ex: nem o nome do mês
  // foi reconhecido), preserva o valor original (defensivo).
  return items.map(it => {
    if (it.ano !== null && it.mesNum) {
      return { mes: `${String(it.mesNum).padStart(2, "0")}/${it.ano}`, valor: it.valor };
    }
    return { mes: it.mesOriginal, valor: it.valor };
  });
}
