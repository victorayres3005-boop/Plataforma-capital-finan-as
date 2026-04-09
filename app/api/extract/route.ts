export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import type { CNPJData, ContratoSocialData, SCRData, QSAData, FaturamentoData, ProtestosData, ProcessosData, GrupoEconomicoData, CurvaABCData, DREData, BalancoData, IRSocioData, RelatorioVisitaData } from "@/types";
import { sanitizeDescricaoDebitos, sanitizeStr, sanitizeEnum, sanitizeMoney } from "@/lib/extract/sanitize";

export const runtime = "nodejs";

// ─────────────────────────────────────────
// API Keys & Config
// ─────────────────────────────────────────
// Suporta múltiplas keys separadas por vírgula: "key1,key2,key3"
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

const GEMINI_MODELS = ["gemini-2.0-flash"];

const OPENROUTER_API_KEYS = (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const OPENROUTER_MODELS = ["google/gemini-2.0-flash-exp:free", "meta-llama/llama-4-maverick:free"];

function geminiUrl(model: string, key: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function getFileExt(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "";
}



function hasReadableContent(text: string): boolean {
  const sample = text.substring(2000, Math.min(text.length, 8000));
  if (sample.length < 100) return text.trim().length >= 20;

  // Check 1: ratio de caracteres estranhos (fora ASCII 32-126 + acentuados PT-BR)
  const validChars = /[\x20-\x7EÀ-ÿçÇãÃõÕáéíóúâêîôûàèìòùäëïöü\n\r\t]/;
  let strangeCount = 0;
  for (let i = 0; i < sample.length; i++) {
    if (!validChars.test(sample[i])) strangeCount++;
  }
  if (strangeCount / sample.length > 0.3) {
    console.log(`[hasReadableContent] Failed: ${(strangeCount / sample.length * 100).toFixed(1)}% strange chars`);
    return false;
  }

  // Check 2: sequências longas sem espaço (encoding quebrado)
  const longSequences = sample.match(/\S{50,}/g);
  if (longSequences && longSequences.length >= 3) {
    console.log(`[hasReadableContent] Failed: ${longSequences.length} sequences with 50+ chars without spaces`);
    return false;
  }

  // Check 3: ratio de palavras reconhecíveis (PT-BR)
  const words = sample.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 0) {
    const recognizable = /^[a-zA-ZÀ-ÿçÇ0-9.,;:!?()\-/]+$/;
    const recognizedCount = words.filter(w => recognizable.test(w)).length;
    const ratio = recognizedCount / words.length;
    if (ratio < 0.4) {
      console.log(`[hasReadableContent] Failed: only ${(ratio * 100).toFixed(1)}% recognizable words (${recognizedCount}/${words.length})`);
      return false;
    }
  }

  // Check 4: palavras comuns em português (check original)
  const commonWords = /\b(de|do|da|dos|das|que|para|com|por|uma|não|são|será|social|capital|sócio|contrato|empresa|sociedade|cnpj|cpf|quotas|artigo|cláusula|objeto|prazo|foro|comarca|administra|faturamento|receita|valor|total|mês|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi;
  const matches = sample.match(commonWords);
  return (matches?.length || 0) >= 5;
}

// ─────────────────────────────────────────
// Extração de texto (PDF e DOCX)
// ─────────────────────────────────────────
async function extractText(buffer: Buffer, ext: string): Promise<string> {
  try {
    if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const data = await pdfParse(buffer);
      return data.text ?? "";
    }
    if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    }
    return "";
  } catch (err) {
    console.error(`[extractText] Failed for .${ext}:`, err);
    return "";
  }
}

// ─────────────────────────────────────────
// Extração de Excel (Faturamento)
// ─────────────────────────────────────────
async function extractExcel(buffer: Buffer): Promise<FaturamentoData> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const meses: { mes: string; valor: string }[] = [];

  // Tentar encontrar dados de faturamento na primeira sheet
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Planilha vazia");

  // Estratégia: procurar colunas com meses e valores
  const monthNames: Record<string, string> = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    janeiro: "01", fevereiro: "02", "março": "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
  };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // pular cabeçalho
    const cells = row.values as (string | number | null)[];
    if (!cells || cells.length < 2) return;

    // Procurar uma célula com mês e outra com valor numérico
    let mesStr = "";
    let valorNum = 0;

    for (const cell of cells) {
      if (cell === null || cell === undefined) continue;
      const str = String(cell).trim().toLowerCase();

      // Verificar se é um mês
      if (!mesStr) {
        for (const [name, num] of Object.entries(monthNames)) {
          if (str.includes(name)) {
            // Tentar pegar o ano do texto
            const yearMatch = str.match(/(\d{4})/);
            const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
            mesStr = `${num}/${year}`;
            break;
          }
        }
        // Verificar formato MM/YYYY ou MM/YY
        const dateMatch = str.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
        if (dateMatch && !mesStr) {
          const m = dateMatch[1].padStart(2, "0");
          const y = dateMatch[2].length === 2 ? `20${dateMatch[2]}` : dateMatch[2];
          mesStr = `${m}/${y}`;
        }
      }

      // Verificar se é valor numérico
      if (typeof cell === "number" && cell > 0) {
        valorNum = cell;
      } else if (typeof cell === "string") {
        const numStr = cell.replace(/[R$\s.]/g, "").replace(",", ".");
        const parsed = parseFloat(numStr);
        if (!isNaN(parsed) && parsed > 0 && parsed > valorNum) {
          valorNum = parsed;
        }
      }
    }

    if (mesStr && valorNum > 0) {
      meses.push({
        mes: mesStr,
        valor: valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      });
    }
  });

  // Ordenar meses por data crescente (mais antigo primeiro)
  const mesesOrdenados = [...meses].sort((a, b) => {
    const [ma, ya] = a.mes.split("/").map(Number);
    const [mb, yb] = b.mes.split("/").map(Number);
    return (ya - yb) || (ma - mb);
  });
  // Últimos 12 meses (independente de valor)
  const mesesFMM = mesesOrdenados.slice(-12);

  const parseBRVal = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;

  // somatoriaAno usa TODOS os meses
  const valores = meses.map(m => parseBRVal(m.valor));
  const soma = valores.reduce((a, b) => a + b, 0);

  // FMM = soma dos 12 / 12 (incluindo zeros na divisão)
  const valoresFMM = mesesFMM.map(m => parseBRVal(m.valor));
  const media = mesesFMM.length > 0 ? valoresFMM.reduce((a, b) => a + b, 0) / 12 : 0;

  // Meses zerados nos últimos 12
  const mesesZeradosExcel = mesesFMM
    .filter((_, i) => valoresFMM[i] === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  // Verificar alertas
  const faturamentoZerado = valores.length === 0 || valores.every(v => v === 0);
  const ultimoMes = mesesOrdenados.length > 0 ? mesesOrdenados[mesesOrdenados.length - 1].mes : "";

  // Verificar se dados estão atualizados (últimos 60 dias)
  let dadosAtualizados = true;
  if (ultimoMes) {
    const [m, y] = ultimoMes.split("/").map(Number);
    const lastDataDate = new Date(y, m - 1, 28); // último dia do mês dos dados
    const now = new Date();
    const diffDays = (now.getTime() - lastDataDate.getTime()) / (1000 * 60 * 60 * 24);
    dadosAtualizados = diffDays <= 75; // ~60 dias + margem
  }

  return {
    meses,
    somatoriaAno: soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    mediaAno: media.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    faturamentoZerado,
    dadosAtualizados,
    ultimoMesComDados: ultimoMes,
    mesesZerados: mesesZeradosExcel,
    quantidadeMesesZerados: mesesZeradosExcel.length,
    temMesesZerados: mesesZeradosExcel.length > 0,
  };
}

// ─────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────

const PROMPT_CNPJ = `Extraia dados do Cartão CNPJ. Retorne APENAS JSON:
{"razaoSocial":"","nomeFantasia":"","cnpj":"","dataAbertura":"","situacaoCadastral":"","dataSituacaoCadastral":"","motivoSituacao":"","naturezaJuridica":"","cnaePrincipal":"","cnaeSecundarios":"","porte":"","capitalSocialCNPJ":"","endereco":"","telefone":"","email":""}
Regras: CNPJ formato XX.XXX.XXX/XXXX-XX, datas DD/MM/YYYY, endereco completo concatenado, cnaeSecundarios separados por ;, campos ausentes=""，NÃO invente dados.`;

const PROMPT_QSA = `Extraia dados do QSA (Quadro de Sócios e Administradores). Retorne APENAS JSON:
{"capitalSocial":"","quadroSocietario":[{"nome":"","cpfCnpj":"","qualificacao":"","participacao":""}]}
Regras: liste TODOS os sócios/administradores, CPF formato XXX.XXX.XXX-XX, capitalSocial em reais (ex: "R$ 220.000,00"), não confunda testemunhas/advogados com sócios, campos ausentes="", NÃO invente dados.`;

const PROMPT_CONTRATO = `Extraia dados do Contrato Social. Retorne APENAS JSON:
{"socios":[{"nome":"","cpf":"","participacao":"","qualificacao":""}],"capitalSocial":"","objetoSocial":"","dataConstituicao":"","temAlteracoes":false,"prazoDuracao":"","administracao":"","foro":""}
Regras: liste TODOS os sócios (CPF formato XXX.XXX.XXX-XX), não inclua testemunhas/advogados, objetoSocial em até 2 frases, temAlteracoes=true se for alteração/consolidação, campos ausentes="" ou false, NÃO invente dados.`;

const PROMPT_FATURAMENTO = `Extraia valores mensais de faturamento do documento inteiro. Retorne APENAS JSON, sem markdown:
{"meses":[{"mes":"01/2024","valor":"1.234.567,89"}],"somatoriaTotal":"","totalMesesExtraidos":0,"faturamentoZerado":false,"dadosAtualizados":true,"ultimoMesComDados":"","anoMaisAntigo":"","anoMaisRecente":""}
Regras: extraia TODOS os meses de TODO o documento (tabelas, rodapés, cabeçalhos), todos os anos, mes=MM/YYYY, valor em formato brasileiro, se mês aparecer duplicado use o maior valor, NÃO inclua meses futuros sem dados, NÃO inclua zeros a menos que seja mês sem faturamento real, NÃO invente dados.`;

const PROMPT_SCR = `Extraia dados do SCR (Sistema de Informações de Crédito do Banco Central). Retorne APENAS JSON válido, sem markdown.

Schema obrigatório:
{"periodoReferencia":"MM/AAAA","tipoPessoa":"PJ","cnpjSCR":"","nomeCliente":"","cpfSCR":"","pctDocumentosProcessados":"","pctVolumeProcessado":"","carteiraAVencer":"","vencidos":"","prejuizos":"","limiteCredito":"","qtdeInstituicoes":"","qtdeOperacoes":"","totalDividasAtivas":"","operacoesAVencer":"","operacoesEmAtraso":"","operacoesVencidas":"","tempoAtraso":"","coobrigacoes":"","classificacaoRisco":"","carteiraCurtoPrazo":"","carteiraLongoPrazo":"","emDia":"","semHistorico":false,"numeroIfs":"","faixasAVencer":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","prazoIndeterminado":"0,00","total":"0,00"},"faixasVencidos":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","total":"0,00"},"faixasPrejuizos":{"ate12m":"0,00","acima12m":"0,00","total":"0,00"},"faixasLimite":{"ate360d":"0,00","acima360d":"0,00","total":"0,00"},"outrosValores":{"carteiraCredito":"0,00","repasses":"0,00","coobrigacoes":"0,00","responsabilidadeTotal":"0,00","creditosALiberar":"0,00","riscoTotal":"0,00"},"modalidades":[{"nome":"","total":"","aVencer":"","vencido":"","participacao":"","ehContingente":false}],"instituicoes":[{"nome":"","valor":""}],"valoresMoedaEstrangeira":"","historicoInadimplencia":"","periodoAnterior":{"periodoReferencia":"","carteiraAVencer":"","vencidos":"","prejuizos":"","limiteCredito":"","totalDividasAtivas":"","operacoesAVencer":"","operacoesEmAtraso":"","operacoesVencidas":"","carteiraCurtoPrazo":"","carteiraLongoPrazo":"","classificacaoRisco":"","qtdeInstituicoes":"","numeroIfs":"","emDia":"","semHistorico":false,"faixasAVencer":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","prazoIndeterminado":"0,00","total":"0,00"},"faixasVencidos":{"ate30d":"0,00","d31_60":"0,00","d61_90":"0,00","d91_180":"0,00","d181_360":"0,00","acima360d":"0,00","total":"0,00"}},"variacoes":{"emDia":"","carteiraCurtoPrazo":"","carteiraLongoPrazo":"","totalDividasAtivas":"","vencidos":"","prejuizos":"","limiteCredito":"","numeroIfs":""}}

REGRAS GERAIS:
- periodoReferencia: OBRIGATÓRIO, formato MM/AAAA (ex: "04/2025")
- tipoPessoa: "PF" se documento mostra CPF, "PJ" se CNPJ
- Valores monetários: formato brasileiro com pontos e vírgula (ex: "23.785,80"); ausente="0,00"
- NÃO invente dados; NÃO copie valores de A Vencer para Vencidos ou vice-versa
- semHistorico=true somente se totalDividasAtivas=0 E limiteCredito=0 E modalidades vazia

TABELA PRINCIPAL DE MODALIDADES:
- O documento SCR tem uma tabela com colunas: Modalidade | A Vencer | Vencidos | Prejuízos | Limite | Coobrigação | Participação
- Para cada linha de modalidade: extraia nome, aVencer (col "A Vencer"), vencido (col "Vencidos"), total (soma ou col "Total")
- carteiraAVencer = linha "Total" da coluna "A Vencer"
- vencidos = linha "Total" da coluna "Vencidos" — ATENÇÃO: NÃO confundir com A Vencer
- prejuizos = linha "Total" da coluna "Prejuízos"
- limiteCredito = linha "Total" da coluna "Limite de Crédito"
- emDia = linha "Total" da coluna "Em Dia" (se existir)
- ehContingente=true para modalidades em "Responsabilidades Contingentes" ou "Títulos Descontados"

TABELA DE FAIXAS "A VENCER" (seção: "Discriminação A Vencer por Faixa de Prazo" ou similar):
- ESTA tabela preenche APENAS faixasAVencer — não misture com faixasVencidos
- Mapeamento: "Até 30 dias"/"1 a 30 dias" → ate30d | "31 a 60 dias" → d31_60 | "61 a 90 dias" → d61_90 | "91 a 180 dias" → d91_180 | "181 a 360 dias" → d181_360 | "Acima de 360 dias"/"Superior a 360 dias" → acima360d | "Prazo Indeterminado" → prazoIndeterminado | "Total" → total
- carteiraCurtoPrazo = soma das faixas até 360d de A Vencer
- carteiraLongoPrazo = faixa acima360d de A Vencer

TABELA DE FAIXAS "VENCIDOS" (seção: "Discriminação Vencido por Faixa de Prazo" ou "Discriminação dos Vencidos" ou similar):
- ESTA tabela preenche APENAS faixasVencidos — NÃO reutilize valores de faixasAVencer
- As faixas de vencidos NÃO têm "Prazo Indeterminado"
- Mapeamento: "1 a 30 dias"/"Até 30 dias" → ate30d | "31 a 60 dias" → d31_60 | "61 a 90 dias" → d61_90 | "91 a 180 dias" → d91_180 | "181 a 360 dias" → d181_360 | "Acima de 360 dias" → acima360d | "Total" → total
- VALIDAÇÃO: faixasVencidos.total deve ser igual a vencidos (campo principal)
- Se a seção de vencidos não existir no documento (empresa sem vencidos), todos os campos de faixasVencidos = "0,00"

DOIS PERÍODOS:
- Se o documento tiver 2 períodos: período mais recente nos campos principais, anterior em periodoAnterior (incluindo faixasAVencer e faixasVencidos completos)
- variacoes: calcule a variação percentual de cada campo (ex: "+7,6%", "-6,5%", "0,0%" se igual, "" se ausente)

NÃO invente dados`;


const PROMPT_PROTESTOS = `Extraia dados da certidão de protestos. Retorne APENAS JSON:
{"vigentesQtd":"","vigentesValor":"","regularizadosQtd":"","regularizadosValor":"","detalhes":[{"data":"","credor":"","valor":"","regularizado":false}]}
Regras: vigentes=protestos ativos, regularizados=quitados, liste TODOS os protestos em detalhes, valores em formato brasileiro, regularizado=true se pago/regularizado, NÃO invente dados.`;

const PROMPT_PROCESSOS = `Extraia dados de processos judiciais. Retorne APENAS JSON:
{"passivosTotal":"","ativosTotal":"","valorTotalEstimado":"","temRJ":false,"distribuicao":[{"tipo":"","qtd":"","pct":""}],"bancarios":[{"banco":"","assunto":"","status":"","data":"","valor":""}],"fiscais":[{"contraparte":"","valor":"","status":"","data":""}],"fornecedores":[{"contraparte":"","assunto":"","valor":"","status":"","data":""}],"outros":[{"contraparte":"","assunto":"","valor":"","status":"","data":""}]}
Regras: passivosTotal=processos como réu, ativosTotal=como autor, temRJ=true se Recuperação Judicial, distribuicao por tipo (TRABALHISTA/BANCO/FISCAL/FORNECEDOR/OUTROS), trabalhistas NÃO listar individualmente, status=ARQUIVADO/EM ANDAMENTO/DISTRIBUIDO/JULGADO/EM GRAU DE RECURSO, campos ausentes="", NÃO invente dados.`;

const PROMPT_GRUPO_ECONOMICO = `Extraia dados do grupo econômico. Retorne APENAS JSON:
{"empresas":[{"razaoSocial":"","cnpj":"","relacao":"","scrTotal":"","protestos":"","processos":""}]}
Regras: liste TODAS as empresas, relacao="via Sócio"/"Controlada"/"Coligada" conforme documento, campos ausentes="", NÃO invente dados.`;

const PROMPT_CURVA_ABC = `Você receberá um relatório de Curva ABC de clientes. As colunas são: Cliente, Peso (kg), Valor Total, Ticket Médio, % Participação, % Acumulado, Classe ABC.

Retorne APENAS JSON válido, sem markdown, sem texto adicional:

{"clientes":[{"posicao":1,"nome":"","cnpjCpf":"","valorFaturado":"0,00","percentualReceita":"0.00","percentualAcumulado":"0.00","classe":"A"}],"totalClientesNaBase":0,"totalClientesExtraidos":0,"periodoReferencia":"","receitaTotalBase":"0,00","concentracaoTop3":"0.00","concentracaoTop5":"0.00","concentracaoTop10":"0.00","totalClientesClasseA":0,"receitaClasseA":"0,00","maiorCliente":"","maiorClientePct":"0.00","alertaConcentracao":false}

Regras obrigatórias:
1. Extraia TODOS os clientes do documento em ordem decrescente de valor
2. percentualReceita e percentualAcumulado: número sem % e sem vírgula (ex: 36.35, não "36,35%")
3. valorFaturado e receitaTotalBase: formato brasileiro com vírgula (ex: "4.664.989,95")
4. concentracaoTop3 = soma dos percentualReceita dos 3 maiores clientes
5. concentracaoTop5 = soma dos percentualReceita dos 5 maiores clientes
6. concentracaoTop10 = soma dos percentualReceita dos 10 maiores clientes
7. totalClientesClasseA = quantidade de linhas com Classe "A"
8. receitaClasseA = soma do valorFaturado de todos os clientes classe A
9. maiorCliente = nome do cliente com maior valor
10. maiorClientePct = percentualReceita do maior cliente
11. alertaConcentracao = true se maiorClientePct > 30
12. receitaTotalBase = valor da linha "Total Geral" do documento
13. totalClientesNaBase = total de clientes no documento (excluindo linha Total Geral)
14. Se o nome do cliente vier com CPF/número no início (ex: "59.580.931 MARIA LUIZA"), separe: cnpjCpf = "59.580.931", nome = "MARIA LUIZA DA SILVA MACEDO"
15. NÃO invente dados — use apenas o que está no documento`;

const PROMPT_DRE = `Extraia dados do DRE (Demonstração de Resultado). Pode ser formato SPED ou livre. Retorne APENAS JSON, sem markdown:
{"anos":[{"ano":"2024","receitaBruta":"0,00","deducoes":"0,00","receitaLiquida":"0,00","custoProdutosServicos":"0,00","lucroBruto":"0,00","margemBruta":"0,00","despesasOperacionais":"0,00","ebitda":"0,00","margemEbitda":"0,00","depreciacaoAmortizacao":"0,00","resultadoFinanceiro":"0,00","lucroAntesIR":"0,00","impostoRenda":"0,00","lucroLiquido":"0,00","margemLiquida":"0,00"}],"crescimentoReceita":"0,00","tendenciaLucro":"estavel","periodoMaisRecente":"","observacoes":""}
Regras: extraia dados anuais consolidados (não mensais/trimestrais), todos os anos encontrados em ordem crescente, SPED: "RECEITA OPERACIONAL BRUTA"=receitaBruta, "LUCRO/PREJUIZO APURADO NO PERÍODO"=lucroLiquido, valores negativos com sinal de menos, margens em %, tendenciaLucro="crescimento"/"queda"/"estavel", NÃO invente dados.`;

const PROMPT_BALANCO = `Extraia dados do Balanço Patrimonial. Pode ser formato SPED ou livre. Retorne APENAS JSON, sem markdown:
{"anos":[{"ano":"2024","ativoTotal":"0,00","ativoCirculante":"0,00","caixaEquivalentes":"0,00","contasAReceber":"0,00","estoques":"0,00","outrosAtivosCirculantes":"0,00","ativoNaoCirculante":"0,00","imobilizado":"0,00","intangivel":"0,00","outrosAtivosNaoCirculantes":"0,00","passivoTotal":"0,00","passivoCirculante":"0,00","fornecedores":"0,00","emprestimosCP":"0,00","outrosPassivosCirculantes":"0,00","passivoNaoCirculante":"0,00","emprestimosLP":"0,00","outrosPassivosNaoCirculantes":"0,00","patrimonioLiquido":"0,00","capitalSocial":"0,00","reservas":"0,00","lucrosAcumulados":"0,00","liquidezCorrente":"0,00","liquidezGeral":"0,00","endividamentoTotal":"0,00","capitalDeGiroLiquido":"0,00"}],"periodoMaisRecente":"","tendenciaPatrimonio":"estavel","observacoes":""}
Regras: SPED=use Saldo Final, todos os anos em ordem crescente, patrimonioLiquido negativo mantém sinal de menos, liquidezCorrente=AC÷PC, endividamento em %, capitalDeGiro=AC-PC (pode ser negativo), tendenciaPatrimonio="crescimento"/"queda"/"estavel", NÃO invente dados.`;

const PROMPT_IR_SOCIOS = `Extraia dados do IR do sócio (recibo de entrega ou declaração completa). Retorne APENAS JSON, sem markdown:
{"nomeSocio":"","cpf":"","anoBase":"","tipoDocumento":"recibo","numeroRecibo":"","dataEntrega":"","situacaoMalhas":false,"debitosEmAberto":false,"descricaoDebitos":"","rendimentosTributaveis":"0,00","rendimentosIsentos":"0,00","rendimentoTotal":"0,00","impostoDefinido":"0,00","valorQuota":"0,00","bensImoveis":"0,00","bensVeiculos":"0,00","aplicacoesFinanceiras":"0,00","outrosBens":"0,00","totalBensDireitos":"0,00","dividasOnus":"0,00","patrimonioLiquido":"0,00","impostoPago":"0,00","impostoRestituir":"0,00","temSociedades":false,"sociedades":[],"coerenciaComEmpresa":true,"observacoes":""}
Regras: anoBase=ANO-CALENDÁRIO (não exercício), ex: "EXERCÍCIO 2025 — ANO-CALENDÁRIO 2024" → anoBase="2024", nomeSocio e anoBase são OBRIGATÓRIOS, cpf formato 000.000.000-00, situacaoMalhas=true se mencionar pendências de malhas, debitosEmAberto=true se mencionar débitos, recibo simples deixe valores monetários como "0,00", NÃO invente dados.
impostoDefinido=valor total do imposto apurado/calculado antes de deduções de pagamentos (buscar por "Imposto devido", "Imposto apurado", "Total do imposto" na declaração).
valorQuota=valor de cada parcela/quota do imposto a pagar (buscar por "valor da quota", "valor da parcela", "quota mensal" — preencher apenas se houver parcelamento, caso contrário "0,00").`;

const PROMPT_RELATORIO_VISITA = `Extraia dados do Relatório de Visita (texto livre, formulário ou template). Retorne APENAS JSON, sem markdown:
{"dataVisita":"","responsavelVisita":"","localVisita":"","duracaoVisita":"","estruturaFisicaConfirmada":true,"funcionariosObservados":0,"estoqueVisivel":false,"estimativaEstoque":"","operacaoCompativelFaturamento":true,"maquinasEquipamentos":false,"descricaoEstrutura":"","pontosPositivos":[],"pontosAtencao":[],"recomendacaoVisitante":"aprovado","nivelConfiancaVisita":"alto","presencaSocios":false,"sociosPresentes":[],"documentosVerificados":[],"observacoesLivres":"","pleito":"","modalidade":"","taxaConvencional":"","taxaComissaria":"","limiteTotal":"","limiteConvencional":"","limiteComissaria":"","limitePorSacado":"","ticketMedio":"","valorCobrancaBoleto":"","prazoRecompraCedente":"","prazoEnvioCartorio":"","prazoMaximoOp":"","cobrancaTAC":"","tranche":"","prazoTranche":"","folhaPagamento":"","endividamentoBanco":"","endividamentoFactoring":"","vendasCheque":"","vendasDuplicata":"","vendasOutras":"","prazoMedioFaturamento":"","prazoMedioEntrega":"","referenciasFornecedores":""}
Regras gerais: dataVisita=DD/MM/YYYY, recomendacaoVisitante="aprovado"/"condicional"/"reprovado", nivelConfiancaVisita="alto"/"medio"/"baixo", campos ausentes="" ou false, NÃO invente dados.
pleito=valor em R$ sugerido pelo cedente (ex: "150000,00") — buscar por "pleito", "valor solicitado", "limite sugerido", "crédito pleiteado"; se não encontrado deixe "".
modalidade=tipo de operação — "comissaria" (cedente mantém relação com sacado, faz cobrança), "convencional" (cessão plena, FIDC assume risco), "hibrida", "outra"; buscar por "comissária", "convencional", "modalidade", "tipo de operação"; se não encontrado deixe "".
Parâmetros operacionais (buscar em tabelas, campos rotulados, seção de parâmetros/condições):
- taxaConvencional: taxa % para modalidade convencional (ex: "2,5%")
- taxaComissaria: taxa % para modalidade comissária (ex: "1,8%")
- limiteTotal: limite total aprovado em R$ (ex: "500000,00")
- limiteConvencional/limiteComissaria: limites por modalidade
- limitePorSacado: limite máximo por sacado em R$
- ticketMedio: valor médio por duplicata/título em R$
- valorCobrancaBoleto: valor cobrado por emissão/cobrança de boleto em R$
- prazoRecompraCedente: prazo em dias para recompra pelo cedente (buscar "prazo de recompra", "recompra em X dias")
- prazoEnvioCartorio: dias até envio para cartório (buscar "cartório em X dias", "envio para cartório")
- prazoMaximoOp: prazo máximo da operação em dias
- cobrancaTAC: valor ou "Sim"/"Não" para cobrança de TAC
- tranche: valor da tranche em R$
- prazoTranche: prazo da tranche em dias
Dados da empresa (coletados na visita — buscar em campos rotulados):
- folhaPagamento: folha de pagamento mensal em R$ (ex: "230000,00")
- endividamentoBanco: endividamento bancário total em R$ (use "—" se não há endividamento)
- endividamentoFactoring: endividamento com factoring/FIDC em R$
- vendasCheque/vendasDuplicata/vendasOutras: % de vendas por forma de recebimento (ex: "10%", "70%", "20%")
- prazoMedioFaturamento: prazo médio em dias (ex: "50")
- prazoMedioEntrega: prazo médio de entrega em dias (ex: "3")
- referenciasFornecedores: lista de referências comerciais/fornecedores (texto separado por vírgula ou ";" )`;

// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
async function callGemini(prompt: string, content: string | { mimeType: string; base64: string }): Promise<string> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (typeof content === "string") {
    parts.push({ text: prompt + "\n\n--- DOCUMENTO ---\n\n" + content });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
    parts.push({ text: prompt });
  }

  for (const apiKey of GEMINI_API_KEYS) {
    for (const model of GEMINI_MODELS) {
      for (let attempt = 0; attempt < 1; attempt++) {
        try {
          console.log(`[Gemini] key=${apiKey.substring(0, 8)}... model=${model}`);
          const controller = new AbortController();
          const fetchTimeout = setTimeout(() => controller.abort(), 25000);
          const response = await fetch(geminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
              },
            }),
          });
          clearTimeout(fetchTimeout);

          if (response.status === 429) {
            console.log(`[Gemini] Rate limited on key=${apiKey.substring(0, 8)} model=${model}, skipping to next`);
            break; // pula para próximo model/key sem esperar
          }

          if (!response.ok) {
            const body = await response.text();
            console.error(`[Gemini] HTTP ${response.status}:`, body.substring(0, 300));
            break;
          }

          const result = await response.json();
          const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            console.error(`[Gemini] Empty response`);
            break;
          }
          return text;
        } catch (err) {
          console.error(`[Gemini] Error:`, err instanceof Error ? err.message : err);
          break;
        }
      }
    }
  }
  throw new Error("GEMINI_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada OpenRouter (fallback text-only)
// ─────────────────────────────────────────
async function callOpenRouter(prompt: string, textContent: string): Promise<string> {
  if (OPENROUTER_API_KEYS.length === 0) throw new Error("OPENROUTER_API_KEYS não configurada");
  for (const apiKey of OPENROUTER_API_KEYS) {
    for (const model of OPENROUTER_MODELS) {
      try {
        console.log(`[OpenRouter/extract] key=${apiKey.substring(0, 16)}... model=${model}`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://plataformacapital.vercel.app",
            "X-Title": "Capital Financas",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt + "\n\n--- DOCUMENTO ---\n\n" + textContent }],
            temperature: 0.1,
            max_tokens: 8192,
          }),
        });
        if (!response.ok) { console.error(`[OpenRouter/extract] HTTP ${response.status}`); continue; }
        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content;
        if (!text) { console.error(`[OpenRouter/extract] Empty response`); continue; }
        console.log(`[OpenRouter/extract] Success model=${model}`);
        return text;
      } catch (err) {
        console.error(`[OpenRouter/extract] Error:`, err instanceof Error ? err.message : err);
      }
    }
  }
  throw new Error("OPENROUTER_EXHAUSTED");
}

// ─────────────────────────────────────────
// Chamada AI — Gemini primário, OpenRouter fallback (texto)
// ─────────────────────────────────────────
async function callAI(
  prompt: string,
  textContent: string,
  imageContent?: { mimeType: string; base64: string },
): Promise<string> {
  const content: string | { mimeType: string; base64: string } = imageContent ?? textContent;

  // Timeout global de 45s — evita que a função fique pendurada
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT_55s")), 55000)
  );

  const aiCall = async (): Promise<string> => {
    try {
      return await callGemini(prompt, content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (imageContent || OPENROUTER_API_KEYS.length === 0) throw err;
      console.warn(`[extract] Gemini falhou (${msg}), tentando OpenRouter...`);
      return await callOpenRouter(prompt, textContent);
    }
  };

  return Promise.race([aiCall(), timeoutPromise]);
}

// ─────────────────────────────────────────
// Parse JSON
// ─────────────────────────────────────────
function parseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
  }
  return JSON.parse(cleaned);
}

// ─────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────
function fillCNPJDefaults(data: Partial<CNPJData>): CNPJData {
  return {
    razaoSocial: data.razaoSocial || "", nomeFantasia: data.nomeFantasia || "",
    cnpj: data.cnpj || "", dataAbertura: data.dataAbertura || "",
    situacaoCadastral: data.situacaoCadastral || "", dataSituacaoCadastral: data.dataSituacaoCadastral || "",
    motivoSituacao: data.motivoSituacao || "", naturezaJuridica: data.naturezaJuridica || "",
    cnaePrincipal: data.cnaePrincipal || "", cnaeSecundarios: data.cnaeSecundarios || "",
    porte: data.porte || "", capitalSocialCNPJ: data.capitalSocialCNPJ || "",
    endereco: data.endereco || "", telefone: data.telefone || "", email: data.email || "",
  };
}

function fillQSADefaults(data: Partial<QSAData>): QSAData {
  const quadro = Array.isArray(data.quadroSocietario) && data.quadroSocietario.length > 0
    ? data.quadroSocietario.map(s => ({
        nome: s.nome || "", cpfCnpj: s.cpfCnpj || "",
        qualificacao: s.qualificacao || "", participacao: s.participacao || "",
      }))
    : [{ nome: "", cpfCnpj: "", qualificacao: "", participacao: "" }];
  return { capitalSocial: data.capitalSocial || "", quadroSocietario: quadro };
}

function fillContratoDefaults(data: Partial<ContratoSocialData>): ContratoSocialData {
  const socios = Array.isArray(data.socios) && data.socios.length > 0
    ? data.socios.map(s => ({ nome: s.nome || "", cpf: s.cpf || "", participacao: s.participacao || "", qualificacao: s.qualificacao || "" }))
    : [{ nome: "", cpf: "", participacao: "", qualificacao: "" }];
  return {
    socios, capitalSocial: data.capitalSocial || "", objetoSocial: data.objetoSocial || "",
    dataConstituicao: data.dataConstituicao || "", temAlteracoes: data.temAlteracoes || false,
    prazoDuracao: data.prazoDuracao || "", administracao: data.administracao || "", foro: data.foro || "",
  };
}

function fillFaturamentoDefaults(data: Partial<FaturamentoData>): FaturamentoData {
  const _mesAtualFiltro = new Date().getMonth() + 1;
  const _anoAtualFiltro = new Date().getFullYear();

  const meses = (Array.isArray(data.meses) ? data.meses : [])
    .filter(m => {
      if (!m.mes) return false;
      const [mesNum, anoNum] = m.mes.split("/").map(Number);
      if (!mesNum || !anoNum) return false;

      // Remove meses futuros — ano futuro, ou mesmo ano mas mês futuro
      if (anoNum > _anoAtualFiltro) return false;
      if (anoNum === _anoAtualFiltro && mesNum > _mesAtualFiltro) return false;

      return true; // mantém todos os meses passados, incluindo zeros sazonais
    });
  const parseBR = (v: string) => parseFloat((v || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const fmtBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ordenados = [...meses].sort((a, b) => {
    const [mesA, anoA] = (a.mes || "").split("/").map(Number);
    const [mesB, anoB] = (b.mes || "").split("/").map(Number);
    return (anoA - anoB) || (mesA - mesB);
  });

  const meses12 = ordenados.slice(-12);
  const soma12 = meses12.reduce((s, m) => s + parseBR(m.valor), 0);
  const fmm12m = meses12.length > 0 ? soma12 / 12 : 0;

  const porAno: Record<string, number[]> = {};
  for (const m of ordenados) {
    const parts = (m.mes || "").split("/");
    const anoRaw = parts[1] || "";
    const ano = anoRaw.length === 2 ? "20" + anoRaw : anoRaw;
    if (!ano) continue;
    if (!porAno[ano]) porAno[ano] = [];
    porAno[ano].push(parseBR(m.valor));
  }

  const fmmAnual: Record<string, number> = {};
  for (const [ano, valores] of Object.entries(porAno)) {
    const somaAno = valores.reduce((s, v) => s + v, 0);
    fmmAnual[ano] = somaAno / valores.length;
  }

  const anosCompletos = Object.entries(porAno).filter(([, v]) => v.length === 12);
  const fmmMedio = anosCompletos.length > 0
    ? anosCompletos.reduce((s, [ano]) => s + fmmAnual[ano], 0) / anosCompletos.length
    : fmm12m;

  const anoAtual = String(new Date().getFullYear());
  const fmmAnoAtual = fmmAnual[anoAtual];
  let tendencia: "crescimento" | "estavel" | "queda" | "indefinido" = "indefinido";
  if (fmmAnoAtual && fmm12m > 0) {
    const delta = (fmmAnoAtual - fmm12m) / fmm12m;
    if (delta > 0.05) tendencia = "crescimento";
    else if (delta < -0.05) tendencia = "queda";
    else tendencia = "estavel";
  }

  const somaTotal = meses.reduce((s, m) => s + parseBR(m.valor), 0);

  const mesesZerados = meses12
    .filter(m => parseBR(m.valor) === 0)
    .map(m => ({ mes: m.mes, motivo: "Valor zero ou ausente" }));

  return {
    meses,
    somatoriaAno: fmtBR(somaTotal),
    mediaAno: fmtBR(fmm12m),
    fmm12m: fmtBR(fmm12m),
    fmmAnual: Object.fromEntries(
      Object.entries(fmmAnual).map(([ano, v]) => [ano, fmtBR(v)])
    ),
    fmmMedio: fmtBR(fmmMedio),
    tendencia,
    faturamentoZerado: meses.length === 0 || meses.every(m => parseBR(m.valor) === 0),
    dadosAtualizados: data.dadosAtualizados ?? false,
    ultimoMesComDados: data.ultimoMesComDados || (ordenados.length > 0 ? ordenados[ordenados.length - 1].mes : ""),
    mesesZerados,
    quantidadeMesesZerados: mesesZerados.length,
    temMesesZerados: mesesZerados.length > 0,
  };
}

function fillSCRDefaults(data: Partial<SCRData>): SCRData {
  // Normaliza faixas key-por-key para evitar objetos vazios {} que passam pelo ||
  const f = data.faixasAVencer as Record<string, string> | undefined;
  const fv = data.faixasVencidos as Record<string, string> | undefined;
  const faixasAVencer: SCRData["faixasAVencer"] = {
    ate30d: f?.ate30d || "", d31_60: f?.d31_60 || "", d61_90: f?.d61_90 || "",
    d91_180: f?.d91_180 || "", d181_360: f?.d181_360 || "", acima360d: f?.acima360d || "",
    prazoIndeterminado: f?.prazoIndeterminado || "", total: f?.total || "",
  };
  const faixasVencidos: SCRData["faixasVencidos"] = {
    ate30d: fv?.ate30d || "", d31_60: fv?.d31_60 || "", d61_90: fv?.d61_90 || "",
    d91_180: fv?.d91_180 || "", d181_360: fv?.d181_360 || "", acima360d: fv?.acima360d || "",
    total: fv?.total || "",
  };

  return {
    // Identificação — preservar para roteamento PJ vs PF
    tipoPessoa: data.tipoPessoa || undefined,
    nomeCliente: data.nomeCliente || "",
    cpfSCR: data.cpfSCR || "",
    periodoReferencia: data.periodoReferencia || "",
    carteiraAVencer: data.carteiraAVencer || "", vencidos: data.vencidos || "",
    prejuizos: data.prejuizos || "", limiteCredito: data.limiteCredito || "",
    qtdeInstituicoes: data.qtdeInstituicoes || "", qtdeOperacoes: data.qtdeOperacoes || "",
    totalDividasAtivas: data.totalDividasAtivas || "", operacoesAVencer: data.operacoesAVencer || "",
    operacoesEmAtraso: data.operacoesEmAtraso || "", operacoesVencidas: data.operacoesVencidas || "",
    tempoAtraso: data.tempoAtraso || "", coobrigacoes: data.coobrigacoes || "",
    classificacaoRisco: data.classificacaoRisco || "",
    carteiraCurtoPrazo: data.carteiraCurtoPrazo || "", carteiraLongoPrazo: data.carteiraLongoPrazo || "",
    modalidades: Array.isArray(data.modalidades) ? data.modalidades : [],
    instituicoes: Array.isArray(data.instituicoes) ? data.instituicoes : [],
    valoresMoedaEstrangeira: data.valoresMoedaEstrangeira || "",
    historicoInadimplencia: data.historicoInadimplencia || "",
    // Campos detalhados
    cnpjSCR: data.cnpjSCR || "",
    pctDocumentosProcessados: data.pctDocumentosProcessados || "",
    pctVolumeProcessado: data.pctVolumeProcessado || "",
    faixasAVencer,
    faixasVencidos,
    faixasPrejuizos: { ate12m: data.faixasPrejuizos?.ate12m || "", acima12m: data.faixasPrejuizos?.acima12m || "", total: data.faixasPrejuizos?.total || "" },
    faixasLimite: { ate360d: data.faixasLimite?.ate360d || "", acima360d: data.faixasLimite?.acima360d || "", total: data.faixasLimite?.total || "" },
    outrosValores: {
      carteiraCredito: data.outrosValores?.carteiraCredito || "",
      responsabilidadeTotal: data.outrosValores?.responsabilidadeTotal || "",
      riscoTotal: data.outrosValores?.riscoTotal || "",
      coobrigacaoAssumida: data.outrosValores?.coobrigacaoAssumida || "",
      coobrigacaoRecebida: data.outrosValores?.coobrigacaoRecebida || "",
      creditosALiberar: data.outrosValores?.creditosALiberar || "",
    },
    emDia: data.emDia || "",
    semHistorico: data.semHistorico ?? (!data.totalDividasAtivas && !data.carteiraAVencer && !data.vencidos && !data.prejuizos && !data.limiteCredito),
    numeroIfs: data.numeroIfs || "",
  };
}

function fillProtestosDefaults(data: Partial<ProtestosData>): ProtestosData {
  return {
    vigentesQtd: data.vigentesQtd || "", vigentesValor: data.vigentesValor || "",
    regularizadosQtd: data.regularizadosQtd || "", regularizadosValor: data.regularizadosValor || "",
    detalhes: Array.isArray(data.detalhes) ? data.detalhes : [],
  };
}

function fillProcessosDefaults(data: Partial<ProcessosData>): ProcessosData {
  return {
    passivosTotal: data.passivosTotal || "", ativosTotal: data.ativosTotal || "",
    valorTotalEstimado: data.valorTotalEstimado || "", temRJ: data.temRJ || false,
    distribuicao: Array.isArray(data.distribuicao) ? data.distribuicao : [],
    bancarios: Array.isArray(data.bancarios) ? data.bancarios : [],
    fiscais: Array.isArray(data.fiscais) ? data.fiscais : [],
    fornecedores: Array.isArray(data.fornecedores) ? data.fornecedores : [],
    outros: Array.isArray(data.outros) ? data.outros : [],
  };
}

function fillGrupoEconomicoDefaults(data: Partial<GrupoEconomicoData>): GrupoEconomicoData {
  return { empresas: Array.isArray(data.empresas) ? data.empresas : [] };
}

function fillCurvaABCDefaults(data: Partial<CurvaABCData>): CurvaABCData {
  return {
    clientes: data.clientes ?? [],
    totalClientesNaBase: data.totalClientesNaBase ?? 0,
    totalClientesExtraidos: data.totalClientesExtraidos ?? 0,
    periodoReferencia: data.periodoReferencia ?? "",
    receitaTotalBase: data.receitaTotalBase ?? "0,00",
    concentracaoTop3: data.concentracaoTop3 ?? "0.00",
    concentracaoTop5: data.concentracaoTop5 ?? "0.00",
    concentracaoTop10: data.concentracaoTop10 ?? "0.00",
    totalClientesClasseA: data.totalClientesClasseA ?? 0,
    receitaClasseA: data.receitaClasseA ?? "0,00",
    maiorCliente: data.maiorCliente ?? "",
    maiorClientePct: data.maiorClientePct ?? "0.00",
    alertaConcentracao: data.alertaConcentracao ?? false,
  };
}

function fillDREDefaults(data: Partial<DREData>): DREData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    crescimentoReceita: data.crescimentoReceita || "0,00",
    tendenciaLucro: data.tendenciaLucro || "estavel",
    periodoMaisRecente: data.periodoMaisRecente || "",
    observacoes: data.observacoes || "",
  };
}

function fillBalancoDefaults(data: Partial<BalancoData>): BalancoData {
  return {
    anos: Array.isArray(data.anos) ? data.anos : [],
    periodoMaisRecente: data.periodoMaisRecente || "",
    tendenciaPatrimonio: data.tendenciaPatrimonio || "estavel",
    observacoes: data.observacoes || "",
  };
}

function fillIRSocioDefaults(data: Partial<IRSocioData>): IRSocioData {
  return {
    nomeSocio: sanitizeStr(data.nomeSocio, 100),
    cpf: data.cpf || "",
    anoBase: data.anoBase || "",
    tipoDocumento: sanitizeEnum(data.tipoDocumento, ["recibo", "completa", "simples"] as const, "recibo"),
    numeroRecibo: data.numeroRecibo || "",
    dataEntrega: data.dataEntrega || "",
    situacaoMalhas: data.situacaoMalhas ?? false,
    debitosEmAberto: data.debitosEmAberto ?? false,
    descricaoDebitos: sanitizeDescricaoDebitos(data.descricaoDebitos),
    rendimentosTributaveis: sanitizeMoney(data.rendimentosTributaveis),
    rendimentosIsentos: sanitizeMoney(data.rendimentosIsentos),
    rendimentoTotal: sanitizeMoney(data.rendimentoTotal),
    bensImoveis: sanitizeMoney(data.bensImoveis),
    bensVeiculos: sanitizeMoney(data.bensVeiculos),
    aplicacoesFinanceiras: sanitizeMoney(data.aplicacoesFinanceiras),
    outrosBens: sanitizeMoney(data.outrosBens),
    totalBensDireitos: sanitizeMoney(data.totalBensDireitos),
    dividasOnus: sanitizeMoney(data.dividasOnus),
    patrimonioLiquido: sanitizeMoney(data.patrimonioLiquido),
    impostoDefinido: sanitizeMoney(data.impostoDefinido),
    valorQuota: sanitizeMoney(data.valorQuota),
    impostoPago: sanitizeMoney(data.impostoPago),
    impostoRestituir: sanitizeMoney(data.impostoRestituir),
    temSociedades: data.temSociedades ?? false,
    sociedades: Array.isArray(data.sociedades) ? data.sociedades : [],
    coerenciaComEmpresa: data.coerenciaComEmpresa ?? true,
    observacoes: sanitizeStr(data.observacoes, 500),
  };
}

function fillRelatorioVisitaDefaults(data: Partial<RelatorioVisitaData>): RelatorioVisitaData {
  return {
    dataVisita: data.dataVisita || "",
    responsavelVisita: data.responsavelVisita || "",
    localVisita: data.localVisita || "",
    duracaoVisita: data.duracaoVisita || "",
    estruturaFisicaConfirmada: data.estruturaFisicaConfirmada ?? true,
    funcionariosObservados: data.funcionariosObservados ?? 0,
    estoqueVisivel: data.estoqueVisivel ?? false,
    estimativaEstoque: data.estimativaEstoque || "",
    operacaoCompativelFaturamento: data.operacaoCompativelFaturamento ?? true,
    maquinasEquipamentos: data.maquinasEquipamentos ?? false,
    descricaoEstrutura: data.descricaoEstrutura || "",
    pontosPositivos: Array.isArray(data.pontosPositivos) ? data.pontosPositivos : [],
    pontosAtencao: Array.isArray(data.pontosAtencao) ? data.pontosAtencao : [],
    recomendacaoVisitante: data.recomendacaoVisitante || "aprovado",
    nivelConfiancaVisita: data.nivelConfiancaVisita || "alto",
    presencaSocios: data.presencaSocios ?? false,
    sociosPresentes: Array.isArray(data.sociosPresentes) ? data.sociosPresentes : [],
    documentosVerificados: Array.isArray(data.documentosVerificados) ? data.documentosVerificados : [],
    observacoesLivres: data.observacoesLivres || "",
    pleito: data.pleito || "",
    modalidade: data.modalidade || undefined,
    taxaConvencional: data.taxaConvencional || "",
    taxaComissaria: data.taxaComissaria || "",
    limiteTotal: data.limiteTotal || "",
    limiteConvencional: data.limiteConvencional || "",
    limiteComissaria: data.limiteComissaria || "",
    limitePorSacado: data.limitePorSacado || "",
    ticketMedio: data.ticketMedio || "",
    valorCobrancaBoleto: data.valorCobrancaBoleto || "",
    prazoRecompraCedente: data.prazoRecompraCedente || "",
    prazoEnvioCartorio: data.prazoEnvioCartorio || "",
    prazoMaximoOp: data.prazoMaximoOp || "",
    cobrancaTAC: data.cobrancaTAC || "",
    tranche: data.tranche || "",
    prazoTranche: data.prazoTranche || "",
    folhaPagamento: data.folhaPagamento || "",
    endividamentoBanco: data.endividamentoBanco || "",
    endividamentoFactoring: data.endividamentoFactoring || "",
    vendasCheque: data.vendasCheque || "",
    vendasDuplicata: data.vendasDuplicata || "",
    vendasOutras: data.vendasOutras || "",
    prazoMedioFaturamento: data.prazoMedioFaturamento || "",
    prazoMedioEntrega: data.prazoMedioEntrega || "",
    referenciasFornecedores: data.referenciasFornecedores || "",
  };
}

type AnyExtracted = CNPJData | QSAData | ContratoSocialData | FaturamentoData | SCRData | ProtestosData | ProcessosData | GrupoEconomicoData | CurvaABCData | DREData | BalancoData | IRSocioData | RelatorioVisitaData;

function countFilledFields(data: AnyExtracted): number {
  const obj = data as unknown as Record<string, unknown>;
  return Object.values(obj).filter(v =>
    typeof v === "string" ? v.length > 0 :
    Array.isArray(v) ? v.length > 0 :
    typeof v === "boolean" ? true : false
  ).length;
}

// ─────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // Validar Content-Type antes de tentar parsear FormData
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        { error: "Request deve ser multipart/form-data com o arquivo anexado.", success: false },
        { status: 400 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error("[extract] FormData parse failed:", formErr instanceof Error ? formErr.message : formErr);
      return NextResponse.json(
        { error: "Falha ao processar o upload. Verifique o arquivo e tente novamente.", success: false },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const docType = formData.get("type") as string | null;

    if (!file || !docType) {
      return NextResponse.json({ error: "Arquivo ou tipo não informado." }, { status: 400 });
    }

    if (GEMINI_API_KEYS.length === 0) {
      return NextResponse.json({ error: "Nenhuma GEMINI_API_KEY configurada." }, { status: 500 });
    }

    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo excede o limite de 20MB." }, { status: 413 });
    }

    const ext = getFileExt(file.name);
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      return NextResponse.json({ error: `Formato .${ext} não suportado.` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ──── Excel: processamento direto sem IA ────
    if (ext === "xlsx" && docType === "faturamento") {
      try {
        console.log(`[extract] Processing Excel: ${file.name}`);
        const faturamento = await extractExcel(buffer);
        const filled = countFilledFields(faturamento);
        return NextResponse.json({
          success: true,
          data: faturamento,
          meta: { rawTextLength: 0, filledFields: filled, isScanned: false, aiPowered: false },
        });
      } catch (err) {
        console.error("[extract] Excel processing failed:", err);
        // Se falhar, tentar via IA
      }
    }

    // ──── Selecionar prompt ────
    let prompt: string;
    switch (docType) {
      case "cnpj":       prompt = PROMPT_CNPJ; break;
      case "qsa":        prompt = PROMPT_QSA; break;
      case "contrato":   prompt = PROMPT_CONTRATO; break;
      case "faturamento": prompt = PROMPT_FATURAMENTO; break;
      case "scr":            prompt = PROMPT_SCR; break;
      case "protestos":      prompt = PROMPT_PROTESTOS; break;
      case "processos":      prompt = PROMPT_PROCESSOS; break;
      case "grupoEconomico": prompt = PROMPT_GRUPO_ECONOMICO; break;
      case "curva_abc":      prompt = PROMPT_CURVA_ABC; break;
      case "dre":            prompt = PROMPT_DRE; break;
      case "balanco":        prompt = PROMPT_BALANCO; break;
      case "ir_socio":       prompt = PROMPT_IR_SOCIOS; break;
      case "relatorio_visita": prompt = PROMPT_RELATORIO_VISITA; break;
      default:
        return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
    }

    // ──── Preparar conteúdo ────
    const isImage = ["jpg", "jpeg", "png"].includes(ext);
    let textContent = "";
    let imageContent: { mimeType: string; base64: string } | undefined;

    if (isImage) {
      imageContent = { mimeType, base64: buffer.toString("base64") };
    } else {
      // Sempre tenta extrair texto primeiro (muito mais barato em tokens)
      textContent = await extractText(buffer, ext);
      const isUsableText = textContent.trim().length >= 20 && hasReadableContent(textContent);

      if (!isUsableText && ext === "pdf") {
        // Só envia como binário se não conseguiu extrair texto
        console.log(`[extract] PDF text not usable, sending as binary...`);
        imageContent = { mimeType: "application/pdf", base64: buffer.toString("base64") };
        textContent = "";
      } else if (!isUsableText) {
        return NextResponse.json({
          error: "Não foi possível extrair texto do documento. Tente enviar em outro formato.",
        }, { status: 422 });
      }
    }

    if (textContent) {
      const maxChars: Record<string, number> = {
        cnpj: 6000, qsa: 10000, contrato: 25000, faturamento: 15000, scr: 25000,
        protestos: 15000, processos: 20000, grupoEconomico: 15000,
        curva_abc: 8000, dre: 20000, balanco: 20000, ir_socio: 6000, relatorio_visita: 10000,
      };
      textContent = textContent.substring(0, maxChars[docType] || 15000);
    }

    console.log(`[extract] ${file.name} | type=${docType} | ext=${ext} | textLen=${textContent.length} | hasImage=${!!imageContent}`);

    // ──── SSE stream — mantém conexão viva enquanto Gemini processa ────
    const enc = new TextEncoder();
    const _send = (ctrl: ReadableStreamDefaultController, ev: string, d: object) => {
      try { ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)); } catch { /* ignore if closed */ }
    };

    const _prompt = prompt;
    const _textContent = textContent;
    const _imageContent = imageContent;
    const _docType = docType;
    const _isImage = isImage;

    const stream = new ReadableStream({
      async start(controller) {
        const keepalive = setInterval(() => _send(controller, "keepalive", { ts: Date.now() }), 5000);

        try {
          let data: AnyExtracted;
          const inputMode = _imageContent ? "binary" : "text";
          _send(controller, "status", { message: "Processando documento...", inputMode, textLen: _textContent.length, docType: _docType });

          try {
            const aiResponse = await callAI(_prompt, _textContent, _imageContent);
            console.log(`[extract] AI response length: ${aiResponse.length}`);
            console.log(`[extract] AI raw response (first 1000 chars):`, aiResponse.substring(0, 1000));
            const parsed = parseJSON<Record<string, unknown>>(aiResponse);

            switch (_docType) {
              case "cnpj":           data = fillCNPJDefaults(parsed as Partial<CNPJData>); break;
              case "qsa":            data = fillQSADefaults(parsed as Partial<QSAData>); break;
              case "contrato":       data = fillContratoDefaults(parsed as Partial<ContratoSocialData>); break;
              case "faturamento":    data = fillFaturamentoDefaults(parsed as Partial<FaturamentoData>); break;
              case "scr": {
                data = fillSCRDefaults(parsed as Partial<SCRData>);
                const periodoAnterior = (parsed as Record<string, unknown>).periodoAnterior as Partial<SCRData> | undefined;
                if (periodoAnterior && periodoAnterior.periodoReferencia) {
                  (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior = fillSCRDefaults(periodoAnterior);
                  (data as SCRData & { _variacoes?: Record<string, string> })._variacoes =
                    ((parsed as Record<string, unknown>).variacoes as Record<string, string>) || {};
                }
                break;
              }
              case "protestos":        data = fillProtestosDefaults(parsed as Partial<ProtestosData>); break;
              case "processos":        data = fillProcessosDefaults(parsed as Partial<ProcessosData>); break;
              case "grupoEconomico":   data = fillGrupoEconomicoDefaults(parsed as Partial<GrupoEconomicoData>); break;
              case "curva_abc":        data = fillCurvaABCDefaults(parsed as Partial<CurvaABCData>); break;
              case "dre":              data = fillDREDefaults(parsed as Partial<DREData>); break;
              case "balanco":          data = fillBalancoDefaults(parsed as Partial<BalancoData>); break;
              case "ir_socio":         data = fillIRSocioDefaults(parsed as Partial<IRSocioData>); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults(parsed as Partial<RelatorioVisitaData>); break;
              default:                 data = fillCNPJDefaults(parsed as Partial<CNPJData>);
            }
          } catch (aiError) {
            const errMsg = aiError instanceof Error ? aiError.message : String(aiError);
            console.error(`[extract] AI failed:`, errMsg);
            console.error(`[extract] Context: inputMode=${inputMode} | docType=${_docType}`);
            console.error(`[extract] Input preview:`, inputMode === "text"
              ? _textContent.substring(0, 200)
              : `[binary ${_imageContent?.mimeType}, base64 len: ${_imageContent?.base64.length}]`
            );

            switch (_docType) {
              case "cnpj":           data = fillCNPJDefaults({}); break;
              case "qsa":            data = fillQSADefaults({}); break;
              case "contrato":       data = fillContratoDefaults({}); break;
              case "faturamento":    data = fillFaturamentoDefaults({}); break;
              case "scr":            data = fillSCRDefaults({}); break;
              case "protestos":      data = fillProtestosDefaults({}); break;
              case "processos":      data = fillProcessosDefaults({}); break;
              case "grupoEconomico": data = fillGrupoEconomicoDefaults({}); break;
              case "curva_abc":      data = fillCurvaABCDefaults({}); break;
              case "dre":            data = fillDREDefaults({}); break;
              case "balanco":        data = fillBalancoDefaults({}); break;
              case "ir_socio":       data = fillIRSocioDefaults({}); break;
              case "relatorio_visita": data = fillRelatorioVisitaDefaults({}); break;
              default:               data = fillCNPJDefaults({});
            }

            let errorType: "quota" | "parse" | "empty" | "unknown" = "unknown";
            if (errMsg.includes("429") || errMsg.includes("EXHAUSTED") || errMsg.includes("quota") || errMsg.includes("rate")) {
              errorType = "quota";
            } else if (errMsg.includes("JSON") || errMsg.includes("parse") || errMsg.includes("SyntaxError")) {
              errorType = "parse";
            } else if (errMsg.includes("empty") || errMsg.includes("length: 0") || errMsg.includes("Empty")) {
              errorType = "empty";
            }

            _send(controller, "result", {
              success: true, data,
              meta: { rawTextLength: _textContent.length, filledFields: 0, isScanned: _isImage, aiError: true, errorType, errorMessage: errMsg.substring(0, 200) },
            });
            return;
          }

          const filled = countFilledFields(data);
          const scrAnteriorExtra = (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
          const variacoesExtra = (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          if (scrAnteriorExtra) {
            delete (data as SCRData & { _scrAnterior?: SCRData })._scrAnterior;
            delete (data as SCRData & { _variacoes?: Record<string, string> })._variacoes;
          }

          _send(controller, "result", {
            success: true, data,
            ...(scrAnteriorExtra ? { scrAnterior: scrAnteriorExtra, variacoes: variacoesExtra } : {}),
            meta: { rawTextLength: _textContent.length, filledFields: filled, isScanned: _isImage, aiPowered: true },
          });
        } catch (err) {
          console.error("[extract] Stream error:", err instanceof Error ? err.message : err);
          _send(controller, "result", { success: false, error: "Erro interno ao processar o documento." });
        } finally {
          clearInterval(keepalive);
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("[extract] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno ao processar o documento." }, { status: 500 });
  }
}
