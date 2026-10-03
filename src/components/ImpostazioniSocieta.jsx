// ── Impostazioni → Società ──────────────────────────────────────────────
//
// Un'azienda può essere fatta di più società, e ognuna ha le sue sedi. Qui
// il titolare vede e corregge la mappa che manda ogni fattura elettronica
// alla sede giusta (P.IVA di chi la riceve → sedi). Di solito si riempie da
// sola: la prima volta che arriva una fattura di una società nuova, il
// caricamento lo chiede e si ricorda la risposta.
//
// Sotto, le fatture GIÀ in archivio: quelle che sanno di quale società sono
// (le ha completate lo ZIP dell'Agenzia) ma stanno su un'altra sede. Non si
// spostano da sole: si mostrano i numeri e si aspetta un sì. Il 17/09/2026
// 3.104 fatture finirono su una sede perché qualcuno aveva deciso al posto
// del titolare; qui non decide nessuno al posto suo.
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { SceltaSedi } from './DomandaSocietaSedi'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, font } from '../lib/theme'
import {
  normPiva, propostaSpostamenti, fraseSpostamento, nomiSedi, versoSedi,
} from '../lib/societaSedi'
import { caricaSocieta, aggiornaSocieta, fattureConSocieta, spostaFatture } from '../lib/societaSediArchivio'

const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('it-IT', { useGrouping: 'always' })
const euro0 = (v) => `${n0(v)} €`

const carta = (isMobile) => ({
  background: T.bgCard, borderRadius: R.xl, border: `1px solid ${T.border}`, boxShadow: S.sm,
  padding: isMobile ? '18px 16px' : '22px 26px', marginBottom: 16,
})
const titolo = { margin: 0, fontSize: font.size.lg, fontWeight: 700, color: T.text }
const testo = { fontSize: font.size.base, color: T.textSoft, lineHeight: 1.55 }
const btnGhost = {
  minHeight: 40, padding: '0 14px', borderRadius: R.md, border: `1px solid ${T.borderStr}`,
  background: T.bgCard, color: T.text, fontWeight: 600, fontSize: font.size.base, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const btnPieno = {
  minHeight: 44, padding: '0 18px', borderRadius: R.md, border: 'none',
  background: T.brand, color: T.white, fontWeight: 700, fontSize: font.size.base, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

export default function ImpostazioniSocieta({ orgId, sedi = [], notify }) {
  const isMobile = useIsMobile()
  const sediAttive = useMemo(() => (sedi || []).filter(s => s.attiva !== false), [sedi])
  const [mappa, setMappa] = useState(null)        // null = sto leggendo
  const [erroreLettura, setErroreLettura] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [nuova, setNuova] = useState({ piva: '', nome: '', sedi: [] })
  const [archivio, setArchivio] = useState(null)  // { colonna, fatture } | null
  const [erroreArchivio, setErroreArchivio] = useState('')
  const [conferma, setConferma] = useState(null)  // gruppo della proposta
  const [spostando, setSpostando] = useState('')

  const avvisa = useCallback((msg, ok = true) => { if (notify) notify(msg, ok) }, [notify])

  const leggi = useCallback(async () => {
    if (!orgId) return
    setErroreLettura('')
    try { setMappa(await caricaSocieta(orgId)) } catch (e) { setErroreLettura(e?.message || 'lettura non riuscita'); setMappa({}) }
  }, [orgId])

  const leggiArchivio = useCallback(async () => {
    if (!orgId) return
    setErroreArchivio('')
    try { setArchivio(await fattureConSocieta(supabase, orgId)) } catch (e) { setErroreArchivio(e?.message || 'lettura non riuscita'); setArchivio(null) }
  }, [orgId])

  useEffect(() => { leggi(); leggiArchivio() }, [leggi, leggiArchivio])

  const proposta = useMemo(
    () => (archivio?.colonna && mappa ? propostaSpostamenti(archivio.fatture, mappa, sediAttive) : []),
    [archivio, mappa, sediAttive],
  )

  // Ogni modifica rilegge la mappa e la salva con la versione: la domanda
  // durante un caricamento può averla cambiata un attimo fa.
  async function modifica(fn, messaggio) {
    setSalvando(true)
    try {
      const salvata = await aggiornaSocieta(orgId, fn)
      setMappa(salvata)
      if (messaggio) avvisa(messaggio)
      return true
    } catch (e) {
      avvisa('Non sono riuscito a salvare: ' + (e?.message || 'riprova'), false)
      return false
    } finally {
      setSalvando(false)
    }
  }

  const cambiaSedi = (piva, ids) => modifica(m => ({ ...m, [piva]: { ...m[piva], sedi: ids } }))
  const togli = (piva, nome) => modifica(m => { const o = { ...m }; delete o[piva]; return o },
    `${nome || 'La società'} tolta: alla prossima fattura te lo richiedo.`)

  const pivaNuova = normPiva(nuova.piva)
  const pivaValida = /^\d{11}$/.test(pivaNuova)
  const giaPresente = pivaValida && mappa && !!mappa[pivaNuova]
  async function aggiungi() {
    if (!pivaValida || !nuova.sedi.length || giaPresente) return
    const ok = await modifica(m => ({ ...m, [pivaNuova]: { nome: nuova.nome.trim(), sedi: nuova.sedi } }),
      `${nuova.nome.trim() || 'Società'} aggiunta.`)
    if (ok) setNuova({ piva: '', nome: '', sedi: [] })
  }

  async function sposta(g) {
    setConferma(null)
    setSpostando(g.piva)
    try {
      const r = await spostaFatture(supabase, orgId, g)
      if (r.errori.length) avvisa(`Spostate ${n0(r.spostate)} fatture su ${n0(g.n)}. Le altre no: ${r.errori[0]}`, false)
      else avvisa(`Spostate ${n0(r.spostate)} ${r.spostate === 1 ? 'fattura' : 'fatture'} di ${g.nome || 'P.IVA ' + g.piva}: ora ${versoSedi(g.sedi, sediAttive)}.`)
    } catch (e) {
      avvisa('Spostamento non riuscito: ' + (e?.message || 'riprova'), false)
    } finally {
      setSpostando('')
      leggiArchivio()
    }
  }

  if (!orgId) return null

  if (sediAttive.length <= 1) {
    return (
      <div style={carta(isMobile)}>
        <h3 style={titolo}>Società</h3>
        <p style={{ ...testo, margin: '6px 0 0' }}>
          Hai una sede sola: tutte le fatture vanno lì e non c&apos;è niente da impostare.
          Quando aprirai un&apos;altra sede, qui dirai a quale va ogni società.
        </p>
      </div>
    )
  }

  const voci = Object.entries(mappa || {}).sort((a, b) => (a[1].nome || a[0]).localeCompare(b[1].nome || b[0], 'it'))

  return (
    <div>
      <div style={carta(isMobile)}>
        <h3 style={titolo}>Società</h3>
        <p style={{ ...testo, margin: '6px 0 16px' }}>
          Se l&apos;azienda è fatta di più società, qui dici a quali sedi vanno le fatture di ognuna.
          Si riconoscono dalla partita IVA scritta sulla fattura elettronica. Una sede: le fatture sono
          sue. Due o più: è una spesa condivisa, divisa in base ai chili prodotti.
        </p>

        {mappa === null && <div style={testo}>Leggo le società…</div>}
        {erroreLettura && (
          <div role="alert" style={{ ...testo, color: T.red, marginBottom: 12 }}>
            Non riesco a leggere le società ({erroreLettura}).{' '}
            <button type="button" onClick={leggi} style={{ ...btnGhost, minHeight: 32, marginLeft: 4 }}>Riprova</button>
          </div>
        )}
        {mappa && !erroreLettura && !voci.length && (
          <div style={{ ...testo, background: T.bgSubtle, borderRadius: R.lg, padding: 14, marginBottom: 16 }}>
            Nessuna società ancora. Compaiono da sole la prima volta che carichi le fatture elettroniche,
            oppure aggiungile qui sotto.
          </div>
        )}

        {voci.map(([piva, v]) => (
          <div key={piva} style={{ borderTop: `1px solid ${T.borderSoft}`, padding: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text }}>{v.nome || 'Società senza nome'}</div>
                <div style={{ fontSize: font.size.sm, color: T.textSoft, fontVariantNumeric: 'tabular-nums' }}>
                  P.IVA {piva} · {v.sedi.length > 1 ? `condivise fra ${nomiSedi(v.sedi, sediAttive)}` : nomiSedi(v.sedi, sediAttive)}
                </div>
              </div>
              <button type="button" onClick={() => togli(piva, v.nome)} disabled={salvando} style={btnGhost}>
                <Icon name="trash" size={14} /> Togli
              </button>
            </div>
            <SceltaSedi sedi={sediAttive} scelte={v.sedi.filter(id => sediAttive.some(s => s.id === id))}
              onCambia={ids => cambiaSedi(piva, ids)} disabilitato={salvando} minimo={1} />
          </div>
        ))}

        {/* Aggiungere a mano: serve a chi vuole impostarla prima del primo ZIP. */}
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 14, marginTop: voci.length ? 0 : 4 }}>
          <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text, marginBottom: 10 }}>Aggiungi una società</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: 10, marginBottom: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.size.sm, color: T.textSoft, fontWeight: 600 }}>
              Partita IVA
              <input value={nuova.piva} inputMode="numeric" autoComplete="off" placeholder="11 cifre"
                onChange={e => setNuova(p => ({ ...p, piva: e.target.value }))}
                style={{ minHeight: 42, padding: '0 12px', borderRadius: R.md, border: `1px solid ${T.borderStr}`,
                  fontSize: isMobile ? font.size.lg : font.size.md, color: T.text, background: T.bgCard, fontVariantNumeric: 'tabular-nums' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.size.sm, color: T.textSoft, fontWeight: 600 }}>
              Ragione sociale
              <input value={nuova.nome} autoComplete="off" placeholder="Come sulla fattura"
                onChange={e => setNuova(p => ({ ...p, nome: e.target.value }))}
                style={{ minHeight: 42, padding: '0 12px', borderRadius: R.md, border: `1px solid ${T.borderStr}`,
                  fontSize: isMobile ? font.size.lg : font.size.md, color: T.text, background: T.bgCard }} />
            </label>
          </div>
          <SceltaSedi sedi={sediAttive} scelte={nuova.sedi} onCambia={ids => setNuova(p => ({ ...p, sedi: ids }))} disabilitato={salvando} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={aggiungi} disabled={salvando || !pivaValida || !nuova.sedi.length || giaPresente}
              style={{ ...btnPieno, opacity: salvando || !pivaValida || !nuova.sedi.length || giaPresente ? 0.5 : 1,
                cursor: salvando || !pivaValida || !nuova.sedi.length || giaPresente ? 'not-allowed' : 'pointer' }}>
              <Icon name="plus" size={14} /> Aggiungi
            </button>
            <span style={{ fontSize: font.size.sm, color: giaPresente ? T.amberDark : T.textSoft }}>
              {nuova.piva && !pivaValida ? 'La partita IVA ha 11 cifre.'
                : giaPresente ? 'Questa società c’è già: cambia le sue sedi qui sopra.'
                  : !nuova.sedi.length && pivaValida ? 'Scegli almeno una sede.' : ''}
            </span>
          </div>
        </div>
      </div>

      <div style={carta(isMobile)}>
        <h3 style={titolo}>Fatture già caricate</h3>
        <p style={{ ...testo, margin: '6px 0 14px' }}>
          Le fatture nuove vanno da sole alla sede della loro società. Quelle già in archivio no: se qualcuna
          sta sulla sede sbagliata, la trovi qui e decidi tu se spostarla.
        </p>
        {!archivio && !erroreArchivio && <div style={testo}>Controllo le fatture già caricate…</div>}
        {erroreArchivio && (
          <div role="alert" style={{ ...testo, color: T.red }}>
            Non riesco a leggere le fatture ({erroreArchivio}).{' '}
            <button type="button" onClick={leggiArchivio} style={{ ...btnGhost, minHeight: 32, marginLeft: 4 }}>Riprova</button>
          </div>
        )}
        {archivio && !archivio.colonna && (
          <div style={{ ...testo, background: T.bgSubtle, borderRadius: R.lg, padding: 14 }}>
            Questo controllo sarà disponibile dopo il prossimo aggiornamento del database. Le fatture nuove
            vanno già alla sede giusta.
          </div>
        )}
        {archivio?.colonna && !archivio.fatture.length && (
          <div style={{ ...testo, background: T.bgSubtle, borderRadius: R.lg, padding: 14 }}>
            Nessuna fattura in archivio sa ancora di quale società è. Lo impara quando carichi lo ZIP
            dell&apos;Agenzia delle Entrate: le fatture che ci sono già si completano.
          </div>
        )}
        {archivio?.colonna && archivio.fatture.length > 0 && !proposta.length && (
          <div style={{ ...testo, background: T.bgSubtle, borderRadius: R.lg, padding: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="checkCircle" size={16} color={T.green} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {n0(archivio.fatture.length)} {archivio.fatture.length === 1 ? 'fattura sa' : 'fatture sanno'} di
              quale società {archivio.fatture.length === 1 ? 'è' : 'sono'}, e {archivio.fatture.length === 1 ? 'sta' : 'stanno'} già
              nella sede giusta.
            </span>
          </div>
        )}
        {proposta.map(g => (
          <div key={g.piva} style={{ border: `1px solid ${T.bordoAvviso}`, background: T.fondoAvviso, borderRadius: R.lg, padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: font.size.md, color: T.text, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
              {fraseSpostamento(g, sediAttive)}
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => setConferma(g)} disabled={!!spostando}
                style={{ ...btnPieno, width: isMobile ? '100%' : 'auto', justifyContent: 'center', opacity: spostando ? 0.6 : 1 }}>
                {spostando === g.piva ? 'Sposto…' : `Sposta ${n0(g.n)} ${g.n === 1 ? 'fattura' : 'fatture'}`}
              </button>
            </div>
          </div>
        ))}
      </div>

      {conferma && (
        <ConfermaSpostamento gruppo={conferma} sedi={sediAttive} isMobile={isMobile}
          onAnnulla={() => setConferma(null)} onConferma={() => sposta(conferma)} />
      )}
    </div>
  )
}

function ConfermaSpostamento({ gruppo: g, sedi, isMobile, onAnnulla, onConferma }) {
  useEffect(() => {
    const suTasto = e => { if (e.key === 'Escape') onAnnulla() }
    document.addEventListener('keydown', suTasto)
    return () => document.removeEventListener('keydown', suTasto)
  }, [onAnnulla])
  const quante = `${n0(g.n)} ${g.n === 1 ? 'fattura' : 'fatture'}`
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <button type="button" onClick={onAnnulla} aria-label="Chiudi senza spostare"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', padding: 0, margin: 0,
          background: T.tooltipBg, opacity: 0.55, cursor: 'default' }} />
      <div role="dialog" aria-modal="true" aria-label={`Spostare ${quante}?`}
        style={{ position: 'relative', background: T.bgCard, borderRadius: R.xl, boxShadow: S.xl, width: '100%', maxWidth: 480,
          padding: isMobile ? 18 : 24 }}>
        <div style={{ fontSize: font.size.xl, fontWeight: 800, color: T.text, marginBottom: 8 }}>Spostare {quante}?</div>
        <div style={{ ...testo, marginBottom: 12 }}>
          Sono di {g.nome || `P.IVA ${g.piva}`} e andranno {versoSedi(g.sedi, sedi)}.
        </div>
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.base, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ color: T.textSoft, textAlign: 'left' }}>
                <th style={{ padding: '6px 4px', fontWeight: 600 }}>Oggi</th>
                <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'right' }}>Fatture</th>
                <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'right' }}>Totale</th>
              </tr>
            </thead>
            <tbody>
              {g.da.map((d, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${T.borderSoft}`, color: T.text }}>
                  <td style={{ padding: '6px 4px' }}>{d.sedi.length ? (d.condivisa ? `Condivise fra ${nomiSedi(d.sedi, sedi)}` : nomiSedi(d.sedi, sedi)) : 'Senza sede'}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{n0(d.n)}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{euro0(d.totale)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `1px solid ${T.border}`, fontWeight: 700, color: T.text }}>
                <td style={{ padding: '6px 4px' }}>Totale</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{n0(g.n)}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{euro0(g.totale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ ...testo, marginBottom: 18 }}>
          Cambia solo la sede. Numero, importo e pagamenti restano come sono. I conti per sede si
          aggiornano da soli.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onAnnulla} style={{ ...btnGhost, minHeight: 44, flex: isMobile ? '1 1 auto' : '0 0 auto', justifyContent: 'center' }}>Annulla</button>
          <button type="button" onClick={onConferma} style={{ ...btnPieno, flex: isMobile ? '1 1 auto' : '0 0 auto', justifyContent: 'center' }}>
            Sì, sposta {quante}
          </button>
        </div>
      </div>
    </div>
  )
}
