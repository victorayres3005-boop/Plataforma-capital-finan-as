# Runbooks — procedimentos operacionais

Procedimentos para incidentes recorrentes. **Diagnóstico via logs Vercel é a primeira ação** — não investigar código antes de ver os logs.

## Diagnóstico rápido — ordem de ação

Quando Victor reportar "plataforma quebrada":

1. **Pedir os logs do Vercel** da request específica antes de qualquer coisa.
   - Vercel CLI: `vercel logs --follow`
   - Dashboard → projeto → aba Logs
   - Confirmar: logs do navegador (DevTools F12) ≠ logs do Vercel (server-side)
2. Procurar por: `[Gemini] HTTP`, `[parseJSON]`, `[curva_abc]`, `[bureaus]`, `AI_TIMEOUT`, `503`, `timeout`
3. **Só depois** investigar código.

Investigar git diff procurando regressões antes dos logs já consumiu 30+ min sem achar causa real (caso 2026-04-30: era outage Gemini, não código).

## BDC_TOKEN expirou

**Sintoma:** processos judiciais, KYC sócios, grupo econômico vazios no relatório.

**Frequência:** TTL 7 dias. Sem endpoint de refresh — renovação manual obrigatória.

```bash
# 1. Nayara (NAYARA@CAPITALFINANCAS.COM.BR) acessa portal BigDataCorp e gera novo token
# 2. Victor passa o valor para atualizar
# 3. Atualizar no Vercel:
npx vercel env rm BDC_TOKEN production
npx vercel env add BDC_TOKEN production   # cola o novo valor
# 4. Verificar se BDC_TOKEN_ID também muda — se sim, atualizar também
npx vercel --prod                          # redeploy pra pegar
```

**Produtos habilitados:** BIGBOOST, BIGID.

## Gemini retornando 503 / timeout

**Sintoma:** logs mostram `[Gemini] HTTP 503` × N ou `[Gemini] timeout key=... após Xms`.

**Causa:** outage do Google. Confirmar em https://status.cloud.google.com/ → Vertex AI / Gemini.

**Fallback:** **NÃO existe** OpenRouter/Groq (Victor não quer — ver [decisoes.md](decisoes.md#sem-fallback-para-outros-llms)). Aguardar voltar.

**Mitigação durante outage:**
- Curva ABC com texto >15k chars usa parser direto (bypass Gemini) — ver abaixo
- Outros tipos de documento ficam indisponíveis

## Curva ABC voltando vazia (`clientes:[]`)

**Sintoma:** `filledFields=7` (só defaults), tabela vazia no relatório.

**Diagnóstico — pipeline em 4 camadas (`app/api/extract/route.ts`):**

```
[curva_abc] Direct parse: N clientes        → parser regex direto OK
[curva_abc] N clientes via parser direto    → bypass bem-sucedido (>5 clientes)
[curva_abc] Direct parse insuficiente (N)   → fallback Gemini
[parseJSON] JSON truncado — recuperado      → recovery funcionou
[curva_abc] modo visual (fallback: texto)   → BUG: não deve mais acontecer
```

**Configuração atual:**
- `directParseCurvaABC()` para arquivos >15k chars (resolve 400+ clientes em <10ms)
- maxChars Gemini: 60k
- perAttemptMs: 45000ms
- maxOutputTokens: 32k
- thinkingBudget: 0
- Modelos: `gemini-2.5-flash` → `flash-lite` → `pro`

**Regra:** `curva_abc` está fora de `LARGE_TEXT_FALLBACK_VISUAL`. Modo visual retornava `clientes:[]` silenciosamente — **não voltar a colocar lá**.

## 504 timeout no middleware

**Sintoma:** plataforma inteira retorna `504: GATEWAY_TIMEOUT / MIDDLEWARE_INVOCATION_TIMEOUT`.

**Causa:** `supabase.auth.getUser()` no middleware. Edge timeout = 1.5s, e `getUser()` faz HTTP para Supabase a cada request.

**Fix:**
```typescript
// middleware.ts
const { data: { session } } = await supabase.auth.getSession();
const user = session?.user ?? null;
```

`getUser()` (valida com servidor) só em rotas individuais que precisam de segurança máxima.

## Vercel Blob — upload retorna 400 silencioso

**Sintoma:** docs <4MB OK, contrato social (ou qualquer >4MB) falha em `/api/upload-blob` 400, sem mensagem no body — só no `console.error` do servidor.

**Causa:** sem Blob Store conectado ao projeto, `BLOB_READ_WRITE_TOKEN` não existe.

**Diagnóstico:**
```bash
vercel env ls production | grep -i blob
```

**Fix (via API, sem dashboard):**
```bash
# 1. Criar store
vercel blob create-store <nome>            # anota store_...

# 2. Conectar ao projeto via API Vercel
# Token Bearer em $APPDATA/com.vercel.cli/Data/auth.json
curl -X POST "https://api.vercel.com/v2/storage/stores/{storeId}/connections?teamId={teamId}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"prj_...","envVarEnvironments":["production","preview","development"]}'

# 3. Redeploy
vercel --prod
```

## Gemini API keys vazias

**Sintoma:** todas as extrações falham silenciosamente.

**Causa:** `GEMINI_API_KEYS=""` no Vercel produção. Pode ter sido sobrescrito.

**Diagnóstico:**
```bash
vercel env pull --environment=production   # CUIDADO: sobrescreve .env.local
# checa se GEMINI_API_KEYS está vazio
```

**Fix:**
```bash
vercel env rm GEMINI_API_KEYS production --yes
echo "AIzaSy...,AIzaSy...,AIzaSy..." | vercel env add GEMINI_API_KEYS production
vercel --prod
```

3 chaves em rotação no formato vírgula-separada. Variável é **`GEMINI_API_KEYS`** (plural).

## Gemini embedding 404

**Sintoma:** Fase 2 do feedback de rating IA cai sempre no fallback Fase 1.

**Causa:** `text-embedding-004` foi descontinuado em 2026.

**Fix em `lib/embeddings.ts`:**
```ts
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;
// body: { content, taskType, outputDimensionality: 768 }
// NÃO incluir model: no body (URL já carrega)
// SEMPRE passar outputDimensionality: 768 (default é 3072)
```

Validação: `values.length === 768` (compatível com coluna `vector(768)` do Supabase).

## Logs sumiram do console em produção

**Sintoma:** `console.log/info` não aparecem na DevTools nem nos logs Vercel.

**Causa anterior:** `next.config.mjs` tinha `removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false`. SWC stripava `console.log`/`console.info` em prod.

**Estado atual (desde 2026-04-30):** `removeConsole: false` — todos os console.* aparecem.

**Se o flag voltar a ativo:** dev sempre mostra; prod só mostra `console.error` e `console.warn`.

## Virada DataBox360 para produção

**Estado atual:** sandbox key (`ee065e2b-1dd6-4832-9260-c4065dd32a96`).

**Checklist de virada:**
1. Receber credenciais de produção
2. `npx vercel env rm DATABOX360_API_KEY production && npx vercel env add DATABOX360_API_KEY production`
3. `npx vercel env rm DATABOX360_BASE_URL production && npx vercel env add DATABOX360_BASE_URL production` — provavelmente `api.databox360.com.br` (sem prefixo `sandbox-`); confirmar com fornecedor
4. `npx vercel --prod`
5. Limpar cache: `curl "https://plataformacapital.vercel.app/api/bureaus?action=clear_all"`
6. Análise de teste
7. Verificar: detecções `merged.scrSandboxSemHistorico` e `merged.grupoEconomicoScrSandbox` voltam `false` automaticamente

## n8n Goalfy — erros comuns

| Erro | Causa | Fix |
|---|---|---|
| URL com caracteres ocultos | Copy/paste pegou char invisível | Digitar manualmente |
| 401 | Header `Authorization: Bearer ...` | Trocar para `Authorization: Token ...` |
| Method not allowed | Endpoint cron é GET | Trocar método para GET |
| Connection aborted | Supabase instável | Tentar novamente |

Endpoint: `GET https://plataformacapital.vercel.app/api/cron/goalfy-sync` (sem CRON_SECRET configurado para esse endpoint).

## Renovação manual de token Assertiva

Token cache renova automaticamente 60s antes de expirar. Se sumir, basta nova request — código pega novo via OAuth2.

⚠️ Se inserir credenciais novas no Vercel, lembrar do `\n` no final → código já faz `.trim()` em `ASSERTIVA_CLIENT_ID` e `ASSERTIVA_CLIENT_SECRET`.

## Análise travada no GenerateStep

1. Verificar logs Vercel da request `/api/analyze`
2. Procurar `[parseJSON] Unterminated string at position N` → maxOutputTokens insuficiente
3. Procurar `[Gemini] timeout` → Gemini lento, talvez outage
4. Procurar `AI_TIMEOUT_52s` → bateu cap do Hobby plan

Padrão defensivo `safeNum()` em `BureauPrices` previne crash quando bureau retorna `undefined` em campo numérico.
