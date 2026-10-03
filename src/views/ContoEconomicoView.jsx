// ── Il conto economico: voce per voce, contro l'anno prima ──────────────
//
// La seconda pagina della nuova Analisi (ANALISI_DESIGN.md §5). Il vecchio
// P&L (18/100 all'audit del 03/10/2026) aveva due «Conto economico» nella
// stessa pagina, quattro «Margine lordo» con numeri diversi, tre tabelle da
// 63 righe di listino per stampo e nessuna fattura dentro. Qui c'è una
// tabella sola, come la legge un commercialista: voce · mese · stesso mese
// dell'anno prima · differenza · peso sugli incassi · andamento dei dodici
// mesi. Le voci di spesa si aprono sui fornitori che pesano di più.
//
// I numeri vengono dalla stessa lettura de «Il mese» (`ilMeseArchivio.js`):
// le due pagine non possono dire due cose diverse dello stesso mese.
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, font, typo } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { CoperturaDati, Andamentino, IntestazioneAnalisi, TitoloGrafico, Riquadro } from '../components/analisi'
import { euro, euroSegno, quota, nomeMese, mesePrima, variazione } from '../lib/formatoAnalisi'
import { caricaIlMese } from '../lib/ilMeseArchivio'
import { vociCopertura } from './IlMeseView'
import { todayLocal } from '../lib/dateLocal'

const meseCorrente = () => todayLocal().slice(0, 7)
const meseDopo = (m) => {
  const [y, mm] = m.split('-').map(Number)
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
}

/**
 * Le righe della tabella, dal conto del mese e da quello di confronto.
 * Una riga per voce: `valore` e `prima` possono essere null («non lo so»).
 */
export function righeConto(attuale, prima, andamento = []) {
  if (!attuale) return []
  const serie = (fn) => andamento.map(m => (m ? fn(m.conto) : null))
  const gruppo = (c, chiave) => c?.gruppi?.find(g => g.chiave === chiave)
  const righe = [
    { chiave: 'incassi', etichetta: attuale.stimato ? 'Incassi (stimati)' : 'Incassi', valore: attuale.ricavi, prima: prima?.ricavi ?? null, tipo: 'ricavo', serie: serie(c => c.ricavi) },
  ]
  for (const g of attuale.gruppi || []) {
    const p = gruppo(prima, g.chiave)
    // Una voce a zero in tutti e due i mesi è una riga «−0 €» che non dice
    // niente: non si mostra. (Una voce che non si sa, invece, resta.)
    if (attuale.speseFatture != null && !g.importo && !(p?.importo)) continue
    righe.push({
      chiave: g.chiave, etichetta: g.etichetta, tipo: 'spesa',
      valore: attuale.speseFatture == null ? null : g.importo,
      prima: prima?.speseFatture == null ? null : (p?.importo ?? 0),
      serie: serie(c => (c.speseFatture == null ? null : (gruppo(c, g.chiave)?.importo ?? 0))),
      dettaglio: dettaglioFornitori(g.voci, p?.voci),
    })
  }
  if ((attuale.daClassificare || 0) > 0 || (prima?.daClassificare || 0) > 0) {
    righe.push({ chiave: 'daClassificare', etichetta: 'Da classificare', tipo: 'spesa', valore: attuale.daClassificare, prima: prima?.daClassificare ?? null, serie: serie(c => c.daClassificare) })
  }
  if ((attuale.speseFisse || 0) > 0 || (prima?.speseFisse || 0) > 0) {
    righe.push({ chiave: 'fisse', etichetta: 'Spese senza fattura', tipo: 'spesa', valore: attuale.speseFisse, prima: prima?.speseFisse ?? null, serie: serie(c => c.speseFisse) })
  }
  righe.push({ chiave: 'personale', etichetta: 'Personale', tipo: 'spesa', valore: attuale.personale, prima: prima?.personale ?? null, serie: serie(c => c.personale) })
  righe.push({ chiave: 'utile', etichetta: 'Utile', tipo: 'risultato', valore: attuale.utile, prima: prima?.utile ?? null, serie: serie(c => c.utile) })
  return righe
}

/** I fornitori di una voce, mese contro anno prima, dal più pesante. */
function dettaglioFornitori(vociA = [], vociB = []) {
  const somma = (voci) => {
    const m = new Map()
    for (const c of voci || []) for (const f of c.fornitori || []) m.set(f.nome, (m.get(f.nome) || 0) + (Number(f.importo) || 0))
    return m
  }
  const a = somma(vociA), b = somma(vociB)
  return [...new Set([...a.keys(), ...b.keys()])]
    .map(nome => ({ nome, valore: a.get(nome) || 0, prima: b.get(nome) || 0 }))
    .sort((x, y) => Math.max(y.valore, y.prima) - Math.max(x.valore, x.prima))
    .slice(0, 8)
}

export default function ContoEconomicoView({ orgId, sedi = [], sedeId = null, onNavigate }) {
  const isMobile = useIsMobile()
  const [mese, setMese] = useState(() => mesePrima(meseCorrente()))
  const [dati, setDati] = useState(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState(null)
  const [aperte, setAperte] = useState(() => new Set())

  useEffect(() => {
    if (!orgId) return
    let vivo = true
    setCaricando(true); setErrore(null)
    caricaIlMese({ supabase, orgId, sedi, mese, sedeId })
      .then(d => { if (vivo) setDati(d) })
      .catch(e => { if (vivo) setErrore(e?.message || 'lettura non riuscita') })
      .finally(() => { if (vivo) setCaricando(false) })
    return () => { vivo = false }
  }, [orgId, sedeId, mese, sedi])

  const righe = useMemo(() => righeConto(dati?.attuale?.conto, dati?.annoPrima?.conto, dati?.andamento), [dati])
  const ricavi = dati?.attuale?.conto?.ricavi ?? null
  const apri = (k) => setAperte(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const navMese = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => setMese(mesePrima(mese))} aria-label="Mese prima" style={stileFreccia}><Icon name="chevL" size={16} /></button>
      <span style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, minWidth: 128, textAlign: 'center' }}>{nomeMese(mese)}</span>
      <button type="button" onClick={() => setMese(meseDopo(mese))} disabled={mese >= meseCorrente()} aria-label="Mese dopo" style={{ ...stileFreccia, opacity: mese >= meseCorrente() ? 0.35 : 1 }}><Icon name="chevR" size={16} /></button>
    </div>
  )

  const conto = dati?.attuale?.conto
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', opacity: caricando && dati ? 0.6 : 1 }}>
      <IntestazioneAnalisi isMobile={isMobile}
        domanda={`Il conto di ${nomeMese(mese)}`}
        sotto={`Voce per voce, senza IVA, contro ${nomeMese(dati?.confronto || mese)}.`}
        destra={navMese} />
      {errore && <Riquadro isMobile={isMobile}><span style={{ color: T.red, fontSize: font.size.base }}>Non sono riuscito a leggere i dati: {errore}</span></Riquadro>}
      {!dati && !errore && <Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Metto insieme cassa, fatture e personale…</span></Riquadro>}
      {dati && conto && (
        <>
          <CoperturaDati voci={vociCopertura(dati, { onNavigate })} />
          <Riquadro isMobile={isMobile}>
            <TitoloGrafico
              titolo={conto.utile != null
                ? `Utile ${euro(conto.utile)}${ricavi > 0 ? `, ${quota(conto.quote.utile)} degli incassi` : ''}`
                : 'L\'utile non si può ancora dire'}
              sottotitolo="Tocca una voce di spesa per vedere i fornitori che pesano di più." />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.base, minWidth: isMobile ? 560 : 0 }}>
                <thead>
                  <tr style={{ color: T.textSoft, ...typo.overline }}>
                    <th style={{ ...cella, textAlign: 'left' }}>Voce</th>
                    <th style={cellaNum}>{nomeMese(mese, { anno: false })}</th>
                    <th style={cellaNum}>{nomeMese(dati.confronto)}</th>
                    <th style={cellaNum}>Differenza</th>
                    <th style={cellaNum}>Sugli incassi</th>
                    {!isMobile && <th style={{ ...cella, textAlign: 'right' }}>12 mesi</th>}
                  </tr>
                </thead>
                <tbody>
                  {righe.map(r => (
                    <RigaConto key={r.chiave} r={r} ricavi={ricavi} isMobile={isMobile}
                      aperta={aperte.has(r.chiave)} onApri={r.dettaglio?.length ? () => apri(r.chiave) : null} />
                  ))}
                </tbody>
              </table>
            </div>
            {conto.investimenti > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.border}`, fontSize: font.size.base, color: T.textMid, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span><b style={{ color: T.text }}>Fuori dal conto:</b> investimenti (attrezzature, lavori). Si pagano una volta e durano anni: non sono spese del mese.</span>
                <span style={{ fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{euro(conto.investimenti)}</span>
              </div>
            )}
          </Riquadro>
          <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 10, lineHeight: 1.5 }}>
            Le spese sono per data della fattura, senza IVA dove l&apos;imponibile c&apos;è. Il margine per prodotto, che prima stava qui, è in Food cost.
          </div>
        </>
      )}
    </div>
  )
}

const cella = { padding: '9px 8px', borderBottom: `1px solid ${T.borderSoft}`, whiteSpace: 'nowrap' }
const cellaNum = { ...cella, textAlign: 'right' }
const stileFreccia = {
  width: 36, height: 36, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard,
  color: T.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

function RigaConto({ r, ricavi, isMobile, aperta, onApri }) {
  const forte = r.tipo !== 'spesa'
  const v = r.valore != null && r.prima != null
    ? variazione({ attuale: r.valore, confronto: r.prima, piuEMeglio: r.tipo !== 'spesa' })
    : null
  const coloreDiff = v ? (v.verso === 'meglio' ? T.green : v.verso === 'peggio' ? T.red : T.textSoft) : T.textSoft
  const peso = ricavi > 0 && r.valore != null && r.tipo !== 'ricavo' ? quota((r.valore / ricavi) * 100) : ''
  const stileRiga = { fontWeight: forte ? 800 : 500, color: T.text, background: r.tipo === 'risultato' ? T.bgSubtle : 'transparent' }
  return (
    <>
      <tr style={stileRiga}>
        <td style={{ ...cella, textAlign: 'left' }}>
          {onApri ? (
            <button type="button" onClick={onApri} aria-expanded={aperta}
              style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28 }}>
              <Icon name={aperta ? 'chevDown' : 'chevR'} size={13} />{r.etichetta}
            </button>
          ) : <span style={{ paddingLeft: r.tipo === 'spesa' ? 19 : 0 }}>{r.etichetta}</span>}
        </td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: r.valore == null ? T.amberDark : r.tipo === 'risultato' && r.valore < 0 ? T.red : T.text }}>
          {r.valore == null ? 'non lo so' : r.tipo === 'spesa' ? `−${euro(r.valore)}` : euro(r.valore)}
        </td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: T.textSoft, fontWeight: 500 }}>
          {r.prima == null ? '—' : r.tipo === 'spesa' ? `−${euro(r.prima)}` : euro(r.prima)}
        </td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: coloreDiff, fontWeight: 600 }}>
          {v ? `${euroSegno(r.valore - r.prima)}${v.verso !== 'pari' ? (v.verso === 'meglio' ? ' · meglio' : ' · peggio') : ''}` : '—'}
        </td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: T.textSoft, fontWeight: 500 }}>{peso}</td>
        {!isMobile && <td style={{ ...cella, textAlign: 'right' }}><span style={{ display: 'inline-block' }}><Andamentino valori={r.serie} etichetta={`${r.etichetta}, ultimi 12 mesi`} /></span></td>}
      </tr>
      {aperta && (r.dettaglio || []).map(f => (
        <tr key={f.nome} style={{ color: T.textMid, fontSize: font.size.sm }}>
          <td style={{ ...cella, textAlign: 'left', paddingLeft: 32, whiteSpace: 'normal' }}>{f.nome}</td>
          <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums' }}>{euro(f.valore)}</td>
          <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: T.textSoft }}>{euro(f.prima)}</td>
          <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums' }}>{euroSegno(f.valore - f.prima)}</td>
          <td style={cellaNum} />
          {!isMobile && <td style={cella} />}
        </tr>
      ))}
    </>
  )
}
