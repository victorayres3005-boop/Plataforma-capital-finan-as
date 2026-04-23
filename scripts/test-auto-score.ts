// scripts/test-auto-score.ts
// Rodar: npx tsx scripts/test-auto-score.ts

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { hydrateFromCollection } from '../lib/hydrateFromCollection'
import { autoPreencherScore } from '../lib/politica-credito/auto-score'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const CNPJ_BUSCA = '35.959.608/0001-22'
const CNPJ_DIGITS = CNPJ_BUSCA.replace(/\D/g, '') // "35959608000122"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('Faltam variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local')
    process.exit(1)
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[aviso] SUPABASE_SERVICE_ROLE_KEY não encontrada — usando anon key.')
    console.warn('        Se a query retornar vazia por RLS, adicione ao .env.local:')
    console.warn('        SUPABASE_SERVICE_ROLE_KEY=<valor em Settings > API no painel Supabase>\n')
  }

  // service_role bypassa RLS; anon key respeita políticas de linha
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`Buscando collection mais recente para CNPJ ${CNPJ_BUSCA}...\n`)

  // Tenta match exato com o CNPJ formatado primeiro, depois só dígitos
  let rows: any[] | null = null
  for (const cnpjFmt of [CNPJ_BUSCA, CNPJ_DIGITS]) {
    const { data, error } = await supabase
      .from('document_collections')
      .select('id, company_name, cnpj, label, documents, created_at')
      .eq('cnpj', cnpjFmt)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error('Erro ao buscar document_collections:', error.message)
      process.exit(1)
    }
    if (data && data.length > 0) { rows = data; break }
  }

  // Fallback: busca por nome da empresa
  if (!rows || rows.length === 0) {
    const { data, error } = await supabase
      .from('document_collections')
      .select('id, company_name, cnpj, label, documents, created_at')
      .ilike('company_name', '%VISAOSOPRO%')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      console.warn(`[aviso] CNPJ não encontrado — usando fallback por company_name "VISAOSOPRO"\n`)
      rows = data
    }
  }

  if (!rows || rows.length === 0) {
    console.error(`Nenhuma collection encontrada para CNPJ ${CNPJ_BUSCA} nem por nome VISAOSOPRO.`)
    console.error('Verifique se SUPABASE_SERVICE_ROLE_KEY está configurada (RLS pode estar bloqueando).')
    process.exit(1)
  }

  const col = rows[0]
  console.log(`Collection ID : ${col.id}`)
  console.log(`Empresa       : ${col.company_name ?? '—'}`)
  console.log(`Criada em     : ${new Date(col.created_at).toLocaleString('pt-BR')}`)

  const docs = (col.documents ?? []) as { type: string; extracted_data: Record<string, unknown> }[]
  console.log(`Documentos    : ${docs.length} (${docs.map(d => d.type).join(', ')})\n`)

  const data = hydrateFromCollection(docs)
  const resultado = autoPreencherScore(data)

  // ── Score ──────────────────────────────────────────────────────────────────
  console.log('='.repeat(60))
  console.log(`SCORE FINAL : ${resultado.score.score_final.toFixed(1)} pts  |  Rating: ${resultado.score.rating}  |  Confiança: ${resultado.score.confianca_score}`)
  console.log('='.repeat(60))

  // ── Critérios ──────────────────────────────────────────────────────────────
  console.log(`\nCRITÉRIOS AUTO (${resultado.criterios_auto.length}):`)
  console.log('  ' + resultado.criterios_auto.join(', '))

  console.log(`\nCRITÉRIOS MANUAIS — precisam do analista (${resultado.criterios_manuais.length}):`)
  console.log('  ' + resultado.criterios_manuais.join(', '))

  // ── Avisos ─────────────────────────────────────────────────────────────────
  if (resultado.avisos.length > 0) {
    console.log(`\nAVISOS (${resultado.avisos.length}):`)
    resultado.avisos.forEach(a => console.log(`  • ${a}`))
  }

  // ── Detalhe de cada resposta automática ───────────────────────────────────
  const autoResps = resultado.respostas.filter(r => r.fonte_preenchimento === 'auto')
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`RESPOSTAS AUTOMÁTICAS (${autoResps.length}):`)
  console.log('─'.repeat(60))
  for (const r of autoResps) {
    console.log(`\n  [${r.criterio_id}] — pilar: ${r.pilar_id}`)
    console.log(`    Opção   : ${r.opcao_label}`)
    console.log(`    Pontos  : ${r.pontos_final}`)
    if (r.observacao) console.log(`    Obs     : ${r.observacao}`)
  }

  if (resultado.score.pilares_pendentes.length > 0) {
    console.log(`\nPilares pendentes: ${resultado.score.pilares_pendentes.join(', ')}`)
  }

  console.log('\nConcluído.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
