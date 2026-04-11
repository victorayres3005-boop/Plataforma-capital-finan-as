import { describe, it, expect } from "vitest";

// Helpers extraídos da lógica de extract/route.ts
function parseBRVal(v: string): number {
  return parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
}

function calcSomatoriaAno(meses: { mes: string; valor: string }[]): number {
  // Ordena por data
  const sorted = [...meses].sort((a, b) => {
    const [mA, yA] = a.mes.split("/").map(Number);
    const [mB, yB] = b.mes.split("/").map(Number);
    if (yA !== yB) return yA - yB;
    return mA - mB;
  });
  // Últimos 12 meses
  const last12 = sorted.slice(-12);
  return last12.reduce((s, m) => s + parseBRVal(m.valor), 0);
}

function calcMediaAno(meses: { mes: string; valor: string }[]): number {
  const sorted = [...meses].sort((a, b) => {
    const [mA, yA] = a.mes.split("/").map(Number);
    const [mB, yB] = b.mes.split("/").map(Number);
    if (yA !== yB) return yA - yB;
    return mA - mB;
  });
  const last12 = sorted.slice(-12);
  if (last12.length === 0) return 0;
  const soma = last12.reduce((s, m) => s + parseBRVal(m.valor), 0);
  return soma / last12.length;
}

describe("Cálculos de Faturamento", () => {
  it("somatoriaAno com exatamente 12 meses", () => {
    const meses = Array.from({ length: 12 }, (_, i) => ({
      mes: `${String(i + 1).padStart(2, "0")}/2024`,
      valor: "100.000,00",
    }));
    expect(calcSomatoriaAno(meses)).toBe(1_200_000);
  });

  it("somatoriaAno com 24 meses usa apenas últimos 12", () => {
    const meses = [
      ...Array.from({ length: 12 }, (_, i) => ({
        mes: `${String(i + 1).padStart(2, "0")}/2023`,
        valor: "50.000,00", // meses antigos
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        mes: `${String(i + 1).padStart(2, "0")}/2024`,
        valor: "100.000,00", // meses recentes
      })),
    ];
    // Deve usar apenas os 12 de 2024 (100k cada = 1.2M)
    expect(calcSomatoriaAno(meses)).toBe(1_200_000);
  });

  it("somatoriaAno com 5 meses usa todos (menos de 12)", () => {
    const meses = Array.from({ length: 5 }, (_, i) => ({
      mes: `${String(i + 1).padStart(2, "0")}/2025`,
      valor: "200.000,00",
    }));
    expect(calcSomatoriaAno(meses)).toBe(1_000_000);
  });

  it("mediaAno calcula média dos últimos 12 meses", () => {
    const meses = Array.from({ length: 12 }, (_, i) => ({
      mes: `${String(i + 1).padStart(2, "0")}/2024`,
      valor: "100.000,00",
    }));
    expect(calcMediaAno(meses)).toBe(100_000);
  });

  it("mediaAno com meses variados", () => {
    const meses = [
      { mes: "01/2025", valor: "80.000,00" },
      { mes: "02/2025", valor: "120.000,00" },
    ];
    expect(calcMediaAno(meses)).toBe(100_000);
  });

  it("mediaAno retorna 0 sem meses", () => {
    expect(calcMediaAno([])).toBe(0);
  });

  it("parseBRVal converte formato brasileiro", () => {
    expect(parseBRVal("1.234.567,89")).toBe(1234567.89);
    expect(parseBRVal("0,00")).toBe(0);
    expect(parseBRVal("")).toBe(0);
    expect(parseBRVal("100.000,00")).toBe(100000);
  });
});
