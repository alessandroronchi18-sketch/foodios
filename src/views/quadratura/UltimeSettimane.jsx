// ── Le ultime quattro settimane, su un asse solo ──────────────────────────
//
// Prima: una sparkline con due linee normalizzate ognuna sulla sua scala
// (chili in verde, cassa in bordeaux tratteggiato), cioè due assi nascosti:
// due linee che si incrociano non volevano dire niente (ANALISI_DESIGN.md
// §3: «un solo asse sempre»). Senza cassa, una delle due linee era piatta a
// zero.
//
// Adesso una riga per settimana: il venduto come barra (tutte sulla stessa
// scala, la settimana guardata scura e le altre chiare), poi la cassa e la
// differenza a parole. Dove la cassa manca si scrive «non registrata».
import React from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { euro, euroSegno, quota } from '../../lib/formatoAnalisi'
import { dataBreve } from '../../lib/produzioneAnalisi'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { giudizio } from './Risposta'
import { intero } from '../produzione/numeri'

const nKg1 = (n) => new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
const piu = (iso, n) => { const t = new Date(`${iso}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

/** Il titolo, in dieci parole al massimo: quante settimane tornano. */
export function titoloSettimane(settimane = []) {
  const conConto = settimane.filter(s => s.driftEur != null && s.driftPct != null)
  if (!conConto.length) return `In ${intero(settimane.length)} settimane nessuna cassa da confrontare`
  const tornano = conConto.filter(s => Math.abs(s.driftPct) < 5).length
  return `Il conto torna in ${intero(tornano)} ${tornano === 1 ? 'settimana' : 'settimane'} su ${intero(conConto.length)}`
}

export default function UltimeSettimane({ settimane = [], lunediGuardato, isMobile, stile = null }) {
  if (!settimane.length) return null
  const max = Math.max(1e-9, ...settimane.map(s => Math.max(0, s.kg || 0)))
  // Senza cassa in nessuna settimana le colonne della cassa e della
  // differenza sarebbero quattro volte «non registrata» e una colonna vuota
  // (foto del 04/10): lo si dice una volta sola, nel sottotitolo.
  const senzaCassa = settimane.every(s => s.cassa == null)
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloSettimane(settimane)}
        sottotitolo={senzaCassa
          ? 'Le ultime quattro settimane fino a quella che stai guardando: il gelato uscito dall\'inventario. La cassa non è registrata in nessuna.'
          : 'Le ultime quattro settimane fino a quella che stai guardando: il gelato uscito dall\'inventario, la cassa, la differenza.'} />
      <ol aria-label="Ultime quattro settimane" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {settimane.map(s => {
          const scura = s.lunIso === lunediGuardato
          const g = giudizio(s.driftPct)
          return (
            <li key={s.lunIso} style={{ display: 'grid', gridTemplateColumns: isMobile || senzaCassa ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr)', gap: isMobile ? 4 : 16, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.size.base, lineHeight: '20px' }}>
                  <span style={{ color: T.text, fontWeight: scura ? 700 : 500 }}>{dataBreve(s.lunIso)}–{dataBreve(piu(s.lunIso, 6))}</span>
                  <span style={{ ...tnum, color: T.text, fontWeight: 700 }}>{nKg1(s.kg || 0)} kg</span>
                </div>
                <div style={{ height: 8, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden', marginTop: 4 }} aria-hidden="true">
                  <div style={{ width: `${Math.max(0, Math.min(100, ((s.kg || 0) / max) * 100))}%`, height: '100%', background: scura ? T.graficoReale : T.graficoConfronto, borderRadius: 4 }} />
                </div>
              </div>
              {!senzaCassa && (<>
              <div style={{ ...tnum, fontSize: font.size.base, color: s.cassa == null ? T.textSoft : T.text, textAlign: isMobile ? 'left' : 'right' }}>
                {s.cassa == null ? 'cassa non registrata' : `cassa ${euro(s.cassa)}`}
              </div>
              <div style={{ ...tnum, fontSize: font.size.base, color: T.textMid, textAlign: isMobile ? 'left' : 'right' }}>
                {s.driftEur == null ? '' : g ? `${euroSegno(s.driftEur)} · ${g}` : `${euroSegno(s.driftEur)}`}
                {s.driftEur != null && s.driftPct != null && <span style={{ color: T.textSoft }}> ({quota(s.driftPct)})</span>}
              </div>
              </>)}
            </li>
          )
        })}
      </ol>
    </Riquadro>
  )
}
