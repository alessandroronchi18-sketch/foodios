// La cassa entra in Foodos con una chiave sua, non con una uguale per tutti.
//
// Com'era fino al 14/09/2026: il webhook delle casse (`/api/webhook-pos`)
// chiedeva una parola d'ordine **per marca di cassa** — una per Tilby, una per
// RCH — e l'attività a cui scrivere gli incassi arrivava scritta a parte,
// nell'intestazione `x-organization-id`, e veniva creduta sulla parola. Quindi
// chi aveva la parola d'ordine di una marca poteva scrivere incassi nella
// cassa di qualsiasi cliente Foodos: bastava cambiare quell'id.
//
// Com'è adesso: ogni attività ha la sua chiave, nel database c'è solo la sua
// impronta, e dalla chiave si risale all'organizzazione. Questi test tengono
// ferme le tre cose che non devono più tornare indietro:
//   1. nel codice del webhook non c'è più nessun segreto per marca;
//   2. l'organizzazione si prende dalla chiave, non dall'intestazione;
//   3. la funzione che genera la chiave non accetta un'organizzazione da fuori.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

const POS = leggi('api', 'webhook-pos.js')
const ZUC = leggi('api', 'webhook-zucchetti.js')
const LIB = leggi('api', 'lib', 'webhookToken.js')

const DIR_MIGR = join(RADICE, 'supabase', 'migrations')
const MIGR = readFileSync(
  join(DIR_MIGR, readdirSync(DIR_MIGR).find(f => f.includes('webhook_token_per_cliente'))),
  'utf8',
)

describe('non esiste più una parola d\'ordine uguale per tutti i clienti', () => {
  it('nel webhook delle casse non c\'è nessun segreto per marca', () => {
    for (const testo of [POS, ZUC]) {
      expect(testo).not.toMatch(/PROVIDER_SECRET_ENV/)
      expect(testo).not.toMatch(/process\.env\.POS_[A-Z]+_SECRET/)
      expect(testo).not.toMatch(/process\.env\[/)
      expect(testo).not.toMatch(/ZUCCHETTI_WEBHOOK_SECRET/)
    }
  })

  it('nessuno dei due webhook usa più il confronto con un segreto fisso', () => {
    for (const testo of [POS, ZUC]) {
      expect(testo).not.toMatch(/verifyRawSecret|verifyBearerSecret/)
    }
  })
})

describe('l\'organizzazione si deduce dalla chiave', () => {
  it('l\'id che arriva nell\'intestazione non viene mai usato per scrivere', () => {
    for (const testo of [POS, ZUC]) {
      // L'unico posto dove compare `x-organization-id` è il confronto: se
      // finisse dentro `orgId` tornerebbe il buco di prima.
      expect(testo).not.toMatch(/orgId\s*=\s*sanitizeStrict\(\s*(req|request)\.headers\.get\('x-organization-id'/)
      expect(testo).toMatch(/orgId\s*=\s*auth\.organizationId/)
    }
  })

  it('se la cassa dichiara un\'altra organizzazione la richiesta è respinta', () => {
    for (const testo of [POS, ZUC]) {
      expect(testo).toMatch(/dichiarata !== orgId/)
      expect(testo).toMatch(/403/)
    }
  })

  it('senza chiave valida si esce subito, prima di toccare il database', () => {
    for (const testo of [POS, ZUC]) {
      const iAuth = testo.indexOf('risolviToken')
      const iScrittura = testo.search(/\.insert\(|\.update\(/)
      expect(iAuth, 'manca la risoluzione della chiave').toBeGreaterThan(-1)
      expect(iAuth).toBeLessThan(iScrittura)
    }
  })
})

describe('la chiave non si conserva mai in chiaro', () => {
  it('nel database va l\'impronta SHA-256, e il chiaro non è salvato', () => {
    expect(MIGR).toMatch(/token_hash\s+text not null unique/)
    expect(MIGR).toMatch(/digest\(v_token, 'sha256'\)/)
    expect(MIGR).not.toMatch(/token\s+text not null[^_]/)
  })

  it('il webhook confronta l\'impronta, non la chiave', () => {
    expect(LIB).toMatch(/crypto\.subtle\.digest\('SHA-256'/)
    expect(LIB).toMatch(/\.eq\('token_hash', hash\)/)
    expect(LIB).toMatch(/\.is\('revocato_il', null\)/)
  })

  it('una chiave troppo corta è rifiutata senza nemmeno interrogare il database', async () => {
    const { risolviToken } = await import('../../api/lib/webhookToken.js')
    let interrogato = false
    const finto = { from() { interrogato = true; return finto },
      select: () => finto, eq: () => finto, is: () => finto, maybeSingle: async () => ({ data: null }) }
    const r = await risolviToken(finto, 'corta', 'tilby')
    expect(r.ok).toBe(false)
    expect(interrogato).toBe(false)
  })
})

describe('la chiave di una marca non vale per un\'altra', () => {
  it('se la marca non corrisponde la richiesta è respinta', async () => {
    const { risolviToken, impronta } = await import('../../api/lib/webhookToken.js')
    const token = 'a'.repeat(64)
    const finto = {
      from: () => finto, select: () => finto, eq: () => finto, is: () => finto,
      maybeSingle: async () => ({ data: { id: 'x', organization_id: 'org-1', provider: 'rch' } }),
    }
    expect(await impronta(token)).toHaveLength(64)
    expect((await risolviToken(finto, token, 'tilby')).ok).toBe(false)
    const buona = await risolviToken(finto, token, 'rch')
    expect(buona.ok).toBe(true)
    expect(buona.organizationId).toBe('org-1')
  })

  it('una chiave sconosciuta non passa', async () => {
    const { risolviToken } = await import('../../api/lib/webhookToken.js')
    const finto = { from: () => finto, select: () => finto, eq: () => finto, is: () => finto,
      maybeSingle: async () => ({ data: null }) }
    expect((await risolviToken(finto, 'b'.repeat(64), 'tilby')).ok).toBe(false)
  })

  it('se la lettura del database fallisce non si entra lo stesso', async () => {
    const { risolviToken } = await import('../../api/lib/webhookToken.js')
    const finto = { from: () => finto, select: () => finto, eq: () => finto, is: () => finto,
      maybeSingle: async () => ({ error: { message: 'giù' }, data: null }) }
    expect((await risolviToken(finto, 'c'.repeat(64), 'tilby')).ok).toBe(false)
  })
})

describe('la marca della cassa', () => {
  it('le scritture con la maiuscola continuano a funzionare', async () => {
    const { normalizzaProvider } = await import('../../api/webhook-pos.js')
    expect(normalizzaProvider('cassainCloud')).toBe('cassaincloud')
    expect(normalizzaProvider('  TILBY ')).toBe('tilby')
  })

  it('una marca che non conosciamo non passa', async () => {
    const { normalizzaProvider } = await import('../../api/webhook-pos.js')
    expect(normalizzaProvider('cassa-del-vicino')).toBe(null)
    expect(normalizzaProvider('')).toBe(null)
    expect(normalizzaProvider(null)).toBe(null)
  })
})

describe('chi può creare una chiave', () => {
  it('l\'organizzazione la decide il database, non chi chiama', () => {
    expect(MIGR).toMatch(/v_org\s+uuid := public\.get_user_org_id\(\)/)
    // L'unico parametro è la marca: non c'è modo di indicare un'altra azienda.
    expect(MIGR).toMatch(/function public\.webhook_token_genera\(p_provider text\)/)
    expect(MIGR).not.toMatch(/webhook_token_genera\([^)]*uuid/)
  })

  it('senza organizzazione, e per un dipendente, si alza un\'eccezione', () => {
    expect(MIGR).toMatch(/if v_org is null then raise exception/)
    expect(MIGR).toMatch(/is_dipendente\(\) then raise exception/)
  })

  it('generarne una nuova spegne la precedente', () => {
    expect(MIGR).toMatch(/set revocato_il = now\(\)/)
    expect(MIGR).toMatch(/create unique index[\s\S]*?on public\.webhook_token \(organization_id, provider\)[\s\S]*?where revocato_il is null/)
  })

  it('la chiave non si genera con la sola chiave pubblica del sito', () => {
    expect(MIGR).toMatch(/revoke execute on function public\.webhook_token_genera\(text\) from public, anon/)
    expect(MIGR).toMatch(/grant execute on function public\.webhook_token_genera\(text\) to authenticated/)
  })

  it('dal browser la tabella si legge soltanto, e solo la propria', () => {
    expect(MIGR).toMatch(/revoke all on public\.webhook_token from anon, authenticated/)
    expect(MIGR).toMatch(/grant select on public\.webhook_token to authenticated/)
    expect(MIGR).toMatch(/organization_id = public\.get_user_org_id\(\)/)
    expect(MIGR).toMatch(/alter table public\.webhook_token enable row level security/)
  })

  it('il search_path arriva fino a dove vivono le funzioni di cifratura', () => {
    // pgcrypto sta nello schema `extensions`: con `set search_path = public` e
    // basta, `digest` e `gen_random_bytes` non si trovano e la funzione muore
    // al primo utilizzo vero.
    expect(MIGR).toMatch(/set search_path = public, extensions/)
  })
})

describe('la pagina Integrazioni sa far creare la chiave', () => {
  const UI = leggi('src', 'components', 'Integrazioni.jsx')

  it('chiama la funzione del database passando solo la marca', () => {
    expect(UI).toMatch(/supabase\.rpc\('webhook_token_genera', \{ p_provider: provider \}\)/)
  })

  it('avvisa che la chiave si vede una volta sola', () => {
    expect(UI).toMatch(/non si rivede più/)
  })

  it('ogni marca con il collegamento in tempo reale ha la sua etichetta', () => {
    for (const p of ['tilby', 'cassaincloud', 'rch', 'olivetti', 'custom', 'salvi', 'indaco', 'polotouch', 'ekopos', 'wolf', 'zucchetti']) {
      expect(UI, `manca providerWebhook: '${p}'`).toContain(`providerWebhook: '${p}'`)
    }
  })

  it('le marche mostrate a schermo sono quelle che il webhook accetta', async () => {
    const { PROVIDER_VALIDI } = await import('../../api/webhook-pos.js')
    const mostrate = [...UI.matchAll(/providerWebhook: '([a-z]+)'/g)].map(m => m[1])
    for (const p of mostrate) expect(PROVIDER_VALIDI, `${p} non è accettata dal webhook`).toContain(p)
  })

  it('Zucchetti va al suo indirizzo, le altre a quello universale', () => {
    expect(UI).toMatch(/providerWebhook === 'zucchetti' \? '\/api\/webhook-zucchetti' : '\/api\/webhook-pos'/)
  })

  it('a schermo non si chiede più un segreto da copiare dalle variabili Vercel', () => {
    expect(UI).not.toMatch(/ZUCCHETTI_WEBHOOK_SECRET/)
    expect(UI).not.toMatch(/chiedi a Foodos/)
  })
})
