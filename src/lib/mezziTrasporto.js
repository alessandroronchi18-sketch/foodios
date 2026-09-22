// Con cosa ci si va, e chi ci può andare.
//
// Il titolare, 23/09/2026, parlando dei giri fra le sedi: «bisogna
// considerare chi ha la patente e chi no … e poi magari il tipo di
// trasporto».
//
// ── Perché non è un dettaglio ────────────────────────────────────────────
//
// Carlina (Piazza Carlo Emanuele II) e Berthollet (Via Berthollet 30) sono a
// pochi minuti a piedi; De Gasperi è dall'altra parte della città. Proporre
// a chi è in turno un giro che **non può fare** — perché non ha la patente,
// o perché con lo scooter quei venti chili non ci stanno — vuol dire fargli
// perdere tempo, che è esattamente il problema da cui siamo partiti.
//
// ── I numeri qui sotto ───────────────────────────────────────────────────
//
// `porta` è quanto ci sta **davvero**, non quanto si potrebbe teoricamente
// caricare: un ragazzo che va a piedi con due buste porta cinque chili, non
// venti, e se il programma dice venti la merce resta a terra. Sono valori di
// riferimento e si possono cambiare: quello che non si può è non averli e
// far finta che un viaggio a piedi e uno col furgone siano la stessa cosa.
//
// `minuti` è il costo del viaggio sulla tratta corta (Carlina↔Berthollet):
// serve a dire «uscire adesso costa X minuti», non a fare un navigatore.

export const MEZZI = [
  { id: 'piedi', label: 'A piedi', porta: 5, minuti: 20, patente: false, icona: 'user' },
  { id: 'bici', label: 'In bici', porta: 12, minuti: 15, patente: false, icona: 'bolt' },
  { id: 'scooter', label: 'Scooter', porta: 20, minuti: 15, patente: true, icona: 'scooter' },
  { id: 'auto', label: 'Auto', porta: 80, minuti: 25, patente: true, icona: 'truck' },
  { id: 'furgone', label: 'Furgone', porta: 400, minuti: 30, patente: true, icona: 'truck' },
]

const perId = new Map(MEZZI.map(m => [m.id, m]))

/** Il mezzo, o `null` se non è uno di quelli che conosciamo. */
export function mezzo(id) {
  return perId.get(String(id || '').trim().toLowerCase()) || null
}

/**
 * Chi può fare questo giro, e chi no — col motivo.
 *
 * Il motivo conta quanto l'elenco: «Anna non può» è un vicolo cieco, «Anna
 * non ha la patente» dice a chi legge cosa fare (chiedere a un altro, o
 * cambiare mezzo).
 *
 * `patente` a `null` vuol dire **non lo sappiamo**, e non «no»: chi non l'ha
 * dichiarata finisce fra i «da chiedere», non fra gli esclusi. Trattarlo come
 * un no vorrebbe dire proporre i giri sempre alle stesse due persone.
 *
 * @param {Array}  persone  `[{ id, nome, patente, mezzi }]`
 * @param {string} idMezzo
 * @returns {{possono: Array, daChiedere: Array, nonPossono: Array}}
 */
export function chiPuoAndare(persone, idMezzo) {
  const m = mezzo(idMezzo)
  const elenco = (Array.isArray(persone) ? persone : []).filter(p => p && p.nome)
  const possono = []
  const daChiedere = []
  const nonPossono = []
  if (!m) return { possono: elenco, daChiedere: [], nonPossono: [] }

  for (const p of elenco) {
    const suoi = Array.isArray(p.mezzi) ? p.mezzi.map(x => String(x).toLowerCase()) : null
    if (m.patente && p.patente === false) {
      nonPossono.push({ ...p, perche: 'non ha la patente' })
      continue
    }
    if (m.patente && p.patente == null) {
      daChiedere.push({ ...p, perche: 'non so se ha la patente' })
      continue
    }
    if (suoi == null) {
      daChiedere.push({ ...p, perche: `non so se può usare ${m.label.toLowerCase()}` })
      continue
    }
    if (!suoi.includes(m.id)) {
      nonPossono.push({ ...p, perche: `non ha ${m.label.toLowerCase()}` })
      continue
    }
    possono.push({ ...p, perche: null })
  }
  return { possono, daChiedere, nonPossono }
}

/**
 * Ci sta, quella roba, su quel mezzo?
 *
 * @param {number} grammi
 * @param {string} idMezzo
 * @returns {{ci_sta: boolean|null, porta: number|null, frase: string|null}}
 */
export function ciSta(grammi, idMezzo) {
  const m = mezzo(idMezzo)
  const g = Number(grammi)
  if (!m) return { ci_sta: null, porta: null, frase: null }
  if (!Number.isFinite(g) || g <= 0) return { ci_sta: null, porta: m.porta, frase: null }
  const kg = g / 1000
  if (kg <= m.porta) return { ci_sta: true, porta: m.porta, frase: null }
  return {
    ci_sta: false,
    porta: m.porta,
    frase: `${kg.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg ${m.label.toLowerCase()} non ci stanno: `
      + `${m.label.toLowerCase()} porta circa ${m.porta} kg. Serve un mezzo più grande, o due viaggi.`,
  }
}

/**
 * Il mezzo più piccolo che basta per quella roba.
 *
 * Il più piccolo, non il più comodo: se quattro chili si portano a piedi, il
 * furgone è una macchina accesa per niente — ed è il genere di spreco che il
 * titolare ha chiesto di togliere.
 */
export function mezzoCheBasta(grammi, opzioni) {
  const { disponibili = null } = opzioni && typeof opzioni === 'object' ? opzioni : {}
  const g = Number(grammi)
  if (!Number.isFinite(g) || g <= 0) return null
  const ammessi = Array.isArray(disponibili) && disponibili.length
    ? MEZZI.filter(m => disponibili.map(x => String(x).toLowerCase()).includes(m.id))
    : MEZZI
  return ammessi.find(m => g / 1000 <= m.porta) || null
}
