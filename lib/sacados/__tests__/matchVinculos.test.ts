import { describe, it, expect } from "vitest";
import {
  normalizeName,
  extractSurnames,
  normalizeAddress,
  matchCPFComum,
  matchSobrenomeUF,
  matchEnderecoIdentico,
  extractParentescoBDC,
  matchMaeComum,
  calcularVinculos,
} from "@/lib/sacados/matchVinculos";
import { isCommonSurname } from "@/lib/sacados/sobrenomes-comuns";

describe("normalizeName", () => {
  it("uppercase + remove acentos + colapsa espaço", () => {
    expect(normalizeName("João da Silva")).toBe("JOAO DA SILVA");
    expect(normalizeName("  Maria   Eduarda  Almeida  ")).toBe("MARIA EDUARDA ALMEIDA");
    expect(normalizeName("Antônio José")).toBe("ANTONIO JOSE");
  });

  it("retorna vazio para null/undefined/whitespace", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("extractSurnames", () => {
  it("ignora partículas DA/DE/DO/DOS/DAS", () => {
    expect(extractSurnames("Maria da Silva Souza")).toEqual(["SILVA", "SOUZA"]);
    expect(extractSurnames("José dos Santos")).toEqual(["SANTOS"]);
  });

  it("ignora sufixos JR/JUNIOR/NETO/FILHO", () => {
    expect(extractSurnames("João Bittencourt Junior")).toEqual(["BITTENCOURT"]);
    expect(extractSurnames("Pedro Almeida Neto")).toEqual(["ALMEIDA"]);
  });

  it("retorna os 2 últimos sobrenomes (mais discriminativos)", () => {
    expect(extractSurnames("João Carlos Bittencourt Almeida")).toEqual(["BITTENCOURT", "ALMEIDA"]);
  });

  it("nome único não retorna sobrenome", () => {
    expect(extractSurnames("Maria")).toEqual([]);
  });

  it("vazio retorna []", () => {
    expect(extractSurnames(null)).toEqual([]);
    expect(extractSurnames("")).toEqual([]);
  });
});

describe("normalizeAddress", () => {
  it("uppercase + remove acentos + remove pontuação + colapsa espaço", () => {
    const r = normalizeAddress("Rua das Flores, 100 - Centro - São Paulo/SP");
    expect(r).toBe("RUA DAS FLORES 100 CENTRO SAO PAULO SP");
  });

  it("remove CEP em vários formatos", () => {
    expect(normalizeAddress("Av. Paulista 1000, CEP 01000-000")).toBe("AV PAULISTA 1000");
    expect(normalizeAddress("Av. Paulista 1000, 01000-000")).toBe("AV PAULISTA 1000");
    expect(normalizeAddress("Av. Paulista 1000, 01000000")).toBe("AV PAULISTA 1000");
  });

  it("vazio para null/undefined", () => {
    expect(normalizeAddress(null)).toBe("");
    expect(normalizeAddress(undefined)).toBe("");
  });
});

describe("isCommonSurname", () => {
  it("identifica sobrenomes ultra-comuns", () => {
    expect(isCommonSurname("SILVA")).toBe(true);
    expect(isCommonSurname("Silva")).toBe(true);
    expect(isCommonSurname("santos")).toBe(true);
    expect(isCommonSurname("OLIVEIRA")).toBe(true);
  });

  it("aceita sobrenomes raros", () => {
    expect(isCommonSurname("BITTENCOURT")).toBe(false);
    expect(isCommonSurname("XAVIER")).toBe(false);
    expect(isCommonSurname("MEIRELES")).toBe(false);
  });
});

describe("matchCPFComum", () => {
  it("acha CPF que aparece nas duas pontas (CPF formatado vs cru)", () => {
    const cedente = [{ nome: "João Silva", cpf: "111.222.333-44" }];
    const sacado = [{ nome: "João S. Silva", cpf: "11122233344" }];
    const hits = matchCPFComum(cedente, sacado);
    expect(hits).toHaveLength(1);
    expect(hits[0].cpf).toBe("11122233344");
    expect(hits[0].nomeSocioCedente).toBe("João Silva");
    expect(hits[0].nomeSocioSacado).toBe("João S. Silva");
  });

  it("aceita campo cpfCnpj (formato QSASocio)", () => {
    const cedente = [{ nome: "Maria", cpfCnpj: "55566677788" }];
    const sacado = [{ nome: "Maria S.", cpf: "555.666.777-88" }];
    const hits = matchCPFComum(cedente, sacado);
    expect(hits).toHaveLength(1);
  });

  it("rejeita CPFs lixo (00000000000) e CNPJs no campo cpf", () => {
    const cedente = [
      { nome: "Lixo", cpf: "00000000000" },
      { nome: "Empresa", cpf: "12345678000199" }, // CNPJ no campo cpf
    ];
    const sacado = [
      { nome: "Lixo 2", cpf: "00000000000" },
      { nome: "Empresa 2", cpf: "12345678000199" },
    ];
    expect(matchCPFComum(cedente, sacado)).toHaveLength(0);
  });

  it("dedup por CPF", () => {
    const cedente = [
      { nome: "João A", cpf: "11122233344" },
      { nome: "João B", cpf: "111.222.333-44" }, // mesmo CPF
    ];
    const sacado = [
      { nome: "João C", cpf: "11122233344" },
      { nome: "João D", cpf: "111.222.333-44" },
    ];
    expect(matchCPFComum(cedente, sacado)).toHaveLength(1);
  });

  it("retorna [] quando nenhum CPF bate", () => {
    expect(matchCPFComum(
      [{ nome: "A", cpf: "11122233344" }],
      [{ nome: "B", cpf: "55566677788" }]
    )).toEqual([]);
  });

  it("retorna [] em listas vazias", () => {
    expect(matchCPFComum([], [{ nome: "X", cpf: "11122233344" }])).toEqual([]);
    expect(matchCPFComum([{ nome: "X", cpf: "11122233344" }], [])).toEqual([]);
  });
});

describe("matchSobrenomeUF", () => {
  it("acha sobrenome raro coincidente quando UFs batem", () => {
    const cedente = [{ nome: "João Bittencourt" }];
    const sacado = [{ nome: "Maria Bittencourt Costa" }];
    const hits = matchSobrenomeUF(cedente, sacado, "SP", "SP");
    expect(hits).toHaveLength(1);
    expect(hits[0].sobrenome).toBe("BITTENCOURT");
    expect(hits[0].uf).toBe("SP");
  });

  it("não dispara quando UFs são diferentes", () => {
    const cedente = [{ nome: "João Bittencourt" }];
    const sacado = [{ nome: "Maria Bittencourt" }];
    expect(matchSobrenomeUF(cedente, sacado, "SP", "RJ")).toEqual([]);
  });

  it("não dispara quando UF está faltando em qualquer lado", () => {
    const cedente = [{ nome: "João Bittencourt" }];
    const sacado = [{ nome: "Maria Bittencourt" }];
    expect(matchSobrenomeUF(cedente, sacado, "SP", "")).toEqual([]);
    expect(matchSobrenomeUF(cedente, sacado, "", "SP")).toEqual([]);
    expect(matchSobrenomeUF(cedente, sacado, undefined, "SP")).toEqual([]);
  });

  it("suprime sobrenomes ultra-comuns mesmo na mesma UF", () => {
    const cedente = [{ nome: "João Silva" }];
    const sacado = [{ nome: "Maria Silva" }];
    expect(matchSobrenomeUF(cedente, sacado, "SP", "SP")).toEqual([]);
  });

  it("não dispara quando o match seria pelo mesmo CPF (já coberto pelo matcher 1)", () => {
    const cedente = [{ nome: "João Bittencourt", cpf: "11122233344" }];
    const sacado = [{ nome: "João Bittencourt", cpf: "11122233344" }];
    expect(matchSobrenomeUF(cedente, sacado, "SP", "SP")).toEqual([]);
  });

  it("dispara quando há sobrenome raro + sobrenome comum", () => {
    const cedente = [{ nome: "João Bittencourt Silva" }];
    const sacado = [{ nome: "Maria Bittencourt" }];
    const hits = matchSobrenomeUF(cedente, sacado, "MG", "MG");
    expect(hits).toHaveLength(1);
    expect(hits[0].sobrenome).toBe("BITTENCOURT");
  });

  it("normalização funciona com acentos", () => {
    const cedente = [{ nome: "João Münch" }];
    const sacado = [{ nome: "Maria Munch" }];
    const hits = matchSobrenomeUF(cedente, sacado, "SP", "SP");
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("dedup do mesmo par (sobrenome, cedente, sacado) via passes múltiplos", () => {
    const cedente = [{ nome: "João Bittencourt" }];
    const sacado = [
      { nome: "Maria Bittencourt" },
      { nome: "Carlos Bittencourt" },
    ];
    // 2 sócios distintos do sacado batendo → 2 hits (informação útil)
    expect(matchSobrenomeUF(cedente, sacado, "SP", "SP")).toHaveLength(2);
  });
});

describe("matchEnderecoIdentico", () => {
  it("identifica endereços idênticos após normalização agressiva", () => {
    const r = matchEnderecoIdentico(
      "Rua das Flores, 100 - Centro - São Paulo/SP",
      "RUA DAS FLORES 100 CENTRO SAO PAULO SP"
    );
    expect(r.identico).toBe(true);
  });

  it("não confunde endereços diferentes na mesma cidade", () => {
    const r = matchEnderecoIdentico(
      "Rua das Flores, 100 - São Paulo/SP",
      "Rua das Flores, 200 - São Paulo/SP"
    );
    expect(r.identico).toBe(false);
  });

  it("ignora CEP no match", () => {
    const r = matchEnderecoIdentico(
      "Av. Paulista, 1000 - CEP 01310-100 - São Paulo/SP",
      "Av. Paulista, 1000 - São Paulo/SP - 01310-100"
    );
    expect(r.identico).toBe(true);
  });

  it("retorna false para endereços ausentes", () => {
    expect(matchEnderecoIdentico(undefined, "X").identico).toBe(false);
    expect(matchEnderecoIdentico("X", undefined).identico).toBe(false);
    expect(matchEnderecoIdentico("", "").identico).toBe(false);
  });

  it("retorna false para endereços muito curtos (lixo)", () => {
    expect(matchEnderecoIdentico("RUA", "RUA").identico).toBe(false);
  });

  it("expõe a forma normalizada quando ambos não-vazios", () => {
    const r = matchEnderecoIdentico(
      "Rua A, 1 - São Paulo/SP",
      "Rua B, 2 - São Paulo/SP"
    );
    expect(r.identico).toBe(false);
    expect(r.enderecoCedente).toBe("RUA A 1 SAO PAULO SP");
    expect(r.enderecoSacado).toBe("RUA B 2 SAO PAULO SP");
  });
});

describe("extractParentescoBDC", () => {
  it("acha parente do cedente que é sócio do sacado", () => {
    const parentesCedente = [
      { cpf: "111.222.333-44", nome: "Maria Silva", tipo: "Cônjuge" },
    ];
    const sociosSacado = [{ nome: "Maria Silva", cpf: "11122233344" }];
    const hits = extractParentescoBDC(parentesCedente, sociosSacado, undefined, undefined);
    expect(hits).toHaveLength(1);
    expect(hits[0].origem).toBe("cedente");
    expect(hits[0].tipo).toBe("Cônjuge");
    expect(hits[0].cpf).toBe("11122233344");
  });

  it("acha parente do sacado que é sócio do cedente", () => {
    const parentesSacado = [
      { cpf: "555.666.777-88", nome: "José", tipo: "Pai" },
    ];
    const sociosCedente = [{ nome: "José", cpf: "55566677788" }];
    const hits = extractParentescoBDC(undefined, undefined, parentesSacado, sociosCedente);
    expect(hits).toHaveLength(1);
    expect(hits[0].origem).toBe("sacado");
    expect(hits[0].tipo).toBe("Pai");
  });

  it("dedup por CPF — mesmo parente nas duas direções aparece uma vez", () => {
    const cpfX = "111.222.333-44";
    const parentesCedente = [{ cpf: cpfX, nome: "Maria", tipo: "Filha" }];
    const sociosSacado = [{ nome: "Maria", cpf: cpfX }];
    const parentesSacado = [{ cpf: cpfX, nome: "Maria", tipo: "Filha" }];
    const sociosCedente = [{ nome: "Maria", cpf: cpfX }];
    const hits = extractParentescoBDC(parentesCedente, sociosSacado, parentesSacado, sociosCedente);
    expect(hits).toHaveLength(1);
  });

  it("ignora CPFs lixo (00000000000) e mal formados", () => {
    const parentesCedente = [
      { cpf: "00000000000", nome: "Lixo", tipo: "Pai" },
      { cpf: "abc", nome: "Mal", tipo: "Pai" },
    ];
    const sociosSacado = [
      { nome: "Lixo", cpf: "00000000000" },
      { nome: "Mal", cpf: "abc" },
    ];
    expect(extractParentescoBDC(parentesCedente, sociosSacado, undefined, undefined)).toEqual([]);
  });

  it("retorna [] quando todas as listas são vazias/undefined", () => {
    expect(extractParentescoBDC(undefined, undefined, undefined, undefined)).toEqual([]);
    expect(extractParentescoBDC([], [], [], [])).toEqual([]);
  });
});

describe("matchMaeComum", () => {
  it("acha sócios cedente×sacado com mesma mãe (irmãos)", () => {
    const cedente = [{ nome: "João Silva", cpf: "11122233344", motherName: "Maria Aparecida Silva" }];
    const sacado = [{ nome: "Carlos Silva", cpf: "55566677788", motherName: "MARIA APARECIDA SILVA" }];
    const hits = matchMaeComum(cedente, sacado);
    expect(hits).toHaveLength(1);
    expect(hits[0].maeComum).toBe("MARIA APARECIDA SILVA");
    expect(hits[0].socioCedenteCpf).toBe("11122233344");
    expect(hits[0].socioSacadoCpf).toBe("55566677788");
  });

  it("normaliza acentos antes de comparar", () => {
    const cedente = [{ nome: "A", cpf: "11122233344", motherName: "Maria Antônia Souza" }];
    const sacado = [{ nome: "B", cpf: "55566677788", motherName: "Maria Antonia Souza" }];
    expect(matchMaeComum(cedente, sacado)).toHaveLength(1);
  });

  it("ignora mães curtas (< 8 chars) ou só primeiro nome", () => {
    const cedente = [
      { nome: "A", cpf: "11122233344", motherName: "Maria" },     // só nome — descartado
      { nome: "B", cpf: "55566677788", motherName: "Ana Lima" },  // 8 chars OK
    ];
    const sacado = [
      { nome: "C", cpf: "99988877766", motherName: "Maria" },     // mesmo padrão fraco
      { nome: "D", cpf: "44455566677", motherName: "Ana Lima" },
    ];
    const hits = matchMaeComum(cedente, sacado);
    expect(hits).toHaveLength(1);
    expect(hits[0].maeComum).toBe("ANA LIMA");
  });

  it("não dispara quando CPFs são idênticos (matcher 1 cobre)", () => {
    const sameCpf = "11122233344";
    const cedente = [{ nome: "Mesma Pessoa", cpf: sameCpf, motherName: "Maria Joana Silva" }];
    const sacado = [{ nome: "Mesma Pessoa", cpf: sameCpf, motherName: "Maria Joana Silva" }];
    expect(matchMaeComum(cedente, sacado)).toEqual([]);
  });

  it("retorna múltiplos hits quando vários sócios compartilham mãe", () => {
    const cedente = [
      { nome: "Irmão 1", cpf: "11122233344", motherName: "Beatriz Souza Lima" },
      { nome: "Não-irmão", cpf: "55566677788", motherName: "Outra Mãe Distinta" },
    ];
    const sacado = [
      { nome: "Irmão 2", cpf: "99988877766", motherName: "Beatriz Souza Lima" },
      { nome: "Irmão 3", cpf: "44455566677", motherName: "Beatriz Souza Lima" },
    ];
    const hits = matchMaeComum(cedente, sacado);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.maeComum === "BEATRIZ SOUZA LIMA")).toBe(true);
  });

  it("retorna [] quando listas vazias ou sem motherName", () => {
    expect(matchMaeComum(undefined, undefined)).toEqual([]);
    expect(matchMaeComum([], [])).toEqual([]);
    expect(matchMaeComum(
      [{ nome: "A", cpf: "11122233344" }],
      [{ nome: "B", cpf: "55566677788" }]
    )).toEqual([]);
  });
});

describe("calcularVinculos (orquestrador)", () => {
  it("temVinculo=true quando QUALQUER matcher acha hit (CPF comum)", () => {
    const r = calcularVinculos({
      sociosCedente: [{ nome: "João", cpf: "11122233344" }],
      sociosSacado: [{ nome: "João", cpf: "111.222.333-44" }],
    });
    expect(r.temVinculo).toBe(true);
    expect(r.cpfSocioComum).toHaveLength(1);
    expect(r.sobrenomesUF).toHaveLength(0);
    expect(r.enderecoIdentico).toBe(false);
    expect(r.parentescoBDC).toHaveLength(0);
  });

  it("temVinculo=true quando só o endereço bate", () => {
    const r = calcularVinculos({
      sociosCedente: [{ nome: "A", cpf: "11122233344" }],
      sociosSacado: [{ nome: "B", cpf: "55566677788" }],
      enderecoCedente: "Rua das Flores, 100 - São Paulo/SP",
      enderecoSacado: "Rua das Flores, 100 - São Paulo/SP",
    });
    expect(r.temVinculo).toBe(true);
    expect(r.enderecoIdentico).toBe(true);
  });

  it("temVinculo=false quando nenhum matcher acha hit", () => {
    const r = calcularVinculos({
      sociosCedente: [{ nome: "João Silva", cpf: "11122233344" }],
      sociosSacado: [{ nome: "Maria Santos", cpf: "55566677788" }],
      ufCedente: "SP",
      ufSacado: "SP",
      enderecoCedente: "Rua A, 1 - SP",
      enderecoSacado: "Rua B, 2 - RJ",
    });
    expect(r.temVinculo).toBe(false);
    // Sobrenomes Silva/Santos são comuns + não-coincidentes → sem hit
    expect(r.sobrenomesUF).toHaveLength(0);
  });

  it("temVinculo=true quando só mãe comum bate", () => {
    const r = calcularVinculos({
      sociosCedente: [{ nome: "A", cpf: "11122233344" }],
      sociosSacado: [{ nome: "B", cpf: "55566677788" }],
      sociosCedenteComMae: [{ nome: "A", cpf: "11122233344", motherName: "Beatriz Souza Lima" }],
      sociosSacadoComMae: [{ nome: "B", cpf: "55566677788", motherName: "Beatriz Souza Lima" }],
    });
    expect(r.temVinculo).toBe(true);
    expect(r.maesComuns).toHaveLength(1);
    expect(r.cpfSocioComum).toHaveLength(0);
  });

  it("agrega múltiplos critérios no mesmo sacado", () => {
    const r = calcularVinculos({
      sociosCedente: [
        { nome: "João Bittencourt", cpf: "11122233344" },
      ],
      sociosSacado: [
        { nome: "João Bittencourt", cpf: "111.222.333-44" }, // CPF + sobrenome
      ],
      ufCedente: "SP",
      ufSacado: "SP",
      enderecoCedente: "Av Paulista 1000 SP",
      enderecoSacado: "Av Paulista 1000 SP",
    });
    expect(r.temVinculo).toBe(true);
    expect(r.cpfSocioComum).toHaveLength(1);
    // Mesmo CPF é skipado no matcher de sobrenome
    expect(r.sobrenomesUF).toHaveLength(0);
    expect(r.enderecoIdentico).toBe(true);
  });
});
