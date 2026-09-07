// Importazione di un registro incassi tenuto a mano su foglio di calcolo.
//
// Chi arriva a Foodos ha già anni di incassi scritti a mano su Excel, un
// foglio per mese. Chiedergli di ridigitarli per vedere il P&L significa non
// vederlo mai. Questo caricamento prende il foglio COM'È e ne ricava tre cose:
// l'incasso per sede e per giorno diviso fra POS e contanti, il delivery come
// canale a parte, e le spese di giornata con la loro annotazione sul
// documento (F / no F / ?).
//
// Due scelte che vale la pena spiegare.
//
// PRIMA: il periodo si conferma sempre. Il foglio contiene solo il giorno del
// mese, il mese sta nel nome del file. Lo proponiamo noi ma lo mostriamo
// grande e modificabile: un mese sbagliato sposta trenta giornate di incassi
// senza dare nessun segno di errore.
//
// SECONDA: l'importazione SOSTITUISCE le uscite del periodo. Caricare due
// volte lo stesso foglio, altrimenti, raddoppierebbe ogni spesa senza che
// nessuno se ne accorga guardando il totale. Gli incassi invece si
// sovrascrivono per giorno, e se una giornata era già stata chiusa col
// dettaglio dei prodotti quel dettaglio non si perde.

import React, { useMemo, useRef, useState } from 'react'
import { color as T, typo, font, radius as R } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from './Icon'
import { fmt, fmt0 } from '../views/_shared'
import { loadXLSX } from '../lib/xlsx'
import { parseWorkbook, fileToArrayBuffer } from '../lib/importParse'
import {
  estraiIncassi, chiaveSede, annoMeseDaNomeFile, etichettaAnnoMese,
} from '../lib/importIncassi'
import { importaChiusureIncassi } from '../lib/chiusure'
import { aggiungiMovimentiInBlocco, eliminaMovimentiPeriodo } from '../lib/primaNota'

/** Ultimo giorno del mese, per delimitare il periodo che l'import sostituisce. */
function finePeriodo(annoMese) {
  const [y, m] = String(annoMese).split('-').map(Number)
  return `${annoMese}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/**
 * Accoppia i nomi letti nel foglio alle sedi vere.
 * "Berthollet- Contanti" nel foglio e "Mara dei Boschi Berthollet" in Foodos
 * sono la stessa cosa: il confronto è per contenimento, non per uguaglianza.
 */
function abbinaSedi(nomiFoglio, sedi) {
  const out = {}
  for (const nome of nomiFoglio) {
    const k = chiaveSede(nome)
    const trovata = (sedi || []).find(s => {
      const ks = chiaveSede(s.nome)
      return ks && k && (ks === k || ks.includes(k) || k.includes(ks))
    })
    out[nome] = trovata ? trovata.id : ''
  }
  return out
}

export default function ImportRegistroIncassi({ orgId, sedi, notify, onClose }) {
  const isMobile = useIsMobile()
  const fileRef = useRef(null)
  const [nomeFile, setNomeFile] = useState('')
  const [annoMese, setAnnoMese] = useState('')
  const [fogli, setFogli] = useState([])          // { nome, righe }
  const [foglioAttivo, setFoglioAttivo] = useState('')
  const [mappaSedi, setMappaSedi] = useState({})
  const [errore, setErrore] = useState(null)
  const [leggendo, setLeggendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [esito, setEsito] = useState(null)

  // Rilettura del foglio a ogni cambio di periodo o di foglio: le date si
  // costruiscono dal periodo, quindi cambiarlo rifà tutto.
  const letto = useMemo(() => {
    const f = fogli.find(x => x.nome === foglioAttivo)
    if (!f || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(annoMese)) return null
    try {
      return estraiIncassi(f.righe, annoMese)
    } catch (e) {
      console.error('estraiIncassi:', e)
      return null
    }
  }, [fogli, foglioAttivo, annoMese])

  // Riepilogo per sede riconosciuta: quanti giorni, quanto per canale, quante spese.
  const perSede = useMemo(() => {
    if (!letto) return []
    const m = new Map()
    const tocca = (nome) => {
      const k = chiaveSede(nome)
      if (!m.has(k)) m.set(k, { nome, giorni: 0, totale: 0, pos: 0, contanti: 0, delivery: 0, spese: 0, nSpese: 0 })
      return m.get(k)
    }
    for (const c of letto.chiusure) {
      const r = tocca(c.sede)
      r.giorni++; r.totale += c.totale
      r.pos += c.pos || 0; r.contanti += c.contanti || 0; r.delivery += c.delivery || 0
    }
    for (const mv of letto.movimenti) {
      const r = tocca(mv.sede || '')
      r.spese += mv.importo; r.nSpese++
    }
    return [...m.values()].sort((a, b) => b.totale - a.totale)
  }, [letto])

  async function scegliFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrore(null); setEsito(null); setLeggendo(true)
    try {
      const XLSX = await loadXLSX()
      const wb = parseWorkbook(await fileToArrayBuffer(file), XLSX)
      const elenco = (wb.sheetNames || [])
        .map(nome => ({ nome, righe: wb.rawSheets?.[nome] || [] }))
        .filter(f => f.righe.length > 0)
      if (elenco.length === 0) throw new Error('Il file non contiene fogli con dei dati.')

      const periodo = annoMeseDaNomeFile(file.name) || ''
      setNomeFile(file.name)
      setAnnoMese(periodo)
      setFogli(elenco)
      // Si parte dal foglio che contiene qualcosa di riconoscibile.
      const conDati = periodo
        ? elenco.find(f => { try { return estraiIncassi(f.righe, periodo).chiusure.length > 0 } catch { return false } })
        : null
      setFoglioAttivo((conDati || elenco[0]).nome)
      setMappaSedi({})
    } catch (err) {
      setErrore(err.message || 'Non riesco a leggere il file.')
      setFogli([]); setNomeFile('')
    } finally {
      setLeggendo(false)
    }
  }

  // Abbinamento proposto appena si conosce l'elenco delle sedi lette.
  const nomiFoglio = perSede.map(s => s.nome)
  const mappa = useMemo(() => {
    const proposta = abbinaSedi(nomiFoglio, sedi)
    return { ...proposta, ...mappaSedi }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomiFoglio.join('|'), sedi, mappaSedi])

  const daImportare = perSede.filter(s => mappa[s.nome])
  const senzaSede = perSede.filter(s => !mappa[s.nome])
  const pronto = daImportare.length > 0 && !importando

  async function importa() {
    if (!pronto || !letto) return
    setImportando(true); setErrore(null)
    const from = `${annoMese}-01`, to = finePeriodo(annoMese)
    const conteggio = { giorni: 0, nuove: 0, aggiornate: 0, spese: 0, sedi: 0 }
    try {
      for (const s of daImportare) {
        const sedeId = mappa[s.nome]
        const k = chiaveSede(s.nome)

        const chiusure = letto.chiusure.filter(c => chiaveSede(c.sede) === k)
        const res = await importaChiusureIncassi(orgId, sedeId, chiusure)
        conteggio.nuove += res.nuove
        conteggio.aggiornate += res.aggiornate
        conteggio.giorni += chiusure.length

        // Le uscite del periodo si rifanno da zero: vedi nota in testa al file.
        await eliminaMovimentiPeriodo(orgId, sedeId, from, to)
        const spese = letto.movimenti
          .filter(mv => chiaveSede(mv.sede || '') === k)
          .map(mv => ({ ...mv, sede_id: sedeId }))
        conteggio.spese += await aggiungiMovimentiInBlocco(orgId, spese)
        conteggio.sedi++
      }
      setEsito(conteggio)
      notify?.(`Registro di ${etichettaAnnoMese(annoMese)} importato: ${conteggio.giorni} giornate.`)
    } catch (err) {
      setErrore(err.message || 'Importazione non riuscita.')
    } finally {
      setImportando(false)
    }
  }

  // ── Stili locali ──────────────────────────────────────────────────────────
  const card = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
    padding: isMobile ? '16px' : '20px 22px',
  }
  const campo = {
    padding: '10px 12px', minHeight: 44, boxSizing: 'border-box',
    border: `1px solid ${T.borderStr}`, borderRadius: R.md, background: T.bgCard,
    color: T.text, fontFamily: 'inherit',
    fontSize: isMobile ? font.size.lg : typo.body.fontSize,
  }
  const etichetta = { ...typo.small, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 5 }
  const nota = { ...typo.caption, color: T.textSoft, marginTop: 6, lineHeight: 1.5 }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button type="button" onClick={onClose}
          style={{
            width: 40, height: 40, borderRadius: R.md, background: T.bgCard,
            border: `1px solid ${T.border}`, color: T.textMid, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }} aria-label="Torna indietro">
          <Icon name="arrowL" size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...(isMobile ? typo.h2 : typo.h1), color: T.text }}>Registro incassi</div>
          <div style={{ ...typo.small, color: T.textSoft, marginTop: 3, lineHeight: 1.45 }}>
            Carica il foglio del mese come lo tieni. Leggiamo incassi per sede, POS e contanti, delivery e spese di giornata.
          </div>
        </div>
      </div>

      {/* 1. Il file */}
      <div style={{ ...card, marginBottom: 14 }}>
        <label style={{
          display: 'block', padding: '18px 16px', textAlign: 'center', cursor: 'pointer',
          background: T.bgSubtle, border: `1px dashed ${T.borderStr}`, borderRadius: R.lg,
          ...typo.bodyStrong, color: T.textMid, fontWeight: 700,
        }}>
          <Icon name="upload" size={15} style={{ marginRight: 7 }} />
          {leggendo ? 'Sto leggendo il foglio…' : nomeFile || 'Scegli il file Excel del mese'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={scegliFile} disabled={leggendo} />
        </label>
        <div style={nota}>Il file resta sul tuo computer: viene letto qui dentro, nel browser.</div>
      </div>

      {errore && (
        <div style={{
          ...card, marginBottom: 14, borderColor: T.brand, background: T.brandLight,
          ...typo.small, color: T.brand, lineHeight: 1.5,
        }}>{errore}</div>
      )}

      {fogli.length > 0 && !esito && (
        <>
          {/* 2. Periodo e foglio */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: isMobile ? '1fr' : '200px 1fr' }}>
              <div>
                <label htmlFor="fos-ri-periodo" style={etichetta}>Di che mese è</label>
                <input id="fos-ri-periodo" type="month" value={annoMese}
                  onChange={e => setAnnoMese(e.target.value)}
                  style={{ ...campo, width: '100%', fontWeight: 700 }} />
                <div style={nota}>
                  {annoMese
                    ? `Le giornate del foglio diventeranno date di ${etichettaAnnoMese(annoMese)}.`
                    : 'Dal nome del file non si capisce il mese: scegliolo qui.'}
                </div>
              </div>
              {fogli.length > 1 && (
                <div>
                  <label htmlFor="fos-ri-foglio" style={etichetta}>Quale foglio</label>
                  <select id="fos-ri-foglio" value={foglioAttivo} onChange={e => setFoglioAttivo(e.target.value)}
                    style={{ ...campo, width: '100%' }}>
                    {fogli.map(f => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
                  </select>
                  <div style={nota}>Il file ha più fogli. Si importa un foglio alla volta.</div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Cosa abbiamo capito */}
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ ...typo.h3, color: T.text, marginBottom: 3 }}>Cosa abbiamo capito</div>
            <div style={{ ...typo.small, color: T.textSoft, marginBottom: 14, lineHeight: 1.45 }}>
              Controlla che i punti vendita siano quelli giusti prima di confermare.
            </div>

            {!annoMese ? (
              <div style={{ ...typo.small, color: T.amber }}>Scegli il mese qui sopra per vedere l’anteprima.</div>
            ) : perSede.length === 0 ? (
              <div style={{ ...typo.small, color: T.textMid, lineHeight: 1.5 }}>
                In questo foglio non abbiamo trovato colonne di incasso riconoscibili.
                Servono una colonna con i giorni del mese e, accanto, gli importi con intestazioni tipo POS, contanti, totale.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {perSede.map(s => (
                  <div key={s.nome} style={{
                    border: `1px solid ${mappa[s.nome] ? T.border : T.amber}`,
                    background: mappa[s.nome] ? T.bgCard : T.amberLight,
                    borderRadius: R.lg, padding: isMobile ? '12px' : '13px 15px',
                  }}>
                    <div style={{
                      display: 'flex', gap: 10, alignItems: isMobile ? 'stretch' : 'center',
                      flexDirection: isMobile ? 'column' : 'row', marginBottom: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...typo.bodyStrong, color: T.text, overflowWrap: 'anywhere' }}>{s.nome || 'senza nome'}</div>
                        <div style={{ ...typo.caption, color: T.textSoft, marginTop: 2 }}>
                          {s.giorni} {s.giorni === 1 ? 'giornata' : 'giornate'} nel foglio
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, minWidth: isMobile ? 0 : 220 }}>
                        <select value={mappa[s.nome] || ''}
                          onChange={e => setMappaSedi(m => ({ ...m, [s.nome]: e.target.value }))}
                          aria-label={`Punto vendita per ${s.nome}`}
                          style={{ ...campo, width: '100%' }}>
                          <option value="">Non importare</option>
                          {(sedi || []).map(sd => <option key={sd.id} value={sd.id}>{sd.nome}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{
                      display: 'grid', gap: 8,
                      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(120px, 1fr))',
                    }}>
                      {[
                        ['Incassato', fmt0(s.totale)],
                        ['POS', s.pos > 0 ? fmt0(s.pos) : '—'],
                        ['Contanti', s.contanti > 0 ? fmt0(s.contanti) : '—'],
                        ['Delivery', s.delivery > 0 ? fmt0(s.delivery) : '—'],
                        ['Uscite', s.nSpese > 0 ? `${fmt0(s.spese)} · ${s.nSpese}` : '—'],
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={{ background: T.bgSubtle, borderRadius: R.md, padding: '8px 10px' }}>
                          <div style={{ ...typo.caption, color: T.textSoft, minHeight: 15 }}>{lbl}</div>
                          <div style={{ ...typo.numSm, color: T.text, marginTop: 2, minHeight: 19 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {senzaSede.length > 0 && (
              <div style={{ ...typo.small, color: T.amber, marginTop: 12, lineHeight: 1.5 }}>
                {senzaSede.length === 1
                  ? `"${senzaSede[0].nome}" non è abbinato a nessun punto vendita: verrà saltato.`
                  : `${senzaSede.length} nomi non sono abbinati a nessun punto vendita: verranno saltati.`}
              </div>
            )}
          </div>

          {/* 4. Le differenze trovate nel foglio */}
          {letto?.avvisi?.length > 0 && (
            <div style={{ ...card, marginBottom: 14, borderColor: T.amber, background: T.amberLight }}>
              <div style={{ ...typo.bodyStrong, color: T.amber, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="warning" size={14} />
                {letto.avvisi.length === 1 ? 'Una somma non torna' : `${letto.avvisi.length} somme non tornano`}
              </div>
              <div style={{ ...typo.small, color: T.textMid, marginBottom: 8, lineHeight: 1.5 }}>
                Nel foglio il totale scritto a mano non coincide con POS più contanti. Importiamo il totale scritto: se è quello sbagliato, correggi la giornata dalla pagina Cassa.
              </div>
              <div style={{ display: 'grid', gap: 5 }}>
                {letto.avvisi.slice(0, 8).map((a, i) => (
                  <div key={i} style={{ ...typo.caption, color: T.textMid, lineHeight: 1.5 }}>{a.messaggio}</div>
                ))}
                {letto.avvisi.length > 8 && (
                  <div style={{ ...typo.caption, color: T.textSoft }}>e altre {letto.avvisi.length - 8}.</div>
                )}
              </div>
            </div>
          )}

          {/* 5. Conferma */}
          {daImportare.length > 0 && (
            <div style={card}>
              <div style={{ ...typo.small, color: T.textMid, marginBottom: 12, lineHeight: 1.55 }}>
                Stai per importare <b>{daImportare.reduce((s, x) => s + x.giorni, 0)} giornate</b> per{' '}
                {daImportare.length === 1 ? 'un punto vendita' : `${daImportare.length} punti vendita`}, per un incassato di{' '}
                <b>{fmt(daImportare.reduce((s, x) => s + x.totale, 0))}</b>.
                {' '}Le giornate già registrate vengono aggiornate nei soldi, e il dettaglio dei prodotti che avevi inserito resta.
                {daImportare.some(x => x.nSpese > 0) && ` Le uscite di cassa di ${etichettaAnnoMese(annoMese)} vengono rifatte da zero, per non contarle due volte.`}
              </div>
              <button type="button" onClick={importa} disabled={!pronto}
                style={{
                  width: '100%', padding: '14px 0', minHeight: 50, border: 'none', borderRadius: R.md,
                  background: pronto ? T.brand : T.bgMuted, color: pronto ? T.textOnDark : T.textSoft,
                  ...typo.bodyStrong, fontWeight: 800, fontFamily: 'inherit',
                  cursor: pronto ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}>
                <Icon name="checkCircle" size={15} />
                {importando ? 'Sto importando…' : 'Importa il registro'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Esito */}
      {esito && (
        <div style={{ ...card, borderColor: T.green, background: T.greenLight }}>
          <div style={{ ...typo.h3, color: T.green, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="checkCircle" size={16} />Fatto
          </div>
          <div style={{ ...typo.small, color: T.textMid, lineHeight: 1.6 }}>
            {etichettaAnnoMese(annoMese)}: {esito.giorni} giornate su {esito.sedi === 1 ? 'un punto vendita' : `${esito.sedi} punti vendita`}
            {esito.nuove > 0 && ` · ${esito.nuove} nuove`}
            {esito.aggiornate > 0 && ` · ${esito.aggiornate} aggiornate`}
            {esito.spese > 0 && ` · ${esito.spese} uscite di cassa`}.
          </div>
          <div style={{ ...typo.small, color: T.textSoft, marginTop: 8, lineHeight: 1.5 }}>
            Li trovi nella pagina Cassa, giorno per giorno, e nel P&L del mese.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setEsito(null); setFogli([]); setNomeFile(''); setMappaSedi({}) }}
              style={{
                padding: '11px 16px', minHeight: 44, borderRadius: R.md, cursor: 'pointer',
                background: T.bgCard, border: `1px solid ${T.borderStr}`, color: T.textMid,
                ...typo.small, fontWeight: 700, fontFamily: 'inherit',
              }}>Carica un altro mese</button>
            <button type="button" onClick={onClose}
              style={{
                padding: '11px 16px', minHeight: 44, borderRadius: R.md, cursor: 'pointer',
                background: T.brand, border: 'none', color: T.textOnDark,
                ...typo.small, fontWeight: 700, fontFamily: 'inherit',
              }}>Ho finito</button>
          </div>
        </div>
      )}
    </div>
  )
}
