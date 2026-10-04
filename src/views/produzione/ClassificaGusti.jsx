// ── Quali gusti vendo di più ──────────────────────────────────────────────
//
// Ricerca del 04/10/2026, scelta 13 (Vercel, FT, Apple): una classifica è
// un elenco a barre. Nome e valore sulla stessa riga (il nome lungo non ruba
// spazio alla barra, perché sta sopra), sotto una traccia di 8 px a tutta
// larghezza; i primi sette e poi «Altri», in una riga sola. Il gusto di cui
// parla il titolo è l'unica barra scura.
//
// La tabella con tutti i gusti (vetrina, costo, margine) sta dietro un tocco:
// all'arrivo si vedono i numeri, non una tabella di trenta righe.
import React from 'react'
import { color as T, font, tnum, radius as R } from '../../lib/theme'
import { quota } from '../../lib/formatoAnalisi'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import Icon from '../../components/Icon'
import { classificaGusti } from './righeGusti'
import { kgTessera, kgFisso, quotaFissa, intero } from './numeri'

/** «MAROTTO è il più venduto: 1.131 kg, il 9,6%» (dieci parole al massimo). */
export function titoloClassifica(cl) {
  const primo = cl.voci[0]
  if (!primo || cl.totaleKg <= 0) return 'Nessun gusto venduto nel periodo'
  return `${primo.gusto} è il più venduto: ${kgTessera(primo.kg)}, il ${quota(primo.quota)}`
}

export default function ClassificaGusti({ righe = [], aperta = false, onApri, isMobile, stile = null }) {
  const cl = classificaGusti(righe, 7)
  const max = Math.max(1e-9, ...cl.voci.map(v => v.kg))
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloClassifica(cl)}
        sottotitolo={`Chili venduti nel periodo, ${cl.altri ? 'i sette gusti più venduti e tutti gli altri insieme' : 'gusto per gusto'}. La quota è sul venduto di tutti i gusti.`} />
      <ol aria-label="Gusti più venduti" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cl.voci.map((v, i) => (
          <li key={v.gusto} style={{ minWidth: 0 }}>
            <Riga nome={v.gusto} valore={kgFisso(v.kg)} quotaTesto={quotaFissa(v.quota)} />
            <div style={{ height: 8, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden', marginTop: 4 }} aria-hidden="true">
              <div style={{ width: `${Math.max(0, Math.min(100, (v.kg / max) * 100))}%`, height: '100%', background: i === 0 ? T.graficoReale : T.graficoConfronto, borderRadius: 4 }} />
            </div>
          </li>
        ))}
        {cl.altri && (
          <li style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 10 }}>
            <Riga nome={`Altri ${intero(cl.altri.n)} gusti`} valore={kgFisso(cl.altri.kg)} quotaTesto={quotaFissa(cl.altri.quota)} tenue />
          </li>
        )}
      </ol>
      {onApri && (
        <button type="button" onClick={onApri} aria-expanded={aperta}
          style={{
            marginTop: 16, minHeight: 44, padding: '8px 14px', borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${T.border}`, background: T.bgCard, color: T.brand, fontSize: font.size.base, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          {aperta ? 'Nascondi la tabella dei gusti' : `${righe.length === 1 ? 'Vedi la tabella del gusto' : `Vedi tutti i ${intero(righe.length)} gusti`}: vetrina, costo, margine`}
          <Icon name={aperta ? 'chevUp' : 'chevDown'} size={12} />
        </button>
      )}
    </Riquadro>
  )
}

function Riga({ nome, valore, quotaTesto, tenue = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: font.size.base, lineHeight: '20px' }}>
      <span style={{ color: tenue ? T.textMid : T.text, fontWeight: tenue ? 500 : 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
      <span style={{ ...tnum, whiteSpace: 'nowrap', color: T.text }}>
        <b style={{ fontWeight: 700 }}>{valore}</b>
        <span style={{ color: T.textSoft, display: 'inline-block', minWidth: 52, textAlign: 'right' }}>{quotaTesto || ''}</span>
      </span>
    </div>
  )
}
