// ── Quanto ti costa ogni gusto ───────────────────────────────────────────
//
// La parte della pagina Food cost per la gelateria (05/10/2026). Prima la
// pagina scartava i gusti e, a chi aveva solo gusti, diceva «Nessun prodotto
// vendibile nel ricettario»: a Mara, con 63 gusti dal costo completo.
//
// Come i pezzi dell'Analisi: il titolo, una frase che dice la cosa che conta
// (il gusto più caro e dove sta la metà), poi la tabella. All'arrivo i dieci
// gusti più cari; gli altri dietro un tocco, come la classifica della
// Produzione. Un tocco sul gusto apre i suoi ingredienti, al chilo di gelato.
import React, { useMemo, useState } from 'react'
import { color as T, font, radius as R, space } from '../../lib/theme'
import { quotaConArticolo } from '../../lib/formatoAnalisi'
import { Riquadro, TitoloGrafico, FraseInsight, TabellaAnalisi, RigaAvviso, testo } from '../analisi'
import Icon from '../Icon'
import {
  ingredientiAlKg, riassuntoGusti, righeFoodCostGusti, chiaveFormato, formatiInMedia,
  prezzoProvaValido, prezzoKgInProva, intervalloPrezzoKg,
} from '../../lib/foodCostGusti'

export const PRIMI_GUSTI = 10
const NF2 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const euro2 = (n) => `${NF2.format(Number(n))} €`
const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always' })
/** «3,50» o «3.5» → 3.5; il resto (vuoto, lettere) → null, mai zero. */
const prezzoDaTesto = (t) => {
  if (t == null || String(t).trim() === '') return null
  const n = Number(String(t).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** La frase in cima: il gusto più caro e dove sta la metà dei gusti. */
export function fraseGusti(r, prezzoKg) {
  if (!r?.n) return null
  if (!r.piuCaro) {
    return r.incompleti
      ? 'Ai gusti manca il prezzo di qualche ingrediente: il costo che si vede è più basso del vero.'
      : 'Nessun gusto ha ancora un costo: alle ricette manca il peso o gli ingredienti.'
  }
  const p = r.piuCaro
  const conPrezzo = prezzoKg > 0 && p.quota != null
  const primo = `Il gusto che ti costa di più è ${p.nome}: ${euro2(p.fcKg)} al chilo${conPrezzo ? `, ${quotaConArticolo(p.quota)} del prezzo` : ''}.`
  if (r.completi < 2) return primo
  const meta = conPrezzo && r.medianaQuota != null
    ? `Per metà dei gusti gli ingredienti stanno sotto ${quotaConArticolo(r.medianaQuota)} del prezzo.`
    : `Metà dei gusti costa meno di ${euro2(r.medianaKg)} al chilo.`
  return `${primo} ${meta}`
}

/**
 * Il titolo dice la conclusione (ANALISI_DESIGN.md): fra quanto e quanto
 * stanno i gusti col costo completo. Con un gusto solo, il nome della parte.
 */
export function titoloGusti(righe = [], prezzoKg = null) {
  const c = righe.filter(r => r.completo)
  if (c.length < 2) return 'Quanto ti costa ogni gusto'
  const conPrezzo = prezzoKg > 0 && c.every(r => r.quota != null)
  if (conPrezzo) {
    const q = c.map(r => r.quota)
    return `I gusti ti costano fra ${quotaConArticolo(Math.min(...q))} e ${quotaConArticolo(Math.max(...q))} del prezzo`
  }
  const k = c.map(r => r.fcKg)
  return `I gusti ti costano fra ${euro2(Math.min(...k))} e ${euro2(Math.max(...k))} al chilo`
}

/** Gli avvisi sotto la frase: costi a metà, costi che non si sanno. */
export function avvisiGusti(r) {
  const out = []
  if (r?.incompleti) {
    out.push(r.incompleti === 1
      ? '1 gusto ha ingredienti senza prezzo: il suo costo è più basso del vero.'
      : `${NF0.format(r.incompleti)} gusti hanno ingredienti senza prezzo: il loro costo è più basso del vero.`)
  }
  if (r?.senzaCosto) {
    out.push(r.senzaCosto === 1
      ? '1 gusto non ha il peso nella ricetta: il costo al chilo non si può fare.'
      : `${NF0.format(r.senzaCosto)} gusti non hanno il peso nella ricetta: il costo al chilo non si può fare.`)
  }
  return out
}

/**
 * @param {object} p
 * @param {ReturnType<import('../../lib/foodCostGusti').righeFoodCostGusti>} p.righe
 * @param {number|null} p.prezzoKg  €/kg senza IVA (media dei formati), o null
 * @param {object} p.ingCosti
 * @param {object} p.ricettario
 * @param {boolean} [p.isMobile]
 */
export default function FoodCostGusti({ righe: righeVere = [], prezzoKg: prezzoKgVero = null, ingCosti, ricettario, formati = [], onNavigate = null, isMobile = false, stile = null }) {
  const [tutti, setTutti] = useState(false)
  const [aperto, setAperto] = useState(null)
  const [provaAperta, setProvaAperta] = useState(false)
  // I prezzi scritti nei campi della prova, per formato. Testo, non numeri:
  // chi scrive «3,5» deve vedere «3,5» finché non ha finito.
  const [scritti, setScritti] = useState({})
  const inMedia = useMemo(() => formatiInMedia(formati), [formati])
  // Solo i prezzi validi e diversi da quello vero sono una prova.
  const prove = useMemo(() => {
    const o = {}
    for (const f of inMedia) {
      const v = prezzoDaTesto(scritti[chiaveFormato(f)])
      if (prezzoProvaValido(v) && Math.abs(v - Number(f.prezzoDefault)) > 0.0049) o[chiaveFormato(f)] = v
    }
    return o
  }, [scritti, inMedia])
  const inProva = Object.keys(prove).length > 0
  const prezzoProva = inProva ? prezzoKgInProva(formati, prove) : null
  const prezzoKg = inProva && prezzoProva > 0 ? prezzoProva : prezzoKgVero
  const righe = useMemo(
    () => (inProva && prezzoProva > 0 ? righeFoodCostGusti(ricettario, ingCosti, prezzoProva) : righeVere),
    [inProva, prezzoProva, ricettario, ingCosti, righeVere])
  const quotaPrima = useMemo(() => new Map(righeVere.map(g => [g.nome, g.quota])), [righeVere])
  const intervallo = useMemo(() => intervalloPrezzoKg(formati), [formati])
  if (!righe.length) return null

  const r = riassuntoGusti(righe)
  const conPrezzo = prezzoKg > 0
  const visibili = tutti ? righe : righe.slice(0, PRIMI_GUSTI)
  const avvisi = avvisiGusti(r)

  const colonne = [
    { chiave: 'gusto', titolo: 'Gusto' },
    // Larghezze su misura delle intestazioni: con quelle di base «Costo al
    // kg, €» finiva sopra «Sul prezzo» (foto del 05/10). Al telefono il
    // margine si toglie: è il prezzo meno il costo, e così non si scorre.
    { chiave: 'costo', titolo: 'Costo al kg', tipo: 'euro', decimali: 2, larghezza: isMobile ? 104 : 120 },
    ...(conPrezzo ? [
      { chiave: 'quota', titolo: 'Sul prezzo', tipo: 'quota', larghezza: isMobile ? 84 : 96 },
      // Con una prova in corso, accanto a quello nuovo il «sul prezzo» di prima.
      ...(inProva ? [{ chiave: 'prima', titolo: 'Prima', tipo: 'quota', larghezza: 96, soloComputer: true }] : []),
      { chiave: 'margine', titolo: 'Margine al kg', tipo: 'euro', decimali: 2, larghezza: 128, soloComputer: true },
    ] : []),
  ]

  const dettaglio = (g) => {
    const ingr = ingredientiAlKg(g.ricetta, ingCosti, ricettario)
    return (
      <div style={{ padding: `${space[2]}px 0 0 ${isMobile ? 0 : space[5]}px` }}>
        {g.mancanti.length > 0 && (
          <RigaAvviso avviso={`Manca il prezzo di: ${g.mancanti.join(', ')}.`} stile={{ marginBottom: space[2] }} />
        )}
        <TabellaAnalisi etichetta={`Ingredienti di ${g.nome}, al chilo di gelato`} isMobile={isMobile}
          colonne={[
            { chiave: 'nome', titolo: 'Ingrediente' },
            { chiave: 'costo', titolo: 'Al kg', tipo: 'euro', decimali: 2, larghezza: isMobile ? 104 : 120 },
            { chiave: 'quota', titolo: 'Del costo', tipo: 'quota', larghezza: isMobile ? 84 : 96 },
            // Una colonna vuota larga quanto il margine: così i costi degli
            // ingredienti cadono sotto il costo del gusto, non 128 px più in là.
            ...(conPrezzo && inProva ? [{ chiave: 'vuota1', titolo: '', larghezza: 96, soloComputer: true }] : []),
            ...(conPrezzo ? [{ chiave: 'vuota', titolo: '', larghezza: 128, soloComputer: true }] : []),
          ]}
          righe={ingr.map((x, i) => ({
            chiave: `${x.nome}-${i}`,
            incompleto: x.mancante,
            celle: { nome: x.nome, costo: x.mancante ? null : x.costoKg, quota: x.mancante ? null : x.quota },
          }))} />
      </div>
    )
  }

  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloGusti(righe, prezzoKg)}
        sottotitolo={conPrezzo
          ? 'Gli ingredienti di un chilo di gelato, contro il prezzo medio dei tuoi formati. Il margine è il prezzo meno gli ingredienti.'
          : 'Gli ingredienti di un chilo di gelato. Per la percentuale e il margine servono i prezzi dei formati di vendita.'} />
      {conPrezzo && (
        <div style={{ marginTop: space[2], marginBottom: space[3], maxWidth: 720, color: T.textSoft, ...testo(font.size.base) }}>
          <div style={{ color: T.text, fontWeight: 700, ...testo(font.size.md) }}>
            {`Prezzo medio, senza IVA: ${euro2(prezzoKg)} al chilo`}
            {inProva && <span style={{ color: T.textSoft, fontWeight: 600 }}>{` (prima ${euro2(prezzoKgVero)})`}</span>}
          </div>
          {/* Il mix di vendita vero non è nei dati: si dice qui, senza allarmare. */}
          <div>
            {'È una stima: conta un formato di ciascun tipo, perché non so quanti pezzi vendi di ogni formato.'}
            {intervallo && ` Coi tuoi formati il prezzo va da ${NF2.format(intervallo.min)} a ${euro2(intervallo.max)} al chilo, a seconda di cosa vendi di più.`}
          </div>
        </div>
      )}
      <FraseInsight verso="info">{fraseGusti(r, prezzoKg)}</FraseInsight>
      {avvisi.map(a => <RigaAvviso key={a} avviso={a} stile={{ marginTop: space[1] }} />)}
      {conPrezzo && inMedia.length > 0 && (
        <div style={{ marginTop: space[3] }}>
          <button type="button" onClick={() => setProvaAperta(!provaAperta)} aria-expanded={provaAperta}
            style={{
              minHeight: 44, padding: `${space[2]}px ${space[3]}px`, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${T.border}`, background: T.bgCard, color: T.brand, fontSize: font.size.base, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: space[1],
            }}>
            Prova i prezzi dei formati
            <Icon name={provaAperta ? 'chevUp' : 'chevDown'} size={12} />
          </button>
          {provaAperta && (
            <div style={{ marginTop: space[3] }}>
              <div style={{
                display: 'grid', gap: space[3], alignItems: 'end',
                gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 160}px, 1fr))`,
              }}>
                {inMedia.map(f => {
                  const k = chiaveFormato(f)
                  return (
                    <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: space[1], minWidth: 0 }}>
                      <span style={{ color: T.textSoft, fontWeight: 600, ...testo(font.size.base), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.nome}{` · ${NF0.format(Number(f.baseQtaG))} g`}
                      </span>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: space[1], minHeight: 44, padding: `0 ${space[3]}px`,
                        borderRadius: R.lg, border: `1px solid ${prove[k] != null ? T.brand : T.border}`, background: T.bgCard,
                      }}>
                        <input type="text" inputMode="decimal" aria-label={`Prezzo ${f.nome}`}
                          value={scritti[k] ?? NF2.format(Number(f.prezzoDefault))}
                          onChange={e => setScritti({ ...scritti, [k]: e.target.value })}
                          style={{
                            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: T.text,
                            fontFamily: 'inherit', fontSize: font.size.lg, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          }} />
                        <span aria-hidden="true" style={{ color: T.textSoft, fontWeight: 600, fontSize: font.size.md }}>€</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              <div style={{ marginTop: space[3], display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
                {inProva && (
                  <button type="button" onClick={() => setScritti({})}
                    style={{
                      minHeight: 44, padding: `${space[2]}px ${space[3]}px`, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${T.border}`, background: T.bgCard, color: T.brand, fontSize: font.size.base, fontWeight: 700,
                    }}>
                    Rimetti i prezzi veri
                  </button>
                )}
                <span style={{ color: T.textSoft, ...testo(font.size.base), flex: 1, minWidth: 200, maxWidth: 560 }}>
                  {inProva ? 'È una prova: non cambia il listino. ' : 'Scrivi un prezzo per vedere cosa cambia: è solo una prova. '}
                  {'Il listino vero si cambia in Listino.'}
                </span>
                {onNavigate && (
                  <button type="button" onClick={() => onNavigate('formati-vendita')}
                    style={{
                      minHeight: 44, padding: `${space[2]}px ${space[3]}px`, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
                      border: 'none', background: 'transparent', color: T.brand, fontSize: font.size.base, fontWeight: 700,
                    }}>
                    Vai al Listino
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: space[3] }}>
        <TabellaAnalisi etichetta="Food cost dei gusti, dal più caro" isMobile={isMobile} colonne={colonne}
          righe={visibili.map(g => ({
            chiave: g.nome,
            incompleto: g.fcKg != null && !g.completo,
            onClick: () => setAperto(aperto === g.nome ? null : g.nome),
            aperta: aperto === g.nome,
            sotto: aperto === g.nome ? dettaglio(g) : null,
            celle: { gusto: g.nome, costo: g.fcKg, quota: g.quota, prima: quotaPrima.get(g.nome) ?? null, margine: g.margineKg },
          }))} />
      </div>
      {righe.length > PRIMI_GUSTI && (
        <button type="button" onClick={() => setTutti(!tutti)} aria-expanded={tutti}
          style={{
            marginTop: space[3], minHeight: 44, padding: `${space[2]}px ${space[3]}px`, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${T.border}`, background: T.bgCard, color: T.brand, fontSize: font.size.base, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: space[1],
          }}>
          {tutti ? `Mostra solo i ${PRIMI_GUSTI} più cari` : `Mostra tutti i ${NF0.format(righe.length)} gusti`}
          <Icon name={tutti ? 'chevUp' : 'chevDown'} size={12} />
        </button>
      )}
    </Riquadro>
  )
}
