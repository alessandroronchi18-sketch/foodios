import React, { useState, useEffect } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { sload, ssave } from '../lib/storage'
import useIsMobile from '../lib/useIsMobile'

const R = '#6E0E1A'
const TXT = '#1C0A0A'
const SOFT = '#9C7B76'
const MID = '#4A3728'
const BOR = '#E2E8F0'

const card = { background: '#FFF', borderRadius: 12, padding: '16px 20px', border: `1px solid #E8DDD8`, marginBottom: 12 }
const inp = { width: '100%', padding: '8px 12px', border: `1px solid ${BOR}`, borderRadius: 8, fontSize: 13, color: TXT, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }
const lbl = { fontSize: 11, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }
const btn = (bg, col) => ({ padding: '8px 16px', background: bg, color: col, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' })

const SK_SCENARIO = 'pasticceria-scenario-operativo-v1'

const SCENARI = [
  {
    id: 'B',
    nome: 'Ogni sede produce per sé',
    icon: 'store',
    descr: 'Ogni sede ha la propria produzione, magazzino e vendita. Le sedi sono autonome, non si scambiano prodotti.',
    setupHint: 'Crea tutte le sedi paritarie. La produzione di ogni sede resta nella sede stessa.',
  },
  {
    id: 'A',
    nome: 'Laboratorio centrale → punti vendita',
    icon: 'factory',
    descr: 'Una sede produce tutto, le altre sono punti vendita che ricevono i prodotti dal laboratorio.',
    setupHint: 'Crea una sede "Laboratorio" + N sedi "Punto vendita". In produzione giornaliera scegli a quale PV destinare la sessione.',
  },
  {
    id: 'C',
    nome: 'Più produttori + sedi solo riceventi',
    icon: 'truck',
    descr: 'Due o più sedi producono ognuna i propri prodotti, mentre altre sedi sono solo punti vendita che vengono rifornite.',
    setupHint: 'Crea le sedi produttive con le loro materie prime e ricette. Le sedi riceventi ricevono via trasferimento.',
  },
  {
    id: 'D',
    nome: 'Rete distribuita',
    icon: 'refresh',
    descr: 'Più sedi producono prodotti diversi e si scambiano tra loro per riempire le vetrine. Modello a hub multipli.',
    setupHint: 'Pianifica chi produce cosa. Usa i trasferimenti per ogni movimento, lo stock vetrina si aggiornerà automaticamente.',
  },
]

function ScenarioOperativoCard({ orgId, scenarioCorrente, onCambia }) {
  const [scelta, setScelta] = useState(scenarioCorrente)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(!scenarioCorrente)

  useEffect(() => { setScelta(scenarioCorrente); setExpanded(!scenarioCorrente) }, [scenarioCorrente])

  async function salva(id) {
    setSaving(true)
    try {
      await ssave(SK_SCENARIO, { scenario: id, scelto_il: new Date().toISOString() }, orgId, null)
      onCambia?.(id)
      setExpanded(false)
    } finally { setSaving(false) }
  }

  const corrente = SCENARI.find(s => s.id === scenarioCorrente)

  if (!expanded && corrente) {
    return (
      <div style={{ background: '#FAFAFA', border: `1px solid ${BOR}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: R, display: 'inline-flex' }}><Icon name={corrente.icon} size={22} /></span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Scenario operativo</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TXT, marginTop: 2 }}>{corrente.nome}</div>
          </div>
        </div>
        <button onClick={() => setExpanded(true)}
          style={{ ...btn('transparent', MID), border: `1px solid ${BOR}` }}>
          Cambia
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: '#FFFBEB', border: '2px dashed #FCD34D', borderRadius: 12, padding: 20, marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="gear" size={13} />Come lavora la tua attività?
      </div>
      <div style={{ fontSize: 13, color: MID, marginBottom: 16, lineHeight: 1.55 }}>
        Scegli lo scenario che meglio descrive il tuo modello operativo. Useremo questa informazione per suggerirti la configurazione corretta delle sedi e dei flussi.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
        {SCENARI.map(s => {
          const isSel = scelta === s.id
          return (
            <button key={s.id} onClick={() => setScelta(s.id)}
              style={{
                textAlign: 'left', padding: '14px 16px',
                background: isSel ? '#FFF' : '#FFFEF7',
                border: `2px solid ${isSel ? R : '#FDE68A'}`,
                borderRadius: 10, cursor: 'pointer',
                boxShadow: isSel ? '0 4px 14px rgba(110,14,26,0.18)' : 'none',
                transition: 'all .15s',
              }}>
              <div style={{ marginBottom: 6, color: R }}><Icon name={s.icon} size={28} /></div>
              <div style={{ fontSize: 13, fontWeight: 800, color: TXT, marginBottom: 6, lineHeight: 1.25 }}>{s.nome}</div>
              <div style={{ fontSize: 11, color: SOFT, lineHeight: 1.5 }}>{s.descr}</div>
            </button>
          )
        })}
      </div>

      {scelta && (() => {
        const s = SCENARI.find(x => x.id === scelta)
        return (
          <div style={{ background: '#FFF', borderRadius: 10, padding: '12px 14px', border: `1px solid ${BOR}`, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="bulb" size={13} />Come configurarlo
            </div>
            <div style={{ fontSize: 12, color: MID, lineHeight: 1.6 }}>{s.setupHint}</div>
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => scelta && salva(scelta)} disabled={!scelta || saving}
          style={{ ...btn(R, '#FFF'), opacity: scelta ? 1 : 0.5, cursor: scelta ? 'pointer' : 'not-allowed' }}>
          {saving ? '…' : (scenarioCorrente ? 'Aggiorna scenario' : 'Conferma scenario')}
        </button>
        {scenarioCorrente && (
          <button onClick={() => setExpanded(false)}
            style={{ ...btn('transparent', SOFT), border: `1px solid ${BOR}` }}>
            Annulla
          </button>
        )}
      </div>
    </div>
  )
}

export default function ImpostazioniSedi({ orgId, onSediChange }) {
  const isMobile = useIsMobile()
  // Su mobile font input >=16px per evitare lo zoom automatico iOS.
  const inpR = { ...inp, fontSize: isMobile ? 16 : 13 }
  const [sedi, setSedi] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ nome: '', indirizzo: '', citta: '', is_default: false })
  const [editForm, setEditForm] = useState({})
  const [toast, setToast] = useState(null)
  const [scenario, setScenario] = useState(null)

  useEffect(() => {
    if (!orgId) return
    sload(SK_SCENARIO, orgId, null).then(v => setScenario(v?.scenario || null))
  }, [orgId])

  const sediAttive = sedi.filter(s => s.attiva !== false)
  const canAddMore = true

  function notify(msg, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function reload() {
    const { data } = await supabase
      .from('sedi')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
    setSedi(data || [])
    onSediChange && onSediChange(data || [])
  }

  useEffect(() => { if (orgId) reload() }, [orgId])

  async function handleAdd() {
    if (!form.nome.trim()) return notify('Il nome sede è obbligatorio', false)
    setLoading(true)
    try {
      if (form.is_default) {
        await supabase.from('sedi').update({ is_default: false }).eq('organization_id', orgId)
      }
      const { error } = await supabase.from('sedi').insert({
        organization_id: orgId,
        nome: form.nome.trim(),
        indirizzo: form.indirizzo.trim() || null,
        citta: form.citta.trim() || null,
        is_default: form.is_default,
        attiva: true,
      })
      if (error) throw error
      notify('Sede aggiunta')
      setForm({ nome: '', indirizzo: '', citta: '', is_default: false })
      setShowAdd(false)
      await reload()
    } catch (e) {
      notify('Errore: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(id) {
    if (!editForm.nome?.trim()) return notify('Il nome è obbligatorio', false)
    setLoading(true)
    try {
      // is_sede_produzione + metodo_produzione: nuovo flag introdotto con il
      // metodo "inventario differenziale" per gelaterie. Una sede ricevente
      // (punto vendita non produttivo) lascia is_sede_produzione=false e
      // non vede la voce "Inventario gusti".
      const patch = {
        nome: editForm.nome.trim(),
        indirizzo: editForm.indirizzo?.trim() || null,
        citta: editForm.citta?.trim() || null,
      }
      if (typeof editForm.is_sede_produzione === 'boolean') {
        patch.is_sede_produzione = editForm.is_sede_produzione
      }
      if (editForm.metodo_produzione && ['stampi','inventario'].includes(editForm.metodo_produzione)) {
        patch.metodo_produzione = editForm.metodo_produzione
      }
      const { error } = await supabase.from('sedi').update(patch).eq('id', id)
      if (error) throw error
      notify('Modifiche salvate')
      setEditing(null)
      await reload()
    } catch (e) {
      notify('Errore: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }

  async function handleSetDefault(id) {
    setLoading(true)
    try {
      await supabase.from('sedi').update({ is_default: false }).eq('organization_id', orgId)
      const { error } = await supabase.from('sedi').update({ is_default: true }).eq('id', id)
      if (error) throw error
      notify('Sede principale impostata')
      await reload()
    } catch (e) {
      notify('Errore: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }

  async function handleDisattiva(id) {
    if (sediAttive.length <= 1) return notify('Non puoi disattivare l\'unica sede attiva', false)
    const sede = (sedi || []).find(s => s.id === id)
    const nome = sede?.nome || 'questa sede'
    // Blocca se ci sono trasferimenti pending (inviato/in_consegna) verso o
    // da questa sede: una volta disattivata, nessun utente puo' più chiamare
    // riceviTrasferimento e lo stock di prodotti finiti resta perso a metà
    // strada (gia' scalato dalla sede mittente, mai materializzato a B).
    try {
      const { data: pending, error: tErr } = await supabase
        .from('trasferimenti')
        .select('id, sede_a, sede_b, stato')
        .or(`sede_a.eq.${id},sede_b.eq.${id}`)
        .eq('stato', 'inviato')
      if (tErr) throw tErr
      if ((pending || []).length > 0) {
        return notify(
          `Ci sono ${pending.length} trasferimento/i pending su questa sede. Gestiscili (ricevi o annulla) prima di disattivare.`,
          false,
        )
      }
    } catch (e) {
      // Se il check fallisce (RLS / rete), meglio non procedere con la disattivazione.
      return notify('Errore verifica trasferimenti: ' + e.message, false)
    }
    if (!window.confirm(`Disattivare la sede "${nome}"? I dati restano salvati ma la sede non sarà più visibile finché non la riattivi.`)) return
    setLoading(true)
    try {
      const { error } = await supabase.from('sedi').update({ attiva: false }).eq('id', id)
      if (error) throw error
      notify('Sede disattivata')
      await reload()
    } catch (e) {
      notify('Errore: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }

  async function handleRiattiva(id) {
    setLoading(true)
    try {
      const { error } = await supabase.from('sedi').update({ attiva: true }).eq('id', id)
      if (error) throw error
      notify('Sede riattivata')
      await reload()
    } catch (e) {
      notify('Errore: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, padding: isMobile ? 12 : 0 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '10px 18px', borderRadius: 10, background: toast.ok ? '#22C55E' : R, color: '#FFF', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}

      <ScenarioOperativoCard
        orgId={orgId}
        scenarioCorrente={scenario}
        onCambia={(id) => { setScenario(id); notify('✓ Scenario aggiornato') }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: TXT }}>Gestione Sedi</div>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} style={btn(R, '#FFF')}>+ Aggiungi sede</button>
        )}
      </div>

      {showAdd && (
        <div style={{ ...card, border: '2px dashed #6E0E1A', background: '#FEF0EE', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: TXT, marginBottom: 14 }}>Nuova sede</div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Nome sede *</label>
            <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inpR} placeholder="Es. Sede Centro" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Indirizzo</label>
              <input value={form.indirizzo} onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))} style={inpR} placeholder="Via Roma 1" />
            </div>
            <div>
              <label style={lbl}>Città</label>
              <input value={form.citta} onChange={e => setForm(f => ({ ...f, citta: e.target.value }))} style={inpR} placeholder="Torino" />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MID, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
            Imposta come sede principale
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} disabled={loading} style={btn(R, '#FFF')}>{loading ? '…' : 'Aggiungi'}</button>
            <button onClick={() => setShowAdd(false)} style={{ ...btn('transparent', SOFT), border: `1px solid ${BOR}` }}>Annulla</button>
          </div>
        </div>
      )}

      {sedi.map(sede => (
        <div key={sede.id} style={{ ...card, opacity: sede.attiva === false ? 0.55 : 1 }}>
          {editing === sede.id ? (
            <div>
              <div style={{ marginBottom: 10 }}>
                <label style={lbl}>Nome</label>
                <input value={editForm.nome || ''} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} style={inpR} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Indirizzo</label>
                  <input value={editForm.indirizzo || ''} onChange={e => setEditForm(f => ({ ...f, indirizzo: e.target.value }))} style={inpR} />
                </div>
                <div>
                  <label style={lbl}>Città</label>
                  <input value={editForm.citta || ''} onChange={e => setEditForm(f => ({ ...f, citta: e.target.value }))} style={inpR} />
                </div>
              </div>
              {/* Sede di produzione + metodo. Si applica al singolo punto vendita:
                  una org puo' avere "Laboratorio" produttivo + "Banco" ricevente. */}
              <div style={{ marginBottom: 12, padding: '12px 14px', background: '#F8FAFC', borderRadius: 10, border: `1px solid ${BOR}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={!!editForm.is_sede_produzione}
                    onChange={e => setEditForm(f => ({ ...f, is_sede_produzione: e.target.checked }))} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: TXT }}>Sede di produzione</span>
                </label>
                <div style={{ fontSize: 11.5, color: SOFT, marginTop: 4, marginLeft: 26, lineHeight: 1.5 }}>
                  Attiva se in questa sede si produce. Le sedi solo riceventi (ricevono via trasferimenti) lasciano questa opzione disattiva.
                </div>
                {editForm.is_sede_produzione && (
                  <div style={{ marginTop: 12, marginLeft: 26 }}>
                    <label style={{ ...lbl, marginBottom: 6 }}>Metodo di registrazione produzione</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                        <input type="radio" name={`metodo-${sede.id}`}
                          checked={(editForm.metodo_produzione || 'stampi') === 'stampi'}
                          onChange={() => setEditForm(f => ({ ...f, metodo_produzione: 'stampi' }))} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: TXT }}>Stampi / unità</div>
                          <div style={{ fontSize: 11, color: SOFT, lineHeight: 1.4 }}>
                            Registri quante unità (stampi, vassoi, kg) hai prodotto per ogni ricetta. Adatto a pasticcerie, panifici.
                          </div>
                        </div>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                        <input type="radio" name={`metodo-${sede.id}`}
                          checked={editForm.metodo_produzione === 'inventario'}
                          onChange={() => setEditForm(f => ({ ...f, metodo_produzione: 'inventario' }))} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: TXT }}>Inventario differenziale</div>
                          <div style={{ fontSize: 11, color: SOFT, lineHeight: 1.4 }}>
                            Registri quanti grammi hai prodotto e quanti ne sono rimasti. Il sistema calcola il venduto. Adatto a gelaterie, yogurterie, pasta fresca.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleSave(sede.id)} disabled={loading} style={btn(R, '#FFF')}>{loading ? '…' : 'Salva'}</button>
                <button onClick={() => setEditing(null)} style={{ ...btn('transparent', SOFT), border: `1px solid ${BOR}` }}>Annulla</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: TXT, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {sede.nome}
                  {sede.is_default && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>DEFAULT</span>}
                  {sede.attiva === false && <span style={{ fontSize: 10, background: '#F1F5F9', color: '#94A3B8', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>INATTIVA</span>}
                  {sede.is_sede_produzione && (
                    <span style={{ fontSize: 10, background: '#E0F2FE', color: '#075985', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      PRODUZIONE · {sede.metodo_produzione === 'inventario' ? 'INVENTARIO' : 'STAMPI'}
                    </span>
                  )}
                </div>
                {(sede.indirizzo || sede.citta) && (
                  <div style={{ fontSize: 12, color: SOFT, marginTop: 3 }}>
                    {[sede.indirizzo, sede.citta].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => { setEditing(sede.id); setEditForm({ nome: sede.nome, indirizzo: sede.indirizzo || '', citta: sede.citta || '', is_sede_produzione: !!sede.is_sede_produzione, metodo_produzione: sede.metodo_produzione || 'stampi' }) }}
                  style={{ padding: '5px 10px', background: '#F8FAFC', border: `1px solid ${BOR}`, borderRadius: 8, fontSize: 11, cursor: 'pointer', color: MID }}>
                  Modifica
                </button>
                {!sede.is_default && sede.attiva !== false && (
                  <button onClick={() => handleSetDefault(sede.id)}
                    style={{ padding: '5px 10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 11, cursor: 'pointer', color: '#92400E' }}>
                    Default
                  </button>
                )}
                {sede.attiva !== false ? (
                  <button onClick={() => handleDisattiva(sede.id)}
                    style={{ padding: '5px 10px', background: '#FFF5F5', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 11, cursor: 'pointer', color: R }}>
                    Disattiva
                  </button>
                ) : (
                  <button onClick={() => handleRiattiva(sede.id)}
                    style={{ padding: '5px 10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, fontSize: 11, cursor: 'pointer', color: '#166534' }}>
                    Riattiva
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {sedi.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: SOFT, fontSize: 13 }}>Nessuna sede trovata.</div>
      )}

      <div style={{ fontSize: 11, color: SOFT, marginTop: 8, lineHeight: 1.6 }}>
        Ricarica la pagina dopo le modifiche per aggiornare il selettore sede nella sidebar.
      </div>
    </div>
  )
}
