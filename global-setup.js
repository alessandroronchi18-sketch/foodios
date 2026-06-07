// @ts-check
// globalSetup Playwright: prepara lo stato per l'account di test.
//  1. Trova l'organization_id dell'account TEST_EMAIL (via service key).
//  2. Semina un ricettario con 1 ricetta (SEED TORTA TEST) + costi ingredienti,
//     così i test ricettario/food-cost hanno dati deterministici.
//  3. Scrive { orgId } in tests/.seed-state.json — letto da auth.js per
//     impostare in localStorage il flag onboarding-completato e l'apertura
//     dei gruppi sidebar (la nav per-testo funziona solo se i gruppi sono aperti).
//
// Richiede env: SUPABASE_URL, SUPABASE_SERVICE_KEY, TEST_EMAIL.
// Se mancano, salta il seed (i test auth-gated verranno skippati a valle).

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SEED_RICETTARIO = {
  ricette: {
    'SEED TORTA TEST': {
      nome: 'SEED TORTA TEST',
      categoria: 'Test E2E',
      tipo: 'fetta',
      unita: 8,
      prezzo: 5,
      congelabile: false,
      allergeni: ['glutine'],
      ingredienti: [
        { nome: 'farina 00', qty1stampo: 500 },
        { nome: 'zucchero', qty1stampo: 200 },
      ],
    },
  },
  ingredienti_costi: {
    'farina 00': { costoKg: 0.88, costoG: 0.00088 },
    'zucchero': { costoKg: 0.98, costoG: 0.00098 },
  },
}

export default async function globalSetup() {
  const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const KEY = process.env.SUPABASE_SERVICE_KEY
  const email = process.env.TEST_EMAIL
  const seedPath = join(__dirname, 'tests', '.seed-state.json')

  // Env assente.
  //  - In CI: è una misconfigurazione → fallisci CHIARO (i test di sicurezza
  //    DEVONO girare; una CI verde con tutto skippato NASconderebbe il problema).
  //  - In locale (dev): skip silenzioso, gli spec browser skippano via SEED_OK.
  if (!URL || !KEY || !email) {
    const msg = '[globalSetup] SUPABASE_URL / SUPABASE_SERVICE_KEY / TEST_EMAIL mancanti'
    if (process.env.CI) {
      throw new Error(
        `${msg}. In CI questi secret sono richiesti per i test di sicurezza (RLS / accessi / ricette).\n` +
        `→ Configura in GitHub Actions i secret: SUPABASE_URL, SUPABASE_SERVICE_KEY (sb_secret_…), ` +
        `VITE_SUPABASE_ANON_KEY (sb_publishable_…), TEST_EMAIL, TEST_PASSWORD.`
      )
    }
    console.warn(`${msg} — seed saltato (dev locale: spec browser skippati).`)
    writeFileSync(seedPath, JSON.stringify({ orgId: null }))
    return
  }

  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1. Trova org del test user
  const { data: prof, error: pErr } = await sb
    .from('profiles').select('organization_id').eq('email', email).maybeSingle()

  // Chiave PRESENTE ma non valida/disabilitata → fallisci SUBITO e chiaro,
  // invece di lasciar fallire 5 spec browser con timeout criptici.
  if (pErr) {
    const disabled = /legacy|disabled|invalid|api key|jwt/i.test(pErr.message || '')
    throw new Error(
      `[globalSetup] SEED FALLITO — la SUPABASE_SERVICE_KEY non è valida` +
      `${disabled ? ' (sembra una chiave legacy DISABILITATA)' : ''}: ${pErr.message}\n` +
      `→ Aggiorna il secret GitHub Actions SUPABASE_SERVICE_KEY con la nuova chiave sb_secret_… ` +
      `(e VITE_SUPABASE_ANON_KEY con sb_publishable_…) e rilancia il workflow.`
    )
  }

  // Chiave valida ma account di test inesistente → niente seed (gli spec browser
  // skippano via SEED_OK), ma i test DB self-contained continuano a girare.
  if (!prof?.organization_id) {
    console.warn(`[globalSetup] nessun profilo per TEST_EMAIL=${email} — spec browser skippati (i test DB girano lo stesso).`)
    writeFileSync(seedPath, JSON.stringify({ orgId: null }))
    return
  }
  const orgId = prof.organization_id

  // 2. Upsert ricettario (chiave shared, sede_id NULL) — select+update/insert
  //    perché l'unique index su user_data è parziale (where sede_id is null).
  const { data: existing } = await sb
    .from('user_data').select('id')
    .eq('organization_id', orgId).eq('data_key', 'pasticceria-ricettario-v1').is('sede_id', null)
    .maybeSingle()

  if (existing?.id) {
    await sb.from('user_data').update({ data_value: SEED_RICETTARIO }).eq('id', existing.id)
  } else {
    await sb.from('user_data').insert({
      organization_id: orgId, sede_id: null,
      data_key: 'pasticceria-ricettario-v1', data_value: SEED_RICETTARIO,
    })
  }

  // 3. Scrivi stato per i test
  writeFileSync(seedPath, JSON.stringify({ orgId }))
  console.log('[globalSetup] seed OK — orgId:', orgId)
}
