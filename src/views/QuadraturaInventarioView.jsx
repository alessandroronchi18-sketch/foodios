// Quadratura inventario vs cassa - Dashboard del proprietario.
//
// Mostra (per la settimana selezionata) il confronto tra:
//   - kg venduti calcolati dall inventario (riman+prod-riman-scarto)
//   - euro effettivamente incassati dalla cassa (chiusure SK_CHIUS)
//   - euro attesi al euro/kg medio dei formati di vendita
// Diff = porzioni troppo grandi, omaggi non registrati, errori scontrino,
// furti, o errori di compilazione inventario.
//
// E la "voce di verita" che mette in tensione i due dati: l inventario dice
// quanto e uscito (kg), la cassa dice quanto e entrato (euro). Il sistema
// suggerisce dove guardare per chiudere il gap.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { color as T, typo, ui3, ui, font } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { sload } from '../lib/storage'
import { aggiungiGiorni, todayLocal } from '../lib/dateLocal'
import { supabase } from '../lib/supabase'
import { SK_FORMATI } from '../lib/storageKeys'
import Icon from '../components/Icon'
import { conGiorno, giorniRegistrati } from '../lib/produzioneAnalisi'
import ExportPdfButton from '../components/ExportPdfButton'
import { CoperturaDati, IntestazioneAnalisi } from '../components/analisi'
import PaginaAnalisi from '../components/analisi/PaginaAnalisi'
import NavigatoreSettimana from './quadratura/NavigatoreSettimana'
import { vociCoperturaQuadratura } from './quadratura/copertura'
import { riassuntoSistemabili } from './produzione/copertura'
import Risposta from './quadratura/Risposta'
import UltimeSettimane from './quadratura/UltimeSettimane'
import SediSettimana from './quadratura/SediSettimana'
import { bilancioVetrina } from '../lib/produzioneQuadro'
import { C, TNUM, fmt0 } from './_shared'
import {
  caricaSettimana, calcolaVendutoSettimana, lunediDellaSettimana,
  euroKgMedioFormati, kpiQuadraturaSettimana, classificaGusti,
  accettaScostamento, CAUSA_RIMANENZA_A_ZERO, ultimoGiornoRegistrato,
  matriceDiPiuSedi, matricePerGusto, dettaglioGustiSettimana, GIORNI_VETRINA_SOFFERENZA,
} from '../lib/inventarioProduzione'

// ── Helpers data/numeri (IT) ──────────────────────────────────────────────
// I giorni si sommano in giorni, non in millisecondi e non passando da
// `new Date('2026-03-29')` — che è mezzanotte a Greenwich — per poi rileggere
// il risultato con `toISOString()`, che a Greenwich ci torna. Attraversando il
// cambio dell'ora (29 marzo e 25 ottobre 2026) quel viavai sposta la settimana
// di un giorno: «settimana precedente» saltava alla domenica e la quadratura
// confrontava sette giorni contro otto.
const addDays = (dateIso, n) => aggiungiGiorni(dateIso, n)

function fmtRange(lunediIso) {
  // Mezzogiorno, non mezzanotte UTC: l'etichetta della settimana deve dire
  // gli stessi giorni che la tabella sotto sta mostrando.
  const lun = new Date(`${lunediIso}T12:00:00`)
  const dom = new Date(`${aggiungiGiorni(lunediIso, 6)}T12:00:00`)
  const f = d => d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  return `${f(lun)} - ${f(dom)} ${dom.getFullYear()}`
}
// Numero intero con separatore migliaia IT (1.234)
function n0(v) { return Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 }) }
// kg con 1 decimale e separatore IT (1.234,5)
function nKg(g) {
  return (Number(g) / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
function pct(v) {
  if (v == null) return '-'
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  // Max 1 decimale (regola: percentuali con max 1 decimale)
  return `${n > 0 ? '+' : ''}${n.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

const maiuscola = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function csvEscape(s) {
  const v = String(s ?? '')
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

// ── Esportazione della settimana (CSV e PDF) ──────────────────────────────
//
// 03/10/2026, audit: il dettaglio gusti leggeva campi che non esistono sulle
// righe grezze del database, e usciva una riga senza nome e piena di zeri per
// ogni riga, compresi i sette giorni prima del lunedì. Gli importi erano
// numeri grezzi («12345,6789») e un valore che manca diventava «0»: una
// cassa non registrata arrivava al commercialista come incasso zero.
//
// Adesso il dettaglio è una riga per gusto (`dettaglioGustiSettimana`), i
// chili hanno un decimale, gli euro due, e quello che non si sa resta vuoto
// o lo dice a parole.
const csvKg = (g) => (g == null ? '' : (Number(g) / 1000).toFixed(1).replace('.', ','))
const csvEuro = (v) => (v == null || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(2).replace('.', ','))

export function testoCsvSettimana({ lunediIso, kpi, dettaglio, sedeAttiva, isAllSedi, perSede }) {
  const lines = []
  const sep = ';'
  const riga = (...celle) => lines.push(celle.map(csvEscape).join(sep))
  const sedeName = isAllSedi ? 'TUTTE LE SEDI' : (sedeAttiva?.nome || '')
  riga('# Quadratura inventario e cassa', sedeName, fmtRange(lunediIso))
  lines.push('')
  riga('# Riepilogo settimana')
  riga('Voce', 'Valore')
  riga('Venduto da inventario (kg)', csvKg(kpi.totVendutoG))
  riga('Vendite all\'ingrosso (kg)', csvKg((kpi.b2bKg || 0) * 1000))
  riga('Venduto al banco (kg)', csvKg(((kpi.retailKg ?? kpi.totVendutoKg) || 0) * 1000))
  // Uno scarto mai scritto non è «niente buttato»: è contato nel venduto.
  const scartoG = (dettaglio || []).reduce((t, r) => t + (Number(r.scartoG) || 0), 0)
  riga('Scarto (kg)', scartoG > 0 ? csvKg(scartoG) : 'non registrato: quello che si butta è contato nel venduto')
  riga('Incasso stimato dall\'inventario (€)', csvEuro(kpi.ricavoAtteso))
  riga('Cassa (€)', kpi.cassaRegistrata ? csvEuro(kpi.cassaEffettiva) : 'non registrata')
  riga('Differenza con la cassa (€)', kpi.driftEur != null ? csvEuro(kpi.driftEur) : `non calcolabile: ${kpi.motivoConfronto || 'manca la cassa'}`)
  riga('Differenza con la cassa (%)', kpi.driftPct != null ? pct(kpi.driftPct) : '')
  if (kpi.driftEur != null && kpi.giorniConfrontati < kpi.giorniInventario) {
    riga('Giorni confrontati', `${kpi.giorniConfrontati} su ${kpi.giorniInventario}`)
  }
  lines.push('')
  if (Array.isArray(dettaglio) && dettaglio.length > 0) {
    riga('# Dettaglio gusti')
    riga('Gusto', 'In vetrina all\'inizio (kg)', 'Prodotto (kg)', 'Scarto (kg)', 'In vetrina alla fine (kg)', 'Venduto (kg)')
    for (const r of dettaglio) {
      riga(r.gusto, csvKg(r.inizialeG), csvKg(r.prodottoG), csvKg(r.scartoG), csvKg(r.finaleG), csvKg(r.vendutoG))
    }
    lines.push('')
  }
  if (isAllSedi && Array.isArray(perSede) && perSede.length > 0) {
    riga('# Dettaglio per sede')
    riga('Sede', 'Venduto al banco (kg)', 'Ingrosso (kg)', 'Incasso stimato (€)', 'Cassa (€)')
    for (const p of perSede) {
      riga(
        p.sede?.nome || '',
        csvKg(((p.kpi.retailKg ?? p.kpi.totVendutoKg) || 0) * 1000),
        csvKg((p.kpi.b2bKg || 0) * 1000),
        csvEuro(p.kpi.ricavoAtteso),
        // Le chiusure arrivano già sommate: la cassa di una sede non si sa.
        'non separabile per sede',
      )
    }
  }
  return '\uFEFF' + lines.join('\n')  // BOM per Excel
}

function esportaCsvSettimana(args) {
  const csv = testoCsvSettimana(args)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quadratura_${args.lunediIso}_${(args.isAllSedi ? 'tutte-le-sedi' : (args.sedeAttiva?.nome || 'sede')).replace(/\s+/g, '_')}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function reportPdfSettimana({ lunediIso, kpi, dettaglio, sedeAttiva, isAllSedi, perSede, euroKg }) {
  return {
    title: 'Quadratura inventario e cassa',
    subtitle: isAllSedi ? 'Tutte le sedi' : (sedeAttiva?.nome || ''),
    periodo: fmtRange(lunediIso),
    kpi: [
      { label: 'Venduto (kg)', value: nKg(kpi.totVendutoG ?? 0), sub: 'da inventario' },
      { label: 'Incasso stimato', value: fmt0(kpi.ricavoAtteso ?? 0), sub: euroKg != null ? `stimato: ${n0(euroKg)} €/kg medio` : '' },
      { label: 'Cassa', value: kpi.cassaRegistrata ? fmt0(kpi.cassaEffettiva) : 'non registrata' },
      { label: 'Differenza con la cassa', value: kpi.driftEur != null ? `${fmtDriftEur(kpi.driftEur)} (${pct(kpi.driftPct)})` : 'non calcolabile' },
    ],
    sections: [
      ...(Array.isArray(dettaglio) && dettaglio.length > 0 ? [{
        title: 'Dettaglio gusti',
        table: {
          columns: ['Gusto', 'Inizio (kg)', 'Prodotto (kg)', 'Scarto (kg)', 'Fine (kg)', 'Venduto (kg)'],
          alignments: ['left', 'right', 'right', 'right', 'right', 'right'],
          rows: dettaglio.map(r => [
            r.gusto,
            r.inizialeG == null ? '-' : nKg(r.inizialeG),
            nKg(r.prodottoG),
            nKg(r.scartoG),
            r.finaleG == null ? '-' : nKg(r.finaleG),
            r.vendutoG == null ? '-' : nKg(r.vendutoG),
          ]),
        },
      }] : []),
      ...(isAllSedi && Array.isArray(perSede) && perSede.length > 0 ? [{
        title: 'Dettaglio per sede',
        table: {
          columns: ['Sede', 'Al banco (kg)', 'Ingrosso (kg)', 'Incasso stimato'],
          alignments: ['left', 'right', 'right', 'right'],
          rows: perSede.map(p => [
            p.sede?.nome || '',
            nKg(((p.kpi.retailKg ?? p.kpi.totVendutoKg) || 0) * 1000),
            nKg((p.kpi.b2bKg || 0) * 1000),
            fmt0(p.kpi.ricavoAtteso ?? 0),
          ]),
        },
      }] : []),
    ],
  }
}

// Differenza con € DOPO la cifra («+ 1.234 €»), solo per il PDF: il segno
// meno tipografico (−) nei caratteri standard del PDF non sempre si stampa.
function fmtDriftEur(v) {
  if (v == null || !Number.isFinite(Number(v))) return '-'
  const n = Math.round(Number(v))
  const sign = n > 0 ? '+ ' : (n < 0 ? '- ' : '')
  const abs = Math.abs(n).toLocaleString('it-IT', { useGrouping: 'always' })
  return `${sign}${abs} €`
}

export default function QuadraturaInventarioView({ orgId, sedeId, sedi, sedeAttiva, chiusure, metodoProduzione = 'stampi', onNavigate, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const isAllSedi = sedeAttiva?._all === true
  const [lunediIso, setLunediIso] = useState(() => lunediDellaSettimana())
  // Le righe della settimana (e di quella prima) SEDE PER SEDE: { [sedeId]: righe }.
  const [righePerSede, setRighePerSede] = useState({})
  const [righePrevPerSede, setRighePrevPerSede] = useState({})
  const [formati, setFormati] = useState([])
  const [venditeB2bSett, setVenditeB2bSett] = useState([])
  const [venditeB2bPrec, setVenditeB2bPrec] = useState([])
  const [trendData, setTrendData] = useState([])  // [{ lunIso, kg, cassa }] x 4 settimane
  const [loading, setLoading] = useState(true)
  // Di quale settimana sono le righe in memoria: finché non è quella mostrata
  // la pagina è «in caricamento», non una settimana vuota (al cambio di
  // settimana c'è un istante in cui le righe sono ancora quelle di prima).
  const [settimanaCaricata, setSettimanaCaricata] = useState(null)
  const [erroreLettura, setErroreLettura] = useState(false)
  // L'ultimo giorno registrato e se la pagina si è spostata lì all'apertura.
  const [apertura, setApertura] = useState(null)   // { ultimo, spostata }
  // Il pulsante «Vedi» della copertura porta all'elenco delle caselle.
  const refCaselle = useRef(null)

  // Touch target minimo: ≥40 mobile, ≥44 tablet (regola permanente CLAUDE.md)
  // Era `isTablet ? 44 : 40`: il tablet aveva la misura giusta e il telefono
  // no, che è lo stesso verso sbagliato già visto sui campi di testo. La
  // misura sta in theme.js (ui.ctrlH) e vale 44 su tutto quello che si tocca.
  const tapMin = ui3(isMobile, isTablet, ui.ctrlH)

  // ── Quali sedi si leggono ──────────────────────────────────────────────
  // Quella attiva; in «Tutte le sedi» tutte quelle che producono. Prima in
  // «Tutte le sedi» `sedeId` è null e il caricamento usciva subito: niente
  // formati, euro al chilo nullo, e la pagina chiedeva di «impostare i
  // formati di vendita» che c'erano già (otto, da Mara).
  const sediDaLeggere = useMemo(() => {
    if (sedeId) return [{ id: sedeId, nome: sedeAttiva?.nome || '' }]
    if (!isAllSedi) return []
    return (sedi || []).filter(s => s.attiva !== false && s.is_sede_produzione !== false)
  }, [sedeId, isAllSedi, sedi, sedeAttiva])
  const sediKey = sediDaLeggere.map(s => s.id).join(',')
  const nomeSede = (id) => sediDaLeggere.find(s => s.id === id)?.nome || ''

  // ── Si apre dove ci sono i dati ────────────────────────────────────────
  // Prima apriva sempre sulla settimana di oggi: per Mara, a ottobre, una
  // settimana vuota mostrata come «0,0 kg · 0 € · 0 €», con l'ultima
  // settimana vera cinque clic indietro e nessuna parola per dirlo.
  useEffect(() => {
    if (!orgId || sediDaLeggere.length === 0) return undefined
    let alive = true
    // 04/10/2026, decisione del titolare: si apre sull'ultima settimana
    // INTERA con i dati, come «Il mese» si apre sull'ultimo mese chiuso. Sui
    // dati di Mara l'ultimo giorno è lunedì 31/08: la pagina apriva la
    // settimana 31/08-06/09, con un giorno solo (173 kg contro i 1.142 della
    // settimana prima). «Intera» vuol dire che la sua domenica non va oltre
    // l'ultimo giorno registrato; se quella settimana non ha niente, resta
    // la settimana dell'ultimo giorno, come prima.
    const ids = sediDaLeggere.map(s => s.id)
    ;(async () => {
      const ultimo = await ultimoGiornoRegistrato(orgId, ids, { finoA: todayLocal() }).catch(() => null)
      if (!alive) return
      const lunOggi = lunediDellaSettimana()
      if (!ultimo) { setApertura({ ultimo: null, spostata: false }); return }
      const lunUltimoGiorno = lunediDellaSettimana(`${ultimo}T12:00:00`)
      let lunedi = lunUltimoGiorno
      let intera = addDays(lunUltimoGiorno, 6) === ultimo
      if (!intera) {
        const prima = addDays(lunUltimoGiorno, -7)
        const fine = addDays(prima, 6)
        const u = await ultimoGiornoRegistrato(orgId, ids, { finoA: fine }).catch(() => null)
        if (!alive) return
        if (u && u >= prima && u <= fine) { lunedi = prima; intera = true }
      }
      if (lunedi !== lunOggi) setLunediIso(lunedi)
      setApertura({ ultimo, lunedi, intera, spostata: lunedi !== lunOggi })
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sediKey])

  useEffect(() => {
    let alive = true
    if (!orgId || sediDaLeggere.length === 0) { setLoading(false); return undefined }
    setLoading(true)
    const ids = sediDaLeggere.map(s => s.id)
    const lunPrec = addDays(lunediIso, -7)
    const finePrec = lunediIso
    const fineSett = addDays(lunediIso, 7)
    const b2b = (da, a) => supabase.from('vendite_b2b').select('data, righe, totale, sede_id')
      .eq('organization_id', orgId).in('sede_id', ids)
      .gte('data', da).lt('data', a)
      .then(({ data }) => data || [])
    Promise.all([
      Promise.all(ids.map(id => caricaSettimana(orgId, id, lunediIso))),
      Promise.all(ids.map(id => caricaSettimana(orgId, id, lunPrec))),
      sload(SK_FORMATI, orgId, null),
      // Vendite B2B della sett. corrente e della precedente (per togliere
      // i kg B2B dal confronto cassa retail, evita drift falso).
      b2b(lunediIso, fineSett),
      b2b(lunPrec, finePrec),
    ]).then(([sett, prec, fmt, b2bS, b2bP]) => {
      if (!alive) return
      setRighePerSede(Object.fromEntries(ids.map((id, i) => [id, sett[i] || []])))
      setRighePrevPerSede(Object.fromEntries(ids.map((id, i) => [id, prec[i] || []])))
      setFormati(Array.isArray(fmt) ? fmt : [])
      setVenditeB2bSett(b2bS || [])
      setVenditeB2bPrec(b2bP || [])
      setErroreLettura(false)
      setSettimanaCaricata(lunediIso)
      setLoading(false)
    }).catch(e => {
      if (!alive) return
      console.error(e)
      // Una lettura fallita non è una settimana vuota: lo si dice.
      setRighePerSede({}); setRighePrevPerSede({})
      setErroreLettura(true)
      setSettimanaCaricata(lunediIso)
      setLoading(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sediKey, lunediIso])

  // Il venduto si calcola sede per sede; poi due viste delle stesse celle:
  // una per i conti (ogni casella una volta), una per gusto (la classifica).
  const matrici = useMemo(() => Object.entries(righePerSede)
    .map(([id, rs]) => ({ sedeId: id, matrice: calcolaVendutoSettimana(rs, lunediIso) })), [righePerSede, lunediIso])
  const matrice = useMemo(() => matriceDiPiuSedi(matrici), [matrici])
  const matriceGusti = useMemo(() => matricePerGusto(matrici), [matrici])
  // Le righe di tutte le sedi insieme, per contare i giorni registrati.
  const righe = useMemo(() => Object.values(righePerSede).flat(), [righePerSede])
  const giorniSettimana = useMemo(
    () => giorniRegistrati(righe, { da: lunediIso, a: addDays(lunediIso, 6) }),
    [righe, lunediIso]
  )

  // Le celle da controllare, una per una.
  //
  // La fascia diceva QUANTE sono, non QUALI: per trovarle bisognava aprire
  // l'inventario e cercarle a occhio fra quattordici colonne. Sui dati del
  // design partner sono 604 su 7.012, quindi "cercarle a occhio" vuol dire
  // non trovarle mai.
  const celleDaControllare = useMemo(() => {
    const out = []
    for (const { sedeId: idSede, matrice: m } of matrici) {
      for (const [gusto, byData] of Object.entries(m || {})) {
        for (const [dataIso, c] of Object.entries(byData)) {
          if (!c?.daControllare) continue
          out.push({
            gusto, data: dataIso, sedeId: idSede,
            mancano: Math.abs(Number(c.venduto) || 0),
            rimanPrec: c.rimanPrec, prod: c.prod, riman: c.riman,
            // Per la causa più frequente la casella da sistemare è quella del
            // giorno PRIMA (la rimanenza lasciata a 0): l'elenco deve indicare
            // quella, non la casella negativa.
            causa: c.causa || null,
            giornoDaSistemare: c.giornoDaSistemare || null,
          })
        }
      }
    }
    return out.sort((a, b) => b.mancano - a.mancano)
  }, [matrici])

  const [accettando, setAccettando] = useState(null)   // chiave della cella in salvataggio
  const [mostraTutteLeCelle, setMostraTutteLeCelle] = useState(false)

  // "È giusta così": lo scostamento resta nel totale (la merce è uscita
  // davvero) ma la cella esce dall'elenco delle cose da guardare. Si scrive
  // sulla sede della casella: in «Tutte le sedi» non ce n'è una attiva.
  const accettaCella = async (cella, nota) => {
    const chiave = `${cella.sedeId}|${cella.gusto}|${cella.data}`
    if (accettando) return
    setAccettando(chiave)
    try {
      await accettaScostamento(orgId, cella.sedeId, cella.gusto, cella.data, { accettato: true, nota })
      // Ricarico la settimana: il conteggio in alto deve scendere subito.
      const righeNuove = await caricaSettimana(orgId, cella.sedeId, lunediIso)
      setRighePerSede(x => ({ ...x, [cella.sedeId]: righeNuove }))
      notify?.(`${cella.gusto} del ${cella.data.slice(8, 10)}: segnata come giusta.`)
    } catch (e) {
      notify?.('Non ho potuto salvare: ' + (e?.message || 'rete'), false)
    } finally {
      setAccettando(null)
    }
  }
  const matricePrev = useMemo(() => matriceDiPiuSedi(Object.entries(righePrevPerSede)
    .map(([id, rs]) => ({ sedeId: id, matrice: calcolaVendutoSettimana(rs, addDays(lunediIso, -7)) }))),
  [righePrevPerSede, lunediIso])
  const euroKg = useMemo(() => euroKgMedioFormati(formati), [formati])

  // Chiusure della settimana target (filtrate per data).
  const chiusureSett = useMemo(() => {
    const inizio = lunediIso
    const fine = addDays(lunediIso, 7)
    return (chiusure || []).filter(c => c.data >= inizio && c.data < fine)
  }, [chiusure, lunediIso])
  const chiusurePrev = useMemo(() => {
    const inizio = addDays(lunediIso, -7)
    const fine = lunediIso
    return (chiusure || []).filter(c => c.data >= inizio && c.data < fine)
  }, [chiusure, lunediIso])

  // Sparkline: ultime 4 settimane (incluse la corrente). Per ogni settimana
  // calcoliamo kg venduti totali dall'inventario + cassa retail. La cassa
  // arriva da `chiusure` (già filtrata dal Dashboard), l'inventario serve
  // un fetch separato, sede per sede.
  useEffect(() => {
    if (!orgId || sediDaLeggere.length === 0) return undefined
    let alive = true
    const ids = sediDaLeggere.map(s => s.id)
    const settimane = []
    for (let i = 3; i >= 0; i--) settimane.push(addDays(lunediIso, -7 * i))
    Promise.all(settimane.map(lun => Promise.all(ids.map(id => caricaSettimana(orgId, id, lun)))))
      .then(perSettimana => {
        if (!alive) return
        const out = settimane.map((lun, idx) => {
          const matr = matriceDiPiuSedi(ids.map((id, j) => ({ sedeId: id, matrice: calcolaVendutoSettimana(perSettimana[idx][j], lun) })))
          const fineW = addDays(lun, 7)
          const chiusW = (chiusure || []).filter(c => c.data >= lun && c.data < fineW)
          // Prima questa somma era scritta a mano qui dentro, in parallelo a
          // quella del KPI: due conti diversi sullo stesso dato, liberi di
          // divergere alla prima modifica di uno dei due. Ora è la stessa
          // funzione, e porta anche il conto delle celle che non tornano.
          const kp = kpiQuadraturaSettimana(matr, chiusW, euroKg, null)
          return {
            lunIso: lun,
            kg: kp.totVendutoKg,
            cassa: kp.cassaEffettiva,
            nonQuadrate: kp.celleNonQuadrate,
            // Per dire se il conto torna settimana per settimana.
            giorni: kp.giorniInventario,
            atteso: kp.ricavoAtteso,
            driftEur: kp.driftEur,
            driftPct: kp.driftPct,
          }
        })
        setTrendData(out)
      })
      .catch(e => console.error('trend:', e))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sediKey, lunediIso, chiusure, euroKg])

  // Dettaglio per sede (solo «Tutte le sedi»): dalle stesse righe già lette,
  // senza una seconda lettura. La cassa per sede non si può separare (le
  // chiusure arrivano già sommate dal Dashboard): il dettaglio mostra
  // l'inventario e l'ingrosso, non uno scostamento per sede.
  const perSede = useMemo(() => {
    if (!isAllSedi || metodoProduzione !== 'inventario') return []
    return matrici.map(({ sedeId: id, matrice: m }) => ({
      sede: sediDaLeggere.find(s => s.id === id) || { id, nome: '' },
      kpi: kpiQuadraturaSettimana(m, [], euroKg, (venditeB2bSett || []).filter(v => v.sede_id === id)),
    }))
  }, [isAllSedi, metodoProduzione, matrici, sediDaLeggere, euroKg, venditeB2bSett])

  const kpi = useMemo(
    () => kpiQuadraturaSettimana(matrice, chiusureSett, euroKg, venditeB2bSett),
    [matrice, chiusureSett, euroKg, venditeB2bSett]
  )
  const kpiPrev = useMemo(
    () => kpiQuadraturaSettimana(matricePrev, chiusurePrev, euroKg, venditeB2bPrec),
    [matricePrev, chiusurePrev, euroKg, venditeB2bPrec]
  )
  const classifica = useMemo(() => classificaGusti(matriceGusti), [matriceGusti])
  // Una riga per gusto, per il CSV e il PDF.
  const dettaglioGusti = useMemo(() => dettaglioGustiSettimana(righePerSede, lunediIso), [righePerSede, lunediIso])
  // Il conto della vetrina della settimana (c'era + fatto − venduto = resta),
  // sede per sede: si fa anche senza la cassa. Le righe di `caricaSettimana`
  // non portano la sede, gliela si mette qui.
  const vetrinaSett = useMemo(() => bilancioVetrina(
    Object.entries(righePerSede).flatMap(([id, rs]) => (rs || []).map(r => ({ ...r, sede_id: id }))),
    { da: lunediIso, a: addDays(lunediIso, 6) }
  ), [righePerSede, lunediIso])
  // Lo scarto mai scritto non è «niente buttato»: finisce nel venduto.
  const scartoRegistrato = useMemo(
    () => righe.some(r => r.data >= lunediIso && r.data <= addDays(lunediIso, 6) && (Number(r.scarto_g) || 0) > 0),
    [righe, lunediIso]
  )

  const settimanaPrec = () => setLunediIso(addDays(lunediIso, -7))
  const settimanaSucc = () => setLunediIso(addDays(lunediIso, 7))
  const oggi = () => setLunediIso(lunediDellaSettimana())
  // La settimana su cui la pagina si è aperta (l'ultima intera con i dati).
  const lunUltimo = apertura?.lunedi || (apertura?.ultimo ? lunediDellaSettimana(`${apertura.ultimo}T12:00:00`) : null)
  const inCaricamento = loading || (sediDaLeggere.length > 0 && settimanaCaricata !== lunediIso)

  // La riga chiusa della copertura: «da sistemare» solo di quello che si
  // sistema (la cassa, le caselle), il resto per nome.
  const vociCopertura = vociCoperturaQuadratura({
    giorni: giorniSettimana, kpi, euroKg, scartoRegistrato,
    apertura: apertura?.spostata && lunediIso === lunUltimo ? apertura : null,
    azioni: { cassa: onNavigate ? () => onNavigate('chiusura') : null, caselle: () => refCaselle.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) },
  })

  // ── Render ─────────────────────────────────────────────────────────────

  if (!orgId) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
  }
  // Quando isAllSedi e' attivo non serve sedeId: il drill-down per sede e'
  // già gestito dal blocco perSede.
  if (!sedeId && !isAllSedi) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Seleziona una sede</div>
  }

  return (
    <PaginaAnalisi isMobile={isMobile}>
      <IntestazioneAnalisi
        domanda="Torna il conto?"
        sotto={`${isAllSedi ? 'Tutte le sedi' : (sedeAttiva?.nome || '')}${(isAllSedi || sedeAttiva?.nome) ? ' · ' : ''}l'inventario dice quanto gelato è uscito, la cassa quanto è entrato`}
        isMobile={isMobile}
        destra={<NavigatoreSettimana etichetta={fmtRange(lunediIso)} onPrima={settimanaPrec} onDopo={settimanaSucc}
          onOggi={lunediIso !== lunediDellaSettimana() ? oggi : null} />}
      />

      {/* Si è aperta sull'ultima settimana intera: lo si dice sotto la
          domanda, come «Il mese», con il passaggio alla settimana
          dell'ultimo giorno. */}
      {!inCaricamento && apertura?.spostata && apertura.intera && lunediIso === apertura.lunedi && apertura.ultimo > addDays(apertura.lunedi, 6) && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: font.size.base, color: C.textMid }}>
          <Icon name="info" size={14} />
          <span>L&apos;ultimo giorno registrato è {conGiorno('il', apertura.ultimo)}: ti mostro l&apos;ultima settimana intera.</span>
          <button type="button" onClick={() => setLunediIso(lunediDellaSettimana(`${apertura.ultimo}T12:00:00`))}
            style={{ border: 'none', background: 'transparent', color: T.brand, fontWeight: 700, fontSize: font.size.base, cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', minHeight: 44 }}>
            Vai alla settimana {conGiorno('del', lunediDellaSettimana(`${apertura.ultimo}T12:00:00`))}
          </button>
        </div>
      )}

      {/* Da dove vengono i numeri, una frase per fonte (ANALISI_DESIGN.md,
          regola 3). La riga «dopo il … non c'è niente» sta qui dentro. */}
      {!inCaricamento && !erroreLettura && giorniSettimana.n > 0 && (
        <CoperturaDati isMobile={isMobile} voci={vociCopertura} riassunto={riassuntoSistemabili(vociCopertura)} />
      )}

      {inCaricamento ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
      ) : erroreLettura ? (
        <div role="alert" style={{
          padding: isMobile ? 20 : 28, background: C.bgCard, border: `1px solid ${T.red}`,
          borderRadius: 14, marginBottom: 20, textAlign: 'center', color: T.red, fontSize: font.size.base,
        }}>
          Non sono riuscito a leggere l&apos;inventario di questa settimana. Riprova fra poco.
        </div>
      ) : giorniSettimana.n === 0 ? (
        // Prima una settimana vuota diventava «0,0 kg · 0 € · 0 € · 0 €»:
        // zero meno zero fa zero, ma qui la risposta è «non lo so».
        <div data-settimana-vuota style={{
          padding: isMobile ? 20 : 28, background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 14, marginBottom: 20, textAlign: 'center', color: C.textMid,
          fontSize: font.size.base, lineHeight: 1.55,
        }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Nessun giorno registrato in questa settimana.</div>
          {apertura?.ultimo && (
            <div>L&apos;ultimo giorno registrato è {conGiorno('il', apertura.ultimo, { lunga: true })}.</div>
          )}
          {apertura?.ultimo && lunUltimo && lunUltimo !== lunediIso && (
            <button type="button" onClick={() => setLunediIso(lunUltimo)}
              style={{ ...btnNav(tapMin), marginTop: 12, padding: '0 16px', fontWeight: 700, color: T.brand, borderColor: T.brand }}>
              Vai a quella settimana
            </button>
          )}
        </div>
      ) : !euroKg ? (
        <div style={{
          padding: isMobile ? 16 : '20px 24px',
          background: T.amberLight, border: `1px solid ${T.amber}`,
          borderRadius: 14, marginBottom: 20, fontSize: font.size.base, color: T.amberDark, lineHeight: 1.5,
          display: 'flex', alignItems: isMobile ? 'stretch' : 'center',
          gap: 14, flexDirection: isMobile ? 'column' : 'row',
          width: '100%', boxSizing: 'border-box',
        }}>
          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="warning" size={18} color={T.amberDark} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Imposta i formati di vendita</div>
              <div style={{ fontSize: font.size.sm, color: T.amberDark }}>
                Servono per calcolare il €/kg medio e abilitare la quadratura con la cassa.
              </div>
            </div>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('formati-vendita')}
              aria-label="Vai a formati di vendita"
              style={{
                background: T.amberDark, color: T.bgCard, border: 'none',
                borderRadius: 10, padding: '10px 16px', fontSize: font.size.base, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                whiteSpace: 'nowrap', minHeight: tapMin,
                width: isMobile ? '100%' : 'auto',
              }}
            >
              <Icon name="euro" size={14} color={T.bgCard} /> Vai ai formati
            </button>
          )}
        </div>
      ) : (
        <>
          {/* La risposta: la differenza con la cassa (o perché non si può
              dire), il venduto, l'incasso stimato, la cassa; senza la cassa,
              quello che si può dire lo stesso. Prima: quattro tessere senza
              giudizio e tre riquadri colorati (grigio, blu, ambra). */}
          <div style={{ marginBottom: isMobile ? 32 : 40 }}>
            <Risposta kpi={kpi} kpiPrev={kpiPrev} euroKg={euroKg} vetrina={vetrinaSett}
              onCassa={onNavigate ? () => onNavigate('chiusura') : null} isMobile={isMobile} isTablet={isTablet} />
          </div>

          <div style={{ marginBottom: 20 }}>
            {/* Le celle che non tornano abbassano il totale qui sopra, perché
                entrano col loro segno. Sui dati reali del design partner sono
                604 su 7.012 (8,6%) per -2.650 kg: se la pagina non lo dice, il
                proprietario legge un numero più basso del vero e va a cercare
                un ammanco che non c'è. */}
            {(kpi.celleNonQuadrate > 0 || kpi.celleNonCalcolabili > 0) && (
              <div style={{
                marginTop: 14, padding: isMobile ? 12 : '12px 16px',
                background: T.amberLight, border: `1px solid ${T.amber}55`, borderRadius: 12,
                fontSize: typo.small.fontSize, color: T.amber, lineHeight: 1.55,
                display: 'flex', alignItems: 'flex-start', gap: 8,
                width: '100%', boxSizing: 'border-box',
              }}>
                <Icon name="alert" size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 3 }} />
                <span>
                  {/* La causa più frequente (95,6% delle caselle negative di
                      Mara a fine agosto): la rimanenza del giorno prima
                      lasciata a 0 nel giorno della produzione. Lì il totale
                      NON è più basso del vero — l'errore del giorno prima si
                      annulla col giorno dopo — e la casella da sistemare è
                      quella del giorno prima. Prima la pagina diceva il
                      contrario su tutte e due le cose. */}
                  {kpi.celleRimanenzaAZero > 0 && (
                    <>
                      <strong>
                        {kpi.celleRimanenzaAZero === 1
                          ? 'Una casella risulta negativa'
                          : `${n0(kpi.celleRimanenzaAZero)} caselle risultano negative`}
                      </strong>
                      {' '}perché il giorno prima la rimanenza è rimasta a 0 nel giorno in cui si era prodotto:
                      quel gelato era ancora in vetrina, non venduto.
                      {kpi.kgRimanenzaFuori < 0
                        ? ` Il totale della settimana è più basso del vero di ${nKg(Math.abs(kpi.kgRimanenzaFuori) * 1000)} kg, perché il giorno da sistemare è prima del lunedì.`
                        : ' Sui due giorni insieme il conto torna, quindi il totale della settimana è giusto; il giorno per giorno no.'}
                      {' '}Va scritta la rimanenza del giorno indicato.
                    </>
                  )}
                  {kpi.celleRimanenzaAZero > 0 && kpi.celleNonQuadrate - kpi.celleRimanenzaAZero > 0 && ' '}
                  {kpi.celleNonQuadrate - kpi.celleRimanenzaAZero > 0 && (
                    <>
                      <strong>
                        {kpi.celleNonQuadrate - kpi.celleRimanenzaAZero === 1
                          ? 'Una casella non torna'
                          : `${n0(kpi.celleNonQuadrate - kpi.celleRimanenzaAZero)} caselle non tornano`}
                      </strong>
                      {' '}questa settimana, per {nKg(Math.abs(kpi.kgNonQuadrati - kpi.kgRimanenzaAZero) * 1000)} kg:
                      la rimanenza scritta è più alta di quanto c&apos;era a disposizione.
                      Il totale qui sopra le conta col loro segno, quindi è più basso del vero.
                    </>
                  )}
                  {kpi.celleNonQuadrate > 0 && kpi.celleNonCalcolabili > 0 && ' '}
                  {kpi.celleNonCalcolabili > 0 && (
                    <>
                      {kpi.celleNonCalcolabili === 1
                        ? 'Una casella non ha il giorno prima'
                        : `${n0(kpi.celleNonCalcolabili)} caselle non hanno il giorno prima`}
                      {' '}(o è più vecchio di una settimana): per quelle il venduto non si può calcolare
                      e restano fuori dal totale.
                    </>
                  )}
                  {' '}Eccole qui sotto.
                </span>
              </div>
            )}

            {/* QUALI sono. Prima la pagina diceva solo quante, e per trovarle
                bisognava aprire l'inventario e cercarle a occhio fra quattordici
                colonne: con 604 celle vuol dire non trovarle mai.
                E "è giusta così" serve perché non tutte sono errori: un
                omaggio, una vaschetta rovesciata, un assaggio. Quelle restano
                nel totale — la merce è uscita davvero — ma escono dall'elenco
                delle cose da guardare, così l'elenco cala invece di restare
                rosso per sempre. */}
            {celleDaControllare.length > 0 && (
              <div ref={refCaselle} style={{
                marginTop: 10, border: `1px solid ${T.border}`, borderRadius: 12,
                overflow: 'hidden', width: '100%', boxSizing: 'border-box',
              }}>
                {celleDaControllare.slice(0, mostraTutteLeCelle ? 200 : 5).map((c) => {
                  const chiave = `${c.sedeId}|${c.gusto}|${c.data}`
                  const giorno = new Date(c.data + 'T12:00:00')
                  return (
                    <div key={chiave} style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      padding: isMobile ? '10px 12px' : '10px 14px',
                      borderTop: `1px solid ${T.borderSoft}`,
                      fontSize: typo.small.fontSize, color: C.text,
                    }}>
                      <span style={{ fontWeight: 700, flex: '1 1 150px', minWidth: 0 }}>
                        {c.gusto}
                        {isAllSedi && nomeSede(c.sedeId) && (
                          <span style={{ fontWeight: 400, color: C.textSoft }}> · {nomeSede(c.sedeId)}</span>
                        )}
                      </span>
                      <span style={{ color: C.textSoft, whiteSpace: 'nowrap' }}>
                        {giorno.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </span>
                      {c.causa === CAUSA_RIMANENZA_A_ZERO && c.giornoDaSistemare ? (
                        // Non è un ammanco da accettare: è una casella del
                        // giorno prima da compilare. «È giusta così» qui
                        // avrebbe fatto passare per omaggio un errore di
                        // compilazione.
                        <>
                          <span style={{ ...TNUM, color: T.amber, fontWeight: 700, whiteSpace: 'nowrap' }}
                            title={`${maiuscola(conGiorno('il', c.giornoDaSistemare))} la rimanenza è 0 ma si erano prodotti dei chili: il giorno dopo ne ricompaiono ${nKg(c.riman)} kg, e il venduto esce -${nKg(c.mancano)} kg`}>
                            rimanenza mancante il {new Date(c.giornoDaSistemare + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </span>
                          {onNavigate && (
                            <button type="button" onClick={() => onNavigate('inventario-gusti')}
                              style={{
                                padding: '6px 12px', minHeight: tapMin, borderRadius: 8,
                                border: `1px solid ${T.border}`, background: T.bgCard, color: C.textMid,
                                fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                              }}>
                              Apri l&apos;inventario
                            </button>
                          )}
                        </>
                      ) : (<>
                      <span style={{ ...TNUM, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap' }}
                        title={`Rimasti il giorno prima ${nKg(c.rimanPrec)} kg + prodotti ${nKg(c.prod)} kg, ma la rimanenza scritta è ${nKg(c.riman)} kg`}>
                        mancano {nKg(c.mancano)} kg
                      </span>
                      <button type="button" disabled={accettando === chiave}
                        onClick={() => accettaCella(c, 'verificata dal titolare')}
                        style={{
                          padding: '6px 12px', minHeight: tapMin, borderRadius: 8,
                          border: `1px solid ${T.border}`, background: T.bgCard, color: C.textMid,
                          fontSize: typo.small.fontSize, fontWeight: 700,
                          cursor: accettando === chiave ? 'default' : 'pointer',
                          opacity: accettando === chiave ? 0.6 : 1, whiteSpace: 'nowrap',
                        }}>
                        {accettando === chiave ? 'Salvo…' : 'È giusta così'}
                      </button>
                      </>)}
                    </div>
                  )
                })}
                {celleDaControllare.length > 5 && (
                  <button type="button" onClick={() => setMostraTutteLeCelle(v => !v)}
                    style={{
                      width: '100%', padding: '10px 14px', minHeight: 40,
                      border: 'none', borderTop: `1px solid ${T.borderSoft}`,
                      background: T.bgSubtle, color: C.textMid,
                      fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer',
                    }}>
                    {mostraTutteLeCelle
                      ? 'Mostra solo le prime 5'
                      : `Vedi tutte e ${celleDaControllare.length}`}
                  </button>
                )}
              </div>
            )}

            {kpi.driftPct != null && Math.abs(kpi.driftPct) >= 15 && (
              <DiagnosiDrift driftEur={kpi.driftEur} driftPct={kpi.driftPct} isMobile={isMobile} />
            )}
          </div>

          {/* Le ultime quattro settimane, su un asse solo (prima: una
              sparkline con due scale nascoste, chili e cassa). */}
          <UltimeSettimane settimane={trendData} lunediGuardato={lunediIso} isMobile={isMobile}
            stile={{ marginBottom: isMobile ? 16 : 24 }} />

          {/* La settimana sede per sede (solo «Tutte le sedi»): elenco a
              barre, come le classifiche. Prima una tabella con le colonne
              dell'ingrosso tutte a zero e l'atteso in bordeaux. */}
          {isAllSedi && perSede.length > 0 && (
            <SediSettimana perSede={perSede} isMobile={isMobile} stile={{ marginBottom: isMobile ? 16 : 24 }} />
          )}

          {/* I gusti che restano in vetrina: la produzione da rivedere. La
              classifica dei gusti più venduti non c'è più: è la domanda della
              pagina Produzione, e qui ripeteva i suoi numeri. */}
          <div style={{ marginBottom: isMobile ? 32 : 40 }}>
            <PanelSofferenza
              sofferenza={classifica.sofferenza}
              zeroVenduto={classifica.zeroVenduto}
            />
          </div>

          {/* Per il commercialista: in fondo, dove servono, non in testa
              alla pagina fra i comandi. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 40, fontSize: font.size.base, color: C.textSoft }}>
            <span>Per il commercialista:</span>
            <button
              onClick={() => esportaCsvSettimana({ lunediIso, kpi, dettaglio: dettaglioGusti, sedeAttiva, isAllSedi, perSede })}
              aria-label="Esporta settimana in CSV"
              title="Esporta la settimana in CSV per il commercialista o la contabilità"
              style={{ ...btnNav(tapMin), padding: '0 14px', fontWeight: 700, color: T.brand }}
            >
              <Icon name="download" size={14} />
              <span style={{ marginLeft: 6 }}>CSV</span>
            </button>
            <ExportPdfButton
              fileName={`quadratura-${lunediIso}.pdf`}
              label="Esporta PDF settimana"
              getReport={() => reportPdfSettimana({ lunediIso, kpi, dettaglio: dettaglioGusti, sedeAttiva, isAllSedi, perSede, euroKg })}
            />
          </div>
        </>
      )}
    </PaginaAnalisi>
  )
}

// ── Diagnosi drift ────────────────────────────────────────────────────────
// Si vede SOLO quando c'è una cassa vera da confrontare (driftPct non null):
// senza chiusure lo scostamento non esiste, e fino al 03/10/2026 questo
// riquadro compariva ogni settimana a chi non registra la cassa, suggerendo
// «furti interni» su un incasso che semplicemente non era stato scritto.
// Anche con la cassa, la prima cosa da guardare è l'inventario: sui dati veri
// le caselle compilate male sono la causa più frequente di un conto che non
// torna.
function DiagnosiDrift({ driftEur, driftPct, isMobile }) {
  const tono = driftEur < 0 ? 'più basso della stima' : 'più alto della stima'
  const ipotesi = driftEur < 0
    ? [
        'Giorni di cassa registrati a metà, o chiusure saltate',
        'Rimanenze scritte male nell\'inventario (una casella lasciata a zero fa sembrare venduto quello che è in vetrina)',
        'Porzioni più grandi di quelle dei formati (controlla la bilancia)',
        'Omaggi e assaggi non battuti in cassa',
        'Errori di scontrino: battiture saltate o sottostimate',
      ]
    : [
        'Cassa con incassi extra non legati al gelato (es. articoli non da gusto)',
        'Inventario sottostimato: residuo della mattina dopo letto basso o errore di pesata',
        'Scarti registrati ma in realtà venduti',
      ]
  return (
    <div style={{
      marginTop: 14, padding: isMobile ? 14 : '14px 16px',
      background: T.redLight, border: `1px solid ${T.red}`,
      borderRadius: 12, fontSize: font.size.sm, color: T.redDark, lineHeight: 1.55,
      width: '100%', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon name="warning" size={15} color={T.redDark} />
        <strong style={{ fontSize: font.size.base }}>
          Cosa controllare: incasso {tono} del {Math.abs(driftPct).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
        </strong>
      </div>
      <ul style={{ margin: 0, paddingLeft: 22 }}>
        {ipotesi.map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{it}</li>)}
      </ul>
    </div>
  )
}

// ── Panel Sofferenza / Zero venduto ───────────────────────────────────────
function PanelSofferenza({ sofferenza, zeroVenduto }) {
  return (
    <div style={panelStyle}>
      <div style={panelTitle}>Gusti in sofferenza</div>

      {zeroVenduto.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '10px 12px',
          background: T.redLight, borderRadius: 10,
          border: `1px solid ${T.red}`,
        }}>
          <div style={{
            fontSize: font.size.sm, fontWeight: 700, color: T.redDark,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="alert" size={12} color={T.redDark} />
            Zero venduto ({zeroVenduto.length.toLocaleString('it-IT', { useGrouping: 'always' })})
          </div>
          <div style={{
            fontSize: font.size.sm, color: T.redDark, lineHeight: 1.55,
          }}>
            {zeroVenduto.slice(0, 8).map(x => x.gusto).join(' · ')}
            {zeroVenduto.length > 8 ? ` · +${(zeroVenduto.length - 8).toLocaleString('it-IT', { useGrouping: 'always' })} altri` : ''}
          </div>
        </div>
      )}

      {sofferenza.length === 0 ? (
        <div style={{ fontSize: font.size.sm, color: C.textSoft, lineHeight: 1.5 }}>
          Nessun gusto resta in vetrina per {GIORNI_VETRINA_SOFFERENZA} giorni di vendita o più.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sofferenza.slice(0, 6).map(x => (
            <div key={x.gusto} style={{
              display: 'flex', alignItems: 'center', gap: 10, fontSize: font.size.sm,
              padding: '6px 0',
              borderBottom: `1px dashed ${C.borderSoft}`,
            }}>
              <span style={{
                flex: 1, fontWeight: 600, color: C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                minWidth: 0,
              }} title={x.gusto}>
                {x.gusto}
              </span>
              <span style={{
                color: C.textSoft, ...TNUM, whiteSpace: 'nowrap',
                fontSize: font.size.sm,
              }}>
                in vetrina {nKg(x.residuoMedioG)} kg, vende {nKg(x.vendutoMedioG)} kg al giorno
              </span>
              <span style={{
                color: T.amberDark, fontWeight: 700, ...TNUM,
                minWidth: 52, textAlign: 'right', whiteSpace: 'nowrap',
                background: T.amberLight, padding: '2px 8px', borderRadius: 999,
                fontSize: font.size.sm,
              }}>
                {x.giorniVetrina.toLocaleString('it-IT', { maximumFractionDigits: 1 })} giorni
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{
        fontSize: font.size.sm, color: C.textSoft, marginTop: 12, lineHeight: 1.4,
        paddingTop: 10, borderTop: `1px solid ${C.borderSoft}`,
      }}>
        In sofferenza: quello che resta in vetrina basta per {GIORNI_VETRINA_SOFFERENZA} giorni di vendita o più
        (rimanenza media divisa per il venduto medio di un giorno).
      </div>
    </div>
  )
}

// ── Stili condivisi ───────────────────────────────────────────────────────
const btnNav = (minSize = 40) => ({
  minHeight: minSize, minWidth: minSize,
  background: 'transparent',
  border: `1px solid ${C.border}`, borderRadius: 10,
  cursor: 'pointer',
  fontSize: font.size.md, color: C.textMid,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'background 120ms ease, border-color 120ms ease',
  boxSizing: 'border-box',
})
const panelStyle = {
  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16,
  padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 6px 18px rgba(15,23,42,0.04)',
  width: '100%', boxSizing: 'border-box',
}
const panelTitle = {
  fontSize: font.size.sm, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', color: C.textSoft, marginBottom: 14,
}
