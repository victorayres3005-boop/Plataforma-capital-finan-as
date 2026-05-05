---
tags: [capital-financas, claude, protocolo, manutencao]
---

# Protocolo Claude — como usar e manter o cérebro

Como o Claude Code (esta IA) deve usar e atualizar este cérebro a cada sessão.

## Em toda nova sessão

1. **Ler `MEMORY.md`** primeiro (em `~/.claude/projects/.../memory/`) — carrega automático e dá contexto cronológico recente.
2. **Ler `CAPITAL.md`** quando o projeto estiver no escopo — dá o mapa estável.
3. **Buscar arquivos relevantes em `cerebro/`** conforme o tema da sessão (ex: tarefa em PDF → ler pdf-relatorio).

## Regra de ouro — estável vs cronológico

| Tipo de info | Onde mora |
|---|---|
| "Como o sistema funciona" | `cerebro/` (este vault) |
| "O que aconteceu / quando / quem disse" | `~/.claude/.../memory/` (auto-load) |
| "Como atualizei o sistema HOJE" | `cerebro/historico.md` (entrada nova) + memory (factual) |

**Não duplicar.** Memória é cronológica e datada. Cérebro é estável e descreve o presente.

## Quando atualizar `cerebro/`

Atualize o arquivo correspondente quando:

| Mudança | Arquivo |
|---|---|
| Novo bureau / endpoint / dataset | bureaus |
| Novo runbook por incidente recorrente | runbooks |
| Decisão arquitetural com peso | decisoes (novo ADR no final, não apagar antigos) |
| Nova entidade / tabela / migration | banco-dados |
| Mudança no pipeline de extração de um tipo | extracao (seção do tipo) |
| Novo termo do domínio | glossario |
| Novo padrão de código | snippets-padroes |
| Mudança de stack ou modelo de dados | arquitetura |
| Mudança de fluxo UI | ui-fluxos |
| Mudança em pilares/parâmetros da política | politica-credito |
| Mudança em estrutura do PDF | pdf-relatorio |
| Cirurgia / sessão concluída com mudanças deployadas | historico (entrada nova **no topo**) |
| Reavaliação da plataforma ou roadmap | roadmap-gaps |

## Quando NÃO atualizar

- Bug fix trivial sem mudança de invariante → vai no commit
- Refactor local sem peso arquitetural → vai no commit
- Mudança de linha temporária / WIP → fica no branch/commit
- Decisão cosmética (nome de variável, cor de UI) → não entra
- Eventos pontuais ("Victor disse X hoje") → vai pra memória cronológica, não pra cá

## Como atualizar (procedimento)

1. **Faça a mudança no projeto**
2. Antes de finalizar a sessão, identifique: a mudança altera **invariantes** ou **conhecimento estável**?
3. Se sim:
   - Ache o arquivo correspondente em `cerebro/`
   - Atualize a seção (não apague — atualize ou adicione)
   - Se for ADR ou histórico, adicione **no topo** com data
4. Sincronize entre o vault Obsidian e a cópia no projeto:
   - Vault: `C:\Users\Admin\Documents\Obsidian Vault\Capital Finanças\`
   - Projeto: `C:\Users\Admin\Documents\Nova pasta\Plataforma - Capital finanças - Débora\`

## Sincronização entre vault e projeto

**Por que existem dois locais:**
- Vault Obsidian: knowledge management pessoal do Victor (busca, grafo, navegação)
- Projeto: para o Claude Code do projeto referenciar diretamente

**Os dois devem estar idênticos** após cada update. Quando atualizar um, atualize o outro.

```
C:\Users\Admin\Documents\Obsidian Vault\Capital Finanças\
  CAPITAL.md
  cerebro\*.md

C:\Users\Admin\Documents\Nova pasta\Plataforma - Capital finanças - Débora\
  CAPITAL.md
  cerebro\*.md
```

## Padrão de sessão "execução + memória"

Ao terminar uma sessão de cirurgia:

1. ✅ Mudança no código deployada
2. ✅ Codex review automático disparado (`/codex:review --background`)
3. ✅ Entrada nova em historico (data, commits, highlights)
4. ✅ Arquivo do cérebro relevante atualizado se invariante mudou
5. ✅ Sincronizar vault ↔ projeto
6. ✅ Memória cronológica atualizada (se houver feedback novo do Victor)

## Princípios de escrita do cérebro

- **Conciso > exaustivo.** Notas curtas (50-200 linhas) são mais úteis que tomos.
- **Linkar com `[[wikilinks]]`** entre arquivos do vault.
- **Citar arquivo:linha** quando relevante (ex: `app/api/extract/route.ts ~3186`).
- **Usar tabelas** para mappings (dado → bureau, sintoma → causa, etc.).
- **Frontmatter `tags`** para discoverability no Obsidian.
- **Bloco `Why` + `How to apply`** para regras (estilo memória de feedback).
- **Snake_case** para identificadores de código, **kebab-case** para nomes de arquivo.

## Quando ler o cérebro vs perguntar ao Victor

- Antes de propor mudança em arquitetura → checar decisoes
- Antes de "ajustar X" → checar se X é invariante em ui-fluxos ou pdf-relatorio
- Antes de adicionar fallback de LLM → ler ADR-001 (decisoes)
- Quando Victor reportar "quebrado" → primeiro runbooks#Diagnóstico rápido

Se o cérebro tem a resposta, **use**. Se não tem, ou está stale, **pergunte e atualize depois**.

## Limites

- **Não memorizar dados sensíveis** (chaves, tokens, senhas) — só onde encontrá-los
- **Não escrever planos de longo prazo aqui** — vão em roadmap-gaps
- **Não duplicar a política de crédito completa** — referência aponta pro Supabase

## Auto-update

Quando o Victor pedir "atualiza o cérebro", "salva isso no cérebro", "registra essa mudança":

1. Pergunte (se ambíguo) qual arquivo do cérebro toca
2. Atualize **ambas** as cópias (vault + projeto)
3. Se for incidente/cirurgia, adicione entrada em historico
4. Se for regra duradoura, adicione em decisoes como ADR

Quando o Victor não pedir explicitamente mas a sessão executar mudanças com peso de invariante, **proponha** atualizar o cérebro antes de fechar.
