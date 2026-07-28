// PrezziPerSedeModal — editor unificato dei prezzi per-sede.
//
// Casi d'uso:
//   1) Ricetta stampi/pezzi: mostra tabella sede × prezzo × n° pezzi; le sedi
//      senza override ereditano il valore base (mostrato in placeholder).
//   2) Ricetta "gusto": mostra tabella sede × prezzo/kg (unita fissa 1 kg).
//   3) Formato vendita: mostra tabella sede × prezzoDefault (singolo campo).
//
// Regola di persistenza: valore identico al base ⇒ nessun override salvato
// (evita "override fantasma" e mantiene la sede allineata al base se in
// futuro il base cambia).
//
// Design mobile-first: tabella scrollabile orizzontalmente su schermi piccoli
// (touch target ≥ 44px sui campi numerici).

import React, { useEffect, useMemo, useState } from 'react'
import { useListiniTutteSedi, saveOverrideRicettaSede, saveOverrideFormatoSede } from '../lib/listinoSede'
import { getR } from '../lib/foodcost'
import Icon from './Icon'
import useIsMobile from '../lib/useIsMobile'

const C = {
  bg: '#FFF', text: '#1C0A0A', textMid: '#4B3832', textSoft: '#8B7B78',
  border: '#E8DDD8', brand: '#6E0E1A', brandLight: '#FEF0EE', panel: '#F8F4F2',
  amber: '#F59E0B', amberLight: '#FFFBEB',
}

const fmtInputEuro = (n) => (n == null || Number.isNaN(Number(n)) ? '' : Number(n).toFixed(2))
const parseEuro = (s) => {
  if (s === '' || s == null) return NaN
  const v = Number(String(s).replace(',', '.'))
  return Number.isFinite(v) ? v : NaN
}

/**
 * Props:
 *  - open: bool
 *  - onClose: fn
 *  - orgId, sedi (array — solo attive)
 *  - target: { kind: 'ricetta', ric } | { kind: 'formato', formato }
 *  - notify: fn (msg, isSuccess?)
 *  - onSaved: fn(sedeId) opzionale — chiamata dopo save
 */
export default function PrezziPerSedeModal({ open, onClose, orgId, sedi, target, notify, onSaved }) {
  const isMobile = useIsMobile()
  const sediAttive = useMemo(() => (sedi || []).filter(s => s?.attiva !== false), [sedi])
  const { listini, loading, reload } = useListiniTutteSedi(orgId, sediAttive)

  // Base info (nome + valori default) e struttura form editabile.
  const isRicetta = target?.kind === 'ricetta'
  const isFormato = target?.kind === 'formato'
  const ric = isRicetta ? target?.ric : null
  const formato = isFormato ? target?.formato : null

  const baseReg = useMemo(() => (isRicetta ? getR(ric?.nome, ric) : null), [isRicetta, ric])
  const nomeItem = isRicetta ? (ric?.nome || '') : (formato?.nome || '')
  const isGusto = isRicetta && baseReg?.tipo === 'gusto'
  const basePrezzo = isRicetta ? Number(baseReg?.prezzo) || 0 : (Number(formato?.prezzoDefault) || 0)
  const baseUnita = isRicetta ? (Number(baseReg?.unita) || 1) : null

  // Form state: mappa sedeId → { prezzo, unita? } (stringhe editabili).
  const [form, setForm] = useState({})
  useEffect(() => {
    if (!open) return
    const next = {}
    for (const s of sediAttive) {
      const l = listini[s.id]
      if (isRicetta) {
        const ov = l?.ricette?.[ric?.nome]
        next[s.id] = {
          prezzo: ov?.prezzo != null ? fmtInputEuro(ov.prezzo) : '',
          unita:  ov?.unita  != null ? String(ov.unita)        : '',
        }
      } else if (isFormato) {
        const ov = l?.formati?.[formato?.id]
        next[s.id] = {
          prezzo: ov?.prezzoDefault != null ? fmtInputEuro(ov.prezzoDefault) : '',
        }
      }
    }
    setForm(next)
  }, [open, sediAttive, listini, isRicetta, isFormato, ric?.nome, formato?.id])

  const [saving, setSaving] = useState(false)
  const [errore, setErrore] = useState(null)

  async function handleSalva() {
    setSaving(true); setErrore(null)
    try {
      const ops = []
      for (const s of sediAttive) {
        const v = form[s.id] || {}
        const pStr = String(v.prezzo || '').trim()
        const uStr = String(v.unita  || '').trim()
        const patch = {}
        if (isRicetta) {
          if (pStr !== '') {
            const p = parseEuro(pStr)
            if (!Number.isFinite(p) || p < 0) throw new Error(`Prezzo non valido per ${s.nome}`)
            patch.prezzo = p
          } else if (isRicetta) {
            // stringa vuota ⇒ null esplicito: rimuove l'override sul prezzo
            patch.prezzo = basePrezzo
          }
          if (!isGusto) {
            if (uStr !== '') {
              const u = Number(uStr)
              if (!Number.isFinite(u) || u < 1) throw new Error(`N° pezzi/fette non valido per ${s.nome}`)
              patch.unita = Math.round(u)
            } else {
              patch.unita = baseUnita
            }
          }
          ops.push(saveOverrideRicettaSede({ orgId, sedeId: s.id, nome: ric.nome, patch, ricettaBase: ric }))
        } else if (isFormato) {
          if (pStr !== '') {
            const p = parseEuro(pStr)
            if (!Number.isFinite(p) || p < 0) throw new Error(`Prezzo non valido per ${s.nome}`)
            patch.prezzoDefault = p
          } else {
            patch.prezzoDefault = basePrezzo
          }
          ops.push(saveOverrideFormatoSede({ orgId, sedeId: s.id, formatoId: formato.id, patch, formatoBase: formato }))
        }
      }
      await Promise.all(ops)
      reload()
      notify?.('Prezzi per sede salvati')
      onSaved?.()
      onClose?.()
    } catch (e) {
      setErrore(e.message || 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  function handleResetSede(sedeId) {
    setForm(f => ({ ...f, [sedeId]: isRicetta ? { prezzo: '', unita: '' } : { prezzo: '' } }))
  }

  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="prezzi-sede-title"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose?.() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(28,10,10,0.55)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: C.bg, borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxWidth: 620, width: '100%', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="prezzi-sede-title" style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3, letterSpacing: '-0.01em' }}>Prezzi per sede</div>
            <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.45 }}>
              {isRicetta ? <>Ricetta: <b style={{ color: C.textMid }}>{nomeItem}</b>. Base: {isGusto ? `${fmtInputEuro(basePrezzo)} €/kg` : `${baseUnita} × ${fmtInputEuro(basePrezzo)} €`}</>
                          : <>Formato: <b style={{ color: C.textMid }}>{nomeItem}</b>. Base: {fmtInputEuro(basePrezzo)} €</>}
            </div>
          </div>
          <button onClick={() => !saving && onClose?.()} aria-label="Chiudi" title="Chiudi" disabled={saving}
            style={{ background: 'transparent', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', color: C.textSoft, padding: 4, lineHeight: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: '10px 14px', background: C.amberLight, borderBottom: `1px solid ${C.border}`, fontSize: 11.5, color: '#92400E', lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="bulb" size={13}/>
          <span>Lascia vuoto per <b>ereditare</b> il prezzo base. Se cambi il base in futuro, le sedi senza override si aggiornano da sole.</span>
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: '10px 14px' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 12 }}>Caricamento…</div>
          ) : sediAttive.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 12 }}>Nessuna sede attiva.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isRicetta && !isGusto
                ? (isMobile ? '1fr 90px 78px 32px' : '1fr 130px 100px 40px')
                : (isMobile ? '1fr 110px 32px' : '1fr 150px 40px'),
              gap: 8, alignItems: 'center', minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft }}>Sede</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft, textAlign: 'right' }}>
                {isFormato ? 'Prezzo €' : isGusto ? 'Prezzo €/kg' : 'Prezzo €'}
              </div>
              {isRicetta && !isGusto && (
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.textSoft, textAlign: 'right' }}>N° {baseReg?.tipo === 'fetta' ? 'fette' : 'pz'}</div>
              )}
              <div/>
              {sediAttive.map(s => {
                const v = form[s.id] || {}
                const hasOv = (String(v.prezzo || '').trim() !== '' && parseEuro(v.prezzo) !== basePrezzo)
                            || (isRicetta && !isGusto && String(v.unita || '').trim() !== '' && Number(v.unita) !== baseUnita)
                return (
                  <React.Fragment key={s.id}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.nome}>
                        {s.nome}{s.is_default ? ' *' : ''}
                      </div>
                      {(s.citta || s.indirizzo) && (
                        <div style={{ fontSize: 10.5, color: C.textSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {[s.indirizzo, s.citta].filter(Boolean).join(', ')}
                        </div>
                      )}
                      {hasOv && <div style={{ fontSize: 9.5, color: C.brand, fontWeight: 700, marginTop: 2 }}>Override attivo</div>}
                    </div>
                    <input type="text" inputMode="decimal" value={v.prezzo}
                      onChange={e => setForm(f => ({ ...f, [s.id]: { ...(f[s.id] || {}), prezzo: e.target.value } }))}
                      placeholder={fmtInputEuro(basePrezzo)}
                      style={{ padding: '10px 10px', minHeight: 42, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, textAlign: 'right', color: C.text, background: '#FFF', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
                    {isRicetta && !isGusto && (
                      <input type="text" inputMode="numeric" value={v.unita}
                        onChange={e => setForm(f => ({ ...f, [s.id]: { ...(f[s.id] || {}), unita: e.target.value } }))}
                        placeholder={String(baseUnita)}
                        style={{ padding: '10px 10px', minHeight: 42, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, textAlign: 'right', color: C.text, background: '#FFF', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
                    )}
                    <button type="button" onClick={() => handleResetSede(s.id)} aria-label={`Reset ${s.nome}`} title="Ripristina base"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.textSoft, padding: 6, lineHeight: 0, borderRadius: 6 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
                    </button>
                  </React.Fragment>
                )
              })}
            </div>
          )}
        </div>

        {errore && (
          <div style={{ padding: '8px 14px', background: '#FEE2E2', color: '#991B1B', fontSize: 12, fontWeight: 600, borderTop: `1px solid ${C.border}` }}>
            {errore}
          </div>
        )}

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => !saving && onClose?.()} disabled={saving}
            style={{ padding: '10px 16px', minHeight: 42, background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            Annulla
          </button>
          <button onClick={handleSalva} disabled={saving || loading}
            style={{ padding: '10px 18px', minHeight: 42, background: saving ? '#CBD5E1' : C.brand, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Salvo…' : 'Salva prezzi per sede'}
          </button>
        </div>
      </div>
    </div>
  )
}
