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

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-lite"];

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

  // FMM = soma / quantidade real de meses (não fixo em 12)
  const valoresFMM = mesesFMM.map(m => parseBRVal(m.valor));
  const media = mesesFMM.length > 0 ? valoresFMM.reduce((a, b) => a + b, 0) / mesesFMM.length : 0;

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

const PROMPT_CNPJ = `Você receberá um Cartão CNPJ emitido pela Receita Federal do Brasil (pode ser PDF, imagem ou texto extraído). Extraia os dados e retorne APENAS JSON válido, sem markdown, sem texto adicional.

Schema:
{"razaoSocial":"","nomeFantasia":"","cnpj":"","dataAbertura":"","situacaoCadastral":"","dataSituacaoCadastral":"","motivoSituacao":"","naturezaJuridica":"","cnaePrincipal":"","cnaeSecundarios":"","porte":"","capitalSocialCNPJ":"","endereco":"","telefone":"","email":"","tipoEmpresa":"","funcionarios":""}

Regras de extração:
- cnpj: formato XX.XXX.XXX/XXXX-XX obrigatório
- dataAbertura e dataSituacaoCadastral: formato DD/MM/YYYY
- situacaoCadastral: exatamente como consta ("ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NULA")
- motivoSituacao: apenas preencha se houver motivo explícito (ex: "Omissa no período", "Extinção por encerramento")
- naturezaJuridica: incluir código + descrição (ex: "206-2 - Sociedade Empresária Limitada")
- cnaePrincipal: incluir código + descrição (ex: "46.59-4-99 - Comércio atacadista de outros equipamentos")
- cnaeSecundarios: lista separada por " ; " — inclua código e descrição de cada um
- porte: "MICRO EMPRESA", "EMPRESA DE PEQUENO PORTE", "DEMAIS" ou "MEI"
- capitalSocialCNPJ: em reais com formato brasileiro (ex: "R$ 220.000,00")
- endereco: concatenar logradouro + número + complemento + bairro + município + UF + CEP em uma linha
- telefone: incluir DDD (ex: "(11) 3333-4444"); se houver mais de um, separar por " / "
- tipoEmpresa: "LTDA", "S/A", "MEI", "EIRELI", "SLU", "SS", "COOPERATIVA" ou conforme natureza jurídica
- funcionarios: número de funcionários se constar no documento, senão ""
- campos ausentes ou não encontrados: ""
- NÃO invente dados`;

const PROMPT_QSA = `Você receberá um Quadro de Sócios e Administradores (QSA) ou documento equivalente da Receita Federal. Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"capitalSocial":"","quadroSocietario":[{"nome":"","cpfCnpj":"","qualificacao":"","participacao":"","dataEntrada":""}]}

Regras:
- Liste TODOS os sócios, administradores e representantes listados
- CPF: formato XXX.XXX.XXX-XX | CNPJ (sócio PJ): formato XX.XXX.XXX/XXXX-XX
- qualificacao: código + descrição exatamente como consta (ex: "49 - Sócio-Administrador", "22 - Sócio", "10 - Diretor")
- participacao: percentual exatamente como consta (ex: "50,00%") — se não informado, ""
- dataEntrada: data de entrada na sociedade em DD/MM/YYYY — se não informada, ""
- capitalSocial: em reais com formatação brasileira (ex: "R$ 500.000,00")
- NÃO inclua testemunhas, advogados, contadores ou procuradores — apenas sócios e administradores
- Se o mesmo CPF/CNPJ aparecer mais de uma vez (ex: sócio + administrador), inclua apenas uma vez com a qualificação mais completa
- NÃO invente dados`;

const PROMPT_CONTRATO = `Você receberá um Contrato Social, Estatuto Social ou Ato Constitutivo de empresa (pode incluir alterações e consolidações). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"socios":[{"nome":"","cpf":"","participacao":"","qualificacao":"","cotas":""}],"capitalSocial":"","objetoSocial":"","dataConstituicao":"","temAlteracoes":false,"ultimaAlteracao":"","prazoDuracao":"","administracao":"","foro":"","sede":""}

Regras:
- socios: liste TODOS os sócios com participação no capital — CPF formato XXX.XXX.XXX-XX
- participacao: percentual (ex: "50%") ou valor em cotas (ex: "R$ 110.000,00")
- cotas: número de cotas se mencionado, senão ""
- qualificacao: "Sócio", "Sócio-Administrador", "Administrador" conforme o contrato
- NÃO inclua testemunhas, advogados, cônjuges (a menos que sejam sócios), notários
- capitalSocial: valor total em reais (ex: "R$ 220.000,00")
- objetoSocial: extraia as atividades da cláusula de objeto social e reescreva em Título Case (não MAIÚSCULAS), texto corrido, separando atividades por vírgula, sem ponto-e-vírgula — máximo 300 caracteres. Ex: "Comércio atacadista de produtos alimentícios, fabricação de alimentos congelados, transporte de cargas"
- dataConstituicao: data de constituição/registro em DD/MM/YYYY
- temAlteracoes: true se o documento for uma Alteração Contratual ou Consolidação (não o contrato original)
- ultimaAlteracao: data da última alteração em DD/MM/YYYY (se temAlteracoes=true)
- prazoDuracao: "indeterminado" ou prazo específico conforme contrato
- administracao: quem administra a empresa conforme cláusula de administração
- foro: cidade do foro de eleição conforme última cláusula
- sede: endereço completo da sede social
- campos ausentes: "" ou false
- NÃO invente dados`;

const PROMPT_FATURAMENTO = `Você receberá um relatório de faturamento mensal (pode ser planilha, relatório de NF-e, extrato bancário, declaração ou tabela). Extraia TODOS os valores mensais e retorne APENAS JSON válido, sem markdown.

Schema:
{"meses":[{"mes":"01/2024","valor":"1.234.567,89"}],"somatoriaTotal":"","totalMesesExtraidos":0,"faturamentoZerado":false,"dadosAtualizados":true,"ultimoMesComDados":"","anoMaisAntigo":"","anoMaisRecente":""}

Regras:
- Extraia TODOS os meses presentes em TODO o documento — tabelas, rodapés, cabeçalhos, múltiplas páginas
- mes: formato MM/YYYY obrigatório (ex: "01/2024", "12/2023")
- valor: formato brasileiro com ponto separador de milhar e vírgula decimal (ex: "1.234.567,89") — sem "R$"
- Se um mês aparecer duplicado (ex: duas linhas para JAN/2024), use o MAIOR valor
- NÃO inclua meses futuros sem dados reais
- NÃO inclua meses com valor zero a menos que o zero seja o faturamento real daquele mês
- Se houver coluna de "Total" ou "Acumulado", use-a como somatoriaTotal
- somatoriaTotal: soma de todos os meses extraídos, formato brasileiro
- totalMesesExtraidos: contagem numérica dos meses no array meses
- faturamentoZerado: true se TODOS os meses tiverem valor zero ou ausente
- dadosAtualizados: false se o período mais recente for anterior a 6 meses atrás
- ultimoMesComDados: último mês com valor positivo (formato MM/YYYY)
- anoMaisAntigo / anoMaisRecente: apenas o ano (ex: "2022", "2024")
- NÃO invente dados`;

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


const PROMPT_PROTESTOS = `Você receberá uma certidão de protestos (SERASA, cartório, CRC ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"vigentesQtd":"","vigentesValor":"","regularizadosQtd":"","regularizadosValor":"","detalhes":[{"data":"","credor":"","valor":"","numero":"","cartorio":"","cidade":"","regularizado":false}]}

Regras:
- vigentesQtd: número total de protestos ATIVOS (não regularizados) — string (ex: "3")
- vigentesValor: valor total dos protestos ativos em reais formato brasileiro (ex: "15.432,00")
- regularizadosQtd: número de protestos regularizados/pagos — string
- regularizadosValor: valor total dos regularizados em reais formato brasileiro
- detalhes: liste TODOS os protestos individualmente, tanto vigentes quanto regularizados
  - data: data do protesto em DD/MM/AAAA
  - credor: nome do credor/apresentante como consta no documento
  - valor: valor em reais formato brasileiro (ex: "2.340,00") — sem "R$"
  - numero: número do título/protocolo se disponível, senão ""
  - cartorio: nome ou número do cartório se disponível, senão ""
  - cidade: cidade do cartório se disponível, senão ""
  - regularizado: true se constar como "REGULARIZADO", "PAGO", "CANCELADO" ou similar
- Se o documento indicar "SEM RESTRIÇÕES" ou "NADA CONSTA": vigentesQtd="0", vigentesValor="0,00", detalhes=[]
- NÃO invente dados`;

const PROMPT_PROCESSOS = `Você receberá um relatório de processos judiciais (Credit Bureau, SERASA, Jusbrasil, relatório próprio ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"passivosTotal":"","ativosTotal":"","valorTotalEstimado":"","temRJ":false,"temRecuperacaoExtrajudicial":false,"distribuicao":[{"tipo":"","qtd":"","pct":""}],"bancarios":[{"banco":"","assunto":"","status":"","data":"","valor":"","numero":"","tribunal":""}],"fiscais":[{"contraparte":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"fornecedores":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"outros":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}]}

Regras:
- passivosTotal: total de processos onde a empresa é RÉ/EXECUTADA/REQUERIDA — string (ex: "12")
- ativosTotal: total de processos onde a empresa é AUTORA/EXEQUENTE/REQUERENTE — string
- valorTotalEstimado: valor total estimado de TODOS os processos passivos em reais (ex: "R$ 450.000,00")
- temRJ: true se houver qualquer menção a "Recuperação Judicial", "RJ" como processo
- temRecuperacaoExtrajudicial: true se houver "Recuperação Extrajudicial"
- distribuicao: agrupe por tipo — tipos válidos: "TRABALHISTA", "BANCÁRIO", "FISCAL", "FORNECEDOR", "CÍVEL", "OUTROS"
  - qtd: quantidade de processos daquele tipo (string)
  - pct: percentual aproximado (ex: "45%")
- bancarios: processos com bancos/financeiras como contraparte — NÃO liste trabalhistas aqui
- fiscais: execuções fiscais, dívida ativa, PGFN, Receita Federal
- fornecedores: ações de fornecedores ou clientes
- outros: tudo que não se encaixa nas categorias acima (cível, indenizações, etc.)
- Para processos trabalhistas: NÃO liste individualmente — apenas contabilize em distribuicao
- status válidos: "EM ANDAMENTO", "ARQUIVADO", "JULGADO", "EM RECURSO", "SUSPENSO", "DISTRIBUÍDO"
- numero: número CNJ do processo (ex: "0000000-00.0000.0.00.0000") se disponível
- tribunal: sigla (ex: "TJSP", "TRT2", "TRF3") se disponível
- Se não há processos: passivosTotal="0", ativosTotal="0", distribuicao=[], demais arrays vazios
- NÃO invente dados`;

const PROMPT_GRUPO_ECONOMICO = `Você receberá um relatório de grupo econômico (Credit Bureau, SERASA, relatório próprio ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"empresas":[{"razaoSocial":"","cnpj":"","relacao":"","participacaoSocio":"","scrTotal":"","protestos":"","processos":"","situacaoCadastral":""}]}

Regras:
- Liste TODAS as empresas vinculadas ao grupo econômico, exceto a empresa principal que está sendo analisada
- razaoSocial: nome completo conforme consta
- cnpj: formato XX.XXX.XXX/XXXX-XX
- relacao: tipo de vínculo — use exatamente: "via Sócio", "Controlada", "Coligada", "Controladora", "Participação" ou o que constar no documento
- participacaoSocio: percentual de participação do sócio comum nessa empresa (ex: "50%") — se disponível
- scrTotal: exposição SCR total dessa empresa se constar (ex: "R$ 1.200.000,00"), senão ""
- protestos: número de protestos dessa empresa se constar (ex: "2"), senão ""
- processos: número de processos se constar (ex: "5"), senão ""
- situacaoCadastral: "ATIVA", "BAIXADA", "INAPTA" se disponível, senão ""
- Se o documento indicar que não há grupo econômico ou não foram encontradas empresas vinculadas: retorne {"empresas":[]}
- NÃO invente dados`;

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

const PROMPT_DRE = `Você receberá uma Demonstração de Resultado do Exercício (DRE). Pode estar em formato SPED ECD/ECF, DRE simplificada, relatório gerencial, planilha Excel ou PDF contábil. Retorne APENAS JSON válido, sem markdown, sem texto adicional.

Schema EXATO (respeite todos os campos):
{"anos":[{"ano":"2024","receitaBruta":"0,00","deducoes":"0,00","receitaLiquida":"0,00","custoProdutosServicos":"0,00","lucroBruto":"0,00","margemBruta":"0,00","despesasOperacionais":"0,00","ebitda":"0,00","margemEbitda":"0,00","depreciacaoAmortizacao":"0,00","resultadoFinanceiro":"0,00","lucroAntesIR":"0,00","impostoRenda":"0,00","lucroLiquido":"0,00","margemLiquida":"0,00"}],"crescimentoReceita":"0,00","tendenciaLucro":"estavel","periodoMaisRecente":"","observacoes":""}

REGRAS OBRIGATÓRIAS DE FORMATO:
1. TODOS os valores monetários DEVEM estar em formato brasileiro: ponto como separador de milhar, vírgula para decimais
   - CORRETO: "1.234.567,89", "456.789,00", "-12.345,67"
   - ERRADO: "1234567.89", "1,234,567.89", "R$ 1.234,00"
   - Sem prefixo "R$", sem espaços extras
2. Valores negativos: prefixar com sinal de menos: "-45.000,00" (custos, deduções, despesas e prejuízos)
3. Margens: número percentual SEM símbolo "%", com vírgula decimal: "12,5" ou "-3,2"
4. Se um campo não existir no documento, use "0,00"
5. NÃO arredonde — mantenha os centavos como aparecem no documento

REGRAS DE EXTRAÇÃO:
- Extraia dados ANUAIS consolidados. Se houver vários anos, extraia TODOS em ordem cronológica crescente (ex: 2022, 2023, 2024)
- Se o documento contiver dados MENSAIS ou TRIMESTRAIS (sem consolidação anual), SOME todos os meses/trimestres de cada ano para obter o total anual
- Exemplo: se Jan=100, Fev=150, ..., Dez=200, então receitaBruta do ano = soma de todos os 12 meses
- Se houver coluna "Acumulado" ou "Total do Período", prefira esse valor em vez de somar manualmente

Mapeamento de contas (SPED ECD/ECF e DRE padrão):
- receitaBruta → "RECEITA BRUTA" / "RECEITA OPERACIONAL BRUTA" / "FATURAMENTO BRUTO" / conta 3.01 / linha que antecede deduções
- deducoes → "DEDUÇÕES DA RECEITA" / "(-) Impostos sobre Vendas" / "(-) Devoluções e Abatimentos" / conta 3.02 — SEMPRE como valor negativo
- receitaLiquida → "RECEITA LÍQUIDA" / "RECEITA OPERACIONAL LÍQUIDA" / conta 3.03 — se não constar, calcule: receitaBruta + deducoes (deducoes é negativo)
- custoProdutosServicos → "CPV" / "CMV" / "CUSTO DOS PRODUTOS VENDIDOS" / "CUSTO DOS SERVIÇOS PRESTADOS" / conta 3.04 — SEMPRE como valor negativo
- lucroBruto → "LUCRO BRUTO" / "RESULTADO BRUTO" / conta 3.05 — se não constar, calcule: receitaLiquida + custoProdutosServicos
- despesasOperacionais → "DESPESAS OPERACIONAIS" / soma de "Despesas com Vendas" + "Despesas Administrativas" + "Despesas Gerais" — SEMPRE como valor negativo
- ebitda → "EBITDA" / "LAJIDA" — se não constar, calcule: lucroBruto + despesasOperacionais + depreciacaoAmortizacao (despesas são negativas, depreciação é negativa, então: lucroBruto - |despesas| - |depreciação| efetivamente)
  Alternativa simplificada quando depreciação = 0: ebitda = lucroBruto + despesasOperacionais
- depreciacaoAmortizacao → "DEPRECIAÇÃO E AMORTIZAÇÃO" / "D&A" / conta 3.06 — como valor negativo
- resultadoFinanceiro → "RESULTADO FINANCEIRO" / "RECEITAS FINANCEIRAS" menos "DESPESAS FINANCEIRAS" — negativo se despesa líquida
- lucroAntesIR → "LAIR" / "LUCRO ANTES DO IRPJ E CSLL" / "RESULTADO ANTES DOS TRIBUTOS"
- impostoRenda → "IRPJ" + "CSLL" / "PROVISÃO PARA IR E CSLL" — como valor negativo
- lucroLiquido → "LUCRO LÍQUIDO" / "PREJUÍZO DO EXERCÍCIO" / "RESULTADO LÍQUIDO" / conta 3.99

CÁLCULOS DE MARGEM (calcule SEMPRE, mesmo se o documento informar):
- margemBruta = (lucroBruto / receitaLiquida) * 100 → ex: se lucroBruto = "500.000,00" e receitaLiquida = "1.000.000,00", margemBruta = "50,0"
- margemEbitda = (ebitda / receitaLiquida) * 100
- margemLiquida = (lucroLiquido / receitaLiquida) * 100
- Se receitaLiquida = 0, todas as margens = "0,00"
- Margens negativas mantêm sinal: "-8,5"

Campos adicionais:
- crescimentoReceita: variação % da receitaBruta entre primeiro e último ano — fórmula: ((último - primeiro) / |primeiro|) * 100 — ex: "15,3" ou "-8,2"
- tendenciaLucro: "crescimento" se lucroLiquido aumentou nos últimos 2 anos, "queda" se diminuiu, "estavel" se variação absoluta < 5%
- periodoMaisRecente: ano mais recente encontrado (ex: "2024")
- observacoes: informações relevantes não capturadas (regime tributário, notas do contador, etc.)

IMPORTANTE:
- NÃO invente dados — use APENAS valores presentes no documento
- Se o documento estiver ilegível ou vazio em algum campo, use "0,00"
- Confira a coerência: receitaLiquida deve ser aproximadamente receitaBruta - |deducoes|
- lucroBruto deve ser aproximadamente receitaLiquida - |custoProdutosServicos|`;

const PROMPT_BALANCO = `Você receberá um Balanço Patrimonial. Pode estar em formato SPED ECD, balanço simplificado, relatório gerencial ou planilha. Retorne APENAS JSON válido, sem markdown.

Schema:
{"anos":[{"ano":"2024","ativoTotal":"0,00","ativoCirculante":"0,00","caixaEquivalentes":"0,00","contasAReceber":"0,00","estoques":"0,00","outrosAtivosCirculantes":"0,00","ativoNaoCirculante":"0,00","imobilizado":"0,00","intangivel":"0,00","outrosAtivosNaoCirculantes":"0,00","passivoTotal":"0,00","passivoCirculante":"0,00","fornecedores":"0,00","emprestimosCP":"0,00","outrosPassivosCirculantes":"0,00","passivoNaoCirculante":"0,00","emprestimosLP":"0,00","outrosPassivosNaoCirculantes":"0,00","patrimonioLiquido":"0,00","capitalSocial":"0,00","reservas":"0,00","lucrosAcumulados":"0,00","liquidezCorrente":"0,00","liquidezGeral":"0,00","endividamentoTotal":"0,00","capitalDeGiroLiquido":"0,00"}],"periodoMaisRecente":"","tendenciaPatrimonio":"estavel","observacoes":""}

Regras gerais:
- Extraia dados ANUAIS — se houver vários anos, todos em ordem cronológica crescente
- SPED ECD: use os valores da coluna "Saldo Final" (não "Saldo Inicial" ou "Movimentação")
- Valores: formato brasileiro (ex: "1.234.567,89"); patrimônio líquido negativo mantém sinal de menos
- Se um campo não existir no documento, use "0,00"

Mapeamento de contas:
- ativoTotal → total do ativo (deve bater com passivoTotal + patrimonioLiquido)
- ativoCirculante → grupo 1.01 / "Ativo Circulante"
- caixaEquivalentes → "Caixa e Equivalentes de Caixa" / conta 1.01.01
- contasAReceber → "Contas a Receber" / "Clientes" / "Duplicatas a Receber" / conta 1.01.03
- estoques → "Estoques" / conta 1.01.04
- outrosAtivosCirculantes → demais ativos circulantes não listados acima
- ativoNaoCirculante → grupo 1.02
- imobilizado → "Imobilizado" / conta 1.02.03
- intangivel → "Intangível" / conta 1.02.04
- passivoCirculante → grupo 2.01
- fornecedores → "Fornecedores" / conta 2.01.01
- emprestimosCP → "Empréstimos e Financiamentos CP" / conta 2.01.03
- passivoNaoCirculante → grupo 2.02
- emprestimosLP → "Empréstimos e Financiamentos LP" / conta 2.02.01
- patrimonioLiquido → grupo 2.03 / "Patrimônio Líquido"
- capitalSocial → conta 2.03.01
- reservas → soma de reservas de capital + reservas de lucros
- lucrosAcumulados → "Lucros/Prejuízos Acumulados" — negativo se prejuízo

Indicadores (calcule se não constarem):
- liquidezCorrente = ativoCirculante ÷ passivoCirculante (formato "1,85")
- liquidezGeral = (ativoCirculante + realizávelLP) ÷ (passivoCirculante + passivoNaoCirculante)
- endividamentoTotal = (passivoCirculante + passivoNaoCirculante) ÷ ativoTotal × 100 (formato "45,2")
- capitalDeGiroLiquido = ativoCirculante - passivoCirculante (pode ser negativo)
- tendenciaPatrimonio: "crescimento" / "queda" / "estavel" com base no patrimonioLiquido
- NÃO invente dados`;

const PROMPT_IR_SOCIOS = `Você receberá um documento de Imposto de Renda de sócio: pode ser apenas o Recibo de Entrega (DIRPF), uma Declaração Completa ou extrato da Receita Federal. Retorne APENAS JSON válido, sem markdown.

Schema:
{"nomeSocio":"","cpf":"","anoBase":"","tipoDocumento":"recibo","numeroRecibo":"","dataEntrega":"","situacaoMalhas":false,"debitosEmAberto":false,"descricaoDebitos":"","rendimentosTributaveis":"0,00","rendimentosIsentos":"0,00","rendimentoTotal":"0,00","impostoDefinido":"0,00","valorQuota":"0,00","bensImoveis":"0,00","bensVeiculos":"0,00","aplicacoesFinanceiras":"0,00","outrosBens":"0,00","totalBensDireitos":"0,00","dividasOnus":"0,00","patrimonioLiquido":"0,00","impostoPago":"0,00","impostoRestituir":"0,00","temSociedades":false,"sociedades":[],"coerenciaComEmpresa":true,"observacoes":""}

Regras críticas:
- nomeSocio e anoBase são OBRIGATÓRIOS — não retorne JSON sem eles
- anoBase: use o ANO-CALENDÁRIO, NÃO o ano do exercício
  Ex: "EXERCÍCIO 2025 — ANO-CALENDÁRIO 2024" → anoBase="2024"
  Ex: "DECLARAÇÃO 2024 (ano-base 2023)" → anoBase="2023"
- cpf: formato XXX.XXX.XXX-XX
- tipoDocumento: "recibo" se for apenas o recibo de entrega; "declaracao" se for declaração completa; "extrato" se for extrato da Receita
- numeroRecibo: número do recibo de transmissão (ex: "1234567890123456")
- dataEntrega: data de envio/transmissão em DD/MM/AAAA

Situação fiscal:
- situacaoMalhas: true se mencionar "retida em malha", "pendências", "intimação" ou similar
- debitosEmAberto: true se mencionar débitos, parcelamentos ativos ou pendências financeiras
- descricaoDebitos: descrição resumida dos débitos se debitosEmAberto=true, senão ""

Valores (apenas para declaração completa — recibo simples: deixe "0,00"):
- rendimentosTributaveis: total de rendimentos tributáveis (salário, pró-labore, aluguéis, etc.)
- rendimentosIsentos: rendimentos isentos e não tributáveis (FGTS, lucros e dividendos, etc.)
- rendimentoTotal: soma dos dois anteriores
- impostoDefinido: imposto apurado/devido total (buscar "Imposto Devido", "Total do Imposto Apurado")
- valorQuota: valor de cada parcela se houver parcelamento, senão "0,00"
- impostoPago: total já recolhido (IRRF + carnê-leão + quotas pagas)
- impostoRestituir: valor a restituir se positivo, senão "0,00"

Patrimônio (declaração completa):
- bensImoveis, bensVeiculos, aplicacoesFinanceiras, outrosBens: valores de bens e direitos por categoria
- totalBensDireitos: total de bens e direitos
- dividasOnus: total de dívidas e ônus reais
- patrimonioLiquido: totalBensDireitos - dividasOnus

Sociedades:
- temSociedades: true se o sócio declarou participação em sociedades
- sociedades: lista de empresas onde o sócio tem participação [{"razaoSocial":"","cnpj":"","participacao":""}]
- coerenciaComEmpresa: true se as sociedades declaradas incluem a empresa que está sendo analisada

- observacoes: informações relevantes não capturadas acima
- NÃO invente dados`;

const PROMPT_RELATORIO_VISITA = `Extraia dados do Relatório de Visita (texto livre, formulário ou template). Retorne APENAS JSON, sem markdown:
{"dataVisita":"","responsavelVisita":"","localVisita":"","duracaoVisita":"","estruturaFisicaConfirmada":true,"funcionariosObservados":0,"estoqueVisivel":false,"estimativaEstoque":"","operacaoCompativelFaturamento":true,"maquinasEquipamentos":false,"descricaoEstrutura":"","pontosPositivos":[],"pontosAtencao":[],"recomendacaoVisitante":"aprovado","nivelConfiancaVisita":"alto","presencaSocios":false,"sociosPresentes":[],"documentosVerificados":[],"observacoesLivres":"","pleito":"","modalidade":"","taxaConvencional":"","taxaComissaria":"","limiteTotal":"","limiteConvencional":"","limiteComissaria":"","limitePorSacado":"","ticketMedio":"","valorCobrancaBoleto":"","prazoRecompraCedente":"","prazoEnvioCartorio":"","prazoMaximoOp":"","cobrancaTAC":"","tranche":"","prazoTranche":"","folhaPagamento":"","endividamentoBanco":"","endividamentoFactoring":"","vendasCheque":"","vendasDuplicata":"","vendasOutras":"","prazoMedioFaturamento":"","prazoMedioEntrega":"","referenciaComercial":""}
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
- referenciaComercial: lista de referências comerciais/fornecedores informadas na visita (texto separado por vírgula ou ";" — ex: "Banco do Brasil, Fornecedor X, Cliente Y")`;

// ─────────────────────────────────────────
// PROVEDOR 1: Gemini (primário — melhor qualidade)
// ─────────────────────────────────────────
async function callGemini(prompt: string, content: string | { mimeType: string; base64: string }, maxOutputTokens = 2048): Promise<string> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (typeof content === "string") {
    parts.push({ text: prompt + "\n\n--- DOCUMENTO ---\n\n" + content });
  } else {
    parts.push({ inlineData: { mimeType: content.mimeType, data: content.base64 } });
    parts.push({ text: prompt });
  }

  const startIdx = Math.floor(Math.random() * GEMINI_API_KEYS.length);
  const rotatedKeys = [...GEMINI_API_KEYS.slice(startIdx), ...GEMINI_API_KEYS.slice(0, startIdx)];
  for (const apiKey of rotatedKeys) {
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
                maxOutputTokens,
                responseMimeType: "application/json",
                ...(model.includes("2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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
          // gemini-2.5-flash pode retornar "thinking" parts - pegar a última text part (não thought)
          const parts2 = result?.candidates?.[0]?.content?.parts || [];
          const textPart = [...parts2].reverse().find((p: { text?: string; thought?: boolean }) => p.text && !p.thought);
          const text = textPart?.text || parts2?.[parts2.length - 1]?.text || parts2?.[0]?.text;
          if (!text) {
            console.error(`[Gemini] Empty response, parts:`, JSON.stringify(parts2).substring(0, 200));
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
  maxOutputTokens = 2048,
): Promise<string> {
  const content: string | { mimeType: string; base64: string } = imageContent ?? textContent;

  // Timeout global de 45s — evita que a função fique pendurada
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT_55s")), 55000)
  );

  const aiCall = async (): Promise<string> => {
    try {
      return await callGemini(prompt, content, maxOutputTokens);
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
  const fmm12m = meses12.length > 0 ? soma12 / meses12.length : 0;

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
    tipoDocumento: sanitizeEnum(data.tipoDocumento, ["recibo", "declaracao", "extrato"] as const, "recibo"),
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
    referenciasFornecedores: data.referenciasFornecedores || (data as Record<string, unknown>).referenciaComercial as string || "",
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
        cnpj: 4000, qsa: 6000, contrato: 12000, faturamento: 10000, scr: 15000,
        protestos: 8000, processos: 12000, grupoEconomico: 8000,
        curva_abc: 6000, dre: 12000, balanco: 12000, ir_socio: 5000, relatorio_visita: 8000,
      };
      textContent = textContent.substring(0, maxChars[docType] || 10000);
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
    const maxOutputTokensMap: Record<string, number> = {
      cnpj: 4096, qsa: 4096, contrato: 4096, faturamento: 8192, scr: 8192,
      protestos: 8192, processos: 8192, grupoEconomico: 4096,
      curva_abc: 8192, dre: 8192, balanco: 8192, ir_socio: 4096, relatorio_visita: 4096,
    };
    const _maxOutputTokens = maxOutputTokensMap[docType] ?? 2048;

    const stream = new ReadableStream({
      async start(controller) {
        const keepalive = setInterval(() => _send(controller, "keepalive", { ts: Date.now() }), 5000);

        try {
          let data: AnyExtracted;
          const inputMode = _imageContent ? "binary" : "text";
          _send(controller, "status", { message: "Processando documento...", inputMode, textLen: _textContent.length, docType: _docType });

          try {
            const aiResponse = await callAI(_prompt, _textContent, _imageContent, _maxOutputTokens);
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
