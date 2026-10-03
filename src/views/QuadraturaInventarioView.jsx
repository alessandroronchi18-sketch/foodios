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

import React, { useEffect, useMemo, useState } from 'react'
import { color as T, typo, ui3, ui, font } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { sload } from '../lib/storage'
import { aggiungiGiorni, todayLocal } from '../lib/dateLocal'
import { supabase } from '../lib/supabase'
import { SK_FORMATI } from '../lib/storageKeys'
import Icon from '../components/Icon'
import { conGiorno, giorniRegistrati } from '../lib/produzioneAnalisi'
import ExportPdfButton from '../components/ExportPdfButton'
import { C, PageHeader, TNUM, fmt0, TabellaOSchede } from './_shared'
import {
  caricaSettimana, calcolaVendutoSettimana, lunediDellaSettimana,
  euroKgMedioFormati, kpiQuadraturaSettimana, classificaGusti, variazione,
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

// Drift signed con € DOPO la cifra (es. "+ 1.234 €")
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
    ultimoGiornoRegistrato(orgId, sediDaLeggere.map(s => s.id), { finoA: todayLocal() })
      .catch(() => null)
      .then((ultimo) => {
        if (!alive) return
        const lunOggi = lunediDellaSettimana()
        if (ultimo && ultimo < lunOggi) {
          setLunediIso(lunediDellaSettimana(`${ultimo}T12:00:00`))
          setApertura({ ultimo, spostata: true })
        } else {
          setApertura({ ultimo: ultimo || null, spostata: false })
        }
      })
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

  const settimanaPrec = () => setLunediIso(addDays(lunediIso, -7))
  const settimanaSucc = () => setLunediIso(addDays(lunediIso, 7))
  const oggi = () => setLunediIso(lunediDellaSettimana())
  const lunUltimo = apertura?.ultimo ? lunediDellaSettimana(`${apertura.ultimo}T12:00:00`) : null
  const inCaricamento = loading || (sediDaLeggere.length > 0 && settimanaCaricata !== lunediIso)

  // ── Render ─────────────────────────────────────────────────────────────

  if (!orgId) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Caricamento…</div>
  }
  // Quando isAllSedi e' attivo non serve sedeId: il drill-down per sede e'
  // già gestito dal blocco perSede.
  if (!sedeId && !isAllSedi) {
    return <div style={{ padding: 40, textAlign: 'center', color: C.textSoft }}>Seleziona una sede</div>
  }

  // Tone del drift: |drift%| < 5% verde, < 15% giallo, oltre rosso.
  const driftTone = (p) => {
    if (p == null) return { bg: C.bgSubtle, border: C.border, fg: C.textMid, accent: C.textSoft, label: 'n/d' }
    const a = Math.abs(p)
    if (a < 5) return { bg: T.greenLight, border: T.greenLight, fg: T.green, accent: T.green, label: 'in target' }
    if (a < 15) return { bg: T.amberLight, border: T.amber, fg: T.amberDark, accent: T.amber, label: 'da osservare' }
    return { bg: T.redLight, border: T.red, fg: T.redDark, accent: T.red, label: 'attenzione' }
  }
  const tone = driftTone(kpi.driftPct)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <PageHeader subtitle="Quadratura settimanale: l'inventario dice quanto gelato è uscito, la cassa quanto è entrato. Se i due conti non tornano, qui si vede di quanto e dove guardare." />

      {/* ─ Toolbar settimana ─ Su mobile: layout a colonna piena per evitare accavallamenti */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, marginBottom: 20,
        background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: isMobile ? 12 : '14px 16px',
        flexDirection: isMobile ? 'column' : 'row',
        flexWrap: 'wrap', width: '100%', boxSizing: 'border-box',
        boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
      }}>
        {/* Etichetta settimana - sempre in alto, centrale */}
        <div style={{
          flex: isMobile ? 'none' : 1,
          width: isMobile ? '100%' : 'auto',
          textAlign: isMobile ? 'center' : 'left',
          minWidth: 0,
        }}>
          <div style={{
            fontSize: font.size.sm, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: C.textSoft, marginBottom: 2,
          }}>Settimana</div>
          <div style={{
            fontSize: isMobile ? 15 : 16, fontWeight: 700, color: C.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.01em',
          }}>{fmtRange(lunediIso)}</div>
        </div>

        {/* Navigatore prec / oggi / succ */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          width: isMobile ? '100%' : 'auto',
        }}>
          <button
            onClick={settimanaPrec}
            aria-label="Settimana precedente"
            title="Settimana precedente"
            style={{ ...btnNav(tapMin), flex: isMobile ? 1 : 'none', padding: '0 14px' }}
          >
            <Icon name="chevR" size={16} style={{ transform: 'rotate(180deg)' }} />
            {!isMobile && <span style={{ marginLeft: 6 }}>Prec.</span>}
          </button>
          <button
            onClick={oggi}
            aria-label="Settimana corrente"
            style={{
              ...btnNav(tapMin),
              flex: isMobile ? 1 : 'none',
              padding: '0 16px',
              fontWeight: 600,
            }}
          >
            Oggi
          </button>
          <button
            onClick={settimanaSucc}
            aria-label="Settimana successiva"
            title="Settimana successiva"
            style={{ ...btnNav(tapMin), flex: isMobile ? 1 : 'none', padding: '0 14px' }}
          >
            {!isMobile && <span style={{ marginRight: 6 }}>Succ.</span>}
            <Icon name="chevR" size={16} />
          </button>
        </div>

        {/* Export - su mobile va a riga piena */}
        <div style={{
          display: 'flex', gap: 8,
          width: isMobile ? '100%' : 'auto',
          marginLeft: isMobile ? 0 : 'auto',
        }}>
          <button
            onClick={() => esportaCsvSettimana({ lunediIso, kpi, dettaglio: dettaglioGusti, sedeAttiva, isAllSedi, perSede })}
            disabled={giorniSettimana.n === 0}
            aria-label="Esporta settimana in CSV"
            title="Esporta la settimana in CSV per il commercialista o la contabilità"
            style={{
              ...btnNav(tapMin),
              background: C.text, color: C.white, borderColor: C.text,
              fontWeight: 600,
              flex: isMobile ? 1 : 'none',
              padding: '0 14px',
            }}
          >
            <Icon name="download" size={14} color={C.white} />
            <span style={{ marginLeft: 6 }}>CSV</span>
          </button>
          <ExportPdfButton
            fileName={`quadratura-${lunediIso}.pdf`}
            compact
            label="Esporta PDF settimana"
            getReport={() => reportPdfSettimana({ lunediIso, kpi, dettaglio: dettaglioGusti, sedeAttiva, isAllSedi, perSede, euroKg })}
          />
        </div>
      </div>

      {/* La settimana mostrata è quella dell'ultimo giorno registrato, non
          quella di oggi: si dice, così non si cerca la settimana corrente. */}
      {!inCaricamento && apertura?.spostata && lunediIso === lunUltimo && (
        <div data-apertura style={{
          marginBottom: 14, fontSize: font.size.sm, color: C.textMid, lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Icon name="calendar" size={14} color={C.textSoft} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Dopo {conGiorno('il', apertura.ultimo, { lunga: true })} non c&apos;è niente di registrato:
            ti mostro l&apos;ultima settimana con i dati.
          </span>
        </div>
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
          {/* ─ KPI hero quadratura ─ */}
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18,
            padding: isMobile ? 16 : 24, marginBottom: 20,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 30px rgba(15,23,42,0.05)',
            width: '100%', boxSizing: 'border-box',
          }}>
            <div style={{
              display: 'grid', gap: isMobile ? 10 : 14,
              gridTemplateColumns: isMobile ? '1fr' : (isTablet ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'),
            }}>
              <Tile
                icon="package"
                label={kpi.b2bKg > 0 ? 'Venduto retail' : 'Venduto inventario'}
                value={`${nKg((kpi.retailKg ?? kpi.totVendutoKg) * 1000)} kg`}
                sub={kpi.b2bKg > 0 ? `${nKg(kpi.totVendutoG)} kg totali` : 'da inventario'}
                tendVal={variazione(kpi.retailKg ?? kpi.totVendutoKg, kpiPrev.retailKg ?? kpiPrev.totVendutoKg)}
              />
              {/* Senza chiusure la cassa è «non registrata», non zero euro:
                  prima la tessera diceva «0 €» e quella accanto «-100%». */}
              <Tile
                icon="card"
                label="Cassa"
                value={kpi.cassaRegistrata ? fmt0(kpi.cassaEffettiva) : 'non registrata'}
                sub={kpi.cassaRegistrata
                  ? (kpi.giorniCassa > 0 ? `incassato in ${kpi.giorniCassa} ${kpi.giorniCassa === 1 ? 'giorno' : 'giorni'}` : 'incassato in cassa')
                  : 'nessuna chiusura questa settimana'}
                tendVal={kpi.cassaRegistrata && kpiPrev.cassaRegistrata ? variazione(kpi.cassaEffettiva, kpiPrev.cassaEffettiva) : null}
                muted={!kpi.cassaRegistrata}
              />
              <Tile
                icon="barChart"
                label="Incasso stimato"
                value={fmt0(kpi.ricavoAtteso || 0)}
                sub={`stimato: kg × ${n0(euroKg)} €/kg medio`}
                muted
              />
              {kpi.driftEur != null ? (
                <Tile
                  icon="checkCircle"
                  label="Differenza con la cassa"
                  value={fmtDriftEur(kpi.driftEur)}
                  sub={kpi.giorniConfrontati < kpi.giorniInventario
                    ? `${pct(kpi.driftPct)} su ${kpi.giorniConfrontati} ${kpi.giorniConfrontati === 1 ? 'giorno' : 'giorni'} con cassa`
                    : `${pct(kpi.driftPct)} dell'incasso stimato`}
                  color={tone.fg}
                  bg={tone.bg}
                  borderColor={tone.border}
                  accent={tone.accent}
                  badge={tone.label}
                />
              ) : (
                <Tile
                  icon="info"
                  label="Differenza con la cassa"
                  value="non si può dire"
                  sub={kpi.motivoConfronto || 'manca la cassa'}
                  muted
                />
              )}
            </div>

            {/* Quello che la pagina NON può fare, detto in chiaro, con quello
                che serve per farlo. È il caso del design partner: zero
                chiusure registrate. */}
            {!kpi.cassaRegistrata && kpi.totVendutoG !== 0 && (
              <div data-senza-cassa style={{
                marginTop: 14, padding: isMobile ? 12 : '12px 16px',
                background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 12,
                fontSize: font.size.sm, color: C.textMid, lineHeight: 1.55,
                display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: 12,
                flexDirection: isMobile ? 'column' : 'row',
                width: '100%', boxSizing: 'border-box',
              }}>
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: '1 1 320px', minWidth: 0 }}>
                  <Icon name="info" size={15} color={C.textSoft} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong style={{ color: C.text }}>Senza la cassa il confronto non si può fare.</strong>{' '}
                    L&apos;inventario dice che sono usciti {nKg(kpi.totVendutoG)} kg di gelato, circa {fmt0(kpi.ricavoAtteso || 0)} ai
                    prezzi dei formati. Per sapere se il conto torna serve l&apos;incasso vero di ogni giorno:
                    basta il totale della chiusura, in Cassa.
                  </span>
                </span>
                {onNavigate && (
                  <button type="button" onClick={() => onNavigate('chiusura')}
                    style={{
                      ...btnNav(tapMin), padding: '0 16px', fontWeight: 700, color: T.brand,
                      borderColor: T.brand, whiteSpace: 'nowrap', width: isMobile ? '100%' : 'auto',
                    }}>
                    Vai alla Cassa
                  </button>
                )}
              </div>
            )}
            {kpi.cassaRegistrata && kpi.driftEur != null && kpi.giorniConfrontati < kpi.giorniInventario && (
              <div style={{
                marginTop: 14, padding: isMobile ? 12 : '12px 16px',
                background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: 12,
                fontSize: font.size.sm, color: C.textMid, lineHeight: 1.55,
                width: '100%', boxSizing: 'border-box',
              }}>
                La cassa c&apos;è per {kpi.giorniConfrontati} {kpi.giorniConfrontati === 1 ? 'giorno' : 'giorni'} su {kpi.giorniInventario} con
                l&apos;inventario: il confronto è fatto solo su quelli ({fmt0(kpi.cassaConfrontata)} incassati contro {fmt0(kpi.attesoConfrontato)} stimati).
              </div>
            )}

            {kpi.b2bKg > 0 && (
              <div style={{
                marginTop: 14, padding: isMobile ? 12 : '12px 16px',
                background: T.blueLight, border: `1px solid ${T.blue}`, borderRadius: 12,
                fontSize: font.size.sm, color: T.blue,
                display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between', gap: 12,
                flexDirection: isMobile ? 'column' : 'row',
                width: '100%', boxSizing: 'border-box',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <Icon name="receipt" size={14} color={T.blue} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    <strong>Vendite B2B</strong> separate dalla cassa retail:
                    {' '}{nKg(kpi.b2bKg * 1000)} kg fatturati per {fmt0(kpi.ricaviB2b)}
                  </span>
                </span>
                <span style={{ fontSize: font.size.sm, color: T.blue, whiteSpace: 'nowrap' }}>
                  sottratti dal retail per non gonfiare il drift
                </span>
              </div>
            )}

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
              <div style={{
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
                          padding: '6px 12px', minHeight: 36, borderRadius: 8,
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

          {/* ─ Sparkline trend 4 settimane ─ */}
          {trendData.length > 0 && (
            <div style={{ ...panelStyle, marginBottom: 16, padding: isMobile ? 16 : 18 }}>
              <div style={panelTitle}>Trend ultime 4 settimane</div>
              <SparklineTrend data={trendData} />
            </div>
          )}

          {/* ─ Drill-down per sede (solo se isAllSedi) ─ */}
          {isAllSedi && perSede.length > 0 && (
            <div style={{ ...panelStyle, marginBottom: 16, padding: isMobile ? 16 : 18 }}>
              <div style={panelTitle}>Dettaglio per sede</div>
              <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <TabellaOSchede

          minWidth={600}
          righe={perSede}
          chiave={({ sede }) => sede.id}
          vuoto="Nessuna sede."
          titolo={({ sede }) => `${sede.nome}${sede.is_default ? ' ★' : ''}`}
          colonne={[
            { k: 'retail', label: 'Retail', forte: true, cella: ({ kpi: k }) => `${nKg((k.retailKg ?? k.totVendutoKg) * 1000)} kg` },
            { k: 'b2b', label: 'Ingrosso', cella: ({ kpi: k }) => `${nKg((k.b2bKg || 0) * 1000)} kg` },
            { k: 'att', label: 'Ricavo atteso', forte: true, colore: T.brand, cella: ({ kpi: k }) => fmt0(k.ricavoAtteso || 0) },
            { k: 'b2bric', label: 'Ricavi ingrosso', cella: ({ kpi: k }) => fmt0(k.ricaviB2b || 0) },
          ]}
          intestazione={<><thead>
                    <tr style={{ background: T.bgSubtle }}>
                      <th style={{ ...tdHeadSede, position: 'sticky', left: 0, background: T.bgSubtle, zIndex: 1 }}>Sede</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Retail kg</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>B2B kg</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Atteso</th>
                      <th style={{ ...tdHeadSede, textAlign: 'right' }}>Ricavi B2B</th>
                    </tr>
                  </thead></>}
          corpo={<><tbody>
                    {perSede.map(({ sede, kpi: k }) => (
                      <tr key={sede.id} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                        <td style={{
                          ...tdCellSede, position: 'sticky', left: 0,
                          background: C.bgCard, zIndex: 1,
                          fontWeight: 600,
                          maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }} title={sede.nome}>
                          {sede.nome}{sede.is_default ? ' ★' : ''}
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, whiteSpace: 'nowrap' }}>
                          {nKg((k.retailKg ?? k.totVendutoKg) * 1000)} kg
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: C.textSoft, whiteSpace: 'nowrap' }}>
                          {nKg((k.b2bKg || 0) * 1000)} kg
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: T.brand, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {fmt0(k.ricavoAtteso || 0)}
                        </td>
                        <td style={{ ...tdCellSede, textAlign: 'right', ...TNUM, color: T.blue, whiteSpace: 'nowrap' }}>
                          {fmt0(k.ricaviB2b || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody></>}
        />
              </div>
            </div>
          )}

          {/* ─ Top + Sofferenza ─ */}
          <div style={{
            display: 'grid', gap: 16,
            gridTemplateColumns: isMobile ? '1fr' : (isTablet ? '1fr' : '1.2fr 1fr'),
            marginBottom: 20,
          }}>
            <PanelTop
              title="Top gusti per kg venduti"
              items={classifica.top}
              total={kpi.totVendutoG}
              isMobile={isMobile}
            />
            <PanelSofferenza
              sofferenza={classifica.sofferenza}
              zeroVenduto={classifica.zeroVenduto}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ── Sparkline trend 4 settimane (SVG inline) ───────────────────────────────
// Mini grafico con 2 serie normalizzate: kg venduti (linea verde) e
// cassa retail (linea brand tratteggiata). Asse Y separato per asse.
function SparklineTrend({ data }) {
  const W = 600, H = 110, PAD_X = 30, PAD_Y = 22
  if (!data || data.length === 0) return null
  const maxKg = Math.max(1, ...data.map(d => d.kg))
  // Una settimana senza chiusure ha la cassa «non registrata» (null): non è
  // un punto a zero. Prima la linea della cassa di chi non la registra era
  // una retta piatta sul fondo, che si leggeva «non ha incassato niente».
  const conCassa = data.filter(d => d.cassa != null)
  const maxEur = Math.max(1, ...conCassa.map(d => d.cassa))
  const xStep = (W - PAD_X * 2) / Math.max(1, data.length - 1)
  const yScale = (val, max) => H - PAD_Y - (val / max) * (H - PAD_Y * 2)

  const pathKg = data.map((d, i) => {
    const x = PAD_X + i * xStep
    const y = yScale(d.kg, maxKg)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  let primoPunto = true
  const pathEur = data.map((d, i) => {
    if (d.cassa == null) { primoPunto = true; return '' }
    const x = PAD_X + i * xStep
    const y = yScale(d.cassa, maxEur)
    const comando = primoPunto ? 'M' : 'L'
    primoPunto = false
    return `${comando}${x.toFixed(1)},${y.toFixed(1)}`
  }).filter(Boolean).join(' ')
  const fmtLabel = (iso) => {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 150, display: 'block' }} aria-label="Trend ultime 4 settimane">
        {/* Gridline orizzontale di base */}
        <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke={T.border} strokeWidth="1" />
        {/* Cassa (linea brand tratteggiata) */}
        {pathEur && <path d={pathEur} fill="none" stroke={T.brand} strokeWidth="2" strokeDasharray="4 3" />}
        {/* Kg venduti (linea verde) */}
        <path d={pathKg} fill="none" stroke={T.green} strokeWidth="2" />
        {data.map((d, i) => {
          const x = PAD_X + i * xStep
          // Settimana con caselle che non tornano: anello ambra intorno al
          // punto. Senza questo, una settimana compilata male sembra una
          // settimana con meno vendite, ed è la lettura sbagliata.
          return (
            <g key={i}>
              {d.nonQuadrate > 0 && (
                <circle cx={x} cy={yScale(d.kg, maxKg)} r="6.5" fill="none" stroke={T.amber} strokeWidth="1.5" />
              )}
              <circle cx={x} cy={yScale(d.kg, maxKg)} r="3.5" fill={T.green} stroke={T.bgCard} strokeWidth="1.5" />
              {d.cassa != null && (
                <circle cx={x} cy={yScale(d.cassa, maxEur)} r="3.5" fill={T.brand} stroke={T.bgCard} strokeWidth="1.5" />
              )}
            </g>
          )
        })}
      </svg>
      {/* Le date stavano dentro l'SVG con fontSize 10 su un viewBox da 600:
          su desktop si ingrandivano col disegno, ma su telefono lo stesso
          disegno sta in 340px e quelle scritte diventavano 5-6px, illeggibili.
          Fuori dall'SVG restano 12px su qualsiasi schermo. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: `0 ${(PAD_X / W * 100).toFixed(1)}%`, marginTop: 2,
        fontSize: typo.small.fontSize, color: C.textSoft, ...TNUM,
      }}>
        {data.map((d, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {fmtLabel(d.lunIso)}
            {d.nonQuadrate > 0 && (
              <span title={`${d.nonQuadrate} caselle non tornano in questa settimana`}
                style={{ color: T.amber, fontWeight: 700, cursor: 'help' }}>!</span>
            )}
          </span>
        ))}
      </div>
      <div style={{
        display: 'flex', gap: 18, fontSize: typo.small.fontSize, color: C.textSoft,
        marginTop: 8, flexWrap: 'wrap',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 2, background: T.green, borderRadius: 1 }} />
          kg venduti (inventario)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block', width: 14, height: 0,
            borderTop: `2px dashed ${conCassa.length > 0 ? T.brand : T.border}`,
          }} />
          {conCassa.length > 0 ? 'cassa' : 'cassa non registrata'}
        </span>
        {data.some(d => d.nonQuadrate > 0) && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10,
              borderRadius: '50%', border: `1.5px solid ${T.amber}`,
            }} />
            settimana con caselle da controllare
          </span>
        )}
      </div>
    </div>
  )
}

// ── Stili tabella drill-down per sede ─────────────────────────────────────
const tdHeadSede = {
  padding: '10px 14px', textAlign: 'left',
  fontSize: font.size.sm, fontWeight: 700, color: C.textSoft,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
}
const tdCellSede = { padding: '10px 14px', fontSize: font.size.base, color: C.text }

// ── Tile KPI ──────────────────────────────────────────────────────────────
// Audit 2026-06-24: minHeight uniformi sui sub-elementi così tile affiancate
// hanno label/value/sub/badge allineati anche con contenuti di lunghezza
// diversa (es. una label su 1 vs 2 righe).
function Tile({ icon, label, value, sub, tendVal, muted, color, bg, borderColor, accent, badge }) {
  const fgValue = color || (muted ? C.textMid : C.text)
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '16px 16px 14px',
      background: bg || C.bgSubtle,
      borderRadius: 14,
      border: `1px solid ${borderColor || C.border}`,
      display: 'flex', flexDirection: 'column',
      minHeight: 132,
      width: '100%', boxSizing: 'border-box',
    }}>
      {/* Header: chip icona + label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10, minHeight: 32,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 9,
          background: accent ? `${accent}22` : 'rgba(110,14,26,0.10)',
          color: accent || C.red,
          flexShrink: 0,
        }}>
          <Icon name={icon} size={15} color={accent || C.red} />
        </span>
        <div style={{
          fontSize: font.size.sm, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: C.textSoft, lineHeight: 1.25,
          minHeight: 28,
          display: 'flex', alignItems: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={label}>
          {label}
        </div>
      </div>

      {/* Value: arrotondato all'unità, tabular nums, € DOPO la cifra */}
      <div style={{
        fontSize: font.size["3xl"], fontWeight: 800, color: fgValue,
        letterSpacing: '-0.025em', lineHeight: 1.1,
        minHeight: 32,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        ...TNUM,
      }}>
        {value}
      </div>

      {/* Sub: minHeight uniforme così le tile restano allineate */}
      <div style={{
        fontSize: font.size.sm, color: muted ? C.textSoft : C.textMid,
        marginTop: 6, lineHeight: 1.35,
        minHeight: 28,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={sub || ''}>
        {sub || (tendVal != null ? '' : ' ')}
        {tendVal != null && !sub && (
          <span style={{ color: tendVal >= 0 ? T.green : T.redDark, fontWeight: 600 }}>
            vs sett. prec.: {tendVal > 0 ? '+' : ''}{tendVal.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>

      {/* Footer: badge tono + variazione (riga separata sempre presente) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginTop: 8, minHeight: 22,
        flexWrap: 'wrap',
      }}>
        {badge && (
          <span style={{
            fontSize: font.size.sm, fontWeight: 700,
            color: accent || C.textMid,
            background: accent ? `${accent}1F` : 'rgba(15,23,42,0.05)',
            padding: '3px 8px', borderRadius: 999,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}>{badge}</span>
        )}
        {tendVal != null && sub && (
          <span style={{
            fontSize: font.size.sm, fontWeight: 600,
            color: tendVal >= 0 ? T.green : T.redDark,
            whiteSpace: 'nowrap',
          }}>
            vs prec. {tendVal > 0 ? '+' : ''}{tendVal.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>
    </div>
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

// ── Panel Top gusti ───────────────────────────────────────────────────────
function PanelTop({ title, items, total, isMobile }) {
  if (!items || items.length === 0) {
    return (
      <div style={panelStyle}>
        <div style={panelTitle}>{title}</div>
        <div style={{ fontSize: font.size.base, color: C.textSoft, padding: '12px 0' }}>
          Nessun venduto registrato per questa settimana.
        </div>
      </div>
    )
  }
  return (
    <div style={panelStyle}>
      <div style={panelTitle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const pctVal = total > 0 ? (it.vendutoG / total * 100) : 0
          return (
            <div key={it.gusto} style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
              width: '100%',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: i === 0 ? T.amberLight : C.bgSubtle,
                color: i === 0 ? T.amberDark : C.textSoft,
                fontSize: font.size.sm, fontWeight: 800, textAlign: 'center',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {i + 1}
              </span>
              <span style={{
                flex: isMobile ? '0 0 88px' : '0 0 140px',
                fontSize: font.size.base, fontWeight: 600, color: C.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={it.gusto}>
                {it.gusto}
              </span>
              <div style={{
                flex: 1, height: 8, background: T.border,
                borderRadius: 4, overflow: 'hidden', minWidth: 30,
              }}>
                <div style={{
                  width: `${Math.max(4, pctVal)}%`, height: '100%',
                  background: i === 0 ? T.brand : T.brandDark,
                  borderRadius: 4,
                  transition: 'width 240ms ease',
                }} />
              </div>
              <span style={{
                flex: '0 0 64px', fontSize: font.size.sm, fontWeight: 700,
                textAlign: 'right', ...TNUM, color: C.text,
                whiteSpace: 'nowrap',
              }}>
                {nKg(it.vendutoG)} kg
              </span>
              <span style={{
                flex: '0 0 38px', fontSize: font.size.sm, color: C.textSoft,
                textAlign: 'right', ...TNUM, whiteSpace: 'nowrap',
              }}>
                {pctVal.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })}%
              </span>
            </div>
          )
        })}
      </div>
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
