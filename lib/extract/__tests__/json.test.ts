import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseJSON } from "@/lib/extract/json";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseJSON — happy path", () => {
  it("parseia objeto JSON simples", () => {
    expect(parseJSON<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("parseia array JSON simples", () => {
    expect(parseJSON<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("aceita whitespace ao redor", () => {
    expect(parseJSON('  {"a":1}  \n')).toEqual({ a: 1 });
  });
});

describe("parseJSON — markdown wrappers", () => {
  it("remove ```json\\n...```", () => {
    expect(parseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("remove ```...```  sem language hint", () => {
    expect(parseJSON('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extrai JSON quando vem com texto antes/depois", () => {
    const raw = 'Aqui está a resposta: {"a":1,"b":"x"} fim.';
    expect(parseJSON(raw)).toEqual({ a: 1, b: "x" });
  });
});

describe("parseJSON — números BR (separador de milhar)", () => {
  it("remove pontos de milhar de número BR multi-grupo (1.234.567)", () => {
    expect(parseJSON<{ valor: number }>('{"valor": 1.234.567}')).toEqual({
      valor: 1234567,
    });
  });

  it("preserva decimal americano (123.45) — só 1 ponto não é milhar", () => {
    expect(parseJSON<{ valor: number }>('{"valor": 123.45}')).toEqual({
      valor: 123.45,
    });
  });

  it("trata múltiplos números BR no mesmo doc", () => {
    expect(
      parseJSON<{ a: number; b: number }>('{"a": 9.498.394, "b": 1.000.000}'),
    ).toEqual({ a: 9498394, b: 1000000 });
  });
});

describe("parseJSON — caractere $ espúrio (OCR SCR/BACEN)", () => {
  it('remove "$" após dígitos', () => {
    expect(parseJSON<{ valor: number }>('{"valor": 200419$}')).toEqual({
      valor: 200419,
    });
  });
});

describe("parseJSON — recovery de truncamento", () => {
  it("recupera array truncado fechando colchetes/chaves", () => {
    const truncated = '{"items":[{"a":1},{"a":2},{"a":3';
    const recovered = parseJSON<{ items: Array<{ a: number }> }>(truncated);
    expect(recovered.items).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("recupera objeto truncado no meio de string", () => {
    const truncated = '{"clientes":[{"nome":"Foo","valor":100},{"nome":"Bar';
    const recovered = parseJSON<{ clientes: Array<unknown> }>(truncated);
    expect(recovered.clientes).toHaveLength(1);
  });

  it("retorna {} quando truncamento é irrecuperável", () => {
    expect(parseJSON("{{{")).toEqual({});
  });

  it("retorna {} para input vazio inválido", () => {
    expect(parseJSON("não é json")).toEqual({});
  });
});

describe("parseJSON — recovery string-aware (regressão fix #3)", () => {
  it("ignora } dentro de string mesmo quando esse } é o último char antes do truncamento", () => {
    // Cenário forte: o último "}" do buffer está DENTRO de uma string aberta
    // que jamais fecha (truncamento). lastIndexOf("}") puro cortaria ali e
    // produziria JSON inválido; findLastBraceOutsideString deve cortar antes.
    const truncated = '{"items":[{"a":"ok"},{"a":"trunc}bad';
    const recovered = parseJSON<{ items: Array<{ a: string }> }>(truncated);
    expect(recovered.items).toEqual([{ a: "ok" }]);
  });

  it("recupera array root-level truncado", () => {
    const truncated = '[{"a":1},{"a":2},{"a":3';
    const recovered = parseJSON<Array<{ a: number }>>(truncated);
    expect(recovered).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe("parseJSON — não confunde brace dentro de string com delimitador", () => {
  it("ignora { dentro de string", () => {
    expect(parseJSON<{ s: string }>('{"s":"a{b}c"}')).toEqual({ s: "a{b}c" });
  });

  it("ignora aspas escapadas", () => {
    expect(parseJSON<{ s: string }>('{"s":"a\\"b"}')).toEqual({ s: 'a"b' });
  });
});
