// AnalisiInventarioSection — Analitica storica per il metodo INVENTARIO
// DIFFERENZIALE (gelaterie/yogurterie/pasta fresca).
//
// Universale per tutte le PMI food italiane: legge dalla tabella
// public.inventario_produzione e calcola metriche indipendenti dal cliente
// specifico (Mara, gelateria X, yogurteria Y...).
//
// Contenuto:
//   1. KPI banner: Prodotto, Venduto stimato, Scarto, Ricavo, Margine (con
//      confronto vs periodo precedente della stessa durata)
//   2. Toggle vista temporale: Giornaliero / Settimanale / Mensile
//   3. Grafico trend produzione+vendite+scarto
//   4. Tabella per gusto ordinabile (Prodotto/Venduto/Scarto/Ricavo/Margine)
//   5. Top 10 gusti per venduto (barra proporzionale)
//   6. Export xlsx
//   7. Deep-link back alla pagina Produzione
//
// Design: la view accetta rows già caricate (fetch lo fa il parent) per
// permettere una singola query condivisa con altre sezioni.

import React, { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Line, LineChart,
} from 'recharts'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, font } from '../lib/theme'
import { C, TNUM, KPI, SH, ChartTip, PageHeader, TabellaOSchede } from './_shared'
import Icon from '../components/Icon'
import { loadXLSX } from '../lib/xlsx'
// Il venduto lo calcola il motore condiviso, non una formula scritta qui.
// La vecchia copia (produzioneStats.calcPerGustoDifferenziale) troncava a zero
// i conti che non tornavano, perdeva la giacenza di partenza a ogni giorno di
// chiusura e ignorava i chili spediti alle altre sedi: questa pagina mostrava
// un venduto diverso da Quadratura e dal conto economico sugli stessi giorni.
import { totaliPerGusto, serieVendutoMultiSede, ricettaDelGusto, caselleDaSistemare, riassuntoCaselle, euroKgMedioFormati } from '../lib/inventarioProduzione'
import { buildIngCosti } from '../lib/foodcost'
// Il valore di ogni gusto (ricavo, food cost, margine) non si calcola qui: è
// `valutaGusti`, provato coi numeri veri. Le due copie che stavano in questa
// pagina chiamavano calcolaFC con gli argomenti sbagliati e davano un margine
// del 100% su tutto (vedi il racconto in produzioneAnalisi.js).
import { valutaGusti, giorniRegistrati, variazionePct, dataBreve, conGiorno } from '../lib/produzioneAnalisi'
import { todayLocal, differenzaGiorni, formatLocalDate } from '../lib/dateLocal'
import { useRicavoFlat } from '../lib/useRicavoFlat'
import { useNomiGusti } from '../lib/useNomiGusti'
import { ricetteSimili } from '../lib/nomiGusti'
import { normGusto } from '../lib/normGusto'
import { fmtp } from '../lib/formatIt'

/**
 * @param {Object} props
 * @param {Array} props.rows      - Righe inventario_produzione del periodo
 * @param {Array} props.rowsPrev  - Righe periodo precedente (per confronto)
 * @param {string} props.dateFrom
 * @param {string} props.dateTo
 * @param {Object} props.ricettario
 * @param {string} props.orgId
 * @param {string} props.sedeId
 * @param {Array} props.sedi
 * @param {Function} props.onBack - Callback per tornare alla Produzione
 */
export default function AnalisiInventarioSection({
  rows = [], rowsPrev = [], dateFrom, dateTo, confronto = 'periodoPrec',
  // Finestra del periodo di confronto: le righe arrivano con qualche giorno in
  // più davanti (giacenza di partenza) e quei giorni non vanno nei totali.
  prevFrom = null, prevTo = null,
  ricettario, orgId, sedeId, sedi = [],
  onBack,
  // Cosa si confronta davvero (o perché no): lo decide il contenitore sui
  // giorni registrati. null = la pagina non lo sa ancora.
  confrontoInfo = null,
  // La finestra di partenza, quando l'utente non ha scelto le date: serve a
  // dire «ti mostro i due mesi fino all'ultimo giorno registrato».
  partenza = null,
  // Per il pulsante «guarda fino al 31/08» quando il periodo è vuoto.
  onPeriodo = null,
  // Per andare al Ricettario quando un gusto non ha nessuna ricetta simile.
  onNavigate = null,
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const { ricavoFlatFor, formati } = useRicavoFlat(orgId, ricettario, sedeId)
  // I nomi del foglio collegati a mano alle ricette (MISTIC → MYSTIC).
  const { mappa: nomiGusti, collega } = useNomiGusti(orgId)
  const [vista, setVista] = useState('giornaliero')  // giornaliero | settimana | mese
  const [sortBy, setSortBy] = useState('ricavo')
  const [sortDir, setSortDir] = useState('desc')

  // Etichetta del delta % nei KPI: dipende dalla modalita' scelta nel container.
  const deltaLabelText = confronto === 'annoPrec' ? 'vs anno prec.'
                       : confronto === 'nessuno'  ? ''
                       : 'vs periodo prec.'

  // I prezzi degli ingredienti, nella forma che calcolaFC si aspetta.
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const valuta = (righe, da, a) => valutaGusti(totaliPerGusto(righe, { da, a }), {
    ricettaDi: (gusto) => ricettaDelGusto(ricettario, gusto, nomiGusti),
    ricavoKgDi: ricavoFlatFor,
    ingCosti, ricettario,
  })

  // Aggregato per gusto: prod, venduto (residuo differenziale), scarto,
  // ricavo €, food cost €, margine € e %. Il margine è null quando il gusto
  // non ha sia il ricavo sia il costo completo: è «non lo so», non 100%.
  const valutazione = useMemo(
    () => valuta(rows, dateFrom, dateTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, dateFrom, dateTo, ricettario, ingCosti, ricavoFlatFor, nomiGusti]
  )
  const perGusto = valutazione.righe
  const totali = valutazione.totali

  const totaliPrev = useMemo(() => {
    if (!Array.isArray(rowsPrev) || rowsPrev.length === 0) return null
    return valuta(rowsPrev, prevFrom, prevTo).totali
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsPrev, prevFrom, prevTo, ricettario, ingCosti, ricavoFlatFor, nomiGusti])

  // Serie temporale per il grafico (aggregazione per giorno/settimana/mese)
  const trend = useMemo(() => {
    if (rows.length === 0) return []
    const MESI_ABBR = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
    const key = (dataStr) => {
      if (vista === 'giornaliero') return dataStr
      if (vista === 'mese') return dataStr.slice(0, 7)
      // ── La settimana ISO, fatta come si deve ─────────────────────────
      //
      // 19/09/2026, trovato da un audit sulle date a cavallo d'anno. Qui la
      // settimana era calcolata a mano, con due difetti veri:
      //
      // 1. l'anno era `d.getFullYear()`, cioè l'anno del GIORNO, non l'anno
      //    ISO della settimana. Il 1° e il 2 gennaio 2027 cadono nella
      //    settimana 53 del 2026: uscivano come «2027-W00», una settimana che
      //    non esiste, e la settimana dal 28/12 al 3/01 si spezzava in TRE
      //    colonne del grafico invece di una;
      //
      // 2. `Math.round((d - week1Mon) / 86400000)` sottrae due istanti — uno a
      //    mezzogiorno, l'altro a mezzanotte — e quella mezza giornata in più
      //    viene arrotondata. Da novembre a marzo (ora solare) il conto veniva
      //    a 6,5 giorni e si arrotondava a 7: **ogni domenica finiva nella
      //    settimana dopo**. Da aprile a ottobre no, perché l'ora legale
      //    toglieva l'ora che serviva — quindi il difetto compariva e spariva
      //    due volte l'anno, che è il modo migliore per non essere creduti.
      //
      // La versione giusta esisteva già a due file di distanza, in
      // `StoricoProduzioneView.getWeekKey`: si lavora in UTC, ci si sposta al
      // giovedì della settimana (che per definizione ISA sta nell'anno della
      // settimana) e si conta da lì. È la stessa, copiata senza scorciatoie.
      const d = new Date(dataStr + 'T12:00:00')
      const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      const dow = tmp.getUTCDay() || 7
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dow)
      const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
      const week = Math.ceil((((tmp - ys) / 86400000) + 1) / 7)
      return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
    }
    // Label leggibile per il tooltip e l'asse: "15/07", "Sett 30 '26", "Lug '26"
    const labelOf = (k) => {
      if (vista === 'giornaliero') {
        const [y, m, d] = k.split('-')
        return `${d}/${m}`
      }
      if (vista === 'mese') {
        const [y, m] = k.split('-')
        return `${MESI_ABBR[parseInt(m, 10) - 1]} '${y.slice(2)}`
      }
      const [y, w] = k.split('-W')
      return `Sett ${w} '${y.slice(2)}`
    }
    // Il grafico usa il venduto VERO, non un'approssimazione.
    //
    // Prima faceva `venduto = prodotto - scarto`, ignorando del tutto la
    // rimanenza: per una gelateria, che ogni sera lascia gelato in vasca, quel
    // numero è sistematicamente più alto del venduto reale. Nella stessa
    // pagina la tabella diceva una cosa e il grafico ne diceva un'altra, e
    // non c'era modo di capire quale delle due fosse giusta.
    const bucket = {}
    for (const celle of Object.values(serieVendutoMultiSede(rows))) {
      for (const c of celle) {
        // I giorni caricati prima del periodo servono solo come giacenza di
        // partenza: non devono comparire come una colonna del grafico.
        if (dateFrom && c.data < dateFrom) continue
        if (dateTo && c.data > dateTo) continue
        const k = key(c.data)
        if (!bucket[k]) bucket[k] = { key: k, label: labelOf(k), prod: 0, scarto: 0, vend: 0 }
        bucket[k].prod += (Number(c.prod) || 0) / 1000
        bucket[k].scarto += (Number(c.scarto) || 0) / 1000
        if (c.venduto != null) bucket[k].vend += (Number(c.venduto) || 0) / 1000
      }
    }
    return Object.values(bucket).sort((a, b) => a.key.localeCompare(b.key))
  }, [rows, vista, dateFrom, dateTo])

  const sorted = useMemo(() => {
    const arr = [...perGusto]
    arr.sort((a, b) => {
      const va = a[sortBy]; const vb = b[sortBy]
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      // Un margine che non si sa (null) va in fondo, in tutti e due i versi:
      // `null - 3` fa -3 e lo metterebbe a caso in mezzo alla classifica.
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return arr
  }, [perGusto, sortBy, sortDir])

  const top10 = useMemo(() => {
    return [...perGusto]
      .filter(x => x.vendKg > 0)
      .sort((a, b) => b.vendKg - a.vendKg)
      .slice(0, 10)
  }, [perGusto])
  const top10Max = Math.max(1, ...top10.map(x => x.vendKg))

  // I giorni registrati DENTRO il periodo (le righe dei sette giorni prima
  // servono solo come giacenza di partenza e non contano).
  const copertura = useMemo(
    () => giorniRegistrati(rows, { da: dateFrom, a: dateTo }),
    [rows, dateFrom, dateTo]
  )
  // La riga che dice su cosa si reggono i numeri: quali giorni, dove finisce
  // la registrazione, con cosa si confronta. Prima la pagina non diceva mai
  // «l'ultimo giorno registrato è il 31/08», e un mese non scritto sembrava
  // un crollo delle vendite.
  const oggiIso = todayLocal()
  const finePeriodo = dateTo && dateTo < oggiIso ? dateTo : oggiIso
  const registrazioneFerma = copertura.ultimo && finePeriodo && copertura.ultimo < finePeriodo
    && differenzaGiorni(copertura.ultimo, finePeriodo) > 1
  const daPartenza = partenza && partenza.from === dateFrom && partenza.to === dateTo
    && partenza.ultimo && differenzaGiorni(partenza.ultimo, oggiIso) > 2

  // ── Le caselle da sistemare, col giorno giusto ─────────────────────────
  // `totaliPerGusto` le contava già, ma questa pagina non le leggeva: il
  // grafico di apertura mostrava il 12/08 a -126,3 kg venduti senza una
  // parola. Per la causa più frequente (la rimanenza lasciata a 0 il giorno
  // della produzione) la casella da correggere è quella del giorno PRIMA.
  const caselle = useMemo(() => caselleDaSistemare(rows, { da: dateFrom, a: dateTo }), [rows, dateFrom, dateTo])
  const riassunto = useMemo(() => riassuntoCaselle(caselle), [caselle])
  const nomeSede = (id) => (sedi || []).find(s => s.id === id)?.nome || null
  const daSistemare = useMemo(() => {
    const visti = new Set()
    const out = []
    for (const c of caselle) {
      const k = `${c.sedeId}|${c.gusto}|${c.giornoDaSistemare}`
      if (visti.has(k)) continue
      visti.add(k)
      out.push(c)
    }
    return out
  }, [caselle])

  // I gusti senza ricetta, dal più venduto, e quanto valgono al prezzo medio
  // dei formati: è lo stesso prezzo con cui la Quadratura stima l'incasso.
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

  // Un gusto «a posto» ha il prezzo di vendita e il costo completo. Prima il
  // controllo guardava un food cost sempre zero, e l'avviso diceva «28 gusti
  // su 28 senza ricetta» con 88.970 € di ricavo in pagina.
  const completo = (r) => r.haRicavo && r.fcCompleto

  const eur = (n) => (Number(n) || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
  const kg = (n) => (Number(n) || 0).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 1 })
  const pct = (n) => fmtp(Number(n) || 0)
  // Il segno si calcola sul valore assoluto di prima: da -100 a -50 è un
  // miglioramento. Prima la freccia si girava quando il margine di prima era
  // negativo.
  const deltaPct = (cur, prev) => variazionePct(cur, prev)

  function toggleSort(col) {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  async function esportaXlsx() {
    try {
      const XLSX = await loadXLSX()
      const header = ['Gusto', 'Prodotto kg', 'Venduto kg', 'Scarto kg', 'Ricavo/kg €', 'Ricavo €', 'Food cost €', 'Margine €', 'Margine %']
      const body = sorted.map(r => [
        r.gusto,
        Number(r.prodKg.toFixed(2)),
        Number(r.vendKg.toFixed(2)),
        Number(r.scartoKg.toFixed(2)),
        Number(r.ricavoKg.toFixed(2)),
        Number(r.ricavo.toFixed(0)),
        Number(r.fc.toFixed(0)),
        // Un margine che non si sa resta vuoto anche nel file: al
        // commercialista arrivava «100,0» su ogni gusto.
        r.margine == null ? '' : Number(r.margine.toFixed(0)),
        r.margPct == null ? '' : Number(r.margPct.toFixed(1)),
      ])
      const total = [
        'Totale',
        Number(totali.prod.toFixed(2)),
        Number(totali.vend.toFixed(2)),
        Number(totali.scarto.toFixed(2)),
        '',
        Number(totali.ricavo.toFixed(0)),
        Number(totali.fc.toFixed(0)),
        totali.margine == null ? '' : Number(totali.margine.toFixed(0)),
        totali.margPct == null ? '' : Number(totali.margPct.toFixed(1)),
      ]
      const ws = XLSX.utils.aoa_to_sheet([header, ...body, total])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Analisi inventario')
      const range = `${dateFrom || 'start'}_${dateTo || 'end'}`.replace(/[^0-9-]/g, '')
      XLSX.writeFile(wb, `analisi-inventario-${range}.xlsx`)
    } catch (e) {
      console.error('Export xlsx fallito:', e)
    }
  }

  // ── Un periodo vuoto non è una tabella di zeri ─────────────────────────
  // Il controllo guardava `rows.length`, ma le righe arrivano con i sette
  // giorni prima del periodo (servono come giacenza di partenza). Con «30
  // giorni» su Carlina, a ottobre, la pagina mostrava 22 gusti a 0,0 kg e
  // -100% su tutto, invece di «niente registrato dopo il 31/08». Conta solo
  // se dentro il periodo c'è un giorno registrato.
  if (copertura.n === 0) {
    const ultimo = confrontoInfo?.ultimoPrima || null
    return (
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: 32, textAlign: 'center', color: T.textSoft, fontSize: font.size.base,
        marginBottom: 20, lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>
          {dateFrom && dateTo
            ? `Nessun giorno registrato ${conGiorno('dal', dateFrom, { lunga: true })} ${conGiorno('al', dateTo, { lunga: true })}.`
            : 'Nessun giorno registrato nel periodo scelto.'}
        </div>
        {ultimo && (
          <div>L&apos;ultimo giorno registrato è {conGiorno('il', ultimo, { lunga: true })}.</div>
        )}
        {ultimo && onPeriodo && (
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => {
              const [y, m, d] = ultimo.split('-').map(Number)
              onPeriodo(formatLocalDate(new Date(y, m - 3, d)), ultimo)
            }}
              style={{
                padding: '10px 18px', minHeight: 44, background: T.bgCard,
                color: T.brand, border: `1px solid ${T.brand}`, borderRadius: 10,
                fontSize: font.size.base, fontWeight: 700, cursor: 'pointer',
              }}>
              Guarda i due mesi fino {conGiorno('al', ultimo)}
            </button>
          </div>
        )}
        {onBack && (
          <div style={{ marginTop: 12 }}>
            <button onClick={onBack}
              style={{
                padding: '10px 18px', minHeight: 42, background: T.brand,
                color: '#FFF', border: 'none', borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
              Vai alla Produzione
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <SH sub="Analisi completa della produzione con metodo inventario differenziale: quanto hai prodotto, venduto, scartato + margini stimati dal listino formati.">
          Analisi produzione inventario
        </SH>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onBack && (
            <button onClick={onBack}
              style={{
                padding: '8px 14px', minHeight: 36, background: '#FFF',
                color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <Icon name="chevD" size={12} /> Torna alla Produzione
            </button>
          )}
          <button onClick={esportaXlsx}
            style={{
              padding: '8px 14px', minHeight: 36, background: '#FFF',
              color: T.brand, border: `1px solid ${T.brand}55`, borderRadius: 8,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <Icon name="download" size={13} /> Esporta Excel
          </button>
        </div>
      </div>

      <div data-copertura style={{
        fontSize: font.size.sm, color: T.textMid, lineHeight: 1.5, marginBottom: 12,
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <span style={{ display: 'inline-flex', marginTop: 2, color: T.textSoft }}><Icon name="calendar" size={14} /></span>
        <span>
          <b style={{ color: T.text }}>
            {copertura.n === 1 ? 'Un giorno registrato' : `${copertura.n.toLocaleString('it-IT')} giorni registrati`}
          </b>
          {copertura.n > 1 ? `, ${conGiorno('dal', copertura.primo)} ${conGiorno('al', copertura.ultimo)}` : `, ${conGiorno('il', copertura.primo)}`}
          {registrazioneFerma && <> · dopo {conGiorno('il', copertura.ultimo)} non c&apos;è niente di registrato</>}
          {daPartenza && <> · ti mostro i due mesi fino all&apos;ultimo giorno registrato</>}
          {confrontoInfo?.ok && confrontoInfo.from && (
            <> · confronto con {dataBreve(confrontoInfo.from)}–{dataBreve(confrontoInfo.to)}
              {confrontoInfo.giorniPrev === copertura.sedeGiorni
                ? ', con le stesse giornate registrate'
                : `, ${Number(confrontoInfo.giorniPrev || 0).toLocaleString('it-IT')} giornate registrate contro ${copertura.sedeGiorni.toLocaleString('it-IT')}`}
            </>
          )}
          {confrontoInfo && !confrontoInfo.ok && confrontoInfo.motivo && (
            <> · nessun confronto: {confrontoInfo.motivo}</>
          )}
        </span>
      </div>

      {/* 4 KPI con confronto periodo precedente */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14, marginBottom: 16 }}>
        <KpiCell label="Prodotto" value={`${kg(totali.prod)} kg`} delta={deltaPct(totali.prod, totaliPrev?.prod)} deltaLabel={deltaLabelText} highlight={false} color={C.text}/>
        <KpiCell label="Venduto stimato" value={`${kg(totali.vend)} kg`} delta={deltaPct(totali.vend, totaliPrev?.vend)} deltaLabel={deltaLabelText} highlight color={T.brand}/>
        <KpiCell label="Ricavo stimato" value={eur(totali.ricavo)} delta={deltaPct(totali.ricavo, totaliPrev?.ricavo)} deltaLabel={deltaLabelText} highlight color="#166534"/>
        <KpiCell
          label={totali.margPct != null ? `Margine (${pct(totali.margPct)})` : 'Margine'}
          value={totali.margine != null ? eur(totali.margine) : 'non calcolabile'}
          // Su quanti gusti è fatto: un margine calcolato su 15 gusti su 28 non
          // è il margine della gelateria, e chi legge deve saperlo.
          sub={totali.margine == null
            ? 'nessun gusto ha ricavo e costo'
            : (totali.nConMargine < totali.nConVendita ? `su ${totali.nConMargine} gusti su ${totali.nConVendita}` : null)}
          delta={totali.margine != null && totaliPrev?.margine != null ? deltaPct(totali.margine, totaliPrev.margine) : null}
          deltaLabel={deltaLabelText} highlight
          color={totali.margine == null ? T.textSoft : totali.margine >= 0 ? '#166534' : '#B91C1C'}/>
      </div>

      {riassunto.n > 0 && (
        <div data-caselle style={{
          background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: 10,
          padding: '10px 12px', marginBottom: 14, fontSize: font.size.sm, color: T.amberDark || T.amber,
          lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span style={{ display: 'inline-flex', marginTop: 2, flexShrink: 0 }}><Icon name="alert" size={14} /></span>
          <span>
            {riassunto.nRimanenza > 0 && (
              <>
                <b>
                  {riassunto.nRimanenza === 1 ? 'Una casella da sistemare' : `${riassunto.nRimanenza.toLocaleString('it-IT')} caselle da sistemare`}
                </b>: la rimanenza è rimasta a 0 nel giorno in cui si era prodotto, e il giorno dopo il venduto
                risulta negativo. È lo stesso gelato, contato nel giorno sbagliato.
                {riassunto.kgFuori < 0
                  ? ` Il venduto del periodo è più basso del vero di ${kg(-riassunto.kgFuori)} kg, perché il giorno da sistemare è prima del periodo.`
                  : ' Il venduto del periodo è giusto; quello dei singoli giorni no.'}
              </>
            )}
            {riassunto.nRimanenza > 0 && riassunto.nAltre > 0 && ' '}
            {riassunto.nAltre > 0 && (
              <>
                {riassunto.nAltre === 1 ? 'Una casella non torna' : `${riassunto.nAltre.toLocaleString('it-IT')} caselle non tornano`} per
                altri motivi ({kg(-riassunto.kgAltre)} kg): la rimanenza scritta è più alta di quanto c&apos;era a disposizione.
              </>
            )}
            <span style={{ display: 'block', marginTop: 4 }}>
              Da sistemare: {daSistemare.slice(0, 5).map(c => {
                const sede = nomeSede(c.sedeId)
                return `${c.gusto}${sede ? ` a ${sede}` : ''} ${conGiorno('il', c.giornoDaSistemare)}`
              }).join(', ')}
              {daSistemare.length > 5 ? ` e altre ${(daSistemare.length - 5).toLocaleString('it-IT')}` : ''}.
            </span>
          </span>
        </div>
      )}

      {/* ── I gusti che valgono zero perché il nome non trova la ricetta ──
          Prima l'avviso diceva «28 gusti su 28 non hanno ricetta… ricavo e
          food cost sono a zero» con 88.970 € di ricavo in pagina, e nessun
          modo di sistemare dalla pagina. Adesso dice quanti chili e quanti
          euro mancano, e il nome si collega alla ricetta qui. */}
      {(senzaRicetta.length > 0 || collegati.length > 0) && (
        <GustiSenzaRicetta
          senzaRicetta={senzaRicetta} collegati={collegati}
          euroKgMedio={euroKgMedio} ricettario={ricettario}
          collega={collega} pronto={nomiGusti != null}
          onNavigate={onNavigate} kg={kg} eur={eur} isMobile={isMobile}
        />
      )}
      {incompleti.length > 0 && (
        <div style={{
          background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: 10,
          padding: '10px 12px', marginBottom: 14, fontSize: font.size.sm, color: T.amberDark, lineHeight: 1.5,
        }}>
          {incompleti.length === 1 ? 'Un gusto ha' : `${incompleti.length.toLocaleString('it-IT')} gusti hanno`} la
          ricetta ma {incompleti.length === 1 ? 'non ha' : 'non hanno'} il prezzo di vendita o il costo di tutti gli
          ingredienti: il margine non si calcola ({incompleti.slice(0, 4).map(r => r.gusto).join(', ')}
          {incompleti.length > 4 ? ` e altri ${(incompleti.length - 4).toLocaleString('it-IT')}` : ''}).
        </div>
      )}

      {/* Trend chart */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Andamento produzione ({vista})
          </div>
          <div style={{ display: 'inline-flex', gap: 4, background: '#F8FAFC', padding: 3, borderRadius: 8 }}>
            {['giornaliero', 'settimana', 'mese'].map(v => (
              <button key={v} onClick={() => setVista(v)}
                style={{
                  padding: '6px 12px', minHeight: 34,
                  background: vista === v ? '#FFF' : 'transparent',
                  color: vista === v ? T.brand : T.textMid,
                  border: vista === v ? `1px solid ${T.border}` : '1px solid transparent',
                  borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>{v}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E9EF"/>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd"/>
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => v.toLocaleString('it-IT', { useGrouping: 'always' })}/>
            <Tooltip content={<ChartTip/>}/>
            <Legend wrapperStyle={{ fontSize: 12 }}/>
            <Bar dataKey="prod" name="Prodotto kg" fill={T.brand} radius={[4, 4, 0, 0]}/>
            <Bar dataKey="vend" name="Venduto stimato kg" fill="#F59E0B" radius={[4, 4, 0, 0]}/>
            <Bar dataKey="scarto" name="Scarto kg" fill="#B91C1C" radius={[4, 4, 0, 0]}/>
          </BarChart>
        </ResponsiveContainer>
        {vista === 'giornaliero' && riassunto.nRimanenza > 0 && (
          <div style={{ fontSize: font.size.sm, color: T.textMid, lineHeight: 1.45, marginTop: 8 }}>
            Il giorno dopo una rimanenza lasciata a 0 il venduto scende, anche sotto zero, e il giorno prima
            sale: è lo stesso gelato contato nel giorno sbagliato. Giorni da sistemare:{' '}
            {riassunto.giorni.slice(0, 8).map(dataBreve).join(', ')}
            {riassunto.giorni.length > 8 ? ` e altri ${(riassunto.giorni.length - 8).toLocaleString('it-IT')}` : ''}.
          </div>
        )}
      </div>

      {/* Top 10 gusti per venduto */}
      {top10.length > 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Top 10 gusti per venduto stimato
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top10.map((r, i) => (
              <div key={r.gusto} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, fontSize: 12, color: T.textSoft, fontWeight: 700, textAlign: 'right' }}>{i + 1}</div>
                <div style={{ minWidth: isMobile ? 90 : 160, fontSize: 12, color: T.text, fontWeight: 700 }}>{r.gusto}</div>
                <div style={{ flex: 1, height: 12, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${(r.vendKg / top10Max) * 100}%`, height: '100%', background: T.brand, borderRadius: 6 }}/>
                </div>
                <div style={{ minWidth: 90, textAlign: 'right', fontSize: 12, color: T.text, fontWeight: 700, ...TNUM }}>{kg(r.vendKg)} kg</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabella per gusto ordinabile */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 12, color: T.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Dettaglio per gusto (clicca sulle intestazioni per ordinare)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <TabellaOSchede

          minWidth={720}
          righe={sorted}
          chiave={(r) => r.gusto}
          vuoto="Nessun gusto nel periodo."
          apriEtichetta="Scarto, food cost, margine %"
          titolo={(r) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {r.gusto}
              {!completo(r) && (
                <span title="Ricetta o formato non collegato" style={{ color: T.amber, display: 'inline-flex' }}>
                  <Icon name="warning" size={13} />
                </span>
              )}
            </span>
          )}
          colonne={[
            { k: 'vend', label: 'Venduto', forte: true, cella: (r) => kg(r.vendKg) },
            { k: 'ricavo', label: 'Ricavo', forte: true, cella: (r) => r.ricavo > 0 ? eur(r.ricavo) : '-' },
            { k: 'marg', label: 'Margine', forte: true,
              cella: (r) => r.margine != null
                ? <span style={{ color: r.margine >= 0 ? T.green : T.red }}>{eur(r.margine)}</span> : '-' },
          ]}
          dettaglio={(r) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: font.size.sm }}>
              {[
                ['Prodotto', kg(r.prodKg), C.text],
                ['Scarto', r.scartoKg > 0 ? kg(r.scartoKg) : '-', r.scartoKg > 0 ? T.red : C.textSoft],
                ['Food cost', r.fc > 0 ? eur(r.fc) : '-', T.red],
                ['Margine %', r.margPct != null ? pct(r.margPct) : '-', r.margPct == null ? C.textSoft : r.margPct >= 40 ? T.green : r.margPct >= 20 ? T.amber : T.red],
              ].map(([et, v, col]) => (
                <div key={et} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: C.textSoft }}>{et}</span>
                  <span style={{ fontWeight: 700, color: col, ...TNUM }}>{v}</span>
                </div>
              ))}
            </div>
          )}
          riepilogoTelefono={
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, background: C.bgSubtle, padding: '12px 14px' }}>
              <div style={{ fontSize: font.size.sm, fontWeight: 800, color: C.text, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Totale</div>
              {[
                ['Prodotto', kg(totali.prod), C.text],
                ['Venduto', kg(totali.vend), C.text],
                ['Scarto', totali.scarto > 0 ? kg(totali.scarto) : '-', totali.scarto > 0 ? T.red : C.textSoft],
                ['Ricavo', eur(totali.ricavo), C.text],
                ['Food cost', eur(totali.fc), T.red],
                ['Margine', totali.margine != null ? eur(totali.margine) : '-', totali.margine == null ? C.textSoft : totali.margine >= 0 ? T.green : T.red],
                ['Margine %', totali.margPct != null ? pct(totali.margPct) : '-', C.text],
              ].map(([et, v, col]) => (
                <div key={et} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: font.size.base }}>
                  <span style={{ color: C.textSoft, fontWeight: 600 }}>{et}</span>
                  <span style={{ fontWeight: 800, color: col, ...TNUM }}>{v}</span>
                </div>
              ))}
            </div>
          }
          intestazione={<><thead>
              <tr style={{ background: '#F8FAFC' }}>
                <ThSort label="Gusto" col="gusto" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} left/>
                <ThSort label="Prod. kg" col="prodKg" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Venduto kg" col="vendKg" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Scarto kg" col="scartoKg" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Ricavo €" col="ricavo" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} bg="#FEF9EB"/>
                <ThSort label="Food cost" col="fc" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
                <ThSort label="Margine €" col="margine" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} bg="#F0FDF4"/>
                <ThSort label="Marg. %" col="margPct" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort}/>
              </tr>
            </thead></>}
          corpo={<><tbody>
              {sorted.map(r => (
                <tr key={r.gusto} style={{ borderTop: `1px solid #F1F5F9` }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: C.text }}>
                    {r.gusto}
                    {!completo(r) && <span title="Ricetta o formato non collegato" style={{ marginLeft: 6, color: '#B45309', fontSize: 12 }}>⚠</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM }}>{kg(r.prodKg)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM }}>{kg(r.vendKg)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: r.scartoKg > 0 ? '#B91C1C' : C.textSoft }}>{r.scartoKg > 0 ? kg(r.scartoKg) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, fontWeight: 700, background: '#FEF9EB' }}>{r.ricavo > 0 ? eur(r.ricavo) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: '#B91C1C' }}>{r.fc > 0 ? eur(r.fc) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: r.margine >= 0 ? '#166534' : '#B91C1C', background: '#F0FDF4' }}>{r.margine != null ? eur(r.margine) : '-'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', ...TNUM, color: r.margPct == null ? C.textSoft : r.margPct >= 40 ? '#166534' : r.margPct >= 20 ? '#B45309' : '#B91C1C' }}>{r.margPct != null ? pct(r.margPct) : '-'}</td>
                </tr>
              ))}
            </tbody></>}
          piede={<><tfoot>
              <tr style={{ background: '#F8FAFC', borderTop: `2px solid ${T.border}` }}>
                <td style={{ padding: '10px 12px', fontWeight: 800 }}>Totale</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800 }}>{kg(totali.prod)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800 }}>{kg(totali.vend)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: totali.scarto > 0 ? '#B91C1C' : C.textSoft }}>{totali.scarto > 0 ? kg(totali.scarto) : '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, background: '#FEF9EB' }}>{eur(totali.ricavo)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: '#B91C1C' }}>{eur(totali.fc)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800, color: totali.margine == null ? C.textSoft : totali.margine >= 0 ? '#166534' : '#B91C1C', background: '#F0FDF4' }}>{totali.margine != null ? eur(totali.margine) : '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', ...TNUM, fontWeight: 800 }}>{totali.margPct != null ? pct(totali.margPct) : '-'}</td>
              </tr>
            </tfoot></>}
        />
        </div>
      </div>
    </div>
  )
}

// ── Collegare un nome del foglio alla sua ricetta ──────────────────────────
function GustiSenzaRicetta({ senzaRicetta, collegati, euroKgMedio, ricettario, collega, pronto, onNavigate, kg, eur, isMobile }) {
  const [scelte, setScelte] = useState({})
  const [salvo, setSalvo] = useState(null)
  const [errore, setErrore] = useState(null)
  const [tutti, setTutti] = useState(false)
  const kgVenduti = senzaRicetta.reduce((s, r) => s + r.vendKg, 0)
  const kgProdotti = senzaRicetta.reduce((s, r) => s + r.prodKg, 0)
  const ricetteGusto = useMemo(() => Object.entries(ricettario?.ricette || {})
    .filter(([, r]) => !['semilavorato', 'interno'].includes(String(r?.tipo || '').toLowerCase()))
    .map(([chiave, r]) => ({ chiave, nome: r?.nome || chiave }))
    .sort((a, b) => a.nome.localeCompare(b.nome)), [ricettario])
  const proposte = useMemo(() => {
    const out = {}
    for (const r of senzaRicetta) out[r.gusto] = ricetteSimili(r.gusto, ricettario)
    return out
  }, [senzaRicetta, ricettario])
  // Si preseleziona solo una proposta molto simile; le altre le sceglie il
  // titolare. Il collegamento parte comunque solo col pulsante.
  const sceltaDi = (g) => scelte[g] ?? ((proposte[g]?.[0]?.punti || 0) >= 0.85 ? proposte[g][0].chiave : '')

  async function fai(gusto, ricetta) {
    if (salvo) return
    setSalvo(gusto); setErrore(null)
    try { await collega(gusto, ricetta) }
    catch (e) { setErrore(`Non sono riuscito a salvare (${e?.message || 'rete'}): il collegamento non è stato fatto.`) }
    finally { setSalvo(null) }
  }

  const campo = {
    minHeight: 44, padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
    background: T.bgCard, color: T.text, fontSize: font.size.md, fontFamily: 'inherit',
    minWidth: 0, flex: isMobile ? '1 1 100%' : '1 1 220px', boxSizing: 'border-box',
  }
  const pulsante = (attivo) => ({
    minHeight: 44, padding: '0 16px', borderRadius: 8, border: `1px solid ${T.brand}`,
    background: attivo ? T.brand : T.bgCard, color: attivo ? T.bgCard : T.brand,
    fontSize: font.size.sm, fontWeight: 700, cursor: attivo ? 'pointer' : 'default',
    opacity: attivo ? 1 : 0.5, whiteSpace: 'nowrap', fontFamily: 'inherit',
  })
  const elenco = tutti ? senzaRicetta : senzaRicetta.slice(0, 6)

  return (
    <div data-senza-ricetta style={{
      background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: 10,
      padding: '12px 14px', marginBottom: 14, fontSize: font.size.sm, color: T.amberDark, lineHeight: 1.5,
    }}>
      {senzaRicetta.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <b>
            {senzaRicetta.length === 1 ? 'Un gusto non trova la ricetta' : `${senzaRicetta.length.toLocaleString('it-IT')} gusti non trovano la ricetta`}
          </b>: {kg(kgVenduti)} kg venduti ({kg(kgProdotti)} kg prodotti) che non entrano né nel ricavo né nel food cost.
          {euroKgMedio != null && (
            <> Al prezzo medio dei formati ({euroKgMedio.toLocaleString('it-IT', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} €/kg)
              sono circa <b>{eur(kgVenduti * euroKgMedio)}</b> di ricavo stimato che mancano.</>
          )}
          {' '}Di solito è il nome scritto in un altro modo: collegalo alla sua ricetta, una volta, e vale per tutti i periodi.
        </div>
      )}
      {senzaRicetta.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {elenco.map((r) => {
            const prop = proposte[r.gusto] || []
            const scelta = sceltaDi(r.gusto)
            return (
              <div key={r.gusto} style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text,
              }}>
                <span style={{ flex: isMobile ? '1 1 100%' : '0 1 200px', minWidth: 0 }}>
                  <b>{r.gusto}</b>
                  <span style={{ display: 'block', color: T.textSoft, ...TNUM }}>
                    {kg(r.vendKg)} kg venduti{euroKgMedio != null ? ` · circa ${eur(r.vendKg * euroKgMedio)}` : ''}
                  </span>
                </span>
                <select aria-label={`Ricetta di ${r.gusto}`} value={scelta} disabled={!pronto}
                  onChange={(e) => setScelte(x => ({ ...x, [r.gusto]: e.target.value }))} style={campo}>
                  <option value="">{prop.length ? 'Scegli la ricetta…' : 'Nessuna ricetta simile: scegli dall\'elenco…'}</option>
                  {prop.length > 0 && (
                    <optgroup label="Simili">
                      {prop.map(p => <option key={`s-${p.chiave}`} value={p.chiave}>{p.nome}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Tutte le ricette">
                    {ricetteGusto.map(p => <option key={p.chiave} value={p.chiave}>{p.nome}</option>)}
                  </optgroup>
                </select>
                <button type="button" disabled={!pronto || !scelta || salvo != null}
                  onClick={() => fai(r.gusto, scelta)} style={pulsante(pronto && !!scelta && salvo == null)}>
                  {salvo === r.gusto ? 'Salvo…' : 'Collega'}
                </button>
              </div>
            )
          })}
          {senzaRicetta.length > 6 && (
            <button type="button" onClick={() => setTutti(v => !v)}
              style={{ ...pulsante(true), background: 'transparent', color: T.amberDark, borderColor: `${T.amber}55`, alignSelf: 'flex-start' }}>
              {tutti ? 'Mostra solo i primi 6' : `Vedi tutti e ${senzaRicetta.length.toLocaleString('it-IT')}`}
            </button>
          )}
          {onNavigate && (
            <span>
              Se la ricetta non c&apos;è proprio, va creata:{' '}
              <button type="button" onClick={() => onNavigate('ricettario')}
                style={{ background: 'none', border: 'none', padding: 0, minHeight: 44, color: T.brand, fontWeight: 700, cursor: 'pointer', fontSize: font.size.sm, fontFamily: 'inherit', textDecoration: 'underline' }}>
                apri il Ricettario
              </button>.
            </span>
          )}
        </div>
      )}
      {collegati.length > 0 && (
        <div style={{ marginTop: senzaRicetta.length > 0 ? 10 : 0, color: T.textMid }}>
          Collegati: {collegati.map((r, i) => (
            <span key={r.gusto} style={{ whiteSpace: 'nowrap' }}>
              {i > 0 ? ', ' : ''}{r.gusto} → {r.ricetta}{' '}
              <button type="button" disabled={salvo != null} onClick={() => fai(r.gusto, null)}
                aria-label={`Scollega ${r.gusto}`}
                style={{ background: 'none', border: 'none', padding: '0 2px', minHeight: 44, color: T.brand, cursor: 'pointer', fontSize: font.size.sm, fontFamily: 'inherit', textDecoration: 'underline' }}>
                {salvo === r.gusto ? 'salvo…' : 'scollega'}
              </button>
            </span>
          ))}
        </div>
      )}
      {errore && <div role="alert" style={{ marginTop: 8, color: T.red, fontWeight: 700 }}>{errore}</div>}
    </div>
  )
}

function KpiCell({ label, value, sub = null, delta, deltaLabel = 'vs periodo prec.', highlight, color }) {
  const deltaColor = delta == null ? T.textSoft : delta > 0 ? '#166534' : delta < 0 ? '#B91C1C' : T.textSoft
  const deltaSymbol = delta == null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '='
  return (
    <div style={{
      background: highlight ? '#FEF9EB' : '#F8FAFC',
      border: `1px solid ${T.border}`,
      borderRadius: 10, padding: 14, minHeight: 90,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, ...TNUM, lineHeight: 1.1 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 4, lineHeight: 1.35 }}>{sub}</div>
      )}
      {delta != null && deltaLabel && (
        <div style={{ fontSize: 12, color: deltaColor, fontWeight: 700, marginTop: 4, ...TNUM }}>
          {deltaSymbol} {fmtp(Math.abs(delta))} {deltaLabel}
        </div>
      )}
    </div>
  )
}

function ThSort({ label, col, sortBy, sortDir, onSort, left, bg }) {
  const active = sortBy === col
  return (
    <th onClick={() => onSort(col)}
      title={`Ordina per ${label}`}
      style={{
        padding: '10px 12px',
        textAlign: left ? 'left' : 'right',
        fontSize: 12, fontWeight: 700, color: active ? T.brand : T.textSoft,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        cursor: 'pointer', userSelect: 'none',
        background: bg || '#F8FAFC',
        position: left ? 'sticky' : undefined, left: left ? 0 : undefined,
        minWidth: left ? 160 : 90,
      }}>
      {label}
      {active && <span style={{ marginLeft: 4, display: 'inline-flex' }}><Icon name={sortDir === 'asc' ? 'chevUp' : 'chevDown'} size={11} /></span>}
    </th>
  )
}
