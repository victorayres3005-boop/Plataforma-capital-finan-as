// Re-export de todos os prompts de extração usados pelo endpoint /api/extract.
// Cada prompt vive em um arquivo isolado para facilitar versionamento e code review
// por tipo de documento.
export { PROMPT_CNPJ } from "./cnpj";
export { PROMPT_QSA } from "./qsa";
export { PROMPT_CONTRATO } from "./contrato";
export { PROMPT_FATURAMENTO } from "./faturamento";
export { PROMPT_SCR } from "./scr";
export { PROMPT_PROTESTOS } from "./protestos";
export { PROMPT_PROCESSOS } from "./processos";
export { PROMPT_GRUPO_ECONOMICO } from "./grupo-economico";
export { PROMPT_CURVA_ABC } from "./curva-abc";
export { PROMPT_DRE } from "./dre";
export { PROMPT_BALANCO } from "./balanco";
export { PROMPT_IR_SOCIOS } from "./ir-socios";
export { PROMPT_RELATORIO_VISITA } from "./relatorio-visita";
