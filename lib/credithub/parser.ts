/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ProtestosData, ProcessosData } from "@/types";

export interface ProtestosDataCH {
  totalProtestos: number;
  valorTotal: string;
  distribuicaoTemporal: { periodo: string; quantidade: number; valor: string }[];
  topCartorios: { cartorio: string; cidade: string; valor: string }[];
  semProtestos: boolean;
  fonte: "credithub" | "manual";
  consultadoEm: string;
}

export interface ProcessosDataCH {
  totalProcessos: number;
  processosBancarios: number;
  processosFiscais: number;
  processosTrabalhistas: number;
  processosOutros: number;
  valorTotalEstimado: string;
  semProcessos: boolean;
  fonte: "credithub" | "manual";
  consultadoEm: string;
}

// Normaliza resposta bruta da API Credit Hub para schema interno
// TODO: ajustar mapeamento quando tivermos a documentação real da API
export function parseProtestosResponse(raw: Record<string, unknown>): ProtestosDataCH {
  return {
    totalProtestos: Number(raw.totalProtestos || raw.total_protestos || 0),
    valorTotal: String(raw.valorTotal || raw.valor_total || "0,00"),
    distribuicaoTemporal: (raw.distribuicao as any[]) || [],
    topCartorios: (raw.cartorios as any[]) || [],
    semProtestos: Number(raw.totalProtestos || 0) === 0,
    fonte: "credithub",
    consultadoEm: new Date().toISOString(),
  };
}

export function parseProcessosResponse(raw: Record<string, unknown>): ProcessosDataCH {
  return {
    totalProcessos: Number(raw.totalProcessos || raw.total_processos || 0),
    processosBancarios: Number(raw.bancarios || 0),
    processosFiscais: Number(raw.fiscais || 0),
    processosTrabalhistas: Number(raw.trabalhistas || 0),
    processosOutros: Number(raw.outros || 0),
    valorTotalEstimado: String(raw.valorTotal || "0,00"),
    semProcessos: Number(raw.totalProcessos || 0) === 0,
    fonte: "credithub",
    consultadoEm: new Date().toISOString(),
  };
}

// Adapta ProtestosDataCH para o schema interno ProtestosData
export function toProtestosData(ch: ProtestosDataCH): ProtestosData {
  return {
    vigentesQtd: String(ch.totalProtestos),
    vigentesValor: ch.valorTotal,
    regularizadosQtd: "0",
    regularizadosValor: "0,00",
    detalhes: ch.topCartorios.map((c) => ({
      data: ch.consultadoEm.slice(0, 10),
      credor: `${c.cartorio} — ${c.cidade}`,
      valor: c.valor,
      regularizado: false,
    })),
  };
}

// Adapta ProcessosDataCH para o schema interno ProcessosData
export function toProcessosData(ch: ProcessosDataCH): ProcessosData {
  const distribuicao = [
    { tipo: "BANCO", qtd: String(ch.processosBancarios), pct: "" },
    { tipo: "FISCAL", qtd: String(ch.processosFiscais), pct: "" },
    { tipo: "TRABALHISTA", qtd: String(ch.processosTrabalhistas), pct: "" },
    { tipo: "OUTROS", qtd: String(ch.processosOutros), pct: "" },
  ].filter((d) => Number(d.qtd) > 0);

  return {
    passivosTotal: String(ch.totalProcessos),
    ativosTotal: "0",
    valorTotalEstimado: ch.valorTotalEstimado,
    temRJ: false,
    distribuicao,
    bancarios: [],
    fiscais: [],
    fornecedores: [],
    outros: [],
  };
}
