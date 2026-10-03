// ── Una quota contro il suo obiettivo ───────────────────────────────────
//
// ANALISI_DESIGN.md, regola 7: niente semafori e niente tachimetri. Una barra
// sola (il «bullet chart» di Stephen Few), la tacca dell'obiettivo, due fasce
// di grigio per «bene» e «da guardare», e lo stato scritto a parole.
import React from 'react'
import { color as T, font, typo, radius as R } from '../../lib/theme'
import { quota, punti } from '../../lib/formatoAnalisi'

/**
 * @param {object} p
 * @param {string} p.etichetta  «Food cost»
 * @param {number|null} p.valore  in %
 * @param {number} p.obiettivo  in %
 * @param {number} [p.attenzione]  oltre questa quota è «troppo» (default +20%)
 * @param {number} [p.massimo]  fondo scala
 * @param {boolean} [p.piuEMeglio=false]  per i costi `false`
 * @param {string} [p.motivoMancante]
 * @param {string} [p.nota]  riga sotto (es. «obiettivo indicativo di settore»)
 */
export default function BarraObiettivo({
  etichetta, valore, obiettivo, attenzione = null, massimo = null, piuEMeglio = false,
  motivoMancante = 'non lo so ancora', nota = '',
}) {
  const manca = valore == null || !Number.isFinite(Number(valore))
  const v = manca ? null : Number(valore)
  const att = attenzione ?? obiettivo * 1.2
  const max = massimo ?? Math.max(att * 1.35, manca ? 0 : v * 1.1, obiettivo * 1.5)
  const pos = (x) => Math.max(0, Math.min(100, (x / max) * 100))
  const delta = manca ? null : v - obiettivo
  const bene = manca ? null : (piuEMeglio ? v >= obiettivo : v <= obiettivo)
  const stato = manca ? motivoMancante
    : Math.abs(delta) < 0.5 ? 'in linea con l\'obiettivo'
      : `${punti(Math.abs(delta))?.replace(/^\+/, '')} ${delta > 0 ? 'sopra' : 'sotto'} l'obiettivo`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ ...typo.overline, color: T.textSoft }}>{etichetta}</span>
        <span style={{ fontSize: font.size.xl, fontWeight: 800, color: manca ? T.textSoft : T.text, fontVariantNumeric: 'tabular-nums' }}>
          {manca ? '—' : quota(v)}
        </span>
      </div>
      <div role="img" aria-label={`${etichetta}: ${manca ? motivoMancante : quota(v)}, obiettivo ${quota(obiettivo)}`}
        style={{ position: 'relative', height: 14, borderRadius: R.xs, overflow: 'hidden', background: T.bgMuted }}>
        {/* Fasce: la zona «bene» chiara, quella «da guardare» un passo più scura. */}
        {piuEMeglio ? (
          <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos(obiettivo)}%`, right: 0, background: T.bgSubtle }} />
        ) : (
          <>
            <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pos(obiettivo)}%`, background: T.bgSubtle }} />
            <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos(obiettivo)}%`, width: `${pos(att) - pos(obiettivo)}%`, background: T.borderSoft }} />
          </>
        )}
        {!manca && <span style={{ position: 'absolute', top: 3, bottom: 3, left: 0, width: `${pos(v)}%`, background: T.graficoReale, borderRadius: '0 4px 4px 0' }} />}
        <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos(obiettivo)}%`, width: 2, marginLeft: -1, background: T.graficoObiettivo }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: font.size.sm, lineHeight: 1.4 }}>
        <span style={{ color: manca ? T.textSoft : bene ? T.green : T.red, fontWeight: 600 }}>{stato}</span>
        <span style={{ color: T.textSoft, whiteSpace: 'nowrap' }}>obiettivo {quota(obiettivo)}</span>
      </div>
      {nota && <div style={{ fontSize: font.size.sm, color: T.textSoft }}>{nota}</div>}
    </div>
  )
}
