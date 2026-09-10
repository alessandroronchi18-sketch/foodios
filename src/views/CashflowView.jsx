// Cashflow Predittivo 30/60/90 giorni
//
// Combina:
//   - Saldo cassa stimato oggi (manuale, l'utente inserisce)
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
import { color as T, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiExplainButton from '../components/AiExplainButton'
import AiPageHero from '../components/AiPageHero'
import { useConfirm } from '../components/ConfirmModal'
import { residuoFattura, scadenzaFattura, riepilogoFatture } from '../lib/fatture'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'
const AMBER = T.amber || '#D97706'

const SK_CASH_SETTINGS = 'pasticceria-cashflow-settings-v1'  // { saldoOggi, fissi: [{label, importo, frequenza}] }

function fmt0(n) {
  return Number(n || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
}

const TIPI_EVENTO = [
  { id: 'uscita',    lbl: 'Uscita generica' },
  { id: 'stipendio', lbl: 'Stipendio dipendente' },
  { id: 'iva',       lbl: 'IVA / imposte' },
  { id: 'affitto',   lbl: 'Affitto' },
  { id: 'entrata',   lbl: 'Entrata pianificata' },
  { id: 'altro',     lbl: 'Altro' },
]

// Data in formato ISO scritta coi campi LOCALI. toISOString() su una
// mezzanotte locale restituisce il giorno PRIMA (in Italia l'offset è +1 o
// +2): da lì nasceva una previsione che partiva da ieri.
const GIORNI_ARRETRATO_VIVO = 90

function isoLocale(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CashflowView({ orgId, sedeId, sedi = [], notify }) {
  const notifyFn = notify || ((m) => { try { console.debug('[cashflow]', m) } catch {} })
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const confirmDialog = useConfirm()
  const [chiusure, setChiusure] = useState([])
  const [fatture, setFatture] = useState([])
  const [eventi, setEventi] = useState([])
  const [settings, setSettings] = useState({ saldoOggi: 0, fissi: [] })
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
      const oggiD = new Date(); oggiD.setHours(0, 0, 0, 0)
      const daD = new Date(oggiD); daD.setDate(daD.getDate() - 60)
      const [chiu, fattRes, evRes, set] = await Promise.all([
        // `tutteLeSedi: true`: le fatture da pagare non hanno una sede, e
        // mettere i ricavi di un negozio contro le uscite di tutti dava un
        // saldo previsto che non è di nessuno.
        caricaChiusure(orgId, sedeId, { from: isoLocale(daD), to: isoLocale(oggiD), tutteLeSedi: true }),
        supabase.from('fatture').select('id, fornitore, data_fattura, data_scadenza, totale, importo_pagato, stato').eq('organization_id', orgId).neq('stato', 'pagata'),
        supabase.from('cashflow_eventi').select('*').eq('organization_id', orgId).eq('stato', 'pianificato').order('data_attesa'),
        sload(SK_CASH_SETTINGS, orgId, null),
      ])
      if (!alive) return
      setChiusure(Array.isArray(chiu) ? chiu : [])
      setFatture(fattRes.data || [])
      setEventi(evRes.data || [])
      setSettings(set && typeof set === 'object' ? { saldoOggi: 0, fissi: [], ...set } : { saldoOggi: 0, fissi: [] })
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Testo digitato nel campo del saldo: separato dal valore salvato, così una
  // battuta di tasti non fa una scrittura sul database.
  const [saldoTesto, setSaldoTesto] = useState('')
  const [savingEvento, setSavingEvento] = useState(false)
  useEffect(() => {
    setSaldoTesto(settings.saldoOggi ? String(settings.saldoOggi) : '')
  }, [settings.saldoOggi])

  // Riepilogo delle fatture aperte, con quante scadenze sono STIMATE.
  const riepilogo = useMemo(() => riepilogoFatture(fatture), [fatture])

  // Fatture già scadute prima di oggi: l'arretrato. Prima non entrava da
  // nessuna parte, perché la previsione guarda solo in avanti — ed è il
  // numero più grande della pagina.
  //
  // Ma va diviso in due, e i dati veri lo spiegano: sui 3.104 documenti
  // caricati da Mara, 2.126 sono scaduti da più di un anno per 1,13 milioni.
  // Non è un debito: sono fatture pagate davvero e mai segnate come pagate in
  // Foodos, perché l'import le porta dentro tutte come "da pagare".
  // Buttare 1,68 milioni nel primo giorno della previsione renderebbe il
  // grafico illeggibile e ogni giorno rosso.
  //
  // Quindi: nella cassa entra solo lo scaduto RECENTE (90 giorni), che è
  // quello che un fornitore aspetta davvero adesso; il resto si mostra a
  // parte, dicendo cos'è e cosa fare.
  const arretrato = useMemo(() => {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
    const oggiIso = isoLocale(oggi)
    const limite = new Date(oggi); limite.setDate(limite.getDate() - GIORNI_ARRETRATO_VIVO)
    const limiteIso = isoLocale(limite)
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
  const GIORNI_STORICO = 60
  const { mediaGiornaliera, giorniConIncasso, giorniCoperti } = useMemo(() => {
    const oggi = new Date()
    const inizio = new Date(oggi.getTime() - GIORNI_STORICO * 86400000)
    let tot = 0, n = 0
    let primaData = null, ultimaData = null
    for (const c of (chiusure || [])) {
      const d = new Date(c.data || 0)
      if (Number.isNaN(d.getTime()) || d < inizio || d > oggi) continue
      tot += Number(c.kpi?.totV || c.totale || 0); n++
      if (!primaData || d < primaData) primaData = d
      if (!ultimaData || d > ultimaData) ultimaData = d
    }
    if (n === 0) return { mediaGiornaliera: 0, giorniConIncasso: 0, giorniCoperti: 0 }
    // Giorni di calendario coperti dai dati: dal primo giorno registrato a
    // oggi, non oltre la finestra dello storico.
    const coperti = Math.max(1, Math.round((oggi - primaData) / 86400000) + 1)
    return { mediaGiornaliera: tot / coperti, giorniConIncasso: n, giorniCoperti: coperti }
  }, [chiusure])
  const mediaMisurata = giorniConIncasso > 0 && mediaGiornaliera > 0

  // Simulazione: per ogni giorno da oggi → oggi+orizzonte, calcola saldo atteso.
  const timeline = useMemo(() => {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
    const days = []
    let saldoAtteso = Number(settings.saldoOggi) || 0
    let saldoOttim = saldoAtteso
    let saldoPess = saldoAtteso
    // Le date si scrivono coi campi LOCALI. Con toISOString() su una
    // mezzanotte locale il giorno che ne esce è quello PRIMA (in Italia
    // l'offset è +1/+2), quindi la previsione partiva da ieri e l'allarme
    // rosso annunciava come futuro un giorno già passato.
    const limiteArretrato = new Date(oggi); limiteArretrato.setDate(limiteArretrato.getDate() - GIORNI_ARRETRATO_VIVO)
    const limiteArretratoIso = isoLocale(limiteArretrato)

    for (let i = 0; i <= orizzonte; i++) {
      const dt = new Date(oggi.getTime() + i * 86400000)
      const iso = isoLocale(dt)
      const ricavoStimato = mediaGiornaliera

      // Fatture in scadenza quel giorno.
      // Audit 2026-09-09: qui il confronto era `f.data_scadenza === iso`, ma in
      // produzione data_scadenza e' vuota su 418 fatture su 418 (gli XML di
      // questi fornitori non portano il blocco DatiPagamento), quindi non
      // combaciava MAI. Sommato al fatto che la query chiedeva colonne
      // inesistenti (fornitore_nome, importo_lordo -> PostgREST 42703 -> data
      // null), le uscite risultavano sempre zero: il grafico mostrava una cassa
      // in salita e nessun giorno rosso, mentre lo Scadenziario contava 81.079 €
      // già scaduti sulla stessa base dati.
      // scadenzaFattura deriva la data quando manca, e residuoFattura sottrae
      // gli acconti già versati invece di contare il lordo.
      // Le fatture GIÀ SCADUTE prima di oggi cadono fuori dalla finestra e
      // non entravano da nessuna parte: il buco vero non si vedeva. Le
      // imputiamo al giorno 0 — sono soldi che il fornitore aspetta adesso —
      // e la pagina le mostra anche come numero a sé.
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

      // Eventi cashflow quel giorno
      const evGiorno = eventi.filter(e => e.data_attesa === iso)
      const usciteEv = evGiorno.filter(e => e.tipo !== 'entrata').reduce((s, e) => s + Number(e.importo || 0), 0)
      const entrateEv = evGiorno.filter(e => e.tipo === 'entrata').reduce((s, e) => s + Number(e.importo || 0), 0)

      // Saldo atteso = saldo - uscite + ricavi stimati + entrate eventi
      saldoAtteso += ricavoStimato + entrateEv - usciteFatture - usciteEv
      saldoOttim  += (ricavoStimato * 1.20) + entrateEv - usciteFatture - usciteEv
      saldoPess   += (ricavoStimato * 0.70) + entrateEv - usciteFatture - usciteEv

      days.push({
        iso, dt,
        ricavoStimato, usciteFatture, usciteEv, entrateEv,
        saldoAtteso, saldoOttim, saldoPess,
        alertNegativo: saldoAtteso < 0,
      })
    }
    return days
  }, [settings.saldoOggi, mediaGiornaliera, fatture, eventi, orizzonte])

  // Alert: primo giorno con saldo atteso negativo
  const primoGiornoRosso = useMemo(() => timeline.find(d => d.alertNegativo), [timeline])
  const finaleAtteso = timeline[timeline.length - 1]

  async function salvaSaldo(nuovo) {
    const next = { ...settings, saldoOggi: Number(nuovo) || 0 }
    // Save-first: persist PRIMA di setState. Se save fallisce non aggiorniamo la UI
    // e mostriamo l'errore - niente drift state↔DB (audit 2026-06-17 CRITICAL).
    try {
      await ssave(SK_CASH_SETTINGS, next, orgId, null)
      setSettings(next)
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
    if (!newEv.importo || !(Number(newEv.importo) > 0)) { notifyFn('Serve un importo maggiore di zero.', false); return }
    if (savingEvento) return
    setSavingEvento(true)
    try {
      const { data, error } = await supabase.from('cashflow_eventi').insert({
        organization_id: orgId, sede_id: sedeId || null,
        tipo: newEv.tipo,
        descrizione: newEv.descrizione.trim(),
        data_attesa: newEv.data_attesa,
        importo: Number(newEv.importo),
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
      message: 'L\'evento verra rimosso dal cashflow. Le proiezioni successive saranno ricalcolate.',
      confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      // supabase-js non lancia: restituisce { error }. Senza leggerlo, il
      // catch non scattava mai e la riga sparuva dalla lista comunque, con il
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
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {min < 0 && (
          <rect x={PAD} y={y0} width={W - 2 * PAD} height={H - PAD - y0} fill="#FEE2E2" opacity="0.6" />
        )}
        <line x1={PAD} y1={y0} x2={W - PAD} y2={y0} stroke="#94A3B8" strokeDasharray="3,3" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#CBD5E1" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#CBD5E1" />
        <path d={lineOtt} stroke={GREEN} strokeWidth="1.5" fill="none" strokeOpacity="0.6" strokeDasharray="4,4" />
        <path d={linePess} stroke={BRAND} strokeWidth="1.5" fill="none" strokeOpacity="0.6" strokeDasharray="4,4" />
        <path d={lineAtt} stroke={BRAND} strokeWidth="2.4" fill="none" />
        {primoGiornoRosso && (() => {
          const i = timeline.indexOf(primoGiornoRosso)
          if (i < 0) return null
          return <circle cx={xOf(i)} cy={yOf(primoGiornoRosso.saldoAtteso)} r="4" fill={BRAND} stroke="#FFF" strokeWidth="2" />
        })()}
        <text x={PAD} y={20} fontSize="12" fontWeight="600" fill={MID}>{fmt0(max)}</text>
        <text x={PAD} y={H - PAD + 16} fontSize="12" fontWeight="600" fill={MID}>{fmt0(min)}</text>
        <text x={W - PAD} y={H - PAD + 16} fontSize="12" fontWeight="600" fill={MID} textAnchor="end">+{orizzonte}gg</text>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Saldo cassa+banca oggi
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Il campo tiene il testo in locale e salva UNA volta,
                      quando esci dal campo. Prima ogni tasto faceva una
                      scrittura sul database, e l'input mostrava il valore
                      SALVATO invece di quello digitato: le cifre venivano
                      riscritte sotto le dita mentre scrivevi, e il controllo
                      anti-conflitto ti accusava di aver modificato i dati da
                      due posti insieme. */}
                  <input type="number" inputMode="decimal" value={saldoTesto}
                    onChange={e => setSaldoTesto(e.target.value)}
                    onBlur={() => { if (String(saldoTesto) !== String(settings.saldoOggi ?? '')) salvaSaldo(saldoTesto) }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    placeholder="0"
                    aria-label="Saldo cassa e banca di oggi, in euro"
                    style={{ width: isMobile ? '100%' : 140, maxWidth: 200, padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: 16, fontWeight: 700, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <span style={{ fontSize: 18, fontWeight: 700, color: MID }}>€</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: SOFT, lineHeight: 1.5 }}>
                Inserisci quanto hai oggi su conto corrente + cassa. La proiezione usa la media ricavi degli ultimi 60 giorni e le scadenze in calendario.
              </div>
            </div>
            {(!settings.saldoOggi || Number(settings.saldoOggi) === 0) && (
              <div style={{
                marginTop: 12, padding: '10px 12px',
                background: '#FEF9C3', border: '1px solid #FDE68A',
                borderRadius: 8, fontSize: 12, color: '#854D0E', lineHeight: 1.5,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <Icon name="warning" size={14} color="#854D0E" />
                <div>
                  Imposta il <strong>saldo cassa+banca di oggi</strong> per vedere la previsione reale.
                  Senza, il grafico mostra solo le variazioni (saldo iniziale = 0 €).
                </div>
              </div>
            )}
          </div>

          {/* KPI scenari */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {finaleAtteso && (
              <>
                <KPI label={`Cassa fra ${orizzonte}gg (atteso)`} value={fmt0(finaleAtteso.saldoAtteso)} color={finaleAtteso.saldoAtteso >= 0 ? GREEN : BRAND} />
                {/* I tre scenari hanno senso solo se c'è una media dei ricavi
                    su cui applicare il +20% e il -30%. Con media 0 erano lo
                    STESSO numero ripetuto tre volte, e l'ottimistico usciva
                    verde anche a meno 46.515 €: il colore era fisso, non
                    legato al segno. */}
                {mediaMisurata ? (
                  <>
                    <KPI label="Scenario ottimistico (+20% ricavi)" value={fmt0(finaleAtteso.saldoOttim)} color={finaleAtteso.saldoOttim >= 0 ? GREEN : BRAND} />
                    <KPI label="Scenario pessimistico (-30% ricavi)" value={fmt0(finaleAtteso.saldoPess)} color={finaleAtteso.saldoPess >= 0 ? MID : BRAND} />
                    <KPI label="Ricavo medio giornaliero" value={fmt0(mediaGiornaliera)} color={MID}
                      sub={`${giorniConIncasso} ${giorniConIncasso === 1 ? 'giornata registrata' : 'giornate registrate'} spalmate su ${giorniCoperti} giorni${giorniConIncasso < 10 ? ' · pochi dati, prendila con le molle' : ''}`} />
                  </>
                ) : (
                  <div style={{
                    gridColumn: isMobile ? 'span 2' : 'span 3',
                    padding: '12px 14px', background: T.amberLight, border: `1px solid ${T.amber}55`,
                    borderRadius: 10, fontSize: typo.size.base, color: T.amber, lineHeight: 1.5,
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <Icon name="warning" size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
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
              background: T.redLight, border: `1px solid ${T.red}55`,
              fontSize: typo.size.base, color: T.red, lineHeight: 1.55,
              display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap',
            }}>
              <Icon name="alert" size={14} color={T.red} style={{ flexShrink: 0, marginTop: 2 }} />
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
              fontSize: typo.size.base, color: MID, lineHeight: 1.55,
              display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap',
            }}>
              <Icon name="clock" size={14} color={SOFT} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                Ci sono anche <b>{arretrato.nVecchio} {arretrato.nVecchio === 1 ? 'fattura' : 'fatture'} scadute da più di tre mesi</b>
                {' '}per {fmt0(arretrato.vecchio)}. Queste NON le conto nella cassa: quasi sempre sono
                già state pagate e non risultano segnate come tali in Foodos (l'importazione le porta
                dentro tutte come "da pagare"). Se le segni pagate dallo Scadenzario, spariscono da qui.
              </div>
            </div>
          )}

          {/* Alert giorno rosso */}
          {primoGiornoRosso && (
            <div style={{ background: '#FEF2F2', border: `1px solid ${BRAND}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="warning" size={18} color={BRAND} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: BRAND, marginBottom: 4 }}>
                  Attenzione: cassa attesa negativa il {new Date(primoGiornoRosso.iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                </div>
                <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.5 }}>
                  Saldo previsto: <strong>{fmt0(primoGiornoRosso.saldoAtteso)}</strong>.
                  Sposta scadenze, anticipa entrate, oppure parla col tuo commercialista.
                </div>
              </div>
              <AiExplainButton
                label="Cashflow giorno rosso"
                value={`${fmt0(primoGiornoRosso.saldoAtteso)} il ${new Date(primoGiornoRosso.iso + 'T12:00:00').toLocaleDateString('it-IT')}`}
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
                  // dell'azienda (in produzione sono 418 fatture, e sono dati
                  // commerciali che non hanno motivo di uscire).
                  fatture_in_scadenza: fatture
                    .filter(f => { const sc = scadenzaFattura(f).iso; return sc && sc <= primoGiornoRosso.iso })
                    .map(f => ({ fornitore: f.fornitore, importo: residuoFattura(f), scadenza: scadenzaFattura(f).iso, scadenza_stimata: scadenzaFattura(f).stimata }))
                    .sort((a, b) => b.importo - a.importo)
                    .slice(0, 15),
                  totale_gia_scaduto: arretrato.totale,
                  n_fatture_gia_scadute: arretrato.n,
                  eventi_pianificati: eventi.filter(e => e.data_attesa <= primoGiornoRosso.iso),
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
                    style={{ padding: '10px 16px', minHeight: 40, borderRadius: 999, border: `1px solid ${BORDER}`, background: orizzonte === d ? TXT : 'transparent', color: orizzonte === d ? '#FFF' : MID, fontSize: typo.size.base, fontWeight: 700, cursor: 'pointer' }}>
                    {d}gg
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: SOFT, flexWrap: 'wrap' }}>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: BRAND, marginRight: 4, verticalAlign: 'middle' }}/>Atteso</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: GREEN, marginRight: 4, verticalAlign: 'middle' }}/>Ottimistico</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 2, background: BRAND, opacity: 0.5, marginRight: 4, verticalAlign: 'middle' }}/>Pessimistico</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto', textAlign: 'center' }}>
              {chartSvg}
            </div>
            {/* Le date di scadenza NON arrivano dalle fatture: in produzione
                sono vuote su 418 fatture su 418, perché gli XML di questi
                fornitori non portano il blocco dei termini di pagamento.
                La pagina lo sapeva (riepilogoFatture restituisce
                `tutteStimate`) e non lo diceva: un grafico di previsione
                costruito su date calcolate va dichiarato. */}
            {riepilogo.n > 0 && riepilogo.stimate > 0 && (
              <div style={{
                marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`,
                fontSize: typo.size.base, color: SOFT, lineHeight: 1.55,
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
              <div style={{ fontSize: 14, fontWeight: 700, color: TXT }}>
                Eventi pianificati ({eventi.length})
              </div>
              <button onClick={() => setShowAddEvento(s => !s)}
                style={{ background: BRAND, color: '#FFF', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {showAddEvento ? 'Annulla' : <><Icon name="plus" size={13} /> Aggiungi evento</>}
              </button>
            </div>

            {showAddEvento && (
              <div style={{ background: '#FAFAF6', borderRadius: 8, padding: 12, marginBottom: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 8, alignItems: 'end' }}>
                <select value={newEv.tipo} onChange={e => setNewEv(s => ({ ...s, tipo: e.target.value }))}
                  style={{ padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13, background: '#FFF' }}>
                  {TIPI_EVENTO.map(t => <option key={t.id} value={t.id}>{t.lbl}</option>)}
                </select>
                <input value={newEv.descrizione} onChange={e => setNewEv(s => ({ ...s, descrizione: e.target.value }))} placeholder="Descrizione"
                  style={{ padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13, gridColumn: isMobile ? 'auto' : 'span 2' }}/>
                <input type="date" value={newEv.data_attesa} onChange={e => setNewEv(s => ({ ...s, data_attesa: e.target.value }))}
                  style={{ padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13 }}/>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="number" inputMode="decimal" value={newEv.importo} onChange={e => setNewEv(s => ({ ...s, importo: e.target.value }))} placeholder="€"
                    style={{ width: '70%', padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: isMobile ? 16 : 13 }}/>
                  <button onClick={aggiungiEvento} disabled={savingEvento}
                    style={{ flex: 1, minHeight: 44, background: savingEvento ? BORDER : GREEN, color: '#FFF', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: savingEvento ? 'default' : 'pointer' }}>
                    {savingEvento ? 'Salvo…' : 'OK'}
                  </button>
                </div>
              </div>
            )}

            {eventi.length === 0 ? (
              <div style={{ padding: 20, color: SOFT, fontSize: 13, textAlign: 'center' }}>
                Nessun evento pianificato. Aggiungi stipendi, IVA, affitti per migliorare la proiezione.
              </div>
            ) : (
              <div>
                {eventi.slice(0, 12).map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, padding: '3px 9px', borderRadius: 999, background: e.tipo === 'entrata' ? '#F0FDF4' : '#FEF2F2', color: e.tipo === 'entrata' ? GREEN : BRAND, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {e.tipo}
                    </span>
                    <span style={{ flex: 1, minWidth: isMobile ? 140 : 200, fontSize: 13, color: TXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.descrizione}</span>
                    {/* Data all'italiana: "2026-09-24" è il formato del
                        database, non quello che si legge su un foglio. */}
                    <span style={{ fontSize: 12, color: SOFT, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {e.data_attesa ? new Date(e.data_attesa + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: e.tipo === 'entrata' ? GREEN : BRAND, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {e.tipo === 'entrata' ? '+' : '−'}{fmt0(e.importo)}
                    </span>
                    <button onClick={() => eliminaEvento(e.id)} aria-label={`Elimina evento ${e.descrizione}`} style={{ background: 'transparent', border: 'none', color: SOFT, cursor: 'pointer', padding: 8, minWidth: 40, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="x" size={14}/>
                    </button>
                  </div>
                ))}
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
      <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: '0.06em', textTransform: 'uppercase', minHeight: 28, lineHeight: 1.2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: color || TXT, marginTop: 4, fontVariantNumeric: 'tabular-nums', minHeight: 26, lineHeight: 1.1 }}>{value}</div>
      {sub
        ? <div style={{ fontSize: 12, color: SOFT, marginTop: 2, minHeight: 26, lineHeight: 1.35 }}>{sub}</div>
        : <div style={{ minHeight: 26, marginTop: 2 }}/>}
    </div>
  )
}
