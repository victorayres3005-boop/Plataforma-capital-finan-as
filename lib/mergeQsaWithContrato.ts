// Mescla dados do Contrato Social no QSA. Para sócios que aparecem em ambos,
// o Contrato Social tem prioridade nos campos:
//   - cpfCnpj  ← contrato.cpf
//   - qualificacao
//   - participacao
//   - capitalInvestido ← contrato.valorTotalQuotas
//
// Justificativa: na operação real, o contrato social traz esses 4 dados de
// forma mais confiável que o QSA da Receita (Receita defasa em alterações
// recentes, normalização de CPF/qualificação varia, etc.). Decisão tomada
// com Victor em 2026-05-04.
//
// Match feito por nome normalizado (sem acentos, lowercase, sem múltiplos
// espaços). Sócios do contrato sem correspondência no QSA são ADICIONADOS
// ao QSA — o QSA passa a representar o quadro consolidado pós-contrato.

import type { ContratoSocialData, QSAData, QSASocio, Socio } from "@/types";

// Normaliza nome para comparação fuzzy: minúsculas, sem acentos, sem
// pontuação, espaços colapsados.
function normalizeName(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEmpty(v: string | undefined | null): boolean {
  return !v || String(v).trim() === "";
}

export type ContratoMergeFlags = {
  cpfCnpj?: boolean;
  qualificacao?: boolean;
  participacao?: boolean;
  capitalInvestido?: boolean;
};

// Aplica merge — retorna `{ qsa, mergeMap }` onde `mergeMap` mapeia o nome
// normalizado do sócio para os campos que vieram do contrato (a UI usa para
// mostrar o badge "do contrato" no campo certo).
export function mergeQsaWithContrato(
  qsa: QSAData | undefined,
  contrato: ContratoSocialData | undefined,
): {
  qsa: QSAData;
  mergeMap: Record<string, ContratoMergeFlags>;
} {
  const baseQsa: QSAData = qsa ?? { capitalSocial: "", quadroSocietario: [] };
  const mergeMap: Record<string, ContratoMergeFlags> = {};

  if (!contrato || !contrato.socios || contrato.socios.length === 0) {
    return { qsa: baseQsa, mergeMap };
  }

  const result: QSASocio[] = baseQsa.quadroSocietario.map(s => ({ ...s }));

  for (const cSocio of contrato.socios) {
    if (!cSocio.nome) continue;
    const cKey = normalizeName(cSocio.nome);
    const idx = result.findIndex(q => normalizeName(q.nome) === cKey);
    const flags: ContratoMergeFlags = {};

    if (idx >= 0) {
      // Match: contrato sobrescreve só os 4 campos definidos.
      const target = result[idx];
      if (!isEmpty(cSocio.cpf)) {
        if (target.cpfCnpj !== cSocio.cpf) flags.cpfCnpj = true;
        target.cpfCnpj = cSocio.cpf;
      }
      if (!isEmpty(cSocio.qualificacao)) {
        if (target.qualificacao !== cSocio.qualificacao) flags.qualificacao = true;
        target.qualificacao = cSocio.qualificacao;
      }
      if (!isEmpty(cSocio.participacao)) {
        if (target.participacao !== cSocio.participacao) flags.participacao = true;
        target.participacao = cSocio.participacao;
      }
      if (!isEmpty(cSocio.valorTotalQuotas)) {
        if (target.capitalInvestido !== cSocio.valorTotalQuotas) flags.capitalInvestido = true;
        target.capitalInvestido = cSocio.valorTotalQuotas;
      }
      result[idx] = target;
    } else {
      // Sócio existe no contrato mas não no QSA — adiciona.
      const novoQsaSocio: QSASocio = {
        nome: cSocio.nome,
        cpfCnpj: cSocio.cpf || "",
        qualificacao: cSocio.qualificacao || "",
        participacao: cSocio.participacao || "",
        capitalInvestido: cSocio.valorTotalQuotas || undefined,
      };
      result.push(novoQsaSocio);
      flags.cpfCnpj = !isEmpty(cSocio.cpf);
      flags.qualificacao = !isEmpty(cSocio.qualificacao);
      flags.participacao = !isEmpty(cSocio.participacao);
      flags.capitalInvestido = !isEmpty(cSocio.valorTotalQuotas);
    }

    if (Object.keys(flags).length > 0) {
      mergeMap[cKey] = flags;
    }
  }

  return {
    qsa: { ...baseQsa, quadroSocietario: result },
    mergeMap,
  };
}

// Helper para o UploadStep aplicar merge sempre que QSA ou Contrato muda.
// Idempotente: se chamada com dados sem mudanças, retorna o QSA original.
export function applyContratoMergeToExtracted<T extends { qsa?: QSAData; contrato?: ContratoSocialData; _qsaMergeMap?: Record<string, ContratoMergeFlags> }>(
  extracted: T,
): T {
  if (!extracted.contrato || !extracted.qsa) return extracted;
  const { qsa, mergeMap } = mergeQsaWithContrato(extracted.qsa, extracted.contrato);
  return { ...extracted, qsa, _qsaMergeMap: mergeMap };
}
