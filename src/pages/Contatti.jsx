import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalCallout, LegalLink } from './_LegalLayout'

// Placeholder legali: se contengono "[INSERIRE" non sono ancora compilati e la
// sezione va nascosta in pubblico (evita di far vedere placeholder ai clienti).
const PEC = '[INSERIRE PEC]'
const SEDE_LEGALE = '[INSERIRE INDIRIZZO COMPLETO]'
const legaliCompilati = !PEC.includes('[INSERIRE') && !SEDE_LEGALE.includes('[INSERIRE')

export default function Contatti() {
  return (
    <LegalLayout title="Contatti" updated="2026-07-13" related={[['Chi siamo', '/chi-siamo']]}>
      <LegalP>
        Siamo in pochi e leggiamo tutto noi. Se hai una domanda, un problema
        o una proposta scrivici: rispondiamo sempre, di solito nella stessa giornata.
      </LegalP>

      <LegalCallout title="Il modo piu' veloce">
        Per qualsiasi cosa scrivi a{' '}
        <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>.
        Se sei gia' utente, il bottone <strong>Feedback</strong> in basso a destra
        dentro l'app va direttamente a chi sviluppa - piu' rapido dell'email.
      </LegalCallout>

      <LegalH2>Supporto tecnico</LegalH2>
      <LegalP>
        Bug, domande sull'utilizzo, richieste di funzionalita':{' '}
        <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>.
        Rispondiamo entro 24 ore lavorative (lun-ven, 9-19).
      </LegalP>

      <LegalH2>Vendite, demo e partnership</LegalH2>
      <LegalP>
        Sei una pasticceria, gelateria, bar o rete di locali e vuoi vedere Foodos
        dal vivo? Vuoi proporre un'integrazione?{' '}
        <LegalLink href="mailto:hello@foodios.it">hello@foodios.it</LegalLink>.
      </LegalP>

      <LegalH2>Richieste legali e privacy</LegalH2>
      <LegalP>
        GDPR, diritti dell'interessato, questioni contrattuali:{' '}
        <LegalLink href="mailto:legal@foodios.it">legal@foodios.it</LegalLink>.
        Se non sai a chi rivolgerti, scrivi a support@ e giriamo noi.
      </LegalP>

      {legaliCompilati && (
        <>
          <LegalH2>PEC e sede legale</LegalH2>
          <LegalP>
            PEC: <strong>{PEC}</strong><br />
            Sede legale: <strong>{SEDE_LEGALE}</strong>
          </LegalP>
        </>
      )}

      <LegalH2>Design partner</LegalH2>
      <LegalP>
        Foodos e' costruito col feedback di chi lavora al banco tutti i giorni.
        Se sei disposto a raccontarci come lo usi con una call ogni tanto,
        ti diamo <strong>12 mesi gratis</strong>. Scrivi a{' '}
        <LegalLink href="mailto:hello@foodios.it">hello@foodios.it</LegalLink>{' '}
        con oggetto "Design Partner".
      </LegalP>
    </LegalLayout>
  )
}
