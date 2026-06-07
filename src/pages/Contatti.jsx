import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalUl, LegalLink } from './_LegalLayout'

export default function Contatti() {
  return (
    <LegalLayout title="Contatti" updated="2026-05-29" related={[['Chi siamo', '/chi-siamo']]}>
      <LegalP>
        Vuoi parlare con noi? Vediamo come possiamo aiutarti — siamo un piccolo team italiano,
        rispondiamo personalmente.
      </LegalP>

      <LegalH2>Supporto clienti</LegalH2>
      <LegalP>
        Hai un problema tecnico, una domanda sull'utilizzo, una proposta di miglioramento?<br />
        <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>
      </LegalP>
      <LegalP style={{ fontSize: 13, color: '#9C7B76' }}>
        Risposta entro 24 ore lavorative. Lavoriamo dal lunedi' al venerdi', 9:00-19:00.
      </LegalP>

      <LegalH2>Vendite e partnership</LegalH2>
      <LegalP>
        Sei una pasticceria, gelateria, bar o rete di locali interessata a una demo?<br />
        Vuoi proporre una partnership o un'integrazione?<br />
        <LegalLink href="mailto:hello@foodios.it">hello@foodios.it</LegalLink>
      </LegalP>

      <LegalH2>Richieste legali</LegalH2>
      <LegalP>
        Privacy, GDPR, esercizio dei diritti dell'interessato, richieste contrattuali:<br />
        <LegalLink href="mailto:legal@foodios.it">legal@foodios.it</LegalLink> (o usa{' '}
        <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink> per uniformita').
      </LegalP>

      <LegalH2>PEC e indirizzo legale</LegalH2>
      <LegalP>
        PEC: <strong>[INSERIRE PEC]</strong><br />
        Sede legale: <strong>[INSERIRE INDIRIZZO COMPLETO]</strong>
      </LegalP>

      <LegalH2>Feedback dentro l'app</LegalH2>
      <LegalP>
        Se sei gia' utente di FoodOS, il modo piu' rapido per segnalare bug, idee o complimenti
        e' usare il bottone <strong>Feedback</strong> in basso a destra dentro l'app — arriva direttamente
        a chi sviluppa.
      </LegalP>

      <LegalH2>🤝 Vuoi essere design partner?</LegalH2>
      <LegalP>
        FoodOS cresce su feedback reale. Se sei una pasticceria/gelateria/bar disposta a usare il
        prodotto e a darci un feedback strutturato (1 call settimanale di 30 min), offriamo
        <strong> 12 mesi gratis</strong> in cambio. Scrivi a{' '}
        <LegalLink href="mailto:hello@foodios.it">hello@foodios.it</LegalLink> con oggetto
        "Design Partner".
      </LegalP>
    </LegalLayout>
  )
}
