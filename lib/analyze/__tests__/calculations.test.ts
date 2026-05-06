import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseBRL,
  pct,
  countEmptyFieldRatio,
  calcularCobertura,
  buildCoberturaBlock,
  calcularPreRequisitos,
  calcularAlavancagem,
} from "@/lib/analyze/calculations";
import { DEFAULT_FUND_SETTINGS, type FundSettings } from "@/types";

const settings: FundSettings = { ...DEFAULT_FUND_SETTINGS };

// ─────────────────────────────────────────
// parseBRL
// ─────────────────────────────────────────
describe("parseBRL", () => {
  it("retorna 0 para vazio/null/undefined/objeto", () => {
    expect(parseBRL("")).toBe(0);
    expect(parseBRL(null)).toBe(0);
    expect(parseBRL(undefined)).toBe(0);
    expect(parseBRL({})).toBe(0);
  });

  it("retorna number puro inalterado", () => {
    expect(parseBRL(1234.56)).toBe(1234.56);
    expect(parseBRL(0)).toBe(0);
  });

  it("converte BR (1.234,56)", () => {
    expect(parseBRL("1.234,56")).toBe(1234.56);
    expect(parseBRL("9.498.394,00")).toBe(9498394);
  });

  it("converte string sem milhar (123,45)", () => {
    expect(parseBRL("123,45")).toBe(123.45);
  });
});

// ─────────────────────────────────────────
// pct
// ─────────────────────────────────────────
describe("pct", () => {
  it("retorna '0' para falsy mas '0' literal", () => {
    expect(pct(undefined)).toBe("0");
    expect(pct(null)).toBe("0");
    expect(pct("")).toBe("0");
    expect(pct(0)).toBe("0");
  });

  it("strippa caractere %", () => {
    expect(pct("65%")).toBe("65");
    expect(pct("65,5%")).toBe("65,5");
  });

  it("aceita number", () => {
    expect(pct(45)).toBe("45");
  });
});

// ─────────────────────────────────────────
// countEmptyFieldRatio
// ─────────────────────────────────────────
describe("countEmptyFieldRatio", () => {
  it("retorna 1 para objeto vazio (todos campos ausentes)", () => {
    expect(countEmptyFieldRatio({})).toBe(1);
  });

  it("retorna 0 para todos campos preenchidos", () => {
    expect(countEmptyFieldRatio({ a: "x", b: "y" })).toBe(0);
  });

  it("retorna 0.5 quando metade dos campos vazios", () => {
    expect(countEmptyFieldRatio({ a: "x", b: "" })).toBe(0.5);
  });

  it("desce recursivamente em objetos aninhados", () => {
    expect(
      countEmptyFieldRatio({ outer: { a: "x", b: "" }, c: "z" }),
    ).toBeCloseTo(1 / 3, 2);
  });

  it("trata null/undefined como vazio", () => {
    expect(countEmptyFieldRatio({ a: null, b: undefined, c: "x" })).toBeCloseTo(2 / 3, 2);
  });

  it("ignora arrays (não conta como campo)", () => {
    // Arrays caem no else final implícito (não string, não null) → não somam
    expect(countEmptyFieldRatio({ arr: ["x", "y"], c: "z" })).toBe(0);
  });
});

// ─────────────────────────────────────────
// calcularCobertura
// ─────────────────────────────────────────
describe("calcularCobertura", () => {
  it("0% quando não há documentos", () => {
    const r = calcularCobertura({});
    expect(r.cobertura).toBe(0);
    expect(r.coberturaEfetiva).toBe(0);
    expect(r.nivel).toBe("PRELIMINAR");
    expect(r.docsPresentes).toEqual([]);
    expect(r.docsFaltantes.length).toBe(8);
  });

  it("considera doc presente quando tem dados extraídos válidos", () => {
    const r = calcularCobertura({ cnpj: { razaoSocial: "Acme" } });
    expect(r.docsPresentes).toContain("cnpj");
    // peso cnpj=15 / total=100 → 15%
    expect(r.cobertura).toBe(15);
  });

  it("considera doc ausente quando vem com aiError", () => {
    const r = calcularCobertura({ cnpj: { aiError: "timeout" } });
    expect(r.docsFaltantes).toContain("cnpj");
    expect(r.cobertura).toBe(0);
  });

  it("considera doc ausente quando todos campos null/empty", () => {
    const r = calcularCobertura({ cnpj: { razaoSocial: "", cnpj: null } });
    expect(r.docsFaltantes).toContain("cnpj");
  });

  it("nível PRELIMINAR (<45%), BASICO (<65%), PADRAO (<85%), COMPLETO (≥85%)", () => {
    expect(calcularCobertura({ cnpj: { razaoSocial: "X" } }).nivel).toBe("PRELIMINAR");
    // cnpj+scr+faturamento = 60% → BASICO
    const r2 = calcularCobertura({
      cnpj: { razaoSocial: "X" },
      scr: { totalDividasAtivas: "100" },
      faturamento: { mediaAno: "1000" },
    });
    expect(r2.cobertura).toBe(60);
    expect(r2.nivel).toBe("BASICO");
    // cnpj+scr+faturamento+dre+balanco+curvaABC = 90% → COMPLETO
    const r3 = calcularCobertura({
      cnpj: { razaoSocial: "X" },
      scr: { totalDividasAtivas: "100" },
      faturamento: { mediaAno: "1000" },
      dre: { ano: "2024" },
      balanco: { ano: "2024" },
      curvaABC: { clientes: ["x"] },
    });
    expect(r3.cobertura).toBeGreaterThanOrEqual(85);
    expect(r3.nivel).toBe("COMPLETO");
  });

  it("aplica bônus CreditHub: protestos consultados (+5)", () => {
    const r = calcularCobertura({ protestos: { vigentesQtd: "0" } });
    expect(r.chBonus).toBe(5);
    expect(r.chSinais.find(s => s.chave === "protestos")?.limpo).toBe(true);
  });

  it("protestos não-limpo gera valor descritivo", () => {
    const r = calcularCobertura({
      protestos: { vigentesQtd: "3", vigentesValor: "5000" },
    });
    expect(r.chSinais.find(s => s.chave === "protestos")?.limpo).toBe(false);
    expect(r.chSinais.find(s => s.chave === "protestos")?.valor).toMatch(/3 protesto/);
  });

  it("CCF consultado +5; limpo quando qtdRegistros=0", () => {
    const r = calcularCobertura({ ccf: { qtdRegistros: 0 } });
    expect(r.chBonus).toBe(5);
    expect(r.chSinais.find(s => s.chave === "ccf")?.limpo).toBe(true);
  });

  it("processos com RJ marca valor com 'RECUPERAÇÃO JUDICIAL'", () => {
    const r = calcularCobertura({
      processos: { passivosTotal: "5", temRJ: true },
    });
    const sinal = r.chSinais.find(s => s.chave === "processos");
    expect(sinal?.limpo).toBe(false);
    expect(sinal?.valor).toMatch(/RECUPERAÇÃO JUDICIAL/);
  });

  it("capitalSocial e porteFuncionarios entram via cnpj", () => {
    const r = calcularCobertura({
      cnpj: {
        razaoSocial: "X",
        capitalSocialCNPJ: "1.000.000",
        porte: "ME",
        funcionarios: "5",
      },
    });
    // cnpj(15) + capitalSocial(2) + porteFuncionarios(2) = 19
    expect(r.chBonus).toBe(4);
    expect(r.chSinais.find(s => s.chave === "capitalSocial")).toBeDefined();
    expect(r.chSinais.find(s => s.chave === "porteFuncionarios")).toBeDefined();
  });

  it("coberturaEfetiva é teto 100", () => {
    const r = calcularCobertura({
      cnpj: { razaoSocial: "X", capitalSocialCNPJ: "1000", porte: "ME" },
      scr: { totalDividasAtivas: "100" },
      faturamento: { mediaAno: "1000" },
      dre: { ano: "2024" },
      balanco: { ano: "2024" },
      curvaABC: { clientes: ["x"] },
      irSocios: { cpf: "111" },
      relatorio_visita: { dataVisita: "2024" },
      protestos: { vigentesQtd: "0" },
      ccf: { qtdRegistros: 0 },
      processos: { passivosTotal: "0" },
    });
    expect(r.coberturaEfetiva).toBe(100);
  });

  it("confiancaBase tem teto por nível", () => {
    // PRELIMINAR teto 55
    const r = calcularCobertura({ cnpj: { razaoSocial: "X" } });
    expect(r.confiancaBase).toBeLessThanOrEqual(55);
  });
});

// ─────────────────────────────────────────
// buildCoberturaBlock
// ─────────────────────────────────────────
describe("buildCoberturaBlock", () => {
  it("inclui nível, cobertura e listas de docs", () => {
    const cob = calcularCobertura({ cnpj: { razaoSocial: "Acme" } });
    const block = buildCoberturaBlock(cob);
    expect(block).toContain("PRELIMINAR");
    expect(block).toContain("Cartão CNPJ"); // label, não chave
    expect(block).toContain("--- COBERTURA DOCUMENTAL ---");
    expect(block).toContain("--- FIM COBERTURA ---");
  });

  it("omite bloco CreditHub quando sem sinais", () => {
    const cob = calcularCobertura({ cnpj: { razaoSocial: "X" } });
    const block = buildCoberturaBlock(cob);
    expect(block).not.toContain("Dados CreditHub");
  });

  it("inclui regras de compensação quando aplicáveis (bureau limpo)", () => {
    const cob = calcularCobertura({
      cnpj: { razaoSocial: "X" },
      protestos: { vigentesQtd: "0" },
      ccf: { qtdRegistros: 0 },
    });
    const block = buildCoberturaBlock(cob);
    expect(block).toContain("Bureau limpo");
  });

  it("emite ATENÇÃO quando CCF sujo", () => {
    const cob = calcularCobertura({
      cnpj: { razaoSocial: "X" },
      ccf: { qtdRegistros: 3 },
    });
    const block = buildCoberturaBlock(cob);
    expect(block).toContain("ATENÇÃO");
    expect(block).toContain("limite rating a no máximo 6.0");
  });
});

// ─────────────────────────────────────────
// calcularPreRequisitos
// ─────────────────────────────────────────
describe("calcularPreRequisitos", () => {
  beforeEach(() => {
    // Data fixa: 2026-05-06 — mesma data da sessão para evitar flake
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aprova quando nada falha (FMM ok, idade ok, sem reprovação)", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: Array.from({ length: 12 }, (_, i) => ({ mes: `${String(i + 1).padStart(2, "0")}/2025`, valor: "500.000,00" })) },
        cnpj: { dataAbertura: "01/01/2010" },
      },
      settings,
    );
    expect(r.aprovadoPorPreRequisito).toBe(true);
    expect(r.fmm).toBe(500000);
    expect(r.idadeAnos).toBeGreaterThan(15);
    expect(r.motivoReprovacao).toEqual([]);
  });

  it("reprova quando FMM < fmm_minimo", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "100.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
      },
      settings,
    );
    expect(r.reprovadoPorPreRequisito).toBe(true);
    expect(r.motivoReprovacao.find(m => m.includes("FMM"))).toBeDefined();
  });

  it("reprova quando idade < idade_minima_anos (3)", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2025" }, // 1 ano e poucos meses
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("anos"))).toBeDefined();
  });

  it("reprova quando dataAbertura ausente/inválida (idade=0)", () => {
    const r = calcularPreRequisitos(
      { faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] }, cnpj: {} },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("Data de abertura"))).toBeDefined();
  });

  it("aceita formato MM/YYYY de dataAbertura", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "06/2010" },
      },
      settings,
    );
    expect(r.idadeAnos).toBeGreaterThan(15);
    expect(r.motivoReprovacao.find(m => m.includes("Data de abertura"))).toBeUndefined();
  });

  it("aceita formato YYYY de dataAbertura", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "2015" },
      },
      settings,
    );
    expect(r.idadeAnos).toBeGreaterThan(10);
  });

  it("eliminatório fixo: sanções CEIS/CNEP ativas", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        sancoes: {
          consultado: true,
          sancoesCNPJ: [{ ativa: true }],
          sancoesSocios: [],
        },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("CEIS/CNEP"))).toBeDefined();
  });

  it("eliminatório fixo: CCF > 0", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        protestos: { ccfQuantidade: 1 },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("CCF"))).toBeDefined();
  });

  it("eliminatório fixo: Recuperação Judicial via temRJ", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        processos: { temRJ: true },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => /Recupera[çc][aã]o Judicial/.test(m))).toBeDefined();
  });

  it("eliminatório fixo: RJ via razão social", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: {
          dataAbertura: "01/01/2010",
          razaoSocial: "Acme S.A. EM RECUPERAÇÃO JUDICIAL",
        },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => /Razão social/.test(m))).toBeDefined();
  });

  it("eliminatório fixo: prejuízos SCR > 0", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        scr: { prejuizos: "1.234,00" },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("prejuizos"))).toBeDefined();
  });

  it("eliminatório fixo: vencidos sem carteira ativa", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        scr: { vencidos: "1000,00" },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("inconsistente"))).toBeDefined();
  });

  it("eliminatório configurável: protestos vigentes > limite (default 2)", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        protestos: { quantidadeVigentes: 5 },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("protestos"))).toBeDefined();
  });

  it("eliminatório: SCR vencidos % acima do limite (default 10%)", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        scr: { totalDividasAtivas: "1.000,00", vencidos: "200,00" }, // 20% > 10%
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => /SCR vencidos em/.test(m))).toBeDefined();
  });

  it("eliminatório: alavancagem acima do máximo", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        scr: { totalDividasAtivas: "5.000.000,00" }, // 5M / 500k FMM = 10x > 5x max
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => /Alavancagem/.test(m))).toBeDefined();
  });

  it("FMM zero quando não há meses válidos — não aciona regra de FMM mínimo", () => {
    const r = calcularPreRequisitos(
      { faturamento: { meses: [] }, cnpj: { dataAbertura: "01/01/2010" } },
      settings,
    );
    expect(r.fmm).toBe(0);
    // Regra "FMM abaixo" só ativa se FMM > 0; FMM=0 não reprova por isso
    expect(r.motivoReprovacao.find(m => m.includes("FMM"))).toBeUndefined();
  });

  it("ordena meses cronologicamente e usa últimos 12", () => {
    const meses = [
      { mes: "12/2024", valor: "100.000,00" },
      { mes: "01/2025", valor: "200.000,00" },
      { mes: "11/2024", valor: "300.000,00" },
    ];
    const r = calcularPreRequisitos(
      { faturamento: { meses }, cnpj: { dataAbertura: "01/01/2010" } },
      settings,
    );
    // FMM = (300 + 100 + 200) / 3 = 200k
    expect(r.fmm).toBe(200000);
  });
});

// ─────────────────────────────────────────
// Regressões dos bugs #1-#4 fixados em 2026-05-06 (política eliminatória V2)
// ─────────────────────────────────────────
describe("Regressões política eliminatória — bugs #1-#4 (2026-05-06)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // BUG #1: parseBRL não remove "R$"
  it("[BUG #1] parseBRL deveria aceitar string com prefixo R$ (adapters retornam assim)", () => {
    expect(parseBRL("R$ 1.234,56")).toBe(1234.56);
    expect(parseBRL("R$ 5.000.000,00")).toBe(5000000);
  });

  it("[BUG #1 propagação] Eliminatório de prejuízos SCR é silencioso quando valor vem com R$", () => {
    // adaptSCRNew retorna prejuízos como "R$ 1.234,00" — formato real de produção
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        scr: { prejuizos: "R$ 1.234,00" },
      },
      settings,
    );
    // DEVERIA reprovar, mas parseBRL("R$ 1.234,00")=0 e o eliminatório não dispara
    expect(r.motivoReprovacao.find(m => m.includes("prejuizos"))).toBeDefined();
  });

  // BUG #2: CCF lê campo errado
  it("[BUG #2] Eliminatório CCF deveria ler ccf.qtdRegistros (shape canônico)", () => {
    // calcularCobertura usa data.ccf.qtdRegistros (correto)
    // calcularPreRequisitos usa data.protestos.ccfQuantidade (errado)
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        ccf: { qtdRegistros: 3 },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("CCF"))).toBeDefined();
  });

  // BUG #3: Protestos lê campo errado
  it("[BUG #3] Protestos vigentes deveria ler vigentesQtd (canônico)", () => {
    // calcularCobertura usa protestos.vigentesQtd
    // calcularPreRequisitos usa protestos.quantidadeVigentes / protestos.quantidade
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        protestos: { vigentesQtd: 5 }, // shape real
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("protestos"))).toBeDefined();
  });

  // BUG #4 — passivosTotal:0 (valor legítimo) NÃO deve ativar fallback de iteração
  it("[BUG #4 boundary] passivosTotal=0 com array .processos[] não-vazia: respeita zero canônico", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        // Empresa SEM processos passivos (canônico=0), mas array legacy preenchida
        processos: {
          passivosTotal: 0,
          processos: Array.from({ length: 30 }, () => ({ polo: "passivo" })),
        },
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("processos passivos"))).toBeUndefined();
  });

  // Quando canônico e fallback histórico estão ambos presentes, canônico vence
  it("[BUG #2-#4] canônico vence sobre fallback histórico quando ambos presentes", () => {
    // CCF: ccf.qtdRegistros=2 (canônico) vs protestos.ccfQuantidade=99 (legacy)
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        ccf: { qtdRegistros: 2 },
        protestos: {
          vigentesQtd: 1, // canônico
          quantidadeVigentes: 99, // legacy — deve ser ignorado
          ccfQuantidade: 99, // legacy
        },
      },
      settings,
    );
    // CCF aparece com 2 (canônico), não 99
    const ccfMotivo = r.motivoReprovacao.find(m => m.includes("CCF"));
    expect(ccfMotivo).toMatch(/2 ocorrencia/);
    // Protestos: 1 ≤ 2 (default protestos_max), NÃO reprova
    expect(r.motivoReprovacao.find(m => m.includes("protestos"))).toBeUndefined();
  });

  // Boundary exato: protestos == limit (≤) não reprova
  it("[BUG #3 boundary] protestos == protestos_max não reprova (>)", () => {
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        protestos: { vigentesQtd: 2 }, // == default 2
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("protestos"))).toBeUndefined();
  });

  // BUG #4: Processos passivos lê shape errado
  it("[BUG #4] Processos passivos deveria ler passivosTotal (canônico)", () => {
    // calcularCobertura usa processos.passivosTotal
    // calcularPreRequisitos itera processos.processos[] (shape inexistente)
    const r = calcularPreRequisitos(
      {
        faturamento: { meses: [{ mes: "01/2025", valor: "500.000,00" }] },
        cnpj: { dataAbertura: "01/01/2010" },
        processos: { passivosTotal: 30 }, // 30 > 15 (default)
      },
      settings,
    );
    expect(r.motivoReprovacao.find(m => m.includes("processos passivos"))).toBeDefined();
  });
});

// ─────────────────────────────────────────
// calcularAlavancagem
// ─────────────────────────────────────────
describe("calcularAlavancagem", () => {
  it("retorna null quando FMM ou divida zerados", () => {
    const r1 = calcularAlavancagem({}, settings);
    expect(r1.alavancagem).toBeNull();
    expect(r1.label).toMatch(/N[aã]o calcul[aá]vel/);
  });

  it("classifica como saudável quando ≤ alavancagem_saudavel (3.5)", () => {
    const r = calcularAlavancagem(
      { scr: { totalDividasAtivas: "1.000.000,00" }, faturamento: { mediaAno: "500.000,00" } },
      settings,
    );
    // 1M / 500k = 2x → saudável
    expect(r.alavancagem).toBe(2);
    expect(r.label).toMatch(/sauda/);
  });

  it("classifica como elevado quando entre saudavel e máxima", () => {
    const r = calcularAlavancagem(
      { scr: { totalDividasAtivas: "2.000.000,00" }, faturamento: { mediaAno: "500.000,00" } },
      settings,
    );
    // 2M / 500k = 4x → entre 3.5 e 5
    expect(r.alavancagem).toBe(4);
    expect(r.label).toMatch(/elevado/);
  });

  it("classifica como CRITICO quando > máxima (5)", () => {
    const r = calcularAlavancagem(
      { scr: { totalDividasAtivas: "5.000.000,00" }, faturamento: { mediaAno: "500.000,00" } },
      settings,
    );
    // 10x > 5
    expect(r.label).toMatch(/CRITICO/);
  });

  it("usa carteiraAVencer como fallback quando totalDividasAtivas vazio", () => {
    const r = calcularAlavancagem(
      { scr: { totalDividasAtivas: "", carteiraAVencer: "1.000.000,00" }, faturamento: { mediaAno: "500.000,00" } },
      settings,
    );
    expect(r.alavancagem).toBe(2);
  });
});
