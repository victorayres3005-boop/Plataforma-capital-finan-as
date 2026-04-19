// Prompt Gemini para extração de relatório de processos judiciais.
export const PROMPT_PROCESSOS = `Você receberá um relatório de processos judiciais (Credit Bureau, SERASA, Jusbrasil, Escavador, relatório de advogado ou similar). Extraia os dados e retorne APENAS JSON válido, sem markdown.

Schema:
{"passivosTotal":"","ativosTotal":"","valorTotalEstimado":"","temRJ":false,"temRecuperacaoExtrajudicial":false,"distribuicao":[{"tipo":"","qtd":"","pct":""}],"bancarios":[{"banco":"","assunto":"","status":"","data":"","valor":"","numero":"","tribunal":""}],"fiscais":[{"contraparte":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"fornecedores":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}],"outros":[{"contraparte":"","assunto":"","valor":"","status":"","data":"","numero":"","tribunal":""}]}

Totais:
- passivosTotal: processos onde a empresa é RÉ / EXECUTADA / REQUERIDA / PACIENTE — string numérica (ex: "12")
- ativosTotal: processos onde a empresa é AUTORA / EXEQUENTE / REQUERENTE / IMPETRANTE — string numérica
- valorTotalEstimado: valor total em reais com prefixo "R$" (ex: "R$ 450.000,00")

Flags críticos:
- temRJ: true se houver menção a "Recuperação Judicial", "RJ", "Deferimento de Processamento de RJ"
- temRecuperacaoExtrajudicial: true se "Recuperação Extrajudicial" ou "Homologação de Plano Extrajudicial"
- recuperacaoJudicial: se temRJ=true, preencha {"status":"DEFERIDA|EM_PROCESSAMENTO|CONCEDIDA|ENCERRADA|CONVERTIDA_EM_FALENCIA","dataDistribuicao":"DD/MM/YYYY","numeroProcesso":"CNJ se disponivel","tribunal":"sigla","administradorJudicial":"nome se disponivel"}. Se algum campo nao aparecer, deixe "".
- Se temRJ=false, recuperacaoJudicial pode ser omitido ou {} vazio.

Categorias (distribuicao — use EXATAMENTE estes tipos):
- "TRABALHISTA": reclamações trabalhistas, ações sindicais, execuções trabalhistas
- "BANCÁRIO": ações com bancos, financeiras, cooperativas de crédito como contraparte
- "FISCAL": execuções fiscais, dívida ativa, PGFN, Receita Federal, Fazenda Estadual/Municipal, INSS
- "FORNECEDOR": ações de cobrança movidas por fornecedores ou prestadores
- "CÍVEL": ações cíveis gerais (indenização, danos morais, contratos, responsabilidade civil, consumidor)
- "OUTROS": o que não se encaixa — criminais, ambientais, regulatórios, especiais

Detalhamento por array — NÃO duplique um processo entre arrays:
- bancarios[]: processos BANCÁRIOS individualizados
- fiscais[]: processos FISCAIS individualizados
- fornecedores[]: processos de FORNECEDOR individualizados
- outros[]: processos CÍVEIS + OUTROS individualizados
- TRABALHISTAS: NÃO liste individualmente por sigilo — apenas conte em distribuicao

Campos dos processos individuais:
- contraparte / banco: nome da parte adversa
- assunto: resumo em uma linha (ex: "Cobrança de duplicata", "Dano moral", "Execução de título")
- status: "EM ANDAMENTO" | "ARQUIVADO" | "JULGADO" | "EM RECURSO" | "SUSPENSO" | "DISTRIBUÍDO" | "TRANSITADO EM JULGADO"
- data: DD/MM/YYYY — data de distribuição
- valor: em reais formato brasileiro com "R$" (ex: "R$ 50.000,00") ou "" se indefinido
- numero: número CNJ completo (ex: "0000000-00.0000.0.00.0000") se disponível
- tribunal: sigla (ex: "TJSP", "TRT2", "TRF3", "STJ") se disponível

Documentos negativos:
- "NADA CONSTA" / "NÃO FORAM ENCONTRADOS PROCESSOS": passivosTotal="0", ativosTotal="0", distribuicao=[], arrays vazios

NÃO invente dados.`;
