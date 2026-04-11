import { describe, it, expect } from "vitest";

// Extraída da extract/route.ts para teste
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return {} as T;
  }
}

describe("parseJSON", () => {
  it("parseia JSON simples", () => {
    const result = parseJSON<{ nome: string }>('{"nome": "teste"}');
    expect(result.nome).toBe("teste");
  });

  it("remove markdown code blocks", () => {
    const result = parseJSON<{ campo: string }>("```json\n{\"campo\": \"valor\"}\n```");
    expect(result.campo).toBe("valor");
  });

  it("extrai JSON de texto com lixo antes/depois", () => {
    const result = parseJSON<{ x: number }>("Aqui está o resultado: {\"x\": 42} espero que ajude");
    expect(result.x).toBe(42);
  });

  it("retorna objeto vazio para JSON inválido (não crash)", () => {
    const result = parseJSON<Record<string, unknown>>("isso não é JSON nenhum");
    expect(result).toEqual({});
  });

  it("retorna objeto vazio para string vazia", () => {
    const result = parseJSON<Record<string, unknown>>("");
    expect(result).toEqual({});
  });

  it("parseia array JSON", () => {
    const result = parseJSON<string[]>("[\"a\",\"b\"]");
    expect(result).toEqual(["a", "b"]);
  });

  it("lida com JSON com campos aninhados", () => {
    const result = parseJSON<{ a: { b: number } }>('{"a": {"b": 1}}');
    expect(result.a.b).toBe(1);
  });
});
