import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  adaptCNPJNew,
  adaptFaturamentoNew,
  adaptSCRNew,
  adaptContratoNew,
  adaptCurvaABCNew,
  adaptDRENew,
  adaptBalancoNew,
  adaptIRNew,
  adaptVisitaNew,
  adaptQSANew,
  directParseCurvaABC,
} from "@/lib/extract/adapters";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("adaptCNPJNew", () => {
  it("monta endereco a partir de objeto", () => {
    const r = adaptCNPJNew({
      endereco: {
        logradouro: "Rua X",
        numero: "100",
        complemento: "Sala 5",
        bairro: "Centro",
        municipio: "São Paulo",
        uf: "SP",
        cep: "01000-000",
      },
    });
    expect(r.endereco).toContain("Rua X, 100");
    expect(r.endereco).toContain("São Paulo/SP");
    expect(r.endereco).toContain("CEP 01000-000");
  });

  it("aceita endereco como string (formato antigo)", () => {
    expect(adaptCNPJNew({ endereco: "Rua Y, 200" }).endereco).toBe(
      "Rua Y, 200",
    );
  });

  it("concatena natureza juridica codigo+descricao", () => {
    const r = adaptCNPJNew({
      natureza_juridica_codigo: "206-2",
      natureza_juridica_descricao: "Sociedade Empresária Limitada",
    });
    expect(r.naturezaJuridica).toBe("206-2 - Sociedade Empresária Limitada");
  });

  it("deriva tipoEmpresa de natureza jurídica (LTDA)", () => {
    const r = adaptCNPJNew({
      natureza_juridica_descricao: "Sociedade Empresária Limitada",
    });
    expect(r.tipoEmpresa).toBe("LTDA");
  });

  it("deriva tipoEmpresa MEI", () => {
    const r = adaptCNPJNew({
      natureza_juridica_descricao: "Microempreendedor Individual",
    });
    expect(r.tipoEmpresa).toBe("MEI");
  });

  it("deriva tipoEmpresa S/A", () => {
    expect(
      adaptCNPJNew({ natureza_juridica_descricao: "Sociedade Anônima" })
        .tipoEmpresa,
    ).toBe("S/A");
  });

  it("converte cnaes_secundarios array em string ' ; '", () => {
    const r = adaptCNPJNew({
      cnaes_secundarios: [
        { codigo: "47.81-4-00", descricao: "Comércio varejista" },
        { codigo: "82.99-7-99", descricao: "Outras atividades" },
      ],
    });
    expect(r.cnaeSecundarios).toBe(
      "47.81-4-00 - Comércio varejista ; 82.99-7-99 - Outras atividades",
    );
  });

  it("aceita campos camelCase de fallback", () => {
    const r = adaptCNPJNew({
      razaoSocial: "Acme",
      cnaePrincipal: "47.81-4 - Varejo",
    });
    expect(r.razaoSocial).toBe("Acme");
    expect(r.cnaePrincipal).toBe("47.81-4 - Varejo");
  });
});

describe("adaptFaturamentoNew", () => {
  it("converte mês PT em formato MM/YYYY", () => {
    const r = adaptFaturamentoNew({
      meses: [
        { mes: "Janeiro", ano: "2024", total: 10000 },
        { mes: "Fevereiro", ano: 24, total: 20000 },
      ],
    });
    expect(r.meses).toHaveLength(2);
    expect(r.meses?.[0].mes).toBe("01/2024");
    expect(r.meses?.[1].mes).toBe("02/2024");
    expect(r.meses?.[0].valor).toBe("10.000,00");
  });

  it("aceita abreviação de mês (fev)", () => {
    const r = adaptFaturamentoNew({
      meses: [{ mes: "fev", ano: "2024", total: 100 }],
    });
    expect(r.meses?.[0].mes).toBe("02/2024");
  });

  it("filtra meses sem valor", () => {
    const r = adaptFaturamentoNew({
      meses: [
        { mes: "Janeiro", ano: "2024", total: 100 },
        { mes: "Fevereiro", ano: "2024", total: null },
      ],
    });
    expect(r.meses).toHaveLength(1);
  });

  it("monta fmmAnual a partir de totais_por_ano", () => {
    const r = adaptFaturamentoNew({
      totais_por_ano: [
        { ano: "2024", media_mensal: 50000, total: 600000 },
      ],
    }) as ReturnType<typeof adaptFaturamentoNew> & {
      fmmAnual?: Record<string, string>;
    };
    expect(r.fmmAnual?.["2024"]).toBe("50.000,00");
  });
});

describe("adaptSCRNew", () => {
  it("infere tipoPessoa de tipo_cliente", () => {
    expect(adaptSCRNew({ tipo_cliente: "PF" }).tipoPessoa).toBe("PF");
    expect(adaptSCRNew({ tipo_cliente: "pj" }).tipoPessoa).toBe("PJ");
    expect(adaptSCRNew({ tipo_cliente: "?" }).tipoPessoa).toBeUndefined();
  });

  it("rota cpf_cnpj para cpfSCR quando PF, cnpjSCR quando PJ", () => {
    const pf = adaptSCRNew({ tipo_cliente: "PF", cpf_cnpj: "111" });
    expect(pf.cpfSCR).toBe("111");
    expect(pf.cnpjSCR).toBe("");
    const pj = adaptSCRNew({ tipo_cliente: "PJ", cpf_cnpj: "222" });
    expect(pj.cnpjSCR).toBe("222");
    expect(pj.cpfSCR).toBe("");
  });

  it("recalcula carteiraAVencer pela soma de faixas (Gemini omite 14-30d no total)", () => {
    const r = adaptSCRNew({
      tipo_cliente: "PJ",
      carteira_a_vencer: {
        de_14_a_30_dias: 100,
        de_31_a_60_dias: 200,
        acima_de_360_dias: 700,
        total: 800, // omitiu a faixa 14-30
      },
    });
    // curto = 100+200 = 300; longo = 700; total = 1000
    expect(r.carteiraAVencer).toBe("R$ 1.000,00");
  });

  it("classifica modalidade VENCIDA como VENCIDO", () => {
    const r = adaptSCRNew({
      modalidades: [
        { subdominio: "Cheque", situacao: "VENCIDA", valor: 500 },
        { subdominio: "Duplicata", situacao: "A VENCER", valor: 1000 },
      ],
    });
    expect(r.modalidades?.[0].vencido).toBe("R$ 500,00");
    expect(r.modalidades?.[0].aVencer).toBe("");
    expect(r.modalidades?.[1].aVencer).toBe("R$ 1.000,00");
  });

  it("prioriza vencidos.total declarado sobre soma de faixas", () => {
    const r = adaptSCRNew({
      tipo_cliente: "PJ",
      vencidos: {
        de_15_a_30_dias: 100,
        de_31_a_60_dias: 200,
        total: 5000, // total declarado
      },
    });
    expect(r.vencidos).toBe("R$ 5.000,00");
  });

  it("vencidos.total como string BR formatada vai pro total declarado (regressão fix #1)", () => {
    // Antes do fix, Number("5.000,00") = NaN → caía no fallback de soma de faixas.
    const r = adaptSCRNew({
      tipo_cliente: "PJ",
      vencidos: {
        de_15_a_30_dias: 100,
        de_31_a_60_dias: 200,
        total: "5.000,00",
      },
    });
    expect(r.vencidos).toBe("R$ 5.000,00");
  });

  it("prejuizos.total como string BR formatada (regressão fix #1)", () => {
    const r = adaptSCRNew({
      tipo_cliente: "PJ",
      prejuizos: { ate_12_meses: 50, total: "1.234,56" },
    });
    expect(r.prejuizos).toBe("R$ 1.234,56");
  });

  it("preenche faixasPrejuizos.ate12m / acima12m", () => {
    const r = adaptSCRNew({
      prejuizos: { ate_12_meses: 100, acima_12_meses: 200, total: 300 },
    });
    expect(r.faixasPrejuizos?.ate12m).toBe("R$ 100,00");
    expect(r.faixasPrejuizos?.acima12m).toBe("R$ 200,00");
  });

  it("propaga semDados quando sem_dados_scr=true", () => {
    expect(adaptSCRNew({ sem_dados_scr: true }).semDados).toBe(true);
    expect(adaptSCRNew({ sem_dados_scr: false }).semDados).toBeUndefined();
  });
});

describe("adaptContratoNew", () => {
  it("calcula participação por quotas/total_quotas", () => {
    const r = adaptContratoNew({
      total_quotas: 1000,
      socios: [
        { nome: "A", cpf: "111", quotas: 600 },
        { nome: "B", cpf: "222", quotas: 400 },
      ],
    });
    expect(r.socios?.[0].participacao).toBe("60,00%");
    expect(r.socios?.[1].participacao).toBe("40,00%");
  });

  it("usa percentual_participacao quando informado", () => {
    const r = adaptContratoNew({
      socios: [{ nome: "A", cpf: "111", percentual_participacao: 75 }],
    });
    expect(r.socios?.[0].participacao).toBe("75%");
  });

  it("anexa (Administrador) quando administrador=true e qualif não menciona", () => {
    const r = adaptContratoNew({
      socios: [
        { nome: "A", cpf: "111", qualificacao: "Sócio", administrador: true },
      ],
    });
    expect(r.socios?.[0].qualificacao).toBe("Sócio (Administrador)");
  });

  it("administracao = nomes de socios com administrador=true (fallback)", () => {
    const r = adaptContratoNew({
      socios: [
        { nome: "A", cpf: "111", administrador: true },
        { nome: "B", cpf: "222", administrador: false },
      ],
    });
    expect(r.administracao).toBe("A");
  });

  it("temAlteracoes=true quando ultima_alteracao tem dados", () => {
    expect(
      adaptContratoNew({ ultima_alteracao: { tipo_ato: "20a alteração" } })
        .temAlteracoes,
    ).toBe(true);
    expect(adaptContratoNew({}).temAlteracoes).toBe(false);
  });

  it("filiais filtradas quando sem cnpj/municipio", () => {
    const r = adaptContratoNew({
      filiais: [
        { cnpj: "00.000.000/0002-99", municipio: "SP" },
        {}, // descartada
      ],
    }) as ReturnType<typeof adaptContratoNew> & { filiais?: unknown[] };
    expect(r.filiais).toHaveLength(1);
  });
});

describe("adaptCurvaABCNew", () => {
  it("ordena clientes por valor decrescente", () => {
    const r = adaptCurvaABCNew({
      curva_abc_clientes: [
        { cliente: "Pequeno", valor: 100, percentual: 10 },
        { cliente: "Grande", valor: 800, percentual: 80 },
        { cliente: "Medio", valor: 100, percentual: 10 },
      ],
    });
    expect(r.clientes?.[0].nome).toBe("Grande");
    expect(r.clientes?.[0].posicao).toBe(1);
    expect(r.maiorCliente).toBe("Grande");
  });

  it("classifica A (≤80%), B (≤95%), C (>95%) cumulativo", () => {
    const r = adaptCurvaABCNew({
      curva_abc_clientes: [
        { cliente: "X", valor: 800, percentual: 80 },
        { cliente: "Y", valor: 150, percentual: 15 },
        { cliente: "Z", valor: 50, percentual: 5 },
      ],
    });
    expect(r.clientes?.[0].classe).toBe("A");
    expect(r.clientes?.[1].classe).toBe("B");
    expect(r.clientes?.[2].classe).toBe("C");
  });

  it("alertaConcentracao=true quando top3 > 50%", () => {
    const r = adaptCurvaABCNew({
      curva_abc_clientes: [
        { cliente: "A", valor: 600, percentual: 60 },
        { cliente: "B", valor: 100, percentual: 10 },
      ],
    });
    expect(r.alertaConcentracao).toBe(true);
  });

  it("cumulativa SEMPRE vence sobre classificacao raw do Gemini (fix bug #2)", () => {
    // Mesmo que Gemini retorne classificacao errada, o adapter deve corrigir
    // baseado no percentual acumulado. Fonte da verdade é a cumulativa.
    const r = adaptCurvaABCNew({
      curva_abc_clientes: [
        { cliente: "Topo", valor: 600, percentual: 60, classificacao: "C" },
        { cliente: "Meio", valor: 200, percentual: 20, classificacao: "C" },
        { cliente: "Cauda", valor: 100, percentual: 10, classificacao: "C" },
      ],
    });
    // Acumulado: 60 → A, 80 → A, 90 → B
    expect(r.clientes?.[0].classe).toBe("A");
    expect(r.clientes?.[1].classe).toBe("A");
    expect(r.clientes?.[2].classe).toBe("B");
    expect(r.totalClientesClasseA).toBe(2);
  });

  it("ainda classifica corretamente quando classificacao raw concorda", () => {
    const r = adaptCurvaABCNew({
      curva_abc_clientes: [
        { cliente: "X", valor: 800, percentual: 80, classificacao: "A" },
        { cliente: "Y", valor: 150, percentual: 15, classificacao: "B" },
      ],
    });
    expect(r.clientes?.[0].classe).toBe("A");
    expect(r.clientes?.[1].classe).toBe("B");
  });

  it("alertaConcentracao=false quando top3 ≤ 50%", () => {
    const r = adaptCurvaABCNew({
      curva_abc_clientes: Array.from({ length: 10 }, (_, i) => ({
        cliente: `C${i}`,
        valor: 100,
        percentual: 10,
      })),
    });
    expect(r.alertaConcentracao).toBe(false);
  });
});

describe("adaptDRENew", () => {
  it("calcula tendencia 'crescimento' quando ultimo > primeiro * 1.05", () => {
    const r = adaptDRENew({
      anos: [
        { ano: "2022", lucro_liquido_exercicio: 100 },
        { ano: "2023", lucro_liquido_exercicio: 200 },
      ],
    });
    expect(r.tendenciaLucro).toBe("crescimento");
  });

  it("calcula tendencia 'queda' quando ultimo < primeiro * 0.95", () => {
    const r = adaptDRENew({
      anos: [
        { ano: "2022", lucro_liquido_exercicio: 1000 },
        { ano: "2023", lucro_liquido_exercicio: 100 },
      ],
    });
    expect(r.tendenciaLucro).toBe("queda");
  });

  it("tendencia 'estavel' quando dentro de ±5%", () => {
    const r = adaptDRENew({
      anos: [
        { ano: "2022", lucro_liquido_exercicio: 100 },
        { ano: "2023", lucro_liquido_exercicio: 102 },
      ],
    });
    expect(r.tendenciaLucro).toBe("estavel");
  });

  it("calcula resultadoFinanceiro = receitas - |despesas|", () => {
    const r = adaptDRENew({
      anos: [
        {
          ano: "2024",
          receitas_financeiras: 100,
          despesas_financeiras: -300, // valor negativo é tratado por Math.abs
        },
      ],
    });
    expect(r.anos?.[0].resultadoFinanceiro).toBe("R$ -200,00");
  });
});

describe("adaptBalancoNew", () => {
  it("extrai indicadores de a.indicadores", () => {
    const r = adaptBalancoNew({
      anos: [
        {
          ano: "2024",
          ativo_total: 1000000,
          indicadores: {
            liquidez_corrente: "1.5",
            liquidez_geral: "1.2",
            endividamento_total_percent: "45",
            capital_de_giro: 100000,
          },
        },
      ],
    });
    expect(r.anos?.[0].liquidezCorrente).toBe("1.5");
    expect(r.anos?.[0].endividamentoTotal).toBe("45");
  });

  it("periodoMaisRecente é o último ano", () => {
    const r = adaptBalancoNew({
      anos: [{ ano: "2022" }, { ano: "2023" }, { ano: "2024" }],
    });
    expect(r.periodoMaisRecente).toBe("2024");
  });
});

describe("adaptIRNew", () => {
  it("agrupa bens_e_direitos por grupo DIRPF (01=imoveis, 02=veiculos, 03=part, 04-07=aplicacoes)", () => {
    const r = adaptIRNew({
      bens_e_direitos: [
        { grupo: "01", discriminacao: "Casa", valor_atual: 500000 },
        { grupo: "02", discriminacao: "Carro", valor_atual: 50000 },
        { grupo: "03", discriminacao: "Quotas Acme", valor_atual: 100000 },
        { grupo: "04", discriminacao: "Tesouro", valor_atual: 30000 },
        { grupo: "07", discriminacao: "Fundo XP", valor_atual: 20000 },
      ],
    });
    expect(r.bensImoveis).toBe("500.000,00");
    expect(r.bensVeiculos).toBe("50.000,00");
    expect(r.participacoesSocietarias).toBe("100.000,00");
    expect(r.aplicacoesFinanceiras).toBe("50.000,00");
  });

  it("agrupa grupos 05 e 06 (aplicações) com 04 e 07", () => {
    const r = adaptIRNew({
      bens_e_direitos: [
        { grupo: "04", discriminacao: "Tesouro", valor_atual: 100 },
        { grupo: "05", discriminacao: "Poupança", valor_atual: 200 },
        { grupo: "06", discriminacao: "CDB", valor_atual: 300 },
        { grupo: "07", discriminacao: "Fundo", valor_atual: 400 },
      ],
    });
    // Soma 100+200+300+400 = 1.000
    expect(r.aplicacoesFinanceiras).toBe("1.000,00");
  });

  it("aceita grupo sem zero à esquerda (1 → 01)", () => {
    const r = adaptIRNew({
      bens_e_direitos: [{ grupo: "1", discriminacao: "Casa", valor_atual: 100 }],
    });
    expect(r.bensImoveis).toBe("100,00");
  });

  it("extrai sociedades do grupo 03 com cnpj de discriminacao", () => {
    const r = adaptIRNew({
      bens_e_direitos: [
        {
          grupo: "03",
          discriminacao: "Acme Ltda - 12.345.678/0001-90",
          valor_atual: 100000,
        },
      ],
    });
    expect(r.sociedades).toHaveLength(1);
    expect(r.sociedades?.[0].cnpj).toBe("12.345.678/0001-90");
    expect(r.temSociedades).toBe(true);
  });

  it("usa cnpj_empresa quando disponível", () => {
    const r = adaptIRNew({
      bens_e_direitos: [
        {
          grupo: "03",
          discriminacao: "Quotas Acme",
          cnpj_empresa: "11.111.111/0001-11",
          valor_atual: 100,
        },
      ],
    });
    expect(r.sociedades?.[0].cnpj).toBe("11.111.111/0001-11");
  });

  it("infere tipoDocumento de tipo_declaracao", () => {
    expect(adaptIRNew({ tipo_declaracao: "Recibo de entrega" }).tipoDocumento).toBe("recibo");
    expect(adaptIRNew({ tipo_declaracao: "Extrato detalhado" }).tipoDocumento).toBe("extrato");
    expect(adaptIRNew({ tipo_declaracao: "Declaração completa" }).tipoDocumento).toBe("declaracao");
  });

  it("soma rendimentos exclusivos do resumo (preferência) ou da array", () => {
    // Resumo tem prioridade
    const r1 = adaptIRNew({
      resumo: { rendimentos_tributacao_exclusiva: 1000 },
      rendimentos_tributacao_exclusiva: [{ valor: 500 }],
    });
    expect(r1.rendimentosTributacaoExclusiva).toBe("1.000,00");
    // Sem resumo, soma a array
    const r2 = adaptIRNew({
      rendimentos_tributacao_exclusiva: [{ valor: 500 }, { valor: 200 }],
    });
    expect(r2.rendimentosTributacaoExclusiva).toBe("700,00");
  });

  it("debitosEmAberto reflete debitos_receita_federal=true", () => {
    expect(adaptIRNew({ debitos_receita_federal: true }).debitosEmAberto).toBe(true);
    expect(adaptIRNew({ debitos_receita_federal: false }).debitosEmAberto).toBe(false);
  });

  it("parseia valor inteiro BR com milhar (10.809.058)", () => {
    const r = adaptIRNew({
      bens_e_direitos: [
        { grupo: "01", discriminacao: "X", valor_atual: "10.809.058" },
      ],
    });
    expect(r.bensImoveis).toBe("10.809.058,00");
  });
});

describe("adaptVisitaNew", () => {
  it("classifica recomendacao 'condicional'/'reprovado'/'aprovado'", () => {
    expect(adaptVisitaNew({ recomendacao: "Reprovado" }).recomendacaoVisitante).toBe("reprovado");
    expect(adaptVisitaNew({ recomendacao: "Aprovação condicional" }).recomendacaoVisitante).toBe("condicional");
    expect(adaptVisitaNew({ recomendacao: "OK" }).recomendacaoVisitante).toBe("aprovado");
  });

  it("descarta gerente_responsavel genérico (apenas role)", () => {
    expect(adaptVisitaNew({ gerente_responsavel: "Gerente" }).responsavelVisita).toBe("");
    expect(adaptVisitaNew({ gerente_responsavel: "Analista de Crédito" }).responsavelVisita).toBe("");
    expect(adaptVisitaNew({ gerente_responsavel: "João Silva" }).responsavelVisita).toBe("João Silva");
  });

  it("infere modalidade de parametros_sugeridos.modalidade_operacao", () => {
    expect(adaptVisitaNew({
      parametros_sugeridos: { modalidade_operacao: "Comissária" },
    }).modalidade).toBe("comissaria");
    expect(adaptVisitaNew({
      parametros_sugeridos: { modalidade_operacao: "Convencional" },
    }).modalidade).toBe("convencional");
    expect(adaptVisitaNew({
      parametros_sugeridos: { modalidade_operacao: "Híbrida" },
    }).modalidade).toBe("hibrida");
    // Sem acento também funciona
    expect(adaptVisitaNew({
      parametros_sugeridos: { modalidade_operacao: "hibrida" },
    }).modalidade).toBe("hibrida");
  });

  it("monta localVisita a partir de endereco_visitado", () => {
    const r = adaptVisitaNew({
      endereco_visitado: {
        logradouro: "Av X",
        numero: "100",
        municipio: "Curitiba",
        uf: "PR",
        cep: "80000-000",
      },
    });
    expect(r.localVisita).toContain("Av X");
    expect(r.localVisita).toContain("Curitiba");
    expect(r.localVisita).toContain("CEP 80000-000");
  });

  it("trancheChecagem aceita texto descritivo (não-numérico)", () => {
    const r = adaptVisitaNew({
      parametros_sugeridos: { tranche_checagem: "Sem checagem comissária" },
    });
    expect(r.trancheChecagem).toBe("Sem checagem comissária");
  });

  it("trancheChecagem formata número como dinheiro", () => {
    const r = adaptVisitaNew({
      parametros_sugeridos: { tranche_checagem: 50000 },
    });
    expect(r.trancheChecagem).toBe("R$ 50.000,00");
  });
});

describe("adaptQSANew", () => {
  it("monta qualificação CODIGO - DESCRIÇÃO", () => {
    const r = adaptQSANew({
      socios: [
        {
          nome: "X",
          cpf: "111",
          qualificacao_codigo: "49",
          qualificacao_descricao: "Sócio-Administrador",
        },
      ],
    });
    expect(r.quadroSocietario?.[0].qualificacao).toBe(
      "49 - Sócio-Administrador",
    );
  });

  it("aceita formato camelCase legado (quadroSocietario)", () => {
    const r = adaptQSANew({
      quadroSocietario: [{ nome: "Y", cpfCnpj: "222" }],
    });
    expect(r.quadroSocietario).toHaveLength(1);
    expect(r.quadroSocietario?.[0].nome).toBe("Y");
  });
});

describe("directParseCurvaABC", () => {
  it("retorna null com menos de 5 clientes", () => {
    const text = "CLIENTE         VALOR     %\nFulano Ltda     1.234,56  10\n";
    expect(directParseCurvaABC(text)).toBeNull();
  });

  it("extrai período de referência", () => {
    const text = `Período: de 01/01/2024 a 31/12/2024
Acme Industria Ltda   100.000,00  10  A
Beta Comercio SA       80.000,00   8  A
Gamma Servicos         70.000,00   7  A
Delta Logistica        60.000,00   6  A
Epsilon ME             50.000,00   5  A
Zeta Distribuidora     40.000,00   4  B
`;
    const r = directParseCurvaABC(text);
    expect(r).not.toBeNull();
    expect(r?.periodoReferencia).toBe("01/01/2024 a 31/12/2024");
    expect(r?.clientes.length).toBeGreaterThanOrEqual(5);
  });

  it("identifica classificação A/B/C no fim da linha", () => {
    const text = `Acme Industria      100.000,00  10  A
Beta Comercio        80.000,00   8  B
Gamma Servicos       70.000,00   7  C
Delta Logistica      60.000,00   6  A
Epsilon ME           50.000,00   5  A
`;
    const r = directParseCurvaABC(text);
    expect(r?.clientes.find(c => c.cliente.startsWith("Acme"))?.classificacao).toBe("A");
    expect(r?.clientes.find(c => c.cliente.startsWith("Beta"))?.classificacao).toBe("B");
    expect(r?.clientes.find(c => c.cliente.startsWith("Gamma"))?.classificacao).toBe("C");
  });
});
