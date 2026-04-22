import type { PesosPilares, ConfiguracaoPolitica } from "@/types/politica-credito";

export function validarPesosPilares(pesos: PesosPilares): string | null {
  const soma = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (Math.round(soma) !== 100) {
    return `A soma dos pesos deve ser 100%. Atual: ${soma.toFixed(1)}%`;
  }
  return null;
}

export function somarPesos(pesos: PesosPilares): number {
  return Object.values(pesos).reduce((a, b) => a + b, 0);
}

export function validarFaixasRating(config: ConfiguracaoPolitica): string | null {
  const sorted = [...config.faixas_rating].sort((a, b) => a.score_minimo - b.score_minimo);
  if (sorted.length === 0) return "Pelo menos uma faixa de rating é necessária.";

  if (sorted[0].score_minimo > 0) return "A faixa de rating mais baixa deve começar em 0.";
  if (sorted[sorted.length - 1].score_maximo < 100) return "A faixa de rating mais alta deve chegar a 100.";

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].score_minimo !== sorted[i - 1].score_maximo + 1) {
      return `Lacuna ou sobreposição entre as faixas ${sorted[i - 1].rating} e ${sorted[i].rating}.`;
    }
  }
  return null;
}

export function validarPolitica(config: ConfiguracaoPolitica): string[] {
  const erros: string[] = [];

  const erroPesos = validarPesosPilares(config.pesos_pilares);
  if (erroPesos) erros.push(erroPesos);

  const erroRating = validarFaixasRating(config);
  if (erroRating) erros.push(erroRating);

  if (config.parametros_elegibilidade.fmm_minimo <= 0) {
    erros.push("FMM mínimo deve ser maior que zero.");
  }

  if (config.parametros_elegibilidade.tempo_constituicao_minimo_anos < 0) {
    erros.push("Tempo de constituição mínimo não pode ser negativo.");
  }

  return erros;
}
