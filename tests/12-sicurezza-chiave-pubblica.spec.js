// @ts-check
// Quello che si può fare con la sola chiave pubblica del sito: niente.
//
// La chiave `anon` sta dentro il sito: chiunque apra il sorgente della pagina
// ce l'ha. Il 14/09/2026 un audit ha trovato che con quella chiave si poteva:
//
//   - sovrascrivere ricettario, magazzino, produzione e chiusure di
//     un'attività, conoscendone l'id (`fos_user_data_set_batch` si fidava del
//     parametro `p_org` quando non c'era un utente loggato);
//   - alterare lo stock dei prodotti finiti (`applica_delta_stock_pf`);
//   - cancellare tutto il registro delle modifiche (`cleanup_audit_log` con
//     `retain_days = 0`);
//   - annullare, inviare e ricevere trasferimenti fra sedi: il controllo di
//     proprietà era `x <> get_user_org_id()`, che per un anonimo diventa
//     `x <> NULL`, cioè NULL, e un `if` con condizione NULL non scatta.
//
// Questo test rifà quelle chiamate e pretende che vengano respinte. Non serve
// nessun account: basta la chiave pubblica, che è il punto.

import { test, expect } from '@playwright/test'

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

const ORG_FINTA = '00000000-0000-0000-0000-000000000000'
const ID_FINTO = '11111111-1111-1111-1111-111111111111'

async function chiama(percorso, corpo) {
  const r = await fetch(`${URL}/rest/v1/${percorso}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  return { stato: r.status, corpo: await r.json().catch(() => ({})) }
}

test.describe('con la sola chiave pubblica non si fa niente', () => {
  test.skip(!URL || !ANON, 'servono SUPABASE_URL e SUPABASE_ANON_KEY')

  test('non si leggono i dati di lavoro di nessuno', async () => {
    const r = await fetch(`${URL}/rest/v1/user_data?select=*&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
    const corpo = await r.json().catch(() => ({}))
    // O permesso negato sulla tabella, o nessuna riga: mai un dato.
    if (Array.isArray(corpo)) expect(corpo.length).toBe(0)
    else expect(corpo.code).toBe('42501')
  })

  test('non si scrive nei dati di lavoro di un\'altra azienda', async () => {
    const { corpo } = await chiama('rpc/fos_user_data_set_batch', {
      p_items: [{ data_key: 'pasticceria-magazzino-v1', sede_id: null, data_value: { intruso: true } }],
      p_org: ORG_FINTA,
    })
    expect(corpo.code).toBe('42501')
    expect(String(corpo.message || '')).toContain('permission denied')
  })

  test('non si cancella il registro delle modifiche', async () => {
    const { corpo } = await chiama('rpc/cleanup_audit_log', { retain_days: 0 })
    expect(corpo.code).toBe('42501')
  })

  test('non si tocca lo stock dei prodotti finiti', async () => {
    // Sei parametri, non cinque: con cinque l'API non sa quale delle due
    // versioni scegliere e risponde prima di arrivare al permesso.
    const { corpo } = await chiama('rpc/applica_delta_stock_pf', {
      p_org: ORG_FINTA, p_sede: ID_FINTO, p_prodotto: 'X', p_delta: 999, p_unita: 'pz', p_dipendente_op: null,
    })
    expect(corpo.code).toBe('42501')
  })

  test('non si comandano i trasferimenti fra sedi', async () => {
    const annulla = await chiama('rpc/trasferimento_annulla', { p_id: ID_FINTO, p_dipendente_op: null })
    expect(String(annulla.corpo.message || '')).toContain('Utente senza organizzazione')

    const ricevi = await chiama('rpc/trasferimento_ricevi', {
      p_id: ID_FINTO, p_quantita_ricevuta: 1, p_scarto_note: null, p_dipendente_op: null,
    })
    expect(String(ricevi.corpo.message || '')).toContain('Utente senza organizzazione')
  })

  test('non si leggono le chiavi delle casse', async () => {
    // Con la chiave di un cliente si scriverebbero incassi nella sua cassa.
    // Nella tabella c'è solo l'impronta, ma non deve uscire nemmeno quella.
    const r = await fetch(`${URL}/rest/v1/webhook_token?select=*&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    })
    const corpo = await r.json().catch(() => ({}))
    if (Array.isArray(corpo)) expect(corpo.length).toBe(0)
    else expect(corpo.code).toBe('42501')
  })

  test('non si genera la chiave di una cassa senza account', async () => {
    const { corpo } = await chiama('rpc/webhook_token_genera', { p_provider: 'tilby' })
    expect(corpo.code).toBe('42501')
    expect(String(corpo.message || '')).toContain('permission denied')
  })

  test('non si inserisce una fattura in un\'azienda altrui', async () => {
    const { corpo } = await chiama('fatture', { fornitore: 'intruso', totale: 1, organization_id: ORG_FINTA })
    expect(['42501', '23503']).toContain(corpo.code)
  })
})
