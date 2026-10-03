// ── La mappa «società → sedi» sul database, e lo spostamento confermato ──
//
// La regola sta in `societaSedi.js` (pura, provata). Qui solo le letture e
// le scritture: la mappa vive in `user_data` con una chiave condivisa da
// tutta l'azienda, e ogni modifica rilegge prima di scrivere.
//
// Perché rileggere: la mappa la toccano due strade — la domanda durante un
// caricamento (Scadenzario o Integrazioni) e la pagina Impostazioni. Scrivere
// la copia che si aveva in mano cancellerebbe in silenzio la società appena
// aggiunta dall'altra parte. Si usa il salvataggio con la versione: se nel
// frattempo qualcuno ha scritto, si rilegge, si riapplica e si riprova.
import { supabase as clientePredefinito } from './supabase'
import { sloadWithVersion, ssaveVersioned } from './storage'
import { SK_SOCIETA_SEDI } from './storageKeys'
import { leggiMappa, unisciMappa, patchSpostamento } from './societaSedi'
import { colonnaMancante } from './fattureImport'

/**
 * La mappa dell'azienda, ripulita. Vuota se non c'è ancora.
 *
 * Se la lettura non riesce LANCIA, invece di restituire una mappa vuota come
 * farebbe `sload`: «nessuna società» e «non so» non sono la stessa cosa, e la
 * pagina Impostazioni deve poterlo dire.
 */
export async function caricaSocieta(orgId, supabase = clientePredefinito) {
  if (!orgId) return {}
  const { data, error } = await supabase.from('user_data')
    .select('data_value')
    .eq('organization_id', orgId)
    .eq('data_key', SK_SOCIETA_SEDI)
    .is('sede_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message || 'lettura non riuscita')
  return leggiMappa(data?.[0]?.data_value)
}

/**
 * Applica una modifica alla mappa più recente e la salva.
 * @param {(mappa: object) => object} modifica  riceve la mappa appena letta
 * @returns {Promise<object>} la mappa salvata
 */
export async function aggiornaSocieta(orgId, modifica, { tentativi = 3 } = {}) {
  if (!orgId) throw new Error('Manca l\'azienda.')
  for (let i = 0; i < tentativi; i++) {
    const { value, version } = await sloadWithVersion(SK_SOCIETA_SEDI, orgId, null)
    const nuova = leggiMappa(modifica(leggiMappa(value)))
    const v = await ssaveVersioned(SK_SOCIETA_SEDI, nuova, orgId, null, version)
    if (v != null) return nuova
  }
  throw new Error('Qualcun altro sta cambiando le società proprio adesso: riprova fra un attimo.')
}

/** Aggiunge le risposte date durante un caricamento, senza toccare le altre. */
export function ricordaSocieta(orgId, voci) {
  return aggiornaSocieta(orgId, m => unisciMappa(m, voci))
}

/**
 * Le fatture in archivio che sanno di quale società sono.
 * `colonna: false` se il database non ha ancora `cessionario_piva` (la
 * migration del 03/10/2026 non è applicata): allora non c'è niente da
 * proporre, e lo si dice invece di mostrare zero.
 */
export async function fattureConSocieta(supabase, orgId) {
  const fatture = []
  const PAGINA = 1000
  for (let offset = 0; offset < 200000; offset += PAGINA) {
    const { data, error } = await supabase.from('fatture')
      .select('id, sede_id, sedi_condivise, cessionario_piva, totale')
      .eq('organization_id', orgId)
      .not('cessionario_piva', 'is', null)
      .order('id')
      .range(offset, offset + PAGINA - 1)
    if (error) {
      if (colonnaMancante(error) === 'cessionario_piva') return { colonna: false, fatture: [] }
      throw new Error(error.message)
    }
    fatture.push(...(data || []))
    if (!data || data.length < PAGINA) break
  }
  return { colonna: true, fatture }
}

/**
 * Sposta le fatture di un gruppo della proposta, dopo il sì del titolare.
 * Tocca solo `sede_id` e `sedi_condivise`: numero, totale, pagamenti restano
 * dove sono. E solo le fatture che sono ancora di quella società (se nel
 * frattempo qualcuno ha corretto la P.IVA a mano, quella resta ferma).
 *
 * @returns {Promise<{ spostate: number, errori: string[] }>}
 */
export async function spostaFatture(supabase, orgId, gruppo, { onProgresso } = {}) {
  const patch = patchSpostamento(gruppo)
  let spostate = 0
  const errori = []
  const BLOCCO = 100
  for (let i = 0; i < gruppo.ids.length; i += BLOCCO) {
    const ids = gruppo.ids.slice(i, i + BLOCCO)
    const { data, error } = await supabase.from('fatture')
      .update(patch)
      .eq('organization_id', orgId)
      .eq('cessionario_piva', gruppo.piva)
      .in('id', ids)
      .select('id')
    if (error) errori.push(error.message)
    else spostate += (data || []).length
    onProgresso?.(Math.min(i + BLOCCO, gruppo.ids.length), gruppo.ids.length)
  }
  return { spostate, errori }
}
