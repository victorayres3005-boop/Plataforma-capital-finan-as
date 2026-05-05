---
tags: [capital-financas, claude-code, setup, plugins, skills]
---

> Hub: [[CAPITAL]]


# Setup Claude Code — Capital Finanças

Configuração da ferramenta Claude Code que o Victor usa pra trabalhar nesta plataforma. Usar este arquivo como **referência de recriação** ao trocar de conta ou máquina.

> Snapshot capturado em **2026-05-05**. Atualizar quando habilitar/desabilitar plugin novo, adicionar hook, ou mudar settings.

---

## 🔌 Plugins habilitados

Configurados em `~/.claude/settings.json` → `enabledPlugins`:

| Plugin | Marketplace | Descrição |
|---|---|---|
| `frontend-design@claude-plugins-official` | oficial | Skill `frontend-design:frontend-design` — gera UIs distintivas, evita visual genérico de template |
| `code-review@claude-plugins-official` | oficial | Skill `code-review:code-review` — revisa pull requests |
| `codex@openai-codex` | `openai/codex-plugin-cc` (GitHub) | Skills `codex:rescue`, `codex:setup`, `codex:codex-result-handling`, `codex:codex-cli-runtime`, `codex:gpt-5-4-prompting` — delegação ao Codex CLI |

**Marketplace extra registrado:**
```json
"openai-codex": { "source": { "source": "github", "repo": "openai/codex-plugin-cc" } }
```

---

## 🎣 Hooks ativos

Configurados em `~/.claude/settings.json` → `hooks`:

### `UserPromptSubmit`

Adiciona contexto a cada prompt do usuário, forçando o Claude a reformular mentalmente o pedido e identificar ambiguidades antes de agir.

```powershell
Write-Output '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"Antes de responder: reformule mentalmente o prompt do usuário deixando-o mais preciso e objetivo. Identifique ambiguidades. Se houver ambiguidade crítica que impeça resposta correta, peça esclarecimento ANTES de agir."}}'
```

Shell: `powershell` · Timeout: `5s`

---

## ⚙️ Settings globais (`~/.claude/settings.json`)

| Chave | Valor | Efeito |
|---|---|---|
| `effortLevel` | `"high"` | Modo de raciocínio/qualidade alto por default |
| `autoUpdatesChannel` | `"latest"` | Atualizações automáticas no canal latest |

---

## 🛠️ Skills disponíveis (instaladas via plugins)

### Built-in Claude Code
- `init` — inicializa um CLAUDE.md novo no projeto
- `review` — revisa pull request
- `security-review` — revisão de segurança da branch atual
- `update-config` — configura o harness via settings.json (hooks, env vars, permissões)
- `keybindings-help` — ajuda com keybindings (~/.claude/keybindings.json)
- `simplify` — revisa código alterado e simplifica
- `fewer-permission-prompts` — adiciona allowlist em settings.json para reduzir prompts de permissão
- `loop` — executa prompt em intervalo recorrente
- `schedule` — cria/edita/lista agentes remotos agendados (cron)
- `claude-api` — build e debug de apps com Claude API / Anthropic SDK

### Plugin `frontend-design`
- `frontend-design:frontend-design` — UI distinctiva, production-grade

### Plugin `code-review`
- `code-review:code-review` — code review de PR

### Plugin `codex`
- `codex:rescue` — delega investigação/fix ao Codex CLI quando travamos
- `codex:setup` — verifica se Codex CLI está pronto, configura stop-time review
- `codex:codex-result-handling` — guidance interno ao apresentar output do Codex
- `codex:codex-cli-runtime` — contrato interno pra chamar codex-companion
- `codex:gpt-5-4-prompting` — guidance interno pra prompts ao GPT-5.4

### Custom skills do projeto Capital
- `capital-pdf-report` — guia pra editar relatório PDF (jsPDF + HTML template)
- `capital-rating-analysis` — guia pra ajustar análise de rating de crédito (prompt, pesos, alertas, parâmetros)

---

## 🧠 Memória persistente do Claude Code

Localização: `~/.claude/projects/{slug-do-projeto}/memory/`

Para a plataforma Capital o slug é:
```
C--Users-Admin-Documents-Nova-pasta-Plataforma---Capital-finan-as---D-bora
```

Todos os arquivos `.md` desta pasta funcionam como contexto persistente entre sessões. **`MEMORY.md` é índice e é sempre carregado**. Os outros arquivos são consultados sob demanda.

> ⚠️ **Atenção ao trocar de conta:** as memórias do Claude Code ficam atreladas à conta + máquina. **Copie a pasta `~/.claude/projects/{slug}/memory/`** pra preservar o conhecimento que foi acumulado. O cérebro em `cerebro/` (versionado no Git) é redundância: sobrevive à troca de conta naturalmente.

---

## 📦 Pacotes/CLIs externos usados

| CLI | Uso | Auth |
|---|---|---|
| `vercel` | Deploy + listagem de deployments | login Vercel (`victorayres3005-boops-projects`) |
| `gh` | Operações GitHub (PRs, issues) | login GitHub |
| `git` | Versionamento | repo: `https://github.com/victorayres3005-boop/Plataforma-capital-finan-as` |
| `npm` / `node` | Build + dev (Next.js) | — |
| `npx tsc` | Type-check | — |

Vercel project ID (em `.vercel/project.json`): `prj_QSGs0DD7JlKgUaXqDTGhmjNzjiqy`
Org ID: `team_rHQOoVYOcntW7wC94G37MZS8`

---

## 🚨 Como recriar este setup numa nova conta Claude Code

1. Instalar o Claude Code na máquina
2. Editar `~/.claude/settings.json` colando os blocos `enabledPlugins`, `extraKnownMarketplaces`, `hooks`, `effortLevel`, `autoUpdatesChannel` deste arquivo
3. Login no `vercel` CLI (mesmo time `victorayres3005-boops-projects`)
4. Login no `gh` CLI
5. Clonar o repo: `git clone git@github.com:victorayres3005-boop/Plataforma-capital-finan-as.git`
6. (Opcional) Copiar `~/.claude/projects/{slug-do-projeto-antigo}/memory/` pra mesma localização na nova máquina, ajustando o slug se necessário

O `cerebro/` versionado no Git já vem com o clone — é a fonte de verdade independente de conta.
