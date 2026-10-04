// ── Le cose che si notano, con il numero dietro ───────────────────────────
//
// Il titolare: «non capisco cosa guardare». Sopra la tabella, al massimo
// quattro frasi che dicono dove guardare, ognuna col numero che la regge
// (ANALISI_DESIGN.md §4, FraseInsight). Si dice solo quello che i dati
// reggono: niente frase se il numero non c'è o è troppo piccolo per dire
// qualcosa.
//
//   1. il gusto che resta più giorni in vetrina (dalla soglia della
//      Quadratura, `GIORNI_VETRINA_SOFFERENZA`): se ne fa più di quanto se ne
//      vende;
//   2. quanto pesano i primi cinque gusti sul venduto;
//   3. il gusto che rende meno, fra quelli col margine;
//   4. quanto ricavo resta fuori per i gusti senza ricetta.
import { GIORNI_VETRINA_SOFFERENZA } from '../../lib/inventarioProduzione'
import { euro, quota } from '../../lib/formatoAnalisi'
import { kgTessera, intero, elenco, quanti } from './numeri'

const gg = (n) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(n)
// Un gusto con meno di 5 kg venduti nel periodo non fa classifica: un
// avanzo di due vaschette basta a dargli dieci giorni di vetrina.
const KG_MINIMI = 5

/**
 * @param {object} p
 * @param {Array} p.righe  le righe della tabella (`righeGusti`)
 * @param {{ n: number, euroStimati: number|null }} p.senzaRicetta
 * @returns {{ id: string, verso: 'meglio'|'peggio'|'info'|'azione', testo: string, azione?: string }[]}
 */
export function frasiProduzione({ righe = [], senzaRicetta = null } = {}) {
  const frasi = []
  const contano = righe.filter(r => r.vendKg >= KG_MINIMI)
  const totVenduto = righe.reduce((s, r) => s + Math.max(0, r.vendKg), 0)

  // 1. In vetrina troppo a lungo.
  const lenti = contano.filter(r => r.giorniVetrina != null && r.giorniVetrina >= GIORNI_VETRINA_SOFFERENZA)
    .sort((x, y) => y.giorniVetrina - x.giorniVetrina)
  if (lenti.length) {
    const p = lenti[0]
    frasi.push({
      id: 'vetrina', verso: 'peggio',
      testo: `${p.gusto} resta in vetrina ${gg(p.giorniVetrina)} giorni in media: se ne fa più di quanto se ne vende`
        + (lenti.length > 1 ? `. Anche ${elenco(lenti.slice(1, 3).map(r => r.gusto))}${lenti.length > 3 ? ` e altri ${intero(lenti.length - 3)}` : ''}` : ''),
    })
  }

  // 2. Quanto pesano i primi cinque (solo se i gusti sono abbastanza).
  if (righe.length >= 8 && totVenduto > 0) {
    const primi = [...righe].sort((x, y) => y.vendKg - x.vendKg).slice(0, 5)
    const kgPrimi = primi.reduce((s, r) => s + r.vendKg, 0)
    frasi.push({
      id: 'primi', verso: 'info',
      testo: `I cinque gusti più venduti fanno il ${quota((kgPrimi / totVenduto) * 100)} del venduto (${kgTessera(kgPrimi)}): ${elenco(primi.map(r => r.gusto))}`,
    })
  }

  // 3. Chi rende meno, fra quelli col margine.
  const conMargine = contano.filter(r => r.margPct != null)
  if (conMargine.length >= 3) {
    const peggiore = conMargine.reduce((x, y) => (y.margPct < x.margPct ? y : x))
    const media = conMargine.reduce((s, r) => s + r.margine, 0) / conMargine.reduce((s, r) => s + r.ricavo, 0) * 100
    if (media - peggiore.margPct >= 5) {
      frasi.push({
        id: 'margine', verso: 'peggio',
        testo: `${peggiore.gusto} rende il ${quota(peggiore.margPct)} del ricavo, il meno di tutti (la media è ${quota(media)}): costa ${euro(peggiore.fcKg, { decimali: 2 })} al kg`,
      })
    }
  }

  // 4. Il ricavo che non si vede.
  if (senzaRicetta?.n > 0 && senzaRicetta.euroStimati != null && senzaRicetta.euroStimati >= 1) {
    frasi.push({
      id: 'senzaRicetta', verso: 'azione', azione: 'gusti',
      testo: `${quanti(senzaRicetta.n, 'gusto senza ricetta vale', 'gusti senza ricetta valgono')} circa ${euro(senzaRicetta.euroStimati)} di ricavo che qui non entra: collegandoli alla ricetta entrano nel conto`,
    })
  }
  return frasi.slice(0, 4)
}
