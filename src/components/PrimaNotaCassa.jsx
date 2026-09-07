// Uscite di cassa della giornata: la prima nota.
//
// Sta nella pagina Cassa perché è lì che si fa, alla stessa ora: si conta il
// cassetto, e prima di quadrarlo si tolgono i dieci euro di limoni, la carta,
// la spesa al supermercato. Metterla fra i costi aziendali — che sono affitto
// e utenze, cifre mensili con periodicità — significherebbe chiedere a chi sta
// al banco di aprire un'altra pagina e pensare in mesi.
//
// La colonna che conta è il documento: con fattura, senza, da verificare. È la
// notazione con cui il design partner tiene il registro da anni — (F), (no F),
// (?) — e non è un dettaglio di colore: separa quello che il commercialista
// può scaricare da quello che non può.

import React, { useCallback, useEffect, useState } from 'react'
import { color as T, typo, font, radius as R } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from './Icon'
import { useConfirm } from './ConfirmModal'
import { fmt } from '../views/_shared'
import {
  DOCUMENTI, caricaMovimenti, aggiungiMovimento, eliminaMovimento,
} from '../lib/primaNota'

// I tre stati del documento, col colore che gli spetta: la spesa senza
// fattura non è un errore, ma va vista.
const COLORE_DOC = { fattura: T.green, senza: T.amber, incerto: T.textSoft }

export default function PrimaNotaCassa({ orgId, sedeId, data, notify }) {
  const isMobile = useIsMobile()
  const confirmDialog = useConfirm()
  const [righe, setRighe] = useState([])
  const [caricando, setCaricando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [importo, setImporto] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [documento, setDocumento] = useState('senza')

  const ricarica = useCallback(async () => {
    if (!orgId || !data) { setRighe([]); return }
    setCaricando(true)
    try {
      setRighe(await caricaMovimenti(orgId, sedeId, { from: data, to: data }))
    } catch (e) {
      notify?.(e.message || 'Non riesco a leggere le uscite di cassa', false)
    } finally {
      setCaricando(false)
    }
  }, [orgId, sedeId, data, notify])

  useEffect(() => { ricarica() }, [ricarica])

  const num = (v) => Number(String(v).replace(',', '.')) || 0
  const totale = righe.reduce((s, r) => s + r.importo, 0)
  const perDoc = DOCUMENTI.map(d => ({
    ...d,
    somma: righe.filter(r => r.documento === d.valore).reduce((s, r) => s + r.importo, 0),
  })).filter(d => d.somma > 0)

  const valido = num(importo) > 0 && descrizione.trim() !== ''

  async function aggiungi() {
    if (!valido || salvando) return
    setSalvando(true)
    try {
      const nuova = await aggiungiMovimento(orgId, sedeId, {
        data, importo: num(importo), descrizione, documento,
      })
      // Save-first: la riga entra nell'elenco solo dopo che il database l'ha
      // accettata, così non resta a schermo una spesa che non è stata salvata.
      setRighe(r => [nuova, ...r])
      setImporto(''); setDescrizione(''); setDocumento('senza')
    } catch (e) {
      notify?.(e.message || 'Uscita non salvata', false)
    } finally {
      setSalvando(false)
    }
  }

  async function rimuovi(riga) {
    const ok = await confirmDialog({
      title: 'Togliere questa uscita?',
      message: `${fmt(riga.importo)} · ${riga.descrizione}`,
      confirmLabel: 'Togli', cancelLabel: 'Lascia', destructive: true,
    })
    if (!ok) return
    try {
      await eliminaMovimento(riga.id)
      setRighe(r => r.filter(x => x.id !== riga.id))
    } catch (e) {
      notify?.(e.message || 'Non riesco a togliere questa uscita', false)
    }
  }

  const campo = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', minHeight: 44,
    border: `1px solid ${T.borderStr}`, borderRadius: R.md, background: T.bgCard,
    color: T.text, fontFamily: 'inherit',
    // Sotto i 16px iOS ingrandisce la pagina quando si tocca un campo.
    fontSize: isMobile ? font.size.lg : typo.body.fontSize,
  }
  const etichetta = {
    ...typo.small, color: T.textMid, display: 'block', marginBottom: 5, fontWeight: 600,
  }

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
      padding: isMobile ? '16px 16px' : '18px 20px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 30, height: 30, borderRadius: R.md, background: T.bgSubtle, color: T.textMid,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="wallet" size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...typo.h3, color: T.text }}>Uscite di cassa</div>
          <div style={{ ...typo.small, color: T.textSoft, marginTop: 2, lineHeight: 1.45 }}>
            I soldi usciti dal cassetto oggi. Segna se la spesa ha la fattura: serve al commercialista, e a te per sapere quanto puoi scaricare.
          </div>
        </div>
      </div>

      {/* Elenco della giornata */}
      {caricando ? (
        <div style={{ ...typo.small, color: T.textSoft, padding: '10px 0' }}>Sto leggendo…</div>
      ) : righe.length === 0 ? (
        <div style={{
          ...typo.small, color: T.textSoft, background: T.bgSubtle, borderRadius: R.md,
          padding: '12px 14px', marginBottom: 14, lineHeight: 1.5,
        }}>
          Nessuna uscita segnata per questo giorno. Se non è uscito niente dal cassetto va bene così.
        </div>
      ) : (
        <div style={{ marginBottom: 14, border: `1px solid ${T.borderSoft}`, borderRadius: R.md, overflow: 'hidden' }}>
          {righe.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: isMobile ? '10px 12px' : '9px 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${T.borderSoft}`,
              background: i % 2 ? T.bgSubtle : T.bgCard,
            }}>
              <div style={{
                ...typo.numSm, color: T.text, minWidth: isMobile ? 74 : 92,
                textAlign: 'right', flexShrink: 0,
              }}>{fmt(r.importo)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...typo.small, color: T.text, fontWeight: 600, overflowWrap: 'anywhere' }}>{r.descrizione}</div>
                {r.note && (
                  <div style={{ ...typo.caption, color: T.textSoft, marginTop: 2, overflowWrap: 'anywhere' }}>{r.note}</div>
                )}
              </div>
              <div style={{
                ...typo.caption, fontWeight: 700, flexShrink: 0,
                color: COLORE_DOC[r.documento] || T.textSoft,
                border: `1px solid ${COLORE_DOC[r.documento] || T.textSoft}`,
                borderRadius: R.full, padding: '2px 8px', whiteSpace: 'nowrap',
              }}>{DOCUMENTI.find(d => d.valore === r.documento)?.breve || '?'}</div>
              <button type="button" onClick={() => rimuovi(r)} aria-label={`Togli ${r.descrizione}`}
                style={{
                  width: 40, height: 40, flexShrink: 0, background: 'transparent',
                  border: 'none', borderRadius: R.md, color: T.textSoft, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: isMobile ? '10px 12px' : '10px 14px', borderTop: `1px solid ${T.border}`,
            background: T.bgMuted, flexWrap: 'wrap',
          }}>
            <div style={{ ...typo.small, color: T.textMid, fontWeight: 700 }}>
              Uscito dal cassetto
              {perDoc.length > 1 && (
                <span style={{ fontWeight: 500, color: T.textSoft }}>
                  {' · '}{perDoc.map(d => `${d.etichetta.toLowerCase()} ${fmt(d.somma)}`).join(' · ')}
                </span>
              )}
            </div>
            <div style={{ ...typo.numSm, color: T.text, fontWeight: 800 }}>{fmt(totale)}</div>
          </div>
        </div>
      )}

      {/* Aggiunta di una spesa */}
      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(110px, 150px) 1fr',
      }}>
        <div>
          <label htmlFor="fos-pn-importo" style={etichetta}>Quanto</label>
          <div style={{ position: 'relative' }}>
            <input id="fos-pn-importo" type="text" inputMode="decimal" value={importo}
              onChange={e => setImporto(e.target.value)} placeholder="0,00" autoComplete="off"
              style={{ ...campo, paddingRight: 30, fontWeight: 700 }} />
            <span style={{
              position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
              color: T.textSoft, ...typo.small,
            }}>€</span>
          </div>
        </div>
        <div>
          <label htmlFor="fos-pn-desc" style={etichetta}>Per cosa</label>
          <input id="fos-pn-desc" type="text" value={descrizione}
            onChange={e => setDescrizione(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') aggiungi() }}
            placeholder="limoni, carta, spesa al supermercato…" autoComplete="off"
            style={campo} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={etichetta}>Il documento</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DOCUMENTI.map(d => {
            const attivo = documento === d.valore
            return (
              <button key={d.valore} type="button" onClick={() => setDocumento(d.valore)}
                aria-pressed={attivo}
                style={{
                  flex: isMobile ? '1 1 30%' : '0 0 auto', minHeight: 42,
                  padding: '9px 14px', borderRadius: R.md, cursor: 'pointer',
                  ...typo.small, fontWeight: 700, fontFamily: 'inherit',
                  background: attivo ? T.text : T.bgCard,
                  color: attivo ? T.textOnDark : T.textMid,
                  border: `1px solid ${attivo ? T.text : T.borderStr}`,
                }}>
                {d.etichetta}
              </button>
            )
          })}
        </div>
      </div>

      <button type="button" onClick={aggiungi} disabled={!valido || salvando}
        style={{
          marginTop: 14, width: '100%', padding: '13px 0', minHeight: 48,
          background: valido && !salvando ? T.brand : T.bgMuted,
          color: valido && !salvando ? T.textOnDark : T.textSoft,
          border: 'none', borderRadius: R.md, cursor: valido && !salvando ? 'pointer' : 'not-allowed',
          ...typo.bodyStrong, fontWeight: 800, fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}>
        <Icon name="plus" size={14} />
        {salvando ? 'Sto salvando…' : 'Aggiungi l’uscita'}
      </button>
    </div>
  )
}
