// ── Impostazioni → Voci del menu ────────────────────────────────────────
//
// Richiesta del titolare, 09/10/2026: le pagine che un'azienda non usa
// allungano il menu di tutti i giorni. Qui il titolare spegne quelle che non
// gli servono. Una voce spenta esce dalle barre ma non dal programma: la
// ricerca la trova sempre, e da qui si riaccende con un tocco.
//
// Si salva prima e si cambia lo schermo dopo (CLAUDE.md, «pattern scrittura
// → state»): se il salvataggio non riesce, l'interruttore resta com'era.
import React, { useEffect, useMemo, useState } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, font } from '../lib/theme'
import { sload, ssave } from '../lib/storage'
import { SK_VOCI_SPENTE } from '../lib/storageKeys'
import { lessico } from '../lib/lessico'
import {
  costruisciMenu, vociDaScegliere, leggiVociSpente, EVENTO_VOCI_SPENTE,
} from '../lib/menuFoodos'

const carta = (isMobile) => ({
  background: T.bgCard, borderRadius: R.xl, border: `1px solid ${T.border}`, boxShadow: S.sm,
  padding: isMobile ? '16px' : '20px 24px',
})
const titolo = { margin: 0, fontSize: font.size.lg, fontWeight: 700, color: T.text }
const testo = { margin: '6px 0 0', fontSize: font.size.base, color: T.textSoft, lineHeight: 1.55 }
const nomeSezione = {
  margin: '20px 0 4px', fontSize: font.size.sm, fontWeight: 700, color: T.textSoft,
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

function Interruttore({ accesa }) {
  return (
    <span aria-hidden="true" style={{
      width: 42, height: 24, borderRadius: R.full, position: 'relative', flexShrink: 0,
      background: accesa ? T.brand : T.borderStr, transition: 'background 0.18s',
    }}>
      <span style={{
        position: 'absolute', top: 3, left: accesa ? 21 : 3, width: 18, height: 18,
        borderRadius: R.full, background: T.white, transition: 'left 0.18s', boxShadow: S.sm,
      }}/>
    </span>
  )
}

export default function ImpostazioniVociMenu({ orgId, metodoProduzione = 'stampi', sedi = [], sedeId = null, tipoAttivita, notify }) {
  const isMobile = useIsMobile()
  const [spente, setSpente] = useState(null) // null = sto leggendo
  const [salvando, setSalvando] = useState('')

  // Le voci col nome e nel posto che hanno nel menu di QUESTA azienda.
  const gruppi = useMemo(() => {
    const sedeAttiva = (sedi || []).find(s => s.id === sedeId)
    return vociDaScegliere(costruisciMenu({
      metodoInventario: metodoProduzione === 'inventario',
      sedeDiProduzione: sedeAttiva ? sedeAttiva.is_sede_produzione === true : true,
      piuSedi: (sedi || []).filter(s => s.attiva !== false).length > 1,
      lex: lessico(tipoAttivita),
    }))
  }, [metodoProduzione, sedi, sedeId, tipoAttivita])

  useEffect(() => {
    if (!orgId) return undefined
    let vivo = true
    sload(SK_VOCI_SPENTE, orgId, null)
      .then(v => { if (vivo) setSpente(leggiVociSpente(v)) })
      .catch(() => { if (vivo) setSpente([]) })
    return () => { vivo = false }
  }, [orgId])

  const cambia = async (id) => {
    if (!orgId || spente == null || salvando) return
    const nuove = spente.includes(id) ? spente.filter(x => x !== id) : [...spente, id]
    setSalvando(id)
    try {
      await ssave(SK_VOCI_SPENTE, nuove, orgId, null)
      setSpente(nuove)
      window.dispatchEvent(new CustomEvent(EVENTO_VOCI_SPENTE, { detail: nuove }))
    } catch {
      if (notify) notify('Non è stato salvato. Controlla la connessione e riprova.', false)
    } finally {
      setSalvando('')
    }
  }

  const nomi = useMemo(() => {
    const m = {}
    for (const g of gruppi) for (const v of g.voci) m[v.id] = v.label
    return m
  }, [gruppi])
  const nomiSpenti = (spente || []).map(id => nomi[id]).filter(Boolean)

  return (
    <div style={carta(isMobile)}>
      <h3 style={titolo}>Voci del menu</h3>
      <p style={testo}>
        Spegni le pagine che non usi: escono dal menu, ma la ricerca le trova sempre.
        Vale per tutte le sedi.
      </p>
      {spente == null ? (
        <p style={testo}>Sto leggendo…</p>
      ) : (
        <>
          <p style={{ ...testo, color: T.text }}>
            {nomiSpenti.length === 0 ? 'Sono tutte accese.' : `Spente: ${nomiSpenti.join(', ')}.`}
          </p>
          {gruppi.map(g => (
            <div key={g.id}>
              <p style={nomeSezione}>{g.label}</p>
              {g.voci.map(v => {
                const accesa = !spente.includes(v.id)
                return (
                  <button key={v.id} type="button" role="switch" aria-checked={accesa}
                    onClick={() => cambia(v.id)} disabled={!!salvando}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      width: '100%', minHeight: 44, padding: '0 4px', border: 'none',
                      borderBottom: `1px solid ${T.borderSoft}`, background: 'transparent',
                      cursor: salvando ? 'wait' : 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      opacity: salvando && salvando !== v.id ? 0.6 : 1,
                    }}>
                    <span style={{ fontSize: font.size.md, color: accesa ? T.text : T.textSoft, fontWeight: accesa ? 600 : 500 }}>
                      {v.label}
                    </span>
                    <Interruttore accesa={accesa}/>
                  </button>
                )
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
