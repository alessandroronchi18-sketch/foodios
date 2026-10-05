// Le spese fisse che arrivano già in fattura, e l'avviso contro i doppioni.
//
// Perché esiste (05/10/2026). Il titolare: «come inserisco i costi fissi, non
// si inseriscono automaticamente dalle fatture che arrivano?». Sì: ogni
// fattura entra da sola nel conto del mese. La pagina Costi fissi serve solo
// per le spese SENZA fattura (affitto da un privato, rate, assicurazioni,
// F24). Ma la pagina non lo diceva: chi scriveva «Luce 1.800 € al mese» la
// faceva contare due volte, una dalla fattura Enel e una da qui, e nessun
// numero lo segnalava. Per Mara: 0 voci in Costi fissi, 315 fornitori, e fra
// le fatture dell'ultimo anno Enel (1.826 € al mese), Fastweb, Wind Tre e il
// garage arrivano tutti i mesi.
//
// Qui: (1) quali fornitori fatturano con regolarità una spesa fissa, con la
// media al mese, per vederli insieme senza reinserirli; (2) se la voce che
// si sta scrivendo in Costi fissi è probabilmente una di quelle.
//
// La voce di una fattura è quella del conto (`categoriaDellaFattura`: la
// fattura, poi il fornitore per P.IVA e per nome); se il fornitore non ce
// l'ha, quella proposta dal nome (`suggerisciCategoria`), detta come
// proposta. L'importo è quello del conto: senza IVA quando si sa togliere,
// se no con l'IVA, e lo si dice.

import {
  ID_CATEGORIE as ID, categoriaDellaFattura, categoriaPerId, chiaveFornitore, importoSenzaIva,
  nomeBreve, suggerisciCategoria,
} from './contoEconomico'

/** Le voci del conto che sono spese fisse (si pagano ogni mese, vendi o no). */
export const VOCI_FISSE = Object.freeze([ID.AFFITTO, ID.UTENZE, ID.SERVIZI, ID.MANUTENZIONE, ID.MARKETING, ID.PERSONALE_ESTERNO])

/** La categoria di Costi fissi → la voce del conto (le assicurazioni stanno nei Servizi). */
export const VOCE_DEL_CONTO = Object.freeze({
  utenze: ID.UTENZE, affitti: ID.AFFITTO, servizi: ID.SERVIZI, assicurazioni: ID.SERVIZI,
  manutenzione: ID.MANUTENZIONE, marketing: ID.MARKETING, consumabili: ID.CONFEZIONAMENTO,
})

const meseDi = (d) => (/^\d{4}-\d{2}/.test(String(d ?? '')) ? String(d).slice(0, 7) : null)
function spostaMese(m, n) {
  const [y, mm] = m.split('-').map(Number)
  const t = new Date(y, mm - 1 + n, 1)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}
const mesiFra = (da, a) => { let n = 0; for (let m = da; m <= a; m = spostaMese(m, 1)) n++; return n }

/**
 * @param {object[]} fatture  come le legge il conto (fornitore, data_fattura,
 *   totale, imponibile, imposta, piva, sede_id, sedi_condivise, categoria_spesa)
 * @param {object} o
 * @param {object} [o.categoriePerFornitore]  da `leggiCategorieFornitori`
 * @param {string} o.oggi  «AAAA-MM-GG»: la finestra sono i `mesi` mesi interi prima di questo
 * @param {number} [o.mesi=12]
 * @param {{id: string, nome: string}[]} [o.sedi]
 * @returns {{ voci: object[], senzaVoce: object[], totaleMese: number, finestra: {da: string, a: string} }}
 *   Una voce: { chiave, nome, voce (id), nomeVoce, proposta, mediaMese,
 *   mesiCon, mesiFinestra, conIva, sedi }. `voci` sono le fisse, `senzaVoce`
 *   i ricorrenti di cui non si sa la voce (da chiedere). Dalla media più alta.
 */
export function speseRicorrenti(fatture = [], { categoriePerFornitore = {}, oggi, mesi = 12, sedi = [] } = {}) {
  const fine = spostaMese(String(oggi).slice(0, 7), -1)
  const inizio = spostaMese(fine, -(mesi - 1))
  const per = new Map()
  for (const f of fatture || []) {
    const m = meseDi(f?.data_fattura)
    if (!m || m < inizio || m > fine) continue
    const k = chiaveFornitore(f?.fornitore)
    if (!k) continue
    const x = per.get(k) || { chiave: k, nomi: new Map(), mesi: new Set(), totale: 0, conIva: 0, ultima: null, sedi: new Set() }
    const nome = String(f.fornitore).trim()
    x.nomi.set(nome, (x.nomi.get(nome) || 0) + 1)
    x.mesi.add(m)
    const netto = importoSenzaIva(f)
    if (netto.importo != null) x.totale += netto.importo
    else { x.totale += Number(f?.totale) || 0; x.conIva++ }
    if (!x.ultima || String(f.data_fattura) >= String(x.ultima.data_fattura)) x.ultima = f
    const ids = Array.isArray(f.sedi_condivise) && f.sedi_condivise.length ? f.sedi_condivise : [f.sede_id]
    for (const id of ids) if (id) x.sedi.add(id)
    per.set(k, x)
  }

  const voci = [], senzaVoce = []
  for (const x of per.values()) {
    const primo = [...x.mesi].sort()[0]
    const ultimo = [...x.mesi].sort().at(-1)
    const span = mesiFra(primo, fine)
    // Regolare: almeno tre mesi, tre su quattro dal primo, e ancora attivo
    // (una fattura nell'ultimo mese o in quello prima).
    if (x.mesi.size < 3 || x.mesi.size / span < 0.75 || ultimo < spostaMese(fine, -1)) continue
    const nome = [...x.nomi.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const sua = categoriaDellaFattura(x.ultima, categoriePerFornitore)
    const sugg = sua ? null : suggerisciCategoria(nome)
    const voce = sua || (sugg?.categoria && sugg.certezza !== 'bassa' ? sugg.categoria : null)
    const riga = {
      chiave: x.chiave, nome: nomeBreve(nome), voce, nomeVoce: voce ? (categoriaPerId(voce)?.nome || voce) : null,
      proposta: !sua && !!voce, mediaMese: x.totale / span, mesiCon: x.mesi.size, mesiFinestra: span,
      conIva: x.conIva > 0,
      sedi: [...x.sedi].map(id => (sedi || []).find(s => s.id === id)?.nome).filter(Boolean),
    }
    if (!voce) senzaVoce.push(riga)
    else if (VOCI_FISSE.includes(voce)) voci.push(riga)
  }
  voci.sort((a, b) => b.mediaMese - a.mediaMese)
  senzaVoce.sort((a, b) => b.mediaMese - a.mediaMese)
  return { voci, senzaVoce, totaleMese: voci.reduce((s, v) => s + v.mediaMese, 0), finestra: { da: inizio, a: fine } }
}

// Parole che non dicono chi è il fornitore: si scrivono in ogni voce.
const PAROLE_VUOTE = new Set(['affitto', 'locale', 'locali', 'negozio', 'spesa', 'spese', 'mensile', 'annuale', 'canone',
  'fattura', 'bolletta', 'sede', 'costo', 'costi', 'servizio', 'servizi', 'contratto', 'rata', 'rate', 'quota', 'della', 'delle', 'dello'])

// Le parole che dicono «utenza» anche senza il nome del fornitore: luce, gas,
// telefono arrivano quasi sempre in fattura, quindi l'avviso è forte.
const PAROLE_UTENZE = ['luce', 'energia', 'elettric', 'corrente', 'acqua', 'internet', 'telefon', 'wifi', 'fibra', 'cellular', 'bolletta']
// «Per le utenze», «per gli affitti»: l'articolo giusto per ogni categoria.
const ARTICOLATA = { utenze: 'le utenze', affitti: 'gli affitti', servizi: 'i servizi professionali', assicurazioni: 'le assicurazioni',
  manutenzione: 'la manutenzione', marketing: 'il marketing', consumabili: 'i consumabili' }

const parole = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 4)

/**
 * La voce che si sta scrivendo in Costi fissi è probabilmente una spesa che
 * arriva già in fattura?
 *   • per nome: una parola della descrizione è nel nome di un fornitore
 *     ricorrente («Enel luce» → ENEL ENERGIA), qualunque sia la categoria;
 *   • per voce: la categoria corrisponde a una voce del conto che ha già
 *     fornitori ricorrenti («Utenze» → Enel, Fastweb, Wind Tre).
 *   • per parola: «luce», «gas», «telefono» con delle utenze ricorrenti.
 * `forte` vuol dire «quasi certamente è già nel conto» (nome, utenze): il
 * pulsante lo dice. Per la sola categoria è un'informazione: l'affitto del
 * negozio da un privato non ha fattura anche se il garage ce l'ha.
 * @returns {{ tipo: 'nome'|'parola'|'voce', forte: boolean, categoria: string, fornitori: object[] } | null}
 */
export function doppioneProbabile({ categoria, voce: descrizione } = {}, ricorrenti = null, { sedi = [] } = {}) {
  const tutti = [...(ricorrenti?.voci || []), ...(ricorrenti?.senzaVoce || [])]
  if (!tutti.length) return null
  const vuote = new Set([...PAROLE_VUOTE, ...(sedi || []).flatMap(s => parole(s?.nome))])
  const cercate = parole(descrizione).filter(w => !vuote.has(w))
  if (cercate.length) {
    const perNome = tutti.filter(r => { const n = parole(r.nome); return cercate.some(w => n.some(p => p === w || (w.length >= 5 && p.startsWith(w)))) })
    if (perNome.length) return { tipo: 'nome', forte: true, categoria, fornitori: perNome }
  }
  const utenze = (ricorrenti?.voci || []).filter(r => r.voce === ID.UTENZE)
  if (utenze.length && cercate.some(w => PAROLE_UTENZE.some(p => w.startsWith(p)))) {
    return { tipo: 'parola', forte: true, categoria: 'utenze', fornitori: utenze }
  }
  const delConto = VOCE_DEL_CONTO[categoria]
  const perVoce = delConto ? (ricorrenti?.voci || []).filter(r => r.voce === delConto) : []
  return perVoce.length ? { tipo: 'voce', forte: delConto === ID.UTENZE, categoria, fornitori: perVoce } : null
}

const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const euro = (n) => `${NF0.format(Math.round(Number(n) || 0))} €`
const elenco = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}` : xs[0] || '')

/** L'avviso, a parole. */
export function testoDoppione(d) {
  if (!d?.fornitori?.length) return ''
  const f = d.fornitori.slice(0, 3)
  if (d.tipo === 'nome') {
    const uno = f[0]
    return `${uno.nome} ti manda già una fattura ogni mese (${euro(uno.mediaMese)} in media): è già nel conto. Aggiungila qui solo se è un'altra spesa.`
  }
  const chi = elenco(f.map(x => `${x.nome} (${euro(x.mediaMese)} al mese)`)) + (d.fornitori.length > 3 ? ' e altri' : '')
  const per = ARTICOLATA[d.categoria] ? `Per ${ARTICOLATA[d.categoria]} ti` : 'Ti'
  return d.forte
    ? `${per} arrivano già le fatture di ${chi}: sono già nel conto. Aggiungila qui solo se è un'altra spesa, che non arriva in fattura.`
    : `${per} arriva già in fattura ${chi}, che è già nel conto. Se questa è un'altra spesa, senza fattura, va bene qui.`
}
