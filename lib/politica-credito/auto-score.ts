// lib/politica-credito/auto-score.ts
// Auto-preenchimento do Score V2 a partir dos dados extraídos dos documentos
// Gerado com base nos schemas reais do sistema — não alterar nomes de campo

import { calcularScore } from './calculator'
import { DEFAULT_POLITICA_V2 } from './defaults'
import type {
  RespostaCriterio,
  ScoreResult,
  ConfiguracaoPolitica,
} from '@/types/politica-credito'

// ─── Helpers de parsing ──────────────────────────────────────────────────────

/** "R$ 1.234.567,89" → 1234567.89 */
function parseBRL(valor: string | null | undefined): number {
  if (!valor) return 0
  return parseFloat(
    valor
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  ) || 0
}

/** "42,3" ou "42.3" ou "42,3%" → 42.3 */
function parsePct(valor: string | null | undefined): number {
  if (!valor) return 0
  return parseFloat(valor.replace('%', '').replace(',', '.')) || 0
}

/** "15/03/2008" → anos decorridos */
function calcularIdadeAnos(dataAbertura: string | null | undefined): number {
  if (!dataAbertura) return 0
  const match = dataAbertura.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!match) return 0
  const abertura = new Date(
    parseInt(match[3]),
    parseInt(match[2]) - 1,
    parseInt(match[1])
  )
  return (Date.now() - abertura.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
}

/** Verifica se uma modalidade SCR tem determinada palavra no nome */
function temModalidade(
  modalidades: Array<{ nome: string }> | undefined,
  palavra: string
): boolean {
  return (modalidades ?? []).some(m =>
    m.nome?.toLowerCase().includes(palavra.toLowerCase())
  )
}

/** Conta modalidades SCR com determinada palavra */
function contarModalidades(
  modalidades: Array<{ nome: string }> | undefined,
  palavra: string
): number {
  return (modalidades ?? []).filter(m =>
    m.nome?.toLowerCase().includes(palavra.toLowerCase())
  ).length
}

// ─── Tipo de retorno ──────────────────────────────────────────────────────────

export interface AutoScoreResultado {
  respostas:           RespostaCriterio[]
  score:               ScoreResult
  criterios_manuais:   string[]   // ids que precisam do analista
  criterios_auto:      string[]   // ids preenchidos automaticamente
  avisos:              string[]   // alertas sobre dados ausentes ou inconsistentes
}

// ─── Função principal ─────────────────────────────────────────────────────────

export function autoPreencherScore(
  data: any,
  config: ConfiguracaoPolitica = DEFAULT_POLITICA_V2,
  respostasManuaisExistentes: RespostaCriterio[] = []
): AutoScoreResultado {

  const respostas:         RespostaCriterio[] = []
  const criterios_auto:    string[]           = []
  const criterios_manuais: string[]           = []
  const avisos:            string[]           = []

  // Índice das respostas manuais já salvas — têm prioridade
  const manuaisIdx = new Map(
    respostasManuaisExistentes.map(r => [r.criterio_id, r])
  )

  // Helper: se já tem resposta manual, usa ela. Senão, registra a automática.
  function registrar(resposta: RespostaCriterio, fonte: 'auto' | 'manual') {
    const manual = manuaisIdx.get(resposta.criterio_id)
    if (manual) {
      respostas.push(manual)
      // não adiciona ao criterios_auto — já estava preenchido
    } else {
      respostas.push({ ...resposta, fonte_preenchimento: fonte })
      if (fonte === 'auto') criterios_auto.push(resposta.criterio_id)
      else criterios_manuais.push(resposta.criterio_id)
    }
  }

  // ─── PILAR: Risco e Compliance ─────────────────────────────────────────────

  // 1. Situação Jurídica (5 pts)
  const situacao = data?.cnpj?.situacaoCadastral ?? ''
  const temRJ    = data?.processos?.temRJ ?? false
  const temFalencia = data?.processos?.temFalencia ?? false

  if (situacao || temRJ !== undefined) {
    let opcao_label: string
    let pontos: number

    if (temRJ || temFalencia) {
      opcao_label = 'Recuperação Judicial / Falência'
      pontos = 0
    } else if (situacao === 'ATIVA') {
      opcao_label = 'Regular — sem restrições'
      pontos = 5
    } else if (situacao === 'INAPTA' || situacao === 'SUSPENSA') {
      opcao_label = 'Inapta / Suspensa'
      pontos = 0
    } else if (situacao === 'BAIXADA') {
      opcao_label = 'Baixada'
      pontos = 0
    } else {
      opcao_label = 'Situação não identificada'
      pontos = 2
      avisos.push('Situação cadastral não reconhecida: ' + situacao)
    }

    registrar({
      criterio_id:  'situacao_juridica',
      pilar_id:     'risco_compliance',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
    }, 'auto')
  } else {
    criterios_manuais.push('situacao_juridica')
    avisos.push('Dados do CNPJ ausentes — situação jurídica não preenchida')
  }

  // 2. SCR / Endividamento (5 pts)
  const fmm          = parseBRL(data?.faturamento?.mediaAno ?? data?.faturamento?.fmm12m)
  const dividaTotal  = parseBRL(data?.scr?.totalDividasAtivas)
  const vencidos     = parseBRL(data?.scr?.vencidos)
  const prejuizos    = parseBRL(data?.scr?.prejuizos)
  const alavancagem  = fmm > 0 ? dividaTotal / fmm : 0

  if (data?.scr) {
    let opcao_label: string
    let pontos: number

    if (vencidos > 0 || prejuizos > 0) {
      opcao_label = 'Com vencidos ou prejuízos no SCR'
      pontos = 0
    } else if (alavancagem <= 1.0) {
      opcao_label = 'Alavancagem baixa (≤ 1×) — sem vencidos'
      pontos = 5
    } else if (alavancagem <= 2.0) {
      opcao_label = 'Alavancagem saudável (1–2×) — sem vencidos'
      pontos = 4
    } else if (alavancagem <= 3.5) {
      opcao_label = 'Alavancagem moderada (2–3,5×)'
      pontos = 3
    } else if (alavancagem <= 5.0) {
      opcao_label = 'Alavancagem elevada (3,5–5×)'
      pontos = 1
    } else {
      opcao_label = 'Alavancagem crítica (> 5×)'
      pontos = 0
    }

    // Penalidade: sócio com SCR vencido
    const socioInadimplente = (data?.scrSocios ?? []).some(
      (s: any) => parseBRL(s?.periodoAtual?.vencidos) > 0
    )
    if (socioInadimplente) {
      pontos = Math.max(0, pontos - 1)
      avisos.push('Penalidade aplicada: sócio com vencidos no SCR')
    }

    registrar({
      criterio_id:  'scr_endividamento',
      pilar_id:     'risco_compliance',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `Alavancagem calculada: ${alavancagem.toFixed(2)}× | Dívida: ${data.scr.totalDividasAtivas} | FMM: ${data?.faturamento?.mediaAno ?? 'não informado'}`,
    }, 'auto')
  } else {
    criterios_manuais.push('scr_endividamento')
    avisos.push('SCR ausente — endividamento não preenchido automaticamente')
  }

  // 3. Protestos (4 pts)
  const qtdProtestos = parseInt(
    String(data?.protestos?.vigentesQtd ?? '0'), 10
  )
  const valorProtestos = parseBRL(data?.protestos?.vigentesValor)

  if (data?.protestos !== undefined) {
    const pctValorFMM = fmm > 0 ? (valorProtestos / fmm) * 100 : 0
    let opcao_label: string
    let pontos: number

    if (qtdProtestos === 0) {
      opcao_label = 'Sem protestos vigentes'
      pontos = 4
    } else if (qtdProtestos <= 2 && pctValorFMM < 5) {
      opcao_label = '1–2 protestos — valor baixo (< 5% FMM)'
      pontos = 2
    } else if (qtdProtestos <= 2) {
      opcao_label = '1–2 protestos — valor significativo'
      pontos = 1
    } else if (qtdProtestos <= 5) {
      opcao_label = '3–5 protestos'
      pontos = 1
    } else {
      opcao_label = 'Mais de 5 protestos vigentes'
      pontos = 0
    }

    registrar({
      criterio_id:  'protestos',
      pilar_id:     'risco_compliance',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `${qtdProtestos} protesto(s) vigente(s) — valor total: ${data.protestos.vigentesValor ?? 'não informado'}`,
    }, 'auto')
  } else {
    criterios_manuais.push('protestos')
    avisos.push('Documento de protestos não enviado')
  }

  // 4. Pefin / Refin (3 pts)
  if (data?.scr?.modalidades) {
    const temPefin = temModalidade(data.scr.modalidades, 'pefin')
    const temRefin = temModalidade(data.scr.modalidades, 'refin')

    let opcao_label: string
    let pontos: number

    if (!temPefin && !temRefin) {
      opcao_label = 'Sem Pefin / Refin'
      pontos = 3
    } else if (temPefin && temRefin) {
      opcao_label = 'Com Pefin e Refin'
      pontos = 0
    } else {
      opcao_label = temPefin ? 'Com Pefin' : 'Com Refin'
      pontos = 1
    }

    registrar({
      criterio_id:  'pefin_refin',
      pilar_id:     'risco_compliance',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
    }, 'auto')
  } else {
    criterios_manuais.push('pefin_refin')
    avisos.push('SCR ausente — Pefin/Refin não verificado')
  }

  // 5. Processos Judiciais (3 pts)
  const totalPassivos = parseInt(
    String(data?.processos?.passivosTotal ?? data?.processos?.poloPassivoQtd ?? '0'), 10
  )
  const trabalhistas = parseInt(
    String(
      data?.processos?.distribuicao?.find(
        (d: any) => d.tipo === 'TRABALHISTA'
      )?.qtd ?? '0'
    ), 10
  )

  if (data?.processos !== undefined) {
    let opcao_label: string
    let pontos: number

    if (totalPassivos === 0) {
      opcao_label = 'Sem processos passivos'
      pontos = 3
    } else if (totalPassivos <= 3 && trabalhistas <= 1) {
      opcao_label = 'Poucos processos (1–3) — baixo impacto'
      pontos = 2
    } else if (totalPassivos <= 10) {
      opcao_label = 'Processos moderados (4–10)'
      pontos = 1
    } else if (totalPassivos <= 15) {
      opcao_label = 'Volume elevado (11–15) — monitorar'
      pontos = 1
    } else {
      opcao_label = 'Volume crítico (> 15 processos)'
      pontos = 0
    }

    if (trabalhistas > 3) {
      avisos.push(`Atenção: ${trabalhistas} processos trabalhistas — risco de passivo solidário`)
    }

    registrar({
      criterio_id:  'processos_judiciais',
      pilar_id:     'risco_compliance',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `${totalPassivos} processo(s) passivo(s) — ${trabalhistas} trabalhista(s)`,
    }, 'auto')
  } else {
    criterios_manuais.push('processos_judiciais')
    avisos.push('Documento de processos não enviado')
  }

  // ─── PILAR: Saúde Financeira ───────────────────────────────────────────────

  // 6. Qualidade do Faturamento (7 pts)
  if (data?.faturamento?.meses?.length > 0) {
    const meses       = data.faturamento.meses
    const qtdMeses    = meses.length
    const qtdZerados  = data.faturamento.quantidadeMesesZerados ?? 0
    const tendencia   = data.faturamento.tendencia ?? 'indefinido'
    const atualizado  = data.faturamento.dadosAtualizados !== false

    const valores = meses
      .map((m: any) => parseBRL(String(m.valor ?? m.total ?? 0)))
      .filter((v: number) => v > 0)

    let consistencia = 0
    if (valores.length >= 2) {
      const media = valores.reduce((a: number, b: number) => a + b, 0) / valores.length
      const desvio = Math.sqrt(
        valores.reduce((a: number, b: number) => a + Math.pow(b - media, 2), 0) / valores.length
      )
      consistencia = media > 0 ? (desvio / media) * 100 : 100
    }

    let opcao_label: string
    let pontos: number

    if (qtdZerados === 0 && consistencia < 20 && tendencia !== 'queda' && atualizado) {
      opcao_label = 'Consistente — sem zeros, estável ou crescendo'
      pontos = 7
    } else if (qtdZerados <= 1 && consistencia < 35 && atualizado) {
      opcao_label = 'Bom — variações normais'
      pontos = 5
    } else if (qtdZerados <= 2 || consistencia < 50 || !atualizado) {
      opcao_label = 'Regular — sazonalidade ou desatualizado'
      pontos = 3
    } else if (qtdZerados <= 4 || tendencia === 'queda') {
      opcao_label = 'Ruim — queda ou muitos zeros'
      pontos = 1
    } else {
      opcao_label = 'Crítico — faturamento inconsistente'
      pontos = 0
    }

    registrar({
      criterio_id:  'qualidade_faturamento',
      pilar_id:     'saude_financeira',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `${qtdMeses} meses | ${qtdZerados} zerado(s) | tendência: ${tendencia} | coef. variação: ${consistencia.toFixed(0)}%`,
    }, 'auto')
  } else {
    criterios_manuais.push('qualidade_faturamento')
    avisos.push('Faturamento não enviado — qualidade não avaliada')
  }

  // 7. Análise Financeira — DRE / Balanço (8 pts)
  const temDRE     = !!data?.dre?.receitaBruta || !!data?.dre?.receitaLiquida
  const temBalanco = !!data?.balanco?.ativoTotal || !!data?.balanco?.patrimonioLiquido

  if (temDRE || temBalanco) {
    const pl           = parseBRL(data?.balanco?.patrimonioLiquido)
    const ativoTotal   = parseBRL(data?.balanco?.ativoTotal)
    const passivoCP    = parseBRL(data?.balanco?.passivoCirculante)
    const ativoCP      = parseBRL(data?.balanco?.ativoCirculante)
    const liquidez     = passivoCP > 0 ? ativoCP / passivoCP : 0
    const receitaLiq   = parseBRL(data?.dre?.receitaLiquida ?? data?.dre?.receitaBruta)
    const lucroLiq     = parseBRL(data?.dre?.lucroLiquido ?? data?.dre?.resultadoLiquido)
    const margem       = receitaLiq > 0 ? (lucroLiq / receitaLiq) * 100 : 0

    let opcao_label: string
    let pontos: number

    if (pl > 0 && liquidez >= 1.0 && margem > 0) {
      opcao_label = 'PL positivo, liquidez ≥ 1,0, margem positiva'
      pontos = 8
    } else if (pl > 0 && liquidez >= 0.5) {
      opcao_label = 'PL positivo, liquidez 0,5–1,0'
      pontos = 5
    } else if (pl > 0 && liquidez < 0.5) {
      opcao_label = 'PL positivo, liquidez baixa (< 0,5)'
      pontos = 3
    } else if (pl <= 0) {
      opcao_label = 'Patrimônio Líquido negativo'
      pontos = 0
    } else {
      opcao_label = 'DRE/Balanço parcial — dados incompletos'
      pontos = 3
      avisos.push('DRE ou Balanço com dados parciais')
    }

    // suppress unused variable warning
    void ativoTotal

    registrar({
      criterio_id:  'analise_financeira',
      pilar_id:     'saude_financeira',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `PL: ${data?.balanco?.patrimonioLiquido ?? 'n/d'} | Liquidez: ${liquidez.toFixed(2)} | Margem: ${margem.toFixed(1)}%`,
    }, 'auto')
  } else {
    criterios_manuais.push('analise_financeira')
    avisos.push('DRE e Balanço não enviados — análise financeira não preenchida')
  }

  // 8. Alavancagem (5 pts)
  if (data?.scr && fmm > 0) {
    let opcao_label: string
    let pontos: number

    if (alavancagem <= 1.0) {
      opcao_label = 'Alavancagem muito baixa (≤ 1×)'
      pontos = 5
    } else if (alavancagem <= 2.0) {
      opcao_label = 'Alavancagem saudável (1–2×)'
      pontos = 4
    } else if (alavancagem <= 3.5) {
      opcao_label = 'Alavancagem moderada (2–3,5×)'
      pontos = 3
    } else if (alavancagem <= 5.0) {
      opcao_label = 'Alavancagem elevada (3,5–5×)'
      pontos = 1
    } else {
      opcao_label = 'Alavancagem crítica (> 5×)'
      pontos = 0
    }

    registrar({
      criterio_id:  'alavancagem',
      pilar_id:     'saude_financeira',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `${alavancagem.toFixed(2)}× FMM — dívida total SCR: ${data.scr.totalDividasAtivas}`,
    }, 'auto')
  } else {
    criterios_manuais.push('alavancagem')
    avisos.push(fmm === 0
      ? 'FMM não calculado — alavancagem não preenchida'
      : 'SCR ausente — alavancagem não preenchida'
    )
  }

  // ─── PILAR: Sócios e Governança ────────────────────────────────────────────

  // 9. Endividamento dos Sócios (6 pts)
  if (data?.scrSocios?.length > 0) {
    const socios = data.scrSocios as any[]
    const algumComVencido = socios.some(
      s => parseBRL(s?.periodoAtual?.vencidos) > 0
    )
    const algumComPrejuizo = socios.some(
      s => parseBRL(s?.periodoAtual?.prejuizos) > 0
    )
    const totalDividaSocios = socios.reduce(
      (acc: number, s: any) => acc + parseBRL(s?.periodoAtual?.totalDividasAtivas),
      0
    )
    const alavSocios = fmm > 0 ? totalDividaSocios / fmm : 0

    let opcao_label: string
    let pontos: number

    if (algumComVencido || algumComPrejuizo) {
      opcao_label = 'Sócio com vencidos ou prejuízo no SCR'
      pontos = 0
    } else if (alavSocios <= 1.0) {
      opcao_label = 'Endividamento pessoal baixo — sem restrições'
      pontos = 6
    } else if (alavSocios <= 2.5) {
      opcao_label = 'Endividamento pessoal moderado'
      pontos = 3
    } else {
      opcao_label = 'Endividamento pessoal elevado'
      pontos = 1
    }

    registrar({
      criterio_id:  'endividamento_socios',
      pilar_id:     'socios_governanca',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
    }, 'auto')
  } else {
    criterios_manuais.push('endividamento_socios')
    avisos.push('SCR de sócios não enviado')
  }

  // 10. Tempo na Empresa (5 pts)
  const idadeAnos = calcularIdadeAnos(data?.cnpj?.dataAbertura)

  if (data?.cnpj?.dataAbertura) {
    let opcao_label: string
    let pontos: number

    if (idadeAnos >= 10) {
      opcao_label = 'Empresa com mais de 10 anos'
      pontos = 5
    } else if (idadeAnos >= 5) {
      opcao_label = 'Empresa entre 5 e 10 anos'
      pontos = 4
    } else if (idadeAnos >= 3) {
      opcao_label = 'Empresa entre 3 e 5 anos'
      pontos = 3
    } else if (idadeAnos >= 1) {
      opcao_label = 'Empresa entre 1 e 3 anos'
      pontos = 1
    } else {
      opcao_label = 'Empresa com menos de 1 ano'
      pontos = 0
    }

    registrar({
      criterio_id:  'tempo_empresa',
      pilar_id:     'socios_governanca',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `${idadeAnos.toFixed(1)} anos desde ${data.cnpj.dataAbertura}`,
    }, 'auto')
  } else {
    criterios_manuais.push('tempo_empresa')
    avisos.push('Data de abertura não disponível')
  }

  // ─── PILAR: Estrutura da Operação ──────────────────────────────────────────

  // 11. Quantidade de Fundos (2 pts)
  const qtdFidcs = contarModalidades(data?.scr?.modalidades, 'fidc')

  if (data?.scr?.modalidades !== undefined) {
    let opcao_label: string
    let pontos: number

    if (qtdFidcs === 0) {
      opcao_label = 'Sem FIDCs ativos'
      pontos = 2
    } else if (qtdFidcs === 1) {
      opcao_label = '1 FIDC ativo'
      pontos = 2
    } else if (qtdFidcs === 2) {
      opcao_label = '2 FIDCs ativos'
      pontos = 1
    } else if (qtdFidcs <= 4) {
      opcao_label = `${qtdFidcs} FIDCs ativos — atenção`
      pontos = 1
    } else {
      opcao_label = `${qtdFidcs} FIDCs ativos — crítico`
      pontos = 0
      avisos.push(`Atenção: ${qtdFidcs} FIDCs simultâneos detectados no SCR`)
    }

    registrar({
      criterio_id:  'quantidade_fundos',
      pilar_id:     'estrutura_operacao',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
    }, 'auto')
  } else {
    criterios_manuais.push('quantidade_fundos')
    avisos.push('SCR ausente — quantidade de FIDCs não verificada')
  }

  // 12. Perfil dos Sacados (5 pts)
  if (data?.curvaABC?.maiorClientePct !== undefined) {
    const maiorPct  = parsePct(data.curvaABC.maiorClientePct)
    const top5Pct   = parsePct(data.curvaABC.concentracaoTop5)
    const baseTotal = data.curvaABC.totalClientesNaBase ?? 0

    let opcao_label: string
    let pontos: number

    if (maiorPct < 15 && top5Pct < 50 && baseTotal > 10) {
      opcao_label = 'Pulverizado — maior sacado < 15%, top5 < 50%'
      pontos = 5
    } else if (maiorPct < 20 && top5Pct < 60) {
      opcao_label = 'Diversificado — maior sacado < 20%'
      pontos = 4
    } else if (maiorPct < 30 && top5Pct < 70) {
      opcao_label = 'Moderado — maior sacado 20–30%'
      pontos = 3
    } else if (maiorPct < 50) {
      opcao_label = 'Concentrado — maior sacado 30–50%'
      pontos = 1
    } else {
      opcao_label = 'Muito concentrado — maior sacado > 50%'
      pontos = 0
    }

    registrar({
      criterio_id:  'perfil_sacados',
      pilar_id:     'estrutura_operacao',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `Maior sacado: ${data.curvaABC.maiorClientePct}% | Top5: ${data.curvaABC.concentracaoTop5 ?? 'n/d'} | Base: ${baseTotal} clientes`,
    }, 'auto')
  } else {
    criterios_manuais.push('perfil_sacados')
    avisos.push('Curva ABC não enviada — perfil de sacados não preenchido')
  }

  // 13. Confirmação de Lastro (6 pts)
  if (data?.relatorioVisita) {
    const recomendacao = data.relatorioVisita.recomendacaoVisitante
    const mixRecebiveis = data.relatorioVisita.mixRecebiveis ?? ''
    const vendasDuplicata = parsePct(data.relatorioVisita.vendasDuplicata)
    const modalidade = data.relatorioVisita.modalidade

    let pctConfirmacao = 0
    if (vendasDuplicata > 0) {
      pctConfirmacao = vendasDuplicata
    } else if (mixRecebiveis.toLowerCase().includes('duplicata')) {
      pctConfirmacao = 70
    }

    const temComissaria = modalidade === 'comissaria' || modalidade === 'hibrida'

    let opcao_label: string
    let pontos: number

    if (pctConfirmacao >= 90 && !temComissaria) {
      opcao_label = '≥ 90% com confirmação — duplicatas mercantis'
      pontos = 6
    } else if (pctConfirmacao >= 70 || (pctConfirmacao === 0 && recomendacao === 'aprovado')) {
      opcao_label = '70–90% com confirmação'
      pontos = 4
    } else if (temComissaria) {
      opcao_label = 'Operação comissária — sem confirmação por padrão'
      pontos = 2
      avisos.push('Operação comissária detectada — lastro não confirmado')
    } else {
      opcao_label = 'Confirmação parcial ou não informada'
      pontos = 2
      avisos.push('Mix de recebíveis não permite inferir confirmação com segurança — revisar manualmente')
    }

    registrar({
      criterio_id:  'confirmacao_lastro',
      pilar_id:     'estrutura_operacao',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
    }, 'auto')
  } else {
    criterios_manuais.push('confirmacao_lastro')
    avisos.push('Relatório de visita não enviado — confirmação de lastro não preenchida')
  }

  // 14. Tipo de Operação (4 pts)
  if (data?.relatorioVisita) {
    const vendasDuplicata = parsePct(data.relatorioVisita.vendasDuplicata)
    const operaCheque     = data.relatorioVisita.operaCheque ?? false
    const modalidade      = data.relatorioVisita.modalidade

    let pctPerformada = vendasDuplicata > 0 ? vendasDuplicata : 0
    if (pctPerformada === 0 && !operaCheque) pctPerformada = 80

    let opcao_label: string
    let pontos: number

    if (pctPerformada >= 90 && !operaCheque) {
      opcao_label = '≥ 90% performada — risco jurídico baixo'
      pontos = 4
    } else if (pctPerformada >= 70) {
      opcao_label = '70–90% performada'
      pontos = 3
    } else if (pctPerformada >= 50 || operaCheque) {
      opcao_label = '50–70% performada ou cheques'
      pontos = 2
    } else {
      opcao_label = 'Majoritariamente a performar — alto risco'
      pontos = 0
    }

    registrar({
      criterio_id:  'tipo_operacao',
      pilar_id:     'estrutura_operacao',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   `Opera cheque: ${operaCheque ? 'Sim' : 'Não'} | Modalidade: ${modalidade ?? 'não informada'}`,
    }, 'auto')
  } else {
    criterios_manuais.push('tipo_operacao')
    avisos.push('Relatório de visita não enviado — tipo de operação não preenchido')
  }

  // ─── PILAR: Perfil da Empresa ──────────────────────────────────────────────

  // 15. Localização (4 pts)
  if (data?.cnpj?.endereco) {
    const endereco    = data.cnpj.endereco.toUpperCase()
    const fundSettings = config.parametros_elegibilidade as any
    const bloqueadas  = (fundSettings?.regioes_bloqueadas ?? []) as string[]

    const bloqueada = bloqueadas.some(r => endereco.includes(r.toUpperCase()))

    let opcao_label: string
    let pontos: number

    if (bloqueada) {
      opcao_label = 'Região bloqueada pela política do fundo'
      pontos = 0
      avisos.push('Atenção: empresa em região bloqueada pela política')
    } else {
      opcao_label = 'Região sem histórico negativo registrado'
      pontos = 3
      avisos.push('Localização inferida do CNPJ — analista deve confirmar se há histórico negativo na região')
    }

    registrar({
      criterio_id:  'localizacao',
      pilar_id:     'perfil_empresa',
      opcao_label,
      pontos_base:  pontos,
      pontos_final: pontos,
      observacao:   endereco,
    }, 'auto')
  } else {
    criterios_manuais.push('localizacao')
  }

  // ─── Critérios genuinamente manuais ───────────────────────────────────────
  const MANUAIS_OBRIGATORIOS = [
    'segmento',
    'estrutura_fisica',
    'garantias',
    'patrimonio_socios',
    'risco_sucessao',
  ]

  for (const id of MANUAIS_OBRIGATORIOS) {
    const jaTemManual = manuaisIdx.has(id)
    if (!jaTemManual) {
      criterios_manuais.push(id)
    } else {
      respostas.push(manuaisIdx.get(id)!)
    }
  }

  // patrimonio_empresa — tenta inferir pelo capital social vs FMM
  if (!manuaisIdx.has('patrimonio_empresa')) {
    const capitalSocial = parseBRL(data?.cnpj?.capitalSocialCNPJ)
    const imovelAlugado = data?.relatorioVisita?.descricaoEstrutura
      ?.toLowerCase().includes('alugad') ?? false

    if (capitalSocial > 0 && fmm > 0) {
      const ratioCapital = capitalSocial / fmm
      let opcao_label: string
      let pontos: number

      if (ratioCapital >= 2 && !imovelAlugado) {
        opcao_label = 'Patrimônio relevante — capital alto e imóvel próprio'
        pontos = 3
      } else if (ratioCapital >= 0.5) {
        opcao_label = 'Patrimônio compatível'
        pontos = 2
      } else if (ratioCapital >= 0.1) {
        opcao_label = 'Patrimônio limitado'
        pontos = 1
      } else {
        opcao_label = 'Capital social irrisório vs. faturamento'
        pontos = 0
        avisos.push(`Capital social (${data.cnpj.capitalSocialCNPJ}) muito baixo em relação ao FMM`)
      }

      registrar({
        criterio_id:  'patrimonio_empresa',
        pilar_id:     'perfil_empresa',
        opcao_label,
        pontos_base:  pontos,
        pontos_final: pontos,
        observacao:   `Capital social: ${data.cnpj.capitalSocialCNPJ} | ratio: ${ratioCapital.toFixed(2)}× FMM`,
      }, 'auto')
    } else {
      criterios_manuais.push('patrimonio_empresa')
    }
  } else {
    respostas.push(manuaisIdx.get('patrimonio_empresa')!)
  }

  // capacidade_operacional — tenta inferir por funcionários vs FMM e CNAE
  if (!manuaisIdx.has('capacidade_operacional')) {
    const funcionariosStr = data?.cnpj?.funcionarios ?? ''
    const fmmAnual        = fmm * 12

    let funcionarios = 0
    const matchRange = funcionariosStr.match(/(\d+)-(\d+)/)
    if (matchRange) {
      funcionarios = (parseInt(matchRange[1]) + parseInt(matchRange[2])) / 2
    } else {
      funcionarios = parseInt(funcionariosStr) || 0
    }

    const receitaPorFunc = funcionarios > 0 ? fmmAnual / funcionarios : 0

    let opcao_label: string
    let pontos: number

    if (receitaPorFunc === 0) {
      opcao_label = 'Capacidade operacional — dados insuficientes para inferir'
      pontos = 3
      criterios_manuais.push('capacidade_operacional')
      avisos.push('Número de funcionários não disponível — capacidade operacional não calculada automaticamente')
    } else if (receitaPorFunc >= 50000 && receitaPorFunc <= 800000) {
      opcao_label = 'Capacidade coerente com porte e faturamento'
      pontos = 4
      registrar({
        criterio_id:  'capacidade_operacional',
        pilar_id:     'perfil_empresa',
        opcao_label,
        pontos_base:  pontos,
        pontos_final: pontos,
        observacao:   `Receita/funcionário: R$ ${receitaPorFunc.toFixed(0)} | Funcionários: ${funcionarios}`,
      }, 'auto')
    } else if (receitaPorFunc > 800000) {
      opcao_label = 'Faturamento alto por funcionário — verificar operação'
      pontos = 3
      avisos.push('Faturamento por funcionário muito elevado — possível faturamento gerencial ou operação intensiva em capital')
      registrar({
        criterio_id:  'capacidade_operacional',
        pilar_id:     'perfil_empresa',
        opcao_label,
        pontos_base:  pontos,
        pontos_final: pontos,
      }, 'auto')
    } else {
      opcao_label = 'Capacidade operacional abaixo do esperado'
      pontos = 2
      registrar({
        criterio_id:  'capacidade_operacional',
        pilar_id:     'perfil_empresa',
        opcao_label,
        pontos_base:  pontos,
        pontos_final: pontos,
      }, 'auto')
    }
  } else {
    respostas.push(manuaisIdx.get('capacidade_operacional')!)
  }

  // ─── Calcular score final ──────────────────────────────────────────────────
  const score = calcularScore(config, respostas)

  return {
    respostas,
    score,
    criterios_auto,
    criterios_manuais: criterios_manuais.filter((v, i, a) => a.indexOf(v) === i),
    avisos,
  }
}
