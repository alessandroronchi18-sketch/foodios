// Le fonti di un incasso e il controllo fra di loro.
//
// Per la stessa giornata e la stessa sede i soldi possono arrivare da più
// parti: lo scontrino fiscale della cassa (la foto), il registro Excel che il
// titolare tiene a mano, un file del registratore. Prima l'ultimo che si
// caricava sovrascriveva gli altri in silenzio e non restava scritto da dove
// veniva la cifra.
//
// Regola del titolare (09/10/2026, D2): VINCE LO SCONTRINO FISCALE. Il
// registro è il controllo. Differenza oltre 1 € = «da guardare», mostrata con
// le due cifre. Nessuna fonte cancella la cifra dell'altra.
//
// Dove si scrive (dentro `extra` della chiusura, che il database già ha):
//   fonteTotale      da dove viene il totale che conta: 'foto' | 'registro' | ...
//   confrontoFonti   [{ fonte, totale, pos, contanti, delivery, nota? }]
// (`confronto` esiste già: è il confronto dei prodotti, non si tocca.)

export const TOLLERANZA_EURO = 1

/** Chi vince: più alto vale di più. Lo scontrino fiscale batte tutto. */
const PESO = { foto: 3, cassa: 3, registratore: 2, registro: 1 }

export const NOME_FONTE = {
  foto: 'scontrino della cassa',
  registro: 'registro Excel',
  registratore: 'file del registratore',
  manuale: 'scritto a mano',
}

/** «cassa» è il nome che la prima trascrizione delle foto ha dato alla stessa cosa. */
export function normalizzaFonte(f) {
  if (!f) return 'manuale'
  const s = String(f).toLowerCase()
  if (s === 'cassa' || s.startsWith('foto')) return 'foto'
  return s
}

export function pesoFonte(f) { return PESO[normalizzaFonte(f)] ?? 0 }

const cent = (v) => Math.round(v * 100) / 100
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

/** La fonte con cui è stata scritta una chiusura già nel database. */
export function fonteDellaChiusura(c) {
  if (c?.fonteTotale) return normalizzaFonte(c.fonteTotale)
  if (c?.fonte_incassi === 'registro') return 'registro'
  if ((c?.cassaImport || []).some(x => /foto/i.test(x?.fonte || ''))) return 'foto'
  return 'manuale'
}

/**
 * Confronto di due cifre della stessa giornata.
 * Ritorna { stato, differenza, tollerata }:
 *   'torna'         le due cifre coincidono entro la tolleranza
 *   'da-guardare'   differenza oltre la tolleranza
 *   'una-fonte'     una delle due non c'è: niente da confrontare
 */
export function confrontaFonti(a, b, { tolleranza = TOLLERANZA_EURO } = {}) {
  const ta = num(a?.totale), tb = num(b?.totale)
  if (ta == null || tb == null) return { stato: 'una-fonte', differenza: null }
  const differenza = cent(ta - tb)
  const stato = Math.abs(differenza) > tolleranza + 1e-9 ? 'da-guardare' : 'torna'
  return { stato, differenza }
}

/**
 * Decide cosa scrivere quando arriva una cifra nuova su una giornata che
 * potrebbe averne già una.
 *
 * `vecchia`: { totale, pos, contanti, delivery, extra } o null.
 * `nuova`:   { totale, pos, contanti, delivery, nota? } + `fonte`.
 * Ritorna { vince: 'nuova'|'vecchia', fonteTotale, confrontoFonti }.
 *
 * - stessa fonte che si ricarica: si aggiorna la sua cifra, nessun confronto nuovo;
 * - fonte più forte (scontrino): prende il totale, la cifra di prima resta nel confronto;
 * - fonte più debole (registro dopo la foto): il totale resta, la sua cifra va nel confronto.
 * L'ordine di caricamento non cambia il risultato.
 */
export function fondiFonti(vecchia, nuova, fonteNuova) {
  const fn = normalizzaFonte(fonteNuova)
  const cifraNuova = {
    fonte: fn,
    totale: num(nuova.totale), pos: num(nuova.pos),
    contanti: num(nuova.contanti), delivery: num(nuova.delivery),
    ...(nuova.nota ? { nota: nuova.nota } : {}),
  }
  const elenco = new Map()
  if (vecchia) {
    for (const x of vecchia.extra?.confrontoFonti || []) elenco.set(normalizzaFonte(x.fonte), x)
    const fv = fonteDellaChiusura(vecchia.extra || {})
    // La cifra della chiusura già salvata è quella della sua fonte, anche se
    // non era stata ancora scritta nel confronto (giornate di prima di oggi).
    if (Number(vecchia.totale) > 0 && !elenco.has(fv)) {
      elenco.set(fv, {
        fonte: fv, totale: num(vecchia.totale), pos: num(vecchia.pos),
        contanti: num(vecchia.contanti), delivery: num(vecchia.delivery),
      })
    }
  }
  const fonteVecchia = vecchia ? fonteDellaChiusura(vecchia.extra || {}) : null
  const vinceNuova = !vecchia || !(Number(vecchia.totale) > 0)
    || fn === fonteVecchia
    || pesoFonte(fn) >= pesoFonte(fonteVecchia)
  elenco.set(fn, cifraNuova)
  return {
    vince: vinceNuova ? 'nuova' : 'vecchia',
    fonteTotale: vinceNuova ? fn : fonteVecchia,
    confrontoFonti: [...elenco.values()],
  }
}

/**
 * Il controllo di una chiusura: la cifra che conta contro ogni altra fonte.
 * Ritorna null se la giornata ha una fonte sola.
 */
export function controlloGiornata(chiusura) {
  const cifre = chiusura?.confrontoFonti || []
  if (cifre.length < 2) return null
  const fonteVincente = fonteDellaChiusura(chiusura)
  const vincente = cifre.find(x => normalizzaFonte(x.fonte) === fonteVincente) || cifre[0]
  let peggiore = null
  for (const x of cifre) {
    if (x === vincente) continue
    const r = confrontaFonti(vincente, x)
    if (r.stato === 'da-guardare' && (!peggiore || Math.abs(r.differenza) > Math.abs(peggiore.differenza))) {
      peggiore = { ...r, altra: x }
    }
  }
  if (!peggiore) return { stato: 'torna', data: chiusura.data, vincente, differenza: 0 }
  return {
    stato: 'da-guardare', data: chiusura.data, vincente, altra: peggiore.altra,
    differenza: peggiore.differenza,
    nota: [vincente.nota, peggiore.altra.nota].find(Boolean) || null,
  }
}

/**
 * I giorni da guardare di un elenco di chiusure (una o più sedi), dal più
 * pesante al meno. `chiusure` = forma dei componenti, con `sede_id` se c'è.
 */
export function giorniDaGuardare(chiusure) {
  const out = []
  for (const c of chiusure || []) {
    const r = controlloGiornata(c)
    if (r?.stato === 'da-guardare') out.push({ ...r, sede_id: c.sede_id || null })
  }
  return out.sort((x, y) => Math.abs(y.differenza) - Math.abs(x.differenza))
}
