import { describe, it, expect } from "vitest";
import {
  mapearSacado,
  extractUFFromEndereco,
} from "@/lib/sacados/consultarSacados";
import type { TopSacadoEntry } from "@/lib/sacados/extractTopSacados";
import type { CreditHubResult } from "@/lib/bureaus/credithub";
import type { BigDataCorpResult } from "@/lib/bureaus/bigdatacorp";
import type { AssertivaResult } from "@/lib/bureaus/assertiva";

function assertivaOk(over: Partial<AssertivaResult["empresa"]> = {}): AssertivaResult {
  return {
    success: true,
    mock: false,
    empresa: {
      cnpj: "12345678000199",
      scoreAssertivaPJ: 720,
      scoreClasse: "B",
      negativacoesAssertiva: 0,
      rendaPresumidaPJ: "R$ 1.000.000,00",
      protestosQtd: 0,
      protestosValor: 0,
      protestoCompleto: true,
      protestosLista: [],
      consultasTotal: 0,
      consultasRecentes: [],
      consultasUltima: "",
      ...over,
    } as AssertivaResult["empresa"],
  };
}

function topSacado(over: Partial<TopSacadoEntry> = {}): TopSacadoEntry {
  return {
    cnpj: "12345678000199",
    razaoSocial: "Sacado da Curva",
    posicao: 1,
    valorFaturado: "R$ 1.000,00",
    participacaoFaturamentoPct: "10,0%",
    classe: "A",
    valorNumerico: 1000,
    ...over,
  };
}

function chOk(over: Partial<CreditHubResult> = {}): CreditHubResult {
  return {
    success: true,
    mock: false,
    cnpjEnrichment: { endereco: "Rua A, 100 - São Paulo/SP" },
    qsaEnrichment: {
      capitalSocial: "R$ 100.000,00",
      quadroSocietario: [{ nome: "Sócio CH", cpfCnpj: "11122233344", participacao: "100%", qualificacao: "Sócio" }],
    },
    ...over,
  };
}

function bdcOk(over: Partial<BigDataCorpResult> = {}): BigDataCorpResult {
  return {
    success: true,
    mock: false,
    cnpjEnrichment: { razaoSocial: "BDC LTDA", endereco: "Av Paulista 1000 SP" },
    ...over,
  };
}

describe("extractUFFromEndereco", () => {
  it("extrai UF no final do endereço", () => {
    expect(extractUFFromEndereco("Rua A, 100 - São Paulo/SP")).toBe("SP");
    expect(extractUFFromEndereco("Av. Brasil, 500 - RJ")).toBe("RJ");
  });

  it("extrai UF no meio do endereço", () => {
    expect(extractUFFromEndereco("Rua X 100 SP, 01310-100")).toBe("SP");
  });

  it("descarta 'BR' isolado (não é UF)", () => {
    expect(extractUFFromEndereco("BR-101 KM 50, Rio de Janeiro/RJ")).toBe("RJ");
  });

  it("retorna undefined quando não acha UF válida", () => {
    expect(extractUFFromEndereco(undefined)).toBeUndefined();
    expect(extractUFFromEndereco("Sem UF aqui")).toBeUndefined();
    expect(extractUFFromEndereco("")).toBeUndefined();
  });
});

describe("mapearSacado", () => {
  it("BDC fornece razão social; CH só tem enrichment cadastral", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: chOk(),
      bdc: bdcOk(),
    });
    expect(out.razaoSocial).toBe("BDC LTDA");
  });

  it("fallback razão social = nome da Curva ABC quando bureaus vazios", () => {
    const out = mapearSacado({
      topSacado: topSacado({ razaoSocial: "Curva ABC Nome" }),
      ch: undefined,
      bdc: undefined,
    });
    expect(out.razaoSocial).toBe("Curva ABC Nome");
    expect(out.fonteBureau).toBeUndefined();
  });

  it("sócios preferem CH; BDC entra quando CH vazio", () => {
    const ch = chOk({ qsaEnrichment: { capitalSocial: "R$ 0,00", quadroSocietario: [] } });
    const bdc = bdcOk({
      qsaEnrichment: {
        quadroSocietario: [{ nome: "Sócio BDC", cpfCnpj: "55566677788", participacao: "50%", qualificacao: "Sócio" }],
      },
    });
    const out = mapearSacado({ topSacado: topSacado(), ch, bdc });
    expect(out.socios).toHaveLength(1);
    expect(out.socios[0].nome).toBe("Sócio BDC");
    expect(out.socios[0].cpf).toBe("55566677788");
  });

  it("endereço prefere CH, com UF derivada", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: chOk({ cnpjEnrichment: { endereco: "Rua das Flores, 100 - Santos/SP" } }),
      bdc: bdcOk({ cnpjEnrichment: { razaoSocial: "X", endereco: "Outro Endereço/RJ" } }),
    });
    expect(out.enderecoCompleto).toBe("Rua das Flores, 100 - Santos/SP");
    expect(out.uf).toBe("SP");
  });

  it("protestos e processos vêm do CH (preferência) ou BDC", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: chOk({
        protestos: {
          vigentesQtd: "3",
          vigentesValor: "R$ 12.000,00",
          regularizadosQtd: "0",
          regularizadosValor: "R$ 0,00",
          detalhes: [],
        },
        processos: {
          passivosTotal: "5",
          ativosTotal: "0",
          valorTotalEstimado: "R$ 250.000,00",
          temRJ: false,
          distribuicao: [],
          bancarios: [],
          fiscais: [],
          fornecedores: [],
          outros: [],
        },
      }),
      bdc: undefined,
    });
    expect(out.protestosQtd).toBe(3);
    expect(out.protestosValorTotal).toBe("R$ 12.000,00");
    expect(out.processosPassivos).toBe(5);
    expect(out.processosValorTotal).toBe("R$ 250.000,00");
  });

  it("normaliza protestos/processos vazios em zeros sem inflar", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: chOk({
        protestos: {
          vigentesQtd: "0",
          vigentesValor: "R$ 0,00",
          regularizadosQtd: "0",
          regularizadosValor: "R$ 0,00",
          detalhes: [],
        },
      }),
      bdc: undefined,
    });
    expect(out.protestosQtd).toBe(0);
    expect(out.protestosValorTotal).toBeUndefined();
  });

  it("fonteBureau='ambos' quando os dois respondem com sucesso", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: chOk(),
      bdc: bdcOk(),
    });
    expect(out.fonteBureau).toBe("ambos");
  });

  it("fonteBureau='credithub' quando só CH responde", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: chOk(),
      bdc: { success: false, mock: false, error: "BDC down" },
    });
    expect(out.fonteBureau).toBe("credithub");
  });

  it("fonteBureau='bdc' quando só BDC responde (CH em mock)", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: { success: false, mock: true },
      bdc: bdcOk(),
    });
    expect(out.fonteBureau).toBe("bdc");
  });

  it("score e scoreClasse vêm do Assertiva quando fornecido", () => {
    const out = mapearSacado({
      topSacado: topSacado(),
      ch: chOk(),
      bdc: bdcOk(),
      assertiva: assertivaOk({ scoreAssertivaPJ: 850, scoreClasse: "A" }),
    });
    expect(out.score).toBe(850);
    expect(out.scoreClasse).toBe("A");
  });

  it("score fica undefined quando Assertiva ausente ou score=0", () => {
    const out1 = mapearSacado({ topSacado: topSacado(), ch: chOk(), bdc: bdcOk() });
    expect(out1.score).toBeUndefined();
    expect(out1.scoreClasse).toBeUndefined();

    const out2 = mapearSacado({
      topSacado: topSacado(),
      ch: chOk(),
      bdc: bdcOk(),
      assertiva: assertivaOk({ scoreAssertivaPJ: 0, scoreClasse: "" }),
    });
    expect(out2.score).toBeUndefined();
    expect(out2.scoreClasse).toBeUndefined();
  });

  it("preserva campos da TopSacadoEntry (posicao, classe, percentual)", () => {
    const out = mapearSacado({
      topSacado: topSacado({ posicao: 7, classe: "B", participacaoFaturamentoPct: "12,3%" }),
      ch: chOk(),
      bdc: bdcOk(),
    });
    expect(out.posicao).toBe(7);
    expect(out.classe).toBe("B");
    expect(out.participacaoFaturamentoPct).toBe("12,3%");
  });
});
