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

      <LegalCallout title="Il modo più veloce">
        Se sei già dentro Foodos, usa il bottone <strong>Feedback</strong> in basso
        a destra: arriva diretto a chi scrive il programma, con già allegato in
        che pagina eri. È la strada più corta.
        <br /><br />
        Se non sei ancora utente, scrivi a{' '}
        <LegalLink href="mailto:support@foodos.it">support@foodos.it</LegalLink>.
      </LegalCallout>

      <LegalH2>Supporto tecnico</LegalH2>
      <LegalP>
        Problemi, domande su come si usa, cose che vorresti ci fossero:{' '}
        <LegalLink href="mailto:support@foodos.it">support@foodos.it</LegalLink>.
        Rispondiamo in giornata, dal lunedì al venerdì. Il sabato e la domenica leggiamo, ma rispondiamo il lunedì.
      </LegalP>

      <LegalH2>Vendite, demo e partnership</LegalH2>
      <LegalP>
        Sei una pasticceria, gelateria, bar o un gruppo di locali e vuoi vedere
        Foodos dal vivo, con i tuoi numeri? Oppure vuoi collegarci la tua cassa?{' '}
        <LegalLink href="mailto:hello@foodos.it">hello@foodos.it</LegalLink>.
      </LegalP>

      <LegalH2>Richieste legali e privacy</LegalH2>
      <LegalP>
        GDPR, diritti dell'interessato, questioni contrattuali:{' '}
        <LegalLink href="mailto:legal@foodos.it">legal@foodos.it</LegalLink>.
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
        Foodos è costruito con chi lavora al banco tutti i giorni.
        Se ci racconti come lo usi — una chiacchierata ogni tanto, anche al
        telefono — ti diamo <strong>12 mesi gratis</strong>. Scrivi a{' '}
        <LegalLink href="mailto:hello@foodos.it">hello@foodos.it</LegalLink>{' '}
        con oggetto "Design Partner".
      </LegalP>
    </LegalLayout>
  )
}
