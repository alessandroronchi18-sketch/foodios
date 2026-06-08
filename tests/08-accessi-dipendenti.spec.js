// @ts-check
// FLUSSO ACCESSI DIPENDENTI end-to-end (a livello DB, niente browser):
//   1. Senza invito → chi si registra ottiene una NUOVA org come titolare (isolato).
//   2. Con invito (email pre-autorizzata dal titolare) → la registrazione UNISCE
//      all'org del titolare come dipendente NON approvato (approvato=false).
//   3. Dipendente non approvato = accesso ZERO (get_user_org_id null → RLS nega
//      sedi/user_data), ma può leggere il PROPRIO profilo (per la schermata "in attesa").
//   4. Il titolare attiva (approvato=true) → il dipendente ora legge i dati dell'org.
//   5. Ricette: il dipendente legge il ricettario SOLO via RPC fos_ricettario_dip,
//      SENZA ingredienti/costi; la lettura raw del ricettario è negata.
//
// Gira se ci sono: SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY.

import { test, expect } from '@playwright/test'
import { hasDbEnv, serviceClient, createEphemeralOrg, signInClient, cleanupOrg } from './helpers/db.js'

async function attendiProfilo(svc, userId) {
  for (let i = 0; i < 50; i++) {   // ~15s: il trigger handle_new_user è asincrono
    await new Promise(r => setTimeout(r, 300))
    const { data } = await svc.from('profiles').select('organization_id, ruolo, approvato').eq('id', userId).maybeSingle()
    if (data?.organization_id) return data
  }
  return null
}

test.describe('Accessi dipendenti — invito, attesa, attivazione', () => {
  test.skip(!hasDbEnv, 'Servono SUPABASE_URL + SUPABASE_SERVICE_KEY + VITE_SUPABASE_ANON_KEY')

  test('solo le email invitate entrano, come dipendente in attesa finché il titolare non attiva', async () => {
    const svc = serviceClient()
    let titolare = null
    const effimeri = []     // userId da cancellare
    const orgEffimere = []  // org da cancellare (oltre a quella del titolare)
    try {
      titolare = await createEphemeralOrg(svc, 'acc-titolare')
      expect(titolare.orgId).toBeTruthy()

      // ── 1) Registrazione SENZA invito → org propria, ruolo titolare ───────────
      const uniqX = `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const estraneoEmail = `e2e-estraneo-${uniqX}@foodios-e2e.test`
      const estraneoPwd = `E2e!${uniqX}Aa1`
      const { data: exU } = await svc.auth.admin.createUser({ email: estraneoEmail, password: estraneoPwd, email_confirm: true })
      effimeri.push(exU.user.id)
      const exProf = await attendiProfilo(svc, exU.user.id)
      if (exProf?.organization_id) orgEffimere.push(exProf.organization_id)
      expect(exProf?.ruolo).toBe('titolare')
      expect(exProf?.organization_id).not.toBe(titolare.orgId)   // NON è entrato nell'azienda altrui
      expect(exProf?.approvato).toBe(true)

      // ── 2) Il titolare invita un'email → registrazione con QUELLA email ───────
      const uniqD = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const dipEmail = `e2e-dip-${uniqD}@foodios-e2e.test`
      const dipPwd = `E2e!${uniqD}Aa1`
      const ins = await svc.from('org_inviti').insert({ organization_id: titolare.orgId, email: dipEmail, ruolo: 'dipendente', invited_by: titolare.userId })
      expect(ins.error).toBeFalsy()

      const { data: dU } = await svc.auth.admin.createUser({ email: dipEmail, password: dipPwd, email_confirm: true })
      effimeri.push(dU.user.id)
      const dipProf = await attendiProfilo(svc, dU.user.id)
      expect(dipProf?.organization_id, 'il dipendente è unito all\'org del titolare').toBe(titolare.orgId)
      expect(dipProf?.ruolo).toBe('dipendente')
      expect(dipProf?.approvato, 'parte NON approvato (in attesa)').toBe(false)
      // invito marcato accettato
      const { data: invDopo } = await svc.from('org_inviti').select('stato').eq('organization_id', titolare.orgId).ilike('email', dipEmail).maybeSingle()
      expect(invDopo?.stato).toBe('accettato')

      // ── 3) Dipendente NON approvato = accesso ZERO, ma legge il proprio profilo ─
      const dipClient = await signInClient(dipEmail, dipPwd)
      const { data: sediBloccate } = await dipClient.from('sedi').select('id').eq('organization_id', titolare.orgId)
      expect((sediBloccate || []).length, 'in attesa: niente accesso alle sedi').toBe(0)
      const { data: udBloccato } = await dipClient.from('user_data').select('id').eq('organization_id', titolare.orgId)
      expect((udBloccato || []).length, 'in attesa: niente accesso a user_data').toBe(0)
      const { data: selfProf } = await dipClient.from('profiles').select('approvato').eq('id', dU.user.id).maybeSingle()
      expect(selfProf, 'può leggere il proprio profilo (schermata in attesa)').toBeTruthy()
      expect(selfProf?.approvato).toBe(false)

      // ── 4) Il titolare attiva → il dipendente ora accede ──────────────────────
      const titClient = titolare.userClient
      const upd = await titClient.from('profiles').update({ approvato: true }).eq('id', dU.user.id)
      expect(upd.error, 'il titolare può attivare il dipendente').toBeFalsy()
      // sanity: l'update è effettivo lato DB (service role)
      const { data: chk } = await svc.from('profiles').select('approvato').eq('id', dU.user.id).maybeSingle()
      expect(chk?.approvato, 'approvato=true persistito').toBe(true)
      await new Promise(r => setTimeout(r, 500))   // settle prima del nuovo sign-in

      const dipClient2 = await signInClient(dipEmail, dipPwd)   // nuovo token, profilo ora approvato
      const { data: sediOk } = await dipClient2.from('sedi').select('id').eq('organization_id', titolare.orgId)
      expect((sediOk || []).length, 'attivato: vede le sedi dell\'org').toBeGreaterThan(0)

      // ── 5) Ricette: solo via RPC e SENZA ingredienti/costi; raw negato ────────
      const ricettario = {
        ingredienti_costi: { farina: { costoKg: 1.2, costoG: 0.0012 } },
        ricette: { 'TORTA TEST': { nome: 'TORTA TEST', prezzo: 20, unita: 8, tipo: 'fetta', ingredienti: [{ nome: 'farina', qty1stampo: 500 }] } },
      }
      const seedRic = await svc.from('user_data').insert({ organization_id: titolare.orgId, sede_id: null, data_key: 'pasticceria-ricettario-v1', data_value: ricettario, updated_at: new Date().toISOString() })
      expect(seedRic.error).toBeFalsy()

      // raw: negato anche al dipendente approvato (chiave sensibile)
      const { data: ricRaw } = await dipClient2.from('user_data').select('id').eq('organization_id', titolare.orgId).eq('data_key', 'pasticceria-ricettario-v1')
      expect((ricRaw || []).length, 'lettura raw ricettario negata al dipendente').toBe(0)

      // RPC: ricettario sanitizzato
      const { data: ricRpc, error: rpcErr } = await dipClient2.rpc('fos_ricettario_dip')
      expect(rpcErr).toBeFalsy()
      expect(ricRpc?.ricette?.['TORTA TEST'], 'la ricetta c\'è (nome/prezzo)').toBeTruthy()
      expect(ricRpc.ricette['TORTA TEST'].prezzo).toBe(20)
      expect(ricRpc.ricette['TORTA TEST'].ingredienti, 'NESSUN ingrediente esposto').toBeUndefined()
      expect(ricRpc.ingredienti_costi, 'NESSUN costo ingredienti esposto').toBeUndefined()

      // il TITOLARE invece vede tutto (raw)
      const { data: ricTit } = await titClient.from('user_data').select('data_value').eq('organization_id', titolare.orgId).eq('data_key', 'pasticceria-ricettario-v1').maybeSingle()
      expect(ricTit?.data_value?.ricette?.['TORTA TEST']?.ingredienti?.length, 'il titolare vede gli ingredienti').toBeGreaterThan(0)
    } finally {
      for (const uid of effimeri) { try { await svc.auth.admin.deleteUser(uid) } catch { /* noop */ } }
      for (const oid of orgEffimere) { try { await svc.from('organizations').delete().eq('id', oid) } catch { /* noop */ } }
      await cleanupOrg(svc, titolare)
    }
  })
})
