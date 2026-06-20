// Demo personalizzata: wizard 3 step per popolare un'org di test con i prodotti
// reali di un prospect (pitch-time). Step 1: input foto/testo. Step 2: review
// editabile + salva. Step 3: confirm + populate + impersona.
//
// Pensato per uso PRE-PITCH: il founder carica i dati la sera prima, controlla
// tutto con calma, poi il giorno dopo va dal cliente con tutto già pronto.

import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { compressImageToBase64, extractMenuFromInput, menuToRicettario, normalizeMenu } from '../lib/menuExtractor'

// ─── Palette locale (stesso look di AdminPage) ────────────────────────────
const P = {
  bg: '#FFFFFF', card: '#FFFFFF', border: '#E2E8F0', rowAlt: '#F8FAFC',
  text: '#0F172A', textSoft: '#334155', textMute: '#64748B',
  ok: '#065F46', okBg: '#D1FAE5',
  warn: '#92400E', warnBg: '#FEF3C7',
  err: '#991B1B', errBg: '#FEE2E2',
  blue: '#1D4ED8', blueBg: '#DBEAFE',
  brand: '#6E0E1A', brandSoft: '#FEE2E5',
}

// ─── Bottone stile coerente con AdminPage ────────────────────────────────
function Btn({ children, kind = 'primary', size = 'md', onClick, disabled, style, type = 'button' }) {
  const bg = kind === 'primary' ? P.brand : kind === 'success' ? '#059669' : kind === 'danger' ? '#DC2626' : kind === 'ghost' ? 'transparent' : '#FFFFFF'
  const fg = kind === 'ghost' || kind === 'neutral' ? P.text : '#FFFFFF'
  const border = kind === 'neutral' ? `1px solid ${P.border}` : kind === 'ghost' ? `1px solid ${P.border}` : 'none'
  const pad = size === 'sm' ? '6px 12px' : '10px 18px'
  const fz = size === 'sm' ? 12 : 13
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{
        background: bg, color: fg, border, padding: pad, fontSize: fz, borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'opacity 150ms', ...style,
      }}>{children}</button>
  )
}

// ─── Modal wrapper ────────────────────────────────────────────────────────
function ModalShell({ title, subtitle, onClose, width = 780, children }) {
  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: P.card, borderRadius: 14, width: '100%', maxWidth: width,
        maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${P.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: P.text }}>{title}</h2>
            {subtitle && <div style={{ fontSize: 11, color: P.textMute, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Chiudi modale" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 22, color: P.textMute, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Step indicator (1·2·3) ───────────────────────────────────────────────
function StepIndicator({ current }) {
  const steps = [
    { n: 1, label: 'Input' },
    { n: 2, label: 'Review & Edit' },
    { n: 3, label: 'Conferma' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 99,
            background: current >= s.n ? P.brand : P.border,
            color: current >= s.n ? '#FFF' : P.textMute,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>{s.n}</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: current === s.n ? P.text : P.textMute }}>{s.label}</span>
          {i < steps.length - 1 && <div style={{ width: 18, height: 2, background: P.border, marginLeft: 2 }} />}
        </div>
      ))}
    </div>
  )
}

// ─── Step 1: Input ────────────────────────────────────────────────────────
function Step1Input({ tab, setTab, images, setImages, text, setText, nomeAttivita, setNomeAttivita, citta, setCitta, onExtract, extracting, error }) {
  const [dragOver, setDragOver] = useState(false)

  async function processFiles(files) {
    const remaining = 8 - images.length
    if (remaining <= 0) return
    const ok = []
    for (const f of Array.from(files).slice(0, remaining)) {
      if (!f.type.startsWith('image/')) continue
      try {
        const compressed = await compressImageToBase64(f)
        ok.push({ name: f.name, ...compressed })
      } catch (e) {
        console.error('compress failed:', e.message)
      }
    }
    setImages([...images, ...ok])
  }

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: `1px solid ${P.border}`, paddingBottom: 0 }}>
        <button onClick={() => setTab('foto')} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '8px 12px', fontSize: 13, fontWeight: 700,
          color: tab === 'foto' ? P.brand : P.textMute,
          borderBottom: tab === 'foto' ? `2px solid ${P.brand}` : '2px solid transparent',
          marginBottom: -1,
        }}><Icon name="camera" size={13} /> Foto listino <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>(consigliato)</span></button>
        <button onClick={() => setTab('testo')} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '8px 12px', fontSize: 13, fontWeight: 700,
          color: tab === 'testo' ? P.brand : P.textMute,
          borderBottom: tab === 'testo' ? `2px solid ${P.brand}` : '2px solid transparent',
          marginBottom: -1,
        }}><Icon name="pencil" size={13} /> Testo libero</button>
      </div>

      {/* Tab content: FOTO */}
      {tab === 'foto' && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); processFiles(e.dataTransfer.files) }}
            style={{
              padding: 28, borderRadius: 10,
              border: `2px dashed ${dragOver ? P.brand : P.border}`,
              background: dragOver ? P.brandSoft : P.rowAlt,
              textAlign: 'center', marginBottom: 14,
              transition: 'all 150ms',
            }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 4 }}>
              Trascina qui le foto del listino
            </div>
            <div style={{ fontSize: 11, color: P.textMute, marginBottom: 12 }}>
              o seleziona dal computer (max 8 foto · resize automatico)
            </div>
            <input
              id="demo-files-input"
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => { processFiles(e.target.files); e.target.value = '' }}
            />
            <Btn kind="neutral" size="sm" onClick={() => document.getElementById('demo-files-input')?.click()}>
              Seleziona file
            </Btn>
          </div>
          {/* Preview thumbnails */}
          {images.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: `1px solid ${P.border}` }}>
                  <img src={`data:${img.media_type};base64,${img.base64}`} alt={img.name || `foto-${i}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => setImages(images.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#FFF', border: 'none', borderRadius: 99, width: 18, height: 18, cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>×</button>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#FFF', fontSize: 9, padding: '1px 4px', textAlign: 'center' }}>{img.size_kb}KB</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab content: TESTO */}
      {tab === 'testo' && (
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={'Incolla qui il menu del cliente (anche solo i nomi dei prodotti, prezzi opzionali). Esempi:\n\nTiramisù 4€\nPanna cotta\nCrostata di lamponi\nCookies americani 1.50€\nTorta sacher\n...'}
          rows={10}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${P.border}`, fontSize: 13,
            resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
            background: P.bg, marginBottom: 14,
          }}
        />
      )}

      {/* Campi opzionali nome attività + città */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: P.textMute, fontWeight: 600 }}>Nome attività <span style={{ fontWeight: 400 }}>(opzionale, override DB)</span></span>
          <input value={nomeAttivita} onChange={e => setNomeAttivita(e.target.value)}
            placeholder="es. Gelateria del Centro"
            style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${P.border}`, fontSize: 12 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: P.textMute, fontWeight: 600 }}>Città <span style={{ fontWeight: 400 }}>(opzionale)</span></span>
          <input value={citta} onChange={e => setCitta(e.target.value)}
            placeholder="es. Cuneo"
            style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${P.border}`, fontSize: 12 }} />
        </label>
      </div>

      {/* Disclaimer privacy */}
      <div style={{ fontSize: 10, color: P.textMute, marginBottom: 14, lineHeight: 1.5 }}>
        🔒 Le foto/testo vengono processati da Anthropic Claude per estrarre i prodotti. Anthropic non li conserva oltre 30gg
        e non li usa per training. Niente dati sensibili (PII) — solo nomi e prezzi pubblici del listino.
      </div>

      {error && (
        <div style={{ padding: '10px 12px', background: P.errBg, color: P.err, borderRadius: 8, fontSize: 12, marginBottom: 14, border: `1px solid ${P.err}` }}>
          <Icon name="warning" size={13} /> {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn kind="primary" onClick={onExtract}
          disabled={extracting || (tab === 'foto' ? images.length === 0 : text.trim().length < 5)}>
          {extracting ? <><Icon name="hourglass" size={14} /> Estrazione in corso… (~10s)</> : <><Icon name="sparkles" size={14} /> Estrai prodotti</>}
        </Btn>
      </div>
    </div>
  )
}

// ─── Step 2: Review & Edit ────────────────────────────────────────────────
function Step2Review({ menu, setMenu, onBack, onSave, onCommit, saving, committing, cached, lastSavedAt }) {
  const groupedByCategoria = {}
  menu.prodotti.forEach((p, idx) => {
    const cat = p.categoria || 'Altro'
    if (!groupedByCategoria[cat]) groupedByCategoria[cat] = []
    groupedByCategoria[cat].push({ ...p, _idx: idx })
  })

  const updateProdotto = (idx, patch) => {
    const next = [...menu.prodotti]
    next[idx] = { ...next[idx], ...patch }
    setMenu({ ...menu, prodotti: next })
  }
  const removeProdotto = (idx) => {
    setMenu({ ...menu, prodotti: menu.prodotti.filter((_, i) => i !== idx) })
  }
  const addProdotto = () => {
    setMenu({
      ...menu,
      prodotti: [...menu.prodotti, {
        nome: 'NUOVO PRODOTTO', categoria: 'Altro', tipo: 'pezzo', unita: 1, prezzo: 2.0,
        ingredienti: [
          { nome: 'farina_00', qty1stampo: 100 },
          { nome: 'zucchero', qty1stampo: 50 },
          { nome: 'burro', qty1stampo: 30 },
        ],
      }],
    })
  }

  // Stima food cost medio (semplice: somma costo ingredienti * qty / prezzo)
  // Usa il dizionario STIMA_COSTI per quelli speciali, fallback 0.005 €/g per ignoti
  const FALLBACK = {
    farina_00: 0.00088, zucchero: 0.00098, burro: 0.0072, uova: 0.00095,
    latte: 0.0014, panna: 0.0055, cioccolato_fondente: 0.0125,
    nocciole: 0.021, mascarpone: 0.0089, savoiardi: 0.0058,
    pistacchio_bronte: 0.068, caffe_espresso: 0.015,
  }
  const fcMedio = (() => {
    if (menu.prodotti.length === 0) return 0
    let totFc = 0, totV = 0
    for (const p of menu.prodotti) {
      const fcRicetta = (p.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0) * (FALLBACK[i.nome] ?? 0.005), 0)
      const ricavoStampo = p.prezzo * (p.tipo === 'fetta' ? p.unita : 1)
      if (ricavoStampo > 0) { totFc += fcRicetta; totV += ricavoStampo }
    }
    return totV > 0 ? Math.round(100 * totFc / totV) : 0
  })()

  return (
    <div>
      {cached && (
        <div style={{ padding: '8px 12px', background: P.blueBg, color: P.blue, borderRadius: 8, fontSize: 11, marginBottom: 14, border: `1px solid ${P.blue}` }}>
          <Icon name="check" size={11} /> Caricato menu salvato {lastSavedAt && `(ultima modifica: ${new Date(lastSavedAt).toLocaleString('it-IT')})`}
        </div>
      )}

      {/* KPI riepilogo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 10, background: P.rowAlt, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: P.textMute, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Prodotti</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: P.text }}>{menu.prodotti.length}</div>
        </div>
        <div style={{ padding: 10, background: P.rowAlt, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: P.textMute, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Categorie</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: P.text }}>{Object.keys(groupedByCategoria).length}</div>
        </div>
        <div style={{ padding: 10, background: P.rowAlt, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: P.textMute, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Prezzo medio</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: P.text }}>€{(menu.prodotti.reduce((s, p) => s + p.prezzo, 0) / Math.max(1, menu.prodotti.length)).toFixed(2)}</div>
        </div>
        <div style={{ padding: 10, background: fcMedio > 35 ? P.warnBg : P.okBg, borderRadius: 8 }}>
          <div style={{ fontSize: 9, color: fcMedio > 35 ? P.warn : P.ok, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>FC medio stimato</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: fcMedio > 35 ? P.warn : P.ok }}>{fcMedio}%</div>
        </div>
      </div>

      {(menu.nome_attivita || menu.citta) && (
        <div style={{ fontSize: 11, color: P.textMute, marginBottom: 12 }}>
          {menu.nome_attivita && <><strong style={{ color: P.text }}>{menu.nome_attivita}</strong>{menu.citta && ' · '}</>}
          {menu.citta && menu.citta}
          {menu.tipo_attivita && <> · <em>{menu.tipo_attivita}</em></>}
        </div>
      )}

      {/* Tabella prodotti per categoria */}
      <div style={{ border: `1px solid ${P.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
        {Object.entries(groupedByCategoria).map(([cat, prods]) => (
          <div key={cat}>
            <div style={{ padding: '8px 12px', background: P.rowAlt, fontSize: 11, fontWeight: 700, color: P.textSoft, borderBottom: `1px solid ${P.border}` }}>
              {cat} <span style={{ color: P.textMute, fontWeight: 400 }}>({prods.length})</span>
            </div>
            {prods.map(p => (
              <div key={p._idx} style={{ padding: '8px 12px', borderBottom: `1px solid ${P.border}`, display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 30px', gap: 8, alignItems: 'center' }}>
                <input value={p.nome}
                  onChange={e => updateProdotto(p._idx, { nome: e.target.value.toUpperCase().slice(0, 45) })}
                  style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${P.border}`, fontSize: 12, fontWeight: 600 }} />
                <select value={p.tipo} onChange={e => updateProdotto(p._idx, { tipo: e.target.value, unita: e.target.value === 'fetta' ? 8 : 1 })}
                  style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${P.border}`, fontSize: 11, background: P.bg }}>
                  <option value="pezzo">pezzo</option>
                  <option value="fetta">fetta</option>
                  <option value="kg">kg</option>
                </select>
                <input type="number" step="0.1" min="0" value={p.unita || 1}
                  onChange={e => updateProdotto(p._idx, { unita: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                  title={p.tipo === 'fetta' ? 'fette per stampo' : 'unità'}
                  style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${P.border}`, fontSize: 11, textAlign: 'right' }} />
                <input type="number" step="0.10" min="0.50" max="80" value={p.prezzo}
                  onChange={e => updateProdotto(p._idx, { prezzo: Math.max(0.5, Math.min(80, Number(e.target.value) || 0)) })}
                  title="prezzo €/unità"
                  style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${P.border}`, fontSize: 12, textAlign: 'right' }} />
                <button onClick={() => removeProdotto(p._idx)} aria-label="Rimuovi prodotto"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.err, padding: 4, fontSize: 16, lineHeight: 1 }}
                  title="Rimuovi questo prodotto">×</button>
              </div>
            ))}
          </div>
        ))}
        <div style={{ padding: 10, background: P.rowAlt, textAlign: 'center' }}>
          <Btn kind="ghost" size="sm" onClick={addProdotto}>
            <Icon name="plus" size={12} /> Aggiungi prodotto
          </Btn>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Btn kind="ghost" onClick={onBack}><Icon name="x" size={13} /> Indietro / nuovo input</Btn>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="neutral" onClick={onSave} disabled={saving || menu.prodotti.length === 0}>
            {saving ? '…' : <><Icon name="save" size={13} /> Salva menu</>}
          </Btn>
          <Btn kind="success" onClick={onCommit} disabled={committing || menu.prodotti.length < 3}>
            {committing ? <><Icon name="hourglass" size={13} /> Popolamento…</> : <><Icon name="sparkles" size={13} /> Conferma e popola</>}
          </Btn>
        </div>
      </div>
      {menu.prodotti.length < 3 && (
        <div style={{ fontSize: 10, color: P.textMute, textAlign: 'right', marginTop: 6 }}>Minimo 3 prodotti per popolare la demo.</div>
      )}
    </div>
  )
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────
function Step3Done({ result, cliente, onImpersona, onClose }) {
  const c = result?.counts || {}
  const ov = result?.override || {}
  return (
    <div>
      <div style={{ padding: 16, background: P.okBg, borderRadius: 10, marginBottom: 16, textAlign: 'center', border: `1px solid ${P.ok}` }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>✨</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: P.ok, marginBottom: 4 }}>
          Demo personalizzata popolata
        </div>
        <div style={{ fontSize: 12, color: P.ok, opacity: 0.85 }}>
          {cliente.nome_attivita} ora ha 3 mesi di operatività realistica con i suoi prodotti.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <KPI label="Ricette" value={c.ricette} />
        <KPI label="Chiusure cassa" value={c.chiusure} />
        <KPI label="Sessioni produzione" value={c.sessioni_produzione} />
        <KPI label="Vendite B2B" value={c.vendite_b2b} />
        <KPI label="Fatture fornitori" value={c.fatture} />
        <KPI label="Dipendenti + turni" value={`${c.dipendenti || 0} · ${c.turni || 0}`} />
      </div>

      {(ov.nome_aggiornato || ov.citta_aggiornata) && (
        <div style={{ padding: 10, background: P.blueBg, color: P.blue, borderRadius: 8, fontSize: 11, marginBottom: 16, border: `1px solid ${P.blue}` }}>
          <Icon name="check" size={11} /> Anagrafica aggiornata:
          {ov.nome_aggiornato && <> nome attività ✓</>}
          {ov.citta_aggiornata && <> · città ✓</>}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Btn kind="ghost" onClick={onClose}>Chiudi</Btn>
        <Btn kind="primary" onClick={onImpersona}>
          <Icon name="key" size={13} /> Visualizza come cliente →
        </Btn>
      </div>
    </div>
  )
}

function KPI({ label, value }) {
  return (
    <div style={{ padding: 10, background: P.rowAlt, borderRadius: 8 }}>
      <div style={{ fontSize: 9, color: P.textMute, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: P.text, fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</div>
    </div>
  )
}

// ─── Componente principale ────────────────────────────────────────────────
export default function PersonalizeDemoModal({ cliente, apiCall, toast, onClose, onImpersona }) {
  const [step, setStep] = useState(1)
  const [tab, setTab] = useState('foto')
  const [images, setImages] = useState([])
  const [text, setText] = useState('')
  const [nomeAttivita, setNomeAttivita] = useState('')
  const [citta, setCitta] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState(null)
  const [saving, setSaving] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState(null)
  const [cached, setCached] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)

  // Carica menu salvato all'apertura: se esiste, salta a Step 2
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await apiCall(`/api/admin?action=load_demo_menu&org_id=${cliente.org_id}`)
        const data = await res.json()
        if (!alive) return
        if (data?.menu?.prodotti?.length > 0) {
          // Re-normalize (defensive: il menu in DB potrebbe avere campi stale)
          try {
            const normalized = normalizeMenu(data.menu)
            setMenu(normalized)
            setCached(true)
            setLastSavedAt(data.updated_at)
            setStep(2)
          } catch (e) {
            console.warn('menu salvato corrotto, ricomincia da capo:', e.message)
          }
        }
      } catch { /* nessun menu salvato, resto su Step 1 */ }
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleExtract() {
    setError('')
    setExtracting(true)
    try {
      const { menu: m } = await extractMenuFromInput({ text, images })
      if (nomeAttivita) m.nome_attivita = nomeAttivita
      if (citta) m.citta = citta
      setMenu(m)
      setCached(false)
      setStep(2)
    } catch (e) {
      setError(e.message || 'Errore estrazione AI')
    } finally {
      setExtracting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({
          orgId: cliente.org_id, tipo: 'save_demo_menu', customMenu: menu,
        }),
      })
      const data = await res.json().catch(() => ({}))
      setLastSavedAt(data?.saved_at || new Date().toISOString())
      setCached(true)
      toast?.success('Menu salvato — puoi riaprire il modal e ritrovarlo')
    } catch (e) {
      toast?.error('Salvataggio fallito: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCommit() {
    setCommitting(true)
    try {
      // Build customMenu dal menu corrente
      const ricettario = menuToRicettario(menu)
      const customMenu = {
        ...ricettario,
        nome_attivita: menu.nome_attivita || undefined,
        citta: menu.citta || undefined,
      }
      // Pre-salva il menu (così la prossima volta lo ritrova)
      await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ orgId: cliente.org_id, tipo: 'save_demo_menu', customMenu: menu }),
      }).catch(() => {})
      // Poi popola
      const res = await apiCall('/api/admin', {
        method: 'POST',
        body: JSON.stringify({ orgId: cliente.org_id, tipo: 'seed_demo_personalized', customMenu }),
      })
      const data = await res.json()
      setResult(data)
      setStep(3)
      toast?.success(`Popolato! ${data.counts?.ricette || 0} ricette · ${data.counts?.chiusure || 0} chiusure`)
    } catch (e) {
      toast?.error('Popolamento fallito: ' + e.message)
    } finally {
      setCommitting(false)
    }
  }

  function handleBack() {
    if (confirm('Tornare al Step 1 (Input)? Le modifiche al menu non salvate andranno perse.')) {
      setMenu(null)
      setCached(false)
      setLastSavedAt(null)
      setStep(1)
    }
  }

  function handleImpersonaClick() {
    onClose()
    onImpersona?.(cliente)
  }

  return (
    <ModalShell
      title={`🪄 Demo personalizzata · ${cliente.nome_attivita}`}
      subtitle="Popola un'org di test con i prodotti reali del cliente, pronto per il pitch"
      onClose={onClose}
      width={840}>
      <StepIndicator current={step} />

      {step === 1 && (
        <Step1Input
          tab={tab} setTab={setTab}
          images={images} setImages={setImages}
          text={text} setText={setText}
          nomeAttivita={nomeAttivita} setNomeAttivita={setNomeAttivita}
          citta={citta} setCitta={setCitta}
          onExtract={handleExtract}
          extracting={extracting}
          error={error}
        />
      )}
      {step === 2 && menu && (
        <Step2Review
          menu={menu} setMenu={setMenu}
          onBack={handleBack}
          onSave={handleSave}
          onCommit={handleCommit}
          saving={saving}
          committing={committing}
          cached={cached}
          lastSavedAt={lastSavedAt}
        />
      )}
      {step === 3 && result && (
        <Step3Done
          result={result}
          cliente={cliente}
          onImpersona={handleImpersonaClick}
          onClose={onClose}
        />
      )}
    </ModalShell>
  )
}
