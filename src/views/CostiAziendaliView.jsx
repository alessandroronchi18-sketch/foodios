// Gestione costi aziendali extra-food.
// L'utente popola autonomamente: consumabili (fazzoletti/coppette),
// manutenzione, ammortamenti, utenze, affitti, ecc. Le voci entrano nel
// calcolo P&L con importo MENSILE normalizzato (annuali/12, una_tantum/12).

import React, { useEffect, useState, useMemo } from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { useConfirm } from '../components/ConfirmModal'
import { C, TNUM, PageHeader, fmt, fmt0 } from './_shared'
import {
  CATEGORIE_DEFAULT, PERIODICITA,
  caricaCostiAziendali, salvaVoceCosto, eliminaVoceCosto,
  importoMensile, totaleMensile, aggregaPerCategoria,
} from '../lib/costiAziendali'

// Helper locali: fmt2 mantiene 2 decimali (per importi tabella).
// fmt0/fmt sono già importati da _shared.
const fmt2 = v => `${Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export default function CostiAziendaliView({ orgId, sedeId, sedi, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  // Audit 2026-06-24: touch target ≥40px su mobile, ≥44px su tablet.
  const iconBtnSize = isMobile ? 40 : isTablet ? 44 : 40
  const confirmDialog = useConfirm()
  const [voci, setVoci] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null = nessun form, oggetto = edit/create
  const [filterCategoria, setFilterCategoria] = useState('')
  // Scope: 'all' (tutte le voci dell'azienda) | 'sede' (voci globali +
  // specifiche della sede attiva). Multi-sede: utile distinguere costi
  // sede-specifici (affitto, utenze) dai costi azienda (commercialista, sw).
  const [scope, setScope] = useState('all')

  async function reload() {
    setLoading(true)
    const arr = await caricaCostiAziendali(orgId, null)  // sempre carico tutto
    setVoci(arr)
    setLoading(false)
  }
  useEffect(() => { if (orgId) reload() }, [orgId])

  // Filtraggio per scope: tutte vs sede attiva (include sempre quelle globali).
  // Multi-sede only: se l'azienda ha una sola sede il toggle non ha senso.
  // try/catch wrap difensivo: se il filter dovesse crashare per dati malformati,
  // ricado su tutte le voci invece di rompere la pagina.
  const hasMultiSede = Array.isArray(sedi) && sedi.length > 1
  const vociScopeFiltrate = useMemo(() => {
    try {
      if (scope === 'all' || !sedeId || !Array.isArray(voci)) return voci || []
      return voci.filter(v => v && (v.sede_id == null || v.sede_id === sedeId))
    } catch { return voci || [] }
  }, [voci, scope, sedeId])
  const sedeAttivaNome = useMemo(() => {
    try {
      const s = (Array.isArray(sedi) ? sedi : []).find(x => x && x.id === sedeId)
      return (s && s.nome) || ''
    } catch { return '' }
  }, [sedi, sedeId])

  // KPI calcolati sul SCOPE attivo: se "sede attiva" mostro totali della sede,
  // se "tutta l'azienda" mostro totale azienda. Così i numeri restano coerenti
  // col toggle.
  const totMese = totaleMensile(vociScopeFiltrate)
  const totAnno = totMese * 12
  const perCategoria = aggregaPerCategoria(vociScopeFiltrate)
  const vociFiltrate = filterCategoria
    ? vociScopeFiltrate.filter(v => v.categoria === filterCategoria)
    : vociScopeFiltrate

  // Top 3 voci singole più costose (mese): utile a colpo d'occhio per il
  // proprietario - sa subito da dove iniziare a tagliare.
  const topVoci = useMemo(() => {
    try {
      const ranked = vociScopeFiltrate
        .map(v => ({ ...v, mensile: importoMensile(v) }))
        .filter(v => v.mensile > 0)
        .sort((a, b) => b.mensile - a.mensile)
        .slice(0, 3)
      return ranked
    } catch { return [] }
  }, [vociScopeFiltrate])

  // Voce singola "concentrata" che pesa >20% del totale = candidata negoziazione.
  const voceConcentrata = useMemo(() => {
    if (!topVoci.length || totMese <= 0) return null
    const top = topVoci[0]
    const pct = (top.mensile / totMese) * 100
    return pct >= 20 ? { voce: top.voce, mensile: top.mensile, pct } : null
  }, [topVoci, totMese])

  // Per la card "categoria principale" del KPI.
  const topCategoria = useMemo(() => {
    if (!perCategoria.length || totMese <= 0) return null
    const top = perCategoria[0]
    const catLabel = CATEGORIE_DEFAULT.find(c => c.id === top.categoria)?.label || top.categoria
    const pct = (top.totaleMensile / totMese) * 100
    return { label: catLabel, value: top.totaleMensile, pct }
  }, [perCategoria, totMese])

  function nuovaVoce() {
    setForm({
      organization_id: orgId,
      sede_id: null,
      categoria: 'consumabili',
      voce: '',
      importo: '',
      periodicita: 'mensile',
      note: '',
    })
  }

  async function salva() {
    if (!form.voce?.trim() || !(Number(form.importo) > 0)) {
      notify?.('Compila descrizione e importo (>0)', false)
      return
    }
    try {
      await salvaVoceCosto(form)
      setForm(null)
      await reload()
      notify?.('Voce salvata')
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  async function elimina(id) {
    const ok = await confirmDialog({
      title: 'Eliminare voce di costo?',
      message: 'La voce sara rimossa dal P&L. Le voci storiche restano.',
      confirmLabel: 'Elimina', cancelLabel: 'Annulla', destructive: true,
    })
    if (!ok) return
    try {
      await eliminaVoceCosto(id, false)
      await reload()
      notify?.('Voce eliminata')
    } catch (e) {
      notify?.('Errore: ' + e.message, false)
    }
  }

  // KPI grid: 1 col mobile, 2 tablet, 3 desktop (uniforme col resto dell'app).
  const kpiCols = isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <PageHeader subtitle="Costi extra-food: consumabili, manutenzione, ammortamenti, utenze. Confluiscono nel P&L mensile normalizzati alla periodicità scelta." />

      {/* Toggle SCOPE futuristic-clean: visibile solo se multi-sede E c'e' una
          sede attiva (non in modalita' "Tutte le sedi" aggregate). In _all
          mode il toggle "Sede: -" non avrebbe senso. */}
      {hasMultiSede && sedeId && sedeAttivaNome && (
        <div style={{
          marginBottom: 20, padding: '14px 16px',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #FBF6F2 100%)',
          border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.6)',
          position: 'relative', overflow: 'hidden',
        }}>
          <style>{`
            @keyframes _fos_scope_accent {
              0%, 100% { background-position: 0% 50%; }
              50%      { background-position: 100% 50%; }
            }
            @media (prefers-reduced-motion: reduce) {
              .fos-scope-accent { animation: none !important; }
            }
          `}</style>
          <div aria-hidden="true" className="fos-scope-accent" style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, #E84B3A 0%, #FFB350 50%, #6E0E1A 100%)',
            backgroundSize: '200% 100%',
            animation: '_fos_scope_accent 6s ease-in-out infinite',
          }}/>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSoft, marginBottom: 4 }}>Ambito visualizzazione</div>
              <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.4 }}>
                {scope === 'all'
                  ? <>Stai vedendo <b style={{ color: C.text }}>tutti i costi dell'azienda</b> (globali + di tutte le sedi).</>
                  : <>Stai vedendo i costi della sede <b style={{ color: C.text }}>{sedeAttivaNome}</b> (specifici di sede + globali azienda).</>}
              </div>
            </div>
            <div style={{ display: 'inline-flex', padding: 4, background: C.bgSubtle || '#F4EEEA', borderRadius: 10, flexShrink: 0 }}>
              {[
                { id: 'all', label: 'Tutta l\'azienda' },
                { id: 'sede', label: `Sede: ${sedeAttivaNome || '-'}` },
              ].map(opt => {
                const active = scope === opt.id
                return (
                  <button key={opt.id} onClick={() => setScope(opt.id)}
                    style={{
                      padding: '8px 16px', minHeight: isMobile ? 40 : 'auto',
                      borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: active ? '#FFFFFF' : 'transparent',
                      color: active ? T.brand : C.textMid,
                      fontSize: 12.5, fontWeight: active ? 800 : 600,
                      letterSpacing: '0.01em',
                      boxShadow: active ? '0 1px 3px rgba(15,23,42,0.10), 0 0 0 1px rgba(110,14,26,0.08)' : 'none',
                      transition: 'background 140ms ease, color 140ms ease',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}>{opt.label}</button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* KPI riepilogativi */}
      <div style={{ display: 'grid', gridTemplateColumns: kpiCols, gap: 12, marginBottom: 20 }}>
        <KpiBox
          label="Costo mensile totale"
          value={fmt0(totMese)}
          sub={voci.length > 0 ? `${voci.length} ${voci.length === 1 ? 'voce attiva' : 'voci attive'}` : 'Nessuna voce'}
          accent={T.brand}
          highlight
        />
        <KpiBox
          label="Costo annuo stimato"
          value={fmt0(totAnno)}
          sub="Mensile × 12"
          accent={C.textMid}
        />
        <KpiBox
          label="Categoria principale"
          value={topCategoria ? fmt0(topCategoria.value) : '-'}
          sub={topCategoria ? `${topCategoria.label} · ${topCategoria.pct.toFixed(0)}% del totale` : 'Aggiungi voci per vedere il dettaglio'}
          accent={C.textMid}
        />
      </div>

      {/* Banner "voce concentrata" - alert intelligente per il proprietario:
          se una singola voce pesa >=20% del totale, vale la pena negoziare. */}
      {voceConcentrata && (
        <div style={{
          marginBottom: 16, padding: '12px 16px',
          background: 'linear-gradient(180deg, #FFFBEB 0%, #FEF3C7 100%)',
          border: '1px solid #FCD34D', borderRadius: 12,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ flexShrink: 0, color: '#B45309', marginTop: 2 }}>
            <Icon name="warning" size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#78350F', marginBottom: 3 }}>
              Voce concentrata: <b>{voceConcentrata.voce}</b> pesa il {voceConcentrata.pct.toFixed(0)}% di tutti i costi
            </div>
            <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
              {fmt0(voceConcentrata.mensile)}/mese - vale la pena chiamare il fornitore e provare a negoziare o cercare alternative: anche un -10% qui significa {fmt0(voceConcentrata.mensile * 0.10 * 12)}/anno di risparmio.
            </div>
          </div>
        </div>
      )}

      {/* Top 3 voci più care del mese - utile per il proprietario per capire
          immediatamente da dove iniziare a tagliare. */}
      {topVoci.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '14px 18px',
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.brand, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Voci più care del mese</div>
            <div style={{ fontSize: 10.5, color: C.textSoft }}>top 3</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
            {topVoci.map((v, i) => {
              const pct = totMese > 0 ? (v.mensile / totMese) * 100 : 0
              const catLbl = CATEGORIE_DEFAULT.find(c => c.id === v.categoria)?.label || v.categoria || 'altro'
              return (
                <div key={v.id} style={{
                  padding: '11px 13px', background: '#FBF6F2',
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  display: 'flex', flexDirection: 'column', gap: 5, minHeight: 78,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: T.brand, color: '#FFF', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.voce}>{v.voce}</div>
                      <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 2 }}>{catLbl}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 'auto' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.brand, ...TNUM, letterSpacing: '-0.015em' }}>{fmt0(v.mensile)}/mese</span>
                    {pct > 0 && <span style={{ fontSize: 11, color: C.textSoft, ...TNUM, fontWeight: 600 }}>{pct.toFixed(0)}%</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtri + bottone aggiungi.
          Audit 2026-06-24: su mobile il filtro va in colonna sopra il bottone
          per non comprimere la select. Touch target ≥40px ovunque.
          Chip "reset filtro" visibile solo quando un filtro è attivo. */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        gap: 10, marginBottom: 16, alignItems: isMobile ? 'stretch' : 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ position: 'relative', flex: isMobile ? 'none' : '0 0 auto', minWidth: isMobile ? 0 : 240, width: isMobile ? '100%' : 'auto' }}>
          <select
            value={filterCategoria}
            onChange={e => setFilterCategoria(e.target.value)}
            aria-label="Filtra per categoria"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 36px 10px 14px',
              minHeight: isMobile ? 44 : isTablet ? 44 : 40,
              fontSize: isMobile ? 16 : 13,
              border: `1px solid ${filterCategoria ? T.brand : C.border}`, borderRadius: 10,
              background: '#FFFFFF', color: C.text,
              appearance: 'none', WebkitAppearance: 'none',
              cursor: 'pointer', fontWeight: 500,
              outline: 'none',
              boxShadow: filterCategoria ? `0 0 0 3px rgba(110,14,26,0.10)` : 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}>
            <option value="">Tutte le categorie ({voci.length})</option>
            {CATEGORIE_DEFAULT.map(c => {
              const n = voci.filter(v => v.categoria === c.id).length
              return <option key={c.id} value={c.id}>{c.label}{n ? ` (${n})` : ''}</option>
            })}
          </select>
          <span aria-hidden style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', color: C.textSoft, fontSize: 10,
          }}>▼</span>
        </div>
        {filterCategoria && (
          <button
            onClick={() => setFilterCategoria('')}
            aria-label="Rimuovi filtro categoria"
            style={{
              padding: '0 12px',
              minHeight: isMobile ? 40 : isTablet ? 44 : 36,
              background: '#FFFFFF', color: C.textMid,
              border: `1px solid ${C.border}`, borderRadius: 999,
              fontSize: isMobile ? 14 : 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
            }}>
            <span aria-hidden style={{ fontSize: 14, lineHeight: 1, color: C.textSoft }}>×</span>
            Rimuovi filtro
          </button>
        )}
        {!isMobile && <div style={{ flex: 1 }} />}
        <button
          onClick={nuovaVoce}
          aria-label="Aggiungi nuova voce di costo"
          style={{
            padding: '10px 18px',
            minHeight: isMobile ? 44 : isTablet ? 44 : 40,
            background: T.brand, color: '#FFFFFF',
            border: 'none', borderRadius: 10,
            fontSize: isMobile ? 15 : 13, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 1px 2px rgba(110,14,26,0.18), 0 4px 10px rgba(110,14,26,0.12)',
            letterSpacing: '-0.01em',
            width: isMobile ? '100%' : 'auto',
          }}>
          <Icon name="plus" size={15} color="#FFFFFF" />
          Aggiungi voce
        </button>
      </div>

      {/* Tabella voci raggruppate per categoria */}
      {loading ? (
        <div style={{
          padding: 60, textAlign: 'center', color: C.textSoft,
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
          fontSize: 13,
        }}>Caricamento…</div>
      ) : vociFiltrate.length === 0 ? (
        <EmptyState filterCategoria={filterCategoria} onAdd={nuovaVoce} />
      ) : (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`,
          borderRadius: 14, overflow: 'hidden', boxShadow: S.sm,
          width: '100%', boxSizing: 'border-box',
        }}>
          {perCategoria
            .filter(g => !filterCategoria || g.categoria === filterCategoria)
            .map((gruppo, gi) => {
              const catLabel = CATEGORIE_DEFAULT.find(c => c.id === gruppo.categoria)?.label || gruppo.categoria
              const pctTot = totMese > 0 ? (gruppo.totaleMensile / totMese) * 100 : 0
              return (
                <div key={gruppo.categoria}>
                  {/* Header categoria - colore brand (bordeaux) + accent bar laterale
                      per distinguerlo dalle voci sotto. Sfondo cream warm. */}
                  <div style={{
                    padding: isMobile ? '12px 14px' : '12px 18px',
                    background: 'linear-gradient(180deg, #FBF6F2 0%, #F4ECE7 100%)',
                    borderTop: gi === 0 ? 'none' : `1px solid ${C.border}`,
                    borderBottom: `1px solid ${C.border}`,
                    boxShadow: 'inset 3px 0 0 #6E0E1A',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 10,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      minWidth: 0, flex: 1,
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 800, color: '#6E0E1A',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{catLabel}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: C.textSoft,
                        background: '#FFFFFF', border: `1px solid ${C.borderSoft}`,
                        padding: '2px 7px', borderRadius: 10, ...TNUM,
                        flexShrink: 0,
                      }}>{gruppo.voci.length}</span>
                    </div>
                    <div style={{
                      textAlign: 'right', flexShrink: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: T.brand, ...TNUM,
                        letterSpacing: '-0.01em',
                      }}>{fmt0(gruppo.totaleMensile)}/mese</span>
                      {totMese > 0 && (
                        <span style={{
                          fontSize: 10.5, color: C.textSoft, ...TNUM, marginTop: 1,
                        }}>{pctTot.toFixed(0)}% del totale</span>
                      )}
                    </div>
                  </div>

                  {/* Righe voci */}
                  {gruppo.voci.map(v => (
                    <VoceRow
                      key={v.id}
                      v={v}
                      sedi={sedi}
                      isMobile={isMobile}
                      iconBtnSize={iconBtnSize}
                      onEdit={() => setForm({ ...v })}
                      onDelete={() => elimina(v.id)}
                    />
                  ))}
                </div>
              )
            })}

          {/* Footer riepilogativo */}
          {!filterCategoria && perCategoria.length > 1 && (
            <div style={{
              padding: isMobile ? '14px 14px' : '14px 18px',
              background: '#FAFAFB',
              borderTop: `2px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
                Totale costi aziendali
              </span>
              <span style={{
                fontSize: 14, fontWeight: 800, color: T.brand, ...TNUM,
                letterSpacing: '-0.015em',
              }}>{fmt0(totMese)}/mese</span>
            </div>
          )}
        </div>
      )}

      {form && (
        <DialogFormCosto
          form={form} setForm={setForm} sedi={sedi}
          isMobile={isMobile}
          onClose={() => setForm(null)} onSave={salva}
        />
      )}
    </div>
  )
}

// Riga singola voce. Su mobile va in colonna per evitare accavallamenti
// fra descrizione (lunga) e importo. Bottoni icon-only con aria-label.
function VoceRow({ v, sedi, isMobile, iconBtnSize = 40, onEdit, onDelete }) {
  const periodLabel = PERIODICITA.find(p => p.id === v.periodicita)?.label || v.periodicita
  const sedeLabel = v.sede_id
    ? ((sedi || []).find(s => s.id === v.sede_id)?.nome || 'sede')
    : 'tutte le sedi'

  return (
    <div
      onMouseEnter={e => { if (!isMobile) e.currentTarget.style.background = '#FAFBFC' }}
      onMouseLeave={e => { if (!isMobile) e.currentTarget.style.background = 'transparent' }}
      style={{
        padding: isMobile ? '14px' : '14px 18px',
        borderBottom: `1px solid ${C.borderSoft}`,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? 10 : 14,
        transition: 'background 0.15s',
        background: 'transparent',
      }}>
      {/* Descrizione */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: C.text,
          letterSpacing: '-0.01em', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: isMobile ? 'normal' : 'nowrap',
        }} title={v.voce}>{v.voce}</div>
        {v.note && (
          <div style={{
            fontSize: 12, color: C.textSoft, marginTop: 3, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: isMobile ? 'normal' : 'nowrap',
          }} title={v.note}>{v.note}</div>
        )}
        <div style={{
          fontSize: 11, color: C.textSoft, marginTop: 5,
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
        }}>
          <span style={{
            background: '#F1F5F9', padding: '2px 7px', borderRadius: 6,
            fontWeight: 600, color: C.textMid, whiteSpace: 'nowrap',
          }}>{periodLabel}</span>
          {/* Scope badge: colore distintivo. Verde = azienda, brand = sede. */}
          {v.sede_id ? (
            <span style={{
              background: 'rgba(110,14,26,0.08)', color: T.brand, padding: '2px 8px', borderRadius: 6,
              fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.01em',
              border: '1px solid rgba(110,14,26,0.18)',
            }} title={`Costo specifico per ${sedeLabel}`}>Sede: {sedeLabel}</span>
          ) : (
            <span style={{
              background: 'rgba(22,163,74,0.08)', color: '#15803D', padding: '2px 8px', borderRadius: 6,
              fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.01em',
              border: '1px solid rgba(22,163,74,0.18)',
            }} title="Costo a livello azienda (vale per ogni sede)">Azienda</span>
          )}
        </div>
      </div>

      {/* Importo + equivalente mensile.
          Su mobile va in riga sotto la descrizione, allineato a sinistra
          insieme ai bottoni; su desktop a destra. */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'row',
        alignItems: 'center',
        justifyContent: isMobile ? 'space-between' : 'flex-end',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <div style={{
            fontSize: 15, fontWeight: 800, color: C.text, ...TNUM,
            letterSpacing: '-0.015em', lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}>{fmt2(v.importo)}</div>
          {v.periodicita !== 'mensile' && (
            <div style={{
              fontSize: 11, color: T.brand, ...TNUM, marginTop: 3,
              fontWeight: 600, whiteSpace: 'nowrap',
            }}>{fmt2(importoMensile(v))}/mese</div>
          )}
        </div>

        {/* Azioni */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onEdit}
            aria-label={`Modifica voce ${v.voce}`}
            title="Modifica"
            style={{
              padding: 0, width: iconBtnSize, height: iconBtnSize,
              background: '#F8FAFC', border: `1px solid ${C.border}`,
              borderRadius: 10, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s, border-color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EEF2F7' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC' }}>
            <Icon name="edit" size={14} color={C.textMid} />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Elimina voce ${v.voce}`}
            title="Elimina"
            style={{
              padding: 0, width: iconBtnSize, height: iconBtnSize,
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 10, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2' }}>
            <Icon name="trash" size={14} color={T.brand} />
          </button>
        </div>
      </div>
    </div>
  )
}

// Empty state ridisegnato: più aria, gerarchia chiara, CTA primaria.
function EmptyState({ filterCategoria, onAdd }) {
  return (
    <div style={{
      padding: '56px 24px', textAlign: 'center',
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
      boxShadow: S.sm,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#F8FAFC', border: `1px solid ${C.borderSoft}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        <Icon name="package" size={28} color={C.textSoft} />
      </div>
      <div style={{
        fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6,
        letterSpacing: '-0.01em',
      }}>
        Nessuna voce di costo {filterCategoria ? 'in questa categoria' : 'configurata'}
      </div>
      <div style={{
        fontSize: 13, color: C.textSoft, lineHeight: 1.55,
        maxWidth: 420, margin: '0 auto 18px',
      }}>
        Aggiungi le tue voci (consumabili, utenze, manutenzione…) per vederle riflesse nel P&L mensile.
      </div>
      {!filterCategoria && (
        <button
          onClick={onAdd}
          style={{
            padding: '10px 20px', minHeight: 44,
            background: T.brand, color: '#FFFFFF',
            border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 1px 2px rgba(110,14,26,0.18), 0 4px 10px rgba(110,14,26,0.12)',
          }}>
          <Icon name="plus" size={15} color="#FFFFFF" />
          Aggiungi la prima voce
        </button>
      )}
    </div>
  )
}

// KPI box riprogettato con minHeight uniformi (label/value/sub) per allineamento
// verticale perfetto tra card adiacenti. Stile coerente con KPI globale ma più
// compatto (qui non serve l'icon-chip premium).
function KpiBox({ label, value, sub, accent, highlight }) {
  const isHighlight = !!highlight
  const accentCol = accent || T.brand
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      padding: '16px 18px',
      background: isHighlight
        ? 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)'
        : C.bgCard,
      border: `1px solid ${isHighlight ? '#4A0612' : C.border}`,
      borderRadius: 14,
      boxShadow: isHighlight
        ? '0 8px 24px rgba(110,14,26,0.25), inset 0 1px 0 rgba(255,255,255,0.15)'
        : '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04)',
      display: 'flex', flexDirection: 'column',
      boxSizing: 'border-box', width: '100%',
    }}>
      {/* Decoro radiale d'angolo */}
      <div style={{
        position: 'absolute', top: -24, right: -24, width: 80, height: 80,
        borderRadius: '50%',
        background: isHighlight ? 'rgba(255,255,255,0.08)' : `${accentCol}12`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'relative',
        fontSize: 10.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: isHighlight ? 'rgba(255,255,255,0.78)' : C.textSoft,
        marginBottom: 8,
        minHeight: 26, lineHeight: 1.25,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</div>
      <div style={{
        position: 'relative',
        fontSize: 26, fontWeight: 800,
        color: isHighlight ? '#FFFFFF' : accentCol,
        ...TNUM,
        letterSpacing: '-0.03em', lineHeight: 1.1,
        minHeight: 34,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</div>
      <div style={{
        position: 'relative',
        fontSize: 11.5,
        color: isHighlight ? 'rgba(255,255,255,0.72)' : C.textSoft,
        marginTop: 6,
        fontWeight: 500, lineHeight: 1.35,
        minHeight: 32,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>{sub || ' '}</div>
    </div>
  )
}

function DialogFormCosto({ form, setForm, sedi, isMobile, onClose, onSave }) {
  const isEdit = !!form.id
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const catInfo = CATEGORIE_DEFAULT.find(c => c.id === form.categoria)

  // Stili input dinamici per mobile (font ≥16px, touch target ≥44px).
  const inpStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 13px',
    minHeight: isMobile ? 46 : 42,
    border: `1px solid ${T.border}`, borderRadius: 10,
    fontSize: isMobile ? 16 : 14,
    color: T.text, outline: 'none', background: '#FFFFFF',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const selectStyle = { ...inpStyle, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', paddingRight: 36 }
  const lblStyle = {
    display: 'block', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.07em',
    color: T.textSoft, marginBottom: 7,
  }
  const btnPrimaryStyle = {
    padding: '11px 22px', minHeight: 46,
    background: T.brand, color: '#FFFFFF',
    border: 'none', borderRadius: 11,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(110,14,26,0.2), 0 4px 10px rgba(110,14,26,0.15)',
    letterSpacing: '-0.01em',
  }
  const btnSecondaryStyle = {
    padding: '11px 22px', minHeight: 46,
    background: '#FFFFFF', color: T.textMid,
    border: `1px solid ${T.border}`, borderRadius: 11,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="costo-dialog-title"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        zIndex: 9999, padding: isMobile ? 0 : 16,
        backdropFilter: 'blur(2px)',
      }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: isMobile ? '20px 20px 0 0' : 18,
        maxWidth: 560, width: '100%',
        maxHeight: isMobile ? '92vh' : 'calc(100vh - 32px)',
        overflowY: 'auto',
        padding: isMobile ? '22px 20px 24px' : '26px 28px',
        boxShadow: '0 24px 70px rgba(15,23,42,0.32)',
        boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, marginBottom: 20,
        }}>
          <h2 id="costo-dialog-title" style={{
            margin: 0, fontSize: isMobile ? 18 : 17, fontWeight: 800,
            color: C.text, letterSpacing: '-0.015em', lineHeight: 1.2,
          }}>
            {isEdit ? 'Modifica voce di costo' : 'Nuova voce di costo'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Chiudi finestra"
            style={{
              background: '#F8FAFC', border: `1px solid ${C.borderSoft}`,
              borderRadius: 10, cursor: 'pointer',
              width: isMobile ? 40 : 36, height: isMobile ? 40 : 36,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: C.textMid, lineHeight: 1,
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EEF2F7' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC' }}>
            <Icon name="x" size={15} color={C.textMid} />
          </button>
        </div>

        {/* Categoria */}
        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>Categoria</label>
          <div style={{ position: 'relative' }}>
            <select value={form.categoria} onChange={e => update('categoria', e.target.value)} style={selectStyle}>
              {CATEGORIE_DEFAULT.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <span aria-hidden style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: C.textSoft, fontSize: 10,
            }}>▼</span>
          </div>
          {catInfo?.esempi && (
            <div style={{
              fontSize: 11.5, color: C.textSoft, marginTop: 6, lineHeight: 1.45,
            }}>es. {catInfo.esempi}</div>
          )}
        </div>

        {/* Descrizione */}
        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>Descrizione voce</label>
          <input
            type="text"
            value={form.voce}
            onChange={e => update('voce', e.target.value)}
            placeholder="es. Coppette piccole 80g"
            style={inpStyle}
            autoFocus={!isEdit}
          />
        </div>

        {/* Importo + Periodicità.
            Su mobile vanno in colonna: importo grande, poi periodicità,
            così l'input numerico ha tutta la larghezza disponibile. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 12, marginBottom: 14,
        }}>
          <div>
            <label style={lblStyle}>Importo (€)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.importo}
              onChange={e => update('importo', e.target.value)}
              placeholder="0,00"
              style={inpStyle}
            />
          </div>
          <div>
            <label style={lblStyle}>Periodicità</label>
            <div style={{ position: 'relative' }}>
              <select value={form.periodicita} onChange={e => update('periodicita', e.target.value)} style={selectStyle}>
                {PERIODICITA.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <span aria-hidden style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', color: C.textSoft, fontSize: 10,
              }}>▼</span>
            </div>
          </div>
        </div>

        {/* Sede / Vale per: copy esplicito per chiarire che NULL = tutta l'azienda
            (es. commercialista, software) vs sede X (es. affitto, utenze di quella). */}
        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>Questo costo vale per</label>
          <div style={{ position: 'relative' }}>
            <select value={form.sede_id || ''} onChange={e => update('sede_id', e.target.value || null)} style={selectStyle}>
              <option value="">Tutta l'azienda (vale per ogni sede)</option>
              {(sedi || []).filter(s => s.attiva !== false).map(s => (
                <option key={s.id} value={s.id}>Solo sede: {s.nome}</option>
              ))}
            </select>
            <span aria-hidden style={{
              position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: C.textSoft, fontSize: 10,
            }}>▼</span>
          </div>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 6, lineHeight: 1.4 }}>
            {!form.sede_id
              ? <>Esempi: commercialista, software, marketing centrale, stipendi titolare.</>
              : <>Esempi: affitto, luce, gas, addetti di quella sede specifica.</>}
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 22 }}>
          <label style={lblStyle}>Note (opzionale)</label>
          <input
            type="text"
            value={form.note || ''}
            onChange={e => update('note', e.target.value)}
            placeholder="es. fornitore, contratto, scadenza..."
            style={inpStyle}
          />
        </div>

        {/* Anteprima impatto P&L se importo > 0 */}
        {Number(form.importo) > 0 && (
          <div style={{
            marginBottom: 20, padding: '12px 14px',
            background: '#FEF7F4', border: `1px solid #F4D5C4`,
            borderRadius: 11,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, color: C.textMid, fontWeight: 600 }}>
              Impatto sul P&L mensile
            </span>
            <span style={{
              fontSize: 15, fontWeight: 800, color: T.brand, ...TNUM,
              letterSpacing: '-0.015em',
            }}>
              {fmt2(importoMensile({ importo: form.importo, periodicita: form.periodicita, data_inizio: form.data_inizio, created_at: form.created_at }))}/mese
            </span>
          </div>
        )}

        {/* Azioni.
            Su mobile in colonna full-width, primary in alto per pollice. */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <button onClick={onClose} style={{ ...btnSecondaryStyle, width: isMobile ? '100%' : 'auto' }}>Annulla</button>
          <button onClick={onSave} style={{ ...btnPrimaryStyle, width: isMobile ? '100%' : 'auto' }}>
            {isEdit ? 'Salva modifiche' : 'Aggiungi voce'}
          </button>
        </div>
      </div>
    </div>
  )
}
