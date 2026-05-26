#!/usr/bin/env node
/**
 * Crea un account di test dedicato per Playwright via Supabase Admin API.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   node scripts/create-test-user.mjs
 *
 * Opzionali (con default):
 *   TEST_USER_EMAIL=test@foodios-internal.com
 *   TEST_USER_PASSWORD=<auto-generata se non fornita>
 *
 * Output: stampa email e password alla fine, da copiare nei GitHub Secrets.
 * Lo script NON salva password su disco e NON la logga durante l esecuzione.
 *
 * Il trigger handle_new_user di Supabase creerà automaticamente:
 * - organizations (nome da user_metadata.nome_attivita)
 * - sedi (sede principale)
 * - profiles (ruolo titolare)
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const EMAIL = process.env.TEST_USER_EMAIL || 'test@foodios-internal.com'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY sono obbligatori.')
  console.error('   Trovi la service_role key in Supabase Dashboard → Settings → API.')
  console.error('   Su Vercel è già configurata come SUPABASE_SERVICE_KEY.')
  process.exit(1)
}

if (SUPABASE_SERVICE_KEY.length < 100) {
  console.error('❌ SUPABASE_SERVICE_KEY sembra non valida (troppo corta).')
  console.error('   Controlla di usare la service_role key, non la anon key.')
  process.exit(1)
}

/** Password 24 caratteri base64url, ~144 bit di entropia, niente +/= ambigui. */
function generatePassword() {
  return randomBytes(18)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '') + 'Aa1!' // garantisce regole comuni (maiuscola, minuscola, numero, simbolo)
}

const password = process.env.TEST_USER_PASSWORD || generatePassword()

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log(`\n→ Creazione utente ${EMAIL}...`)

const { data, error } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password,
  email_confirm: true, // niente passaggio "verifica email", login subito attivo
  user_metadata: {
    nome_completo: 'Playwright Bot',
    nome_attivita: 'FoodOS Playwright Test',
    tipo_attivita: 'bar',
    citta: 'Torino',
  },
})

if (error) {
  if (error.message?.toLowerCase().includes('already')) {
    console.error(`\n⚠️  L utente ${EMAIL} esiste già su Supabase.`)
    console.error('   Opzioni:')
    console.error('   1. Resetta la password manualmente da Supabase Dashboard → Auth → Users')
    console.error('   2. Cancella l utente esistente e ri-esegui questo script')
    console.error('   3. Usa un email diversa: TEST_USER_EMAIL=altra@email.com node scripts/create-test-user.mjs')
    process.exit(2)
  }
  console.error('\n❌ Errore creazione utente:', error.message)
  process.exit(3)
}

const userId = data?.user?.id
console.log(`✓ Utente creato (id: ${userId})`)

// Verifica che il trigger handle_new_user abbia creato profilo + org
await new Promise(r => setTimeout(r, 1500)) // breve attesa per il trigger
const { data: profile, error: pErr } = await supabase
  .from('profiles')
  .select('id, organization_id, ruolo')
  .eq('id', userId)
  .maybeSingle()

if (pErr) {
  console.error(`⚠️  Impossibile verificare il profilo: ${pErr.message}`)
} else if (!profile) {
  console.error('⚠️  Profilo non creato dal trigger — controlla handle_new_user su Supabase.')
} else {
  console.log(`✓ Profilo creato (org_id: ${profile.organization_id}, ruolo: ${profile.ruolo})`)
}

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('✅ Account pronto. Aggiungi questi valori ai GitHub Secrets:')
console.log('   Repo → Settings → Secrets and variables → Actions → New secret')
console.log('───────────────────────────────────────────────────────────────')
console.log(`   TEST_EMAIL     = ${EMAIL}`)
console.log(`   TEST_PASSWORD  = ${password}`)
console.log('═══════════════════════════════════════════════════════════════\n')
console.log('Per il dev locale: copia gli stessi valori in .env.test\n')
