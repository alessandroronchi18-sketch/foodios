import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalUl, LegalCallout, LegalLink } from './_LegalLayout'

export default function Rimborsi() {
  return (
    <LegalLayout title="Politica di Rimborso" updated="2026-07-13" related={[['Termini di servizio', '/termini']]}>
      <LegalP>
        In breve: puoi disdire in qualsiasi momento senza penali. Il canone gia'
        pagato per il mese in corso di regola non viene rimborsato, ma se c'e'
        un problema tecnico serio o un errore di addebito rimediamo subito.
      </LegalP>

      <LegalCallout title="Come chiedere un rimborso">
        Scrivi a{' '}
        <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>{' '}
        con: numero fattura, data del problema, descrizione. Rispondiamo entro
        5 giorni lavorativi. Se approvato, il rimborso arriva sul metodo
        originale entro 10 giorni lavorativi.
      </LegalCallout>

      <LegalH2>1. Disdetta dell'abbonamento</LegalH2>
      <LegalP>
        Puoi disdire quando vuoi da <strong>Impostazioni → Abbonamento → Gestisci</strong>.
        Nessuna penale, nessun costo. Il servizio resta attivo fino alla fine
        del periodo gia' pagato.
      </LegalP>

      <LegalH2>2. Rimborso del periodo non utilizzato</LegalH2>
      <LegalP>
        Di regola non rimborsiamo il canone gia' pagato per il mese in corso
        (nessun proration). L'accesso al servizio pero' resta pieno fino al
        rinnovo successivo.
      </LegalP>

      <LegalH2>3. Quando rimborsiamo</LegalH2>
      <LegalP>Valutiamo il rimborso, totale o parziale, in questi casi:</LegalP>
      <LegalUl items={[
        <><strong>Disservizio prolungato</strong>: indisponibilita' del servizio oltre il 5% in un mese di fatturazione (soglia SLA).</>,
        <><strong>Doppio addebito o errore di Stripe</strong>: restituiamo l'addebito errato subito.</>,
        <><strong>Errore in fattura</strong>: emissione di nota di credito secondo la normativa fiscale italiana.</>,
        <><strong>Chiusura del servizio da parte nostra</strong>: rimborso pro-quota del non goduto.</>,
      ]} />

      <LegalH2>4. Cosa NON rimborsiamo</LegalH2>
      <LegalUl items={[
        'cambio idea o utilizzo ridotto durante il periodo gia\' pagato;',
        'mancato utilizzo del servizio per cause tue (configurazione, adozione interna, ecc.);',
        'errori di inserimento dati da parte del cliente;',
        'malfunzionamenti di terzi (provider di pagamento, hosting esterni) non imputabili a Foodos.',
      ]} />

      <LegalH2>5. Diritto di recesso B2C</LegalH2>
      <LegalP>
        Il recesso di 14 giorni previsto dal Codice del Consumo (D.Lgs. 206/2005)
        non si applica: Foodos e' un servizio B2B rivolto a partite IVA.
      </LegalP>

      <LegalH2>6. Contestazioni</LegalH2>
      <LegalP>
        Per controversie non risolte fra noi si rimanda al foro competente
        indicato nei <LegalLink href="/termini">Termini di servizio</LegalLink>.
      </LegalP>
    </LegalLayout>
  )
}
