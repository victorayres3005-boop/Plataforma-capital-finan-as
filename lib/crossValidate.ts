import type { ExtractedData } from "@/types";

/**
 * Validação cruzada determinística entre documentos.
 * Gera alertas quando informações de documentos diferentes são incoerentes,
 * potencialmente indicando erro de extração, mudança recente, fraude ou
 * documento desatualizado.
 *
 * Roda no servidor, antes do prompt ir pro Gemini. Os alertas gerados aqui
 * entram no contexto do prompt como `alertasDeterministicos` — a IA vê e
 * leva em conta no rating final.
 */

export interface CrossValidationAlert {
  severidade: "ALTA" | "MODERADA" | "INFO";
  codigo: string;
  descricao: string;
  impacto: string;
  mitigacao: string;
}

const parseBrMoney = (s: string | undefined | null): number => {
  if (!s || s === "—") return 0;
  const str = String(s).trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

export function crossValidate(data: ExtractedData): CrossValidationAlert[] {
  const alerts: CrossValidationAlert[] = [];

  // ═════════════════════════════════════════════════════════════════════════
  // 1. DRE receita anual × Faturamento bancário 12M
  // ═════════════════════════════════════════════════════════════════════════
  const dreAno0 = data.dre?.anos?.[0] as { receitaBruta?: string; receitaLiquida?: string } | undefined;
  const dreReceita = parseBrMoney(dreAno0?.receitaBruta) || parseBrMoney(dreAno0?.receitaLiquida);
  const fat12m = parseBrMoney(data.faturamento?.somatoriaAno);

  if (dreReceita > 0 && fat12m > 0) {
    const maior = Math.max(dreReceita, fat12m);
    const divergencia = Math.abs(dreReceita - fat12m) / maior;
    if (divergencia > 0.30) {
      const dreFmt = `R$ ${(dreReceita / 1000).toFixed(0)}k`;
      const fatFmt = `R$ ${(fat12m / 1000).toFixed(0)}k`;
      alerts.push({
        severidade: "MODERADA",
        codigo: "INCOERENCIA_DRE_FAT",
        descricao: `DRE declara receita anual de ${dreFmt} mas faturamento bancário 12m soma ${fatFmt} (divergência ${(divergencia * 100).toFixed(0)}%)`,
        impacto: "Pode indicar erro de extração, mudança recente de estrutura, receita fora do banco ou DRE desatualizado",
        mitigacao: "Solicitar DRE mais recente ou conciliar com extrato bancário completo do período",
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Alavancagem SCR (dívida/FMM) × Alavancagem Balanço (passivo/PL)
  // ═════════════════════════════════════════════════════════════════════════
  const scrTotal = parseBrMoney(data.scr?.totalDividasAtivas) || parseBrMoney(data.scr?.carteiraAVencer);
  const bAno0 = data.balanco?.anos?.[0] as {
    patrimonioLiquido?: string;
    passivoCirculante?: string;
    passivoNaoCirculante?: string;
  } | undefined;
  const balPL   = parseBrMoney(bAno0?.patrimonioLiquido);
  const balPC   = parseBrMoney(bAno0?.passivoCirculante);
  const balPnC  = parseBrMoney(bAno0?.passivoNaoCirculante);

  if (scrTotal > 0 && balPL > 0 && fat12m > 0) {
    const alavScr = scrTotal / (fat12m / 12); // múltiplo do FMM mensal
    const alavBal = (balPC + balPnC) / balPL;
    if (alavScr > 0 && alavBal > 0) {
      const maiorA = Math.max(alavScr, alavBal);
      const menorA = Math.min(alavScr, alavBal);
      const divA = (maiorA - menorA) / maiorA;
      if (divA > 0.50 && maiorA > 2) {
        alerts.push({
          severidade: "MODERADA",
          codigo: "ALAVANCAGEM_DIVERGENTE",
          descricao: `Alavancagem via SCR=${alavScr.toFixed(2)}x FMM difere de Passivo/PL=${alavBal.toFixed(2)}x (divergência ${(divA * 100).toFixed(0)}%)`,
          impacto: "Balanço pode estar desatualizado ou há dívidas não-bancárias relevantes não capturadas no SCR",
          mitigacao: "Verificar data base do balanço e identificar composição do passivo circulante",
        });
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. IR dos sócios × porte da empresa
  // ═════════════════════════════════════════════════════════════════════════
  const irSocios = data.irSocios ?? [];
  if (irSocios.length > 0 && fat12m > 0) {
    const irTotal = irSocios.reduce((acc, ir) => acc + parseBrMoney(ir.rendimentoTotal), 0);
    if (irTotal > 0 && irTotal > fat12m * 3) {
      alerts.push({
        severidade: "INFO",
        codigo: "IR_SOCIO_ACIMA_EMPRESA",
        descricao: `Renda total dos sócios (R$ ${(irTotal / 1000).toFixed(0)}k) supera 3× o faturamento anual da empresa (R$ ${(fat12m / 1000).toFixed(0)}k)`,
        impacto: "Sócios podem ter outras fontes de renda; esta empresa pode não ser a atividade principal",
        mitigacao: "Pergunta para visita: qual o peso desta operação no portfólio do sócio?",
      });
    }
    // Sócio com zero patrimônio declarado mas empresa grande é suspeito
    const patrimonioTotal = irSocios.reduce((acc, ir) => acc + parseBrMoney(ir.patrimonioLiquido), 0);
    if (fat12m > 2_000_000 && patrimonioTotal < fat12m * 0.1) {
      alerts.push({
        severidade: "MODERADA",
        codigo: "PATRIMONIO_SOCIO_INSUFICIENTE",
        descricao: `Patrimônio líquido total dos sócios (R$ ${(patrimonioTotal / 1000).toFixed(0)}k) é menor que 10% do faturamento da empresa`,
        impacto: "Aval pessoal do sócio tem capacidade limitada — garantia patrimonial frágil",
        mitigacao: "Avaliar se há garantias reais adicionais ou se o aval é simbólico",
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 4. Sazonalidade do faturamento (coeficiente de variação)
  // ═════════════════════════════════════════════════════════════════════════
  const meses = (data.faturamento?.meses ?? [])
    .map(m => parseBrMoney(m.valor))
    .filter(v => v >= 0);

  if (meses.length >= 6) {
    const media = meses.reduce((a, b) => a + b, 0) / meses.length;
    if (media > 0) {
      const variancia = meses.reduce((a, b) => a + (b - media) ** 2, 0) / meses.length;
      const desvio = Math.sqrt(variancia);
      const cv = desvio / media; // coeficiente de variação
      if (cv > 0.7) {
        const zerados = meses.filter(v => v === 0).length;
        alerts.push({
          severidade: "MODERADA",
          codigo: "FAT_SAZONALIDADE_CRITICA",
          descricao: `Coeficiente de variação mensal = ${(cv * 100).toFixed(0)}% (${zerados} meses zerados de ${meses.length}) — padrão sazonal extremo`,
          impacto: "FMM médio superestima a capacidade real de pagamento. FMM ajustado por pior trimestre seria mais conservador",
          mitigacao: "Considerar limite operacional baseado em 70% do FMM médio, não 100%. Validar sazonalidade com cedente na visita.",
        });
      } else if (cv > 0.5) {
        alerts.push({
          severidade: "INFO",
          codigo: "FAT_SAZONALIDADE_MODERADA",
          descricao: `Coeficiente de variação mensal = ${(cv * 100).toFixed(0)}% — sazonalidade relevante`,
          impacto: "Capacidade de pagamento varia consideravelmente ao longo do ano",
          mitigacao: "Confirmar sazonalidade com cedente na visita",
        });
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Capital social CNPJ × PL do Balanço (sanity check)
  // ═════════════════════════════════════════════════════════════════════════
  const capitalCnpj = parseBrMoney(data.cnpj?.capitalSocialCNPJ);
  if (capitalCnpj > 0 && balPL > 0) {
    // Capital social muito maior que PL sugere prejuízos acumulados grandes
    if (capitalCnpj > balPL * 2 && balPL > 0) {
      alerts.push({
        severidade: "INFO",
        codigo: "PL_INFERIOR_CAPITAL",
        descricao: `Patrimônio líquido (R$ ${(balPL / 1000).toFixed(0)}k) é menos da metade do capital social declarado (R$ ${(capitalCnpj / 1000).toFixed(0)}k)`,
        impacto: "Indica prejuízos acumulados relevantes ao longo dos anos",
        mitigacao: "Verificar histórico de resultados na DRE — é tendência ou caso isolado?",
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 6. Idade da empresa como gradiente de risco (não só bloqueio binário)
  // ═════════════════════════════════════════════════════════════════════════
  const dataAbertura = data.cnpj?.dataAbertura;
  if (dataAbertura) {
    const match = dataAbertura.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const abertura = new Date(+match[3], +match[2] - 1, +match[1]);
      const anosIdade = (Date.now() - abertura.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (anosIdade >= 3 && anosIdade < 5 && fat12m > 1_000_000) {
        alerts.push({
          severidade: "INFO",
          codigo: "EMPRESA_JOVEM_FATURAMENTO_ALTO",
          descricao: `Empresa com ${anosIdade.toFixed(1)} anos de fundação mas faturamento anual > R$ 1M`,
          impacto: "Crescimento acelerado pode indicar oportunidade ou pode esconder erros de governança ainda não maduros",
          mitigacao: "Validar histórico dos sócios em outras empresas e governança operacional na visita",
        });
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 7. Faturamento: soma dos meses × total declarado
  // ═════════════════════════════════════════════════════════════════════════
  const somaMeses = (data.faturamento?.meses ?? [])
    .reduce((acc, m) => acc + parseBrMoney(m.valor), 0);
  const totalDeclarado = parseBrMoney(data.faturamento?.somatoriaAno);

  if (somaMeses > 0 && totalDeclarado > 0) {
    const divergenciaFat = Math.abs(somaMeses - totalDeclarado) / Math.max(somaMeses, totalDeclarado);
    if (divergenciaFat > 0.05) {
      alerts.push({
        severidade: "MODERADA",
        codigo: "FAT_SOMA_DIVERGE_TOTAL",
        descricao: `Soma dos meses (R$ ${(somaMeses / 1000).toFixed(0)}k) difere ${(divergenciaFat * 100).toFixed(0)}% do total declarado (R$ ${(totalDeclarado / 1000).toFixed(0)}k)`,
        impacto: "Possível mês zerado não capturado ou valor incorreto em algum mês",
        mitigacao: "Conferir linha a linha no documento original — meses com R$ 0,00 devem estar presentes",
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 8. Capital social: QSA × Contrato Social
  // ═════════════════════════════════════════════════════════════════════════
  const qsaCap = parseBrMoney(data.qsa?.capitalSocial);
  const contrCap = parseBrMoney(data.contrato?.capitalSocial);

  if (qsaCap > 0 && contrCap > 0) {
    const divergenciaCap = Math.abs(qsaCap - contrCap) / Math.max(qsaCap, contrCap);
    if (divergenciaCap > 0.05) {
      alerts.push({
        severidade: "MODERADA",
        codigo: "CAPITAL_SOCIAL_DIVERGENTE",
        descricao: `QSA declara capital de R$ ${(qsaCap / 1000).toFixed(0)}k mas Contrato declara R$ ${(contrCap / 1000).toFixed(0)}k (divergência ${(divergenciaCap * 100).toFixed(0)}%)`,
        impacto: "Um dos documentos pode estar desatualizado — pode haver alteração contratual não refletida no QSA ou vice-versa",
        mitigacao: "Verificar datas de emissão dos dois documentos e solicitar o mais recente",
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 9. CPF dos sócios: QSA × IR declarado
  // Verifica se o CPF de cada IR de sócio consta no quadro societário do QSA.
  // ═════════════════════════════════════════════════════════════════════════
  const qsaCpfs = new Set(
    (data.qsa?.quadroSocietario ?? [])
      .map(s => s.cpfCnpj?.replace(/\D/g, ""))
      .filter((c): c is string => !!c && c.length >= 11)
  );

  if (qsaCpfs.size > 0) {
    for (const ir of irSocios) {
      const irCpf = ir.cpf?.replace(/\D/g, "");
      if (irCpf && irCpf.length === 11 && !qsaCpfs.has(irCpf)) {
        alerts.push({
          severidade: "MODERADA",
          codigo: "IR_SOCIO_CPF_NAO_ENCONTRADO_QSA",
          descricao: `IR de ${ir.nomeSocio || "sócio"} (CPF ${ir.cpf}) não encontrado no QSA da empresa`,
          impacto: "Possível IR de pessoa sem vínculo societário atual, ou QSA/IR com CPF divergente por erro de extração",
          mitigacao: "Confirmar CPF no documento original e verificar se houve alteração societária recente",
        });
      }
    }
  }

  return alerts;
}
