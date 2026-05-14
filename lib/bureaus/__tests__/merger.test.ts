import { describe, it, expect } from "vitest";
import { mergeBureauResults, type BureauResults } from "@/lib/bureaus/merger";
import type { ExtractedData, SCRSocioData, SCRData } from "@/types";
import type { AssertivaSocioData } from "@/lib/bureaus/assertiva";

const baseScrSocio = (overrides: Partial<SCRSocioData> = {}): SCRSocioData => ({
  nomeSocio: "FULANO DA SILVA",
  cpfSocio: "12345678900",
  tipoPessoa: "PF",
  periodoAtual: {
    periodoReferencia: "12/2025",
    carteiraAVencer: "R$ 100.000,00",
    vencidos: "",
    prejuizos: "",
    qtdeOperacoes: "1",
    qtdeInstituicoes: "1",
  } as unknown as SCRData,
  ...overrides,
});

const baseAssertivaSocio = (overrides: Partial<AssertivaSocioData> = {}): AssertivaSocioData => ({
  cpf: "12345678900",
  nome: "FULANO DA SILVA",
  scoreAssertivaPF: 750,
  scoreClasse: "B",
  rendaPresumida: "R$ 5.000,00",
  patrimonioEstimado: "R$ 250.000,00",
  validacaoIdentidade: "ok",
  protestosQtd: 0,
  protestosValor: 0,
  protestosLista: [],
  bensVeiculos: [],
  bensImoveis: [],
  ...overrides,
});

const mkData = (scrSocios: SCRSocioData[]): ExtractedData =>
  ({ scrSocios } as unknown as ExtractedData);

describe("mergeBureauResults — enriquecimento Assertiva ↔ SCRSocio (C-07)", () => {
  it("casa CPF de scrSocio com socio Assertiva e injeta scoreAssertivaPF/rendaPresumida/patrimonioEstimado", () => {
    const data = mkData([baseScrSocio()]);
    const results: BureauResults = {
      assertiva: {
        success: true,
        mock: false,
        socios: [baseAssertivaSocio()],
      },
    };

    const merged = mergeBureauResults(data, results);

    expect(merged.scrSocios).toBeDefined();
    expect(merged.scrSocios).toHaveLength(1);
    const enriched = merged.scrSocios![0];
    expect(enriched.scoreAssertivaPF).toBe(750);
    expect(enriched.rendaPresumida).toBe("R$ 5.000,00");
    expect(enriched.patrimonioEstimado).toBe("R$ 250.000,00");
    expect(enriched.validacaoIdentidade).toBe("ok");
  });

  it("normaliza CPF com pontuação ao casar (12.345.678-90 ↔ 12345678900)", () => {
    const data = mkData([baseScrSocio({ cpfSocio: "123.456.789-00" })]);
    const results: BureauResults = {
      assertiva: {
        success: true,
        mock: false,
        socios: [baseAssertivaSocio({ cpf: "12345678900" })],
      },
    };

    const merged = mergeBureauResults(data, results);
    expect(merged.scrSocios![0].scoreAssertivaPF).toBe(750);
  });

  it("preserva socio inalterado quando CPF não casa com nenhum sócio Assertiva", () => {
    const data = mkData([baseScrSocio({ cpfSocio: "99999999999" })]);
    const results: BureauResults = {
      assertiva: {
        success: true,
        mock: false,
        socios: [baseAssertivaSocio({ cpf: "11111111111" })],
      },
    };

    const merged = mergeBureauResults(data, results);
    expect(merged.scrSocios![0].scoreAssertivaPF).toBeUndefined();
    expect(merged.scrSocios![0].rendaPresumida).toBeUndefined();
  });

  it("merge transfere bensVeiculos e bensImoveis quando vazios no SCR e preenchidos no Assertiva", () => {
    const data = mkData([baseScrSocio()]);
    const results: BureauResults = {
      assertiva: {
        success: true,
        mock: false,
        socios: [
          baseAssertivaSocio({
            bensVeiculos: [
              { placa: "ABC1D23", modelo: "Civic", ano: 2020, valorFipe: "R$ 80.000,00", situacao: "ok" },
            ],
            bensImoveis: [
              { municipio: "São Paulo", uf: "SP" },
            ],
          }),
        ],
      },
    };

    const merged = mergeBureauResults(data, results);
    expect(merged.scrSocios![0].bensVeiculos).toHaveLength(1);
    expect(merged.scrSocios![0].bensVeiculos![0].modelo).toBe("Civic");
    expect(merged.scrSocios![0].bensImoveis).toHaveLength(1);
  });
});
