// @vitest-environment happy-dom
//
// ── Il Listino: modificare un formato senza doverlo indovinare ───────────
//
// Il titolare, 03/10/2026: «funzionano ma poco intuitivi quei pulsanti. Fai
// audit per renderlo il più intuitivo possibile».
//
// L'audit, sulla pagina vera con gli 8 formati di Mara (coni, coppette,
// vaschette), ha trovato tre difetti e sei cose che si capivano male:
//
//   1. il cestino eliminava al primo tocco, senza chiedere — e un formato
//      tolto lascia le vendite di cassa con quel nome senza food cost;
//   2. se il salvataggio non riusciva, il modulo si chiudeva lo stesso e
//      diceva «salvato» sopra l'errore: le modifiche sparivano;
//   3. l'anteprima leggeva `form.prezzo`, che non esiste: «su 3,50 € di
//      prezzo» non compariva mai;
//   4. «Modifica» apriva il modulo in cima alla pagina, lontano dalla riga
//      premuta — sull'ottavo formato sembrava non succedere niente;
//   5. sul telefono «Modifica» stava nascosto dentro il dettaglio;
//   6. aprire un altro formato, o premere «Annulla», buttava le modifiche
//      senza dirlo;
//   7. i prezzi si scrivevano col punto («es. 2.60») in campi numerici che
//      la virgola la rifiutano;
//   8. le etichette parlavano da gestionale («base consumata per unità»);
//   9. i pulsanti stavano dentro la riga cliccabile: un pulsante dentro un
//      altro, che l'HTML non permette.
//
// Le prove montano la pagina vera, premono i pulsanti veri e guardano cosa
// finisce nel finto archivio.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'

let FORMATI = []
let SALVATAGGIO_ROTTO = false
let MOBILE = false
const salvataggi = []
vi.mock('../../src/lib/storage', () => ({
  sload: async (key) => (key === 'pasticceria-formati-vendita-v1' ? FORMATI : key === 'pasticceria-materiali-confezionamento-v1' ? [] : null),
  ssave: async (key, val) => {
    if (SALVATAGGIO_ROTTO) throw new Error('rete assente')
    salvataggi.push([key, val])
  },
}))
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => MOBILE, useIsTablet: () => false, useDevice: () => ({ isMobile: MOBILE, isTablet: false }),
}))

const { default: FormatiVendita } = await import('../../src/components/FormatiVendita.jsx')

const RICETTARIO = {
  ricette: {
    PISTACCHIO: { nome: 'PISTACCHIO', tipo: 'gusto', categoria: 'Gusto', unita: 1, prezzo: 0,
      ingredienti: [{ nome: 'pasta di pistacchio', qty1stampo: 1000 }] },
  },
  ingredienti_costi: { 'pasta di pistacchio': { costoKg: 30, costoG: 0.03 } },
}

// La forma vera dei formati di Mara (letta in produzione il 03/10/2026).
const formato = (id, nome, prezzo) => ({
  id, nome, categoria: 'Gusto', alias: [], baseQtaG: 100, prezzoDefault: prezzo,
  componenti: [{ nome: 'Cialda', qta: 1, costo: 0.001 }],
})
const OTTO = [
  formato('f1', 'Cono Piccolo', 3.5), formato('f2', 'Cono Medio', 4.5), formato('f3', 'Cono Grande', 5.5),
  formato('f4', 'Vaschetta 1 KG', 28), formato('f5', 'Vaschetta 1/2 KG', 14),
  formato('f6', 'Coppetta Piccola', 3.5), formato('f7', 'Coppetta media', 4.5), formato('f8', 'Coppetta Grande', 5.5),
]

const avvisi = []
const scrolli = []
async function apri() {
  const v = render(
    <FormatiVendita orgId="o1" ricettario={RICETTARIO} onSaveRicettario={async () => {}}
      notify={(t, ok) => avvisi.push([String(t), ok])} tipoAttivita="gelateria" sedi={[]} />,
  )
  await waitFor(() => expect(document.body.textContent).toMatch(/Coppetta Grande/))
  return v
}
const testo = () => document.body.textContent || ''
const pulsanti = () => [...document.querySelectorAll('button')]
const perEtichetta = (re) => pulsanti().find(b => re.test(b.getAttribute('aria-label') || ''))
const perTesto = (re) => pulsanti().find(b => re.test((b.textContent || '').trim()))
const formatiSalvati = () => {
  const u = [...salvataggi].reverse().find(([k]) => k === 'pasticceria-formati-vendita-v1')
  return u ? u[1] : null
}
const premi = async (b) => { expect(b).toBeTruthy(); await act(async () => { fireEvent.click(b) }) }
const scrivi = async (el, v) => { await act(async () => { fireEvent.change(el, { target: { value: v } }) }) }
const editor = () => document.querySelector('[role="region"]')
const campo = (etichetta) => {
  const l = [...editor().querySelectorAll('label')].find(x => x.textContent.trim() === etichetta)
  return l?.parentElement?.querySelector('input')
}

beforeEach(() => {
  FORMATI = OTTO.map(f => ({ ...f, componenti: f.componenti.map(c => ({ ...c })) }))
  SALVATAGGIO_ROTTO = false; MOBILE = false
  salvataggi.length = 0; avvisi.length = 0; scrolli.length = 0
  Element.prototype.scrollIntoView = function () { scrolli.push(this) }
})
afterEach(() => cleanup())

describe('«Modifica» apre il modulo dove l\'hai premuto', () => {
  it('l\'ottavo formato si modifica al posto della sua riga, non in cima alla pagina', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Coppetta Grande/))
    const ed = editor()
    expect(ed).toBeTruthy()
    expect(ed.getAttribute('aria-label')).toBe('Modifica Coppetta Grande')
    // È nell'elenco, dopo gli altri sette: non sopra le tessere in cima.
    const settima = perEtichetta(/Coppetta media: apri/)
    expect(settima.compareDocumentPosition(ed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // E la riga che stai modificando non c'è due volte.
    expect(perEtichetta(/Coppetta Grande: apri/)).toBeFalsy()
  })

  it('lo schermo ci arriva da solo, e il primo campo è pronto per scrivere', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Vaschetta 1 KG/))
    expect(scrolli).toContain(editor())
    expect(document.activeElement).toBe(editor().querySelector('input'))
  })

  it('il titolo dice quale formato stai modificando', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Medio/))
    expect(editor().textContent).toMatch(/Modifica «Cono Medio»/)
  })

  it('un formato nuovo si scrive in cima, come prima', async () => {
    await apri()
    await premi(perTesto(/^Nuovo formato$/))
    const ed = editor()
    expect(ed.getAttribute('aria-label')).toBe('Nuovo formato di vendita')
    expect(ed.compareDocumentPosition(perEtichetta(/Cono Piccolo: apri/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Eliminare chiede prima', () => {
  it('il cestino non elimina: chiede, e dice cosa succede', async () => {
    await apri()
    await premi(perEtichetta(/Elimina il formato Cono Piccolo/))
    expect(formatiSalvati()).toBeNull()
    expect(testo()).toMatch(/Eliminare «Cono Piccolo»\?/)
    expect(testo()).toMatch(/vendite di cassa con questo nome resteranno senza food cost/)
  })

  it('«Elimina» nella domanda elimina quello, e solo quello', async () => {
    await apri()
    await premi(perEtichetta(/Elimina il formato Cono Piccolo/))
    await premi(document.querySelector('[role="alert"]').querySelector('button'))
    expect(formatiSalvati().map(f => f.nome)).toEqual(OTTO.slice(1).map(f => f.nome))
    expect(avvisi.at(-1)).toEqual(['Formato "Cono Piccolo" eliminato', undefined])
  })

  it('«Annulla» nella domanda non tocca niente', async () => {
    await apri()
    await premi(perEtichetta(/Elimina il formato Cono Piccolo/))
    await premi([...document.querySelector('[role="alert"]').querySelectorAll('button')].find(b => b.textContent === 'Annulla'))
    expect(formatiSalvati()).toBeNull()
    expect(testo()).not.toMatch(/Eliminare «Cono Piccolo»/)
  })

  it('se l\'archivio non risponde, non dice «eliminato» e il formato resta', async () => {
    await apri()
    SALVATAGGIO_ROTTO = true
    await premi(perEtichetta(/Elimina il formato Cono Piccolo/))
    await premi(document.querySelector('[role="alert"]').querySelector('button'))
    expect(avvisi.some(([t]) => /eliminato/.test(t))).toBe(false)
    expect(avvisi.some(([t, ok]) => /Errore salvataggio/.test(t) && ok === false)).toBe(true)
    expect(perEtichetta(/Cono Piccolo: apri/)).toBeTruthy()
  })
})

describe('Un salvataggio che non riesce non perde quello che hai scritto', () => {
  it('il modulo resta aperto con le modifiche, e non dice «salvato»', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await scrivi(campo('Prezzo di vendita (€)'), '3,80')
    SALVATAGGIO_ROTTO = true
    await premi(perTesto(/^Salva le modifiche$/))
    expect(avvisi.some(([t]) => /salvato/.test(t))).toBe(false)
    expect(editor()).toBeTruthy()
    expect(campo('Prezzo di vendita (€)').value).toBe('3,80')
  })
})

describe('Le modifiche non salvate non spariscono in silenzio', () => {
  it('senza modifiche «Annulla» chiude subito', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await premi(perTesto(/^Annulla$/))
    expect(editor()).toBeNull()
  })

  it('con delle modifiche «Annulla» chiede, e «Esci senza salvare» butta via', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await scrivi(campo('Nome sullo scontrino'), 'Cono piccolissimo')
    await premi(perTesto(/^Annulla$/))
    expect(editor()).toBeTruthy()
    expect(testo()).toMatch(/Le modifiche a «Cono Piccolo» non sono salvate/)
    await premi(perTesto(/^Esci senza salvare$/))
    expect(editor()).toBeNull()
    expect(formatiSalvati()).toBeNull()
  })

  it('«Salva ed esci» dalla domanda salva davvero', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await scrivi(campo('Nome sullo scontrino'), 'Cono piccolissimo')
    await premi(perTesto(/^Annulla$/))
    await premi(perTesto(/^Salva ed esci$/))
    expect(formatiSalvati().find(f => f.id === 'f1').nome).toBe('Cono piccolissimo')
    expect(editor()).toBeNull()
  })

  it('aprire un altro formato non butta le modifiche del primo', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await scrivi(campo('Nome sullo scontrino'), 'Cono piccolissimo')
    await premi(perEtichetta(/Modifica il formato Cono Grande/))
    expect(editor().getAttribute('aria-label')).toBe('Modifica Cono Piccolo')
    expect(campo('Nome sullo scontrino').value).toBe('Cono piccolissimo')
    expect(avvisi.at(-1)[0]).toMatch(/modifiche non salvate su «Cono piccolissimo»/)
  })

  it('senza modifiche si passa da un formato all\'altro liberamente', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await premi(perEtichetta(/Modifica il formato Cono Grande/))
    expect(editor().getAttribute('aria-label')).toBe('Modifica Cono Grande')
  })

  it('Esc chiude, se non c\'è niente da perdere', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await act(async () => { fireEvent.keyDown(editor().querySelector('input'), { key: 'Escape' }) })
    expect(editor()).toBeNull()
  })
})

describe('I numeri si scrivono come al banco', () => {
  it('«3,80» col prezzo si salva 3,8 — e «1.000» grammi resta mille, non uno', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Vaschetta 1 KG/))
    await scrivi(campo('Prezzo di vendita (€)'), '29,50')
    await scrivi(campo('Grammi di gusto in un pezzo'), '1.000')
    await premi(perTesto(/^Salva le modifiche$/))
    const f = formatiSalvati().find(x => x.id === 'f4')
    expect(f.prezzoDefault).toBe(29.5)
    expect(f.baseQtaG).toBe(1000)
  })

  it('il costo di un materiale con la virgola non diventa zero', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await scrivi(editor().querySelector('input[aria-label="Costo di un Cialda"]'), '0,060')
    await premi(perTesto(/^Salva le modifiche$/))
    expect(formatiSalvati().find(x => x.id === 'f1').componenti[0].costo).toBeCloseTo(0.06, 6)
  })

  it('i suggerimenti usano la virgola, e i campi non sono più numerici all\'inglese', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    expect(campo('Prezzo di vendita (€)').getAttribute('placeholder')).toBe('es. 2,60')
    expect(editor().querySelectorAll('input[type="number"]').length).toBe(0)
  })

  it('un formato già salvato si apre con la virgola, e salvato senza toccarlo resta uguale', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    expect(campo('Prezzo di vendita (€)').value).toBe('3,5')
    expect(editor().querySelector('input[aria-label="Costo di un Cialda"]').value).toBe('0,001')
    // Aperto e chiuso senza modifiche: niente domanda «perdi le modifiche?».
    await premi(perTesto(/^Annulla$/))
    expect(editor()).toBeNull()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await premi(perTesto(/^Salva le modifiche$/))
    const f = formatiSalvati().find(x => x.id === 'f1')
    expect(f.prezzoDefault).toBe(3.5)
    expect(f.componenti[0]).toEqual({ nome: 'Cialda', qta: 1, costo: 0.001 })
  })

  it('l\'anteprima dice su quale prezzo calcola il margine', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    await waitFor(() => expect(editor().textContent).toMatch(/su 3,50 € di prezzo/))
    await scrivi(campo('Prezzo di vendita (€)'), '3,80')
    expect(editor().textContent).toMatch(/su 3,80 € di prezzo/)
  })
})

describe('Le etichette parlano come al banco', () => {
  it('niente «base consumata per unità» né «(€, informativo)»', async () => {
    await apri()
    await premi(perEtichetta(/Modifica il formato Cono Piccolo/))
    const t = editor().textContent
    expect(t).not.toMatch(/Base consumata|informativo|Categoria ricette collegata/)
    expect(t).toMatch(/Nome sullo scontrino/)
    expect(t).toMatch(/Categoria dei gusti/)
  })
})

describe('I pulsanti stanno accanto alla riga, non dentro', () => {
  it('nessun pulsante dentro un altro pulsante', async () => {
    await apri()
    expect(document.querySelectorAll('button button').length).toBe(0)
  })

  it('aprire il dettaglio e premere «Modifica» sono due cose separate', async () => {
    await apri()
    await premi(perEtichetta(/Cono Piccolo: apri il dettaglio/))
    expect(editor()).toBeNull()
    expect(testo()).toMatch(/Composizione del food cost per unità/)
  })
})

describe('Sul telefono', () => {
  it('«Modifica» si vede subito sulla riga, senza aprire il dettaglio', async () => {
    MOBILE = true
    await apri()
    expect(perEtichetta(/Modifica il formato Cono Piccolo/)).toBeTruthy()
    expect(testo()).not.toMatch(/Composizione del food cost/)
  })

  it('l\'eliminazione sta nel dettaglio e chiede conferma anche qui', async () => {
    MOBILE = true
    await apri()
    await premi(perEtichetta(/Cono Piccolo: apri il dettaglio/))
    await premi(perTesto(/^Elimina il formato$/))
    expect(formatiSalvati()).toBeNull()
    expect(testo()).toMatch(/Eliminare «Cono Piccolo»\?/)
  })
})
