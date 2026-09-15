// FAB unificato: un solo bottone fisso in basso a destra. Tap → si espandono
// 2 sub-FAB (Assistente AI + Feedback) sopra di esso. Tap di nuovo (sul main
// o tap fuori) → si richiudono. Sostituisce i 2 FAB separati che occupavano
// troppo spazio sullo schermo mobile.
//
// Il main FAB renderizza solo l'icona "menu" (+) → "x" quando aperto.
// I sub-FAB sono delegati ai componenti AIAssistant e FeedbackButton con
// prop hideFab=true (il loro FAB interno e' soppresso) e open controllato
// dall'esterno.

import React, { useState, useRef, useEffect, Suspense, lazy } from 'react'
import useIsMobile from '../lib/useIsMobile'
import Icon from './Icon'
import { color as T, z } from '../lib/theme'
import { leggiVistaCorrente, iscrivitiVistaCorrente } from '../lib/vistaCorrente'
import FeedbackButton from './FeedbackButton'

const AIAssistant = lazy(() => import('./AIAssistant'))

// I colori dai token, non scritti a mano: `#4A0810` non esiste in theme.js —
// il token è `brandDarker: #4A0612` — e il bottone dell'assistente usava un
// gradiente diverso da questo, a 54px di distanza. Due gradienti per due
// bottoni della stessa famiglia.
const BRAND = T.brand
const BRAND_DARK = T.brandDarker

export default function FloatingActions({ vistePermesse = null }) {
  // La pagina in cui si trova l'utente, per allegarla alla segnalazione.
  const [viewCorrente, setViewCorrente] = useState(leggiVistaCorrente())
  useEffect(() => iscrivitiVistaCorrente(setViewCorrente), [])
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const wrapperRef = useRef(null)

  // Chiudi expansion cliccando fuori (ma non se uno dei modali e' aperto:
  // li' il click sul backdrop e' già gestito dal modale stesso).
  useEffect(() => {
    if (!expanded || aiOpen || feedbackOpen) return
    function onDocClick(e) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target)) setExpanded(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [expanded, aiOpen, feedbackOpen])

  // Esc chiude il menu. Prima non lo chiudeva niente da tastiera: restava
  // aperto sopra la pagina finché non si cliccava col mouse.
  useEffect(() => {
    if (!expanded) return
    const esc = (e) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [expanded])

  // Quando uno dei modali si chiude, ricomprimi anche il menu.
  useEffect(() => {
    if (!aiOpen && !feedbackOpen && expanded) {
      // Lascia il menu aperto così l'utente puo' aprire l'altro item
      // senza dover ri-tappare. Si chiude col tap fuori.
    }
  }, [aiOpen, feedbackOpen, expanded])

  // Su iPhone la barra di navigazione è alta 56px più la barretta di sistema
  // (34px): 78px non bastavano e i due si sovrapponevano di una dozzina di
  // pixel. `env(safe-area-inset-bottom)` è la misura che la conosce.
  const mainBottom = isMobile ? 'calc(78px + env(safe-area-inset-bottom, 0px))' : 24
  const mainRight = isMobile ? 16 : 24

  // Sub-FAB: stack verticale sopra il main. 56px di spacing per touch.
  const subSpacing = 54

  return (
    <>
      <div ref={wrapperRef} style={{
        position: 'fixed',
        bottom: mainBottom, right: mainRight,
        // Dai token, non 1003 scritto a mano: con quel valore il bottone
        // restava sopra la ricerca rapida, sopra la finestra di upgrade e
        // sopra il modale del feedback stesso — cliccabile sopra il velo
        // scuro. E si nasconde del tutto quando un modale è aperto.
        zIndex: z.fab,
        display: (aiOpen || feedbackOpen) ? 'none' : 'block',
      }}>
        {/* Sub-FAB Assistente AI */}
        <button
          aria-label="Apri assistente AI"
          // Da chiuso non deve essere raggiungibile col Tab: con `opacity: 0` e
          // `pointerEvents: none` il mouse non lo vedeva, ma la tastiera sì —
          // si tabulava su un bottone invisibile e premendo Invio si apriva.
          tabIndex={expanded ? 0 : -1}
          onClick={() => { setAiOpen(true); setExpanded(false) }}
          style={{
            position: 'absolute', right: 0,
            bottom: expanded ? (subSpacing * 2) : 0,
            width: 40, height: 40, borderRadius: '50%',
            background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
            color: '#FFF', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(110,14,26,0.36)',
            opacity: expanded ? 1 : 0,
            visibility: expanded ? 'visible' : 'hidden',
            pointerEvents: expanded ? 'auto' : 'none',
            transition: 'bottom 0.22s cubic-bezier(.4,.2,.2,1), opacity 0.18s ease',
          }}>
          <Icon name="chat" size={18}/>
        </button>

        {/* Sub-FAB Feedback */}
        <button
          aria-label="Invia feedback"
          // Da chiuso non deve essere raggiungibile col Tab: con `opacity: 0` e
          // `pointerEvents: none` il mouse non lo vedeva, ma la tastiera sì —
          // si tabulava su un bottone invisibile e premendo Invio si apriva.
          tabIndex={expanded ? 0 : -1}
          onClick={() => { setFeedbackOpen(true); setExpanded(false) }}
          style={{
            position: 'absolute', right: 0,
            bottom: expanded ? subSpacing : 0,
            width: 40, height: 40, borderRadius: '50%',
            background: '#FFF',
            color: BRAND, border: `1.5px solid ${BRAND}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(110,14,26,0.18)',
            opacity: expanded ? 1 : 0,
            visibility: expanded ? 'visible' : 'hidden',
            pointerEvents: expanded ? 'auto' : 'none',
            transition: 'bottom 0.22s cubic-bezier(.4,.2,.2,1) 0.04s, opacity 0.18s ease 0.04s',
          }}>
          <Icon name="bulb" size={16}/>
        </button>

        {/* Main FAB */}
        <button
          aria-label={expanded ? 'Chiudi menu' : 'Apri menu'}
          aria-expanded={expanded}
          onClick={() => setExpanded(e => !e)}
          style={{
            position: 'relative',
            width: 48, height: 48, borderRadius: '50%',
            background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
            color: '#FFF', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(110,14,26,0.42)',
            transition: 'transform 0.18s ease',
            transform: expanded ? 'rotate(45deg)' : 'rotate(0)',
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Modali (con hideFab=true, il FAB interno non viene renderizzato) */}
      <Suspense fallback={null}>
        <AIAssistant externalOpen={aiOpen} onOpenChange={setAiOpen} hideFab vistePermesse={vistePermesse}/>
      </Suspense>
      <FeedbackButton
        viewCorrente={viewCorrente}
        externalOpen={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        hideFab
      />
    </>
  )
}
