import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fillCNPJDefaults,
  fillQSADefaults,
  fillContratoDefaults,
  fillFaturamentoDefaults,
  fillSCRDefaults,
  fillProtestosDefaults,
  fillProcessosDefaults,
  fillGrupoEconomicoDefaults,
  fillCurvaABCDefaults,
  fillDREDefaults,
  fillBalancoDefaults,
  fillIRSocioDefaults,
  fillRelatorioVisitaDefaults,
  countFilledFields,
} from "@/lib/extract/fillDefaults";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("fillCNPJDefaults", () => {
  it("input vazio → todos campos string vazia", () => {
    const r = fillCNPJDefaults({});
    expect(r.razaoSocial).toBe("");
    expect(r.endereco).toBe("");
    expect(r.email).toBe("");
  });

  it("preserva campos preenchidos", () => {
    const r = fillCNPJDefaults({ razaoSocial: "ACME", cnpj: "12345" });
    expect(r.razaoSocial).toBe("ACME");
    expect(r.cnpj).toBe("12345");
    expect(r.endereco).toBe("");
  });
});

describe("fillQSADefaults", () => {
  it("descarta sócio totalmente vazio e conta no _incompleteCount", () => {
    const r = fillQSADefaults({
      quadroSocietario: [
        { nome: "João", cpfCnpj: "111", qualificacao: "", participacao: "" },
        { nome: "", cpfCnpj: "", qualificacao: "", participacao: "" },
      ],
    });
    expect(r.quadroSocietario).toHaveLength(1);
    expect(r._incompleteCount).toBe(1);
  });

  it("preserva sócio parcial (só nome ou só CPF)", () => {
    const r = fillQSADefaults({
      quadroSocietario: [
        { nome: "Maria", cpfCnpj: "", qualificacao: "", participacao: "" },
      ],
    });
    expect(r.quadroSocietario).toHaveLength(1);
    expect(r._incompleteCount).toBeUndefined();
  });

  it("não retorna _incompleteCount quando nada foi descartado", () => {
    const r = fillQSADefaults({
      quadroSocietario: [
        { nome: "João", cpfCnpj: "111", qualificacao: "Sócio", participacao: "100" },
      ],
    });
    expect(r._incompleteCount).toBeUndefined();
  });
});

describe("fillContratoDefaults", () => {
  it("descarta sócios vazios e mantém contagem", () => {
    const r = fillContratoDefaults({
      socios: [
        { nome: "A", cpf: "111", participacao: "50%", qualificacao: "" },
        { nome: "", cpf: "", participacao: "", qualificacao: "" },
        { nome: "", cpf: "", participacao: "", qualificacao: "" },
      ],
    });
    expect(r.socios).toHaveLength(1);
    expect(r._incompleteCount).toBe(2);
  });

  it("preenche flags e strings default", () => {
    const r = fillContratoDefaults({});
    expect(r.temAlteracoes).toBe(false);
    expect(r.capitalSocial).toBe("");
    expect(r.socios).toEqual([]);
  });
});

describe("fillFaturamentoDefaults", () => {
  it("descarta meses futuros e expõe em _mesesFuturosIgnorados", () => {
    const futuro = `${String(new Date().getMonth() + 2).padStart(2, "0")}/${new Date().getFullYear() + 1}`;
    const r = fillFaturamentoDefaults({
      meses: [
        { mes: "01/2023", valor: "1.000,00" },
        { mes: futuro, valor: "9.999,00" },
      ],
    }) as ReturnType<typeof fillFaturamentoDefaults> & {
      _mesesFuturosIgnorados?: string[];
    };
    expect(r.meses).toHaveLength(1);
    expect(r._mesesFuturosIgnorados).toContain(futuro);
  });

  it("calcula faturamentoZerado=true quando todos zero", () => {
    const r = fillFaturamentoDefaults({
      meses: [{ mes: "01/2024", valor: "0,00" }],
    });
    expect(r.faturamentoZerado).toBe(true);
  });

  it("calcula somatoria12m com formato BR", () => {
    const r = fillFaturamentoDefaults({
      meses: Array.from({ length: 3 }, (_, i) => ({
        mes: `0${i + 1}/2024`,
        valor: "1.000,00",
      })),
    });
    expect(r.somatoriaAno).toBe("3.000,00");
  });

  it("input vazio retorna shape válido", () => {
    const r = fillFaturamentoDefaults({});
    expect(r.meses).toEqual([]);
    expect(r.somatoriaAno).toBe("0,00");
    expect(r.tendencia).toBe("indefinido");
    expect(r.faturamentoZerado).toBe(true);
  });

  it("identifica meses zerados", () => {
    const r = fillFaturamentoDefaults({
      meses: [
        { mes: "01/2024", valor: "100,00" },
        { mes: "02/2024", valor: "0,00" },
      ],
    });
    expect(r.temMesesZerados).toBe(true);
    expect(r.quantidadeMesesZerados).toBe(1);
  });

  describe("parseBR robusto — regressão caso PRANDOPEL", () => {
    // Cenário: Gemini ocasionalmente retorna valor em formato EN (ponto como
    // decimal) em vez de formato BR (vírgula como decimal). Antes do fix da
    // Onda 2, "1234.56" virava 123456 (100× maior) — sintoma observado em
    // PRANDOPEL Fev/2025 com R$ 29.499.805,06 num mês onde os outros eram
    // R$ 2 milhões.

    it("valor em formato EN '1234.56' deve resultar em 1234.56 (NÃO 123456)", () => {
      const r = fillFaturamentoDefaults({
        meses: [{ mes: "01/2024", valor: "1234.56" }],
      });
      // somatoriaAno é string formatada em BR ("1.234,56")
      expect(r.somatoriaAno).toBe("1.234,56");
      expect(r.faturamentoZerado).toBe(false);
    });

    it("valor em formato EN com milhares '29499805.06' deve resultar em 29.499.805,06 (NÃO 2.949.980.506,00)", () => {
      const r = fillFaturamentoDefaults({
        meses: [{ mes: "01/2024", valor: "29499805.06" }],
      });
      expect(r.somatoriaAno).toBe("29.499.805,06");
    });

    it("formato BR continua funcionando: '1.234.567,89' → 1.234.567,89", () => {
      const r = fillFaturamentoDefaults({
        meses: [{ mes: "01/2024", valor: "1.234.567,89" }],
      });
      expect(r.somatoriaAno).toBe("1.234.567,89");
    });

    it("formato BR com prefixo R$ continua funcionando", () => {
      const r = fillFaturamentoDefaults({
        meses: [{ mes: "01/2024", valor: "R$ 1.234,56" }],
      });
      expect(r.somatoriaAno).toBe("1.234,56");
    });
  });
});

describe("fillSCRDefaults", () => {
  it("input vazio retorna semHistorico=true", () => {
    const r = fillSCRDefaults({});
    expect(r.semHistorico).toBe(true);
    expect(r.modalidades).toEqual([]);
  });

  it("semHistorico=false quando há totalDividasAtivas", () => {
    const r = fillSCRDefaults({ totalDividasAtivas: "1.000,00" });
    expect(r.semHistorico).toBe(false);
  });

  it("derivação curto/longo a partir de carteiraAVencer quando faixas vazias", () => {
    const r = fillSCRDefaults({
      carteiraAVencer: "R$ 1.000,00",
      faixasAVencer: {
        ate30d: "",
        d31_60: "",
        d61_90: "",
        d91_180: "",
        d181_360: "",
        acima360d: "R$ 200,00",
        prazoIndeterminado: "",
        total: "",
      },
    });
    // curto = 1000 - 200 = 800
    expect(r.carteiraCurtoPrazo).toMatch(/800/);
    expect(r.carteiraLongoPrazo).toMatch(/200/);
  });

  it("preserva tipoPessoa quando informado", () => {
    expect(fillSCRDefaults({ tipoPessoa: "PF" }).tipoPessoa).toBe("PF");
    expect(fillSCRDefaults({ tipoPessoa: "PJ" }).tipoPessoa).toBe("PJ");
    expect(fillSCRDefaults({}).tipoPessoa).toBeUndefined();
  });

  it("normaliza faixas mesmo com objeto parcial", () => {
    const r = fillSCRDefaults({ faixasAVencer: { ate30d: "100" } as never });
    expect(r.faixasAVencer?.ate30d).toBe("100");
    expect(r.faixasAVencer?.d31_60).toBe("");
  });

  it("derivação curto/longo quando aVencer>0 e faixas ausentes (sem acima360)", () => {
    // Cenário: prompt não extraiu nenhuma faixa, só carteiraAVencer.
    // Comportamento conservador: 100% curto prazo.
    const r = fillSCRDefaults({ carteiraAVencer: "R$ 1.000,00" });
    expect(r.carteiraCurtoPrazo).toMatch(/1.?000/);
    expect(r.carteiraLongoPrazo).toBe("0,00");
  });
});

describe("fillProtestosDefaults / fillProcessosDefaults / fillGrupoEconomicoDefaults", () => {
  it("Protestos: input vazio retorna arrays vazios e strings vazias", () => {
    const r = fillProtestosDefaults({});
    expect(r.detalhes).toEqual([]);
    expect(r.vigentesQtd).toBe("");
  });

  it("Processos: temRJ default false", () => {
    const r = fillProcessosDefaults({});
    expect(r.temRJ).toBe(false);
    expect(r.bancarios).toEqual([]);
  });

  it("Grupo: empresas default []", () => {
    expect(fillGrupoEconomicoDefaults({}).empresas).toEqual([]);
  });
});

describe("fillCurvaABCDefaults", () => {
  it("input vazio → defaults numericos como string '0.00' e arrays []", () => {
    const r = fillCurvaABCDefaults({});
    expect(r.clientes).toEqual([]);
    expect(r.concentracaoTop3).toBe("0.00");
    expect(r.alertaConcentracao).toBe(false);
    expect(r.totalClientesNaBase).toBe(0);
  });

  it("preserva valores informados", () => {
    const r = fillCurvaABCDefaults({
      maiorCliente: "ACME",
      concentracaoTop3: "65.00",
      alertaConcentracao: true,
    });
    expect(r.maiorCliente).toBe("ACME");
    expect(r.alertaConcentracao).toBe(true);
  });
});

describe("fillDREDefaults / fillBalancoDefaults", () => {
  it("DRE: tendenciaLucro default 'estavel'", () => {
    expect(fillDREDefaults({}).tendenciaLucro).toBe("estavel");
  });

  it("Balanço: tendenciaPatrimonio default 'estavel'", () => {
    expect(fillBalancoDefaults({}).tendenciaPatrimonio).toBe("estavel");
  });
});

describe("fillIRSocioDefaults", () => {
  it("input vazio → patrimônio recalculado como 0,00", () => {
    const r = fillIRSocioDefaults({});
    expect(r.patrimonioLiquido).toBe("0,00");
    expect(r.tipoDocumento).toBe("recibo");
  });

  it("recalcula PL como max(0, totalBens - dividasOnus)", () => {
    const r = fillIRSocioDefaults({
      totalBensDireitos: "1.000,00",
      dividasOnus: "300,00",
    });
    expect(r.patrimonioLiquido).toBe("700,00");
  });

  it("usa max(totalDoc, totalCalc) quando subcategorias divergem >5%", () => {
    // doc=640.000, calc=1.200.000 (soma de imoveis+veiculos+aplicacoes+outros+participacoes)
    const r = fillIRSocioDefaults({
      totalBensDireitos: "640.000,00",
      bensImoveis: "500.000,00",
      bensVeiculos: "300.000,00",
      aplicacoesFinanceiras: "200.000,00",
      outrosBens: "100.000,00",
      participacoesSocietarias: "100.000,00",
    });
    expect(r.totalBensDireitos).toBe("1.200.000,00");
  });

  it("inclui participacoesSocietarias quando >0", () => {
    const r = fillIRSocioDefaults({
      participacoesSocietarias: "50.000,00",
    });
    expect(r.participacoesSocietarias).toBe("50.000,00");
  });

  it("omite participacoesSocietarias quando vazio/zero", () => {
    const r = fillIRSocioDefaults({});
    expect(r.participacoesSocietarias).toBeUndefined();
  });
});

describe("fillRelatorioVisitaDefaults", () => {
  it("input vazio → defaults sensatos", () => {
    const r = fillRelatorioVisitaDefaults({});
    expect(r.recomendacaoVisitante).toBe("aprovado");
    expect(r.nivelConfiancaVisita).toBe("alto");
    expect(r.estruturaFisicaConfirmada).toBe(true);
    expect(r.funcionariosObservados).toBe(0);
  });

  it("preserva modalidade e taxas", () => {
    const r = fillRelatorioVisitaDefaults({
      modalidade: "comissaria",
      taxaConvencional: "2.5",
    });
    expect(r.modalidade).toBe("comissaria");
    expect(r.taxaConvencional).toBe("2.5");
  });
});

describe("countFilledFields", () => {
  it("conta strings não-vazias, arrays com length>0, e booleans (sempre)", () => {
    const result = countFilledFields({
      razaoSocial: "X",
      cnpj: "",
      socios: [{}] as never,
      vazia: [] as never,
      flag: true,
    } as never);
    // razaoSocial(1) + socios(1) + flag(1) = 3
    expect(result).toBe(3);
  });

  it("retorna 0 para objeto totalmente vazio", () => {
    expect(countFilledFields({ a: "", b: [] } as never)).toBe(0);
  });
});
