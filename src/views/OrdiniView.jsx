// Gli ordini ai fornitori.
//
// ── Perché questa pagina esiste ──────────────────────────────────────────
//
// Il titolare, 22/09/2026: «attualmente gli ordini vengono fatti su
// whatsapp». Non c'è niente di sbagliato in WhatsApp: è dove il fornitore
// risponde. Quello che manca è tutto il resto — cosa sta finendo, quanto
// ordinarne, a chi, e cosa era stato chiesto quando poi arriva la bolla.
//
// Quindi qui non si sostituisce WhatsApp: si prepara il messaggio **giusto**
// da incollarci, e si tiene il conto di quello che è stato chiesto.
//
// ── Le decisioni che la governano, tutte del titolare (22/09/2026) ───────
//
//  • L'ordine **non tocca il magazzino**. È un'intenzione, non merce: la
//    giacenza la muove la bolla, quando la roba arriva. Se caricasse anche
//    l'ordine, poi arriva la bolla e si conta tutto due volte.
//  • **Un conto solo** per «quanto ordinare», lo stesso della pagina
//    Magazzino (`src/lib/riordino.js`). Prima erano due e per la stessa
//    farina dicevano 18 kg e 28 kg.
//  • La mail **si prepara, non si manda**: si apre il programma di posta già
//    compilato. Mandarla da Foodos vuole l'antispam sbloccato e un dominio
//    vivo, e si farà quando servirà.
//  • Il messaggio WhatsApp **si copia**: un pulsante, e lo incolli nella
//    chat del fornitore.
//  • Chi vede questa pagina lo decide il database: il titolare, e i
//    dipendenti a cui è stato dato il permesso.
import React, { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { supabase } from '../lib/supabase'
import { sload } from '../lib/storage'
import { SK_MAG, SK_CHIUS, SK_RIC } from '../lib/storageKeys'
import { color as T, radius as R, font, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { PageHeader, SH, KPI, fmt as fmtEuro } from './_shared'
import { buildIngCosti, normIng } from '../lib/foodcost'
import { fornitoreDiIngrediente } from '../lib/fornitoreIngrediente'
import { cadenzaConsegne } from '../lib/pagamentiFornitore'
import { consumoGiornaliero, giornateContate, GIORNI_FINESTRA } from '../lib/consumoGiornaliero'
import { righeDaRiordinare, fmtQuantita } from '../lib/riordino'
import { testoOrdineWhatsApp, testoOrdineEmail, mailtoOrdine } from '../lib/testoOrdine'
import { giorniFaLocal } from '../lib/dateLocal'

// La chiave del gruppo «roba senza fornitore collegato». Non è un nome vero,
// e non può esserlo: un fornitore che si chiamasse così finirebbe lì dentro.
const SENZA_FORNITORE = '--senza-fornitore--'

/**
 * Copia negli appunti, col ripiego per i browser che non hanno l'API.
 *
 * Su iOS, dentro un'app installata, `navigator.clipboard` c'è ma rifiuta:
 * senza il ripiego il pulsante non fa niente e nessuno capisce perché.
 */
async function copiaNegliAppunti(testo) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(testo); return true }
  } catch { /* si prova l'altra strada */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = testo
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, testo.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

export default function OrdiniView({ orgId, sedeId, notify, azienda = null, sede = null }) {
  const suTelefono = useIsMobile()
  const suTablet = useIsTablet()
  const dito = suTelefono || suTablet

  const [loading, setLoading] = useState(true)
  const [magazzino, setMagazzino] = useState({})
  const [chiusure, setChiusure] = useState([])
  const [ricettario, setRicettario] = useState(null)
  const [fornitori, setFornitori] = useState([])
  const [fattureDate, setFattureDate] = useState([])
  const [ordini, setOrdini] = useState([])
  const [aperto, setAperto] = useState(null)
  const [quantita, setQuantita] = useState({})
  const [esclusi, setEsclusi] = useState({})
  const [note, setNote] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    let vivo = true
    async function carica() {
      setLoading(true)
      const [m, c, r, f, fat, ord] = await Promise.all([
        sedeId ? sload(SK_MAG, orgId, sedeId) : Promise.resolve({}),
        sedeId ? sload(SK_CHIUS, orgId, sedeId) : Promise.resolve([]),
        sload(SK_RIC, orgId, null),
        supabase.from('fornitori').select('*').eq('organization_id', orgId).eq('attivo', true),
        // Solo due colonne: da qui si impara ogni quanto ogni fornitore
        // consegna davvero, ed è quello che decide quanta scorta serve.
        supabase.from('fatture').select('fornitore, data_fattura')
          .eq('organization_id', orgId).gte('data_fattura', giorniFaLocal(400)).order('data_fattura'),
        supabase.from('ordini_fornitori')
          .select('*, fornitori(nome), righe_ordine(prodotto,quantita,unita)')
          .eq('organization_id', orgId).order('data_ordine', { ascending: false }).limit(30),
      ])
      if (!vivo) return
      setMagazzino(m && typeof m === 'object' ? m : {})
      setChiusure(Array.isArray(c) ? c : [])
      setRicettario(r && typeof r === 'object' ? r : null)
      setFornitori(f?.data || [])
      setFattureDate(fat?.data || [])
      setOrdini(ord?.data || [])
      setLoading(false)
    }
    carica()
    return () => { vivo = false }
  }, [orgId, sedeId])

  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const consumo = useMemo(() => consumoGiornaliero(chiusure, ricettario), [chiusure, ricettario])
  const giornate = useMemo(() => giornateContate(chiusure), [chiusure])

  const fornitoriPerNome = useMemo(() => {
    const m = new Map()
    for (const f of fornitori) if (f?.nome) m.set(String(f.nome).trim().toLowerCase(), f)
    return m
  }, [fornitori])

  // Ogni quanto passa davvero ogni fornitore, imparato dalle sue fatture.
  const cadenzaPer = useMemo(() => {
    const per = new Map()
    for (const f of fattureDate) {
      const k = String(f?.fornitore || '').trim().toLowerCase()
      if (!k) continue
      if (!per.has(k)) per.set(k, [])
      per.get(k).push(f)
    }
    const out = new Map()
    for (const [k, righe] of per) {
      const c = cadenzaConsegne(righe)
      if (c) out.set(k, c)
    }
    return out
  }, [fattureDate])

  // ── Cosa manca, per fornitore ─────────────────────────────────────────
  //
  // Lo stesso conto della pagina Magazzino, dalla stessa libreria: due pagine
  // che rispondevano in modo diverso sulla stessa farina sono il difetto da
  // cui è nato tutto questo.
  const gruppi = useMemo(() => {
    const listino = ricettario?.ingredienti_costi || {}
    const righe = []
    for (const [chiave, voce] of Object.entries(magazzino || {})) {
      const k = normIng(chiave)
      const forn = fornitoreDiIngrediente(listino, chiave)
      const nomeForn = forn?.nome || null
      const dati = nomeForn ? fornitoriPerNome.get(nomeForn.toLowerCase()) : null
      const cad = nomeForn ? cadenzaPer.get(nomeForn.toLowerCase()) : null
      const prezzo = ingCosti[k]
      righe.push({
        chiave: k,
        nome: voce?.nome || chiave,
        giacenza: Number(voce?.giacenza_g) || 0,
        soglia: Number(voce?.soglia_g) || 0,
        consumoGiornaliero: consumo[k] ?? null,
        cadenzaGiorni: cad?.giorni ?? null,
        leadTimeGiorni: Number(dati?.lead_time_giorni) > 0 ? Number(dati.lead_time_giorni) : null,
        // Una stima HORECA non è un prezzo: se entrasse nella spesa stimata,
        // un numero indovinato si leggerebbe come un numero misurato.
        costoKg: prezzo && !prezzo.isStima ? prezzo.costoKg : null,
        inMagazzino: true,
        fornitore: nomeForn,
        datiFornitore: dati || null,
      })
    }
    const daOrdinare = righeDaRiordinare(righe)
    const per = new Map()
    for (const r of daOrdinare) {
      const k = r.fornitore ? r.fornitore.toLowerCase() : SENZA_FORNITORE
      if (!per.has(k)) {
        per.set(k, {
          chiave: k, fornitore: r.fornitore, dati: r.datiFornitore,
          cadenza: r.cadenzaGiorni, righe: [], stima: 0, stimaNota: true,
        })
      }
      const g = per.get(k)
      g.righe.push(r)
      if (r.costoStimato == null) g.stimaNota = false
      else g.stima += r.costoStimato
    }
    return [...per.values()]
      .map(g => ({ ...g, stima: g.stimaNota ? g.stima : null }))
      .sort((a, b) => {
        if ((a.fornitore == null) !== (b.fornitore == null)) return a.fornitore == null ? 1 : -1
        const ua = a.righe.some(r => r.urgenza === 'alta')
        const ub = b.righe.some(r => r.urgenza === 'alta')
        if (ua !== ub) return ua ? -1 : 1
        return String(a.fornitore || '').localeCompare(String(b.fornitore || ''), 'it')
      })
  }, [magazzino, ricettario, ingCosti, consumo, fornitoriPerNome, cadenzaPer])

  const totali = useMemo(() => {
    const voci = gruppi.reduce((s, g) => s + g.righe.length, 0)
    const urgenti = gruppi.reduce((s, g) => s + g.righe.filter(r => r.urgenza === 'alta').length, 0)
    const conStima = gruppi.filter(g => g.stima != null)
    return {
      voci, urgenti,
      fornitori: gruppi.filter(g => g.fornitore).length,
      senzaFornitore: gruppi.find(g => !g.fornitore)?.righe.length || 0,
      // La somma si mostra solo se **tutti** i pezzi si sanno: una spesa
      // stimata che salta le voci senza prezzo è più bassa del vero, e più
      // bassa del vero è la bugia che fa spendere.
      stima: gruppi.length > 0 && conStima.length === gruppi.length
        ? conStima.reduce((s, g) => s + g.stima, 0) : null,
    }
  }, [gruppi])

  // ── L'ordine che si sta componendo ────────────────────────────────────
  const gruppoAperto = useMemo(() => gruppi.find(g => g.chiave === aperto) || null, [gruppi, aperto])

  const righeScelte = useMemo(() => {
    if (!gruppoAperto) return []
    return gruppoAperto.righe
      .filter(r => !esclusi[r.chiave])
      .map(r => {
        const corretta = quantita[r.chiave]
        const g = corretta === '' || corretta == null
          ? r.quantitaG
          : Math.round(Number(String(corretta).replace(',', '.')) * 1000)
        return {
          nome: r.nome,
          quantitaG: Number.isFinite(g) && g > 0 ? g : null,
          costoKg: r.costoKg,
        }
      })
  }, [gruppoAperto, esclusi, quantita])

  const stimaScelta = useMemo(() => {
    if (!righeScelte.length) return null
    let s = 0
    for (const r of righeScelte) {
      if (r.costoKg == null || r.quantitaG == null) return null
      s += (r.quantitaG / 1000) * r.costoKg
    }
    return s
  }, [righeScelte])

  const contesto = useMemo(() => ({
    righe: righeScelte,
    azienda: azienda || null,
    sede: sede || null,
    note: note.trim() || null,
    minimoOrdine: gruppoAperto?.dati?.minimo_ordine ?? null,
    stimaTotale: stimaScelta,
  }), [righeScelte, azienda, sede, note, gruppoAperto, stimaScelta])

  const testoWa = useMemo(() => (righeScelte.length ? testoOrdineWhatsApp(contesto) : ''), [righeScelte, contesto])
  const mail = useMemo(() => (righeScelte.length ? testoOrdineEmail(contesto) : null), [righeScelte, contesto])

  function apri(g) {
    setAperto(a => (a === g.chiave ? null : g.chiave))
    setQuantita({}); setEsclusi({}); setNote('')
  }

  async function copia(testo, cosa) {
    const ok = await copiaNegliAppunti(testo)
    notify?.(ok ? cosa + ' copiato: incollalo e mandalo.' : 'Non sono riuscito a copiare: seleziona il testo a mano.', ok)
  }

  /**
   * Segna l'ordine come mandato.
   *
   * Scrive due tabelle, e se la seconda fallisce disfa la prima: un ordine
   * senza righe è peggio di nessun ordine, perché sembra vero.
   *
   * **Non tocca il magazzino**: la merce entra con la bolla.
   */
  async function segnaFatto() {
    if (!gruppoAperto || !righeScelte.length || salvando) return
    setSalvando(true)
    try {
      const { data: testa, error: e1 } = await supabase.from('ordini_fornitori').insert({
        organization_id: orgId,
        fornitore_id: gruppoAperto.dati?.id || null,
        stato: 'inviato',
        totale: stimaScelta != null ? Number(stimaScelta.toFixed(2)) : 0,
        note: note.trim() || null,
      }).select('id').single()
      if (e1 || !testa?.id) {
        notify?.('Non sono riuscito a registrare l ordine: ' + (e1?.message || 'errore'), false)
        return
      }
      const { error: e2 } = await supabase.from('righe_ordine').insert(
        righeScelte.map(r => ({
          ordine_id: testa.id,
          prodotto: r.nome,
          quantita: r.quantitaG != null ? Number((r.quantitaG / 1000).toFixed(3)) : 0,
          unita: 'kg',
        })),
      )
      if (e2) {
        await supabase.from('ordini_fornitori').delete().eq('id', testa.id).eq('organization_id', orgId)
        notify?.('Non sono riuscito a salvare le righe: l ordine non e stato registrato.', false)
        return
      }
      notify?.('Ordine a ' + (gruppoAperto.fornitore || 'fornitore') + ' registrato. La merce entrera in magazzino quando caricherai la bolla.')
      setAperto(null)
      const { data } = await supabase.from('ordini_fornitori')
        .select('*, fornitori(nome), righe_ordine(prodotto,quantita,unita)')
        .eq('organization_id', orgId).order('data_ordine', { ascending: false }).limit(30)
      setOrdini(data || [])
    } finally {
      setSalvando(false)
    }
  }

  if (!orgId) return null

  const card = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
    padding: suTelefono ? '14px 14px' : '18px 20px', marginBottom: 16,
  }
  const campo = {
    width: '100%', padding: '10px 12px', borderRadius: R.md,
    border: `1px solid ${T.borderStr}`, fontSize: font.size.lg,
    boxSizing: 'border-box', fontFamily: 'inherit', background: T.bgCard, color: T.text,
  }
  const bottone = (pieno) => ({
    padding: '11px 16px', minHeight: dito ? 48 : 44,
    background: pieno ? T.brand : 'transparent',
    color: pieno ? T.white : T.textMid,
    border: pieno ? 'none' : `1px solid ${T.borderStr}`,
    borderRadius: R.md, fontSize: font.size.base, fontWeight: 700,
    fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
  })

  return (
    <div>
      <PageHeader
        titolo="Ordini"
        sottotitolo="Cosa sta finendo, quanto ordinarne e a chi. Il messaggio esce pronto da incollare; la merce entra in magazzino quando carichi la bolla, non adesso."
      />

      {loading ? (
        <div style={{ ...card, color: T.textSoft }}>Caricamento…</div>
      ) : (
        <>
          <div style={{
            display: 'grid', gap: 16, marginBottom: 22,
            gridTemplateColumns: suTelefono ? '1fr 1fr' : 'repeat(4, 1fr)',
          }}>
            <KPI icona="cart" label="Da ordinare" val={String(totali.voci)}
              sub={totali.voci === 1 ? 'materia prima' : 'materie prime'} />
            <KPI icona="alert" label="Urgenti" val={String(totali.urgenti)}
              color={totali.urgenti > 0 ? T.red : undefined}
              sub={totali.urgenti > 0 ? 'sotto scorta o finite' : 'niente di urgente'} />
            <KPI icona="truck" label="Fornitori da sentire" val={String(totali.fornitori)}
              sub={totali.senzaFornitore > 0 ? `${totali.senzaFornitore} senza fornitore` : 'tutti collegati'} />
            <KPI icona="euro" label="Spesa stimata"
              val={totali.stima != null ? fmtEuro(totali.stima) : '—'}
              sub={totali.stima != null ? 'coi prezzi che conosci' : 'manca qualche prezzo'} />
          </div>

          {giornate < 7 && (
            <div style={{ ...card, background: T.amberLight, border: `1px solid ${T.amber}55`, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, marginTop: 1, color: T.amber }}><Icon name="warning" size={17} /></span>
              <div style={{ fontSize: font.size.base, color: T.amberDark || T.textMid, lineHeight: 1.6 }}>
                Le quantità qui sotto sono costruite su <b>{giornate} {giornate === 1 ? 'giornata registrata' : 'giornate registrate'}</b> negli
                ultimi {GIORNI_FINESTRA} giorni: poche per sapere quanto si consuma davvero.
                Registra qualche chiusura di cassa in più e i numeri diventano affidabili.
              </div>
            </div>
          )}

          <SH sub="Una scheda per fornitore. Dentro, cosa sta finendo e quanto ne serve fino alla sua prossima consegna.">
            Cosa manca
          </SH>

          {gruppi.length === 0 && (
            <div style={{ ...card, color: T.textSoft, fontSize: font.size.base, lineHeight: 1.65 }}>
              Non c&apos;è niente da ordinare. O va tutto bene, o il magazzino non è ancora stato
              contato: una materia prima mai inventariata non si ordina, perché non si sa se in
              cantina ce ne sono venti chili.
            </div>
          )}

          {gruppi.map(g => {
            const apertoQui = aperto === g.chiave
            const urgenti = g.righe.filter(r => r.urgenza === 'alta').length
            const numero = g.dati?.whatsapp || g.dati?.telefono || null
            return (
              <div key={g.chiave} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <button type="button" onClick={() => apri(g)} aria-expanded={apertoQui}
                  style={{
                    width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                    padding: suTelefono ? '14px' : '16px 20px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit',
                    minHeight: dito ? 56 : 0,
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>
                      {g.fornitore || 'Senza fornitore collegato'}
                    </div>
                    <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, marginTop: 2, lineHeight: 1.5 }}>
                      {g.righe.length} {g.righe.length === 1 ? 'voce' : 'voci'}
                      {urgenti > 0 && <span style={{ color: T.red, fontWeight: 700 }}> · {urgenti} {urgenti === 1 ? 'urgente' : 'urgenti'}</span>}
                      {g.cadenza ? ` · passa ogni ${g.cadenza} giorni` : ''}
                      {g.stima != null ? ` · circa ${fmtEuro(g.stima)}` : ''}
                    </div>
                  </div>
                  <span style={{ color: T.textSoft, flexShrink: 0, display: 'inline-flex' }}>
                    <Icon name={apertoQui ? 'chevDown' : 'chevR'} size={16} />
                  </span>
                </button>

                {apertoQui && (
                  <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgSubtle, padding: suTelefono ? '14px' : '16px 20px' }}>
                    {!g.fornitore && (
                      <div style={{ fontSize: font.size.base, color: T.amberDark || T.amber, lineHeight: 1.6, marginBottom: 12 }}>
                        Queste materie prime non hanno un fornitore collegato, quindi non so a chi
                        chiederle. Collegale in <b>Fornitori</b>, alla scheda di chi vende cosa: poi
                        compariranno nel gruppo giusto.
                      </div>
                    )}

                    {g.righe.map(r => (
                      <div key={r.chiave} style={{
                        display: 'grid',
                        gridTemplateColumns: suTelefono ? '26px 1fr 100px' : '26px 1fr 140px',
                        gap: 10, alignItems: 'center', padding: '10px 0',
                        borderTop: `1px solid ${T.borderSoft}`,
                      }}>
                        <input type="checkbox" checked={!esclusi[r.chiave]}
                          style={{ width: 18, height: 18, accentColor: T.brand }}
                          aria-label={`Metti ${r.nome} nell'ordine`}
                          onChange={e => setEsclusi(s => ({ ...s, [r.chiave]: !e.target.checked }))} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: font.size.base, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.nome}
                            {r.urgenza === 'alta' && (
                              <span style={{ color: T.red, marginLeft: 6, fontSize: typo.caption.fontSize, fontWeight: 700 }}>urgente</span>
                            )}
                          </div>
                          <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>
                            {r.perche || 'non so quanto se ne consuma'}
                          </div>
                        </div>
                        <input style={{ ...campo, textAlign: 'right', padding: '9px 10px' }}
                          inputMode="decimal"
                          aria-label={`Quanti kg di ${r.nome}`}
                          placeholder={r.quantitaG != null ? fmtQuantita(r.quantitaG) : 'kg'}
                          value={quantita[r.chiave] ?? ''}
                          onChange={e => setQuantita(q => ({ ...q, [r.chiave]: e.target.value }))} />
                      </div>
                    ))}

                    <div style={{ marginTop: 14 }}>
                      <label htmlFor={`nota-${g.chiave}`} style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                        Una nota per il fornitore (se serve)
                      </label>
                      <input id={`nota-${g.chiave}`} style={campo} value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="es. consegna solo di mattina" />
                    </div>

                    {righeScelte.length === 0 ? (
                      <div style={{ fontSize: font.size.base, color: T.textSoft, marginTop: 14 }}>
                        Non hai lasciato niente nell&apos;ordine.
                      </div>
                    ) : (
                      <>
                        <div style={{
                          marginTop: 14, padding: '12px 14px', background: T.bgCard,
                          border: `1px solid ${T.border}`, borderRadius: R.md,
                          fontSize: font.size.base, color: T.textMid, lineHeight: 1.65,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {testoWa}
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 14 }}>
                          <button type="button" onClick={() => copia(testoWa, 'Messaggio')} style={bottone(true)}>
                            <Icon name="copy" size={15} />Copia per WhatsApp
                          </button>

                          {g.dati?.email ? (
                            <a style={bottone(false)}
                              href={mailtoOrdine({ a: g.dati.email, oggetto: mail.oggetto, corpo: mail.corpo })}>
                              <Icon name="mail" size={15} />Apri la mail a {g.dati.email}
                            </a>
                          ) : (
                            <button type="button" style={bottone(false)}
                              onClick={() => copia(`${mail.oggetto}\n\n${mail.corpo}`, 'Testo della mail')}>
                              <Icon name="mail" size={15} />Copia il testo della mail
                            </button>
                          )}

                          <button type="button" onClick={segnaFatto} disabled={salvando}
                            style={{ ...bottone(false), border: `1px dashed ${T.borderStr}`, cursor: salvando ? 'default' : 'pointer' }}>
                            <Icon name="check" size={15} />{salvando ? 'Registro…' : 'L\'ho mandato'}
                          </button>
                        </div>

                        {numero && (
                          <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, marginTop: 9, lineHeight: 1.5 }}>
                            Il numero che hai in anagrafica è {numero}.
                          </div>
                        )}
                        {!g.dati?.email && g.fornitore && (
                          <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, marginTop: 5, lineHeight: 1.5 }}>
                            Di {g.fornitore} non hai l&apos;email: scrivila nella sua scheda e il
                            pulsante aprirà la mail già pronta.
                          </div>
                        )}
                        {Number(g.dati?.minimo_ordine) > 0 && stimaScelta != null && stimaScelta < Number(g.dati.minimo_ordine) && (
                          <div style={{ fontSize: typo.small.fontSize, color: T.amberDark || T.amber, marginTop: 9, lineHeight: 1.5 }}>
                            Il minimo d&apos;ordine di {g.fornitore} è {fmtEuro(Number(g.dati.minimo_ordine))},
                            e questo ordine vale circa {fmtEuro(stimaScelta)}.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <SH sub="Quello che hai chiesto. Serve a confrontarlo con la bolla quando la merce arriva.">
            Ordini fatti
          </SH>
          {ordini.length === 0 ? (
            <div style={{ ...card, color: T.textSoft, fontSize: font.size.base }}>
              Nessun ordine registrato.
            </div>
          ) : (
            <div style={card}>
              {ordini.map(o => (
                <div key={o.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.borderSoft}` }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: font.size.base, fontWeight: 700, color: T.text }}>
                      {o.fornitori?.nome || 'Fornitore non collegato'}
                    </span>
                    <span style={{ fontSize: typo.small.fontSize, color: T.textSoft }}>
                      {String(o.data_ordine || '').split('-').reverse().join('/')} · {o.stato}
                      {Number(o.totale) > 0 ? ` · ${fmtEuro(Number(o.totale))}` : ''}
                    </span>
                  </div>
                  {(o.righe_ordine || []).length > 0 && (
                    <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, marginTop: 3, lineHeight: 1.5 }}>
                      {o.righe_ordine.map(r => `${r.prodotto} ${r.quantita} ${r.unita}`).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
