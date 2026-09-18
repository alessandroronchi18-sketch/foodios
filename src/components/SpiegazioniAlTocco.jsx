// ── Le spiegazioni si aprono davvero: col dito e col mouse, tutte ──────
//
// 17/09/2026. Il titolare ha segnalato due volte che i «mouseover non
// funzionano». La prima volta ho corretto il componente `Tip` — e ho detto
// che era fatto. Non lo era: `Tip` disegna **23** spiegazioni su 249. Le
// altre **226 sono attributi `title=`**, cioè il fumetto che disegna il
// browser, e quello:
//
//   · su uno schermo che si tocca non si apre mai;
//   · col mouse si apre dopo circa un secondo di fermo — un'attesa che
//     nessuno fa, per cui l'effetto pratico è lo stesso: non si vede.
//
// Convertire 226 punti a mano sarebbe lavoro lungo e rischioso, e lascerebbe
// comunque scoperto il 227esimo che qualcuno scriverà domani. Questo
// componente si monta una volta sola, al tetto dell'applicazione, e vale per
// tutti: intercetta il passaggio del mouse e il tocco su qualunque elemento
// che porti un `title`, e lo mostra subito in un fumetto leggibile.
//
// **Come fa a non mostrarne due.** Mentre il fumetto nostro è aperto,
// l'attributo `title` viene tolto dall'elemento e messo da parte in
// `data-spiegazione`; appena il mouse esce, torna dov'era. Se non lo
// togliessimo, dopo un secondo comparirebbe anche quello del browser, sopra
// o sotto al nostro. Il ripristino avviene all'uscita, allo scorrimento, al
// ridimensionamento e allo smontaggio del componente: il `title` non resta
// mai orfano, e comunque React lo riscrive da sé al primo ridisegno.
//
// Cosa NON cambia: l'attributo resta nel codice sorgente, quindi chi legge
// con uno screen reader e chi naviga con la tastiera trova le cose come
// prima.
//
// Perché al `pointerdown` e non al `click` per il dito: su molti elementi il
// click fa anche altro (apre una scheda, ordina una colonna). Il
// `pointerdown` filtrato su `pointerType === 'touch'` prende solo il dito,
// non ruba il click a nessuno e non tocca il comportamento del mouse.
import React, { useEffect, useRef, useState } from 'react'
import { color as T, font } from '../lib/theme'

const ATTESA_MOUSE = 280   // ms: abbastanza da non lampeggiare attraversando la pagina
const DURATA_TOCCO = 6000  // ms: un fumetto aperto per sempre copre quello che sta sotto

export default function SpiegazioniAlTocco() {
  const [fumetto, setFumetto] = useState(null)   // { testo, x, y }
  const sospeso = useRef(null)                   // elemento a cui abbiamo tolto il title
  const timer = useRef(null)

  useEffect(() => {
    // Rimette il `title` dove stava. Va chiamata da ogni strada che chiude il
    // fumetto, altrimenti l'elemento resta senza spiegazione per sempre.
    const ripristina = () => {
      const el = sospeso.current
      if (el && el.dataset.spiegazione != null) {
        el.setAttribute('title', el.dataset.spiegazione)
        delete el.dataset.spiegazione
      }
      sospeso.current = null
    }
    const chiudi = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      ripristina()
      setFumetto(null)
    }

    const testoDi = (el) => {
      const t = el.getAttribute('title') ?? el.dataset.spiegazione
      return t && t.trim().length >= 2 ? t : null
    }
    const posizione = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top }
    }

    const alPassaggio = (e) => {
      const el = e.target?.closest?.('[title]')
      if (!el || el === sospeso.current) return
      const testo = testoDi(el)
      if (!testo) return
      chiudi()
      timer.current = setTimeout(() => {
        // Togliamo il title solo ora: se il mouse è solo di passaggio non
        // abbiamo toccato niente.
        el.dataset.spiegazione = testo
        el.removeAttribute('title')
        sospeso.current = el
        setFumetto({ testo, ...posizione(el) })
      }, ATTESA_MOUSE)
    }

    const allUscita = (e) => {
      const el = e.target?.closest?.('[title],[data-spiegazione]')
      if (!el) return
      if (el === sospeso.current || timer.current) chiudi()
    }

    const alTocco = (e) => {
      if (e.pointerType !== 'touch') return
      const el = e.target?.closest?.('[title],[data-spiegazione]')
      const testo = el && testoDi(el)
      chiudi()
      if (!testo) return
      setFumetto({ testo, ...posizione(el) })
      timer.current = setTimeout(chiudi, DURATA_TOCCO)
    }

    document.addEventListener('pointerover', alPassaggio, true)
    document.addEventListener('pointerout', allUscita, true)
    document.addEventListener('pointerdown', alTocco, true)
    window.addEventListener('scroll', chiudi, true)
    window.addEventListener('resize', chiudi)
    return () => {
      document.removeEventListener('pointerover', alPassaggio, true)
      document.removeEventListener('pointerout', allUscita, true)
      document.removeEventListener('pointerdown', alTocco, true)
      window.removeEventListener('scroll', chiudi, true)
      window.removeEventListener('resize', chiudi)
      chiudi()   // smontando, nessun `title` resta da parte
    }
  }, [])

  if (!fumetto) return null

  const LARG = 260
  const sopra = fumetto.y > 120
  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: Math.max(8, Math.min(fumetto.x - LARG / 2, window.innerWidth - LARG - 8)),
        top: sopra ? fumetto.y - 10 : fumetto.y + 42,
        transform: sopra ? 'translateY(-100%)' : 'none',
        width: LARG, zIndex: 99999, pointerEvents: 'none',
        background: T.tooltipBg, color: 'rgba(255,255,255,0.94)',
        fontSize: font.size.sm, lineHeight: 1.55, fontWeight: 500,
        padding: '10px 13px', borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.38)',
        border: `1px solid ${T.borderOnDark}`,
      }}>
      {fumetto.testo}
    </div>
  )
}
