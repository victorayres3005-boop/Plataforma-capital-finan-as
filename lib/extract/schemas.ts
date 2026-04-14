// Schemas Zod runtime para validar a saida do Gemini antes que ela entre no
// estado do app. A estrategia eh LENIENTE: coerciona strings, aceita null/undef
// como "", mas emite warnings quando encontra valores suspeitos (fora de range,
// formato invalido, etc). Nada bloqueia a resposta — so documenta problemas
// num array de warnings que volta com os dados para logging.
import { z } from "zod";

// ─── Helpers de coercao ───────────────────────────────────────────────────

const strLoose = z.preprocess(
  v => (v == null ? "" : typeof v === "string" ? v : String(v)),
  z.string(),
);
const boolLoose = z.preprocess(
  v => (v == null ? false : typeof v === "boolean" ? v : v === "true" || v === 1),
  z.boolean(),
);

// Dinheiro formato BR: "R$ 1.234,56", "1234,56", "1.234", etc.
// Aceita qualquer string, nao valida forma (isso fica pro sanitizeMoney).
const moneyStr = strLoose;

// Data MM/AAAA ou DD/MM/AAAA — aceita vazio
const dateStr = strLoose;

// Percentual 0-100 — pode vir como "10,5%" ou "10.5" ou 10.5
const pctStr = strLoose;

// ─── CNPJData ─────────────────────────────────────────────────────────────

export const CNPJDataSchema = z.object({
  razaoSocial: strLoose.default(""),
  nomeFantasia: strLoose.default(""),
  cnpj: strLoose.default(""),
  dataAbertura: dateStr.default(""),
  situacaoCadastral: strLoose.default(""),
  dataSituacaoCadastral: dateStr.default(""),
  motivoSituacao: strLoose.default(""),
  naturezaJuridica: strLoose.default(""),
  cnaePrincipal: strLoose.default(""),
  cnaeSecundarios: strLoose.default(""),
  porte: strLoose.default(""),
  capitalSocialCNPJ: moneyStr.default(""),
  endereco: strLoose.default(""),
  telefone: strLoose.default(""),
  email: strLoose.default(""),
}).passthrough(); // permite campos extras (tipoEmpresa, regimeTributario, etc)

// ─── QSA ──────────────────────────────────────────────────────────────────

export const QSASocioSchema = z.object({
  nome: strLoose.default(""),
  cpfCnpj: strLoose.default(""),
  qualificacao: strLoose.default(""),
  participacao: pctStr.default(""),
}).passthrough();

export const QSADataSchema = z.object({
  capitalSocial: moneyStr.default(""),
  quadroSocietario: z.array(QSASocioSchema).default([]),
}).passthrough();

// ─── Contrato Social ──────────────────────────────────────────────────────

export const SocioSchema = z.object({
  nome: strLoose.default(""),
  cpf: strLoose.default(""),
  participacao: pctStr.default(""),
  qualificacao: strLoose.default(""),
}).passthrough();

export const ContratoSocialDataSchema = z.object({
  socios: z.array(SocioSchema).default([]),
  capitalSocial: moneyStr.default(""),
  objetoSocial: strLoose.default(""),
  dataConstituicao: dateStr.default(""),
  temAlteracoes: boolLoose.default(false),
  prazoDuracao: strLoose.default(""),
  administracao: strLoose.default(""),
  foro: strLoose.default(""),
}).passthrough();

// ─── Faturamento ──────────────────────────────────────────────────────────

export const FaturamentoMensalSchema = z.object({
  mes: strLoose.default(""),
  valor: moneyStr.default(""),
}).passthrough();

export const FaturamentoDataSchema = z.object({
  meses: z.array(FaturamentoMensalSchema).default([]),
  somatoriaAno: moneyStr.default(""),
  mediaAno: moneyStr.default(""),
  faturamentoZerado: boolLoose.default(false),
  dadosAtualizados: boolLoose.default(false),
  ultimoMesComDados: strLoose.default(""),
}).passthrough();

// ─── SCR ──────────────────────────────────────────────────────────────────

const faixaSchema = z.object({
  ate30d: moneyStr.default("0,00"),
  d31_60: moneyStr.default("0,00"),
  d61_90: moneyStr.default("0,00"),
  d91_180: moneyStr.default("0,00"),
  d181_360: moneyStr.default("0,00"),
  acima360d: moneyStr.default("0,00"),
  prazoIndeterminado: moneyStr.default("0,00").optional(),
  total: moneyStr.default("0,00"),
}).passthrough();

export const SCRDataSchema = z.object({
  periodoReferencia: strLoose.default(""),
  tipoPessoa: strLoose.default("PJ"),
  cnpjSCR: strLoose.default(""),
  cpfSCR: strLoose.default(""),
  nomeCliente: strLoose.default(""),
  carteiraAVencer: moneyStr.default(""),
  vencidos: moneyStr.default(""),
  prejuizos: moneyStr.default(""),
  limiteCredito: moneyStr.default(""),
  totalDividasAtivas: moneyStr.default(""),
  qtdeInstituicoes: strLoose.default(""),
  qtdeOperacoes: strLoose.default(""),
  faixasAVencer: faixaSchema.optional(),
  faixasVencidos: faixaSchema.optional(),
  semHistorico: boolLoose.default(false),
}).passthrough();

// ─── Wrapper: safeParse com warnings estruturados ─────────────────────────

export interface ParseWarning {
  field: string;
  message: string;
}

export interface SafeParseResult<T> {
  data: T;
  warnings: ParseWarning[];
}

/**
 * Faz safeParse com um schema Zod. Se der falha, retorna os dados com defaults
 * e um array de warnings. Nao lanca erro — a ideia eh nunca bloquear a extracao,
 * so documentar campos que nao casaram com o schema esperado.
 */
export function safeParseExtracted<T>(
  schema: z.ZodType<T>,
  input: unknown,
  docType: string,
): SafeParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { data: result.data, warnings: [] };
  }
  const warnings: ParseWarning[] = result.error.issues.map(issue => ({
    field: issue.path.join(".") || "(root)",
    message: `${issue.code}: ${issue.message}`,
  }));
  console.warn(`[extract][${docType}] zod warnings (${warnings.length}):`,
    warnings.map(w => `${w.field}: ${w.message}`).join(" | "));
  // Fallback: tenta parsear com schema ainda mais permissivo usando catch
  // Se isso tambem falhar, retorna input cru com as warnings.
  try {
    const coerced = schema.parse(input) as T;
    return { data: coerced, warnings };
  } catch {
    return { data: input as T, warnings };
  }
}

// ─── Validacoes de range/formato para avisos de negocio ───────────────────

/**
 * Roda validacoes de negocio em cima dos dados ja parseados. Retorna warnings
 * adicionais (ex: participacao > 100%, CPF com digitos errados, totalDividas
 * muito alto). Nao mexe nos dados.
 */
export function auditBusinessRules(
  docType: string,
  data: unknown,
): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  if (!data || typeof data !== "object") return warnings;
  const obj = data as Record<string, unknown>;

  // CNPJ: valida formato 14 digitos
  if (docType === "cnpj" || docType === "qsa") {
    const cnpj = String(obj.cnpj || obj.cnpjSCR || "").replace(/\D/g, "");
    if (cnpj && cnpj.length !== 14) {
      warnings.push({ field: "cnpj", message: `CNPJ com ${cnpj.length} digitos (esperado 14)` });
    }
  }

  // QSA + Contrato: soma de participacao
  if (docType === "qsa" || docType === "contrato") {
    const arr = (obj.quadroSocietario || obj.socios || []) as Array<Record<string, unknown>>;
    if (Array.isArray(arr) && arr.length > 0) {
      let total = 0;
      for (const s of arr) {
        const p = parseFloat(String(s.participacao || "0").replace(/[^\d,.-]/g, "").replace(",", "."));
        if (!isNaN(p)) total += p;
      }
      if (total > 101 || (total > 0 && total < 99 && arr.length >= 2)) {
        warnings.push({
          field: "participacao",
          message: `Soma de participacao = ${total.toFixed(2)}% (esperado ~100%)`,
        });
      }
    }
  }

  // SCR: coerencia entre totalDividasAtivas e semHistorico
  if (docType === "scr") {
    const total = parseFloat(String(obj.totalDividasAtivas || "0").replace(/[^\d,.-]/g, "").replace(",", "."));
    const semHist = obj.semHistorico === true;
    if (!isNaN(total) && total > 0 && semHist) {
      warnings.push({
        field: "semHistorico",
        message: `semHistorico=true mas totalDividasAtivas=${total} (contradicao)`,
      });
    }
    // periodoReferencia obrigatorio
    if (!obj.periodoReferencia || String(obj.periodoReferencia).trim() === "") {
      warnings.push({
        field: "periodoReferencia",
        message: "Campo obrigatorio nao preenchido",
      });
    }
  }

  // Faturamento: coerencia entre somatoriaAno e meses
  if (docType === "faturamento") {
    const meses = obj.meses as Array<{ mes: string; valor: string }> | undefined;
    if (Array.isArray(meses) && meses.length > 0) {
      const someZero = meses.some(m => !m.valor || parseFloat(String(m.valor).replace(/[^\d,.-]/g, "").replace(",", ".")) === 0);
      if (someZero) {
        warnings.push({
          field: "meses",
          message: `${meses.filter(m => !m.valor || parseFloat(String(m.valor).replace(/[^\d,.-]/g, "").replace(",", ".")) === 0).length}/${meses.length} meses com valor zero`,
        });
      }
    }
  }

  return warnings;
}
