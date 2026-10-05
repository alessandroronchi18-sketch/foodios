// Importare le fatture emesse (elenco «Fattura SMART») nelle vendite B2B.
// 06/10/2026. Prima si vede l'ANTEPRIMA, poi si decide: la pagina non scrive
// niente finché chi la usa non preme «Carica». Le regole sono in
// src/lib/fattureEmesse.js; qui c'è solo cosa si vede.
import React, { useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { font } from '../lib/theme'
import { C, fmt0, TNUM } from './_shared'
import { leggiFileEmesse, anteprimaEmesse, venditeDaEmesse, nomeMese, sedeDalNomeFile } from '../lib/fattureEmesse'
import { caricaFattureEmesse } from '../lib/venditeB2B'
import { formatLocalDate } from '../lib/dateLocal'

const num = (n) => Number(n).toLocaleString('it-IT', { useGrouping: 'always' })
const plur = (n, uno, molti) => `${num(n)} ${n === 1 ? uno : molti}`

export default function ImportaFattureEmesse({ orgId, esistenti = [], sedi = [], isMobile, notify, onFatto, onChiudi }) {
  const [lette, setLette] = useState(null)       // { fatture, senzaCliente }
  const [errore, setErrore] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const [soloAnno, setSoloAnno] = useState(false)
  const [vecchieIncassate, setVecchieIncassate] = useState(false)
  const [tuttiClienti, setTuttiClienti] = useState(false)
  const [esclusi, setEsclusi] = useState([])
  const [sedeId, setSedeId] = useState('')
  const [sedeDaFile, setSedeDaFile] = useState(false)
  const sediVere = useMemo(() => (sedi || []).filter(x => x?.id && !x._all), [sedi])
  const [tuttiMesi, setTuttiMesi] = useState(false)
  const inputRef = useRef(null)

  const anno = new Date().getFullYear()
  const dal = soloAnno ? `${anno}-01-01` : null
  // «Scaduta» in Fattura SMART resta anche a fatture di anni fa: chi lo sa
  // può dire che le più vecchie di sei mesi sono già incassate.
  const incassateFinoAl = useMemo(() => {
    if (!vecchieIncassate) return null
    const d = new Date(); d.setMonth(d.getMonth() - 6)
    return formatLocalDate(d)
  }, [vecchieIncassate])

  const a = useMemo(
    () => (lette ? anteprimaEmesse(lette.fatture, { esistenti, dal, incassateFinoAl, clientiEsclusi: esclusi }) : null),
    [lette, esistenti, dal, incassateFinoAl, esclusi],
  )

  async function scegli(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrore(''); setLette(null)
    try {
      const r = await leggiFileEmesse(file)
      if (!r) setErrore('Questo file non è un elenco di fatture emesse. Serve l\'Excel «Elenco documenti» di Fattura SMART, con la colonna «Cliente».')
      else if (!r.fatture.length) setErrore('Il file è vuoto: non ci sono fatture sotto l\'intestazione.')
      else {
        // La sede si propone dal nome del file («Fatture x carlina»), ma
        // resta una scelta visibile: mai vuota senza dirlo.
        const sd = sedeDalNomeFile(file.name, sediVere)
        setSedeId(sd || ''); setSedeDaFile(!!sd); setEsclusi([])
        setLette(r)
      }
    } catch (err) { setErrore(err?.message || 'Non riesco a leggere il file.') }
  }

  async function carica() {
    if (!a || !a.nDaCaricare || lavoro) return
    setLavoro(true)
    try {
      const r = await caricaFattureEmesse(orgId, venditeDaEmesse(a.daCaricare, { incassateFinoAl, sedeId: sedeId || null }))
      notify?.(`Caricate ${plur(r.vendite, 'fattura', 'fatture')}${r.clientiCreati ? ` e ${plur(r.clientiCreati, 'cliente nuovo', 'clienti nuovi')}` : ''}`)
      onFatto?.(r)
    } catch (err) {
      setErrore('Non ho caricato niente: ' + (err?.message || 'errore del database') + '. Puoi riprovare.')
    } finally { setLavoro(false) }
  }

  const box = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? 14 : 20, boxSizing: 'border-box', marginBottom: 16 }
  const bottone = (primario) => ({
    padding: '12px 20px', minHeight: 44, borderRadius: 10, fontWeight: 800, fontSize: font.size.md, cursor: 'pointer',
    background: primario ? C.red : C.white, color: primario ? C.white : C.text,
    border: primario ? 'none' : `1px solid ${C.border}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: isMobile ? '100%' : 'auto', boxSizing: 'border-box',
  })
  const cella = { padding: '8px 10px', fontSize: font.size.base, color: C.text, whiteSpace: 'nowrap', ...TNUM }
  const tabella = (titolo, righe, colonne) => (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <table aria-label={titolo} style={{ borderCollapse: 'collapse', width: '100%', minWidth: 300 }}>
        <thead>
          <tr style={{ background: C.bgSubtle }}>
            {colonne.map((c, i) => <th key={c} style={{ ...cella, textAlign: i === 0 ? 'left' : 'right', fontWeight: 700, color: C.textSoft, position: i === 0 ? 'sticky' : 'static', left: 0, background: C.bgSubtle }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {righe.map((r, k) => (
            <tr key={k} style={{ borderTop: `1px solid ${C.border}` }}>
              {r.map((v, i) => <td key={i} style={{ ...cella, textAlign: i === 0 ? 'left' : 'right', position: i === 0 ? 'sticky' : 'static', left: 0, background: C.bgCard, ...(i === 0 ? { whiteSpace: 'normal', minWidth: 150, overflowWrap: 'anywhere' } : null) }}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const scelta = (checked, set, testo, sotto) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer', fontSize: font.size.base, color: C.text }}>
      <input type="checkbox" checked={checked} onChange={e => set(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }} />
      <span><b>{testo}</b><br /><span style={{ color: C.textSoft }}>{sotto}</span></span>
    </label>
  )

  return (
    <div style={box} role="region" aria-label="Importa fatture emesse">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: font.size.lg, fontWeight: 800, color: C.text }}>Importa le fatture emesse</div>
          <div style={{ fontSize: font.size.base, color: C.textSoft, marginTop: 4, lineHeight: 1.5 }}>
            Dall'Excel «Elenco documenti» di Fattura SMART. Prima vedi cosa c'è dentro, poi decidi se caricarlo.
          </div>
        </div>
        <button onClick={onChiudi} aria-label="Chiudi" style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer', color: C.textSoft }}><Icon name="x" size={18} /></button>
      </div>

      <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={scegli} style={{ display: 'none' }} aria-label="File delle fatture emesse" />
      <button onClick={() => inputRef.current?.click()} style={bottone(!a)}>
        <Icon name="upload" size={16} /> {a ? 'Scegli un altro file' : 'Scegli il file Excel'}
      </button>

      {errore && <div role="alert" style={{ marginTop: 12, color: C.alert, fontSize: font.size.base, fontWeight: 600 }}>{errore}</div>}

      {a && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: isMobile ? font.size['2xl'] : font.size['3xl'], fontWeight: 800, color: C.text, ...TNUM }}>
              {plur(a.nDaCaricare, 'fattura', 'fatture')} · {fmt0(a.imponibile)}
            </div>
            <div style={{ fontSize: font.size.base, color: C.textSoft, marginTop: 4, lineHeight: 1.5 }}>
              {a.nDaCaricare ? `${plur(a.nClienti, 'cliente', 'clienti')}, da ${nomeMese(a.primaData.slice(0, 7))} a ${nomeMese(a.ultimaData.slice(0, 7))}. Importi senza IVA (con IVA ${fmt0(a.totale)}).`
                : 'Non c\'è niente da caricare con queste scelte.'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {scelta(soloAnno, setSoloAnno, `Solo le fatture del ${anno}`, a.fuoriPeriodo.length ? `${plur(a.fuoriPeriodo.length, 'fattura resta fuori', 'fatture restano fuori')}` : 'Altrimenti si caricano tutti gli anni del file')}
            {scelta(vecchieIncassate, setVecchieIncassate, 'Le fatture di oltre sei mesi fa sono già incassate',
              `Fattura SMART le chiama quasi tutte «Scaduta» (${plur(a.daIncassare.n, 'da incassare', 'da incassare')}, ${fmt0(a.daIncassare.imponibile)}). Se non lo sai, lascia spento: restano da incassare.`)}
          </div>

          {a.nDaCaricare > 0 && (
            <>
              {tabella('Fatture per anno', a.perAnno.map(x => [x.anno, num(x.n), fmt0(x.imponibile)]), ['Anno', 'Fatture', 'Senza IVA'])}
              {tuttiMesi || a.perMese.length < 2
                ? tabella('Fatture per mese', a.perMese.map(x => [nomeMese(x.mese), num(x.n), fmt0(x.imponibile)]), ['Mese', 'Fatture', 'Senza IVA'])
                : <button onClick={() => setTuttiMesi(true)} style={bottone(false)}>Mostra i {num(a.perMese.length)} mesi</button>}
              <div role="group" aria-label="Clienti da caricare" style={{ border: `1px solid ${C.border}`, borderRadius: 12 }}>
                <div style={{ ...cella, fontWeight: 700, color: C.textSoft, background: C.bgSubtle, borderRadius: '12px 12px 0 0', whiteSpace: 'normal' }}>
                  Clienti: togli la spunta a quelli che non sono ingrosso ({num(a.nClienti)} su {num(a.perCliente.length)} da caricare)
                </div>
                {(tuttiClienti ? a.perCliente : a.perCliente.slice(0, 8)).map(x => (
                  <label key={x.chiave} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '4px 10px', borderTop: `1px solid ${C.border}`, cursor: 'pointer', fontSize: font.size.base, color: x.escluso ? C.textSoft : C.text, ...TNUM }}>
                    <input type="checkbox" checked={!x.escluso} aria-label={x.nome}
                      onChange={e => setEsclusi(v => e.target.checked ? v.filter(k => k !== x.chiave) : [...v, x.chiave])}
                      style={{ width: 22, height: 22, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', textDecoration: x.escluso ? 'line-through' : 'none' }}>{x.nome}</span>
                    <span style={{ flexShrink: 0, textAlign: 'right' }}>{num(x.n)} · {fmt0(x.imponibile)}</span>
                  </label>
                ))}
              </div>
              {!tuttiClienti && a.perCliente.length > 8 && <button onClick={() => setTuttiClienti(true)} style={bottone(false)}>Mostra tutti i {num(a.perCliente.length)} clienti</button>}
            </>
          )}

          <ul style={{ margin: 0, paddingLeft: 20, fontSize: font.size.base, color: C.text, lineHeight: 1.7 }}>
            {a.doppioniNelFile.length > 0 && <li>{plur(a.doppioniNelFile.length, 'doppione nel file', 'doppioni nel file')}: la stessa fattura una volta sola.</li>}
            {a.giaPresenti.length > 0 && <li>{plur(a.giaPresenti.length, 'fattura è già caricata', 'fatture sono già caricate')}: non si ricaricano.</li>}
            {a.noteCredito.n > 0 && <li>{plur(a.noteCredito.n, 'nota di credito', 'note di credito')}, {fmt0(a.noteCredito.imponibile)}: tolgono dal totale.</li>}
            {a.nonRecapitabili.n > 0 && <li>{plur(a.nonRecapitabili.n, 'fattura «non recapitabile»', 'fatture «non recapitabili»')} al cliente ({fmt0(a.nonRecapitabili.imponibile)}): si caricano, con la nota.</li>}
            {a.senzaData.length > 0 && <li>{plur(a.senzaData.length, 'fattura senza data resta fuori', 'fatture senza data restano fuori')}.</li>}
            {lette.senzaCliente > 0 && <li>{plur(lette.senzaCliente, 'riga senza cliente saltata', 'righe senza cliente saltate')}.</li>}
          </ul>

          {sediVere.length > 0 && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: font.size.base, color: C.text }}>
              <b>Di quale sede sono le fatture?</b>
              <select value={sedeId} onChange={e => { setSedeId(e.target.value); setSedeDaFile(false) }} style={{ minHeight: 44, fontSize: font.size.lg, borderRadius: 10, border: `1px solid ${C.border}`, padding: '0 10px', background: C.white, color: C.text }}>
                {sediVere.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                <option value="">Nessuna sede</option>
              </select>
              <span style={{ color: C.textSoft }}>
                {sedeId ? (sedeDaFile ? 'Scelta dal nome del file: cambiala se non è giusta.' : 'Le fatture compaiono sotto questa sede.')
                  : 'Senza sede le fatture compaiono in tutte le sedi.'}
              </span>
            </label>
          )}

          <div style={{ background: C.bgSubtle, borderRadius: 12, padding: 12, fontSize: font.size.base, color: C.text, lineHeight: 1.6 }}>
            <b>Cosa cambia:</b> ogni fattura diventa una vendita «fatturata» nel registro dell'ingrosso, con il suo cliente.
            Non ha chili né gusti, quindi non muove il magazzino e non entra nei conti di Il mese e del Conto economico
            (il gelato sarebbe contato due volte: una al prezzo del banco e una dalla fattura).
          </div>

          <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
            <button onClick={carica} disabled={lavoro || !a.nDaCaricare} style={{ ...bottone(true), opacity: lavoro || !a.nDaCaricare ? 0.5 : 1 }}>
              {lavoro ? 'Carico…' : `Carica ${plur(a.nDaCaricare, 'fattura', 'fatture')}`}
            </button>
            <button onClick={onChiudi} disabled={lavoro} style={bottone(false)}>Non caricare</button>
          </div>
        </div>
      )}
    </div>
  )
}
