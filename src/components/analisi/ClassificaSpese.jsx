// ── Di che cosa sono queste spese? ──────────────────────────────────────
//
// 03/10/2026. Il conto economico nuovo mette le fatture nelle voci di spesa
// secondo la voce del fornitore. Mara dei Boschi ha 315 fornitori e nessuno
// ha la voce: finché non ce l'hanno, i costi del mese sono tutti «da
// classificare», e il conto sa quanto si è speso ma non in che cosa.
//
// Questa schermata la fa mettere UNA volta per fornitore, dal più pesante:
//
//   • per ognuno la voce proposta (`suggerisciCategoria`) è già scelta, col
//     motivo accanto. Le proposte sicure sono anche già spuntate e si
//     confermano tutte insieme; quelle da controllare no;
//   • le fatture fuori misura (la GECKO di luglio, 86.651 € contro le solite
//     da 2-3 mila) si possono segnare una per una come investimento, anche
//     se il fornitore di solito è una spesa normale. Serve la colonna
//     `fatture.categoria_spesa` (migration 20261003b): senza, la schermata
//     lo dice e non finge di salvare.
//
// La lettura dei fornitori che non riesce mostra l'errore: presa per
// «nessuna voce», ripresenterebbe da classificare fornitori già classificati.
// Si scrive prima nell'archivio e solo dopo si cambia lo schermo.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { color as T, font, radius as R, tnum } from '../../lib/theme'
import Icon from '../Icon'
import { supabase as clientVero } from '../../lib/supabase'
import { euro, dataBreve } from '../../lib/formatoAnalisi'
import {
  CATEGORIE_SPESA, categoriaPerId, chiaveFornitore, suggerisciCategoria, nomeBreve,
  fattureEccezionali, categoriaDellaFattura,
} from '../../lib/contoEconomico'
import {
  leggiFatturePeriodo, leggiCategorieFornitori, mappaCategorie, salvaCategorieFornitori, salvaCategoriaFattura,
} from '../../lib/contoEconomicoArchivio'
import CoperturaDati from './CoperturaDati'
import { IntestazioneAnalisi, TitoloGrafico, Riquadro } from './Testi'

const PASSO = 25
const FS = font.size
const nInt = (n) => Number(n || 0).toLocaleString('it-IT', { useGrouping: 'always' })
const giornoIso = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const unAnnoPrima = (oggi) => {
  const d = new Date(oggi)
  d.setFullYear(d.getFullYear() - 1)
  return giornoIso(d)
}
const dataLunga = (iso) => (iso ? `${dataBreve(iso)}/${String(iso).slice(0, 4)}` : '')

const GRUPPI_VOCI = [
  { tipo: 'costo', etichetta: 'Spese del mese' },
  { tipo: 'investimento', etichetta: 'Investimento' },
  { tipo: 'escluso', etichetta: 'Non è una spesa' },
]

/** I fornitori come li vede il conto: uno per ditta, con la spesa e le righe per la proposta. */
export function fornitoriDaFatture(fatture, { fornitori = [], categoriePerFornitore = {}, dal12 }) {
  const schede = new Map((fornitori || []).map(f => [chiaveFornitore(f.nome), f]))
  const perChiave = new Map()
  for (const f of (fatture || [])) {
    const chiave = chiaveFornitore(f.fornitore)
    if (!chiave) continue
    const g = perChiave.get(chiave) || {
      chiave, nome: schede.get(chiave)?.nome || String(f.fornitore || '').trim(), piva: null,
      spesa12: 0, nFatture12: 0, spesaTotale: 0, nFatture: 0, ultima: null, descrizioni: [],
    }
    const importo = Number(f.totale) || 0
    g.spesaTotale += importo
    g.nFatture += 1
    if (String(f.data_fattura || '') >= dal12) { g.spesa12 += importo; g.nFatture12 += 1 }
    if (!g.ultima || String(f.data_fattura || '') > g.ultima) g.ultima = String(f.data_fattura || '').slice(0, 10) || g.ultima
    if (!g.piva && f.piva) g.piva = f.piva
    for (const d of (f.descrizioni || [])) if (g.descrizioni.length < 12) g.descrizioni.push(d)
    perChiave.set(chiave, g)
  }
  return [...perChiave.values()].map(g => ({
    ...g,
    voce: categoriaDellaFattura({ fornitore: g.nome, piva: g.piva }, categoriePerFornitore),
    proposta: suggerisciCategoria(g.nome, g.descrizioni),
  })).sort((a, b) => b.spesa12 - a.spesa12 || b.spesaTotale - a.spesaTotale || a.nome.localeCompare(b.nome, 'it'))
}

function SceltaVoce({ valore, onCambia, etichetta, disabilitato = false }) {
  return (
    <select value={valore || ''} onChange={e => onCambia(e.target.value || null)} aria-label={etichetta} disabled={disabilitato}
      style={{
        minHeight: 40, width: '100%', padding: '6px 10px', borderRadius: R.md, border: `1px solid ${T.borderStr}`,
        background: T.bgCard, color: valore ? T.text : T.textSoft, fontSize: FS.md, fontFamily: 'inherit',
      }}>
      <option value="">Scegli la voce…</option>
      {GRUPPI_VOCI.map(g => (
        <optgroup key={g.tipo} label={g.etichetta}>
          {CATEGORIE_SPESA.filter(c => c.tipo === g.tipo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

// Spento è grigio, mai bordeaux sbiadito: al 55% il bordeaux diventava rosa
// e da lontano sembrava acceso (audit 04/10, CS1).
function Pulsante({ children, onClick, principale = false, disabilitato = false, ...resto }) {
  return (
    <button type="button" onClick={onClick} disabled={disabilitato} {...resto}
      style={{
        minHeight: 40, padding: '8px 16px', borderRadius: R.md, fontFamily: 'inherit', fontSize: FS.md, fontWeight: 700,
        cursor: disabilitato ? 'not-allowed' : 'pointer',
        border: disabilitato ? `1px solid ${T.border}` : principale ? 'none' : `1px solid ${T.borderStr}`,
        background: disabilitato ? T.bgSubtle : principale ? T.brand : T.bgCard,
        color: disabilitato ? T.textFaint : principale ? T.white : T.brand,
      }}>
      {children}
    </button>
  )
}

/**
 * Le fatture molto più grandi del solito (la GECKO da 86.651 €), che forse
 * sono investimenti. Audit del 04/10 (CS1): stavano in cima alla pagina con 3
 * tendine e 3 «Salva» sempre aperti, e senza la colonna nuova tutti spenti:
 * 323 px al computer e 745 al telefono di comandi che non funzionavano, prima
 * dell'elenco che funziona. Ora sono una riga: senza la colonna dice cosa
 * succederà e basta; con la colonna i comandi stanno dietro un tocco.
 */
function FattureFuoriScala({ eccezionali, disponibili, aperta, onApri, isMobile, children }) {
  const piuGrande = eccezionali[0]
  const una = eccezionali.length === 1
  const titolo = una
    ? `Una fattura vale ${piuGrande.volteLaTipica ? `${nInt(Math.round(piuGrande.volteLaTipica))} volte` : 'molto più di'} le altre di ${nomeBreve(piuGrande.fornitore)}`
    : `${nInt(eccezionali.length)} fatture molto più grandi del solito`
  // Lo spazio prima di «€» non si spezza: al telefono «86.651» restava a fine
  // riga e «€» andava sotto.
  const quale = `${euro(piuGrande.importo).replace(' €', '\u00a0€')} il ${dataLunga(piuGrande.data)}`
  const inizio = `${titolo}${una ? ` (${quale})` : `, la più grande di ${nomeBreve(piuGrande.fornitore)} (${quale})`}`
  const frase = disponibili
    ? `${inizio}: sono investimenti?`
    : `${inizio}: potrai ${una ? 'segnarla' : 'segnarle'} come investimento con il prossimo aggiornamento di Foodos. Per ora ${una ? 'conta' : 'contano'} nella voce del fornitore.`
  return (
    <Riquadro isMobile={isMobile}>
      <div style={{ display: 'grid', gridTemplateColumns: disponibili && !isMobile ? '16px minmax(0, 1fr) auto' : '16px minmax(0, 1fr)', columnGap: 10, rowGap: 8, alignItems: 'center' }}>
        <span aria-hidden="true" style={{ display: 'inline-flex', color: T.textSoft, alignSelf: 'start', paddingTop: 2 }}><Icon name="info" size={16} /></span>
        <span style={{ fontSize: FS.md, lineHeight: '20px', color: T.text }}>{frase}</span>
        {disponibili && (
          <span style={{ gridColumn: isMobile ? '2' : 'auto' }}>
            <Pulsante onClick={onApri} aria-expanded={aperta}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {aperta ? 'Chiudi' : 'Guarda e decidi'}<Icon name={aperta ? 'chevUp' : 'chevDown'} size={14} />
              </span>
            </Pulsante>
          </span>
        )}
      </div>
      {disponibili && aperta && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: FS.sm, lineHeight: '16px', color: T.textSoft, marginBottom: 8 }}>
            Macchine, arredi, lavori durano anni: segnati come investimento non pesano sul conto di un mese solo.
          </div>
          {children}
        </div>
      )}
    </Riquadro>
  )
}

function RigaFornitore({ g, scelta, spuntato, onScelta, onSpunta, isMobile }) {
  const voceScelta = scelta !== undefined ? scelta : (g.voce || g.proposta?.categoria || null)
  const p = g.proposta
  const mostraProposta = !g.voce && p
  const nota = g.voce
    ? `Adesso: ${categoriaPerId(g.voce)?.nome}`
    : p ? `Proposta${p.certezza === 'media' ? ' da controllare' : ''}: ${p.motivo}` : 'Nessuna proposta: scegli tu'
  const spesa = g.spesa12 ? euro(g.spesa12) : '—'
  const sottoSpesa = g.spesa12
    ? `${nInt(g.nFatture12)} ${g.nFatture12 === 1 ? 'fattura' : 'fatture'} in 12 mesi`
    : `nessuna in 12 mesi · ultima il ${dataLunga(g.ultima)}`
  const casella = (
    <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 40, cursor: voceScelta ? 'pointer' : 'default', flexShrink: 0 }}>
      <input type="checkbox" checked={spuntato} disabled={!voceScelta} onChange={e => onSpunta(e.target.checked)}
        aria-label={`Conferma la voce di ${g.nome}`} style={{ width: 18, height: 18, accentColor: T.brand }} />
    </label>
  )
  const nome = (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div title={g.nome} style={{ fontSize: FS.md, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>
        {nomeBreve(g.nome)}
      </div>
      <div style={{ fontSize: FS.sm, color: mostraProposta && p.certezza === 'media' ? T.amberDark : T.textSoft, lineHeight: 1.4, marginTop: 2 }}>
        {nota}
      </div>
    </div>
  )
  const importo = (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{ ...tnum, fontSize: FS.md, fontWeight: 700, color: T.text }}>{spesa}</div>
      <div style={{ fontSize: FS.sm, color: T.textSoft, whiteSpace: 'nowrap' }}>{sottoSpesa}</div>
    </div>
  )
  const select = <SceltaVoce valore={voceScelta} etichetta={`Voce di spesa di ${g.nome}`} onCambia={onScelta} />

  if (isMobile) {
    return (
      <li style={{ padding: '10px 0', borderTop: `1px solid ${T.borderSoft}` }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>{casella}{nome}{importo}</div>
        <div style={{ marginTop: 8 }}>{select}</div>
      </li>
    )
  }
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 150px 230px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${T.borderSoft}` }}>
      {casella}{nome}{importo}{select}
    </li>
  )
}

/**
 * @param {object} p
 * @param {string} p.orgId
 * @param {(testo: string, ok?: boolean) => void} [p.notify]
 * @param {boolean} [p.isMobile]
 * @param {() => void} [p.onSalvato]  dopo ogni salvataggio riuscito: il conto si rilegge
 * @param {object} [p.client]  il client del database (le prove ne passano uno finto)
 * @param {Date|string} [p.oggi]
 */
export default function ClassificaSpese({ orgId, notify, isMobile = false, onSalvato, client = clientVero, oggi = new Date() }) {
  const [lettura, setLettura] = useState({ stato: 'leggo', errore: null })
  const [fatture, setFatture] = useState([])
  const [fornitori, setFornitori] = useState([])
  const [eccezioniDisponibili, setEccezioniDisponibili] = useState(true)
  const [scelte, setScelte] = useState(() => new Map())       // chiave → id voce
  const [spuntati, setSpuntati] = useState(() => new Set())
  const [quanti, setQuanti] = useState(PASSO)
  const [mostraClassificati, setMostraClassificati] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [vociFatture, setVociFatture] = useState(() => new Map()) // id fattura → voce scelta
  // Le fatture fuori scala si guardano a richiesta: si decidono una volta e poi non servono più.
  const [fuoriScalaAperte, setFuoriScalaAperte] = useState(false)
  const inCorso = useRef(false)
  const dal12 = useMemo(() => unAnnoPrima(oggi), [oggi])

  useEffect(() => {
    if (!orgId) return undefined
    let vivo = true
    setLettura({ stato: 'leggo', errore: null })
    ;(async () => {
      try {
        const [lette, forn] = await Promise.all([
          leggiFatturePeriodo(client, orgId, { conDescrizioni: true }),
          leggiCategorieFornitori(client, orgId),
        ])
        if (!vivo) return
        setFatture(lette.fatture)
        setEccezioniDisponibili(lette.eccezioniDisponibili)
        setFornitori(forn.fornitori)
        setLettura({ stato: 'pronto', errore: null })
      } catch (e) {
        if (vivo) setLettura({ stato: 'errore', errore: e?.message || 'errore di rete' })
      }
    })()
    return () => { vivo = false }
  }, [orgId, client])

  const mappa = useMemo(() => mappaCategorie(fornitori), [fornitori])
  const tutti = useMemo(
    () => fornitoriDaFatture(fatture, { fornitori, categoriePerFornitore: mappa.categoriePerFornitore, dal12 }),
    [fatture, fornitori, mappa, dal12],
  )
  const senzaVoce = useMemo(() => tutti.filter(g => !g.voce), [tutti])
  const conVoce = useMemo(() => tutti.filter(g => g.voce), [tutti])
  const eccezionali = useMemo(
    () => fattureEccezionali(fatture, { categoriePerFornitore: mappa.categoriePerFornitore, dal: dal12 }),
    [fatture, mappa, dal12],
  )

  // Le proposte sicure partono già spuntate; si rifà quando cambia l'elenco
  // dei fornitori senza voce (dopo un salvataggio non si rispunta niente di
  // già salvato, perché quei fornitori non sono più qui).
  const firmaSenza = senzaVoce.map(g => g.chiave).join('|')
  useEffect(() => {
    setSpuntati(prima => {
      const s = new Set([...prima].filter(k => tutti.some(g => g.chiave === k)))
      for (const g of senzaVoce) if (g.proposta?.certezza === 'alta' && !scelte.has(g.chiave)) s.add(g.chiave)
      return s
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaSenza])

  if (!orgId) return null

  const voceDi = (g) => (scelte.has(g.chiave) ? scelte.get(g.chiave) : (g.voce || g.proposta?.categoria || null))
  const daSalvare = tutti.filter(g => spuntati.has(g.chiave) && voceDi(g) && voceDi(g) !== g.voce)

  const cambiaScelta = (g, id) => {
    setScelte(m => new Map(m).set(g.chiave, id))
    setSpuntati(s => {
      const n = new Set(s)
      if (id && id !== g.voce) n.add(g.chiave); else n.delete(g.chiave)
      return n
    })
  }
  const spunta = (g, si) => setSpuntati(s => {
    const n = new Set(s)
    if (si) n.add(g.chiave); else n.delete(g.chiave)
    return n
  })

  const salva = async () => {
    if (inCorso.current || !daSalvare.length) return
    inCorso.current = true
    setSalvando(true)
    try {
      const r = await salvaCategorieFornitori(client, orgId, daSalvare.map(g => ({ nome: g.nome, piva: g.piva, categoria: voceDi(g) })), fornitori)
      // Lo schermo cambia solo per quello che l'archivio ha accettato.
      if (r.righe.length) {
        setFornitori(prima => {
          const perId = new Map(prima.map(f => [f.id, f]))
          for (const x of r.righe) perId.set(x.id, { ...(perId.get(x.id) || {}), ...x })
          return [...perId.values()]
        })
        const salvate = new Set(r.righe.map(x => chiaveFornitore(x.nome)))
        setSpuntati(s => new Set([...s].filter(k => !salvate.has(k))))
        setScelte(m => new Map([...m].filter(([k]) => !salvate.has(k))))
      }
      if (r.errori.length) {
        notify?.(`${nInt(r.salvati)} ${r.salvati === 1 ? 'voce salvata' : 'voci salvate'}, ${nInt(r.errori.length)} no (${r.errori[0].messaggio}): riprova.`, false)
      } else {
        notify?.(`${nInt(r.salvati)} ${r.salvati === 1 ? 'fornitore messo' : 'fornitori messi'} nella sua voce.`)
      }
      if (r.salvati) onSalvato?.()
    } catch (e) {
      notify?.(`Non ho salvato niente (${e?.message || 'rete'}): riprova.`, false)
    } finally {
      inCorso.current = false
      setSalvando(false)
    }
  }

  const salvaFattura = async (f) => {
    if (inCorso.current) return
    const voce = vociFatture.has(f.id) ? vociFatture.get(f.id) : 'attrezzature'
    if (!voce) return
    inCorso.current = true
    setSalvando(true)
    try {
      const r = await salvaCategoriaFattura(client, orgId, f.id, voce)
      if (r.ok) {
        setFatture(prima => prima.map(x => (x.id === f.id ? { ...x, categoria_spesa: voce } : x)))
        notify?.(`Fattura ${f.numero || ''} di ${nomeBreve(f.fornitore)}: ${categoriaPerId(voce)?.nome.toLowerCase()}.`)
        onSalvato?.()
      } else if (r.motivo === 'colonna_mancante') {
        setEccezioniDisponibili(false)
        notify?.('Questa scelta si potrà salvare con il prossimo aggiornamento di Foodos: per ora la fattura resta nella voce del fornitore.', false)
      } else {
        notify?.(`Non salvato (${r.messaggio || 'rete'}): riprova.`, false)
      }
    } finally {
      inCorso.current = false
      setSalvando(false)
    }
  }

  // ── Disegno ───────────────────────────────────────────────────────────

  const intestazione = (
    <IntestazioneAnalisi isMobile={isMobile}
      domanda="Di che cosa sono queste spese?"
      sotto="Metti ogni fornitore in una voce una volta sola: da lì le sue fatture entrano nel conto del mese giusto. Le proposte sono già scelte, ma le confermi tu." />
  )

  if (lettura.stato === 'leggo') {
    return <div>{intestazione}<Riquadro isMobile={isMobile}><div role="status" style={{ fontSize: FS.md, color: T.textSoft }}>Leggo fatture e fornitori…</div></Riquadro></div>
  }
  if (lettura.stato === 'errore') {
    return (
      <div>
        {intestazione}
        <Riquadro isMobile={isMobile}>
          <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: T.text, fontSize: FS.md, lineHeight: 1.5 }}>
            <span style={{ color: T.red, display: 'inline-flex', marginTop: 2 }} aria-hidden="true"><Icon name="alert" size={16} /></span>
            <span>Non riesco a leggere fatture e fornitori ({lettura.errore}). Non ti mostro un elenco a metà: riprova fra poco.</span>
          </div>
        </Riquadro>
      </div>
    )
  }

  const spesaSenza = senzaVoce.reduce((s, g) => s + g.spesa12, 0)
  const spesa12 = tutti.reduce((s, g) => s + g.spesa12, 0)
  const nProposte = senzaVoce.filter(g => g.proposta).length
  const fatture12 = fatture.filter(f => String(f.data_fattura || '') >= dal12)
  const senzaImponibile = fatture12.filter(f => !(Math.abs(Number(f.imponibile) || 0) > 0) && !(Math.abs(Number(f.imposta) || 0) > 0)).length

  const copertura = [
    { id: 'fornitori', stato: senzaVoce.length ? 'parziale' : 'ok', testo: `${nInt(conVoce.length)} fornitori su ${nInt(tutti.length)} hanno la voce` },
    {
      id: 'spesa', stato: spesaSenza > 0 ? 'manca' : 'ok',
      testo: spesaSenza > 0 ? `${euro(spesaSenza)} su ${euro(spesa12)} spesi negli ultimi 12 mesi sono senza voce` : 'Tutta la spesa degli ultimi 12 mesi ha la voce',
      dettaglio: 'Importi IVA compresa, come nelle fatture.',
    },
    ...(nProposte ? [{ id: 'proposte', stato: 'stima', testo: `Voce proposta per ${nInt(nProposte)} fornitori: da confermare` }] : []),
    ...(senzaImponibile ? [{
      id: 'iva', stato: 'parziale', testo: `${nInt(senzaImponibile)} fatture su ${nInt(fatture12.length)} hanno solo il totale con l'IVA`,
      dettaglio: "Carica lo ZIP delle fatture dall'Agenzia delle Entrate: Foodos completa imponibile e righe, e le proposte migliorano.",
    }] : []),
  ]

  const visibili = senzaVoce.slice(0, quanti)
  const barraSalva = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <Pulsante principale onClick={salva} disabilitato={salvando || !daSalvare.length}>
        {salvando ? 'Salvo…' : daSalvare.length ? `Salva ${nInt(daSalvare.length)} ${daSalvare.length === 1 ? 'voce' : 'voci'}` : 'Niente da salvare'}
      </Pulsante>
    </div>
  )

  return (
    <div>
      {intestazione}
      <CoperturaDati voci={copertura} />

      {eccezionali.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <FattureFuoriScala eccezionali={eccezionali} disponibili={eccezioniDisponibili} isMobile={isMobile}
            aperta={fuoriScalaAperte} onApri={() => setFuoriScalaAperte(v => !v)}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Fatture fuori scala">
              {eccezionali.map(f => (
                <li key={f.id} style={{
                  display: isMobile ? 'block' : 'grid', gridTemplateColumns: 'minmax(0, 1fr) 130px 230px auto', gap: 12, alignItems: 'center',
                  padding: '10px 0', borderTop: `1px solid ${T.borderSoft}`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div title={f.fornitore} style={{ fontSize: FS.md, fontWeight: 600, color: T.text }}>{nomeBreve(f.fornitore)}</div>
                    <div style={{ fontSize: FS.sm, color: T.textSoft }}>
                      {`${f.numero ? `n. ${f.numero} · ` : ''}${dataLunga(f.data)} · ${f.motivo}${f.tipica ? ` (di solito ${euro(f.tipica)})` : ''}`}
                    </div>
                  </div>
                  <div style={{ ...tnum, fontSize: FS.md, fontWeight: 700, color: T.text, textAlign: isMobile ? 'left' : 'right', margin: isMobile ? '6px 0' : 0 }}>{euro(f.importo)}</div>
                  <SceltaVoce valore={vociFatture.has(f.id) ? vociFatture.get(f.id) : 'attrezzature'} etichetta={`Voce della fattura ${f.numero || ''} di ${f.fornitore}`}
                    onCambia={(v) => setVociFatture(m => new Map(m).set(f.id, v))} />
                  <div style={{ marginTop: isMobile ? 8 : 0 }}>
                    <Pulsante onClick={() => salvaFattura(f)} disabilitato={salvando || (vociFatture.has(f.id) && !vociFatture.get(f.id))}>Salva</Pulsante>
                  </div>
                </li>
              ))}
            </ul>
          </FattureFuoriScala>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico
            titolo={senzaVoce.length
              ? `${nInt(senzaVoce.length)} fornitori senza voce: ${euro(spesaSenza)} negli ultimi 12 mesi`
              : 'Tutti i fornitori hanno la loro voce'}
            sottotitolo={senzaVoce.length ? 'Dal più pesante. Controlla la voce proposta, cambiala se serve, poi salva le righe spuntate.' : 'Le fatture nuove entrano da sole nella voce del loro fornitore.'}
            destra={senzaVoce.length && !isMobile ? barraSalva : null} />
          {senzaVoce.length > 0 && isMobile && <div style={{ marginBottom: 8 }}>{barraSalva}</div>}
          {senzaVoce.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Fornitori senza voce">
              {visibili.map(g => (
                <RigaFornitore key={g.chiave} g={g} isMobile={isMobile}
                  scelta={scelte.has(g.chiave) ? scelte.get(g.chiave) : undefined}
                  spuntato={spuntati.has(g.chiave)}
                  onScelta={(id) => cambiaScelta(g, id)}
                  onSpunta={(si) => spunta(g, si)} />
              ))}
            </ul>
          )}
          {senzaVoce.length > quanti && (
            <div style={{ marginTop: 10 }}>
              <Pulsante onClick={() => setQuanti(q => q + PASSO)}>{`Mostra altri ${nInt(Math.min(PASSO, senzaVoce.length - quanti))} (ne restano ${nInt(senzaVoce.length - quanti)})`}</Pulsante>
            </div>
          )}
        </Riquadro>
      </div>

      {conVoce.length > 0 && (
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico
            titolo={`${nInt(conVoce.length)} fornitori hanno già la voce`}
            sottotitolo="Se una è sbagliata, cambiala qui: vale per tutte le sue fatture, anche quelle passate."
            destra={mostraClassificati && daSalvare.length && !isMobile ? barraSalva : null} />
          <Pulsante onClick={() => setMostraClassificati(v => !v)}>{mostraClassificati ? 'Nascondi' : 'Mostra e cambia'}</Pulsante>
          {mostraClassificati && (
            <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }} aria-label="Fornitori con la voce">
              {conVoce.map(g => (
                <RigaFornitore key={g.chiave} g={g} isMobile={isMobile}
                  scelta={scelte.has(g.chiave) ? scelte.get(g.chiave) : undefined}
                  spuntato={spuntati.has(g.chiave)}
                  onScelta={(id) => cambiaScelta(g, id)}
                  onSpunta={(si) => spunta(g, si)} />
              ))}
            </ul>
          )}
          {mostraClassificati && daSalvare.length > 0 && isMobile && <div style={{ marginTop: 10 }}>{barraSalva}</div>}
        </Riquadro>
      )}
    </div>
  )
}
