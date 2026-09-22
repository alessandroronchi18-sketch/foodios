// Il giro: cosa serve, quando conviene partire.
//
// ── Perché questa banda esiste ───────────────────────────────────────────
//
// Il titolare, 23/09/2026: «si perde un sacco di tempo e un sacco di risorse
// con i trasferimenti da sede. Magari i trasferimenti vengono fatti anche
// tutti i giorni ma solo per un kg di gelato o per poche materie prime».
//
// Un chilo di gelato sono otto coni: non portarlo costa 30-40 € fra margine
// perso e prodotto buttato, e il viaggio costa 40-60 minuti più una persona
// tolta dal banco. Siamo quasi in pareggio, ed è per questo che ogni singolo
// viaggio preso da solo è giustificabile — e intanto se ne fanno trecento
// all'anno. Si vince facendo **meno viaggi più pieni**.
//
// ── Chi scrive in lista: tutt'e due ──────────────────────────────────────
//
// Scelta del titorare, 23/09/2026 (opzione «c»): Foodos propone quello che
// vede dalle giacenze, e **chi è al banco aggiunge quello che sa lui**.
// Nessuna delle due da sola basta: le giacenze non sanno che domani c'è un
// evento, e chi è al banco non ha il tempo di guardare tre magazzini.
//
// Il conto sta tutto in `src/lib/giriTrasferimenti.js`, con le sue 29 prove:
// qui c'è solo la schermata.
import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { sload, ssave } from '../lib/storage'
import { SK_GIRI, SK_LISTA_GIRO, SK_MAG } from '../lib/storageKeys'
import { color as T, radius as R, font, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { prossimoGiro, decidiGiro, GIORNI } from '../lib/giriTrasferimenti'
import { creaTrasferimento } from '../lib/trasferimenti'

const GIORNI_CORTI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

/** Grammi come li scrive una persona: sotto il chilo in grammi, sopra in chili. */
function scrivi(g) {
  const n = Number(g)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return n >= 1000
    ? `${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg`
    : `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} g`
}

/**
 * @param {object}   props
 * @param {string}   props.orgId
 * @param {string}   props.sedeId
 * @param {Array}    props.sedi
 * @param {object}   props.sedeAttiva
 * @param {Function} props.notify
 * @param {Function} [props.onCreato]  dopo aver creato i trasferimenti
 */
export default function GiroTrasferimenti({ orgId, sedeId, sedi = [], sedeAttiva = null, notify, onCreato = null }) {
  const suTelefono = useIsMobile()
  const suTablet = useIsTablet()
  const dito = suTelefono || suTablet

  const [impostazioni, setImpostazioni] = useState(undefined)
  const [lista, setLista] = useState([])
  const [magazzino, setMagazzino] = useState({})
  const [nuovo, setNuovo] = useState({ prodotto: '', quantita: '', da: '' })
  const [staGiaAndando, setStaGiaAndando] = useState(false)
  const [apriGiorni, setApriGiorni] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    if (!orgId) { setImpostazioni(null); return () => { vivo = false } }
    Promise.all([
      sload(SK_GIRI, orgId, null),
      sedeId ? sload(SK_LISTA_GIRO, orgId, sedeId) : Promise.resolve([]),
      sedeId ? sload(SK_MAG, orgId, sedeId) : Promise.resolve({}),
    ]).then(([g, l, m]) => {
      if (!vivo) return
      setImpostazioni(g && typeof g === 'object' ? g : { giorni: [] })
      setLista(Array.isArray(l) ? l : [])
      setMagazzino(m && typeof m === 'object' ? m : {})
    })
    return () => { vivo = false }
  }, [orgId, sedeId])

  const oggi = useMemo(() => {
    const d = new Date()
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {})
    return `${p.year}-${p.month}-${p.day}`
  }, [])

  const giro = useMemo(
    () => prossimoGiro(oggi, impostazioni?.giorni || []),
    [oggi, impostazioni],
  )

  // ── Quello che Foodos vede da solo ─────────────────────────────────────
  //
  // Le materie prime sotto la loro soglia in QUESTO negozio. Non è una
  // previsione: è quello che è scritto in magazzino. Se la soglia non c'è,
  // la riga non compare — una soglia a zero non vuol dire «non serve mai».
  const proposte = useMemo(() => {
    const out = []
    for (const [chiave, v] of Object.entries(magazzino || {})) {
      const giacenza = Number(v?.giacenza_g) || 0
      const soglia = Number(v?.soglia_g) || 0
      if (soglia <= 0 || giacenza > soglia) continue
      if (lista.some(r => r.chiave === chiave)) continue
      out.push({
        chiave, prodotto: v?.nome || chiave, giacenza, soglia,
        quantita: Math.max(soglia * 2 - giacenza, soglia),
        daFoodos: true,
      })
    }
    return out.sort((a, b) => a.giacenza - b.giacenza)
  }, [magazzino, lista])

  const decisione = useMemo(
    () => decidiGiro(lista, { giro, staGiaAndando }),
    [lista, giro, staGiaAndando],
  )

  async function salvaLista(l) {
    try { await ssave(SK_LISTA_GIRO, l, orgId, sedeId); setLista(l); return true } catch (e) {
      notify?.('Non sono riuscito a salvare la lista: ' + (e?.message || 'rete'), false)
      return false
    }
  }

  async function salvaImpostazioni(i) {
    try { await ssave(SK_GIRI, i, orgId, null); setImpostazioni(i); return true } catch (e) {
      notify?.('Non sono riuscito a salvare i giorni del giro: ' + (e?.message || 'rete'), false)
      return false
    }
  }

  function giornoSuGiu(g) {
    const ora = impostazioni?.giorni || []
    const nuovi = ora.includes(g) ? ora.filter(x => x !== g) : [...ora, g].sort()
    salvaImpostazioni({ ...(impostazioni || {}), giorni: nuovi })
  }

  async function aggiungi(riga) {
    const q = Number(String(riga.quantita ?? '').replace(',', '.'))
    await salvaLista([...lista, {
      id: `l-${Date.now()}-${lista.length}`,
      chiave: riga.chiave || null,
      prodotto: String(riga.prodotto || '').trim(),
      // `null`, non `0`: «non lo so» e «zero grammi» sono due cose diverse, e
      // uno zero in lista è una riga che al banco nessuno sa cosa voglia dire.
      quantita: Number.isFinite(q) && q > 0 ? q : null,
      unita: 'g',
      giacenza: riga.giacenza ?? null,
      consumoGiornaliero: riga.consumoGiornaliero ?? null,
      da: riga.da || null,
      daFoodos: riga.daFoodos === true,
    }])
  }

  /**
   * Crea i trasferimenti veri per quello che è in lista.
   *
   * La merce si muove da un'altra sede verso questa: `sede_da` è chi manda,
   * `sede_a` è chi riceve — cioè noi. Una riga senza «da chi» non si crea:
   * un trasferimento senza mittente è una giacenza che nasce dal nulla.
   */
  async function creaGiro() {
    if (salvando) return
    const daFare = lista.filter(r => r.da && r.prodotto)
    if (!daFare.length) {
      notify?.('Scrivi da quale negozio arriva ogni cosa: senza, non posso creare il trasferimento.', false)
      return
    }
    setSalvando(true)
    let fatti = 0
    try {
      for (const r of daFare) {
        try {
          await creaTrasferimento({
            orgId, sedeDa: r.da, sedeA: sedeId, tipo: 'materia_prima',
            prodotto: r.prodotto, quantita: (r.quantita || 0) / 1000, unita: 'kg',
          })
          fatti++
        } catch (e) {
          notify?.(`«${r.prodotto}» non è partito: ${e?.message || 'errore'}`, false)
        }
      }
      if (fatti > 0) {
        // Solo quello che è partito davvero esce dalla lista: una riga che
        // non si è creata deve restare lì, o la si perde senza accorgersene.
        const partiti = new Set(daFare.slice(0, fatti).map(r => r.id))
        await salvaLista(lista.filter(r => !partiti.has(r.id)))
        notify?.(`${fatti} ${fatti === 1 ? 'trasferimento creato' : 'trasferimenti creati'}. Chi manda li vedrà nella sua pagina.`)
        onCreato?.()
      }
    } finally {
      setSalvando(false)
    }
  }

  if (!orgId || !sedeId || impostazioni === undefined) return null

  const card = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
    padding: suTelefono ? '14px' : '18px 20px', marginBottom: 18,
  }
  const campo = {
    width: '100%', padding: '9px 11px', borderRadius: R.sm,
    border: `1px solid ${T.borderStr}`, fontSize: font.size.lg,
    boxSizing: 'border-box', fontFamily: 'inherit', background: T.bgCard, color: T.text,
  }
  const colore = decisione.azione === 'esci-adesso' ? T.red
    : decisione.azione === 'porta-tutto' ? T.brand : T.textSoft

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, flexWrap: 'wrap' }}>
        <span style={{ flexShrink: 0, marginTop: 2, color: colore }}>
          <Icon name={decisione.azione === 'aspetta' || decisione.azione === 'niente' ? 'clock' : 'truck'} size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>
            Il giro di {sedeAttiva?.nome || 'questo negozio'}
          </div>
          <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.6, marginTop: 3 }}>
            {decisione.frase}
          </div>
        </div>
      </div>

      {/* ── I giorni del giro ─────────────────────────────────────────────
          Senza, tutto resta un «non lo so»: il conto ha bisogno di sapere
          quando passa il prossimo, non di indovinarlo. */}
      <div style={{ marginTop: 14 }}>
        <button type="button" onClick={() => setApriGiorni(v => !v)} aria-expanded={apriGiorni}
          style={{
            padding: '7px 12px', minHeight: dito ? 44 : 36, background: 'transparent',
            color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm,
            fontSize: typo.small.fontSize, fontWeight: 700, fontFamily: 'inherit',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
          <Icon name="calendar" size={13} />
          {(impostazioni?.giorni || []).length
            ? `Giro: ${(impostazioni.giorni).map(g => GIORNI[g]).join(' e ')}`
            : 'Quali giorni si fa il giro?'}
        </button>
        {apriGiorni && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {GIORNI_CORTI.map((g, i) => {
              const acceso = (impostazioni?.giorni || []).includes(i)
              return (
                <button key={i} type="button" onClick={() => giornoSuGiu(i)}
                  aria-pressed={acceso}
                  style={{
                    padding: '9px 13px', minHeight: dito ? 44 : 38,
                    background: acceso ? T.brand : 'transparent',
                    color: acceso ? T.white : T.textMid,
                    border: `1px solid ${acceso ? T.brand : T.borderStr}`,
                    borderRadius: R.sm, fontSize: typo.small.fontSize, fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                  {g}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Quello che Foodos vede da solo ────────────────────────────────── */}
      {proposte.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Sotto scorta qui: te li propongo io
          </div>
          {proposte.slice(0, 8).map(p => (
            <div key={p.chiave} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderTop: `1px solid ${T.borderSoft}`, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: font.size.base, fontWeight: 600, color: T.text }}>{p.prodotto}</div>
                <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>
                  ne hai {scrivi(p.giacenza)}, la soglia è {scrivi(p.soglia)}
                </div>
              </div>
              <button type="button" onClick={() => aggiungi(p)}
                style={{
                  padding: '8px 13px', minHeight: dito ? 44 : 36, background: 'transparent',
                  color: T.brand, border: `1px solid ${T.brand}55`, borderRadius: R.sm,
                  fontSize: typo.small.fontSize, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                }}>
                Mettilo in lista
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── La lista ──────────────────────────────────────────────────────── */}
      {lista.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            In lista ({lista.length})
          </div>
          {lista.map(r => {
            const urgente = decisione.urgenti.some(u => u.id === r.id)
            const incerta = decisione.incerte.some(u => u.id === r.id)
            return (
              <div key={r.id} style={{
                display: 'grid',
                gridTemplateColumns: suTelefono ? '1fr 40px' : '1fr 150px 40px',
                gap: 9, alignItems: 'center', padding: '9px 0',
                borderTop: `1px solid ${T.borderSoft}`,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: font.size.base, fontWeight: 600, color: T.text }}>
                    {r.prodotto}
                    {r.quantita ? <span style={{ color: T.textSoft, fontWeight: 400 }}> · {scrivi(r.quantita)}</span> : null}
                    {urgente && <span style={{ color: T.red, marginLeft: 7, fontSize: typo.caption.fontSize, fontWeight: 700 }}>non ci arriva</span>}
                    {incerta && <span style={{ color: T.amber, marginLeft: 7, fontSize: typo.caption.fontSize, fontWeight: 700 }}>da decidere</span>}
                  </div>
                  <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>
                    {(decisione.urgenti.concat(decisione.rimandabili, decisione.incerte).find(u => u.id === r.id)?.perche) || ''}
                  </div>
                </div>
                {!suTelefono && (
                  <select style={{ ...campo, padding: '8px 9px' }} value={r.da || ''}
                    aria-label={`Da quale negozio arriva ${r.prodotto}`}
                    onChange={e => salvaLista(lista.map(x => (x.id === r.id ? { ...x, da: e.target.value || null } : x)))}>
                    <option value="">da chi?</option>
                    {sedi.filter(s => String(s.id) !== String(sedeId)).map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => salvaLista(lista.filter(x => x.id !== r.id))}
                  aria-label={`Togli ${r.prodotto} dalla lista`} title="Togli"
                  style={{
                    width: dito ? 40 : 34, height: dito ? 40 : 34, padding: 0,
                    background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`,
                    borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Icon name="trash" size={13} />
                </button>
                {suTelefono && (
                  <select style={{ ...campo, gridColumn: '1 / -1', padding: '8px 9px' }} value={r.da || ''}
                    aria-label={`Da quale negozio arriva ${r.prodotto}`}
                    onChange={e => salvaLista(lista.map(x => (x.id === r.id ? { ...x, da: e.target.value || null } : x)))}>
                    <option value="">da quale negozio?</option>
                    {sedi.filter(s => String(s.id) !== String(sedeId)).map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Aggiungi a mano ───────────────────────────────────────────────
          Le giacenze non sanno che domani c'è un evento: chi è al banco sì. */}
      <div style={{
        display: 'grid', gap: 8, marginTop: 16,
        gridTemplateColumns: suTelefono ? '1fr' : '2fr 110px auto',
      }}>
        <input style={campo} value={nuovo.prodotto} aria-label="Cosa ti serve"
          placeholder="es. pistacchio"
          onChange={e => setNuovo(v => ({ ...v, prodotto: e.target.value }))} />
        <input style={{ ...campo, textAlign: 'right' }} value={nuovo.quantita} inputMode="decimal"
          aria-label="Quanti grammi" placeholder="grammi"
          onChange={e => setNuovo(v => ({ ...v, quantita: e.target.value }))} />
        <button type="button"
          onClick={async () => {
            if (!nuovo.prodotto.trim()) { notify?.('Scrivi cosa ti serve', false); return }
            await aggiungi(nuovo)
            setNuovo({ prodotto: '', quantita: '', da: '' })
          }}
          style={{
            padding: '10px 16px', minHeight: dito ? 48 : 42, background: 'transparent',
            color: T.textMid, border: `1px dashed ${T.borderStr}`, borderRadius: R.md,
            fontSize: font.size.base, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}>
          <Icon name="plus" size={14} />Aggiungi
        </button>
      </div>

      {lista.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 16 }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            fontSize: font.size.base, color: T.textMid,
          }}>
            <input type="checkbox" checked={staGiaAndando} style={{ width: 18, height: 18, accentColor: T.brand }}
              onChange={e => setStaGiaAndando(e.target.checked)} />
            Qualcuno ci sta già andando
          </label>
          <button type="button" onClick={creaGiro} disabled={salvando}
            style={{
              padding: '11px 18px', minHeight: dito ? 48 : 44, background: T.brand, color: T.white,
              border: 'none', borderRadius: R.md, fontSize: font.size.base, fontWeight: 700,
              fontFamily: 'inherit', cursor: salvando ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
            <Icon name="truck" size={15} />{salvando ? 'Creo…' : 'Crea i trasferimenti'}
          </button>
        </div>
      )}
    </div>
  )
}
