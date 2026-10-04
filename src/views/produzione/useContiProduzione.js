// ── Tutti i conti della pagina Produzione, in un posto ───────────────────
//
// La pagina disegna e basta. Qui si chiamano le librerie già provate — il
// venduto dal motore (`inventarioProduzione`), ricavo e margine da
// `valutaGusti`, la vetrina, i giorni e le sedi da `produzioneQuadro` — e si
// mettono insieme. Nessuna formula nuova: chi cerca un numero sbagliato lo
// cerca in quelle librerie, dove ha i suoi test.
import { useMemo } from 'react'
import {
  totaliPerGusto, ricettaDelGusto, caselleDaSistemare, riassuntoCaselle, euroKgMedioFormati,
} from '../../lib/inventarioProduzione'
import { buildIngCosti } from '../../lib/foodcost'
import { valutaGusti, giorniRegistrati } from '../../lib/produzioneAnalisi'
import {
  bilancioVetrina, perGiornoDellaSettimana, sediAffiancate, andamentoGusti, buchiRegistrazione, giorniFalsati,
} from '../../lib/produzioneQuadro'
import { todayLocal, differenzaGiorni } from '../../lib/dateLocal'
import { useRicavoFlat } from '../../lib/useRicavoFlat'
import { useNomiGusti } from '../../lib/useNomiGusti'
import { normGusto } from '../../lib/normGusto'
import { colonneVenduto } from './colonneVenduto'
import { righeGusti } from './righeGusti'

const dentro = (r, da, a) => r?.data && (!da || r.data >= da) && (!a || r.data <= a)

export function useContiProduzione({
  rows = [], rowsPrev = [], dateFrom, dateTo, prevFrom = null, prevTo = null,
  ricettario, orgId, sedeId, sedi = [], partenza = null,
}) {
  const { ricavoFlatFor, formati } = useRicavoFlat(orgId, ricettario, sedeId)
  // I nomi del foglio collegati a mano alle ricette (MISTIC → MYSTIC).
  const { mappa: nomiGusti, collega } = useNomiGusti(orgId)
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])

  const valuta = (righe, da, a) => valutaGusti(totaliPerGusto(righe, { da, a }), {
    ricettaDi: (gusto) => ricettaDelGusto(ricettario, gusto, nomiGusti),
    ricavoKgDi: ricavoFlatFor,
    ingCosti, ricettario,
  })
  // Ricavo, food cost e margine per gusto. Il margine è null quando il gusto
  // non ha sia il ricavo sia il costo completo: è «non lo so», non 100%.
  const valutazione = useMemo(
    () => valuta(rows, dateFrom, dateTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, dateFrom, dateTo, ricettario, ingCosti, ricavoFlatFor, nomiGusti]
  )
  const totaliPrev = useMemo(() => {
    if (!Array.isArray(rowsPrev) || rowsPrev.length === 0) return null
    return valuta(rowsPrev, prevFrom, prevTo).totali
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsPrev, prevFrom, prevTo, ricettario, ingCosti, ricavoFlatFor, nomiGusti])

  // I giorni registrati DENTRO il periodo: le righe dei sette giorni prima
  // servono solo come giacenza di partenza e non contano.
  const copertura = useMemo(() => giorniRegistrati(rows, { da: dateFrom, a: dateTo }), [rows, dateFrom, dateTo])
  const oggiIso = todayLocal()
  const finePeriodo = dateTo && dateTo < oggiIso ? dateTo : oggiIso
  const registrazioneFerma = !!(copertura.ultimo && finePeriodo && copertura.ultimo < finePeriodo
    && differenzaGiorni(copertura.ultimo, finePeriodo) > 1)
  const daPartenza = !!(partenza && partenza.from === dateFrom && partenza.to === dateTo
    && partenza.ultimo && differenzaGiorni(partenza.ultimo, oggiIso) > 2)

  const nomeSede = (id) => (sedi || []).find(s => s.id === id)?.nome || null
  // I giorni senza niente fra il primo e l'ultimo registrato, sede per sede:
  // con tre negozi un buco di uno sparisce nell'unione degli altri due.
  const buchi = useMemo(() => {
    const per = {}
    for (const r of rows || []) {
      if (!dentro(r, dateFrom, dateTo)) continue
      const k = r.sede_id || '_'
      if (!per[k]) per[k] = []
      per[k].push(r)
    }
    return Object.entries(per).map(([id, righe]) => ({
      sede: Object.keys(per).length > 1 ? nomeSede(id) : null,
      giorni: buchiRegistrazione(giorniRegistrati(righe, { da: dateFrom, a: dateTo })),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dateFrom, dateTo, sedi])

  // Le caselle da sistemare, col giorno giusto (una per gusto, sede e giorno).
  const caselle = useMemo(() => caselleDaSistemare(rows, { da: dateFrom, a: dateTo }), [rows, dateFrom, dateTo])
  const riassunto = useMemo(() => riassuntoCaselle(caselle), [caselle])
  const daSistemare = useMemo(() => {
    const visti = new Set()
    return caselle.filter(c => {
      const k = `${c.sedeId}|${c.gusto}|${c.giornoDaSistemare}`
      if (visti.has(k)) return false
      visti.add(k)
      return true
    })
  }, [caselle])

  // I gusti senza ricetta, dal più venduto, e quanto valgono al prezzo medio
  // dei formati: è lo stesso prezzo con cui la Quadratura stima l'incasso.
  const perGusto = valutazione.righe
  const euroKgMedio = useMemo(() => euroKgMedioFormati(formati), [formati])
  const attivo = (r) => r.vendKg !== 0 || r.prodKg !== 0
  const senzaRicetta = useMemo(
    () => perGusto.filter(r => !r.haRicetta && attivo(r)).sort((a, b) => b.vendKg - a.vendKg),
    [perGusto]
  )
  // I nomi già collegati a mano che compaiono nel periodo: si vedono, e si
  // possono scollegare (un collegamento sbagliato sposta dei soldi).
  const collegati = useMemo(() => (nomiGusti ? perGusto.filter(r =>
    r.haRicetta && attivo(r) && nomiGusti.nomi[normGusto(r.gusto)]
    && normGusto(r.ricetta) !== normGusto(r.gusto)) : []), [perGusto, nomiGusti])
  const incompleti = useMemo(
    () => perGusto.filter(r => r.haRicetta && attivo(r) && !(r.haRicavo && r.fcCompleto)),
    [perGusto]
  )
  const kgSenzaRicetta = senzaRicetta.reduce((s, r) => s + r.vendKg, 0)

  // Lo scarto mai scritto non è «niente buttato»: nei dati di Mara vale 0 in
  // tutte le 7.013 righe, e quello che si butta finisce nel venduto.
  const scartoRegistrato = useMemo(
    () => (rows || []).some(r => dentro(r, dateFrom, dateTo) && (Number(r.scarto_g) || 0) > 0),
    [rows, dateFrom, dateTo]
  )

  // I conti nuovi della pagina (produzioneQuadro, provati coi dati veri).
  const vetrina = useMemo(() => bilancioVetrina(rows, { da: dateFrom, a: dateTo }), [rows, dateFrom, dateTo])
  // Il giorno della settimana, con i giorni falsati dalle rimanenze lasciate
  // a 0 (sui dati di Mara il martedì e il mercoledì: vedi giorniFalsati).
  const settimana = useMemo(
    () => giorniFalsati(perGiornoDellaSettimana(rows, { da: dateFrom, a: dateTo }), caselle),
    [rows, dateFrom, dateTo, caselle]
  )
  const sediQuadro = useMemo(
    () => sediAffiancate(rows, { da: dateFrom, a: dateTo }).map(s => ({ ...s, nome: nomeSede(s.sedeId) || 'Sede' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, dateFrom, dateTo, sedi]
  )
  const andamento = useMemo(() => andamentoGusti(rows, { da: dateFrom, a: dateTo }), [rows, dateFrom, dateTo])
  // Le settimane intere (non tagliate dal periodo né dai giorni registrati):
  // le sole che entrano nell'andamentino di ogni gusto.
  const settimaneIntere = useMemo(() => new Set(
    colonneVenduto(rows, { da: dateFrom, a: dateTo, passo: 'settimana', registrati: copertura })
      .filter(x => x.intera).map(x => x.key)
  ), [rows, dateFrom, dateTo, copertura])
  const righeTabella = useMemo(() => righeGusti(perGusto, andamento, settimaneIntere), [perGusto, andamento, settimaneIntere])

  return {
    valutazione, perGusto, totali: valutazione.totali, totaliPrev,
    copertura, registrazioneFerma, daPartenza, buchi,
    caselle, riassunto, daSistemare, nomeSede,
    euroKgMedio, senzaRicetta, collegati, incompleti, kgSenzaRicetta,
    euroSenzaRicetta: euroKgMedio != null ? kgSenzaRicetta * euroKgMedio : null,
    scartoRegistrato, vetrina, settimana, sedi: sediQuadro, andamento, righeTabella,
    nomiGusti, collega,
  }
}
