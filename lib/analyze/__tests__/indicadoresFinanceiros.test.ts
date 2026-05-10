// Testes unit dos cálculos de indicadores financeiros (Fase 2 do plano).
// Cobertura: casos reais (exemplo da chefe do Victor), denominador zero,
// campos ausentes, fallbacks (despesaFinanceira / resultadoOperacional / RLP),
// e orquestrador multi-ano.

import { describe, it, expect } from "vitest";
import {
  calcularIndicadoresAno,
  calcularIndicadores,
} from "../indicadoresFinanceiros";
import type { BalancoAno, DREAno, BalancoData, DREData } from "@/types";

// Helpers pra montar fixtures rápido sem encher de strings vazias
function balanco(over: Partial<BalancoAno>): BalancoAno {
  return {
    ano: "2024",
    ativoTotal: "0",
    ativoCirculante: "0",
    caixaEquivalentes: "0",
    contasAReceber: "0",
    estoques: "0",
    outrosAtivosCirculantes: "0",
    ativoNaoCirculante: "0",
    imobilizado: "0",
    intangivel: "0",
    outrosAtivosNaoCirculantes: "0",
    passivoTotal: "0",
    passivoCirculante: "0",
    fornecedores: "0",
    emprestimosCP: "0",
    outrosPassivosCirculantes: "0",
    passivoNaoCirculante: "0",
    emprestimosLP: "0",
    outrosPassivosNaoCirculantes: "0",
    patrimonioLiquido: "0",
    capitalSocial: "0",
    reservas: "0",
    lucrosAcumulados: "0",
    liquidezCorrente: "",
    liquidezGeral: "",
    endividamentoTotal: "",
    capitalDeGiroLiquido: "",
    ...over,
  };
}

function dre(over: Partial<DREAno>): DREAno {
  return {
    ano: "2024",
    receitaBruta: "0",
    deducoes: "0",
    receitaLiquida: "0",
    custoProdutosServicos: "0",
    lucroBruto: "0",
    margemBruta: "",
    despesasOperacionais: "0",
    ebitda: "0",
    margemEbitda: "",
    depreciacaoAmortizacao: "0",
    resultadoFinanceiro: "0",
    lucroAntesIR: "0",
    impostoRenda: "0",
    lucroLiquido: "0",
    margemLiquida: "",
    ...over,
  };
}

describe("calcularIndicadoresAno", () => {
  it("calcula liquidez corrente, seca e geral corretamente", () => {
    const b = balanco({
      ativoCirculante: "1000",
      estoques: "300",
      passivoCirculante: "500",
      passivoNaoCirculante: "200",
      realizavelLongoPrazo: "100",
    });
    const r = calcularIndicadoresAno(b, undefined, "2024");
    expect(r.liquidezCorrente).toBe(2); // 1000/500
    expect(r.liquidezSeca).toBe(1.4); // (1000-300)/500
    expect(r.liquidezGeral).toBe(1.57); // (1000+100)/(500+200) = 1.5714
  });

  it("liquidez geral: cai pro fallback Gemini quando RLP ausente", () => {
    const b = balanco({
      ativoCirculante: "1000",
      passivoCirculante: "500",
      passivoNaoCirculante: "200",
      liquidezGeral: "0,85", // Gemini calculou (diferente do que daria sem RLP)
    });
    const r = calcularIndicadoresAno(b, undefined, "2024");
    expect(r.liquidezGeral).toBe(0.85);
  });

  it("liquidez geral: null quando nem RLP nem Gemini têm", () => {
    const b = balanco({ ativoCirculante: "1000", passivoCirculante: "500" });
    const r = calcularIndicadoresAno(b, undefined, "2024");
    expect(r.liquidezGeral).toBeNull();
  });

  it("retorna null em todos os indicadores quando passivo circulante é zero", () => {
    const b = balanco({ ativoCirculante: "1000", passivoCirculante: "0" });
    const r = calcularIndicadoresAno(b, undefined, "2024");
    expect(r.liquidezCorrente).toBeNull();
    expect(r.liquidezSeca).toBeNull();
  });

  it("calcula capital de giro líquido (negativo permitido)", () => {
    const b = balanco({ ativoCirculante: "100", passivoCirculante: "150" });
    const r = calcularIndicadoresAno(b, undefined, "2024");
    expect(r.capitalGiroLiquido).toBe(-50);
  });

  it("ROI = lucro líquido ÷ ativo total × 100", () => {
    const b = balanco({ ativoTotal: "1000" });
    const d = dre({ lucroLiquido: "150" });
    const r = calcularIndicadoresAno(b, d, "2024");
    expect(r.roi).toBe(15);
  });

  it("PMR/PME/PMP/Ciclo de Caixa em dias (360)", () => {
    const b = balanco({
      contasAReceber: "100",
      estoques: "200",
      fornecedores: "150",
    });
    const d = dre({
      receitaBruta: "1000",
      custoProdutosServicos: "-720", // negativo é o esperado pro DRE
    });
    const r = calcularIndicadoresAno(b, d, "2024");
    expect(r.pmr).toBe(36); // 100/1000 * 360
    expect(r.pme).toBe(100); // 200/720 * 360 = 100
    expect(r.pmp).toBe(75); // 150/720 * 360 = 75
    expect(r.cicloCaixa).toBe(61); // 36 + 100 - 75
  });

  it("ciclo de caixa null quando algum prazo é null", () => {
    const b = balanco({ contasAReceber: "100" }); // estoques e fornecedores 0
    const d = dre({ receitaBruta: "1000", custoProdutosServicos: "0" });
    const r = calcularIndicadoresAno(b, d, "2024");
    expect(r.pmr).toBe(36);
    expect(r.pme).toBeNull();
    expect(r.pmp).toBeNull();
    expect(r.cicloCaixa).toBeNull();
  });

  it("endividamento total e participação de terceiros", () => {
    const b = balanco({
      ativoTotal: "1000",
      passivoCirculante: "300",
      passivoNaoCirculante: "200",
      patrimonioLiquido: "500",
    });
    const r = calcularIndicadoresAno(b, undefined, "2024");
    expect(r.endividamentoTotal).toBe(0.5); // 500/1000
    expect(r.dividaPL).toBe(0.4); // 200/500
    expect(r.participacaoTerceiros).toBe(1); // 500/500
  });

  it("despesa financeira: usa campo dedicado quando presente", () => {
    const d = dre({
      despesaFinanceira: "12485",
      resultadoFinanceiro: "-5000", // poderia confundir
    });
    const r = calcularIndicadoresAno(undefined, d, "2024");
    expect(r.despesaFinanceira).toBe(12485);
  });

  it("despesa financeira: fallback abs(resultadoFinanceiro) quando campo ausente e RF<0", () => {
    const d = dre({ resultadoFinanceiro: "-3500" });
    const r = calcularIndicadoresAno(undefined, d, "2024");
    expect(r.despesaFinanceira).toBe(3500);
  });

  it("despesa financeira: null quando RF é positivo (receita > despesa)", () => {
    const d = dre({ resultadoFinanceiro: "200" });
    const r = calcularIndicadoresAno(undefined, d, "2024");
    expect(r.despesaFinanceira).toBeNull();
  });

  it("resultado operacional: campo dedicado tem prioridade", () => {
    const d = dre({
      resultadoOperacional: "10000",
      ebitda: "9999", // não deve usar
      depreciacaoAmortizacao: "500",
      despesaFinanceira: "1000",
    });
    const r = calcularIndicadoresAno(undefined, d, "2024");
    expect(r.despFinSobreResultadoOp).toBe(10); // 1000/10000 * 100
  });

  it("resultado operacional: fallback ebitda - depAmor", () => {
    const d = dre({
      ebitda: "5000",
      depreciacaoAmortizacao: "1000",
      despesaFinanceira: "800",
    });
    const r = calcularIndicadoresAno(undefined, d, "2024");
    expect(r.despFinSobreResultadoOp).toBe(20); // 800/(5000-1000) * 100 = 20
  });

  it("despfin/resultadoOp: null quando resultadoOp é zero", () => {
    const d = dre({
      resultadoOperacional: "0",
      ebitda: "0",
      despesaFinanceira: "1000",
    });
    const r = calcularIndicadoresAno(undefined, d, "2024");
    expect(r.despFinSobreResultadoOp).toBeNull();
  });

  it("receita média líquida = receita líquida ÷ 12", () => {
    const d = dre({ receitaLiquida: "120000" });
    const r = calcularIndicadoresAno(undefined, d, "2024");
    expect(r.receitaMediaLiquida).toBe(10000);
  });

  it("retorna todos null quando balanço E dre estão ausentes", () => {
    const r = calcularIndicadoresAno(undefined, undefined, "2024");
    expect(r.liquidezCorrente).toBeNull();
    expect(r.roi).toBeNull();
    expect(r.cicloCaixa).toBeNull();
    expect(r.ano).toBe("2024");
  });

  it("aceita números BR formatados (R$ 1.234,56)", () => {
    const b = balanco({
      ativoCirculante: "R$ 1.234,56",
      passivoCirculante: "R$ 617,28",
    });
    const r = calcularIndicadoresAno(b, undefined, "2024");
    expect(r.liquidezCorrente).toBe(2);
  });

  // Caso real do exemplo da chefe do Victor (2024 column)
  it("reproduz exemplo real: liquidez 0,90 / endividamento 0,88", () => {
    const b = balanco({
      ativoTotal: "147500", // arbitrário, mas dá os indicadores
      ativoCirculante: "12200",
      estoques: "3000",
      contasAReceber: "6500",
      passivoCirculante: "13550",
      passivoNaoCirculante: "116200",
      fornecedores: "11000",
      patrimonioLiquido: "17750", // 1 - 0.88 = 0.12 → 0.12 * 147500 = 17750
    });
    const d = dre({
      receitaBruta: "65563",
      custoProdutosServicos: "-65000",
      lucroLiquido: "10912", // 7.4% de 147500
      receitaLiquida: "65563",
    });
    const r = calcularIndicadoresAno(b, d, "2024");
    expect(r.liquidezCorrente).toBe(0.9); // 12200/13550
    expect(r.liquidezSeca).toBe(0.68); // (12200-3000)/13550
    expect(r.endividamentoTotal).toBe(0.88); // (13550+116200)/147500
    expect(r.roi).toBe(7.4); // 10912/147500 * 100
  });
});

describe("calcularIndicadores (orquestrador)", () => {
  it("processa múltiplos anos casando balanço e DRE", () => {
    const b: BalancoData = {
      anos: [
        balanco({ ano: "2023", ativoCirculante: "1000", passivoCirculante: "1000" }),
        balanco({ ano: "2024", ativoCirculante: "2000", passivoCirculante: "1000" }),
      ],
      periodoMaisRecente: "2024",
      tendenciaPatrimonio: "estavel",
      observacoes: "",
    };
    const d: DREData = {
      anos: [
        dre({ ano: "2023", receitaLiquida: "12000" }),
        dre({ ano: "2024", receitaLiquida: "24000" }),
      ],
      crescimentoReceita: "",
      tendenciaLucro: "estavel",
      periodoMaisRecente: "2024",
      observacoes: "",
    };

    const r = calcularIndicadores(b, d);
    expect(r.anos).toHaveLength(2);
    expect(r.anos[0].ano).toBe("2023");
    expect(r.anos[0].liquidezCorrente).toBe(1);
    expect(r.anos[0].receitaMediaLiquida).toBe(1000);
    expect(r.anos[1].ano).toBe("2024");
    expect(r.anos[1].liquidezCorrente).toBe(2);
    expect(r.anos[1].receitaMediaLiquida).toBe(2000);
  });

  it("retorna anos vazio quando balanço e dre são ambos null", () => {
    expect(calcularIndicadores(null, null).anos).toEqual([]);
    expect(calcularIndicadores(undefined, undefined).anos).toEqual([]);
  });

  it("ordena anos cronologicamente (do mais antigo pro mais recente)", () => {
    const b: BalancoData = {
      anos: [balanco({ ano: "2025" }), balanco({ ano: "2023" })],
      periodoMaisRecente: "2025",
      tendenciaPatrimonio: "estavel",
      observacoes: "",
    };
    const r = calcularIndicadores(b, null);
    expect(r.anos.map((a) => a.ano)).toEqual(["2023", "2025"]);
  });

  it("ano só com balanço (sem DRE) processa parcialmente", () => {
    const b: BalancoData = {
      anos: [balanco({ ano: "2024", ativoCirculante: "1000", passivoCirculante: "500" })],
      periodoMaisRecente: "2024",
      tendenciaPatrimonio: "estavel",
      observacoes: "",
    };
    const r = calcularIndicadores(b, null);
    expect(r.anos[0].liquidezCorrente).toBe(2);
    expect(r.anos[0].roi).toBeNull(); // depende do DRE
  });
});
