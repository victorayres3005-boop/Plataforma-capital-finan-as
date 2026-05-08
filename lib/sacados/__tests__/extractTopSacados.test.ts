import { describe, it, expect } from "vitest";
import {
  extractTopSacados,
  isLikelyCnpj,
  onlyDigits,
} from "@/lib/sacados/extractTopSacados";
import type { CurvaABCData, ClienteCurvaABC } from "@/types";

function cliente(over: Partial<ClienteCurvaABC>): ClienteCurvaABC {
  return {
    posicao: 1,
    nome: "Cliente X",
    cnpjCpf: "12.345.678/0001-99",
    valorFaturado: "R$ 1.000,00",
    percentualReceita: "10,0%",
    percentualAcumulado: "10,0%",
    classe: "A",
    ...over,
  };
}

function curva(clientes: ClienteCurvaABC[]): CurvaABCData {
  return {
    clientes,
    totalClientesNaBase: clientes.length,
    totalClientesExtraidos: clientes.length,
    periodoReferencia: "2025-01 a 2025-12",
    receitaTotalBase: "R$ 100.000,00",
    concentracaoTop3: "30%",
    concentracaoTop5: "50%",
    concentracaoTop10: "75%",
    totalClientesClasseA: 1,
    receitaClasseA: "R$ 50.000,00",
    maiorCliente: "Cliente X",
    maiorClientePct: "10%",
    alertaConcentracao: false,
  };
}

describe("onlyDigits", () => {
  it("remove tudo que não é dígito", () => {
    expect(onlyDigits("12.345.678/0001-99")).toBe("12345678000199");
    expect(onlyDigits("12345")).toBe("12345");
    expect(onlyDigits("")).toBe("");
    expect(onlyDigits(null)).toBe("");
    expect(onlyDigits(undefined)).toBe("");
  });
});

describe("isLikelyCnpj", () => {
  it("aceita CNPJ formatado e cru", () => {
    expect(isLikelyCnpj("12.345.678/0001-99")).toBe(true);
    expect(isLikelyCnpj("12345678000199")).toBe(true);
  });

  it("rejeita CPFs (11 dígitos), strings vazias e lixo", () => {
    expect(isLikelyCnpj("123.456.789-00")).toBe(false); // CPF
    expect(isLikelyCnpj("")).toBe(false);
    expect(isLikelyCnpj(null)).toBe(false);
    expect(isLikelyCnpj("—")).toBe(false);
    expect(isLikelyCnpj("abcdefghij1234")).toBe(false);
  });

  it("rejeita CNPJ zerado ou repetido uniformemente", () => {
    expect(isLikelyCnpj("00000000000000")).toBe(false);
    expect(isLikelyCnpj("11111111111111")).toBe(false);
  });
});

describe("extractTopSacados", () => {
  it("retorna [] quando curva é vazia/null/undefined", () => {
    expect(extractTopSacados(undefined)).toEqual([]);
    expect(extractTopSacados(null)).toEqual([]);
    expect(extractTopSacados(curva([]))).toEqual([]);
  });

  it("filtra CPFs e fica só com CNPJs", () => {
    const c = curva([
      cliente({ posicao: 1, nome: "Empresa PJ", cnpjCpf: "12.345.678/0001-99", valorFaturado: "R$ 5.000,00" }),
      cliente({ posicao: 2, nome: "Pessoa PF", cnpjCpf: "123.456.789-00", valorFaturado: "R$ 10.000,00" }),
      cliente({ posicao: 3, nome: "Lixo", cnpjCpf: "—", valorFaturado: "R$ 20.000,00" }),
    ]);
    const out = extractTopSacados(c, 5);
    expect(out).toHaveLength(1);
    expect(out[0].cnpj).toBe("12345678000199");
    expect(out[0].razaoSocial).toBe("Empresa PJ");
  });

  it("ordena por valor faturado desc (não pela posicao original)", () => {
    const c = curva([
      cliente({ posicao: 1, nome: "Pequeno", cnpjCpf: "11.111.111/1112-00", valorFaturado: "R$ 100,00" }),
      cliente({ posicao: 2, nome: "Maior", cnpjCpf: "22.222.222/2223-00", valorFaturado: "R$ 5.000.000,00" }),
      cliente({ posicao: 3, nome: "Médio", cnpjCpf: "33.333.333/3334-00", valorFaturado: "R$ 100.000,00" }),
    ]);
    const out = extractTopSacados(c, 5);
    expect(out.map((s) => s.razaoSocial)).toEqual(["Maior", "Médio", "Pequeno"]);
  });

  it("respeita limit (default 5)", () => {
    const clientes: ClienteCurvaABC[] = [];
    for (let i = 0; i < 10; i++) {
      clientes.push(
        cliente({
          posicao: i + 1,
          nome: `Empresa ${i}`,
          cnpjCpf: `${String(i).padStart(2, "0")}.111.111/0001-00`,
          valorFaturado: `R$ ${(10 - i) * 1000},00`, // valores decrescentes
        })
      );
    }
    expect(extractTopSacados(curva(clientes))).toHaveLength(5);
    expect(extractTopSacados(curva(clientes), 3)).toHaveLength(3);
    expect(extractTopSacados(curva(clientes), 10)).toHaveLength(10);
  });

  it("dedup por CNPJ — mantém a primeira ocorrência (maior valor)", () => {
    const c = curva([
      cliente({ posicao: 1, nome: "Filial 1", cnpjCpf: "12.345.678/0001-99", valorFaturado: "R$ 1.000,00" }),
      cliente({ posicao: 2, nome: "Filial 2 dupla", cnpjCpf: "12345678000199", valorFaturado: "R$ 5.000,00" }),
    ]);
    const out = extractTopSacados(c, 5);
    expect(out).toHaveLength(1);
    // Maior valor vence (Filial 2 dupla, R$ 5k)
    expect(out[0].razaoSocial).toBe("Filial 2 dupla");
  });

  it("descarta clientes sem nome (string vazia ou whitespace)", () => {
    const c = curva([
      cliente({ posicao: 1, nome: "", cnpjCpf: "11.111.111/1112-00", valorFaturado: "R$ 1.000.000,00" }),
      cliente({ posicao: 2, nome: "   ", cnpjCpf: "22.222.222/2223-00", valorFaturado: "R$ 999.999,00" }),
      cliente({ posicao: 3, nome: "OK", cnpjCpf: "33.333.333/3334-00", valorFaturado: "R$ 100,00" }),
    ]);
    const out = extractTopSacados(c, 5);
    expect(out.map((s) => s.razaoSocial)).toEqual(["OK"]);
  });

  it("preserva campos da Curva ABC original (posicao, classe, percentual)", () => {
    const c = curva([
      cliente({
        posicao: 7,
        nome: "Cliente Top",
        cnpjCpf: "12.345.678/0001-99",
        valorFaturado: "R$ 1.234.567,89",
        percentualReceita: "12,3%",
        classe: "B",
      }),
    ]);
    const out = extractTopSacados(c, 5);
    expect(out[0]).toMatchObject({
      cnpj: "12345678000199",
      razaoSocial: "Cliente Top",
      posicao: 7,
      valorFaturado: "R$ 1.234.567,89",
      participacaoFaturamentoPct: "12,3%",
      classe: "B",
    });
    expect(out[0].valorNumerico).toBeCloseTo(1234567.89, 2);
  });

  it("parsing BR com pontos de milhar funciona em valores grandes", () => {
    const c = curva([
      cliente({ posicao: 1, nome: "Bilhão", cnpjCpf: "11.111.111/1112-00", valorFaturado: "R$ 1.234.567.890,00" }),
      cliente({ posicao: 2, nome: "Mil", cnpjCpf: "22.222.222/2223-00", valorFaturado: "R$ 1.234,00" }),
    ]);
    const out = extractTopSacados(c, 5);
    expect(out[0].razaoSocial).toBe("Bilhão");
    expect(out[0].valorNumerico).toBe(1234567890);
  });
});
