// ── Da dove vengono i numeri, e cosa manca ──────────────────────────────
//
// ANALISI_DESIGN.md, regola 3 e §6: la copertura dei dati sta in cima, prima
// del numero, IN UNA RIGA. Le critiche dei clienti ai software concorrenti
// (ricerca del 03/10/2026) sono quasi tutte qui: report costruiti su dati
// incompleti senza dirlo.
//
// 04/10/2026 (audit del design, difetto C1): stava sempre aperta, con 1-4
// pulsanti bordeaux prima di ogni numero, 105-235 px di avvisi. Il titolare:
// «appena atterro non devo vedere tutto sto ammasso di cose: un bottone che
// se clicco si apre e vedo tutto». Adesso, chiusa, è un pulsante solo che
// dice lo stato («Incassi stimati · 3 dati da sistemare ▾»), come il periodo
// (`BarraPeriodo`); aperta, l'elenco in colonna con un'azione per voce.
//
// Le voci restano nel documento dentro un pannello `hidden` (lo schema
// «mostra/nascondi» del W3C): chi legge lo schermo sa cosa c'è dietro il
// pulsante, e le pagine che cercano un'azione per testo la trovano ancora.
import React, { useId, useState } from 'react'
import { color as T, font, radius as R, space, shadow } from '../../lib/theme'
import Icon from '../Icon'
import { imbottitura, testo, soloLettore } from './misure'

const ASPETTO = {
  ok:       { icona: 'checkCircle', colore: T.green, parola: '' },
  stima:    { icona: 'info',        colore: T.amber, parola: 'stima' },
  parziale: { icona: 'alertCircle', colore: T.amber, parola: 'in parte' },
  manca:    { icona: 'alertCircle', colore: T.amber, parola: 'manca' },
}
const aspetto = (stato) => ASPETTO[stato] || ASPETTO.manca
const problema = (v) => v.stato !== 'ok' && v.stato !== 'stima'
const maiuscola = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * La riga chiusa, a parole. Le stime si nominano (dicono che il numero
 * grande è una stima); i problemi si nominano se sono uno o due e hanno il
 * nome breve, altrimenti si contano.
 *   «Incassi stimati · 3 dati da sistemare» · «Inventario fermo al 31/08» ·
 *   «Tutti i dati ci sono»
 */
export function riassuntoCopertura(voci = []) {
  const stime = voci.filter(v => v.stato === 'stima')
  const problemi = voci.filter(problema)
  if (!stime.length && !problemi.length) return 'Tutti i dati ci sono'
  const parti = stime.filter(v => v.breve).map(v => v.breve)
  const stimeSenzaNome = stime.filter(v => !v.breve).length
  if (stimeSenzaNome) parti.push(`${stimeSenzaNome} ${stimeSenzaNome === 1 ? 'numero stimato' : 'numeri stimati'}`)
  if (problemi.length && problemi.length <= 2 && problemi.every(v => v.breve)) {
    parti.push(...problemi.map(v => v.breve))
  } else if (problemi.length) {
    parti.push(`${problemi.length} ${problemi.length === 1 ? 'dato' : 'dati'} da sistemare`)
  }
  return maiuscola(parti.join(' · '))
}

/**
 * @param {object} p
 * @param {string} [p.titolo]  il nome della riga, per chi legge lo schermo
 * @param {string} [p.riassunto]  la riga chiusa, se la pagina la vuole scrivere da sé
 * @param {boolean} [p.isMobile]
 * @param {{ id: string, stato: 'ok'|'stima'|'parziale'|'manca', testo: string,
 *   breve?: string, dettaglio?: string,
 *   azione?: { etichetta: string, onClick: () => void } }[]} p.voci
 *   `breve` è il nome della voce nella riga chiusa («Incassi stimati»,
 *   «Personale incompleto»): due-tre parole. Senza, la riga conta.
 */
export default function CoperturaDati({ titolo = 'Da dove vengono i numeri', riassunto = '', voci = [], isMobile = false }) {
  const [aperta, setAperta] = useState(false)
  const idPannello = useId()
  if (!voci.length) return null

  const nProblemi = voci.filter(problema).length
  const nStime = voci.filter(v => v.stato === 'stima').length
  const icona = nProblemi ? aspetto('manca') : nStime ? aspetto('stima') : aspetto('ok')
  const frase = riassunto || riassuntoCopertura(voci)
  const pad = imbottitura(isMobile)

  return (
    <section aria-label={titolo} style={{ minWidth: 0 }}>
      <button type="button" aria-expanded={aperta} aria-controls={idPannello}
        onClick={() => setAperta(a => !a)}
        style={{
          display: isMobile ? 'flex' : 'inline-flex', width: isMobile ? '100%' : 'auto', maxWidth: '100%',
          alignItems: 'center', gap: space[2], minHeight: 44, boxSizing: 'border-box',
          // La stessa imbottitura del pannello che si apre sotto: l'icona del
          // pulsante e quelle delle voci cadono sulla stessa verticale.
          padding: `0 ${pad}px`,
          background: T.bgCard, borderStyle: 'solid', borderWidth: 1, borderColor: aperta ? T.brand : T.border,
          borderRadius: R.lg, boxShadow: shadow.xs, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          color: T.text, ...testo(font.size.md),
        }}>
        <span style={{ color: icona.colore, display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
          <Icon name={icona.icona} size={16} />
        </span>
        <span style={{ flex: isMobile ? 1 : '0 1 auto', minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={soloLettore}>{titolo}: </span>
          {frase}
        </span>
        <Icon name={aperta ? 'chevUp' : 'chevDown'} size={16} color={T.textSoft} />
      </button>

      <div id={idPannello} hidden={!aperta} style={{
        marginTop: space[2], background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.xl,
        padding: `${space[1]}px ${pad}px`,
      }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {voci.map((v, i) => {
            const a = aspetto(v.stato)
            return (
              <li key={v.id} style={{
                display: 'grid', alignItems: 'start',
                gridTemplateColumns: isMobile ? `16px minmax(0, 1fr)` : `16px minmax(0, 1fr) auto`,
                columnGap: space[2], padding: `${space[3]}px 0`,
                borderStyle: 'solid', borderColor: T.borderSoft, borderWidth: i ? '1px 0 0 0' : 0,
              }}>
                {/* L'icona sta al centro della prima riga di testo (20 px). */}
                <span style={{ color: a.colore, display: 'inline-flex', height: 20, alignItems: 'center' }} aria-hidden="true">
                  <Icon name={a.icona} size={16} />
                </span>
                <span style={{ minWidth: 0, color: T.textMid, ...testo(font.size.md) }}>
                  {a.parola && <b style={{ color: T.amberDark, fontWeight: 700 }}>{maiuscola(a.parola)}: </b>}
                  {v.testo}
                  {v.dettaglio && (
                    <span style={{ display: 'block', marginTop: space[1], color: T.textSoft, ...testo(font.size.sm) }}>{v.dettaglio}</span>
                  )}
                </span>
                {v.azione && (
                  <button type="button" onClick={v.azione.onClick}
                    style={{
                      gridColumn: isMobile ? 2 : 3, justifySelf: isMobile ? 'start' : 'end',
                      // Bersaglio alto 44 px per un dito; il margine negativo
                      // tiene il testo sulla riga della voce e sul bordo del
                      // riquadro, così le azioni cadono in colonna.
                      minHeight: 44, margin: isMobile ? `0 -${space[2]}px -${space[3]}px` : `-${space[3]}px -${space[2]}px`,
                      padding: `0 ${space[2]}px`, border: 'none', background: 'transparent',
                      color: T.brand, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      ...testo(font.size.md),
                    }}>
                    {v.azione.etichetta}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
