// Uscite di cassa della giornata: la prima nota.
//
// Sono i soldi che escono dal cassetto per acquisti veloci — dieci euro di
// limoni, la carta, la spesa al supermercato — e che prima non avevano posto
// in Foodos. C'era solo costi_aziendali, fatto per i costi RICORRENTI mensili
// (affitto, utenze) con periodicità e data di inizio: l'acquisto di limoni del
// 3 luglio non ci entrava.
//
// Il campo `documento` è il cuore della cosa, ed è preso di peso dal modo in
// cui il design partner tiene il registro da sempre: accanto a ogni spesa
// annota "(F)" se ha la fattura, "(no F)" se non ce l'ha, "(?)" se il documento
// è dubbio. Non è una nota personale — è la distinzione fra spesa documentata
// e non documentata, che davanti al commercialista pesa in modo diverso.

import { supabase } from './supabase'

const COLONNE = 'id, data, importo, descrizione, documento, categoria, fornitore, note, origine'

/** Marca le righe scritte dall'import del registro Excel. */
export const ORIGINE_IMPORT = 'import-registro'
/** Riga scritta a mano nell'app: l'import non la tocca mai. */
export const ORIGINE_MANUALE = 'manuale'
/** Uscita nata dal pagamento di una fattura registrato nello Scadenzario. */
export const ORIGINE_FATTURA = 'fattura-pagata'

export const DOCUMENTI = [
  { valore: 'fattura', etichetta: 'Con fattura',   breve: 'F',     colore: 'green' },
  { valore: 'senza',   etichetta: 'Senza fattura', breve: 'no F',  colore: 'amber' },
  { valore: 'incerto', etichetta: 'Da verificare', breve: '?',     colore: 'textSoft' },
]

export function etichettaDocumento(valore) {
  return DOCUMENTI.find(d => d.valore === valore)?.etichetta || 'Da verificare'
}

/** Uscite di cassa di una sede in un intervallo (di solito il mese). */
export async function caricaMovimenti(orgId, sedeId, { from, to } = {}) {
  if (!orgId) return []
  let q = supabase.from('movimenti_cassa').select(COLONNE).eq('organization_id', orgId)
  q = sedeId ? q.eq('sede_id', sedeId) : q.is('sede_id', null)
  if (from) q = q.gte('data', from)
  if (to) q = q.lte('data', to)
  const { data, error } = await q.order('data', { ascending: false })
  if (error) {
    console.error('caricaMovimenti:', error)
    throw new Error(error.message || 'caricamento uscite di cassa fallito')
  }
  return (data || []).map(r => ({ ...r, importo: Number(r.importo) || 0 }))
}

export async function aggiungiMovimento(orgId, sedeId, m) {
  if (!orgId) throw new Error('aggiungiMovimento: orgId mancante')
  const importo = Number(m?.importo) || 0
  if (!(importo > 0)) throw new Error('L\'importo deve essere maggiore di zero')
  const descrizione = String(m?.descrizione || '').trim()
  if (!descrizione) throw new Error('Serve una descrizione: fra sei mesi nessuno ricorda cos\'era')

  const { data, error } = await supabase.from('movimenti_cassa').insert({
    organization_id: orgId,
    sede_id: sedeId || null,
    data: m.data,
    importo,
    descrizione,
    documento: DOCUMENTI.some(d => d.valore === m.documento) ? m.documento : 'incerto',
    categoria: m.categoria || null,
    fornitore: m.fornitore || null,
    note: m.note || null,
    // Scritta a mano: l'import del registro non deve poterla cancellare.
    origine: ORIGINE_MANUALE,
  }).select(COLONNE).single()
  if (error) throw new Error(error.message)
  return { ...data, importo: Number(data.importo) || 0 }
}

export async function eliminaMovimento(id) {
  const { error } = await supabase.from('movimenti_cassa').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Inserimento in blocco, usato dall'importazione di un registro.
 * A blocchi di 200 per non superare i limiti della richiesta.
 */
export async function aggiungiMovimentiInBlocco(orgId, righe, origine = ORIGINE_IMPORT) {
  if (!orgId || !Array.isArray(righe) || righe.length === 0) return 0
  const payload = righe
    .filter(r => Number(r.importo) > 0 && r.data)
    .map(r => ({
      organization_id: orgId,
      sede_id: r.sede_id || null,
      data: r.data,
      importo: Number(r.importo),
      // Marchiamo la provenienza: l'import può cancellare solo le righe che
      // ha scritto lui, mai una spesa messa a mano dal titolare.
      origine,
      descrizione: String(r.descrizione || 'spesa').slice(0, 500),
      documento: DOCUMENTI.some(d => d.valore === r.documento) ? r.documento : 'incerto',
      categoria: r.categoria || null,
      fornitore: r.fornitore || null,
      note: r.importoStimato
        ? 'Importo ripartito automaticamente: nel registro originale la cifra non era indicata per questa voce.'
        : r.importoResiduo
          ? 'Differenza fra il totale della giornata e le voci dettagliate nel registro originale.'
          : null,
    }))
  let inseriti = 0
  for (let i = 0; i < payload.length; i += 200) {
    const blocco = payload.slice(i, i + 200)
    const { error } = await supabase.from('movimenti_cassa').insert(blocco)
    if (error) throw new Error(error.message)
    inseriti += blocco.length
  }
  return inseriti
}

/** Totali di periodo, separando documentate e non: al commercialista servono distinte. */
export async function totaliPeriodo(orgId, sedeIds, from, to) {
  const vuoto = { totale: 0, conFattura: 0, senzaFattura: 0, daVerificare: 0, numero: 0 }
  if (!orgId || !from || !to) return vuoto
  const { data, error } = await supabase.rpc('movimenti_cassa_periodo', {
    p_org_id: orgId,
    p_sede_ids: sedeIds == null ? null : (Array.isArray(sedeIds) ? sedeIds : [sedeIds]),
    p_data_from: from,
    p_data_to: to,
  })
  if (error) { console.error('totaliPeriodo:', error); return vuoto }
  const r = Array.isArray(data) ? data[0] : data
  return {
    totale:        Number(r?.totale) || 0,
    conFattura:    Number(r?.con_fattura) || 0,
    senzaFattura:  Number(r?.senza_fattura) || 0,
    daVerificare:  Number(r?.da_verificare) || 0,
    numero:        Number(r?.numero_movimenti) || 0,
  }
}

/**
 * Elenca le uscite di un periodo che vengono da un import: sono le uniche
 * che un nuovo import può cancellare.
 *
 * Fino al 10/09/2026 non esisteva questa distinzione: prima di scrivere le
 * uscite del mese, l'import cancellava TUTTE le uscite di quel periodo per
 * quella sede, comprese quelle scritte a mano nell'app, che nel file Excel
 * non ci sono e non tornano più. E lo faceva sempre, anche quando il foglio
 * caricato non aveva nemmeno la colonna delle spese.
 */
export async function movimentiImportatiPeriodo(orgId, sedeId, from, to, origine = ORIGINE_IMPORT) {
  if (!orgId || !from || !to) return []
  let q = supabase.from('movimenti_cassa').select('id, importo')
    .eq('organization_id', orgId)
    .eq('origine', origine)
    .gte('data', from)
    .lte('data', to)
  q = sedeId ? q.eq('sede_id', sedeId) : q.is('sede_id', null)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Cancella per id. Si usa DOPO aver inserito le righe nuove: se la
 * cancellazione fallisce restano dei doppioni, che si vedono e si sistemano;
 * se invece si cancellasse prima e l'inserimento fallisse, le spese del mese
 * sarebbero perse e nessuno saprebbe quali.
 */
export async function eliminaMovimentiPerId(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0
  let eliminati = 0
  for (let i = 0; i < ids.length; i += 200) {
    const blocco = ids.slice(i, i + 200)
    const { error, count } = await supabase.from('movimenti_cassa')
      .delete({ count: 'exact' }).in('id', blocco)
    if (error) throw new Error(error.message)
    eliminati += count || blocco.length
  }
  return eliminati
}

/**
 * Svuota le uscite IMPORTATE di un periodo per una sede.
 *
 * Serve prima di reimportare un registro: caricare due volte il foglio di
 * luglio senza questo passaggio raddoppierebbe ogni spesa importata. Le righe
 * scritte a mano (origine NULL o 'manuale') non si toccano.
 */
export async function eliminaMovimentiPeriodo(orgId, sedeId, from, to, origine = ORIGINE_IMPORT) {
  if (!orgId || !from || !to) return 0
  let q = supabase.from('movimenti_cassa').delete({ count: 'exact' })
    .eq('organization_id', orgId)
    .eq('origine', origine)
    .gte('data', from)
    .lte('data', to)
  q = sedeId ? q.eq('sede_id', sedeId) : q.is('sede_id', null)
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count || 0
}
