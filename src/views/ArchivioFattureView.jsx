// ── Archivio fatture: tutte, pagate e da pagare ─────────────────────────
//
// 05/10/2026, il titolare: «mi manca una pagina in Fornitori dove vedo tutte
// le fatture insieme, tutte, pagate e non pagate». Lo Scadenzario carica
// quello che c'è da pagare; qui c'è lo storico intero, con la ricerca, i
// filtri e i totali di quello che si vede. I conti stanno in
// `lib/archivioFatture.js`, dove si provano senza schermo.
import React, { useEffect, useMemo, useState } from 'react'
import { color as T, font, space, radius } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import BarraPeriodo from '../components/BarraPeriodo'
import { IntestazioneAnalisi, Riquadro, TabellaAnalisi, testo } from '../components/analisi'
import PaginaAnalisi from '../components/analisi/PaginaAnalisi'
import { euro } from '../lib/formatoAnalisi'
import { finestraScorciatoia } from '../lib/periodoAnalisi'
import { CATEGORIE_SPESA } from '../lib/contoEconomico'
import { leggiCategorieFornitori } from '../lib/contoEconomicoArchivio'
import {
  leggiArchivioFatture, conLaVoce, filtraFatture, ordinaPerData, totaliFatture, paginaFatture,
  csvFatture, sedeScritta, nomeDellaVoce, ePagata, SENZA_SEDE, SENZA_VOCE, RIGHE_PER_VOLTA,
} from '../lib/archivioFatture'

const dataIt = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })

const STATI = [
  { id: 'tutte', label: 'Tutte' },
  { id: 'pagate', label: 'Pagate' },
  { id: 'da-pagare', label: 'Da pagare' },
]

const campo = (isMobile) => ({
  ...testo(font.size.base), minHeight: 44, boxSizing: 'border-box', padding: `0 ${space[3]}px`,
  border: `1px solid ${T.borderStr}`, borderRadius: radius.md, background: T.bgCard, color: T.text,
  width: isMobile ? '100%' : 'auto', minWidth: 0, fontFamily: 'inherit',
})

function scaricaCsv(testoCsv, nome) {
  const url = URL.createObjectURL(new Blob([testoCsv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Tessera({ etichetta, valore, sotto }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...testo(font.size.sm), color: T.textSoft, minHeight: 20 }}>{etichetta}</div>
      <div style={{ ...testo(font.size.xl), fontWeight: 700, color: T.text, minHeight: 28, fontVariantNumeric: 'tabular-nums' }}>{valore}</div>
      <div style={{ ...testo(font.size.sm), color: T.textSoft, minHeight: 20 }}>{sotto}</div>
    </div>
  )
}

export default function ArchivioFattureView({ orgId, sedi = [], sedeId = null, client = supabase }) {
  const isMobile = useIsMobile()
  const [periodo, setPeriodo] = useState(() => {
    const f = finestraScorciatoia('annoCorr')
    return { from: f.from, to: f.to }
  })
  const [dati, setDati] = useState(null)
  const [errore, setErrore] = useState(null)
  const [caricando, setCaricando] = useState(false)
  const [cerca, setCerca] = useState('')
  const [stato, setStato] = useState('tutte')
  const [sede, setSede] = useState(sedeId || '')
  const [voce, setVoce] = useState('')
  const [volte, setVolte] = useState(1)
  const [aperte, setAperte] = useState(() => new Set())

  useEffect(() => { setSede(sedeId || '') }, [sedeId])

  useEffect(() => {
    if (!orgId) return undefined
    let vivo = true
    setCaricando(true); setErrore(null)
    ;(async () => {
      try {
        const [lette, forn] = await Promise.all([
          leggiArchivioFatture(client, orgId, { dal: periodo.from || null, al: periodo.to || null }),
          leggiCategorieFornitori(client, orgId),
        ])
        if (vivo) setDati({ fatture: conLaVoce(lette.fatture, forn.categoriePerFornitore) })
      } catch (e) {
        if (vivo) setErrore(e.message || 'lettura non riuscita')
      } finally {
        if (vivo) setCaricando(false)
      }
    })()
    return () => { vivo = false }
  }, [orgId, periodo.from, periodo.to, client])

  // Quando cambia un filtro si riparte dalle prime 50.
  useEffect(() => { setVolte(1) }, [cerca, stato, sede, voce, periodo.from, periodo.to])

  const visibili = useMemo(
    () => ordinaPerData(filtraFatture(dati?.fatture || [], { cerca, stato, sede, voce })),
    [dati, cerca, stato, sede, voce],
  )
  const tot = useMemo(() => totaliFatture(visibili), [visibili])
  const { righe: mostrate, altre } = paginaFatture(visibili, volte)
  const apri = (k) => setAperte(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const colonne = [
    { chiave: 'fornitore', titolo: 'Fornitore' },
    { chiave: 'data', titolo: 'Data', larghezza: isMobile ? 88 : 96 },
    { chiave: 'numero', titolo: 'Numero', larghezza: 96, soloComputer: true },
    { chiave: 'sede', titolo: 'Sede', larghezza: 136, soloComputer: true },
    { chiave: 'voce', titolo: 'Voce', larghezza: 136, soloComputer: true },
    { chiave: 'stato', titolo: 'Stato', larghezza: isMobile ? 80 : 128 },
    { chiave: 'totale', titolo: 'Totale', tipo: 'euro', decimali: 2, larghezza: isMobile ? 88 : 104 },
  ]
  const righe = mostrate.map(f => {
    const pagata = ePagata(f)
    const nota = String(f.note ?? '').trim()
    const chiave = String(f.id)
    return {
      chiave,
      celle: {
        fornitore: f.fornitore || 'senza nome',
        data: dataIt(f.data_fattura),
        numero: f.numero_rif || '',
        sede: sedeScritta(f, sedi) || 'senza sede',
        voce: nomeDellaVoce(f.voce) || 'da classificare',
        stato: pagata
          ? <span>pagata{f.data_pagamento && !isMobile ? ` il ${dataIt(f.data_pagamento).slice(0, 5)}` : ''}</span>
          : <span style={{ color: T.amberDark, fontWeight: 600 }}>da pagare{f.data_scadenza && !isMobile ? ` · ${dataIt(f.data_scadenza).slice(0, 5)}` : ''}</span>,
        totale: f.totale == null || f.totale === '' ? null : Number(f.totale),
      },
      // La nota si apre con un tocco sul fornitore: il chevron la annuncia.
      ...(nota ? {
        onClick: () => apri(chiave), aperta: aperte.has(chiave),
        sotto: <div style={{ ...testo(font.size.sm), color: T.textMid, padding: `${space[1]}px ${space[4]}px ${space[2]}px`, overflowWrap: 'anywhere' }}>{nota}</div>,
      } : {}),
    }
  })

  const periodoVuoto = !caricando && dati && (dati.fatture || []).length === 0
  const nessunaCorrispondenza = dati && !periodoVuoto && visibili.length === 0

  return (
    <PaginaAnalisi isMobile={isMobile} attenuata={caricando && !!dati}>
      <IntestazioneAnalisi isMobile={isMobile}
        domanda="Tutte le fatture dei fornitori"
        sotto="Pagate e da pagare, per data della fattura."
        destra={<BarraPeriodo from={periodo.from} to={periodo.to} isMobile={isMobile} mostraConfronto={false}
          onPeriodo={(f, t) => setPeriodo({ from: f || '', to: t || '' })} />} />

      {errore && <Riquadro isMobile={isMobile}><span style={{ color: T.red, fontSize: font.size.base }}>Non sono riuscito a leggere le fatture: {errore}</span></Riquadro>}
      {!dati && !errore && <Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Leggo le fatture…</span></Riquadro>}

      {dati && (
        <>
          <Riquadro isMobile={isMobile}>
            <div role="search" style={{ display: 'grid', gap: space[3], gridTemplateColumns: isMobile ? '1fr' : 'minmax(220px, 2fr) repeat(3, minmax(140px, 1fr))' }}>
              <input type="search" aria-label="Cerca per fornitore o numero" placeholder="Cerca fornitore o numero"
                value={cerca} onChange={e => setCerca(e.target.value)} style={campo(isMobile)} />
              <select aria-label="Sede" value={sede} onChange={e => setSede(e.target.value)} style={campo(isMobile)}>
                <option value="">Tutte le sedi</option>
                {sedi.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                <option value={SENZA_SEDE}>Senza sede</option>
              </select>
              <select aria-label="Stato" value={stato} onChange={e => setStato(e.target.value)} style={campo(isMobile)}>
                {STATI.map(s => <option key={s.id} value={s.id}>{s.id === 'tutte' ? 'Pagate e da pagare' : s.label}</option>)}
              </select>
              <select aria-label="Voce di spesa" value={voce} onChange={e => setVoce(e.target.value)} style={campo(isMobile)}>
                <option value="">Tutte le voci</option>
                {CATEGORIE_SPESA.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                <option value={SENZA_VOCE}>Da classificare</option>
              </select>
            </div>
          </Riquadro>

          <Riquadro isMobile={isMobile}>
            <div aria-live="polite" style={{ display: 'grid', gap: space[4], gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))' }}>
              <Tessera etichetta="Fatture" valore={NF0.format(tot.quante)}
                sotto={`${NF0.format(tot.nPagate)} pagate, ${NF0.format(tot.nDaPagare)} da pagare`} />
              <Tessera etichetta="Totale" valore={euro(tot.totale)} sotto="IVA compresa" />
              <Tessera etichetta="Da pagare" valore={euro(tot.daPagare)} sotto={`${NF0.format(tot.nDaPagare)} fatture`} />
              <Tessera etichetta="Senza imponibile" valore={NF0.format(tot.senzaImponibile)}
                sotto={tot.senzaImponibile ? 'totale IVA compresa' : 'tutte con imponibile'} />
            </div>
          </Riquadro>

          {periodoVuoto && <Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Nessuna fattura in questo periodo. Allarga le date qui sopra.</span></Riquadro>}
          {nessunaCorrispondenza && <Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Nessuna fattura corrisponde ai filtri. Togline qualcuno.</span></Riquadro>}

          {visibili.length > 0 && (
            <Riquadro isMobile={isMobile}>
              <TabellaAnalisi isMobile={isMobile} etichetta="Le fatture, dalla più recente" colonne={colonne} righe={righe} />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space[3], marginTop: space[3] }}>
                <span style={{ ...testo(font.size.sm), color: T.textSoft }}>
                  {NF0.format(mostrate.length)} di {NF0.format(visibili.length)} fatture
                </span>
                <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                  {altre > 0 && (
                    <button type="button" onClick={() => setVolte(v => v + 1)} style={{ ...campo(false), cursor: 'pointer', fontWeight: 600 }}>
                      Mostra altre {Math.min(RIGHE_PER_VOLTA, altre)}
                    </button>
                  )}
                  <button type="button" onClick={() => scaricaCsv(csvFatture(visibili, sedi), 'fatture.csv')}
                    style={{ ...campo(false), cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: space[2] }}>
                    <Icon name="download" size={16} /> Scarica CSV
                  </button>
                </div>
              </div>
            </Riquadro>
          )}
        </>
      )}
    </PaginaAnalisi>
  )
}
