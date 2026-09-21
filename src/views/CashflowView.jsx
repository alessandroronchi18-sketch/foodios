// Cashflow Predittivo 30/60/90 giorni
//
// Combina:
//   - Saldo cassa dichiarato dall'utente (se non lo dichiara, NON è zero: è ignoto)
//   - Ricavi attesi (proiezione da storico vendite ultimi 60gg, media giornaliera × giorni)
//   - Uscite pianificate da cashflow_eventi (stipendi, fatture, IVA, affitti)
//   - Fatture fornitori scadute/in scadenza da public.fatture
//
// Output: timeline mensile/settimanale + 3 scenari (ottimistico, atteso, pessimistico)
// + alert su giorni con cassa attesa negativa.

import React, { useEffect, useMemo, useState } from 'react'
import { sload, ssave } from '../lib/storage'
import { caricaChiusure } from '../lib/chiusure'
import { supabase } from '../lib/supabase'
import { color as T, font, ui3, ui } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiExplainButton from '../components/AiExplainButton'
import AiPageHero from '../components/AiPageHero'
import { useConfirm } from '../components/ConfirmModal'
import { residuoFattura, scadenzaFattura, riepilogoFatture } from '../lib/fatture'
// Gli importi si scrivono all'italiana e col simbolo DOPO la cifra. Il `fmt0`
// che stava qui dentro era `toLocaleString` nudo: i KPI di questa pagina
// scrivevano «-43.051» senza dire di cosa — euro, pezzi, giorni. In una
// schermata che parla solo di soldi il simbolo non è un vezzo.
import { fmt0, leggiPrezzoKg, letturaPrezzoKg } from '../lib/formatIt'
// Le date si confrontano come GIORNI ('AAAA-MM-GG'), mai come istanti:
// `toISOString()` su una mezzanotte locale restituisce il giorno PRIMA (in
// Italia l'offset è +1 o +2), e da lì nasceva una previsione che partiva da
// ieri. `isoLocale`, la copia locale di `formatLocalDate` che stava qui, è
// sparita: due regole per la stessa cosa prima o poi divergono.
import { todayLocal, giorniFaLocal, soloData, aggiungiGiorni, differenzaGiorni } from '../lib/dateLocal'

// Il bordeaux del marchio è il colore delle AZIONI; il rosso segnale è quello
// degli ALLARMI (scelta del titolare, 14/09/2026). Una cassa che va sotto zero
// è un allarme, non un pulsante: prima era dipinta col bordeaux, e nella
// stessa schermata il riquadro rosso dell'avviso aveva il fondo d'allarme e il
// bordo d'azione.
const BRAND = T.brand
const ALERT = T.red
const SOFT = T.textSoft
const TXT = T.text
const MID = T.textMid
const CARD = T.bgCard
const BORDER = T.border
const GREEN = T.green
const BIANCO = T.white

const SK_CASH_SETTINGS = 'pasticceria-cashflow-settings-v1'  // { saldoOggi, fissi: [{label, importo, frequenza}] }

const TIPI_EVENTO = [
  { id: 'uscita',    lbl: 'Uscita generica' },
  { id: 'stipendio', lbl: 'Stipendio dipendente' },
  { id: 'iva',       lbl: 'IVA / imposte' },
  { id: 'affitto',   lbl: 'Affitto' },
  { id: 'entrata',   lbl: 'Entrata pianificata' },
  { id: 'altro',     lbl: 'Altro' },
]

const GIORNI_ARRETRATO_VIVO = 90
const GIORNI_STORICO = 60

// I mesi scritti a mano, e non `toLocaleDateString` su un `new Date(iso)`.
// `new Date('2026-09-24')` è mezzanotte a Greenwich: a ovest di Greenwich
// quella data si rilegge come il 23. Qui il giorno non passa mai da un
// istante, quindi non c'è fuso che lo possa spostare.
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/** '2026-09-24' → «24 settembre». '' se non è un giorno. */
export function giornoEsteso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return ''
  const mese = MESI[Number(m[2]) - 1]
  return mese ? `${Number(m[3])} ${mese}` : ''
}

/** '2026-09-24' → «24 set 2026». '' se non è un giorno. */
export function giornoBreve(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return ''
  const mese = MESI_BREVI[Number(m[2]) - 1]
  return mese ? `${m[3]} ${mese} ${m[1]}` : ''
}

/**
 * Legge un importo scritto a mano, con la regola italiana: il punto sono le
 * migliaia, la virgola i decimali.
 *
 * `Number('1.250')` risponde 1,25: mille volte meno di quello che intende chi
 * scrive «1.250» su un campo che chiede quanti soldi ha in banca. Qui si passa
 * da `leggiPrezzoKg`, che è la regola del progetto, con una differenza sola:
 * un saldo di cassa può essere NEGATIVO — il conto scoperto esiste — e il
 * segno meno davanti va tenuto.
 *
 * Restituisce `null` se non è un numero: «non lo so» non è zero.
 */
export function leggiImporto(testo) {
  const g = String(testo ?? '').replace(/€/g, '').trim()
  if (!g) return null
  const negativo = g.startsWith('-') || g.startsWith('−')
  const v = leggiPrezzoKg(negativo ? g.slice(1).trim() : g)
  if (v === null) return null
  return negativo ? -v : v
}

/** Il numero di un evento, che nel database non è mai nullo ma può arrivare storto. */
function importoEvento(e) {
  const n = Number(e?.importo)
  return Number.isFinite(n) ? n : 0
}

export default function CashflowView({ orgId, sedeId, sedi = [], notify }) {
  const notifyFn = notify || ((m) => { try { console.debug('[cashflow]', m) } catch {} })
  const isMobile = useIsMobile()
  // Il tablet si tocca col dito esattamente come un telefono: i bersagli non
  // si decidono sulla larghezza dello schermo ma sul dito, ed è quello che fa
  // `ui3(isMobile, isTablet, ui.ctrlH)` — 44px su telefono E tablet.
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const [chiusure, setChiusure] = useState([])
  const [fatture, setFatture] = useState([])
  const [eventi, setEventi] = useState([])
  // `saldoOggi: null` vuol dire «non me l'ha ancora detto». Prima era `0`, e
  // zero è un numero: la pagina ci costruiva sopra una previsione e annunciava
  // in rosso il giorno in cui la cassa sarebbe andata sotto. Sui dati veri di
  // Mara dei Boschi, il 19/09/2026, scriveva «Attenzione: cassa attesa
  // negativa il 19 settembre — saldo previsto −554 €» senza sapere se in banca
  // ci fossero cinquantamila euro. Un saldo che manca non è un saldo a zero.
  const [settings, setSettings] = useState({ saldoOggi: null, fissi: [] })
  const [orizzonte, setOrizzonte] = useState(60)
  const [loading, setLoading] = useState(true)
  const [showAddEvento, setShowAddEvento] = useState(false)
  const [newEv, setNewEv] = useState({ tipo: 'uscita', descrizione: '', data_attesa: '', importo: '' })

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      // Le chiusure NON stanno più in user_data: dalla migrazione del
      // 07/09/2026 vivono in public.chiusure_cassa. Leggere il vecchio blob
      // significava leggere una fotografia ferma a giugno: il ricavo medio
      // usciva da dati vecchi, o da zero dati.
      const oggiIso = todayLocal()
      const inizioIso = giorniFaLocal(GIORNI_STORICO - 1)
      const [chiu, fattRes, evRes, set] = await Promise.all([
        // `tutteLeSedi: true`: le fatture da pagare non hanno una sede, e
        // mettere i ricavi di un negozio contro le uscite di tutti dava un
        // saldo previsto che non è di nessuno.
        caricaChiusure(orgId, sedeId, { from: inizioIso, to: oggiIso, tutteLeSedi: true }),
        // `stato` è una colonna che ammette il nulla (il valore di serie è
        // 'da_pagare', ma un import che scrive NULL esplicito lo lascia
        // vuoto). `neq('stato','pagata')` da solo butta via anche quelle
        // righe: in SQL `NULL <> 'pagata'` non è vero, è ignoto. Una fattura
        // senza stato sparirebbe dalla previsione di cassa senza un fiato.
        supabase.from('fatture')
          .select('id, fornitore, data_fattura, data_scadenza, totale, importo_pagato, stato')
          .eq('organization_id', orgId)
          .or('stato.is.null,stato.neq.pagata'),
        supabase.from('cashflow_eventi').select('*').eq('organization_id', orgId).eq('stato', 'pianificato').order('data_attesa'),
        sload(SK_CASH_SETTINGS, orgId, null),
      ])
      if (!alive) return
      setChiusure(Array.isArray(chiu) ? chiu : [])
      setFatture(fattRes.data || [])
      setEventi(evRes.data || [])
      setSettings(set && typeof set === 'object' ? { saldoOggi: null, fissi: [], ...set } : { saldoOggi: null, fissi: [] })
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Il saldo lo sappiamo o no? È la domanda da cui dipende tutta la pagina.
  // Zero è una risposta legittima (la cassa vuota esiste), `null` no: quello
  // vuol dire che nessuno l'ha mai scritto.
  const saldoNoto = settings.saldoOggi !== null && settings.saldoOggi !== undefined
    && Number.isFinite(Number(settings.saldoOggi))
  const saldoPartenza = saldoNoto ? Number(settings.saldoOggi) : 0

  // Testo digitato nel campo del saldo: separato dal valore salvato, così una
  // battuta di tasti non fa una scrittura sul database.
  const [saldoTesto, setSaldoTesto] = useState('')
  const [savingEvento, setSavingEvento] = useState(false)
  useEffect(() => {
    // `settings.saldoOggi ? ... : ''` nascondeva lo zero: chi dichiarava la
    // cassa vuota riapriva la pagina e trovava il campo bianco, come se non
    // avesse mai risposto. Qui si distingue il nulla dallo zero.
    setSaldoTesto(settings.saldoOggi == null ? '' : String(settings.saldoOggi))
  }, [settings.saldoOggi])

  // Riepilogo delle fatture aperte, con quante scadenze sono STIMATE.
  const riepilogo = useMemo(() => riepilogoFatture(fatture), [fatture])

  // Fatture già scadute prima di oggi: l'arretrato. Prima non entrava da
  // nessuna parte, perché la previsione guarda solo in avanti — ed è il
  // numero più grande della pagina.
  //
  // Ma va diviso in due, e i dati veri lo spiegano: sui 3.104 documenti
  // caricati da Mara, la gran parte è scaduta da oltre un anno.
  // Non è un debito: sono fatture pagate davvero e mai segnate come pagate in
  // Foodos, perché l'import le porta dentro tutte come "da pagare".
  // Buttarle nel primo giorno della previsione renderebbe il grafico
  // illeggibile e ogni giorno rosso.
  //
  // Quindi: nella cassa entra solo lo scaduto RECENTE (90 giorni), che è
  // quello che un fornitore aspetta davvero adesso; il resto si mostra a
  // parte, dicendo cos'è e cosa fare.
  const arretrato = useMemo(() => {
    const oggiIso = todayLocal()
    const limiteIso = giorniFaLocal(GIORNI_ARRETRATO_VIVO)
    let recente = 0, nRecente = 0, vecchio = 0, nVecchio = 0
    for (const f of fatture) {
      const sc = scadenzaFattura(f).iso
      if (!sc || sc >= oggiIso) continue
      const res = residuoFattura(f)
      if (sc >= limiteIso) { recente += res; nRecente++ }
      else { vecchio += res; nVecchio++ }
    }
    return {
      recente, nRecente, vecchio, nVecchio,
      totale: recente + vecchio, n: nRecente + nVecchio,
    }
  }, [fatture])

  // Media ricavi giornalieri ultimi 60gg.
  // La media si porta dietro su QUANTE giornate è calcolata: con zero
  // giornate non è "0 €", è "non lo so", e la pagina lo deve dire invece di
  // stampare uno zero come se fosse una misura.
  //
  // E si divide per i GIORNI DI CALENDARIO coperti, non per il numero di
  // chiusure trovate: una gelateria chiusa il lunedì, con 23 chiusure in 60
  // giorni, non incassa la media di quelle 23 tutti i giorni. Dividendo per
  // 23 la previsione dei ricavi risultava gonfiata di oltre il 50%, e in una
  // pagina che serve a capire se ce la fai a pagare i fornitori l'errore va
  // nella direzione peggiore.
  const { mediaGiornaliera, giorniConIncasso, giorniCoperti } = useMemo(() => {
    // La finestra è fatta di GIORNI, e i giorni si confrontano come stringhe.
    // Prima `new Date(c.data)` leggeva '2026-09-16' come mezzanotte a
    // Greenwich e lo metteva contro l'istante di adesso: la chiusura di oggi
    // entrava nella media solo dopo le 02:00, e il bordo della finestra si
    // spostava di un giorno a seconda dell'ora in cui si apriva la pagina.
    // Su una media che decide la previsione di cassa, è un giorno di incasso
    // che compare e sparisce da solo.
    const oggiIso = todayLocal()
    const inizioIso = giorniFaLocal(GIORNI_STORICO - 1)
    let tot = 0, n = 0
    let primaData = null
    for (const c of (chiusure || [])) {
      const g = soloData(c.data)
      if (!g || g < inizioIso || g > oggiIso) continue
      tot += Number(c.kpi?.totV || c.totale || 0); n++
      if (!primaData || g < primaData) primaData = g
    }
    if (n === 0) return { mediaGiornaliera: 0, giorniConIncasso: 0, giorniCoperti: 0 }
    // Giorni di calendario coperti dai dati: dal primo giorno registrato a
    // oggi, non oltre la finestra dello storico. In giorni, non in
    // millisecondi: il 25 ottobre ne dura 25 di ore e il conto perdeva un
    // giorno al denominatore, gonfiando la media.
    const coperti = Math.max(1, differenzaGiorni(primaData, oggiIso) + 1)
    return { mediaGiornaliera: tot / coperti, giorniConIncasso: n, giorniCoperti: coperti }
  }, [chiusure])
  const mediaMisurata = giorniConIncasso > 0 && mediaGiornaliera > 0

  // Gli eventi già passati e ancora «pianificati». Non erano di nessuno: la
  // previsione parte da oggi e li lasciava fuori, ma restavano in elenco come
  // se contassero. Un affitto segnato per il 1° del mese e mai pagato è un
  // soldo che deve ancora uscire: pesa adesso, come lo scaduto dei fornitori.
  const eventiArretrati = useMemo(() => {
    const oggiIso = todayLocal()
    return eventi.filter(e => { const g = soloData(e.data_attesa); return g && g < oggiIso })
  }, [eventi])

  // Simulazione: per ogni giorno da oggi → oggi+orizzonte, calcola saldo atteso.
  const timeline = useMemo(() => {
    const days = []
    let saldoAtteso = saldoPartenza
    let saldoOttim = saldoAtteso
    let saldoPess = saldoAtteso
    // Le date si scrivono coi campi LOCALI. Con toISOString() su una
    // mezzanotte locale il giorno che ne esce è quello PRIMA (in Italia
    // l'offset è +1/+2), quindi la previsione partiva da ieri e l'allarme
    // rosso annunciava come futuro un giorno già passato.
    const oggiIsoTl = todayLocal()
    const limiteArretratoIso = giorniFaLocal(GIORNI_ARRETRATO_VIVO)

    for (let i = 0; i <= orizzonte; i++) {
      // I giorni si contano in giorni. Sommando `i * 86400000` a una
      // mezzanotte locale, la notte del cambio ora — il 25 ottobre 2026 —
      // il passo di 24 ore cadeva alle 23:00 del giorno prima: la previsione
      // ripeteva un giorno e ne saltava un altro, e il primo giorno rosso
      // veniva annunciato con la data sbagliata.
      const iso = aggiungiGiorni(oggiIsoTl, i)
      const ricavoStimato = mediaGiornaliera

      // Fatture in scadenza quel giorno.
      // Audit 2026-09-09: qui il confronto era `f.data_scadenza === iso`, ma in
      // produzione data_scadenza e' vuota su tutte le fatture (gli XML di
      // questi fornitori non portano il blocco DatiPagamento), quindi non
      // combaciava MAI. Sommato al fatto che la query chiedeva colonne
      // inesistenti (fornitore_nome, importo_lordo -> PostgREST 42703 -> data
      // null), le uscite risultavano sempre zero: il grafico mostrava una cassa
      // in salita e nessun giorno rosso, mentre lo Scadenziario contava 81.079 €
      // già scaduti sulla stessa base dati.
      // scadenzaFattura deriva la data quando manca, e residuoFattura sottrae
      // gli acconti già versati invece di contare il lordo.
      const usciteFatture = fatture
        .filter(f => {
          const sc = scadenzaFattura(f).iso
          if (!sc) return false
          if (sc === iso) return true
          // Al giorno 0 si aggiunge lo scaduto RECENTE: quello che un
          // fornitore aspetta adesso. Lo scaduto vecchio di oltre 90 giorni
          // resta fuori dalla cassa e si mostra a parte: quasi sempre sono
          // fatture pagate e non segnate come pagate.
          return i === 0 && sc < iso && sc >= limiteArretratoIso
        })
        .reduce((s, f) => s + residuoFattura(f), 0)

      // Eventi cashflow quel giorno, più — al giorno 0 — quelli rimasti
      // indietro. `soloData` perché la colonna è una data, ma un evento
      // arrivato da un import potrebbe portarsi dietro anche l'ora.
      const evGiorno = eventi.filter(e => soloData(e.data_attesa) === iso)
      const evDaContare = i === 0 ? [...eventiArretrati, ...evGiorno] : evGiorno
      const usciteEv = evDaContare.filter(e => e.tipo !== 'entrata').reduce((s, e) => s + importoEvento(e), 0)
      const entrateEv = evDaContare.filter(e => e.tipo === 'entrata').reduce((s, e) => s + importoEvento(e), 0)

      // Saldo atteso = saldo - uscite + ricavi stimati + entrate eventi
      saldoAtteso += ricavoStimato + entrateEv - usciteFatture - usciteEv
      saldoOttim  += (ricavoStimato * 1.20) + entrateEv - usciteFatture - usciteEv
      saldoPess   += (ricavoStimato * 0.70) + entrateEv - usciteFatture - usciteEv

      days.push({
        iso,
        ricavoStimato, usciteFatture, usciteEv, entrateEv,
        saldoAtteso, saldoOttim, saldoPess,
        alertNegativo: saldoAtteso < 0,
      })
    }
    return days
  }, [saldoPartenza, mediaGiornaliera, fatture, eventi, eventiArretrati, orizzonte])

  // Alert: primo giorno con saldo atteso negativo.
  //
  // Solo se il saldo di partenza lo sappiamo. Senza, questa riga non è una
  // previsione: è la somma delle uscite, che parte sotto zero per definizione
  // e metterebbe un allarme rosso in cima alla pagina di chiunque non abbia
  // ancora scritto quanto ha in banca — cioè, oggi, di tutti.
  const primoGiornoRosso = useMemo(
    () => (saldoNoto ? timeline.find(d => d.alertNegativo) : undefined),
    [timeline, saldoNoto])
  const finaleAtteso = timeline[timeline.length - 1]

  async function salvaSaldo(testo) {
    // «1.250» sono milleduecentocinquanta, non 1,25: il punto sono le
    // migliaia e la virgola i decimali. Con `Number(testo)` chi scriveva il
    // saldo all'italiana lo salvava mille volte più piccolo, e la previsione
    // di cassa nasceva da lì.
    const letto = leggiImporto(testo)
    if (letto === null && String(testo || '').trim() !== '') {
      notifyFn('Non ho capito il saldo: scrivilo come un numero (per esempio 12.500 oppure 12500,50).', false)
      return
    }
    const next = { ...settings, saldoOggi: letto }
    // Save-first: persist PRIMA di setState. Se save fallisce non aggiorniamo la UI
    // e mostriamo l'errore - niente drift state↔DB (audit 2026-06-17 CRITICAL).
    try {
      await ssave(SK_CASH_SETTINGS, next, orgId, null)
      setSettings(next)
      // Fra 1,25 € e 1.250 € ci sono tre ordini di grandezza. La regola
      // italiana vince, ma chi ha copiato il numero da un gestionale inglese
      // deve poterlo vedere subito, non a fine mese.
      const lettura = letturaPrezzoKg(String(testo || '').replace(/^[-−]/, ''))
      if (lettura.ambiguo) {
        notifyFn(`Ho letto ${fmt0(letto)}. Se intendevi ${lettura.comeDecimale} scrivilo con la virgola.`, true)
      }
    } catch (e) {
      console.error('[cashflow] salvaSaldo', e)
      notifyFn('Non ho potuto salvare il saldo: controlla la connessione e riprova.', false)
    }
  }

  async function aggiungiEvento() {
    // Prima il bottone OK, con un campo vuoto, non faceva NIENTE e non
    // diceva niente: un `return` muto. Ora nomina il campo che manca.
    if (!newEv.descrizione?.trim()) { notifyFn('Serve una descrizione: scrivi cos\'è (stipendi, IVA, affitto…).', false); return }
    if (!newEv.data_attesa) { notifyFn('Serve la data in cui te lo aspetti.', false); return }
    // Stessa regola del saldo: il punto sono le migliaia.
    const importo = leggiImporto(newEv.importo)
    if (importo === null || !(importo > 0)) { notifyFn('Serve un importo maggiore di zero.', false); return }
    if (savingEvento) return
    setSavingEvento(true)
    try {
      const { data, error } = await supabase.from('cashflow_eventi').insert({
        organization_id: orgId, sede_id: sedeId || null,
        tipo: newEv.tipo,
        descrizione: newEv.descrizione.trim(),
        data_attesa: newEv.data_attesa,
        importo,
      }).select().single()
      if (error) throw error
      setEventi(prev => [...prev, data].sort((a, b) => (a.data_attesa || '').localeCompare(b.data_attesa || '')))
      setNewEv({ tipo: 'uscita', descrizione: '', data_attesa: '', importo: '' })
      setShowAddEvento(false)
    } catch (e) {
      console.error('[cashflow] aggiungiEvento', e)
      notifyFn('Non ho potuto salvare l\'evento: controlla la connessione e riprova.', false)
    } finally { setSavingEvento(false) }
  }

  async function eliminaEvento(id) {
    // Audit 2026-07-01 MEDIUM: confirm() nativo -> ConfirmModal in-app.
    const ok = await confirmDialog({
      title: 'Eliminare evento?',
      message: 'L\'evento verrà rimosso dal cashflow. Le proiezioni successive saranno ricalcolate.',
      confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      // supabase-js non lancia: restituisce { error }. Senza leggerlo, il
      // catch non scattava mai e la riga spariva dalla lista comunque, con il
      // messaggio "Evento eliminato" su una cancellazione non avvenuta: al
      // ricarico l'evento tornava.
      const { error } = await supabase.from('cashflow_eventi').delete()
        .eq('id', id).eq('organization_id', orgId)
      if (error) throw error
      setEventi(prev => prev.filter(e => e.id !== id))
    } catch (e) { notifyFn('Errore: ' + (e?.message || 'eliminazione fallita'), false) }
  }

  // Mini chart SVG: linea atteso/ottim/pessim
  const chartSvg = useMemo(() => {
    if (timeline.length === 0) return null
    const W = isMobile ? 320 : 800
    const H = 240
    const PAD = 36
    const all = timeline.flatMap(d => [d.saldoOttim, d.saldoAtteso, d.saldoPess])
    const max = Math.max(...all, 0)
    const min = Math.min(...all, 0)
    const range = (max - min) || 1
    const xOf = i => PAD + (i / (timeline.length - 1)) * (W - 2 * PAD)
    const yOf = v => H - PAD - ((v - min) / range) * (H - 2 * PAD)
    const line = pts => pts.map((p, i) => (i === 0 ? 'M' : 'L') + xOf(i).toFixed(1) + ',' + yOf(p).toFixed(1)).join(' ')
    const lineAtt = line(timeline.map(d => d.saldoAtteso))
    const lineOtt = line(timeline.map(d => d.saldoOttim))
    const linePess = line(timeline.map(d => d.saldoPess))
    const y0 = yOf(0)
    const ultimo = timeline[timeline.length - 1]
    // Un disegno senza didascalia, per chi legge con la sintesi vocale, è un
    // riquadro vuoto. Qui il grafico si racconta in una riga.
    const didascalia = `Andamento della cassa nei prossimi ${orizzonte} giorni: `
      + `da ${fmt0(timeline[0].saldoAtteso)} a ${fmt0(ultimo.saldoAtteso)}`
      + (primoGiornoRosso ? `, sotto zero dal ${giornoEsteso(primoGiornoRosso.iso)}` : ', sempre sopra zero')
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={didascalia}>
        {min < 0 && (
          <rect x={PAD} y={y0} width={W - 2 * PAD} height={H - PAD - y0} fill={T.redLight} opacity="0.9" />
        )}
        <line x1={PAD} y1={y0} x2={W - PAD} y2={y0} stroke={T.textFaint} strokeDasharray="3,3" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={T.borderStr} />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={T.borderStr} />
        <path d={lineOtt} stroke={GREEN} strokeWidth="1.5" fill="none" strokeOpacity="0.6" strokeDasharray="4,4" />
        <path d={linePess} stroke={BRAND} strokeWidth="1.5" fill="none" strokeOpacity="0.6" strokeDasharray="4,4" />
        <path d={lineAtt} stroke={BRAND} strokeWidth="2.4" fill="none" />
        {primoGiornoRosso && (() => {
          const i = timeline.indexOf(primoGiornoRosso)
          if (i < 0) return null
          // Il pallino segna il giorno in cui si va sotto: è un allarme, e
          // prende il rosso degli allarmi.
          return <circle cx={xOf(i)} cy={yOf(primoGiornoRosso.saldoAtteso)} r="4" fill={ALERT} stroke={BIANCO} strokeWidth="2" />
        })()}
        <text x={PAD} y={20} fontSize={font.size.sm} fontWeight="600" fill={MID}>{fmt0(max)}</text>
        <text x={PAD} y={H - PAD + 16} fontSize={font.size.sm} fontWeight="600" fill={MID}>{fmt0(min)}</text>
        <text x={W - PAD} y={H - PAD + 16} fontSize={font.size.sm} fontWeight="600" fill={MID} textAnchor="end">+{orizzonte}gg</text>
      </svg>
    )
  }, [timeline, isMobile, primoGiornoRosso, orizzonte])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <AiPageHero
        eyebrow="AI · Cashflow predittivo"
        title="Avrò i soldi"
        accentText="per pagare?"
        // Le fatture da pagare sono di TUTTA l'azienda (la query su `fatture`
        // non filtra per sede), e ora anche i ricavi: prima i ricavi erano di
        // una sede sola e le uscite di tutte, quindi il saldo previsto
        // mescolava due perimetri diversi senza dirlo. La cassa di un'azienda
        // con più negozi è una: il perimetro giusto è quello aziendale, e va
        // scritto.
        subtitle={sedi && sedi.length > 1
          ? "Previsione di cassa di TUTTA l'azienda, non della singola sede: le fatture da pagare sono aziendali, e la cassa da cui escono i soldi è una. Saldo attuale + ricavi attesi − uscite pianificate, con l'avviso sui giorni in rosso prima che arrivino."
          : "Saldo attuale + ricavi attesi − uscite pianificate, con l'avviso sui giorni in rosso prima che arrivino."}
        statusBadge="LIVE"
        stats={[
          { n: '30/60/90', l: 'Orizzonti (giorni)' },
          { n: '3', l: 'Scenari' },
          // Qui non c'è nessun Monte Carlo: gli scenari sono il ricavo medio
          // più il 20% e meno il 30%. Dichiarare un algoritmo che non c'è fa
          // sembrare più solida una stima che resta una stima.
          { n: '+20% / −30%', l: 'Banda scenari' },
        ]}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : (
        <>
          {/* Setup saldo oggi */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: isMobile ? 14 : 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, flexWrap: 'wrap' }}>
              <div style={{ flex: isMobile ? '1 1 100%' : 'none' }}>
                <label htmlFor="cashflow-saldo" style={{ display: 'block', fontSize: font.size.sm, fontWeight: 700, color: SOFT, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Saldo cassa+banca oggi
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Il campo tiene il testo in locale e salva UNA volta,
                      quando esci dal campo. Prima ogni tasto faceva una
                      scrittura sul database, e l'input mostrava il valore
                      SALVATO invece di quello digitato: le cifre venivano
                      riscritte sotto le dita mentre scrivevi, e il controllo
                      anti-conflitto ti accusava di aver modificato i dati da
                      due posti insieme.
                      Il tipo è `text`, non `number`: su un campo numerico il
                      punto delle migliaia italiane viene letto dal browser
                      come un separatore decimale, e «1.250» diventa 1,25. */}
                  <input id="cashflow-saldo" type="text" inputMode="decimal" value={saldoTesto}
                    onChange={e => setSaldoTesto(e.target.value)}
                    onBlur={() => { if (String(saldoTesto) !== String(settings.saldoOggi ?? '')) salvaSaldo(saldoTesto) }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="es. 12.500"
                    style={{ width: isMobile ? '100%' : 140, maxWidth: 200, padding: '10px 12px', minHeight: ui3(isMobile, isTablet, ui.ctrlH), borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: font.size.lg, fontWeight: 700, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <span style={{ fontSize: font.size.xl, fontWeight: 700, color: MID }}>€</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200, fontSize: font.size.sm, color: SOFT, lineHeight: 1.5 }}>
                Inserisci quanto hai oggi su conto corrente + cassa. La proiezione usa la media ricavi degli ultimi 60 giorni e le scadenze in calendario.
              </div>
            </div>
            {!saldoNoto && (
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: T.amberLight, border: `1px solid ${T.amber}55`,
                borderRadius: 8, fontSize: font.size.sm, color: T.amberDark, lineHeight: 1.5,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <Icon name="warning" size={14} color={T.amberDark} />
                <div>
                  Non so da quanto parti: scrivi il <strong>saldo cassa+banca di oggi</strong> qui sopra.
                  Finché manca, qui sotto trovi solo quanto la cassa si muove — non se vai in rosso,
                  perché quello dipende da dove sei adesso.
                </div>
              </div>
            )}
          </div>

          {/* KPI scenari */}
          <div style={{ display: 'grid', gridTemplateColumns: ui3(isMobile, isTablet, ui.grid4), gap: 12, marginBottom: 16 }}>
            {finaleAtteso && (
              <>
                {/* Senza saldo di partenza questo numero non è una cassa: è
                    quanto la cassa si muove. Chiamarlo «Cassa fra 60gg»
                    voleva dire scrivere un saldo di bilancio che nessuno ha
                    mai dichiarato. */}
                <KPI
                  label={saldoNoto ? `Cassa fra ${orizzonte}gg (atteso)` : `Variazione di cassa in ${orizzonte}gg`}
                  value={fmt0(finaleAtteso.saldoAtteso)}
                  color={finaleAtteso.saldoAtteso >= 0 ? GREEN : ALERT}
                  sub={saldoNoto ? null : 'manca il saldo di oggi: è una differenza, non un saldo'} />
                {/* I tre scenari hanno senso solo se c'è una media dei ricavi
                    su cui applicare il +20% e il -30%. Con media 0 erano lo
                    STESSO numero ripetuto tre volte, e l'ottimistico usciva
                    verde anche a meno 46.515 €: il colore era fisso, non
                    legato al segno. */}
                {mediaMisurata ? (
                  <>
                    <KPI label="Scenario ottimistico (+20% ricavi)" value={fmt0(finaleAtteso.saldoOttim)} color={finaleAtteso.saldoOttim >= 0 ? GREEN : ALERT} />
                    <KPI label="Scenario pessimistico (-30% ricavi)" value={fmt0(finaleAtteso.saldoPess)} color={finaleAtteso.saldoPess >= 0 ? MID : ALERT} />
                    <KPI label="Ricavo medio giornaliero" value={fmt0(mediaGiornaliera)} color={MID}
                      sub={`${giorniConIncasso} ${giorniConIncasso === 1 ? 'giornata registrata' : 'giornate registrate'} spalmate su ${giorniCoperti} giorni${giorniConIncasso < 10 ? ' · pochi dati, prendila con le molle' : ''}`} />
                  </>
                ) : (
                  <div style={{
                    // In una griglia da due colonne — telefono e tablet — una
                    // cella che ne occupa tre ne inventa una terza e manda la
                    // pagina in orizzontale. Sul tablet succedeva davvero.
                    gridColumn: ui3(isMobile, isTablet, { telefono: 'span 2', tablet: 'span 2', computer: 'span 3' }),
                    padding: '12px 14px', background: T.amberLight, border: `1px solid ${T.amber}55`,
                    borderRadius: 10, fontSize: font.size.base, color: T.amberDark, lineHeight: 1.5,
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <Icon name="warning" size={14} color={T.amberDark} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <b>Non ho abbastanza chiusure per stimare i ricavi.</b> Negli ultimi 60 giorni
                      non ci sono giornate registrate, quindi la previsione qui sotto tiene conto solo
                      delle uscite: le entrate non le so. Registra la cassa giorno per giorno, oppure
                      carica il registro incassi, e gli scenari compaiono da soli.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {/* L'arretrato: fatture già scadute. È il numero più grande di
              questa pagina e prima non compariva da nessuna parte, perché la
              previsione guarda solo in avanti. */}
          {arretrato.recente > 0 && (
            <div style={{
              padding: '12px 14px', marginBottom: 16, borderRadius: 10,
              background: T.redLight, border: `1px solid ${ALERT}55`,
              fontSize: font.size.base, color: T.redDark, lineHeight: 1.55,
              display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap',
            }}>
              <Icon name="alert" size={14} color={ALERT} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <b>Scaduto da pagare: {fmt0(arretrato.recente)}</b> su {arretrato.nRecente} {arretrato.nRecente === 1 ? 'fattura' : 'fatture'} degli ultimi tre mesi.
                {' '}Sono soldi che i fornitori aspettano adesso: li conto nel primo giorno della
                previsione, perché è lì che pesano sulla cassa.
              </div>
            </div>
          )}
          {arretrato.vecchio > 0 && (
            <div style={{
              padding: '12px 14px', marginBottom: 16, borderRadius: 10,
              background: T.bgSubtle, border: `1px solid ${T.border}`,
              fontSize: font.size.base, color: MID, lineHeight: 1.55,
              display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap',
            }}>
              <Icon name="clock" size={14} color={SOFT} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                Ci sono anche <b>{arretrato.nVecchio} {arretrato.nVecchio === 1 ? 'fattura' : 'fatture'} scadute da più di tre mesi</b>
                {' '}per {fmt0(arretrato.vecchio)}. Queste NON le conto nella previsione di cassa: a
                quella distanza o sono già state pagate e non risultano segnate come tali (succede
                sempre, perché l'importazione porta dentro tutti i documenti come "da pagare"), oppure
                sono una questione aperta col fornitore, che non si risolve nella cassa di domani.
                Controllale nello Scadenzario: quelle che hai pagato, segnale pagate, e spariscono da qui.
              </div>
            </div>
          )}

          {/* Alert giorno rosso */}
          {primoGiornoRosso && (
            <div style={{ background: T.redLight, border: `1px solid ${ALERT}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="warning" size={18} color={ALERT} />
              <div>
                <div style={{ fontSize: font.size.base, fontWeight: 800, color: T.redDark, marginBottom: 4 }}>
                  Attenzione: cassa attesa negativa il {giornoEsteso(primoGiornoRosso.iso)}
                </div>
                <div style={{ fontSize: font.size.sm, color: MID, lineHeight: 1.5 }}>
                  Saldo previsto: <strong>{fmt0(primoGiornoRosso.saldoAtteso)}</strong>.
                  Sposta scadenze, anticipa entrate, oppure parla col tuo commercialista.
                </div>
              </div>
              <AiExplainButton
                label="Cashflow giorno rosso"
                value={`${fmt0(primoGiornoRosso.saldoAtteso)} il ${giornoBreve(primoGiornoRosso.iso)}`}
                context={{
                  giorno_rosso: primoGiornoRosso.iso,
                  saldo_atteso: primoGiornoRosso.saldoAtteso,
                  saldo_oggi: settings.saldoOggi,
                  media_ricavi_giornalieri: mediaGiornaliera,
                  // Audit 2026-09-09: questa lista arrivava all'AI vuota e con
                  // i campi sbagliati (fornitore_nome e importo_lordo non
                  // esistono), quindi il consiglio veniva dato senza sapere che
                  // c'erano fatture da pagare.
                  // Le prime 15 per importo, non tutte: all'AI serve sapere
                  // quanto e da chi, non l'elenco completo dei fornitori
                  // dell'azienda (sono dati commerciali che non hanno motivo
                  // di uscire).
                  // E solo quelle che PESANO davvero sulla cassa: lo scaduto
                  // di oltre tre mesi resta fuori dalla previsione, quindi
                  // mandarlo qui faceva ragionare l'AI su un debito che la
                  // pagina stessa dichiara non attendibile.
                  fatture_in_scadenza: fatture
                    .filter(f => {
                      const sc = scadenzaFattura(f).iso
                      return sc && sc <= primoGiornoRosso.iso && sc >= giorniFaLocal(GIORNI_ARRETRATO_VIVO)
                    })
                    .map(f => ({ fornitore: f.fornitore, importo: residuoFattura(f), scadenza: scadenzaFattura(f).iso, scadenza_stimata: scadenzaFattura(f).stimata }))
                    .sort((a, b) => b.importo - a.importo)
                    .slice(0, 15),
                  totale_scaduto_recente: arretrato.recente,
                  totale_scaduto_oltre_tre_mesi: arretrato.vecchio,
                  n_fatture_gia_scadute: arretrato.n,
                  // Solo i campi che servono a spiegare: gli identificativi
                  // dell'organizzazione e della sede non escono da qui.
                  eventi_pianificati: eventi
                    .filter(e => soloData(e.data_attesa) <= primoGiornoRosso.iso)
                    .map(e => ({ tipo: e.tipo, descrizione: e.descrizione, data_attesa: soloData(e.data_attesa), importo: importoEvento(e) })),
                }}
                compact
              />
            </div>
          )}

          {/* Chart timeline */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 14 : 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[30, 60, 90].map(d => (
                  <button key={d} onClick={() => setOrizzonte(d)}
                    aria-pressed={orizzonte === d}
                    style={{ padding: '10px 16px', minHeight: ui3(isMobile, isTablet, ui.ctrlHsm), borderRadius: 999, border: `1px solid ${BORDER}`, background: orizzonte === d ? TXT : 'transparent', color: orizzonte === d ? BIANCO : MID, fontSize: font.size.base, fontWeight: 700, cursor: 'pointer' }}>
                    {d}gg
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: font.size.sm, color: SOFT, flexWrap: 'wrap' }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: BRAND, marginRight: 4, verticalAlign: 'middle' }}/>Atteso</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: GREEN, marginRight: 4, verticalAlign: 'middle' }}/>Ottimistico</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: BRAND, opacity: 0.5, marginRight: 4, verticalAlign: 'middle' }}/>Pessimistico</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto', textAlign: 'center' }}>
              {chartSvg}
            </div>
            {/* Le date di scadenza NON arrivano dalle fatture: in produzione
                sono vuote su tutte, perché gli XML di questi fornitori non
                portano il blocco dei termini di pagamento.
                La pagina lo sapeva (riepilogoFatture restituisce
                `tutteStimate`) e non lo diceva: un grafico di previsione
                costruito su date calcolate va dichiarato. */}
            {riepilogo.n > 0 && riepilogo.stimate > 0 && (
              <div style={{
                marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`,
                fontSize: font.size.base, color: SOFT, lineHeight: 1.55,
              }}>
                {riepilogo.tutteStimate
                  ? 'Le date di scadenza non arrivano dalle fatture: le calcolo a 30 giorni dalla data del documento, o coi termini che hai impostato sul fornitore. Se un fornitore ha condizioni diverse, scrivile nella sua scheda in Fornitori e questa previsione si sposta di conseguenza.'
                  : `${riepilogo.stimate} scadenze su ${riepilogo.n} non sono scritte nella fattura: quelle le calcolo dai termini del fornitore, o a 30 giorni.`}
              </div>
            )}
          </div>

          {/* Eventi pianificati */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: font.size.md, fontWeight: 700, color: TXT }}>
                Eventi pianificati ({eventi.length})
              </div>
              <button onClick={() => setShowAddEvento(s => !s)}
                style={{ background: BRAND, color: BIANCO, border: 'none', padding: '7px 14px', minHeight: ui3(isMobile, isTablet, ui.ctrlH), borderRadius: 8, fontSize: font.size.sm, fontWeight: 700, cursor: 'pointer' }}>
                {showAddEvento ? 'Annulla' : <><Icon name="plus" size={13} /> Aggiungi evento</>}
              </button>
            </div>

            {showAddEvento && (
              <div style={{ background: T.bgSubtle, borderRadius: 8, padding: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: ui3(isMobile, isTablet, { telefono: '1fr', tablet: 'repeat(2, 1fr)', computer: 'repeat(5, 1fr)' }), gap: 8, alignItems: 'end' }}>
                <select value={newEv.tipo} onChange={e => setNewEv(s => ({ ...s, tipo: e.target.value }))}
                  aria-label="Tipo di evento"
                  style={{ padding: '10px 12px', minHeight: ui3(isMobile, isTablet, ui.ctrlH), borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: ui3(isMobile, isTablet, ui.inputFs), background: CARD }}>
                  {TIPI_EVENTO.map(t => <option key={t.id} value={t.id}>{t.lbl}</option>)}
                </select>
                <input value={newEv.descrizione} onChange={e => setNewEv(s => ({ ...s, descrizione: e.target.value }))} placeholder="Descrizione"
                  aria-label="Descrizione dell'evento"
                  style={{ padding: '10px 12px', minHeight: ui3(isMobile, isTablet, ui.ctrlH), borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: ui3(isMobile, isTablet, ui.inputFs), gridColumn: isMobile ? 'auto' : 'span 2' }}/>
                <input type="date" value={newEv.data_attesa} onChange={e => setNewEv(s => ({ ...s, data_attesa: e.target.value }))}
                  aria-label="Data in cui te lo aspetti"
                  style={{ padding: '10px 12px', minHeight: ui3(isMobile, isTablet, ui.ctrlH), borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: ui3(isMobile, isTablet, ui.inputFs) }}/>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" inputMode="decimal" value={newEv.importo} onChange={e => setNewEv(s => ({ ...s, importo: e.target.value }))} placeholder="€"
                    aria-label="Importo in euro"
                    style={{ width: '70%', padding: '10px 12px', minHeight: ui3(isMobile, isTablet, ui.ctrlH), borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: ui3(isMobile, isTablet, ui.inputFs) }}/>
                  <button onClick={aggiungiEvento} disabled={savingEvento}
                    style={{ flex: 1, minHeight: ui3(isMobile, isTablet, ui.ctrlH), background: savingEvento ? BORDER : GREEN, color: BIANCO, border: 'none', borderRadius: 7, fontSize: font.size.base, fontWeight: 700, cursor: savingEvento ? 'default' : 'pointer' }}>
                    {savingEvento ? 'Salvo…' : 'OK'}
                  </button>
                </div>
              </div>
            )}

            {eventi.length === 0 ? (
              <div style={{ padding: 20, color: SOFT, fontSize: font.size.base, textAlign: 'center' }}>
                Nessun evento pianificato. Aggiungi stipendi, IVA, affitti per migliorare la proiezione.
              </div>
            ) : (
              <div>
                {eventi.slice(0, 12).map(e => {
                  const giorno = soloData(e.data_attesa)
                  const inRitardo = eventiArretrati.some(a => a.id === e.id)
                  return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: font.size.sm, padding: '3px 9px', borderRadius: 999, background: e.tipo === 'entrata' ? T.greenLight : T.brandLight, color: e.tipo === 'entrata' ? GREEN : BRAND, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {e.tipo}
                    </span>
                    <span style={{ flex: 1, minWidth: isMobile ? 140 : 200, fontSize: font.size.base, color: TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.descrizione}</span>
                    {/* Un evento con la data passata restava in elenco e non
                        pesava su niente: la previsione parte da oggi. Adesso
                        entra nel primo giorno, e qui si dice perché. */}
                    {inRitardo && (
                      <span title="Data già passata: lo conto nel primo giorno della previsione. Se l'hai già pagato, elimina la riga."
                        style={{ fontSize: font.size.sm, padding: '3px 8px', borderRadius: 999, background: T.redLight, color: T.redDark, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'help' }}>
                        in ritardo
                      </span>
                    )}
                    {/* Data all'italiana: "2026-09-24" è il formato del
                        database, non quello che si legge su un foglio. */}
                    <span style={{ fontSize: font.size.sm, color: SOFT, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {giornoBreve(giorno) || '—'}
                    </span>
                    <span style={{ fontSize: font.size.base, fontWeight: 800, color: e.tipo === 'entrata' ? GREEN : BRAND, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {e.tipo === 'entrata' ? '+' : '−'}{fmt0(importoEvento(e))}
                    </span>
                    <button onClick={() => eliminaEvento(e.id)} aria-label={`Elimina evento ${e.descrizione}`} style={{ background: 'transparent', border: 'none', color: SOFT, cursor: 'pointer', padding: 8, minWidth: ui3(isMobile, isTablet, ui.ctrlH), minHeight: ui3(isMobile, isTablet, ui.ctrlH), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="x" size={14}/>
                    </button>
                  </div>
                  )
                })}
                {/* L'elenco si ferma a dodici, e prima lo faceva in silenzio:
                    l'intestazione diceva «Eventi pianificati (20)» e di righe
                    se ne vedevano dodici. */}
                {eventi.length > 12 && (
                  <div style={{ paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontSize: font.size.sm, color: SOFT }}>
                    Ne mostro 12 su {eventi.length}: i più vicini nel tempo. Gli altri {eventi.length - 12} contano
                    lo stesso nella previsione qui sopra.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function KPI({ label, value, color, sub }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: font.size.sm, fontWeight: 700, color: SOFT, letterSpacing: '0.06em', textTransform: 'uppercase', minHeight: 28, lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: font.size['2xl'], fontWeight: 900, color: color || TXT, marginTop: 4, fontVariantNumeric: 'tabular-nums', minHeight: 28, lineHeight: 1.1 }}>{value}</div>
      {sub
        ? <div style={{ fontSize: font.size.sm, color: SOFT, marginTop: 2, minHeight: 26, lineHeight: 1.35 }}>{sub}</div>
        : <div style={{ minHeight: 26, marginTop: 2 }}/>}
    </div>
  )
}
