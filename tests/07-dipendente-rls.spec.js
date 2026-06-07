// @ts-check
// RLS ruolo DIPENDENTE: un utente con ruolo='dipendente' NON deve poter LEGGERE
// i dati sensibili della propria org (chiavi user_data sensibili, tabella
// dipendenti=stipendi, fornitori, fatture), MA deve poter leggere le chiavi
// operative che gli servono (magazzino). Barriera vera a livello DB (RLS),
// indipendente dal gate UI. Self-contained: crea un'org effimera + un dipendente
// nella stessa org, semina via service key, verifica, ripulisce.
//
// Gira se ci sono: SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY.

import { test, expect } from '@playwright/test'
import { hasDbEnv, serviceClient, createEphemeralOrg, createDipendenteIn, cleanupOrg } from './helpers/db.js'

// Chiavi user_data sensibili: il dipendente NON deve leggerle (vedi is_chiave_sensibile).
const CHIAVI_SENSIBILI = [
  'pasticceria-ai-v1',
  'pl-costi-fissi-v1',
  'menu-giorno-v1',
  'pasticceria-organigramma-v1',
  'azienda-pagamenti-v1',
]
// Chiave operativa di controllo: il dipendente DEVE poterla leggere.
const CHIAVE_OPERATIVA = 'pasticceria-magazzino-v1'

test.describe('RLS ruolo dipendente — niente lettura dati sensibili', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  test('il dipendente non legge dati sensibili ma legge gli operativi', async () => {
    const svc = serviceClient()
    let titolare = null, dip = null
    try {
      titolare = await createEphemeralOrg(svc, 'rls-titolare')
      expect(titolare.orgId).toBeTruthy()
      dip = await createDipendenteIn(svc, titolare.orgId, 'rls-dip')
      expect(dip.userId).toBeTruthy()

      // ── seed via service key (bypassa RLS) ────────────────────────────────
      const now = new Date().toISOString()
      const seedKey = (k) => svc.from('user_data').insert({
        organization_id: titolare.orgId, sede_id: null,
        data_key: k, data_value: { secret: `valore ${k}` }, updated_at: now,
      })
      for (const k of CHIAVI_SENSIBILI) {
        const { error } = await seedKey(k)
        expect(error, `seed ${k}`).toBeFalsy()
      }
      const { error: opErr } = await svc.from('user_data').insert({
        organization_id: titolare.orgId, sede_id: titolare.sedeId,
        data_key: CHIAVE_OPERATIVA, data_value: { giacenze: [{ nome: 'FARINA', qta: 10 }] }, updated_at: now,
      })
      expect(opErr, 'seed operativa').toBeFalsy()

      // Tabella dipendenti (stipendi) + fornitori (best-effort se esistono).
      const { error: dipErr } = await svc.from('dipendenti').insert({
        organization_id: titolare.orgId, nome: 'Mario Stipendio', costo_orario: 99, attivo: true,
      })
      expect(dipErr, 'seed dipendenti').toBeFalsy()
      let fornitoriSeeded = false
      try {
        const { error } = await svc.from('fornitori').insert({ organization_id: titolare.orgId, nome: 'Fornitore Segreto' })
        fornitoriSeeded = !error
      } catch { /* tabella assente: salto la sotto-asserzione */ }

      // ── verifica come DIPENDENTE (RLS attive) ─────────────────────────────
      const readKey = async (k) => {
        const { data } = await dip.userClient.from('user_data').select('data_key').eq('organization_id', titolare.orgId).eq('data_key', k)
        return (data || []).length
      }

      // 1) chiavi sensibili → 0 righe (bloccate)
      for (const k of CHIAVI_SENSIBILI) {
        expect(await readKey(k), `dipendente NON deve leggere ${k}`).toBe(0)
      }

      // 2) chiave operativa → leggibile (controllo: la RLS non blocca tutto)
      expect(await readKey(CHIAVE_OPERATIVA), 'dipendente DEVE leggere magazzino').toBe(1)

      // 3) tabella dipendenti (stipendi) → 0 righe per il dipendente
      const { data: dipRows } = await dip.userClient.from('dipendenti').select('id').eq('organization_id', titolare.orgId)
      expect((dipRows || []).length, 'dipendente NON deve leggere gli stipendi').toBe(0)
      // sanity: il dato esiste davvero (visto dal service role)
      const { data: dipRowsSvc } = await svc.from('dipendenti').select('id').eq('organization_id', titolare.orgId)
      expect((dipRowsSvc || []).length).toBeGreaterThan(0)

      // 4) fornitori → 0 righe per il dipendente (se la tabella è stata seminata)
      if (fornitoriSeeded) {
        const { data: fornRows } = await dip.userClient.from('fornitori').select('id').eq('organization_id', titolare.orgId)
        expect((fornRows || []).length, 'dipendente NON deve leggere i fornitori').toBe(0)
      }

      // 5) INSERT di una chiave sensibile da parte del dipendente → bloccato (with check)
      const { error: insErr } = await dip.userClient.from('user_data').insert({
        organization_id: titolare.orgId, sede_id: null,
        data_key: 'pasticceria-ai-v1', data_value: { hack: true }, updated_at: now,
      })
      expect(insErr, 'insert sensibile da dipendente deve fallire').toBeTruthy()
    } finally {
      await cleanupOrg(svc, dip)
      await cleanupOrg(svc, titolare)
    }
  })
})
