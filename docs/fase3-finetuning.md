# Fase 3 — Fine-tuning do Modelo de Rating

## Pré-requisitos para ativar

- [ ] Mínimo 50 registros em `rating_feedback` com `reviewed = true`
- [ ] Mínimo 30 registros com `justificativa_comite` preenchida
- [ ] `abs(delta_rating) >= 0.5` em pelo menos 20 desses registros

Verificar com:
```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE justificativa_comite IS NOT NULL) AS com_justificativa,
  COUNT(*) FILTER (WHERE ABS(delta_rating) >= 0.5) AS com_divergencia
FROM rating_feedback
WHERE reviewed = true;
```

---

## O que implementar (quando os pré-requisitos forem atingidos)

### 1. Rota `/api/export-finetuning`

Exporta os dados da `vw_fine_tuning_export` em formato JSONL compatível com
Google Gemini fine-tuning (ou OpenAI se mudar de provedor).

Formato de saída por linha:
```json
{
  "messages": [
    { "role": "user", "content": "<prompt com dados da empresa>" },
    { "role": "model", "content": "<rating X/10, decisão Y, justificativa Z>" }
  ]
}
```

### 2. Job de fine-tuning via Google AI Studio API

Quando o dataset estiver pronto:
- Chamar `POST https://generativelanguage.googleapis.com/v1beta/tunedModels`
- Modelo base: `gemini-1.5-flash-001-tuning` (mais barato para fine-tuning)
- Salvar o `tunedModelName` retornado (ex: `tunedModels/capital-financas-rating-v1`)

### 3. Usar modelo fine-tunado em `/api/analyze`

Adicionar ao `callGemini()` a lógica:
- Se existir `GEMINI_FINETUNED_MODEL` nas env vars → usa esse modelo
- Fallback para `gemini-2.0-flash` se o modelo fine-tunado falhar

### 4. Monitoramento pós-fine-tuning

Após deploy com modelo fine-tunado, comparar:
```sql
SELECT
  prompt_version_label,
  AVG(ABS(delta_rating)) AS delta_medio,
  COUNT(*) AS casos
FROM rating_feedback
GROUP BY prompt_version_label
ORDER BY casos DESC;
```
Se `delta_medio` cair → fine-tuning funcionou.

---

## Custo estimado (Google AI Studio)

- Fine-tuning Gemini 1.5 Flash: ~$3–8 por 1000 exemplos de treino
- Com 100 casos: custo praticamente zero
- Modelo fine-tunado fica disponível por 12 meses

---

## Quando re-treinar

Re-treinar a cada 3–6 meses ou quando acumular +50 novos casos corrigidos.
O sistema já rastreia qual modelo gerou cada rating via `model_used` e
`prompt_version_label`, facilitando comparação antes/depois.
