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
import { color as T, font, tnum } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { CoperturaDati, Andamentino, NumeroPrincipale, IntestazioneAnalisi, TitoloGrafico, Riquadro, ClassificaSpese, TabellaAnalisi, testo } from '../components/analisi'
import PaginaAnalisi from '../components/analisi/PaginaAnalisi'
import { euro, euroSegno, quota, nomeMese, aMese, variazione, dataBreve } from '../lib/formatoAnalisi'
import { vociCopertura } from './IlMeseView'
import { nomeIncassi, ivaDelleSpese } from '../lib/ilMese'
import MeseAnalisi, { useMeseAnalisi, PulsanteTorna, meseCorrente } from '../components/analisi/MeseAnalisi'

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

/**
 * Le prop di NumeroPrincipale per «Dove sono andati i soldi?»: le spese del
 * mese contro lo stesso mese dell'anno prima, con l'IVA detta sotto il numero
 * se le fatture ce l'hanno dentro, e una frase che dice dove: la voce più
 * pesante e quanto non ha ancora la voce. Con le fatture del mese a metà il
 * confronto non si fa (direbbe un calo che non c'è), come nel Mese.
 */
export function rispostaDelConto({ dati, mese, iva }) {
  const conto = dati.attuale.conto
  const prima = dati.annoPrima?.conto
  const ultimaFattura = dati.attuale.costi?.copertura?.ultimaFattura || null
  const aMeta = !!(ultimaFattura && ultimaFattura < `${mese}-25` && mese < meseCorrente())
  const v = !aMeta && conto.spese != null && prima?.spese != null
    ? variazione({ attuale: conto.spese, confronto: prima.spese, piuEMeglio: false })
    : null
  const piuPesante = [...(conto.gruppi || [])].filter(g => g.importo > 0).sort((a, b) => b.importo - a.importo)[0]
  const frase = [
    conto.ricavi > 0 && conto.spese != null ? `È il ${quota((conto.spese / conto.ricavi) * 100)} degli incassi.` : null,
    piuPesante ? `La voce più pesante è ${piuPesante.etichetta}: ${euro(piuPesante.importo)}${conto.daClassificare > 0 ? `; ${euro(conto.daClassificare)} non hanno ancora la voce` : ''}.` : null,
    conto.personale == null ? 'Il personale manca: gli stipendi non sono registrati.' : null,
  ].filter(Boolean).join(' ')
  return {
    etichetta: `Spese di ${nomeMese(mese, { anno: false })}`,
    valore: conto.spese != null ? euro(conto.spese) : null,
    motivoMancante: 'Non lo so ancora: le fatture non si sono potute leggere',
    variazione: v, rispettoA: `su ${nomeMese(dati.confronto)}`,
    valoreConfronto: v && prima?.spese != null ? euro(prima.spese) : '',
    senzaConfronto: aMeta ? `fatture registrate fino al ${dataBreve(ultimaFattura)}: niente confronto` : '',
    avviso: iva.riga,
    frase: frase || null,
  }
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
  // Le spese con l'IVA dentro lo dicono sotto la domanda, sopra la tabella
  // (§6, 04/10): prima «Voce per voce, senza IVA» anche quando non lo erano.
  const iva = ivaDelleSpese(dati?.attuale?.costi)
  // Il mese guardato dentro l'andamento dei 12 mesi: lì va il punto.
  const indiceMese = (dati?.andamento || []).findIndex(m => m?.mese === mese)
  const scelto = indiceMese >= 0 ? indiceMese : null
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
        // L'IVA dentro le spese la dice l'avvertimento sotto il numero della
        // risposta; qui solo come si legge la tabella.
        sotto={`Voce per voce, contro ${nomeMese(dati?.confronto || mese)}. ${iva.stato === 'senza' ? 'Incassi e spese senza IVA.' : `Incassi senza IVA, spese ${iva.breve}.`}`}
        destra={<MeseAnalisi mese={mese} onCambia={setMese} spostato={spostato} />} />
      {errore && <Riquadro isMobile={isMobile}><span style={{ color: T.red, fontSize: font.size.base }}>Non sono riuscito a leggere i dati: {errore}</span></Riquadro>}
      {!dati && !errore && <Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Metto insieme cassa, fatture e personale…</span></Riquadro>}
      {dati && conto && (
        <>
          <CoperturaDati isMobile={isMobile} voci={vociCopertura(dati, { onNavigate, onClassifica: () => setClassifica(true) })} />
          {/* La risposta alla domanda, una e grande (fase B): quanto si è
              speso, contro l'anno prima, e dove. Prima il primo numero della
              pagina era una cella da 13 px della tabella. */}
          <NumeroPrincipale riquadro isMobile={isMobile} {...rispostaDelConto({ dati, mese, iva })} />
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
            // Al computer la tabella comune dell'Analisi (TabellaAnalisi):
            // intestazioni in frase normale con l'euro in testa, numeri in
            // colonne di larghezza fissa vicino ai nomi, righe da 44 px, la
            // stessa tabella delle Previsioni (audit 04/10, C5, CE4, CE6).
            // Larga al massimo 880 px: a tutta larghezza la colonna dei nomi
            // prendeva il resto e i numeri finivano lontani dalle voci (CE6).
            <div style={{ maxWidth: 880 }}>
            <TabellaAnalisi isMobile={false} etichetta={`Il conto ${aMese(mese, { anno: false })}`}
              colonne={[
                { chiave: 'voce', titolo: 'Voce' },
                { chiave: 'mese', titolo: nomeMese(mese, { anno: false }), tipo: 'euro' },
                { chiave: 'prima', titolo: nomeMese(dati.confronto), tipo: 'euro' },
                { chiave: 'diff', titolo: 'differenza', tipo: 'differenza' },
                { chiave: 'quota', titolo: '% incassi', tipo: 'quota' },
                { chiave: 'andamento', titolo: '12 mesi', tipo: 'nodo', larghezza: 88 },
              ]}
              righe={righeTabella(righe, { ricavi, aperte, apri, scelto, onClassifica: () => setClassifica(true) })} />
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

// Righe alte 44 px tutte uguali, senza imbottitura verticale: prima 9 px di
// imbottitura e un pulsante da 28 facevano righe da 44 e da 47 (audit 04/10,
// CE4). Il pulsante della voce prende tutta l'altezza (CE5).
// La cella misura 44 + 1 di filo sotto (con box-sizing border-box l'altezza
// della cella comprende il filo): così il pulsante da 44 non la allunga.
// L'altezza di una riga che si tocca: 44 px, un polpastrello.
const ALTEZZA_RIGA = 44

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
    coloreDiff: incompleta ? T.amberDark : v ? (v.verso === 'meglio' ? T.graficoMeglio : v.verso === 'peggio' ? T.graficoPeggio : T.textSoft) : T.textSoft,
    peso: ricavi > 0 && r.valore != null && r.tipo !== 'ricavo' ? quota((r.valore / ricavi) * 100) : '',
    valore: r.valore == null ? 'non lo so' : r.tipo === 'spesa' ? `−${euro(r.valore)}` : euro(r.valore),
    coloreValore: r.valore == null ? T.amberDark : r.tipo === 'risultato' && r.valore < 0 ? T.graficoPeggio : T.text,
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
      fontFamily: 'inherit', cursor: 'pointer', padding: '0 4px', minHeight: ALTEZZA_RIGA,
    }}>
      Classifica
    </button>
  )
}

/**
 * Le righe del conto per la tabella comune. Le spese col meno, l'euro
 * nell'intestazione; «Da classificare» in ambra e senza giudizio, con
 * «Classifica» nella cella del nome (CE3); i fornitori di una voce aperta
 * sono righe della stessa tabella, così i loro numeri cadono nelle stesse
 * colonne.
 */
function righeTabella(righe, { ricavi, aperte, apri, scelto, onClassifica }) {
  const segno = (r, v) => (v == null ? null : r.tipo === 'spesa' ? -v : v)
  const out = []
  for (const r of righe) {
    const n = numeriRiga(r, ricavi)
    const daClassificare = r.chiave === 'daClassificare'
    const apribile = !daClassificare && r.dettaglio?.length > 0
    out.push({
      chiave: r.chiave,
      forte: r.tipo === 'risultato',
      incompleto: daClassificare,
      onClick: apribile ? () => apri(r.chiave) : undefined,
      aperta: apribile ? aperte.has(r.chiave) : undefined,
      celle: {
        voce: daClassificare
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: ALTEZZA_RIGA, margin: '-8px 0' }}>{r.etichetta}<PulsanteClassifica onClick={onClassifica} /></span>
          : r.etichetta,
        mese: segno(r, r.valore),
        prima: r.prima == null ? '—' : segno(r, r.prima),
        diff: n.diff ? { valore: r.valore - r.prima, verso: n.giudizio || 'pari', incompleto: daClassificare } : undefined,
        quota: r.tipo !== 'ricavo' && ricavi > 0 && r.valore != null ? (r.valore / ricavi) * 100 : undefined,
        andamento: <Andamentino valori={r.serie} scelto={scelto} larghezza={72} etichetta={`${r.etichetta}, ultimi 12 mesi`} />,
      },
    })
    if (apribile && aperte.has(r.chiave)) {
      for (const f of r.dettaglio) {
        out.push({
          chiave: `${r.chiave}:${f.nome}`,
          celle: {
            voce: <span style={{ display: 'block', paddingLeft: 22, ...testo(font.size.sm), color: T.textMid, whiteSpace: 'normal' }}>{f.nome}</span>,
            mese: -f.valore, prima: -f.prima,
            diff: { valore: f.valore - f.prima },
          },
        })
      }
    }
  }
  return out
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
