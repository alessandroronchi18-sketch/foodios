// ── La settimana sede per sede ────────────────────────────────────────────
//
// Prima: una tabella con le intestazioni maiuscole «RETAIL KG · B2B KG ·
// ATTESO · RICAVI B2B», due colonne di zeri (Mara non vende all'ingrosso) e
// l'atteso in bordeaux, che in Foodos è il colore delle azioni. Al telefono
// quattro righe maiuscole per sede.
//
// Adesso un elenco a barre, come le classifiche (ricerca del 04/10, scelta
// 13): nome, chili usciti e incasso stimato su una riga, sotto la barra sulla
// stessa scala. L'ingrosso compare solo se c'è. La cassa non si separa per
// sede (le chiusure arrivano già sommate): lo si dice.
import React from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { euro, quota } from '../../lib/formatoAnalisi'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { kgFisso } from '../produzione/numeri'

const kgBanco = (k) => k.retailKg ?? k.totVendutoKg ?? 0

/** «Carlina: il 45,3% del gelato uscito» (dieci parole al massimo). */
export function titoloSediSettimana(perSede = []) {
  const tot = perSede.reduce((s, x) => s + Math.max(0, kgBanco(x.kpi)), 0)
  if (perSede.length < 2 || tot <= 0) return 'La settimana sede per sede'
  const top = perSede.reduce((x, y) => (kgBanco(y.kpi) > kgBanco(x.kpi) ? y : x))
  return `${top.sede.nome}: il ${quota((kgBanco(top.kpi) / tot) * 100)} del gelato uscito`
}

export default function SediSettimana({ perSede = [], isMobile, stile = null }) {
  if (!perSede.length) return null
  const ordinate = [...perSede].sort((a, b) => kgBanco(b.kpi) - kgBanco(a.kpi))
  const max = Math.max(1e-9, ...ordinate.map(x => kgBanco(x.kpi)))
  const conIngrosso = ordinate.some(x => (x.kpi.b2bKg || 0) > 0)
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloSediSettimana(perSede)}
        sottotitolo={`Dettaglio per sede: il gelato uscito al banco e l'incasso stimato${conIngrosso ? ', e l\'ingrosso a parte' : ''}. La cassa arriva già sommata e non si separa per sede.`} />
      <ol aria-label="Sedi" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ordinate.map((x, i) => (
          <li key={x.sede.id} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: font.size.base, lineHeight: '20px' }}>
              <span style={{ color: T.text, fontWeight: 700 }}>{x.sede.nome}</span>
              <span style={{ ...tnum, whiteSpace: 'nowrap', color: T.text }}>
                <b>{kgFisso(kgBanco(x.kpi))}</b>
                <span style={{ color: T.textSoft, display: 'inline-block', minWidth: 84, textAlign: 'right' }}>{x.kpi.ricavoAtteso != null ? euro(x.kpi.ricavoAtteso) : ''}</span>
              </span>
            </div>
            <div style={{ height: 8, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden', marginTop: 4 }} aria-hidden="true">
              <div style={{ width: `${Math.max(0, Math.min(100, (kgBanco(x.kpi) / max) * 100))}%`, height: '100%', background: i === 0 ? T.graficoReale : T.graficoConfronto, borderRadius: 4 }} />
            </div>
            {(x.kpi.b2bKg || 0) > 0 && (
              <div style={{ ...tnum, fontSize: font.size.sm, color: T.textSoft, marginTop: 4 }}>
                all&apos;ingrosso {kgFisso(x.kpi.b2bKg)}, {euro(x.kpi.ricaviB2b || 0)} fatturati
              </div>
            )}
          </li>
        ))}
      </ol>
    </Riquadro>
  )
}
