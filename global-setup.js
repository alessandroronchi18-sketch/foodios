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

  if (!URL || !KEY || !email) {
    console.warn('[globalSetup] SUPABASE_URL / SUPABASE_SERVICE_KEY / TEST_EMAIL mancanti — seed saltato.')
    writeFileSync(seedPath, JSON.stringify({ orgId: null }))
    return
  }

  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1. Trova org del test user
  const { data: prof, error: pErr } = await sb
    .from('profiles').select('organization_id').eq('email', email).maybeSingle()
  if (pErr || !prof?.organization_id) {
    console.warn('[globalSetup] org per', email, 'non trovata:', pErr?.message || 'nessun profilo')
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
