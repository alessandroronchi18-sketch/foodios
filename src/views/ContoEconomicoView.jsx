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
import React, { useMemo, useState } from 'react'
import { color as T, font, typo, tnum } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { CoperturaDati, Andamentino, IntestazioneAnalisi, TitoloGrafico, Riquadro, ClassificaSpese } from '../components/analisi'
import PaginaAnalisi from '../components/analisi/PaginaAnalisi'
import { euro, euroSegno, quota, nomeMese, aMese, variazione } from '../lib/formatoAnalisi'
import { vociCopertura } from './IlMeseView'
import { nomeIncassi } from '../lib/ilMese'
import MeseAnalisi, { useMeseAnalisi, AvvisoMeseSpostato, PulsanteTorna } from '../components/analisi/MeseAnalisi'

/**
 * Le righe della tabella, dal conto del mese e da quello di confronto.
 * Una riga per voce: `valore` e `prima` possono essere null («non lo so»).
 */
export function righeConto(attuale, prima, andamento = []) {
  if (!attuale) return []
  const serie = (fn) => andamento.map(m => (m ? fn(m.conto) : null))
  const gruppo = (c, chiave) => c?.gruppi?.find(g => g.chiave === chiave)
  const righe = [
    { chiave: 'incassi', etichetta: nomeIncassi(attuale.stimato), valore: attuale.ricavi, prima: prima?.ricavi ?? null, tipo: 'ricavo', serie: serie(c => c.ricavi) },
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
    const primaPer = new Map((prima?.fornitoriDaClassificare || []).map(f => [f.nome, f.importo]))
    righe.push({
      chiave: 'daClassificare', etichetta: 'Da classificare', tipo: 'spesa', valore: attuale.daClassificare, prima: prima?.daClassificare ?? null, serie: serie(c => c.daClassificare),
      dettaglio: (attuale.fornitoriDaClassificare || []).slice(0, 8).map(f => ({ nome: f.nome, valore: f.importo, prima: primaPer.get(f.nome) || 0 })),
    })
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

export default function ContoEconomicoView({ orgId, sedi = [], sedeId = null, onNavigate, notify }) {
  const isMobile = useIsMobile()
  // La classificazione dei fornitori si apre qui dentro: finita, il conto
  // si rilegge da solo (`versione`), senza cambiare pagina.
  const [classifica, setClassifica] = useState(false)
  const [versione, setVersione] = useState(0)
  const [aperte, setAperte] = useState(() => new Set())
  // Lo stesso mese, la stessa lettura e la stessa regola del primo mese de
  // «Il mese»: prima il conto si apriva sul mese appena chiuso, senza incassi,
  // mentre «Il mese» andava all'ultimo che li ha (audit 04/10, CE2).
  const { mese, setMese, dati, caricando, errore, spostato } = useMeseAnalisi({ orgId, sedi, sedeId, versione })

  const righe = useMemo(() => righeConto(dati?.attuale?.conto, dati?.annoPrima?.conto, dati?.andamento), [dati])
  const ricavi = dati?.attuale?.conto?.ricavi ?? null
  const apri = (k) => setAperte(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const conto = dati?.attuale?.conto
  if (classifica) return (
    <ClassificaSpese orgId={orgId} notify={notify} isMobile={isMobile}
      torna={<PulsanteTorna onClick={() => setClassifica(false)}>Torna al conto</PulsanteTorna>}
      onSalvato={() => { setClassifica(false); setVersione(v => v + 1) }} />
  )
  return (
    <PaginaAnalisi isMobile={isMobile} attenuata={caricando && !!dati}>
      <IntestazioneAnalisi isMobile={isMobile}
        // Una domanda come le pagine sorelle, non «Il conto di agosto 2026»
        // (audit 04/10, CE9). L'anno lo dicono le frecce del mese.
        domanda={`Dove sono andati i soldi ${aMese(mese, { anno: false })}?`}
        sotto={(
          <>
            {`Voce per voce, senza IVA, contro ${nomeMese(dati?.confronto || mese)}.`}
            <AvvisoMeseSpostato spostato={spostato} onVai={() => setMese(spostato.da)} />
          </>
        )}
        destra={<MeseAnalisi mese={mese} onCambia={setMese} />} />
      {errore && <Riquadro isMobile={isMobile}><span style={{ color: T.red, fontSize: font.size.base }}>Non sono riuscito a leggere i dati: {errore}</span></Riquadro>}
      {!dati && !errore && <Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Metto insieme cassa, fatture e personale…</span></Riquadro>}
      {dati && conto && (
        <>
          <CoperturaDati voci={vociCopertura(dati, { onNavigate, onClassifica: () => setClassifica(true) })} />
          <Riquadro isMobile={isMobile}>
            <TitoloGrafico
              titolo={conto.utile != null
                ? `Utile ${euro(conto.utile)}${ricavi > 0 ? `, ${quota(conto.quote.utile)} degli incassi` : ''}`
                : 'L\'utile non si può ancora dire'}
              sottotitolo="Tocca una voce di spesa per vedere i fornitori che pesano di più." />
            {/* Al telefono la tabella era larga 608 px in un riquadro di 354 e
                la differenza con l'anno prima restava fuori schermo (audit
                04/10, CE1): lì il conto è un elenco di schede. */}
            {isMobile ? (
              <ul aria-label="Il conto voce per voce" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {righe.map(r => (
                  <SchedaConto key={r.chiave} r={r} ricavi={ricavi} meseConfronto={dati.confronto}
                    aperta={aperte.has(r.chiave)} onApri={r.dettaglio?.length ? () => apri(r.chiave) : null}
                    onClassifica={r.chiave === 'daClassificare' ? () => setClassifica(true) : null} />
                ))}
              </ul>
            ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.base }}>
                <thead>
                  <tr style={{ color: T.textSoft, ...typo.overline }}>
                    <th style={{ ...cella, textAlign: 'left' }}>Voce</th>
                    <th style={cellaNum}>{nomeMese(mese, { anno: false })}</th>
                    <th style={cellaNum}>{nomeMese(dati.confronto)}</th>
                    <th style={cellaNum}>Differenza</th>
                    <th style={cellaNum}>Sugli incassi</th>
                    <th style={{ ...cella, textAlign: 'right' }}>12 mesi</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map(r => (
                    <RigaConto key={r.chiave} r={r} ricavi={ricavi}
                      aperta={aperte.has(r.chiave)} onApri={r.dettaglio?.length ? () => apri(r.chiave) : null}
                      onClassifica={r.chiave === 'daClassificare' ? () => setClassifica(true) : null} />
                  ))}
                </tbody>
              </table>
            </div>
            )}
            {conto.investimenti > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.border}`, fontSize: font.size.base, color: T.textMid, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span><b style={{ color: T.text }}>Fuori dal conto:</b> investimenti (attrezzature, lavori). Si pagano una volta e durano anni: non sono spese del mese.</span>
                <span style={{ fontWeight: 800, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{euro(conto.investimenti)}</span>
              </div>
            )}
          </Riquadro>
          <div style={{ fontSize: font.size.sm, color: T.textSoft, lineHeight: '16px' }}>
            Le spese sono per data della fattura, senza IVA dove l&apos;imponibile c&apos;è. Il margine per prodotto, che prima stava qui, è in Food cost.
          </div>
        </>
      )}
    </PaginaAnalisi>
  )
}

const cella = { padding: '9px 8px', borderBottom: `1px solid ${T.borderSoft}`, whiteSpace: 'nowrap' }
const cellaNum = { ...cella, textAlign: 'right' }

/** I numeri di una riga, uguali nella tabella e nella scheda del telefono. */
function numeriRiga(r, ricavi) {
  const v = r.valore != null && r.prima != null
    ? variazione({ attuale: r.valore, confronto: r.prima, piuEMeglio: r.tipo !== 'spesa' })
    : null
  // «Da classificare» non è una spesa salita o scesa: sono fatture senza voce.
  // La differenza si scrive senza giudizio, nel colore di «incompleto», mai in
  // rosso (audit 04/10, CE3: era «+4.417 € · peggio»).
  const incompleta = r.chiave === 'daClassificare'
  return {
    coloreDiff: incompleta ? T.amberDark : v ? (v.verso === 'meglio' ? T.green : v.verso === 'peggio' ? T.red : T.textSoft) : T.textSoft,
    peso: ricavi > 0 && r.valore != null && r.tipo !== 'ricavo' ? quota((r.valore / ricavi) * 100) : '',
    valore: r.valore == null ? 'non lo so' : r.tipo === 'spesa' ? `−${euro(r.valore)}` : euro(r.valore),
    coloreValore: r.valore == null ? T.amberDark : r.tipo === 'risultato' && r.valore < 0 ? T.red : T.text,
    prima: r.prima == null ? null : r.tipo === 'spesa' ? `−${euro(r.prima)}` : euro(r.prima),
    // La differenza in euro e il giudizio a parole, separati: la tabella li
    // scrive «+2.000 € · peggio», la scheda «+2.000 € su agosto 2025 · peggio».
    diff: v ? euroSegno(r.valore - r.prima) : null,
    giudizio: v && v.verso !== 'pari' && !incompleta ? v.verso : null,
  }
}
const conGiudizio = (testo, giudizio) => `${testo}${giudizio ? ` · ${giudizio}` : ''}`

/** «Classifica», accanto alla voce «Da classificare»: porta dove si sistema. */
function PulsanteClassifica({ onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      border: 'none', background: 'transparent', color: T.brand, fontWeight: 700, fontSize: font.size.sm,
      fontFamily: 'inherit', cursor: 'pointer', padding: '0 4px', minHeight: 28,
    }}>
      Classifica
    </button>
  )
}

function RigaConto({ r, ricavi, aperta, onApri, onClassifica }) {
  const forte = r.tipo !== 'spesa'
  const n = numeriRiga(r, ricavi)
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
          {onClassifica && <span style={{ marginLeft: 8 }}><PulsanteClassifica onClick={onClassifica} /></span>}
        </td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: n.coloreValore }}>{n.valore}</td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: T.textSoft, fontWeight: 500 }}>{n.prima ?? '—'}</td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: n.coloreDiff, fontWeight: 600 }}>{n.diff ? conGiudizio(n.diff, n.giudizio) : '—'}</td>
        <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: T.textSoft, fontWeight: 500 }}>{n.peso}</td>
        <td style={{ ...cella, textAlign: 'right' }}><span style={{ display: 'inline-block' }}><Andamentino valori={r.serie} etichetta={`${r.etichetta}, ultimi 12 mesi`} /></span></td>
      </tr>
      {aperta && (r.dettaglio || []).map(f => (
        <tr key={f.nome} style={{ color: T.textMid, fontSize: font.size.sm }}>
          <td style={{ ...cella, textAlign: 'left', paddingLeft: 32, whiteSpace: 'normal' }}>{f.nome}</td>
          <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums' }}>{euro(f.valore)}</td>
          <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums', color: T.textSoft }}>{euro(f.prima)}</td>
          <td style={{ ...cellaNum, fontVariantNumeric: 'tabular-nums' }}>{euroSegno(f.valore - f.prima)}</td>
          <td style={cellaNum} />
          <td style={cella} />
        </tr>
      ))}
    </>
  )
}

/**
 * La voce al telefono: nome ed euro sulla prima riga; sotto, nella stessa
 * scheda, quanto pesa sugli incassi e la differenza con l'anno prima.
 * Le voci con i fornitori dietro si aprono toccando la scheda intera.
 */
function SchedaConto({ r, ricavi, meseConfronto, aperta, onApri, onClassifica }) {
  const n = numeriRiga(r, ricavi)
  const forte = r.tipo !== 'spesa'
  const confronto = nomeMese(meseConfronto)
  const sotto = [
    n.peso ? <span key="p">{n.peso} degli incassi</span> : null,
    n.diff
      ? <span key="d" style={{ color: n.coloreDiff, fontWeight: 600 }}>{conGiudizio(`${n.diff} su ${confronto}`, n.giudizio)}</span>
      : <span key="d">{n.prima ? `${confronto}: ${n.prima}` : `${confronto}: non noto`}</span>,
  ].filter(Boolean)
  const corpo = (
    <>
      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', height: 20, color: T.textSoft }}>
        {onApri ? <Icon name={aperta ? 'chevDown' : 'chevR'} size={14} /> : null}
      </span>
      <span style={{ fontSize: font.size.md, lineHeight: '20px', fontWeight: forte ? 800 : 600, color: T.text, minWidth: 0 }}>{r.etichetta}</span>
      <span style={{ fontSize: font.size.md, lineHeight: '20px', fontWeight: forte ? 800 : 600, color: n.coloreValore, textAlign: 'right', whiteSpace: 'nowrap', ...tnum }}>{n.valore}</span>
      <span style={{ gridColumn: '2 / 4', fontSize: font.size.sm, lineHeight: '16px', color: T.textSoft, ...tnum }}>
        {sotto.reduce((acc, el, i) => (i ? [...acc, <span key={`s${i}`}> · </span>, el] : [el]), [])}
      </span>
    </>
  )
  const griglia = {
    display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) auto', columnGap: 8, rowGap: 4, alignItems: 'start',
    width: '100%', minHeight: 44, padding: '12px 0', boxSizing: 'border-box', textAlign: 'left',
  }
  return (
    // L'utile chiude il conto: il filo sopra è più scuro, come una somma.
    <li style={{ borderTop: r.tipo === 'risultato' ? `2px solid ${T.borderStr}` : `1px solid ${T.borderSoft}` }}>
      {onApri ? (
        <button type="button" onClick={onApri} aria-expanded={aperta}
          style={{ ...griglia, border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
          {corpo}
        </button>
      ) : <div style={griglia}>{corpo}</div>}
      {/* Fuori dal pulsante della scheda: un pulsante non ne contiene un altro. */}
      {onClassifica && (
        <div style={{ paddingLeft: 24, marginTop: -8, paddingBottom: 4 }}>
          <span style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}><PulsanteClassifica onClick={onClassifica} /></span>
        </div>
      )}
      {aperta && (
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 8px 24px' }}>
          {(r.dettaglio || []).map(f => (
            <li key={f.nome} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 8, padding: '8px 0', borderTop: `1px dashed ${T.borderSoft}`, fontSize: font.size.sm, lineHeight: '16px', color: T.textMid }}>
              <span style={{ minWidth: 0 }}>{f.nome}</span>
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap', color: T.text, ...tnum }}>{euro(f.valore)}</span>
              <span style={{ gridColumn: '1 / 3', color: T.textSoft, ...tnum }}>{`${confronto}: ${euro(f.prima)} · ${euroSegno(f.valore - f.prima)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
