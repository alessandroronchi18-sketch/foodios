// ── Collegare un nome del foglio alla sua ricetta ─────────────────────────
//
// Nel foglio dell'inventario i gusti si chiamano come li scrive chi compila
// (MISTIC, la ricetta è MYSTIC): senza collegamento quel gelato vale zero
// euro. Qui si vede quanto manca e si collega, una volta, per tutti i
// periodi (`pasticceria-nomi-gusti-v1`, vedi tests/unit/gustiSenzaRicetta).
// Spostato qui dalla pagina il 04/10/2026, con gli stessi testi.
import React, { useMemo, useState } from 'react'
import { color as T, font, radius as R, tnum } from '../../lib/theme'
import { ricetteSimili } from '../../lib/nomiGusti'
import { euro } from '../../lib/formatoAnalisi'
import { kg, intero, prezzoNetto } from './numeri'

export default function GustiSenzaRicetta({ senzaRicetta, collegati, euroKgMedio, ricettario, collega, pronto, onNavigate, isMobile }) {
  const [scelte, setScelte] = useState({})
  const [salvo, setSalvo] = useState(null)
  const [errore, setErrore] = useState(null)
  const [tutti, setTutti] = useState(false)
  const kgVenduti = senzaRicetta.reduce((s, r) => s + r.vendKg, 0)
  // Gli euro senza IVA, come il ricavo stimato della pagina e il Mese; il
  // prezzo si scrive quello al banco, che Mara riconosce.
  const netto = prezzoNetto(euroKgMedio)
  const kgProdotti = senzaRicetta.reduce((s, r) => s + r.prodKg, 0)
  const ricetteGusto = useMemo(() => Object.entries(ricettario?.ricette || {})
    .filter(([, r]) => !['semilavorato', 'interno'].includes(String(r?.tipo || '').toLowerCase()))
    .map(([chiave, r]) => ({ chiave, nome: r?.nome || chiave }))
    .sort((a, b) => a.nome.localeCompare(b.nome)), [ricettario])
  const proposte = useMemo(() => {
    const out = {}
    for (const r of senzaRicetta) out[r.gusto] = ricetteSimili(r.gusto, ricettario)
    return out
  }, [senzaRicetta, ricettario])
  // Si preseleziona solo una proposta molto simile; le altre le sceglie il
  // titolare. Il collegamento parte comunque solo col pulsante.
  const sceltaDi = (g) => scelte[g] ?? ((proposte[g]?.[0]?.punti || 0) >= 0.85 ? proposte[g][0].chiave : '')

  async function fai(gusto, ricetta) {
    if (salvo) return
    setSalvo(gusto); setErrore(null)
    try { await collega(gusto, ricetta) }
    catch (e) { setErrore(`Non sono riuscito a salvare (${e?.message || 'rete'}): il collegamento non è stato fatto.`) }
    finally { setSalvo(null) }
  }

  const campo = {
    minHeight: 44, padding: '8px 10px', borderRadius: R.md, border: `1px solid ${T.border}`,
    background: T.bgCard, color: T.text, fontSize: font.size.md, fontFamily: 'inherit',
    minWidth: 0, flex: isMobile ? '1 1 100%' : '1 1 220px', boxSizing: 'border-box',
  }
  const pulsante = (attivo) => ({
    minHeight: 44, padding: '0 16px', borderRadius: R.md, border: `1px solid ${T.brand}`,
    background: attivo ? T.brand : T.bgCard, color: attivo ? T.white : T.brand,
    fontSize: font.size.sm, fontWeight: 700, cursor: attivo ? 'pointer' : 'default',
    opacity: attivo ? 1 : 0.5, whiteSpace: 'nowrap', fontFamily: 'inherit',
  })
  const link = {
    background: 'none', border: 'none', padding: '0 2px', minHeight: 44, color: T.brand, cursor: 'pointer',
    fontSize: font.size.sm, fontFamily: 'inherit', textDecoration: 'underline',
  }
  const elencoVisibile = tutti ? senzaRicetta : senzaRicetta.slice(0, 6)

  return (
    <div data-senza-ricetta style={{
      background: T.fondoAvviso, border: `1px solid ${T.bordoAvviso}`, borderRadius: R.xl,
      padding: '12px 14px', fontSize: font.size.sm, color: T.amberDark, lineHeight: 1.5,
    }}>
      {senzaRicetta.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <b>
            {senzaRicetta.length === 1 ? 'Un gusto non trova la ricetta' : `${intero(senzaRicetta.length)} gusti non trovano la ricetta`}
          </b>: {kg(kgVenduti)} kg venduti ({kg(kgProdotti)} kg prodotti) che sono nel ricavo ma non nel margine: senza ricetta non se ne sa il costo.
          {/* Il prezzo detto è quello senza IVA, lo stesso con cui si fa il
              conto: prima diceva 29,49 €/kg (con l'IVA) accanto a un ricavo
              calcolato su 26,81 (05/10/2026). */}
          {euroKgMedio != null && netto != null && (
            <> Al prezzo medio dei formati senza IVA ({euro(netto, { decimali: 2 }).replace(' €', '')} €/kg)
              sono circa <b>{euro(kgVenduti * netto)}</b> di ricavo fuori dal margine.</>
          )}
          {' '}Di solito è il nome scritto in un altro modo: collegalo alla sua ricetta, una volta, e vale per tutti i periodi.
        </div>
      )}
      {senzaRicetta.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {elencoVisibile.map((r) => {
            const prop = proposte[r.gusto] || []
            const scelta = sceltaDi(r.gusto)
            return (
              <div key={r.gusto} style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.md, padding: '8px 10px', color: T.text,
              }}>
                <span style={{ flex: isMobile ? '1 1 100%' : '0 1 200px', minWidth: 0 }}>
                  <b>{r.gusto}</b>
                  <span style={{ display: 'block', color: T.textSoft, ...tnum }}>
                    {kg(r.vendKg)} kg venduti{netto != null ? ` · circa ${euro(r.vendKg * netto)}` : ''}
                  </span>
                </span>
                <select aria-label={`Ricetta di ${r.gusto}`} value={scelta} disabled={!pronto}
                  onChange={(e) => setScelte(x => ({ ...x, [r.gusto]: e.target.value }))} style={campo}>
                  <option value="">{prop.length ? 'Scegli la ricetta…' : 'Nessuna ricetta simile: scegli dall\'elenco…'}</option>
                  {prop.length > 0 && (
                    <optgroup label="Simili">
                      {prop.map(p => <option key={`s-${p.chiave}`} value={p.chiave}>{p.nome}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="Tutte le ricette">
                    {ricetteGusto.map(p => <option key={p.chiave} value={p.chiave}>{p.nome}</option>)}
                  </optgroup>
                </select>
                <button type="button" disabled={!pronto || !scelta || salvo != null}
                  onClick={() => fai(r.gusto, scelta)} style={pulsante(pronto && !!scelta && salvo == null)}>
                  {salvo === r.gusto ? 'Salvo…' : 'Collega'}
                </button>
              </div>
            )
          })}
          {senzaRicetta.length > 6 && (
            <button type="button" onClick={() => setTutti(v => !v)}
              style={{ ...pulsante(true), background: 'transparent', color: T.amberDark, borderColor: T.bordoAvviso, alignSelf: 'flex-start' }}>
              {tutti ? 'Mostra solo i primi 6' : `Vedi tutti e ${intero(senzaRicetta.length)}`}
            </button>
          )}
          {onNavigate && (
            <span>
              Se la ricetta non c&apos;è proprio, va creata:{' '}
              <button type="button" onClick={() => onNavigate('ricettario')} style={{ ...link, padding: 0, fontWeight: 700 }}>
                apri il Ricettario
              </button>.
            </span>
          )}
        </div>
      )}
      {collegati.length > 0 && (
        <div style={{ marginTop: senzaRicetta.length > 0 ? 10 : 0, color: T.textMid }}>
          {/* Uno per riga e che va a capo: con «nowrap» e tutti di fila, al
              telefono la riga usciva dallo schermo (foto del 05/10/2026,
              Menu engineering: 339 px di sforamento con i collegati di Mara). */}
          <b>Collegati:</b>{' '}
          {collegati.map((r) => (
            <span key={r.gusto} data-collegato style={{ display: 'block' }}>
              {r.gusto} → {r.ricetta}{' '}
              <button type="button" disabled={salvo != null} onClick={() => fai(r.gusto, null)}
                aria-label={`Scollega ${r.gusto}`} style={link}>
                {salvo === r.gusto ? 'salvo…' : 'scollega'}
              </button>
            </span>
          ))}
        </div>
      )}
      {errore && <div role="alert" style={{ marginTop: 8, color: T.red, fontWeight: 700 }}>{errore}</div>}
    </div>
  )
}
