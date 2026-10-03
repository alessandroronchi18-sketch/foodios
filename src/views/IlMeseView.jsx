// ── Il mese: quanto hai guadagnato, e perché ────────────────────────────
//
// La prima pagina della nuova Analisi (ANALISI_DESIGN.md). Il titolare,
// 03/10/2026: «la parte di analisi è fatta male e inutile»; alle domande ha
// risposto «non capisco cosa guardare», «grafici inutili o brutti», «mancano
// le cose che servono», e che la prima domanda è «quanto guadagno e perché».
//
// Quindi una domanda sola, in cima, e sotto la risposta in quest'ordine:
//   1. da dove vengono i numeri e cosa manca (con il pulsante per sistemarlo);
//   2. l'utile, o perché non si può dire, con lo stesso mese dell'anno prima;
//   3. la cascata dagli incassi all'utile;
//   4. le cause della differenza con l'anno prima, in frasi con il numero;
//   5. materie prime, personale e prime cost contro l'obiettivo;
//   6. le sedi affiancate;
//   7. gli ultimi dodici mesi.
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, font, ui3 } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import {
  CoperturaDati, NumeroConConfronto, BarraObiettivo, Cascata, IntestazioneAnalisi,
  TitoloGrafico, Riquadro, FraseInsight,
} from '../components/analisi'
import { euro, quota, nomeMese, aMese, mesePrima, variazione, dataBreve } from '../lib/formatoAnalisi'
import { OBIETTIVI, causeDelCambio, fraseCausa, titoloCascata, motivoSenzaUtile } from '../lib/ilMese'
import { caricaIlMese } from '../lib/ilMeseArchivio'
import { todayLocal } from '../lib/dateLocal'

const meseCorrente = () => todayLocal().slice(0, 7)
const meseDopo = (m) => {
  const [y, mm] = m.split('-').map(Number)
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`
}

/** Le voci della riga «Da dove vengono i numeri», dal risultato della lettura. */
export function vociCopertura(dati, { onNavigate, onClassifica } = {}) {
  if (!dati?.attuale) return []
  const { incassi, costi, personale } = dati.attuale
  const voci = []
  voci.push(incassi.fonte === 'cassa'
    ? { id: 'incassi', stato: incassi.parziale ? 'parziale' : 'ok', testo: `Incassi ${incassi.testo}`, azione: incassi.parziale && onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null }
    : incassi.fonte === 'stima'
      ? { id: 'incassi', stato: 'stima', testo: `incassi ${incassi.testo}`, azione: onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null }
      : { id: 'incassi', stato: 'manca', testo: `gli incassi: ${incassi.testo}`, azione: onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null })
  if (!costi) {
    voci.push({ id: 'fatture', stato: 'manca', testo: 'le fatture non si sono potute leggere' })
  } else {
    const c = costi.copertura || {}
    voci.push(c.importoIvaCompresa > 0
      ? { id: 'fatture', stato: 'parziale', testo: `${c.nFatture} fatture, ${c.nSenzaImponibile} senza imponibile: ${euro(c.importoIvaCompresa)} contati con l'IVA`, azione: onNavigate ? { etichetta: 'Carica lo ZIP', onClick: () => onNavigate('scadenzario') } : null }
      : { id: 'fatture', stato: 'ok', testo: `${c.nFatture || 0} fatture del mese, senza IVA` })
    if (costi.daClassificare?.importo > 0) {
      voci.push({ id: 'categorie', stato: 'parziale', testo: `${euro(costi.daClassificare.importo)} di spese di ${costi.daClassificare.nFornitori} fornitori senza categoria`, azione: onClassifica ? { etichetta: 'Classifica', onClick: onClassifica } : null })
    }
  }
  voci.push({ id: 'personale', stato: personale.stato === 'ok' ? 'ok' : personale.stato, testo: personale.stato === 'ok' ? `Personale: ${personale.testo}` : `personale: ${personale.testo}`, azione: personale.stato !== 'ok' && onNavigate ? { etichetta: 'Apri Personale', onClick: () => onNavigate('personale') } : null })
  return voci
}

export default function IlMeseView({ orgId, sedi = [], sedeId = null, onNavigate }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  // Si parte dall'ultimo mese chiuso: il mese in corso ha pochi giorni e
  // confrontarlo con un mese intero è il difetto dei «cali del -70%».
  const [mese, setMese] = useState(() => mesePrima(meseCorrente()))
  const [dati, setDati] = useState(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState(null)

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

  const conto = dati?.attuale?.conto || null
  const contoPrima = dati?.annoPrima?.conto || null
  const cause = useMemo(() => causeDelCambio(conto, contoPrima), [conto, contoPrima])
  const nomeSede = sedeId ? (sedi.find(s => s.id === sedeId)?.nome || 'questa sede') : 'Tutta l\'azienda'

  const navMese = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => setMese(mesePrima(mese))} aria-label="Mese prima" style={stileFreccia}><Icon name="chevL" size={16} /></button>
      <span style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, minWidth: 128, textAlign: 'center' }}>{nomeMese(mese)}</span>
      <button type="button" onClick={() => setMese(meseDopo(mese))} disabled={mese >= meseCorrente()} aria-label="Mese dopo" style={{ ...stileFreccia, opacity: mese >= meseCorrente() ? 0.35 : 1 }}><Icon name="chevR" size={16} /></button>
    </div>
  )

  const intestazione = (
    <IntestazioneAnalisi isMobile={isMobile}
      domanda={`Quanto hai guadagnato ${aMese(mese, { anno: false })}?`}
      sotto={`${nomeSede} · confronto con ${nomeMese(dati?.confronto || mese)}`}
      destra={navMese} />
  )

  if (caricando && !dati) return <div style={{ maxWidth: 1200, margin: '0 auto' }}>{intestazione}<Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Metto insieme cassa, fatture e personale…</span></Riquadro></div>
  if (errore) return <div style={{ maxWidth: 1200, margin: '0 auto' }}>{intestazione}<Riquadro isMobile={isMobile}><span style={{ color: T.red, fontSize: font.size.base }}>Non sono riuscito a leggere i dati: {errore}</span></Riquadro></div>
  if (!conto) return null

  const vUtile = conto.utile != null && contoPrima?.utile != null ? variazione({ attuale: conto.utile, confronto: contoPrima.utile }) : null
  const vIncassi = conto.ricavi != null && contoPrima?.ricavi != null ? variazione({ attuale: conto.ricavi, confronto: contoPrima.ricavi }) : null
  const vSpese = conto.spese != null && contoPrima?.spese != null ? variazione({ attuale: conto.spese, confronto: contoPrima.spese, piuEMeglio: false }) : null
  const meseConfronto = dati.confronto
  const materieIncomplete = conto.speseFatture > 0 && conto.daClassificare > conto.speseFatture * 0.05
  const eccezionali = dati.attuale.eccezionali || []
  const colonne = ui3(isMobile, isTablet, { telefono: '1fr', tablet: '1fr 1fr', computer: '2fr 1fr 1fr' })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', opacity: caricando ? 0.6 : 1, transition: 'opacity 120ms' }}>
      {intestazione}
      <CoperturaDati voci={vociCopertura(dati, { onNavigate })} />

      {/* ── La risposta ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: colonne, gap: isMobile ? 10 : 14, marginBottom: 14 }}>
        <div style={{ gridColumn: isTablet && !isMobile ? '1 / -1' : 'auto', display: 'grid' }}>
          <NumeroConConfronto grande isMobile={isMobile}
            etichetta={`Utile di ${nomeMese(mese, { anno: false })}`}
            valore={conto.utile != null ? euro(conto.utile) : null}
            stimato={conto.stimato}
            motivoMancante={`Non posso dirtelo: ${motivoSenzaUtile(conto, dati.attuale)}`}
            variazione={vUtile} rispettoA={`su ${nomeMese(meseConfronto)}`} valoreConfronto={contoPrima?.utile != null ? euro(contoPrima.utile) : ''}
            contesto={conto.utile != null && conto.ricavi > 0
              ? `${quota(conto.quote.utile)} degli incassi${conto.investimenti > 0 ? ` · fuori dal conto ${euro(conto.investimenti)} di investimenti` : ''}`
              : conto.primaDelPersonale != null && conto.personale == null
                ? `Prima del personale ti restano ${euro(conto.primaDelPersonale)}${conto.stimato ? ' (stima)' : ''}: incassi meno le spese in fattura.`
                : conto.speseFatture != null ? `Spese già note: ${euro(conto.spese)}` : ''} />
        </div>
        <NumeroConConfronto isMobile={isMobile} etichetta="Incassi senza IVA" stimato={conto.stimato}
          valore={conto.ricavi != null ? euro(conto.ricavi) : null} motivoMancante="nessun dato"
          variazione={vIncassi} rispettoA={`su ${nomeMese(meseConfronto, { anno: true })}`}
          contesto={dati.attuale.incassi.fonte === 'stima' ? 'stimati dall\'inventario' : dati.attuale.incassi.fonte === 'cassa' ? 'dalla cassa' : ''} />
        <NumeroConConfronto isMobile={isMobile} etichetta="Spese del mese"
          valore={conto.spese != null ? euro(conto.spese) : null} motivoMancante="fatture non lette"
          variazione={vSpese} rispettoA={`su ${nomeMese(meseConfronto, { anno: true })}`}
          contesto={conto.personale == null && conto.speseFatture != null ? 'senza il personale, che manca' : 'fatture e personale'} />
      </div>

      {eccezionali.length > 0 && (
        <Riquadro isMobile={isMobile} stile={{ marginBottom: 14, borderColor: T.bordoAvviso, background: T.fondoAvviso }}>
          <TitoloGrafico titolo={eccezionali.length === 1 ? 'Una fattura fuori scala questo mese' : `${eccezionali.length} fatture fuori scala questo mese`}
            sottotitolo="Se sono investimenti (attrezzature, lavori) si pagano una volta e durano anni: non sono spese del mese. Finché non lo dici, le conto come spese." />
          {eccezionali.slice(0, 3).map(f => (
            <FraseInsight key={f.id || f.numero} verso="info" onClick={onNavigate ? () => onNavigate('scadenzario') : null} etichettaAzione="Apri">
              <b>{f.fornitore}</b>: {euro(f.importo)} il {dataBreve(f.data)}, {f.motivo}.
            </FraseInsight>
          ))}
        </Riquadro>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '3fr 2fr', gap: isMobile ? 10 : 14, marginBottom: 14 }}>
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico titolo={titoloCascata(conto)}
            sottotitolo={`Dagli incassi${conto.stimato ? ' stimati' : ''} all'utile, senza IVA. Le spese vengono dalle fatture del mese, per data.`} />
          <Cascata isMobile={isMobile} ricavi={conto.ricavi} passi={conto.passi} />
        </Riquadro>
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico titolo={cause.length ? `Cosa è cambiato da ${nomeMese(meseConfronto)}` : `Il confronto con ${nomeMese(meseConfronto)}`}
            sottotitolo={cause.length ? 'Le voci che hanno spostato di più l\'utile, dalla più pesante.' : ''} />
          {cause.length ? cause.map(c => (
            <FraseInsight key={c.chiave} verso={c.effetto >= 0 ? 'meglio' : 'peggio'}>{fraseCausa(c, meseConfronto)}</FraseInsight>
          )) : (
            <div style={{ fontSize: font.size.base, color: T.textSoft, lineHeight: 1.55 }}>
              {dati.annoPrima ? `Per ${nomeMese(meseConfronto)} mancano i dati per confrontare voce per voce.` : 'Non ci sono dati dell\'anno prima.'}
            </div>
          )}
        </Riquadro>
      </div>

      <Riquadro isMobile={isMobile} stile={{ marginBottom: 14 }}>
        <TitoloGrafico titolo="Le tre spese che decidono il margine"
          sottotitolo="Quanto pesano sugli incassi. Gli obiettivi sono indicativi: per la pasticceria artigiana non ci sono riferimenti italiani solidi, conta il confronto con te stesso." />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: isMobile ? 16 : 24 }}>
          {/* Con molte spese ancora senza categoria la quota delle materie
              prime è un minimo, non la quota: «1,6%, sotto l'obiettivo» in
              verde sarebbe una buona notizia falsa. */}
          <BarraObiettivo etichetta="Materie prime" valore={materieIncomplete ? null : conto.quote.materiePrime} obiettivo={OBIETTIVI.materiePrime}
            motivoMancante={conto.ricavi == null ? 'mancano gli incassi' : materieIncomplete ? `prima classifica ${euro(conto.daClassificare)} di spese` : 'mancano le fatture'} />
          <BarraObiettivo etichetta="Personale" valore={conto.quote.personale} obiettivo={OBIETTIVI.personale}
            motivoMancante={conto.personale == null ? 'stipendi non registrati' : 'mancano gli incassi'} />
          <BarraObiettivo etichetta="Materie prime + personale" valore={materieIncomplete ? null : conto.quote.primeCost} obiettivo={OBIETTIVI.primeCost}
            motivoMancante="servono tutte e due" />
        </div>
      </Riquadro>

      {dati.perSede && Object.keys(dati.perSede).length > 1 && (
        <Riquadro isMobile={isMobile} stile={{ marginBottom: 14 }}>
          <TitoloGrafico titolo={titoloSedi(dati.perSede)} sottotitolo="Stesso conto, negozio per negozio. Le spese condivise sono ripartite sui chili prodotti." />
          <SediAffiancate perSede={dati.perSede} isMobile={isMobile} />
        </Riquadro>
      )}

      <Riquadro isMobile={isMobile}>
        <UltimiMesi andamento={dati.andamento} isMobile={isMobile} meseScelto={mese} onScegli={setMese} />
      </Riquadro>

      {dati.ultimoInventario && (
        <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 10 }}>
          Ultimo inventario registrato: {dataBreve(dati.ultimoInventario)}. Incassi senza IVA al 10%.
        </div>
      )}
    </div>
  )
}

const stileFreccia = {
  width: 36, height: 36, borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard,
  color: T.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

function titoloSedi(perSede) {
  const conUtile = Object.values(perSede).filter(s => s.conto.utile != null)
  if (conUtile.length >= 2) {
    const migliore = conUtile.reduce((a, b) => ((b.conto.quote.utile ?? -1e9) > (a.conto.quote.utile ?? -1e9) ? b : a))
    return `${migliore.sede.nome} è il negozio che rende di più`
  }
  return 'I negozi uno accanto all\'altro'
}

/** Le sedi sulla stessa scala: utile, incassi, spese. */
function SediAffiancate({ perSede, isMobile }) {
  const voci = Object.values(perSede)
  const max = Math.max(1, ...voci.map(s => Math.max(s.conto.ricavi || 0, s.conto.spese || 0)))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(voci.length, 4)}, minmax(0, 1fr))`, gap: isMobile ? 12 : 18 }}>
      {voci.map(s => {
        const c = s.conto
        return (
          <div key={s.sede.id} style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text, marginBottom: 6 }}>{s.sede.nome}</div>
            <RigaBarra etichetta={c.stimato ? 'Incassi stimati' : 'Incassi'} valore={c.ricavi} max={max} colore={T.graficoReale} />
            <RigaBarra etichetta="Spese" valore={c.spese} max={max} colore={T.graficoConfronto} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: font.size.base }}>
              <span style={{ color: T.textSoft }}>Utile</span>
              <span style={{ fontWeight: 800, color: c.utile == null ? T.textSoft : c.utile < 0 ? T.red : T.text, fontVariantNumeric: 'tabular-nums' }}>
                {c.utile == null ? 'non lo so' : `${euro(c.utile)} · ${quota(c.quote.utile)}`}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RigaBarra({ etichetta, valore, max, colore }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm, color: T.textSoft, marginBottom: 2 }}>
        <span>{etichetta}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: T.textMid }}>{valore == null ? 'non lo so' : euro(valore)}</span>
      </div>
      <div style={{ height: 10, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
        {valore != null && <div style={{ width: `${Math.max(0, Math.min(100, (valore / max) * 100))}%`, height: '100%', background: colore, borderRadius: '0 4px 4px 0' }} />}
      </div>
    </div>
  )
}

/** Gli ultimi 12 mesi: incassi e spese affiancati, sulla stessa scala. */
function UltimiMesi({ andamento = [], isMobile, meseScelto, onScegli }) {
  const [tabella, setTabella] = useState(false)
  const mesi = andamento.filter(Boolean)
  const max = Math.max(1, ...mesi.map(m => Math.max(m.conto.ricavi || 0, m.conto.spese || 0)))
  const conUtile = mesi.filter(m => m.conto.utile != null)
  const inUtile = conUtile.filter(m => m.conto.utile >= 0).length
  const titolo = conUtile.length
    ? `In utile ${inUtile} mesi su ${conUtile.length} con tutti i dati`
    : 'Incassi e spese degli ultimi dodici mesi'
  const altezza = isMobile ? 120 : 160
  return (
    <>
      <TitoloGrafico titolo={titolo}
        sottotitolo="Colonna scura: incassi (tratteggiata se stimati). Colonna chiara: spese. Tocca un mese per aprirlo."
        destra={(
          <div style={{ display: 'flex', gap: 10, fontSize: font.size.sm, color: T.textSoft, flexShrink: 0 }} aria-hidden="true">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: T.graficoReale }} />Incassi</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: T.graficoConfronto }} />Spese</span>
          </div>
        )} />
      <div style={{ overflowX: 'auto' }}>
        <div role="list" style={{ display: 'grid', gridTemplateColumns: `repeat(${mesi.length}, minmax(${isMobile ? 26 : 40}px, 1fr))`, gap: isMobile ? 4 : 8, alignItems: 'end', minWidth: isMobile ? 360 : 0 }}>
          {mesi.map(m => {
            const c = m.conto
            const h = (v) => (v == null ? 0 : Math.max(2, (v / max) * altezza))
            const scelto = m.mese === meseScelto
            return (
              <button key={m.mese} type="button" role="listitem" onClick={() => onScegli(m.mese)}
                aria-label={`${nomeMese(m.mese)}: incassi ${c.ricavi == null ? 'non noti' : euro(c.ricavi)}, spese ${c.spese == null ? 'non note' : euro(c.spese)}, utile ${c.utile == null ? 'non noto' : euro(c.utile)}`}
                title={`${nomeMese(m.mese)} · incassi ${c.ricavi == null ? '—' : euro(c.ricavi)} · spese ${c.spese == null ? '—' : euro(c.spese)} · utile ${c.utile == null ? '—' : euro(c.utile)}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0', border: 'none', borderRadius: 6, background: scelto ? T.bgSubtle : 'transparent', cursor: 'pointer', font: 'inherit' }}>
                <div style={{ height: altezza, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ width: isMobile ? 8 : 12, height: h(c.ricavi), background: c.stimato ? 'transparent' : T.graficoReale, border: c.stimato && c.ricavi != null ? `2px dashed ${T.graficoReale}` : 'none', boxSizing: 'border-box', borderRadius: '4px 4px 0 0' }} />
                  <span style={{ width: isMobile ? 8 : 12, height: h(c.spese), background: T.graficoConfronto, borderRadius: '4px 4px 0 0' }} />
                </div>
                <span style={{ fontSize: font.size.sm, color: scelto ? T.text : T.textSoft, fontWeight: scelto ? 700 : 500 }}>{nomeMese(m.mese, { anno: false }).slice(0, 3)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <button type="button" onClick={() => setTabella(t => !t)} aria-expanded={tabella}
        style={{ marginTop: 8, border: 'none', background: 'transparent', color: T.textSoft, fontSize: font.size.sm, fontWeight: 600, cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit', minHeight: 32 }}>
        {tabella ? 'Nascondi i numeri' : 'Vedi i numeri in tabella'}
      </button>
      {tabella && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.base, minWidth: 420 }}>
            <thead>
              <tr style={{ color: T.textSoft, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px', fontWeight: 600 }}>Mese</th>
                <th style={{ padding: '6px 4px', fontWeight: 600 }}>Incassi</th>
                <th style={{ padding: '6px 4px', fontWeight: 600 }}>Spese</th>
                <th style={{ padding: '6px 4px', fontWeight: 600 }}>Utile</th>
              </tr>
            </thead>
            <tbody>
              {mesi.map(m => (
                <tr key={m.mese} style={{ borderTop: `1px solid ${T.borderSoft}`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <td style={{ textAlign: 'left', padding: '6px 4px', color: T.text }}>{nomeMese(m.mese)}</td>
                  <td style={{ padding: '6px 4px' }}>{m.conto.ricavi == null ? '—' : `${euro(m.conto.ricavi)}${m.conto.stimato ? ' *' : ''}`}</td>
                  <td style={{ padding: '6px 4px' }}>{m.conto.spese == null ? '—' : euro(m.conto.spese)}</td>
                  <td style={{ padding: '6px 4px', fontWeight: 700, color: m.conto.utile < 0 ? T.red : T.text }}>{m.conto.utile == null ? '—' : euro(m.conto.utile)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 4 }}>* incassi stimati dall&apos;inventario</div>
        </div>
      )}
    </>
  )
}
