// ── «Torna il conto?» con le chiusure vere: cassa e inventario, sede per sede ─
//
// 05/10/2026. Fino a ieri Carlina non aveva nessuna chiusura registrata: la
// Quadratura non aveva niente da confrontare. Da oggi ne ha 40 (dalle foto:
// agosto 18 giorni, 31.339,41 €; settembre 22 giorni, 44.848,60 €, IVA
// compresa). Berthollet e De Gasperi, zero.
//
// DIFETTO TROVATO nel provarla con quei dati. In «Tutte le sedi» la pagina
// sommava l'inventario delle TRE sedi e lo confrontava con la cassa di UNA:
// i giorni «con tutte e due» erano giorni in cui Berthollet e De Gasperi
// avevano l'inventario e nessuna cassa, e la differenza usciva enorme
// (la cassa di una sede contro il gelato di tre). Il commento nel CSV diceva
// «le chiusure arrivano già sommate»: non è più vero, in «Tutte le sedi» le
// chiusure portano la loro sede (caricaChiusure con tutteLeSedi).
//
// La regola: il confronto si fa solo sulle sedi che hanno la cassa (e solo sui
// giorni che hanno sia la cassa sia l'inventario, come già faceva
// kpiQuadraturaSettimana). Le altre sedi restano nel «venduto» e nell'incasso
// stimato, ma fuori dalla differenza, e la pagina dice quali sono e perché.
import { kpiQuadraturaSettimana, matriceDiPiuSedi, kgB2B, CAUSA_RIMANENZA_A_ZERO, cellaDaControllare } from './inventarioProduzione'

const giornoDi = (v) => (v ? String(v).slice(0, 10) : null)
const incassoDi = (c) => Number(c?.kpi?.totV || c?.totale || 0)

/**
 * I conti della settimana, con la differenza calcolata solo sulle sedi che
 * hanno la cassa.
 *
 * @param {object} p
 * @param {Array<{sedeId:string, matrice:object}>} p.matrici  una per sede
 * @param {Array} p.chiusure  della settimana; in «Tutte le sedi» con `sede_id`
 * @param {number|null} p.euroKg
 * @param {Array} [p.venduteB2b]  vendite all'ingrosso della settimana (con `sede_id`)
 * @returns {object} quello di kpiQuadraturaSettimana, più `sediConCassa`,
 *   `sediSenzaCassa` (id) e `giorniInventarioConfronto` (i giorni con
 *   l'inventario delle sole sedi che hanno la cassa)
 */
export function kpiQuadraturaSedi({ matrici, chiusure, euroKg, venditeB2b = [] }) {
  const elenco = (matrici || []).filter(m => m && m.matrice)
  const ch = (chiusure || []).filter(Boolean)
  const base = kpiQuadraturaSettimana(matriceDiPiuSedi(elenco), ch, euroKg, venditeB2b)
  const tutte = elenco.map(m => m.sedeId)
  if (elenco.length <= 1) {
    return { ...base, sediConCassa: ch.length > 0 ? tutte : [], sediSenzaCassa: ch.length > 0 ? [] : tutte, giorniInventarioConfronto: base.giorniInventario }
  }
  const conCassa = tutte.filter(id => ch.some(c => c.sede_id === id))
  const senzaCassa = tutte.filter(id => !conCassa.includes(id))
  if (conCassa.length === 0 || senzaCassa.length === 0) {
    return { ...base, sediConCassa: conCassa, sediSenzaCassa: senzaCassa, giorniInventarioConfronto: base.giorniInventario }
  }
  const sub = kpiQuadraturaSettimana(
    matriceDiPiuSedi(elenco.filter(m => conCassa.includes(m.sedeId))),
    ch.filter(c => conCassa.includes(c.sede_id)),
    euroKg,
    (venditeB2b || []).filter(v => conCassa.includes(v.sede_id)),
  )
  return {
    ...base,
    driftEur: sub.driftEur, driftPct: sub.driftPct,
    cassaConfrontata: sub.cassaConfrontata, attesoConfrontato: sub.attesoConfrontato,
    giorniConfrontati: sub.giorniConfrontati, motivoConfronto: sub.motivoConfronto,
    giorniInventarioConfronto: sub.giorniInventario,
    sediConCassa: conCassa, sediSenzaCassa: senzaCassa,
  }
}

/**
 * Giorno per giorno, per le sole sedi che hanno la cassa: cosa dice la cassa,
 * cosa dice l'inventario, e se quel giorno ha una rimanenza lasciata a 0.
 *
 * Una rimanenza a 0 la sera in cui si è prodotto (di solito la casella non
 * compilata) sbaglia due giorni in versi opposti: quel giorno il venduto
 * esce troppo ALTO (`rimanenzaZero`), il giorno in cui il gelato «ricompare»
 * esce troppo BASSO (`riparteDaZero`, la casella negativa). Insieme i due
 * giorni tornano; presi uno per uno no. Si dice, senza correggere i numeri.
 *
 * @returns {Array<{data:string, cassa:number|null, kg:number|null, atteso:number|null,
 *   driftEur:number|null, driftPct:number|null, riparteDaZero:number, rimanenzaZero:number,
 *   confrontato:boolean}>}
 */
export function giorniDelConfronto({ matrici, chiusure, euroKg, venditeB2b = [] }) {
  const elenco = (matrici || []).filter(m => m && m.matrice)
  const ch = (chiusure || []).filter(Boolean)
  const ids = elenco.length <= 1 ? elenco.map(m => m.sedeId) : elenco.map(m => m.sedeId).filter(id => ch.some(c => c.sede_id === id))
  const usate = elenco.filter(m => ids.includes(m.sedeId))
  const chUsate = elenco.length <= 1 ? ch : ch.filter(c => ids.includes(c.sede_id))
  const b2b = elenco.length <= 1 ? venditeB2b : (venditeB2b || []).filter(v => ids.includes(v.sede_id))

  const per = {}
  const dia = (d) => per[d] || (per[d] = { data: d, cassa: null, g: null, riparteDaZero: 0, rimanenzaZero: 0 })
  for (const c of chUsate) {
    const d = giornoDi(c.data); if (!d) continue
    dia(d).cassa = (dia(d).cassa || 0) + incassoDi(c)
  }
  for (const { matrice } of usate) {
    for (const byData of Object.values(matrice)) {
      for (const [d, c] of Object.entries(byData || {})) {
        if (c?.venduto == null) continue
        dia(d).g = (dia(d).g || 0) + (Number(c.venduto) || 0)
        if (c.causa === CAUSA_RIMANENZA_A_ZERO && cellaDaControllare(c)) {
          dia(d).riparteDaZero++
          if (c.giornoDaSistemare) dia(c.giornoDaSistemare).rimanenzaZero++
        }
      }
    }
  }
  return Object.values(per).sort((a, b) => (a.data < b.data ? -1 : 1)).map(x => {
    const kgTot = x.g == null ? null : x.g / 1000
    const kgB = kgB2B((b2b || []).filter(v => giornoDi(v?.data) === x.data))
    const atteso = kgTot != null && euroKg != null ? Math.max(0, kgTot - kgB) * euroKg : null
    const confrontato = x.cassa != null && atteso != null
    const driftEur = confrontato ? x.cassa - atteso : null
    return {
      data: x.data, cassa: x.cassa, kg: kgTot, atteso, driftEur,
      driftPct: driftEur != null && atteso > 0 ? (driftEur / atteso) * 100 : null,
      riparteDaZero: x.riparteDaZero, rimanenzaZero: x.rimanenzaZero, confrontato,
    }
  })
}

/**
 * Cosa si può dire, giorno per giorno, di dove la cassa e l'inventario non
 * vanno d'accordo: solo quello che i dati sanno, mai un sospetto.
 *
 * - i giorni con una rimanenza a 0 (di sera, dopo aver prodotto) sono
 *   sbilanciati in versi opposti e si compensano a coppie;
 * - i giorni con una differenza grande SENZA questa causa si dicono come
 *   da guardare, senza dire perché: i dati non lo sanno.
 *
 * @returns {{ id:string, verso:string, testo:string }[]}
 */
export function spiegaConfronto(giorni, { soglia = 15 } = {}) {
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const conf = (giorni || []).filter(g => g.confrontato)
  if (conf.length === 0) return []
  const frasi = []
  const haZero = (g) => g.riparteDaZero > 0 || g.rimanenzaZero > 0
  const zero = conf.filter(haZero)
  if (zero.length > 0) {
    frasi.push({
      id: 'rimanenza-zero', verso: 'info',
      testo: `${zero.length} ${zero.length === 1 ? 'giorno' : 'giorni'} su ${conf.length} ${zero.length === 1 ? 'ha' : 'hanno'} una rimanenza lasciata a 0 in vetrina (${zero.map(g => dm(g.data)).join(', ')}). Il giorno della rimanenza a 0 l'inventario conta troppo gelato venduto, il giorno dopo troppo poco: presi insieme i due giorni si compensano, presi uno per uno no. Il dato non è corretto: va scritta la rimanenza vera.`,
    })
  }
  const grandi = conf.filter(g => g.driftPct != null && Math.abs(g.driftPct) >= soglia && !haZero(g))
  if (grandi.length > 0) {
    frasi.push({
      id: 'senza-causa', verso: 'peggio',
      testo: `${grandi.length === 1 ? 'Il' : 'I'} ${grandi.map(g => dm(g.data)).join(', ')} ${grandi.length === 1 ? 'ha' : 'hanno'} una differenza oltre il ${soglia}% senza una rimanenza a 0 che la spieghi. I dati non dicono perché: si guardano la pesata di quel giorno e le battute di cassa.`,
    })
  }
  return frasi
}
