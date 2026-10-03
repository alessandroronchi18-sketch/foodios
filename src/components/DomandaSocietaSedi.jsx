// ── «Fatture intestate a … : a quali sedi vanno?» ──────────────────────
//
// La domanda che si fa UNA volta per ogni società mai vista, durante un
// caricamento di fatture elettroniche. La regola sta in
// `src/lib/societaSedi.js`; qui solo la finestra. Si usa dallo Scadenzario e
// da Integrazioni con lo stesso aggancio:
//
//   const [chiediSedi, dialogoSedi] = useDomandaSedi(sedi)
//   importaFattureXml(supabase, { …, chiediSedi: (d) => chiediSedi(d, { preselezione }) })
//   return <>{…}{dialogoSedi}</>
//
// Per una società con la P.IVA nessuna sede è già scelta: il danno del
// 17/09/2026 (3.104 fatture su Carlina «perché era la sede attiva») è nato
// proprio da una scelta fatta senza che nessuno la facesse. Per le fatture
// senza P.IVA di chi le riceve si parte dalla sede attiva, come prima.
import React, { useState, useEffect, useCallback, useRef } from 'react'
import Icon from './Icon'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, font } from '../lib/theme'

const n0 = (v) => Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always' })
const dataIt = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')

/**
 * @param {{id: string, nome: string}[]} sedi
 * @returns {[ (domande: object[], opz?: { preselezione?: string[] }) => Promise<object|null>, React.ReactNode ]}
 */
export function useDomandaSedi(sedi) {
  const [stato, setStato] = useState(null) // { domande, scelte }
  const risolvi = useRef(null)

  // Se la pagina si chiude con la domanda aperta, l'import non resta appeso:
  // vale come «Annulla», e non si scrive niente.
  useEffect(() => () => { risolvi.current?.(null); risolvi.current = null }, [])

  const chiedi = useCallback((domande, { preselezione = [] } = {}) => new Promise(resolve => {
    risolvi.current?.(null)
    risolvi.current = resolve
    const scelte = {}
    for (const d of domande) scelte[d.chiave] = d.piva ? [] : preselezione.filter(Boolean)
    setStato({ domande, scelte })
  }), [])

  const chiudi = useCallback((risposte) => {
    const r = risolvi.current
    risolvi.current = null
    setStato(null)
    r?.(risposte)
  }, [])

  const dialogo = stato ? (
    <DomandaSocietaSedi
      domande={stato.domande} sedi={sedi || []} scelte={stato.scelte}
      onCambia={(chiave, ids) => setStato(s => ({ ...s, scelte: { ...s.scelte, [chiave]: ids } }))}
      onConferma={() => chiudi(stato.scelte)}
      onAnnulla={() => chiudi(null)} />
  ) : null

  return [chiedi, dialogo]
}

export default function DomandaSocietaSedi({ domande, sedi, scelte, onCambia, onConferma, onAnnulla }) {
  const isMobile = useIsMobile()
  useEffect(() => {
    const suTasto = e => { if (e.key === 'Escape') onAnnulla?.() }
    document.addEventListener('keydown', suTasto)
    return () => document.removeEventListener('keydown', suTasto)
  }, [onAnnulla])

  const conPiva = domande.filter(d => d.piva)
  const manca = conPiva.some(d => !(scelte[d.chiave] || []).length)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <button type="button" onClick={onAnnulla} aria-label="Chiudi senza caricare"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', padding: 0, margin: 0,
          background: T.tooltipBg, opacity: 0.55, cursor: 'default' }} />
      <div role="dialog" aria-modal="true" aria-label="A quali sedi vanno queste fatture?"
        style={{ position: 'relative', background: T.bgCard, borderRadius: R.xl, boxShadow: S.xl,
          width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: isMobile ? '18px 16px 10px' : '22px 24px 12px' }}>
          <div style={{ fontSize: font.size.xl, fontWeight: 800, color: T.text, marginBottom: 6 }}>
            A quali sedi vanno queste fatture?
          </div>
          <div style={{ fontSize: font.size.base, color: T.textSoft, lineHeight: 1.55 }}>
            {conPiva.length
              ? 'Ci sono fatture di una società che non conosco ancora. Rispondi una volta: le prossime vanno da sole.'
              : 'Queste fatture non dicono a quale società sono intestate.'}
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: isMobile ? '4px 16px' : '4px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {domande.map(d => {
            const scelte_ = scelte[d.chiave] || []
            return (
              <div key={d.chiave || 'senza-piva'} style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, padding: 14 }}>
                <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
                  {d.piva ? `Fatture intestate a ${d.nome || 'una società senza nome'}` : `${n0(d.n)} ${d.n === 1 ? 'fattura' : 'fatture'} senza la P.IVA di chi le riceve`}
                </div>
                <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 2, marginBottom: 10, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
                  {[
                    d.piva ? `P.IVA ${d.piva}` : null,
                    d.piva ? `${n0(d.n)} ${d.n === 1 ? 'fattura nuova' : 'fatture nuove'}` : null,
                    d.dal ? (d.dal === d.al ? `del ${dataIt(d.dal)}` : `dal ${dataIt(d.dal)} al ${dataIt(d.al)}`) : null,
                  ].filter(Boolean).join(' · ')}
                </div>
                <SceltaSedi sedi={sedi} scelte={scelte_} onCambia={ids => onCambia(d.chiave, ids)} />
                {scelte_.length > 1 && (
                  <div style={{ fontSize: font.size.sm, color: T.textMid, marginTop: 8, lineHeight: 1.5 }}>
                    Spesa di {scelte_.length} negozi insieme: si divide in base ai chili prodotti.
                  </div>
                )}
                {!d.piva && (
                  <div style={{ fontSize: font.size.sm, color: scelte_.length ? T.textSoft : T.amberDark, marginTop: 8, lineHeight: 1.5 }}>
                    {scelte_.length
                      ? 'Vale solo per questo caricamento.'
                      : 'Senza negozio restano dell’azienda, e non compaiono nelle pagine per sede.'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding: isMobile ? '12px 16px 16px' : '14px 24px 20px', borderTop: `1px solid ${T.borderSoft}`, marginTop: 12 }}>
          {conPiva.length > 0 && (
            <div style={{ fontSize: font.size.sm, color: T.textSoft, marginBottom: 12, lineHeight: 1.5 }}>
              La scelta resta salvata. Si cambia da Impostazioni → Società.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={onAnnulla}
              style={{ minHeight: 44, padding: '0 18px', borderRadius: R.md, border: `1px solid ${T.borderStr}`,
                background: T.bgCard, color: T.text, fontWeight: 700, fontSize: font.size.base, cursor: 'pointer', flex: isMobile ? '1 1 auto' : '0 0 auto' }}>
              Annulla
            </button>
            <button type="button" onClick={onConferma} disabled={manca}
              title={manca ? 'Scegli almeno una sede per ogni società' : undefined}
              style={{ minHeight: 44, padding: '0 22px', borderRadius: R.md, border: 'none',
                background: manca ? T.borderStr : T.brand, color: T.white, fontWeight: 800, fontSize: font.size.base,
                cursor: manca ? 'not-allowed' : 'pointer', flex: isMobile ? '1 1 auto' : '0 0 auto' }}>
              Carica le fatture
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** I negozi come caselle da spuntare. Usata anche da Impostazioni → Società. */
export function SceltaSedi({ sedi, scelte, onCambia, disabilitato = false, minimo = 0 }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {(sedi || []).map(sd => {
        const scelta = scelte.includes(sd.id)
        const bloccata = disabilitato || (scelta && scelte.length <= minimo)
        return (
          <button key={sd.id} type="button" aria-pressed={scelta} disabled={bloccata}
            title={scelta && scelte.length <= minimo ? 'Serve almeno una sede' : undefined}
            onClick={() => onCambia(scelta ? scelte.filter(x => x !== sd.id) : [...scelte, sd.id])}
            style={{ minHeight: 40, padding: '8px 12px', borderRadius: R.md,
              cursor: bloccata ? 'not-allowed' : 'pointer', fontSize: font.size.md, fontWeight: scelta ? 700 : 500,
              border: `2px solid ${scelta ? T.brand : T.border}`, background: scelta ? T.brandLight : T.bgCard,
              color: T.text, display: 'inline-flex', alignItems: 'center', gap: 8, opacity: disabilitato ? 0.6 : 1 }}>
            <span style={{ width: 18, height: 18, borderRadius: R.xs, flexShrink: 0,
              border: `2px solid ${scelta ? T.brand : T.borderStr}`, background: scelta ? T.brand : 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {scelta && <Icon name="check" size={12} color={T.white} />}
            </span>
            {sd.nome}
          </button>
        )
      })}
    </div>
  )
}
