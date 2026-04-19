// Prompt Gemini para extração de Contrato Social / Estatuto / Alteração.
export const PROMPT_CONTRATO = `Você receberá um CONTRATO SOCIAL, ESTATUTO SOCIAL, ATO CONSTITUTIVO, ALTERAÇÃO CONTRATUAL, CONSOLIDAÇÃO ou ADITIVO de uma empresa brasileira. O documento pode estar em PDF nativo, PDF escaneado com OCR ruidoso, ou imagem. Sua tarefa é extrair TUDO o que for possível — mesmo informação parcial. Retorne APENAS JSON válido, sem markdown, sem comentários, sem texto fora do JSON.

Schema OBRIGATÓRIO (preencha TODOS os campos que encontrar):
{"socios":[{"nome":"","cpf":"","participacao":"","qualificacao":"","cotas":""}],"capitalSocial":"","objetoSocial":"","dataConstituicao":"","temAlteracoes":false,"ultimaAlteracao":"","prazoDuracao":"","administracao":"","foro":"","sede":""}

═══ REGRA ZERO — NUNCA RETORNE VAZIO ═══
Contratos sociais SEMPRE têm pelo menos:
- Nome da empresa (na abertura, primeira página)
- Objeto social (o que a empresa faz)
- Capital social (valor das cotas)
- Ao menos 1 sócio (sem sócio não existe contrato)

Se você está retornando todos os campos vazios, VOLTE e olhe de novo — a informação ESTÁ no documento. Releia o cabeçalho, as cláusulas, o rodapé, as assinaturas. Se o OCR está ruidoso, extraia o que conseguir inferir com alta confiança — é MELHOR retornar campos parciais do que tudo vazio.

═══ ONDE ENCONTRAR CADA INFORMAÇÃO ═══

SÓCIOS — procure em QUALQUER destas seções:
1. Cláusula "Dos Sócios" / "Do Capital Social" / "Da Administração" / "Cláusula Primeira" / "CLÁUSULA 1ª"
2. Abertura do contrato (primeira página): "Fulano de Tal, brasileiro, [...], CPF 123.456.789-00, residente em [...]"
3. Tabela de distribuição de cotas
4. Página de assinaturas (finais): cada assinatura é normalmente de um sócio
5. Alterações/consolidações: olhe o quadro societário FINAL, não o original

Formatos comuns de sócio no corpo do contrato:
- "JOÃO DA SILVA, brasileiro, casado, empresário, portador do CPF nº 123.456.789-00, titular de 500.000 cotas, representando 50% do capital social"
- "Maria Oliveira, RG 12.345.678, CPF 987.654.321-00, residente na Rua X, titular de 50 (cinquenta) cotas de R$ 1.000,00 cada"
- Em tabelas: "Nome | CPF | Cotas | %"

CAPITAL SOCIAL — procure por:
- "Capital Social", "Capital Subscrito", "Capital Integralizado", "Cláusula do Capital"
- "R$ 100.000,00 (cem mil reais) dividido em 100.000 cotas de R$ 1,00 cada"
- Tabelas que somam o total de cotas
- SEMPRE formato "R$ VALOR,CC" — com prefixo "R$" e separador brasileiro

OBJETO SOCIAL — procure por:
- Cláusula "Do Objeto Social" / "Objeto" / "Atividade" / "Cláusula Segunda"
- Texto começando com "A sociedade tem por objeto..." ou "A empresa tem como atividade..."
- Lista de CNAEs descritos
- **É O CAMPO MAIS FÁCIL DE EXTRAIR — sempre tem, quase sempre na primeira página**
- Reescreva em Título Case, texto corrido, atividades separadas por vírgula, máx 300 caracteres
- Ex: "Comércio atacadista de produtos alimentícios, fabricação de alimentos congelados, transporte rodoviário de cargas"

DATA DE CONSTITUIÇÃO — procure por:
- "data da constituição", "constituída em", "fundada em"
- Data mais antiga mencionada no documento (NÃO a data da alteração atual)
- Cabeçalho do primeiro instrumento: "Instrumento Particular de Constituição [...] de 15/03/2010"
- Formato de saída: DD/MM/YYYY

ADMINISTRAÇÃO — procure por:
- Cláusula "Da Administração" / "Administradores"
- "A administração será exercida pelo sócio [nome]"
- "fica nomeado administrador [nome]"
- Ex de saída: "João da Silva (Administrador)" ou "João da Silva e Maria Oliveira (Administradores)"

FORO — procure por:
- Última cláusula do contrato (quase sempre a última)
- "Fica eleito o foro da Comarca de [Cidade/UF]"
- Ex de saída: "São Paulo/SP"

SEDE — procure por:
- Cláusula "Da Sede" / "Do Endereço" / primeira página após identificação da empresa
- Endereço completo: rua, número, bairro, cidade, UF, CEP
- Retorne em uma linha: "Rua das Flores, 123, Centro, São Paulo/SP, CEP 01234-567"

PRAZO DE DURAÇÃO — procure por:
- "Prazo indeterminado" (mais comum) → retorne "indeterminado"
- "Prazo de 10 anos" → retorne "10 anos"

═══ CONSOLIDAÇÕES E ALTERAÇÕES ═══
- Se o título do documento contém "Alteração", "Aditivo", "Consolidação", "Reforma" → temAlteracoes=true
- Extraia o QUADRO FINAL de sócios (após a alteração, não antes)
- dataConstituicao = data ORIGINAL de fundação (1º instrumento)
- ultimaAlteracao = data da alteração mais recente (DD/MM/YYYY)

═══ CAMPOS DOS SÓCIOS ═══
- nome: completo, preservando acentos/cedilhas, como aparece no documento
- cpf: formato XXX.XXX.XXX-XX. Se mascarado ("***.456.789-**"), retorne como está. Se ausente, "".
- participacao: percentual com vírgula ("50,00%") OU valor em cotas se não houver %. Se tem "500.000 cotas" de "1.000.000 cotas totais" → "50,00%".
- cotas: número absoluto ("500000") se mencionado, senão ""
- qualificacao: texto exato do contrato ("Sócio", "Sócio-Administrador", "Administrador", "Acionista", "Diretor")

═══ EXCLUSÕES — NÃO inclua como sócios ═══
- Testemunhas das assinaturas
- Advogados, contadores, despachantes, procuradores sem cotas
- Cônjuges mencionados sem participação ("casado com...")
- Funcionários, gerentes contratados, diretores não-sócios
- Notários, cartórios

═══ REGRAS DE EXTRAÇÃO ═══
1. EXTRAIA TODOS os sócios encontrados — mesmo que falte CPF ou %
2. NUNCA retorne socios: [] se há MENÇÃO a sócios no documento
3. Se encontrar só o nome sem CPF, inclua mesmo assim com cpf=""
4. Se o capital social está em cotas mas não em reais, calcule (cotas × valor unitário)
5. Se só uma parte é legível, retorne essa parte — nunca tudo vazio
6. Para scans com OCR ruim: foque nos campos MAIS ROBUSTOS primeiro (objeto social, capital social, nome de sócios maiúsculos)

═══ FALLBACK QUANDO O DOCUMENTO É DIFÍCIL ═══
Se o documento está muito degradado/ilegível:
- Prioridade 1: extraia objetoSocial (quase sempre é texto corrido legível)
- Prioridade 2: capitalSocial (valor monetário destacado)
- Prioridade 3: ao menos UM sócio (nome + CPF se visível)
- Prioridade 4: dataConstituicao (cabeçalho do primeiro instrumento)
- Deixe os outros campos vazios

RETORNAR TODOS OS CAMPOS VAZIOS É ERRO CRÍTICO. Um contrato social sempre tem ao menos objeto social ou nome de sócio visível. Volte e olhe de novo se isso aconteceu.

═══ VALIDAÇÃO ANTES DE RETORNAR ═══
Antes de produzir o JSON, confira:
1. capitalSocial NUNCA vazio em consolidacao/ato constitutivo (volte ao documento se retornou "")
2. Pelo menos 1 socio detectado (raro haver contrato sem socios)
3. Soma de participacoes dos socios ≈ 100% (tolerancia 2%)
4. dataConstituicao preenchido quando e um ato constitutivo (primeira alteracao)
5. temAlteracoes=true quando o documento e claramente uma "X Alteracao" ou "Consolidacao"
6. Se objetoSocial ficar vazio, releia — praticamente todo contrato tem um paragrafo de objeto social

Campos ausentes: "" ou false. NÃO invente dados — mas extraia tudo o que está visível.`;
