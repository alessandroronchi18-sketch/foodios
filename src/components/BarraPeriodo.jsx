// La barra del periodo: la stessa in tutte le pagine di analisi.
//
// Prima ogni pagina aveva la sua. Il P&L «dal/al» e basta, lo Storico nove
// scorciatoie più il confronto, il Confronto sedi solo settimana/mese.
// Passando da una pagina all'altra si ricominciava da capo, e la stessa
// domanda — «com'è andato settembre?» — andava riposta tre volte in tre modi.
//
// 04/10/2026, il titolare: «i filtri temporali sono tanto voluminosi, con tante
// scritte. Deve esserci un bottone che se clicco si apre e vedo tutto, ma
// appena atterro sulla pagina non devo vedere tutto sto ammasso di cose».
// Aveva ragione con le misure: la barra erano tre righe sempre accese (nove
// scorciatoie, due date, tre confronti) più una frase, prima di un solo
// numero. Ora da chiusa è UNA riga: ‹ il periodo e contro cosa ▾ ›.
//
// - Il pulsante dice lo STATO («1–31 agosto 2026 · contro luglio»), mai
//   «Filtri»: un numero senza il suo periodo è rumore.
// - Le frecce passano al periodo prima o dopo senza aprire niente: è la
//   domanda più frequente («e il mese prima?»).
// - Aperto: sul computer un riquadro sotto il pulsante, sul telefono un
//   foglio che sale dal basso, dove arriva il pollice.
// - Un tocco su una scelta applica e chiude. Solo le date scritte a mano
//   chiedono «Applica»: senza, la pagina ricaricava a ogni cifra, e fra la
//   prima data e la seconda mostrava un periodo che nessuno aveva chiesto.
//
// Il conto sta in `lib/periodoAnalisi.js`; qui c'è solo il disegno.

import React, { useEffect, useId, useRef, useState } from 'react'
import { color as T, font, radius, shadow, space, z } from '../lib/theme'
import {
  SCORCIATOIE, CONFRONTI, finestraScorciatoia, scorciatoiaDi, nomePeriodo,
  finestraConfronto, spostaPeriodo,
} from '../lib/periodoAnalisi'
import Icon from './Icon'

export default function BarraPeriodo({
  from, to, onPeriodo,
  confronto = 'none', onConfronto,
  isMobile = false,
  mostraConfronto = true,
  // Facoltativo. Quando la pagina NON confronta la finestra di calendario
  // (perché i giorni registrati non tornano, o perché ha accorciato il
  // periodo agli ultimi giorni con dati), passa qui quello che confronta
  // davvero: { from, to }, oppure { motivo } se il confronto non si fa.
  // Senza, la barra diceva «confronto con giugno-luglio» mentre i numeri
  // erano confrontati con un'altra cosa, o con niente.
  confrontoEffettivo,
  // Da che lato si apre il riquadro sul computer: 'destra' quando la barra
  // sta in alto a destra nell'intestazione, e aprendosi verso destra
  // uscirebbe dallo schermo.
  lato = 'sinistra',
}) {
  const [aperta, setAperta] = useState(false)
  const [bozza, setBozza] = useState({ from: from || '', to: to || '' })
  const radice = useRef(null)
  const pulsante = useRef(null)
  const idPannello = useId()

  const attiva = scorciatoiaDi(from, to)
  const conf = confrontoEffettivo !== undefined
    ? (confrontoEffettivo?.from && confrontoEffettivo?.to ? confrontoEffettivo : null)
    : finestraConfronto(from, to, confronto)
  const motivo = !conf && mostraConfronto ? confrontoEffettivo?.motivo : null
  const periodo = nomePeriodo(from, to)
  const controQuale = !mostraConfronto ? '' : (conf ? `contro ${nomePeriodo(conf.from, conf.to)}` : (motivo ? 'senza confronto' : ''))
  const prima = spostaPeriodo(from, to, -1)
  const dopo = spostaPeriodo(from, to, 1)
  const bozzaValida = /^\d{4}-\d{2}-\d{2}$/.test(bozza.from) && /^\d{4}-\d{2}-\d{2}$/.test(bozza.to) && bozza.from <= bozza.to
  const bozzaCambiata = bozza.from !== from || bozza.to !== to

  const apri = () => { setBozza({ from: from || '', to: to || '' }); setAperta(true) }
  const chiudi = () => { setAperta(false); pulsante.current?.focus() }
  const applica = (f, t) => { onPeriodo?.(f, t); chiudi() }

  // Si chiude con Esc e toccando fuori. Sul telefono il «fuori» è il velo.
  useEffect(() => {
    if (!aperta) return undefined
    const tasto = (e) => { if (e.key === 'Escape') { setAperta(false); pulsante.current?.focus() } }
    const fuori = (e) => { if (!isMobile && radice.current && !radice.current.contains(e.target)) setAperta(false) }
    document.addEventListener('keydown', tasto)
    document.addEventListener('mousedown', fuori)
    return () => { document.removeEventListener('keydown', tasto); document.removeEventListener('mousedown', fuori) }
  }, [aperta, isMobile])

  // Aperto il pannello, lo stato attivo va sulla scelta accesa (o sulla prima
  // scorciatoia): chi usa la tastiera parte da dove sta, e sul telefono non si
  // apre la tastiera di una data che nessuno ha toccato.
  useEffect(() => {
    if (!aperta) return
    const p = document.getElementById(idPannello)
    const primo = p?.querySelector('[aria-pressed="true"]') || p?.querySelector('[role="group"] button')
    primo?.focus()
  }, [aperta, idPannello])

  // ── La riga chiusa: ‹ periodo ▾ › ───────────────────────────────────────
  // Un solo controllo con un bordo solo: le frecce e il pulsante sono tre
  // parti della stessa cosa, non tre bottoni sparsi.
  const freccia = (attivo) => ({
    width: 44, height: 44, flex: '0 0 auto',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', padding: 0,
    color: attivo ? T.textMid : T.border, cursor: attivo ? 'pointer' : 'default',
  })
  const etichettaPulsante = `Periodo: ${periodo}${controQuale ? `, ${controQuale}` : ''}. Cambia`

  // ── Dentro ──────────────────────────────────────────────────────────────
  const opzione = (acceso) => ({
    minHeight: 44, padding: `0 ${space[2]}px`,
    borderRadius: radius.md,
    border: `1px solid ${acceso ? T.brand : T.border}`,
    background: acceso ? T.brandLight : T.bgCard,
    color: acceso ? T.brand : T.text,
    fontFamily: 'inherit', fontSize: font.size.md, fontWeight: acceso ? 700 : 500,
    cursor: 'pointer', whiteSpace: 'nowrap',
  })
  const griglia = (colonne) => ({ display: 'grid', gridTemplateColumns: `repeat(${colonne}, minmax(0, 1fr))`, gap: space[2] })
  const titoletto = { fontSize: font.size.sm, fontWeight: 600, color: T.textSoft, margin: `0 0 ${space[2]}px` }
  const campoData = {
    width: '100%', minWidth: 0, minHeight: 44, boxSizing: 'border-box',
    padding: `0 ${space[2]}px`, borderRadius: radius.md,
    border: `1px solid ${T.border}`, background: T.bgCard,
    fontFamily: 'inherit', fontSize: font.size.lg, color: T.text,
  }

  const contenuto = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* La riga del titolo rientra di 8 px sopra e sotto e di 13 px a destra:
          la crocetta è alta 44 per il dito, ma l'icona da 18 deve stare sul
          bordo del contenuto come tutto il resto ((44 − 18) / 2 = 13). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: `-${space[2]}px -13px -${space[2]}px 0` }}>
        <span style={{ fontSize: font.size.lg, fontWeight: 700, color: T.text }}>Che periodo guardi?</span>
        <button type="button" onClick={chiudi} aria-label="Chiudi"
          style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: T.textSoft, cursor: 'pointer' }}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div role="group" aria-label="Scorciatoie" style={griglia(isMobile ? 2 : 3)}>
        {SCORCIATOIE.map((s, i) => (
          <button key={s.id} type="button" aria-pressed={attiva === s.id}
            onClick={() => { const f = finestraScorciatoia(s.id); if (f) applica(f.from, f.to); else chiudi() }}
            // Nove scorciatoie in due colonne lasciano l'ultima da sola, e
            // l'occhio la legge come un errore: sul telefono prende la riga.
            style={{ ...opzione(attiva === s.id), gridColumn: isMobile && SCORCIATOIE.length % 2 === 1 && i === SCORCIATOIE.length - 1 ? '1 / -1' : 'auto' }}>
            {s.label}
          </button>
        ))}
      </div>

      <div>
        <p style={titoletto}>Oppure scegli le date</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: space[2] }}>
          <input type="date" value={bozza.from} aria-label="Data di inizio"
            onChange={e => setBozza(b => ({ ...b, from: e.target.value }))} style={campoData} />
          <input type="date" value={bozza.to} aria-label="Data di fine"
            onChange={e => setBozza(b => ({ ...b, to: e.target.value }))} style={campoData} />
          <button type="button" disabled={!bozzaValida || !bozzaCambiata}
            onClick={() => applica(bozza.from, bozza.to)}
            style={{
              gridColumn: isMobile ? '1 / -1' : 'auto',
              minHeight: 44, padding: `0 ${space[4]}px`, borderRadius: radius.md, border: 'none',
              background: bozzaValida && bozzaCambiata ? T.brand : T.border,
              color: bozzaValida && bozzaCambiata ? T.white : T.textSoft,
              fontFamily: 'inherit', fontSize: font.size.md, fontWeight: 700,
              cursor: bozzaValida && bozzaCambiata ? 'pointer' : 'default',
            }}>
            Applica
          </button>
        </div>
        {bozza.from && bozza.to && bozza.from > bozza.to && (
          <p role="alert" style={{ margin: `${space[2]}px 0 0`, fontSize: font.size.sm, color: T.red }}>
            La data di inizio viene dopo quella di fine.
          </p>
        )}
      </div>

      {mostraConfronto && (
        <div>
          <p style={titoletto}>Confronta con</p>
          <div role="group" aria-label="Confronta con" style={griglia(CONFRONTI.length)}>
            {CONFRONTI.map(c => (
              <button key={c.id} type="button" aria-pressed={confronto === c.id}
                onClick={() => { onConfronto?.(c.id); chiudi() }}
                style={opzione(confronto === c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          {/* Contro cosa, a parole. E se il confronto non si fa, il perché:
              altrimenti le frecce sparite dai numeri sembrano un guasto. */}
          <p style={{ margin: `${space[2]}px 0 0`, fontSize: font.size.sm, color: T.textSoft, lineHeight: 1.45 }}>
            {conf
              ? <>Stai confrontando con <b style={{ color: T.text }}>{nomePeriodo(conf.from, conf.to)}</b></>
              : (motivo ? <>Nessun confronto: {motivo}</> : 'Nessun confronto')}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div ref={radice} style={{ position: 'relative', display: isMobile ? 'block' : 'inline-block', maxWidth: '100%', marginBottom: space[4] }}>
      <div style={{
        display: isMobile ? 'flex' : 'inline-flex', alignItems: 'stretch', maxWidth: '100%', boxSizing: 'border-box',
        border: `1px solid ${aperta ? T.brand : T.border}`, borderRadius: radius.lg,
        background: T.bgCard, boxShadow: shadow.xs,
      }}>
        <button type="button" aria-label="Periodo precedente" disabled={!prima}
          onClick={() => prima && onPeriodo?.(prima.from, prima.to)} style={freccia(!!prima)}>
          <Icon name="chevL" size={16} />
        </button>
        <button ref={pulsante} type="button"
          aria-haspopup="dialog" aria-expanded={aperta} aria-controls={idPannello}
          aria-label={etichettaPulsante}
          onClick={() => (aperta ? chiudi() : apri())}
          style={{
            display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0, flex: isMobile ? 1 : '0 1 auto',
            minHeight: 44, padding: `0 ${space[3]}px`, boxSizing: 'border-box',
            // I due divisori, scritti senza mescolare `border` e `borderLeft`:
            // React sconsiglia la miscela (al cambio di stato un lato può
            // sparire) e un righello la traduceva in un colore non valido.
            borderStyle: 'solid', borderColor: T.border, borderWidth: '0 1px',
            background: 'transparent', fontFamily: 'inherit', fontSize: font.size.md, color: T.text,
            cursor: 'pointer', textAlign: 'left',
          }}>
          <Icon name="calendar" size={16} color={T.textSoft} />
          <span style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'baseline', gap: isMobile ? 0 : space[2], flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{periodo || 'Scegli il periodo'}</span>
            {controQuale && (
              <span style={{ fontSize: font.size.sm, color: T.textSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{controQuale}</span>
            )}
          </span>
          <Icon name={aperta ? 'chevUp' : 'chevDown'} size={16} color={T.textSoft} />
        </button>
        <button type="button" aria-label="Periodo successivo" disabled={!dopo}
          onClick={() => dopo && onPeriodo?.(dopo.from, dopo.to)} style={freccia(!!dopo)}>
          <Icon name="chevR" size={16} />
        </button>
      </div>

      {aperta && !isMobile && (
        <div id={idPannello} role="dialog" aria-label="Scegli il periodo"
          style={{
            position: 'absolute', top: `calc(100% + ${space[2]}px)`, [lato === 'destra' ? 'right' : 'left']: 0,
            width: 400, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
            padding: space[4], background: T.bgCard,
            border: `1px solid ${T.border}`, borderRadius: radius.xl, boxShadow: shadow.lg,
            zIndex: z.popover,
          }}>
          {contenuto}
        </div>
      )}

      {aperta && isMobile && (
        <>
          <div onClick={chiudi} aria-hidden="true"
            style={{ position: 'fixed', inset: 0, background: T.velo, zIndex: z.modal }} />
          <div id={idPannello} role="dialog" aria-modal="true" aria-label="Scegli il periodo"
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: z.modal + 1,
              maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box',
              // Il margine in basso a parte: con `env()` dentro la scorciatoia
              // `padding`, chi non capisce `env()` butta via tutti e quattro i
              // lati, e le scelte finivano incollate ai bordi dello schermo.
              padding: `${space[2]}px ${space[4]}px ${space[4]}px`,
              paddingBottom: `calc(${space[4]}px + env(safe-area-inset-bottom))`,
              background: T.bgCard, borderRadius: `${radius['2xl']}px ${radius['2xl']}px 0 0`, boxShadow: shadow.xl,
            }}>
            {/* La maniglia: dice «questo foglio si chiude», come ogni foglio
                che sale dal basso sul telefono. */}
            <div aria-hidden="true" style={{ width: 36, height: 4, borderRadius: radius.full, background: T.border, margin: `0 auto ${space[2]}px` }} />
            {contenuto}
          </div>
        </>
      )}
    </div>
  )
}
