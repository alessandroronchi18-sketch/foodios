import React, { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import Icon from './Icon'

// Bottone "Carica fattura con AI" - modal per upload + preview risultato OCR
// editabile. Quando l'utente conferma, chiama onSave(extracted) col payload
// pulito che il parent puo' inserire in `fatture` table.

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = String(result).split(',')[1] || ''
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function OcrFatturaButton({ orgId, sedeId, onSave, buttonLabel = 'Carica fattura con AI' }) {
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleFile(file) {
    if (!file) return
    if (file.size > 12 * 1024 * 1024) {
      setError('File troppo grande (max 12MB)')
      return
    }
    setOpen(true); setLoading(true); setError(null); setExtracted(null)
    try {
      const b64 = await fileToBase64(file)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta')

      const res = await fetch('/api/ocr-fattura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          image_base64: b64,
          image_media_type: file.type || 'image/jpeg',
          sede_id: sedeId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore OCR')
      setExtracted(json.extracted)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function conferma() {
    if (!extracted) return
    setSaving(true)
    try {
      await onSave?.(extracted)
      setOpen(false); setExtracted(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function close() {
    if (saving || loading) return
    setOpen(false); setExtracted(null); setError(null)
  }

  function upd(k, v) { setExtracted(x => ({ ...x, [k]: v })) }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
      <button onClick={() => inputRef.current?.click()}
        style={{
          background: BRAND, color: '#FFF', border: 'none',
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
        }}>
        <Icon name="sparkles" size={13} /> {buttonLabel}
      </button>

      {open && (
        <div onClick={close} role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: CARD, borderRadius: 14, padding: 22, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.30)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${BRAND}, #4A0612)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
                <Icon name="sparkles" size={15} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.14em', textTransform: 'uppercase' }}>OCR Fattura</div>
                <div style={{ fontSize: 13, color: MID, marginTop: 2 }}>L'AI estrae i campi, tu verifichi e salvi</div>
              </div>
              <button onClick={close} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: SOFT, padding: 4 }}>
                <Icon name="x" size={16} />
              </button>
            </div>

            {loading && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: SOFT, fontSize: 13 }}>
                L'AI sta leggendo la fattura… (10-30 secondi)
              </div>
            )}
            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', color: '#991B1B', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="alertCircle" size={14} /> {error}
              </div>
            )}
            {extracted && !loading && (
              <>
                {extracted.confidence != null && (
                  <div style={{ background: extracted.confidence >= 0.8 ? '#F0FDF4' : '#FEFCE8', border: `1px solid ${extracted.confidence >= 0.8 ? '#86EFAC' : '#FDE68A'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: MID }}>
                    Confidence AI: <strong>{Math.round(extracted.confidence * 100)}%</strong> - verifica sempre i campi prima di salvare.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <Field label="Fornitore" value={extracted.fornitore_nome || ''} onChange={v => upd('fornitore_nome', v)} />
                  <Field label="P.IVA / CF" value={extracted.fornitore_piva || ''} onChange={v => upd('fornitore_piva', v)} />
                  <Field label="N° fattura" value={extracted.numero_fattura || ''} onChange={v => upd('numero_fattura', v)} />
                  <Field label="Categoria" value={extracted.categoria_suggerita || ''} onChange={v => upd('categoria_suggerita', v)} />
                  <Field label="Data emissione" type="date" value={extracted.data_emissione || ''} onChange={v => upd('data_emissione', v)} />
                  <Field label="Data scadenza" type="date" value={extracted.data_scadenza || ''} onChange={v => upd('data_scadenza', v)} />
                  <Field label="Netto €" type="number" value={extracted.importo_netto ?? ''} onChange={v => upd('importo_netto', Number(v) || 0)} />
                  <Field label="IVA €" type="number" value={extracted.importo_iva ?? ''} onChange={v => upd('importo_iva', Number(v) || 0)} />
                  <Field label="Lordo €" type="number" value={extracted.importo_lordo ?? ''} onChange={v => upd('importo_lordo', Number(v) || 0)} highlight />
                </div>

                {Array.isArray(extracted.righe) && extracted.righe.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                      Righe estratte ({extracted.righe.length})
                    </div>
                    <div style={{ background: '#FAFAF6', borderRadius: 8, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
                      {extracted.righe.slice(0, 30).map((r, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: MID, padding: '4px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                          <strong>{r.descrizione}</strong> · {r.quantita} {r.unita} × €{r.prezzo_unit} = €{r.totale_riga}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={close} disabled={saving}
                    style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: MID, padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Annulla
                  </button>
                  <button onClick={conferma} disabled={saving}
                    style={{ background: '#16A34A', color: '#FFF', border: 'none', padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
                    {saving ? 'Salvataggio…' : '✓ Conferma e salva fattura'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, value, onChange, type = 'text', highlight }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${highlight ? BRAND : BORDER}`, fontSize: 13, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box', fontWeight: highlight ? 700 : 500 }}/>
    </div>
  )
}
