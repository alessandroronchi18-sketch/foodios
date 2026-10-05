// ── Le spese fisse che arrivano già in fattura ───────────────────────────
//
// In cima alla pagina Costi fissi (05/10/2026). La pagina serve per le spese
// SENZA fattura; quelle con la fattura entrano da sole nel conto. Ma non si
// vedevano da nessuna parte come «fisse», e chi apriva questa pagina le
// riscriveva a mano, contandole due volte. Qui si vedono tutte insieme, con
// la media al mese, e si dice che sono già contate. I conti stanno in
// `lib/speseRicorrenti.js`.
import React from 'react'
import { color as T, font, space } from '../../lib/theme'
import { Riquadro, TitoloGrafico, TabellaAnalisi, RigaMotivo } from '../analisi'

const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const euro = (n) => `${NF0.format(Math.round(Number(n) || 0))} €`
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const nomeMese = (m) => { const [y, mm] = String(m).split('-').map(Number); return `${MESI[mm - 1]} ${y}` }

/**
 * La riga sui ricorrenti senza voce. Senza nomi: fra loro ci sono quasi
 * sempre fornitori di materie prime (DESA, il latte), e chiedere «è una
 * spesa fissa?» proprio su di loro era fuorviante (prova sui dati veri del
 * 05/10). Si dice quanti sono e perché conta dargli la voce.
 */
export function fraseSenzaVoce(senzaVoce = []) {
  if (!senzaVoce.length) return ''
  const n = senzaVoce.length
  const quanti = n === 1 ? 'Un altro fornitore ti fattura' : `Altri ${NF0.format(n)} fornitori ti fatturano`
  return `${quanti} tutti i mesi ma ${n === 1 ? 'non ha' : 'non hanno'} ancora una voce: finché non ce l'${n === 1 ? 'ha' : 'hanno'}, il conto non sa se ${n === 1 ? 'è una spesa fissa o materia prima' : 'sono spese fisse o materie prime'}.`
}

/**
 * @param {object} p
 * @param {ReturnType<import('../../lib/speseRicorrenti').speseRicorrenti>} p.ricorrenti
 * @param {() => void} [p.onClassifica]  apre la scelta della voce dei fornitori
 */
export default function GiaDalleFatture({ ricorrenti, isMobile = false, onClassifica = null, nSedi = 0, stile = null }) {
  if (!ricorrenti || (!ricorrenti.voci.length && !ricorrenti.senzaVoce.length)) return null
  const { voci, senzaVoce, totaleMese, finestra } = ricorrenti
  const conIva = voci.some(v => v.conIva)
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico
        titolo={voci.length ? `Già dalle fatture: ${euro(totaleMese)} al mese` : 'Già dalle fatture'}
        sottotitolo={`Le spese fisse che ti arrivano in fattura tutti i mesi, in media da ${nomeMese(finestra.da)} a ${nomeMese(finestra.a)}. Sono già nel conto: non aggiungerle qui sotto.${conIva ? ' Alcune sono con l\'IVA, perché alla fattura manca l\'imponibile.' : ''}`} />
      {voci.length > 0 && (
        <TabellaAnalisi etichetta="Spese fisse già dalle fatture" isMobile={isMobile}
          colonne={[
            { chiave: 'nome', titolo: 'Fornitore' },
            // Larghe quanto serve perché «Affitto e noleggi (proposta)» e
            // «Tutte le sedi» stiano su una riga (foto del 05/10).
            { chiave: 'voce', titolo: 'Voce', larghezza: isMobile ? 112 : 232 },
            { chiave: 'sedi', titolo: 'Sede', larghezza: 160, soloComputer: true },
            { chiave: 'mese', titolo: 'Al mese', tipo: 'euro', larghezza: isMobile ? 84 : 104 },
            { chiave: 'mesi', titolo: 'Mesi', tipo: 'numero', larghezza: 80, soloComputer: true },
          ]}
          righe={voci.map(v => ({
            chiave: v.chiave,
            celle: {
              nome: v.nome,
              // «proposta»: la voce l'ha indovinata Foodos dal nome, nessuno
              // l'ha ancora confermata.
              // Al telefono solo la voce: con «(proposta)» andava su tre righe.
              voce: v.proposta && !isMobile ? <span>{v.nomeVoce} <span style={{ color: T.textSoft, fontWeight: 500 }}>(proposta)</span></span> : v.nomeVoce,
              sedi: nSedi > 1 && v.sedi.length >= nSedi ? 'Tutte le sedi' : v.sedi.join(', '),
              mese: v.mediaMese,
              mesi: `${v.mesiCon} su ${v.mesiFinestra}`,
            },
          }))} />
      )}
      {senzaVoce.length > 0 && (
        <RigaMotivo motivo={fraseSenzaVoce(senzaVoce)} dimensione={font.size.sm} stile={{ marginTop: space[3] }}
          azione={onClassifica ? { etichetta: 'Dai la voce', onClick: onClassifica } : null} />
      )}
    </Riquadro>
  )
}
