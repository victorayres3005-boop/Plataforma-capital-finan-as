// Sobrenomes brasileiros ultra-frequentes — suprimidos do match "sobrenome+UF".
//
// Razão: "Maria Silva" do cedente bater com "João Silva" do sacado é
// estatisticamente quase certo num portfolio FIDC — falso positivo. O critério
// de vínculo familiar exige sobrenome NÃO-comum + mesma UF.
//
// Lista deliberadamente conservadora (≈40 sobrenomes). Para incluir/excluir,
// pesar quantos falsos positivos a inclusão evita vs. quantos vínculos reais
// suprime. Manter ordenado alfabeticamente facilita revisão manual.

const COMMON_SURNAMES = new Set<string>([
  "ALMEIDA",
  "ALVES",
  "ANDRADE",
  "ARAUJO",
  "BARBOSA",
  "BARROS",
  "CARDOSO",
  "CARVALHO",
  "CASTRO",
  "CAVALCANTI",
  "CORREIA",
  "COSTA",
  "CRUZ",
  "DIAS",
  "FERREIRA",
  "FREITAS",
  "GOMES",
  "JESUS",
  "LIMA",
  "MACEDO",
  "MARTINS",
  "MENDES",
  "MOREIRA",
  "NASCIMENTO",
  "OLIVEIRA",
  "PEREIRA",
  "PINTO",
  "REIS",
  "RIBEIRO",
  "ROCHA",
  "RODRIGUES",
  "SANTOS",
  "SILVA",
  "SOARES",
  "SOUSA",
  "SOUZA",
  "TEIXEIRA",
]);

export function isCommonSurname(surname: string): boolean {
  if (!surname) return true; // string vazia age como "comum" — suprime
  return COMMON_SURNAMES.has(surname.toUpperCase());
}

/** Exposto apenas para testes. */
export function _commonSurnamesForTests(): ReadonlySet<string> {
  return COMMON_SURNAMES;
}
