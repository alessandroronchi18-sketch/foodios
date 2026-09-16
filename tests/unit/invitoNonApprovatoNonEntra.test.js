// Chi è stato invitato ma non ancora approvato non entra dalle API.
//
// Il difetto, trovato il 16/09/2026 mentre si guardava il pannello admin. Le
// venti funzioni serverless che chiedono un accesso passano tutte da
// `verificaToken` in `api/lib/auth.js`, e quella guardava una cosa sola:
//
//     if (!profile?.organization_id) → «Account non configurato»
//
// Il database però la pensava diversamente. `get_user_org_id()`, la funzione
// su cui poggiano tutte le regole di isolamento, chiede
// `coalesce(approvato, true) = true`: per lei un profilo non approvato non
// appartiene a nessuna azienda.
//
// Le due porte dicevano il contrario l'una dell'altra, e la strada per finirci
// in mezzo è normale: chi riceve un invito e si registra viene creato da
// `handle_new_user` con `ruolo = 'dipendente'`, `approvato = false` e l'id
// dell'azienda che lo ha invitato. Da quel momento il database gli rifiutava
// ogni dato — l'app gli si apriva vuota — e le funzioni serverless lo
// accettavano: registrare una produzione, consumare il budget AI dell'azienda,
// avviare un pagamento. Un invito mandato per sbaglio restava buono per
// sempre, perché nessuno «disapprova» chi non è mai stato approvato.
//
// Quanto era grave il 16/09/2026: un invito in sospeso, e zero profili non
// approvati su 579. Non è mai successo. È il genere di difetto che si corregge
// quando costa niente, non quando è successo.
//
// I tre casi qui sotto sono quelli che contano: chi è fuori resta fuori, chi è
// dentro resta dentro, e il nullo non è un no.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkSupabase, mkReq } from '../helpers/supabaseAuthMock.js'

// `mkReq` vuole gli header veri, non un token: qui se ne fa uno valido una
// volta sola e si riusa in tutti i casi.
const RICHIESTA = () => mkReq({ Authorization: `Bearer ${'x'.repeat(40)}` })

const ORIG_ENV = { ...process.env }
let currentClient = null

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => currentClient,
}))

async function caricaModulo() {
  vi.resetModules()
  process.env = { ...ORIG_ENV }
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'service-key'
  return await import('../../api/lib/auth.js')
}

const profiloInvitato = {
  organization_id: 'org-di-chi-ha-invitato',
  approvato: false,
  ruolo: 'dipendente',
  email: 'invitato@test.it',
}

beforeEach(() => { currentClient = null })
afterEach(() => { process.env = { ...ORIG_ENV } })

describe('verificaToken guarda anche l\'approvazione, non solo l\'azienda', () => {
  it('l\'invitato non approvato viene respinto', async () => {
    const { verificaToken } = await caricaModulo()
    currentClient = mkSupabase({ profile: profiloInvitato })
    const r = await verificaToken(RICHIESTA())
    expect(r.user, 'un profilo non approvato non deve passare').toBeNull()
    expect(r.status).toBe(403)
    expect(r.error).toMatch(/approvazione/i)
  })

  it('il messaggio dice cosa fare, non solo che è andata male', async () => {
    // Lente del personale: chi legge questo messaggio è una persona vera al
    // primo giorno di lavoro. «Non autorizzato» la manda dal fornitore
    // sbagliato; «chiedi al titolare» la manda da chi può risolvere.
    const { verificaToken } = await caricaModulo()
    currentClient = mkSupabase({ profile: profiloInvitato })
    const r = await verificaToken(RICHIESTA())
    expect(r.error).toMatch(/titolare/i)
  })

  it('chi è approvato continua a entrare', async () => {
    // Il controllo opposto: se questo fallisce, la correzione ha chiuso fuori
    // tutti i clienti veri. Vale più degli altri due messi insieme.
    const { verificaToken } = await caricaModulo()
    currentClient = mkSupabase()
    const r = await verificaToken(RICHIESTA())
    expect(r.error, `un titolare approvato è stato respinto: ${r.error}`).toBeNull()
    expect(r.user).toBeTruthy()
  })

  it('`approvato` nullo vuol dire sì, come nel database', async () => {
    // `get_user_org_id()` fa `coalesce(approvato, true) = true`: una riga
    // vecchia, scritta prima che la colonna esistesse, è approvata. Se qui si
    // usasse `if (!profile.approvato)` invece di `=== false`, quelle righe
    // resterebbero chiuse fuori — il difetto opposto, e più costoso.
    const { verificaToken } = await caricaModulo()
    currentClient = mkSupabase({
      profile: { organization_id: 'org-id', approvato: null, ruolo: 'titolare', email: 'u@test.it' },
    })
    const r = await verificaToken(RICHIESTA())
    expect(r.error, 'una riga con approvato nullo non va chiusa fuori').toBeNull()
    expect(r.user).toBeTruthy()
  })

  it('senza azienda il messaggio resta quello di prima', async () => {
    // Quello che c\'era intorno: il controllo vecchio non deve essere stato
    // sostituito, ma affiancato. Sono due stati diversi e si dicono diversi.
    const { verificaToken } = await caricaModulo()
    currentClient = mkSupabase({
      profile: { organization_id: null, approvato: true, ruolo: 'titolare', email: 'u@test.it' },
    })
    const r = await verificaToken(RICHIESTA())
    expect(r.error).toBe('Account non configurato')
  })
})
