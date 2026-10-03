// ── Caricare gli XML delle fatture: un percorso solo ────────────────────
//
// Prima c'erano due strade, e ognuna aveva i suoi buchi: la pagina
// Integrazioni apriva lo ZIP ma ignorava le fatture firmate dentro; lo
// Scadenzario accettava i `.p7m` ma li leggeva come testo, quindi fallivano
// sempre. E tutte e due scartavano le fatture già presenti, righe comprese.
// Ora passano entrambe da qui.
import { leggiFattureDaFile } from './fattureXmlArchivio'
import {
  abbinaFatture, fattureEsistentiPerAbbinare, applicaCompletamenti,
  completaAnagraficaFornitori, righeNuove,
} from './completaFatture'
import { insertFattureResilient } from './fattureImport'

const COLONNE_FORNITORE = 'id, nome, partita_iva, codice_fiscale, indirizzo, cap, citta, provincia, email, telefono'

/**
 * @param {object} supabase
 * @param {{ orgId: string, sedeId?: string|null, sediCondivise?: string[]|null,
 *   files: {name: string, arrayBuffer: () => Promise<ArrayBuffer>}[],
 *   onProgresso?: (fase: string, fatto: number, totale: number) => void }} opz
 */
export async function importaFattureXml(supabase, { orgId, sedeId = null, sediCondivise = null, files, onProgresso }) {
  const esito = {
    lette: 0, saltati: 0, illeggibili: [], troncato: false, fileFalliti: [],
    completate: 0, nuove: 0, giaPresenti: 0, ambigue: [], errori: [],
    fornitoriCompletati: 0, recordsToccati: [],
  }

  // 1. Leggere tutto
  const records = []
  const lista = Array.from(files || [])
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i]
    onProgresso?.('lettura', i, lista.length)
    try {
      const r = await leggiFattureDaFile(f.name, new Uint8Array(await f.arrayBuffer()))
      records.push(...r.records)
      esito.lette += r.fatture
      esito.saltati += r.saltati
      esito.illeggibili.push(...r.illeggibili)
      esito.troncato ||= r.troncato
    } catch (e) {
      esito.fileFalliti.push({ file: f.name, messaggio: e?.message || 'non leggibile' })
    }
  }
  if (!records.length) return esito

  // 2. Abbinare alle fatture che ci sono già
  const esistenti = await fattureEsistentiPerAbbinare(supabase, orgId)
  const ab = abbinaFatture(records, esistenti)
  esito.ambigue = ab.ambigue
  esito.giaPresenti = ab.giaComplete + ab.doppieNelFile

  // 3. Completare
  const comp = await applicaCompletamenti(supabase, orgId, ab.completa, {
    onProgresso: (fatto, tot) => onProgresso?.('completamento', fatto, tot),
  })
  esito.completate = comp.fatte
  esito.errori.push(...comp.errori)

  // 4. Creare le nuove. Il database ha l'ultima parola sui doppioni.
  onProgresso?.('nuove', 0, ab.nuove.length)
  const ins = await insertFattureResilient(supabase, righeNuove(ab.nuove, orgId, sedeId, sediCondivise))
  esito.nuove = ins.inserite
  esito.giaPresenti += ins.gia

  esito.recordsToccati = [...ab.completa.map(c => c.record), ...ab.nuove]

  // 5. L'anagrafica dei fornitori, solo dove è vuota. Se non si riesce, le
  // fatture sono comunque entrate: lo si dice, non si annulla niente.
  try {
    const { data: fornitori, error } = await supabase.from('fornitori').select(COLONNE_FORNITORE).eq('organization_id', orgId)
    if (error) throw error
    for (const p of completaAnagraficaFornitori(fornitori || [], records)) {
      const { error: e } = await supabase.from('fornitori').update(p.patch).eq('id', p.id).eq('organization_id', orgId)
      if (!e) esito.fornitoriCompletati++
    }
  } catch (e) {
    esito.errori.push({ id: null, numero: null, messaggio: 'Anagrafica fornitori non aggiornata: ' + (e?.message || '') })
  }

  return esito
}

/** Il riepilogo in una frase, com'è scritto a schermo. */
export function fraseEsitoXml(e) {
  const pezzi = []
  if (e.completate) pezzi.push(`${e.completate.toLocaleString('it-IT')} ${e.completate === 1 ? 'fattura completata' : 'fatture completate'} con righe e dati del fornitore`)
  if (e.nuove) pezzi.push(`${e.nuove.toLocaleString('it-IT')} ${e.nuove === 1 ? 'nuova' : 'nuove'}`)
  if (e.giaPresenti) pezzi.push(`${e.giaPresenti.toLocaleString('it-IT')} già ${e.giaPresenti === 1 ? 'completa' : 'complete'}`)
  if (e.fornitoriCompletati) pezzi.push(`${e.fornitoriCompletati.toLocaleString('it-IT')} ${e.fornitoriCompletati === 1 ? 'scheda fornitore arricchita' : 'schede fornitore arricchite'}`)
  if (!pezzi.length) return e.lette ? 'Nessuna fattura da aggiungere: erano già tutte complete.' : 'In questi file non ho trovato fatture.'
  return pezzi.join(' · ')
}

/** Le cose da guardare, una per riga. Vuoto se è andato tutto liscio. */
export function avvisiEsitoXml(e) {
  const a = []
  if (e.ambigue.length) a.push(`${e.ambigue.length} ${e.ambigue.length === 1 ? 'fattura non l\'ho toccata' : 'fatture non le ho toccate'}: ci sono due fatture con lo stesso numero e la stessa data, e non so quale sia (${e.ambigue.slice(0, 3).map(x => `${x.record.fornitore} n. ${x.record.numero_rif}`).join(', ')}${e.ambigue.length > 3 ? '…' : ''}).`)
  if (e.illeggibili.length) a.push(`${e.illeggibili.length} ${e.illeggibili.length === 1 ? 'file non l\'ho saputo aprire' : 'file non li ho saputi aprire'} (${e.illeggibili.slice(0, 3).join(', ')}${e.illeggibili.length > 3 ? '…' : ''}).`)
  if (e.fileFalliti.length) a.push(`${e.fileFalliti.map(f => f.file).join(', ')}: ${e.fileFalliti[0].messaggio}`)
  if (e.errori.length) a.push(`${e.errori.length} ${e.errori.length === 1 ? 'scrittura non è andata' : 'scritture non sono andate'} (${e.errori[0].messaggio}). Ricarica lo stesso file: quelle già entrate non si doppiano.`)
  if (e.troncato) a.push('L\'archivio è molto grande e non l\'ho letto tutto: scaricalo diviso per periodi più corti.')
  return a
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/**
 * Il promemoria del mese: le fatture complete (con le righe) arrivano fino a
 * `ultimaConRighe`; se il mese scorso non è coperto, è ora di scaricare lo
 * ZIP dall'Agenzia. Senza un automatismo gratuito, è questo che tiene il
 * flusso vivo: il titolare non deve ricordarsi niente, glielo dice Foodos.
 *
 * @param {string|null} ultimaConRighe  data ISO dell'ultima fattura con righe
 * @param {string} oggiISO
 * @param {boolean} ciSonoFatture  se l'azienda ha fatture in archivio
 * @returns {null | { da: string|null, a: string, titolo: string, testo: string }}
 */
export function promemoriaZipAgenzia(ultimaConRighe, oggiISO, ciSonoFatture = true) {
  if (!oggiISO) return null
  const [y, m] = oggiISO.slice(0, 7).split('-').map(Number)
  // Il mese scorso, come anno e mese (1-12).
  const sy = m === 1 ? y - 1 : y
  const sm = m === 1 ? 12 : m - 1
  const nomeMese = (yy, mm) => `${MESI[mm - 1]}${yy !== y ? ' ' + yy : ''}`
  if (!ultimaConRighe) {
    if (!ciSonoFatture) return null
    return { da: null, a: nomeMese(sy, sm), titolo: 'Le tue fatture non hanno ancora il dettaglio dei prodotti.', testo: 'Scarica lo ZIP dall\'Agenzia delle Entrate e caricalo qui: si completano da sole.' }
  }
  const [uy, um] = ultimaConRighe.slice(0, 7).split('-').map(Number)
  if (uy > sy || (uy === sy && um >= sm)) return null
  // Il primo mese che manca è quello dopo l'ultima fattura completa.
  const dy = um === 12 ? uy + 1 : uy
  const dm = um === 12 ? 1 : um + 1
  const da = nomeMese(dy, dm)
  const a = nomeMese(sy, sm)
  const periodo = da === a ? `di ${a}` : `da ${da} a ${a}`
  return { da, a, titolo: `Mancano le fatture complete ${periodo}.`, testo: 'Scarica lo ZIP dall\'Agenzia delle Entrate e caricalo qui.' }
}
