import React, { useEffect, useState } from 'react'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { sload, ssave } from '../lib/storage'
import { supabase } from '../lib/supabase'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'

export const WL_KEY = 'pasticceria-white-label-v1'

const PIANI_CHAIN = new Set(['enterprise', 'chain'])

const lbl  = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }
function mkCard(isMobile) {
  return { background: '#FFF', borderRadius: 12, padding: isMobile ? '18px 16px' : '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 20 }
}
function mkInp(isMobile) {
  return { width: '100%', padding: '12px 14px', minHeight: isMobile ? 44 : 42, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 16, color: '#0F172A', background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }
}

const MAX_LOGO_BYTES = 500_000 // 500 KB inline base64 in JSON

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function isHexColor(v) { return /^#[0-9A-Fa-f]{6}$/.test(v || '') }

export default function WhiteLabel({ orgId, piano, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const card = mkCard(isMobile)
  const inp = mkInp(isMobile)
  const touchH = isTablet ? 44 : isMobile ? 44 : 40
  const confirmDialog = useConfirm()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nomeApp, setNomeApp] = useState('')
  const [colorePrimario, setColorePrimario] = useState('#6E0E1A')
  const [logoData, setLogoData] = useState(null)

  const piaIsChain = PIANI_CHAIN.has((piano || '').toLowerCase())

  useEffect(() => {
    if (!orgId) return
    sload(WL_KEY, orgId, null).then(v => {
      setSettings(v || {})
      setNomeApp(v?.nomeApp || '')
      setColorePrimario(v?.colorePrimario || '#6E0E1A')
      setLogoData(v?.logoDataUrl || null)
      setLoading(false)
    })
  }, [orgId])

  async function upgradeChain() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta. Ricarica la pagina.')
      const r = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ plan: 'chain' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Errore checkout')
      window.location.href = j.url
    } catch (e) {
      notify?.(e.message || 'Errore', false)
    }
  }

  if (!piaIsChain) return (
    <div style={card}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="palette" size={16} />Personalizzazione</div>
      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.6, marginBottom: 14 }}>
        Sì, FoodOS permette di applicare il tuo <strong>logo, il nome dell'app e il colore del brand</strong> all'interfaccia:
        compaiono nella sidebar e nell'intestazione, e il nome custom sostituisce "FoodOS" anche nel titolo del browser.
        È incluso nel piano <strong>Chain</strong> — puoi attivarlo subito senza dover scrivere a nessuno.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <ul style={{ flex: '1 1 240px', margin: 0, padding: '0 0 0 18px', fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
          <li>Logo nella sidebar e nell'intestazione dell'app</li>
          <li>Nome app al posto di "FoodOS" (sidebar + titolo del browser)</li>
          <li>Colore del brand sulla navigazione attiva</li>
          <li>Configurabile da Impostazioni → Personalizzazione</li>
          <li>Attivo per tutti gli utenti della tua organizzazione</li>
        </ul>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={upgradeChain}
          style={{ padding: '10px 22px', minHeight: touchH, background: '#6E0E1A', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
          Passa al piano Chain
        </button>
        <a href="mailto:support@foodios.it?subject=Personalizzazione%20FoodOS"
          style={{ padding: '10px 18px', minHeight: touchH, background: '#FFF', color: '#6E0E1A', border: '1px solid #6E0E1A', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
          Parla con noi prima
        </a>
      </div>
      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 12 }}>
        Pagamento sicuro via Stripe · puoi disdire in qualsiasi momento · fattura automatica via email.
      </div>
    </div>
  )

  async function handleLogo(file) {
    if (!file) return
    if (file.size > MAX_LOGO_BYTES) {
      notify?.(`Logo troppo grande (max ${(MAX_LOGO_BYTES/1024).toFixed(0)} KB)`, false)
      return
    }
    try {
      const dataUrl = await fileToBase64(file)
      setLogoData(dataUrl)
    } catch (e) {
      notify?.('Errore lettura file', false)
    }
  }

  async function salva() {
    setSaving(true)
    try {
      const next = {
        nomeApp: nomeApp.trim() || null,
        colorePrimario: isHexColor(colorePrimario) ? colorePrimario : '#6E0E1A',
        logoDataUrl: logoData || null,
        aggiornato_il: new Date().toISOString(),
      }
      await ssave(WL_KEY, next, orgId, null)
      setSettings(next)
      notify?.('✓ Personalizzazione salvata · ricarica la pagina per applicare ovunque')
    } catch (e) {
      notify?.('Errore salvataggio', false)
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    const ok = await confirmDialog({
      title: 'Ripristinare branding FoodOS?',
      message: 'Logo, nome app e colori personalizzati saranno cancellati. Tornera al brand default.',
      confirmLabel: 'Ripristina', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    setSaving(true)
    try {
      await ssave(WL_KEY, { nomeApp: null, colorePrimario: null, logoDataUrl: null, reset_il: new Date().toISOString() }, orgId, null)
      setNomeApp('')
      setColorePrimario('#6E0E1A')
      setLogoData(null)
      notify?.('✓ Branding ripristinato · ricarica la pagina')
    } catch (e) {
      notify?.('Errore reset', false)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: '#94A3B8', padding: 24 }}>Caricamento…</div>

  return (
    <div>
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="palette" size={16} />Personalizzazione</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 18, lineHeight: 1.6 }}>
          Esclusiva piano Chain. Applica logo, nome app e colore del brand all'interfaccia (sidebar, intestazione, navigazione e titolo del browser) per gli utenti della tua organizzazione.
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Nome app (al posto di "FoodOS")</label>
          <input value={nomeApp} onChange={e => setNomeApp(e.target.value)} placeholder="Es. PasticceriaOS"
            maxLength={32} style={inp} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={lbl}>Colore primario</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="color" value={isHexColor(colorePrimario) ? colorePrimario : '#6E0E1A'}
              onChange={e => setColorePrimario(e.target.value)}
              style={{ width: isMobile ? 56 : 56, height: isMobile ? 44 : 40, border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', padding: 0, flexShrink: 0 }} />
            <input value={colorePrimario} onChange={e => setColorePrimario(e.target.value)} maxLength={7}
              placeholder="#6E0E1A" style={{ ...inp, fontFamily: 'monospace', maxWidth: 160, flex: '1 1 auto' }} />
            <div style={{ width: 36, height: 36, borderRadius: 8, background: isHexColor(colorePrimario) ? colorePrimario : '#6E0E1A', border: '1px solid #E2E8F0', flexShrink: 0 }} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Logo (max 500 KB, PNG/SVG/JPG)</label>
          {logoData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 10, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', marginBottom: 10 }}>
              <img src={logoData} alt="logo" style={{ maxHeight: 56, maxWidth: 120, objectFit: 'contain' }} />
              <button onClick={() => setLogoData(null)}
                style={{ marginLeft: 'auto', padding: '6px 12px', background: '#FFF5F5', color: '#6E0E1A', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Rimuovi
              </button>
            </div>
          )}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: '#FFFBEB', border: '1px dashed #FDE68A', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#92400E' }}>
            <Icon name="upload" size={14} />Carica logo
            <input type="file" accept="image/png,image/svg+xml,image/jpeg" style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && handleLogo(e.target.files[0])} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={salva} disabled={saving}
            style={{ padding: '10px 22px', minHeight: touchH, background: '#6E0E1A', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1, flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            {saving ? '…' : 'Salva personalizzazione'}
          </button>
          <button onClick={reset} disabled={saving}
            style={{ padding: '10px 18px', minHeight: touchH, background: 'transparent', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', flex: isMobile ? '1 1 100%' : '0 0 auto' }}>
            Ripristina default
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 12 }}>Anteprima</div>
        <div style={{ background: '#FAFAFA', borderRadius: 12, padding: 18, border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {logoData ? (
              <img src={logoData} alt="logo" style={{ height: 36, maxWidth: 80, objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 8, background: colorePrimario, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 800, flexShrink: 0 }}>
                {(nomeApp || 'F').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomeApp || 'FoodOS'}</div>
              <div style={{ fontSize: 11, color: '#64748B' }}>Sidebar e topbar useranno questo brand.</div>
            </div>
            <button style={{ marginLeft: isMobile ? 0 : 'auto', padding: '8px 16px', minHeight: touchH, background: colorePrimario, color: '#FFF', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              Bottone primario
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Funzione applicazione runtime (chiamata da App.jsx all'avvio) ──
export async function applyWhiteLabel(orgId) {
  if (!orgId) return null
  try {
    const v = await sload(WL_KEY, orgId, null)
    if (!v) return null
    if (v.colorePrimario && isHexColor(v.colorePrimario)) {
      document.documentElement.style.setProperty('--fos-brand', v.colorePrimario)
    }
    if (v.nomeApp) {
      document.title = `${v.nomeApp} — Dashboard`
    }
    return v
  } catch (e) {
    return null
  }
}
