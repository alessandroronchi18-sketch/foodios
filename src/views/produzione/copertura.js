// ── Da dove vengono i numeri della Produzione, e cosa manca ──────────────
//
// ANALISI_DESIGN.md, regola 3: prima del numero, in una riga, la pagina dice
// su cosa si regge. Per la Produzione le fonti sono quattro: l'inventario
// della vetrina (quali giorni), i prezzi dei formati e le ricette (ricavo e
// margine sono stime), i nomi dei gusti (quelli senza ricetta valgono zero),
// lo scarto (se non si scrive finisce nel venduto). Ogni voce è una frase
// sola; i dettagli stanno dietro un tocco (`dettaglio`) o nella sezione «Da
// sistemare» più in basso, dove porta il pulsante.
//
// Prima queste cose erano sparse in quattro riquadri gialli in cima alla
// pagina, sopra i numeri, e la riga dei giorni registrati era scritta in
// piccolo sotto il titolo.
import { conGiorno, dataBreve } from '../../lib/produzioneAnalisi'
import { euro } from '../../lib/formatoAnalisi'
import { kg, intero, quanti, elenco } from './numeri'

/**
 * @param {object} p
 * @param {{ n: number, primo: string|null, ultimo: string|null, sedeGiorni: number }} p.copertura
 * @param {boolean} [p.registrazioneFerma]  dopo l'ultimo giorno registrato il periodo va avanti
 * @param {boolean} [p.daPartenza]  la finestra l'ha scelta la pagina, non l'utente
 * @param {{ sede: string|null, giorni: string[] }[]} [p.buchi]  giorni senza niente, sede per sede
 * @param {object|null} [p.confrontoInfo]  quello che il contenitore confronta davvero
 * @param {boolean} [p.scartoRegistrato]
 * @param {{ n: number }} [p.caselle]  il riassunto delle caselle da sistemare
 * @param {{ n: number, kgVenduti: number, euroStimati: number|null }} [p.senzaRicetta]
 * @param {string[]} [p.incompleti]  gusti con la ricetta ma senza prezzo o costo completo
 * @param {{ inventario?: Function, gusti?: Function, caselle?: Function, giorni?: Function, giorniAperti?: boolean }} [p.azioni]
 */
/** Quanti giorni passano fra due date ISO (0 se manca una). */
export function giorniFra(da, a) {
  if (!da || !a) return 0
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${da}T12:00:00Z`)) / 86400000)
}
/** Oltre quanti giorni dall'ultimo inventario lo si dice «fermo». */
export const GIORNI_INVENTARIO_FERMO = 7

export function vociCopertura({
  copertura, registrazioneFerma = false, daPartenza = false, buchi = [], oggi = null,
  confrontoInfo = null, scartoRegistrato = true, caselle = null,
  senzaRicetta = null, incompleti = [], azioni = {},
}) {
  const voci = []
  if (!copertura || !copertura.n) return voci

  // 1. L'inventario: quali giorni, e se si ferma prima della fine del periodo.
  const giorni = copertura.n === 1
    ? `Un giorno registrato, ${conGiorno('il', copertura.primo)}`
    : `${intero(copertura.n)} giorni registrati, ${conGiorno('dal', copertura.primo)} ${conGiorno('al', copertura.ultimo)}`
  const coiBuchi = buchi.filter(b => b.giorni?.length)
  voci.push({
    id: 'inventario',
    stato: registrazioneFerma ? 'parziale' : 'ok',
    breve: registrazioneFerma ? `inventario fermo ${conGiorno('al', copertura.ultimo)}` : undefined,
    sistemabile: registrazioneFerma,
    testo: giorni + (daPartenza
      ? ': ti mostro i due mesi fino all\'ultimo giorno registrato'
      : registrazioneFerma ? `; dopo ${conGiorno('il', copertura.ultimo)} non c'è niente di registrato` : ''),
    // Un giorno senza niente può essere una chiusura o una dimenticanza: la
    // pagina non lo sa, quindi lo dice a richiesta e non lo chiama errore.
    dettaglio: coiBuchi.length
      ? `Giorni senza niente registrato (chiusura o dimenticanza): ${coiBuchi.map(b => `${b.sede ? `${b.sede} ` : ''}${b.giorni.slice(0, 4).map(dataBreve).join(', ')}${b.giorni.length > 4 ? ` e altri ${intero(b.giorni.length - 4)}` : ''}`).join('; ')}`
      : undefined,
    // Il calendario dei giorni si apre da qui; senza calendario, se i dati si
    // fermano, il pulsante porta a registrare.
    azione: azioni.giorni ? { etichetta: azioni.giorniAperti ? 'Chiudi i giorni' : 'Vedi i giorni', onClick: azioni.giorni }
      : registrazioneFerma && azioni.inventario ? { etichetta: 'Registra', onClick: azioni.inventario } : null,
  })

  // 1b. Il venduto è «fino all'ultimo giorno registrato»: se quel giorno è
  // lontano da oggi lo si dice con l'azione (06/10/2026: a ottobre il 31/08
  // sembrava il dato di oggi).
  const fermoDa = daPartenza ? giorniFra(copertura.ultimo, oggi) : 0
  if (fermoDa > GIORNI_INVENTARIO_FERMO) {
    voci.push({
      id: 'inventarioFermo', stato: 'parziale', sistemabile: true,
      breve: `inventario fermo ${conGiorno('al', copertura.ultimo)}`,
      testo: `L'inventario si ferma ${conGiorno('al', copertura.ultimo)}: sono ${intero(fermoDa)} giorni senza niente di registrato, il venduto di dopo non c'è`,
      azione: azioni.inventario ? { etichetta: 'Registra', onClick: azioni.inventario } : null,
    })
  }

  // 2. Il confronto, quando si fa. Quando non si fa lo dicono la barra del
  // periodo e la tessera del venduto, con il motivo.
  if (confrontoInfo?.ok && confrontoInfo.from && confrontoInfo.to) {
    const annoConfronto = confrontoInfo.to.slice(0, 4)
    const annoPeriodo = (copertura.ultimo || '').slice(0, 4)
    const stesse = confrontoInfo.giorniPrev === copertura.sedeGiorni
    voci.push({
      id: 'confronto', stato: 'ok',
      testo: `Confronto con ${dataBreve(confrontoInfo.from)}–${dataBreve(confrontoInfo.to)}${annoConfronto !== annoPeriodo ? ` del ${annoConfronto}` : ''}`
        + (stesse
          ? ', con le stesse giornate registrate'
          : `, ${intero(confrontoInfo.giorniPrev || 0)} giornate registrate contro ${intero(copertura.sedeGiorni)}`),
    })
  }

  // 3. Ricavo e margine sono stime, e si dice con che cosa.
  voci.push({
    id: 'stima', stato: 'stima', breve: 'ricavo e margine stimati',
    testo: 'ricavo: tutti i chili venduti per il prezzo medio dei formati, senza IVA, come nel Mese e in «Torna il conto?»; margine: costo delle ricette ai prezzi di oggi',
  })

  // 4. I gusti che non trovano la ricetta valgono zero euro.
  if (senzaRicetta?.n > 0) {
    voci.push({
      id: 'senzaRicetta', stato: 'parziale', sistemabile: true,
      breve: quanti(senzaRicetta.n, 'gusto senza ricetta', 'gusti senza ricetta'),
      // Dal 04/10 quei chili sono nel ricavo (decisione del titolare): senza
      // ricetta manca il costo, quindi restano fuori dal margine.
      testo: `${quanti(senzaRicetta.n, 'gusto', 'gusti')} senza ricetta: ${kg(senzaRicetta.kgVenduti)} kg venduti fuori dal margine`
        + (senzaRicetta.euroStimati != null ? ` (circa ${euro(senzaRicetta.euroStimati)} di ricavo senza IVA)` : ''),
      azione: azioni.gusti ? { etichetta: senzaRicetta.n === 1 ? 'Collegalo' : 'Collegali', onClick: azioni.gusti } : null,
    })
  }
  if (incompleti.length > 0) {
    voci.push({
      id: 'incompleti', stato: 'parziale', sistemabile: true,
      breve: quanti(incompleti.length, 'gusto senza prezzo', 'gusti senza prezzo'),
      testo: `${quanti(incompleti.length, 'gusto', 'gusti')} con la ricetta ma senza prezzo o costo completo: margine non calcolato`,
      dettaglio: elenco(incompleti.slice(0, 8)) + (incompleti.length > 8 ? ` e altri ${intero(incompleti.length - 8)}` : ''),
    })
  }

  // 5. Le caselle dell'inventario da sistemare.
  if (caselle?.n > 0) {
    voci.push({
      id: 'caselle', stato: 'parziale', sistemabile: true,
      breve: `${quanti(caselle.n, 'casella', 'caselle')} da sistemare`,
      testo: `${quanti(caselle.n, 'casella', 'caselle')} da sistemare nell'inventario`,
      azione: azioni.caselle ? { etichetta: 'Vedi', onClick: azioni.caselle } : null,
    })
  }

  // 6. Lo scarto mai scritto non è «niente buttato».
  if (!scartoRegistrato) {
    // Non si sistema all'indietro: si comincia a scriverlo da domani.
    voci.push({ id: 'scarto', stato: 'manca', breve: 'scarto mai scritto', testo: 'lo scarto, quindi quello che si butta è contato nel venduto' })
  }
  return voci
}
