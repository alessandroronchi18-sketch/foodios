// Checklist "Primi passi" — accelera l'onboarding mostrando in dashboard
// home un widget con i 6 task chiave che il nuovo utente dovrebbe completare
// nei primi 7 giorni. Progress bar + dismiss permanente quando finito.
//
// Stato salvato in user_data sotto chiave 'primi-passi-v1':
//   { dismissed: bool, completati: { [task_id]: ISO_date } }
//
// I check sono DERIVATI dai dati reali (no chiamata extra al DB):
//   - ricettario_ok = ricettario ha >= 3 ricette
//   - produzione_ok = produzione esiste (giornaliero non vuoto)
//   - chiusura_ok = chiusure ha >= 1 elemento
//   - magazzino_ok = magazzino ha >= 5 ingredienti
//   - sede2_ok = sedi.length >= 2 (OPZIONALE)
//   - import_cassa_ok = cassaImport presente in chiusure
//
// Layout: card compatta con header "Primi passi (4/6)" + collapsible lista.

import React, { useEffect, useState, useMemo } from 'react'
import { sload, ssave } from '../lib/storage'
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from './Icon'

const SK_PRIMI_PASSI = 'primi-passi-v1'

const TASKS = [
  {
    id: 'ricettario',
    label: 'Importa o crea le tue prime ricette',
    hint: 'Almeno 3 ricette → ti calcoliamo il food cost reale',
    view: 'ricettario',
    check: ({ ricettario }) => {
      const ric = ricettario?.ricette || {}
      return Object.keys(ric).length >= 3
    },
  },
  {
    id: 'magazzino',
    label: 'Imposta giacenze magazzino',
    hint: 'Almeno 5 ingredienti con quantità reali',
    view: 'magazzino',
    check: ({ magazzino }) => Object.keys(magazzino || {}).length >= 5,
  },
  {
    id: 'produzione',
    label: 'Registra la prima produzione',
    hint: 'Anche solo 1 giorno → vedi come scala il magazzino',
    view: 'produzione',
    check: ({ giornaliero }) => {
      const arr = Array.isArray(giornaliero) ? giornaliero : Object.values(giornaliero || {})
      return arr.length > 0
    },
  },
  {
    id: 'chiusura',
    label: 'Registra la prima chiusura cassa',
    hint: 'Ti calcoliamo margine, food cost effettivo, drift',
    view: 'chiusura',
    check: ({ chiusure }) => Array.isArray(chiusure) && chiusure.length > 0,
  },
  {
    id: 'cassa_import',
    label: 'Importa un file scontrini (CSV/foto OCR)',
    hint: 'Confronta vendite reali vs produzione → trovi le perdite',
    view: 'chiusura',
    check: ({ chiusure }) => Array.isArray(chiusure)
      && chiusure.some(c => Array.isArray(c?.cassaImport) && c.cassaImport.length > 0),
  },
  {
    id: 'pl',
    label: 'Apri il tuo primo P&L mensile',
    hint: 'Vedi margine reale dopo costi azienda + personale',
    view: 'pl',
    check: ({ chiusure }) => Array.isArray(chiusure) && chiusure.length >= 3,
  },
]

export default function PrimiPassi({ orgId, sedeId, ricettario, magazzino, giornaliero, chiusure, onNavigate }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [state, setState] = useState({ dismissed: false, completati: {} })
  // Audit 2026-06-24: default collassato. L'utente atterra sulla home
  // e vede solo l'header con progress bar — cliccando si espande.
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    sload(SK_PRIMI_PASSI, orgId, null).then(v => {
      if (!alive) return
      if (v && typeof v === 'object') setState({ dismissed: !!v.dismissed, completati: v.completati || {} })
      setLoaded(true)
    })
    return () => { alive = false }
  }, [orgId])

  // Calcola completati DAL VIVO dai dati reali. Persisti la data del primo
  // completamento per i task (così lo storico resta anche se i dati cambiano).
  const checks = useMemo(() => {
    const dataCtx = { ricettario, magazzino, giornaliero, chiusure }
    return TASKS.map(t => ({ ...t, done: t.check(dataCtx) }))
  }, [ricettario, magazzino, giornaliero, chiusure])

  // Sync: aggiorna user_data quando un task passa da non-done a done.
  useEffect(() => {
    if (!orgId || !loaded) return
    const updated = { ...state.completati }
    let dirty = false
    for (const t of checks) {
      if (t.done && !updated[t.id]) {
        updated[t.id] = new Date().toISOString()
        dirty = true
      }
    }
    if (dirty) {
      const next = { dismissed: state.dismissed, completati: updated }
      setState(next)
      ssave(SK_PRIMI_PASSI, next, orgId, null).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, loaded])

  const completati = checks.filter(t => t.done).length
  const totale = checks.length
  const pct = totale > 0 ? Math.round((completati / totale) * 100) : 0
  const allDone = completati === totale

  async function dismiss() {
    const next = { dismissed: true, completati: state.completati }
    setState(next)
    try { await ssave(SK_PRIMI_PASSI, next, orgId, null) } catch {}
  }

  if (!loaded || state.dismissed) return null
  // Auto-hide se tutto fatto da > 24h (post celebration UX).
  if (allDone) {
    const dates = Object.values(state.completati)
    const last = dates.length ? Math.max(...dates.map(d => new Date(d).getTime())) : Date.now()
    const ageMs = Date.now() - last
    if (ageMs > 24 * 3600 * 1000) return null
  }

  const BRAND = T.brand || '#6E0E1A'
  const GREEN = T.green || '#16A34A'
  const SOFT = T.textSoft || '#8B95A7'
  const TXT = T.text || '#0E1726'
  const BORDER = T.border || '#E5E9EF'

  return (
    <div role="region" aria-label="Primi passi"
      style={{
        background: '#FFF', border: `1px solid ${BORDER}`,
        borderRadius: 14, marginBottom: 16,
        overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}
    >
      <button onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={allDone ? 'Primi passi completati' : `Primi passi: ${completati} di ${totale} completati`}
        style={{
          width: '100%', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: isMobile ? '16px 16px' : '14px 18px',
          minHeight: isMobile ? 64 : isTablet ? 60 : 'auto',
          display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 14,
        }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: allDone ? GREEN : '#FEF3C7',
          color: allDone ? '#FFF' : '#92400E',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={allDone ? 'check' : 'sparkles'} size={18}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 800, color: TXT, marginBottom: 4,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {allDone ? 'Hai completato i Primi passi!' : `Primi passi · ${completati}/${totale} completati`}
            </span>
            {!open && !allDone && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: SOFT, letterSpacing: '0.04em',
                background: '#F8FAFC', border: `1px solid ${BORDER}`,
                padding: '2px 7px', borderRadius: 999, flexShrink: 0,
              }}>tocca per aprire</span>
            )}
          </div>
          <div style={{
            height: 6, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: allDone ? GREEN : BRAND,
              transition: 'width 0.4s ease',
            }}/>
          </div>
        </div>
        <Icon name={open ? 'chevU' : 'chevD'} size={14} color={SOFT}/>
      </button>

      {open && (
        <div style={{ padding: isMobile ? '4px 14px 14px' : '4px 18px 16px', borderTop: `1px solid ${BORDER}` }}>
          {checks.map(t => (
            <div key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12,
                padding: isMobile ? '12px 0' : '10px 0',
                minHeight: isMobile ? 56 : isTablet ? 52 : 48,
                borderBottom: `1px solid #F8FAFC`,
              }}
            >
              <div style={{
                width: isMobile ? 24 : 22, height: isMobile ? 24 : 22, borderRadius: '50%',
                background: t.done ? GREEN : 'transparent',
                border: `2px solid ${t.done ? GREEN : '#CBD5E1'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FFF', fontSize: 13, fontWeight: 800, flexShrink: 0,
              }}>{t.done ? <Icon name="check" size={13} color="#FFF"/> : null}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: isMobile ? 14 : 13, fontWeight: 600,
                  color: t.done ? SOFT : TXT,
                  textDecoration: t.done ? 'line-through' : 'none',
                  lineHeight: 1.35,
                }}>{t.label}</div>
                <div style={{ fontSize: isMobile ? 12 : 11.5, color: SOFT, marginTop: 2, lineHeight: 1.4 }}>{t.hint}</div>
              </div>
              {!t.done && onNavigate && (
                <button onClick={() => onNavigate(t.view)}
                  aria-label={`Apri ${t.label}`}
                  style={{
                    background: '#F8FAFC', color: BRAND,
                    border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: isMobile ? '10px 16px' : isTablet ? '9px 14px' : '6px 12px',
                    minHeight: isMobile ? 40 : isTablet ? 44 : 'auto',
                    minWidth: isMobile ? 56 : 'auto',
                    fontSize: isMobile ? 13 : 12, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                  Vai
                </button>
              )}
            </div>
          ))}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 12, marginTop: 4, gap: 8, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: isMobile ? 12 : 11, color: SOFT }}>
              {allDone ? 'Sparisce automaticamente.' : 'Nascondi questo widget'}
            </div>
            <button onClick={dismiss}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: SOFT, fontSize: isMobile ? 12 : 11, fontWeight: 600,
                padding: isMobile ? '8px 6px' : 0, minHeight: isMobile ? 36 : 'auto',
              }}>
              Non mostrare più
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
