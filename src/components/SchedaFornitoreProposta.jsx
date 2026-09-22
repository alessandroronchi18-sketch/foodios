// Il pannello che propone la scheda del fornitore, letta dalla sua bolla.
//
// Richiesta del titolare, 22/09/2026: «caricando una bolla prendere tutti i
// dati e compila la scheda del fornitore».
//
// ── Come si comporta ─────────────────────────────────────────────────────
//
// Propone, non scrive. Su ogni testata delle 32 bolle vere escono 9-10 campi
// verificati (la P.IVA passa la cifra di controllo, l'IBAN il resto 97), e
// qui si dividono in due mucchi:
//
//   • **i buchi** — campi che in anagrafica sono vuoti: si riempiono, e sono
//     spuntati di partenza perché riempire un vuoto non toglie niente a
//     nessuno;
//   • **i diversi** — campi che qualcuno ha già scritto a mano e che la bolla
//     dice diversamente: si mostrano tutti e due i valori, spuntati di NO.
//     È la stessa regola scelta per i prezzi dell'import: comanda quello che
//     hai messo tu, finché non decidi il contrario.
//
// Niente si salva senza un clic. Un'anagrafica riscritta di nascosto è il
// genere di cosa che nessuno va a controllare.
import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { color as T, radius as R, font, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { datiFornitoreDaBolla, differenzeScheda } from '../lib/datiFornitoreDaBolla'

// Come si chiama ogni campo per chi lo legge, e a cosa serve. Senza la
// seconda riga, «termini_tipo» non vuol dire niente a nessuno.
const ETICHETTE = {
  nome:              ['Nome', null],
  partita_iva:       ['Partita IVA', 'serve al commercialista e alla fattura elettronica'],
  codice_fiscale:    ['Codice fiscale', 'le ditte individuali ne hanno uno oltre alla partita IVA'],
  email:             ['Email', 'è qui che gli mandi gli ordini'],
  pec:               ['PEC', 'per le raccomandate, non per gli ordini'],
  telefono:          ['Telefono', null],
  whatsapp:          ['WhatsApp', 'il numero su cui mandargli l’ordine'],
  indirizzo:         ['Indirizzo', null],
  cap:               ['CAP', null],
  citta:             ['Città', null],
  provincia:         ['Provincia', null],
  iban:              ['IBAN', 'per i bonifici: è verificato, non copiato e basta'],
  sito:              ['Sito', null],
  termini_pagamento: ['Giorni di pagamento', null],
  termini_tipo:      ['Tipo di termini', 'netti oppure fine mese'],
}

const LEGGIBILE = {
  netti: 'giorni netti',
  fine_mese: 'fine mese',
}

const mostra = (campo, v) => (campo === 'termini_tipo' ? (LEGGIBILE[v] || v) : String(v))

/**
 * @param {object}   props
 * @param {string}   props.testata     la testata del documento, verbatim
 * @param {string}   props.fornitore   il nome letto sulla bolla
 * @param {string}   props.orgId
 * @param {string}   [props.pivaCliente] la TUA partita IVA, per non scambiarla
 *                                       con quella del fornitore
 * @param {Function} props.notify
 */
export default function SchedaFornitoreProposta({ testata, fornitore, orgId, pivaCliente, notify }) {
  const suTelefono = useIsMobile()
  const suTablet = useIsTablet()
  // Il tablet in laboratorio si tocca col dito come il telefono.
  const dito = suTelefono || suTablet
  const [esistente, setEsistente] = useState(undefined) // undefined = ancora non letto
  const [scelti, setScelti] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [chiuso, setChiuso] = useState(false)

  const letto = useMemo(
    () => datiFornitoreDaBolla(testata, { fornitore, pivaCliente }),
    [testata, fornitore, pivaCliente],
  )

  // Chi c'è già in anagrafica con questo nome. Il confronto è tollerante
  // (maiuscole e spazi): «DESA s.r.l.» e «Desa S.r.l.» sono lo stesso.
  useEffect(() => {
    let vivo = true
    const nome = String(fornitore || '').trim()
    if (!orgId || !nome) { setEsistente(null); return () => { vivo = false } }
    supabase.from('fornitori')
      .select('*')
      .eq('organization_id', orgId)
      .ilike('nome', nome)
      .limit(1)
      .then(({ data }) => { if (vivo) setEsistente(data?.[0] || null) })
    return () => { vivo = false }
  }, [orgId, fornitore])

  const { vuoti, diversi } = useMemo(
    () => differenzeScheda(esistente || {}, letto.campi),
    [esistente, letto],
  )

  // I buchi partono spuntati, le differenze no.
  useEffect(() => {
    if (esistente === undefined) return
    const s = {}
    for (const v of vuoti) s[v.campo] = true
    for (const d of diversi) s[d.campo] = false
    setScelti(s)
  }, [esistente, vuoti, diversi])

  if (chiuso || esistente === undefined || !scelti) return null
  // Il solo `nome` non è una proposta: è il nome con cui abbiamo cercato.
  // Senza una testata leggibile non c'è niente da dire, e un pannello che
  // chiede di confermare quello che sai già è rumore.
  const utili = [...vuoti, ...diversi].filter(x => x.campo !== 'nome')
  if (utili.length === 0 && letto.dubbi.length === 0) return null

  const quanti = Object.values(scelti).filter(Boolean).length

  async function salva() {
    const payload = {}
    for (const [campo, preso] of Object.entries(scelti)) {
      if (!preso) continue
      const v = letto.campi[campo]
      if (v == null || v === '') continue
      // L'IBAN come lo vuole il SEPA: `datiFornitoreDaBolla` lo ha già
      // verificato e normalizzato, ma la regola sta scritta anche qui perché
      // è la stessa di `Fornitori.jsx` e le due non devono divergere.
      payload[campo] = campo === 'iban' ? String(v).replace(/\s+/g, '').toUpperCase() : v
    }
    if (!Object.keys(payload).length) { setChiuso(true); return }
    setSalvando(true)
    try {
      let err
      if (esistente?.id) {
        ({ error: err } = await supabase.from('fornitori').update(payload)
          .eq('id', esistente.id).eq('organization_id', orgId))
      } else {
        ({ error: err } = await supabase.from('fornitori')
          .insert({ ...payload, nome: payload.nome || fornitore, organization_id: orgId }))
      }
      if (err) { notify?.('Non sono riuscito a salvare la scheda: ' + err.message, false); return }
      notify?.(`Scheda di "${fornitore}" aggiornata: ${quanti} ${quanti === 1 ? 'campo' : 'campi'}`)
      setChiuso(true)
    } finally {
      setSalvando(false)
    }
  }

  const riga = (campo, nuovo, attuale) => {
    const [etichetta, aiuto] = ETICHETTE[campo] || [campo, null]
    return (
      <label key={campo} style={{
        display: 'grid',
        gridTemplateColumns: suTelefono ? '26px 1fr' : '26px 190px 1fr',
        gap: 10, alignItems: 'start', padding: '9px 0',
        borderTop: `1px solid ${T.borderSoft}`, cursor: 'pointer',
      }}>
        <input type="checkbox" checked={!!scelti[campo]} style={{ width: 18, height: 18, marginTop: 2, accentColor: T.brand }}
          onChange={e => setScelti(s => ({ ...s, [campo]: e.target.checked }))} />
        <div>
          <div style={{ fontSize: font.size.base, fontWeight: 700, color: T.text }}>{etichetta}</div>
          {aiuto && <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>{aiuto}</div>}
        </div>
        <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.5, wordBreak: 'break-word' }}>
          <span style={{ fontWeight: 700, color: T.text }}>{mostra(campo, nuovo)}</span>
          {attuale != null && (
            <span style={{ color: T.textSoft }}> — adesso c&apos;è <s>{mostra(campo, attuale)}</s></span>
          )}
        </div>
      </label>
    )
  }

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: suTelefono ? '14px 14px' : '16px 18px', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
        <span style={{ flexShrink: 0, marginTop: 2, color: T.brand }}><Icon name="user" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>
            {esistente ? `Completo la scheda di ${fornitore}` : `Creo la scheda di ${fornitore}`}
          </div>
          <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, lineHeight: 1.55, marginTop: 2 }}>
            Questi dati sono stampati sulla bolla. Partita IVA e IBAN li ho verificati con la loro
            cifra di controllo: se non tornavano, non li trovi qui.
          </div>
        </div>
        <button type="button" onClick={() => setChiuso(true)} aria-label="Chiudi la proposta" title="Chiudi"
          style={{
            width: dito ? 40 : 30, height: dito ? 40 : 30, padding: 0, flexShrink: 0,
            background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`,
            borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Icon name="x" size={13} />
        </button>
      </div>

      {vuoti.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {esistente ? 'Caselle vuote da riempire' : 'Dalla bolla'}
          </div>
          {vuoti.map(v => riga(v.campo, v.nuovo, null))}
        </div>
      )}

      {diversi.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.amberDark || T.amber, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Diversi da quello che hai scritto tu
          </div>
          <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.5, marginTop: 3 }}>
            Di partenza non li tocco: quello che hai messo a mano comanda, finché non decidi il contrario.
          </div>
          {diversi.map(d => riga(d.campo, d.nuovo, d.attuale))}
        </div>
      )}

      {letto.dubbi.length > 0 && (
        <ul style={{ margin: '14px 0 0', paddingLeft: 20, fontSize: typo.small.fontSize, color: T.amberDark || T.amber, lineHeight: 1.6 }}>
          {letto.dubbi.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}

      <button type="button" onClick={salva} disabled={salvando || quanti === 0}
        style={{
          marginTop: 16, padding: '11px 18px', minHeight: 44,
          background: quanti === 0 ? T.bgSubtle : T.brand,
          color: quanti === 0 ? T.textSoft : T.white,
          border: 'none', borderRadius: R.md, fontSize: font.size.base, fontWeight: 700,
          fontFamily: 'inherit', cursor: quanti === 0 || salvando ? 'default' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
        <Icon name="save" size={15} />
        {salvando ? 'Salvo…' : quanti === 0 ? 'Non hai scelto niente' : `Salva ${quanti} ${quanti === 1 ? 'campo' : 'campi'}`}
      </button>
    </div>
  )
}
