import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalUl, LegalLink } from './_LegalLayout'

export default function Rimborsi() {
  return (
    <LegalLayout title="Politica di Rimborso" updated="2026-05-29" related={[['Termini di servizio', '/termini']]}>
      <LegalP>
        FoodOS e' un servizio rivolto a soggetti B2B (partite IVA italiane ed europee). Questa
        pagina chiarisce le condizioni di rimborso e disdetta dell'abbonamento, integrando i
        Termini di Servizio.
      </LegalP>

      <LegalH2>1. Disdetta dell'abbonamento</LegalH2>
      <LegalP>
        Puoi disdire l'abbonamento in qualsiasi momento dalle <strong>Impostazioni → Abbonamento → Gestisci</strong>.
        La disdetta non comporta penali ne' costi aggiuntivi. L'accesso al servizio resta attivo
        fino al termine del periodo di fatturazione già pagato.
      </LegalP>

      <LegalH2>2. Rimborso del periodo non utilizzato</LegalH2>
      <LegalP>
        In linea generale <strong>non rimborsiamo</strong> il canone già pagato per il periodo in
        corso (proration). Il servizio resta utilizzabile fino alla data di rinnovo successiva.
      </LegalP>

      <LegalH2>3. Quando rimborsiamo</LegalH2>
      <LegalP>
        Valutiamo rimborso totale o parziale, caso per caso, nei seguenti scenari:
      </LegalP>
      <LegalUl items={[
        <><strong>Disservizio prolungato</strong>: indisponibilita' del Servizio superiore al 5% in un singolo mese di fatturazione (oltre la soglia indicata nella SLA).</>,
        <><strong>Doppio addebito o errore tecnico di Stripe</strong>: rimborso immediato dell'addebito errato.</>,
        <><strong>Errore in fattura</strong>: emissione di nota di credito secondo la normativa fiscale italiana.</>,
        <><strong>Cessazione anticipata da parte del Fornitore</strong>: se siamo noi a chiudere il Servizio, rimborsiamo il pro-quota non goduto.</>,
      ]} />

      <LegalH2>4. Come richiedere un rimborso</LegalH2>
      <LegalP>
        Scrivi a <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink> indicando:
      </LegalP>
      <LegalUl items={[
        'numero fattura di riferimento (es. FE-2026-0042);',
        'data dell\'evento contestato;',
        'descrizione del problema e impatto sul tuo business.',
      ]} />
      <LegalP>
        Rispondiamo entro 5 giorni lavorativi. In caso di rimborso approvato, il pagamento viene
        accreditato sul metodo originale (carta o bonifico) entro 10 giorni lavorativi.
      </LegalP>

      <LegalH2>5. Cosa NON rimborsiamo</LegalH2>
      <LegalUl items={[
        'cambio di idea o riduzione dell\'utilizzo durante il periodo gia\' pagato;',
        'mancato utilizzo del Servizio per cause non riconducibili al Fornitore (mancata configurazione, mancata adozione interna, ecc.);',
        'errori di inserimento dati o configurazione da parte del Cliente;',
        'malfunzionamenti di servizi terzi (provider di pagamento, hosting esterno, ecc.) per cause non imputabili al Fornitore.',
      ]} />

      <LegalH2>6. Diritto di recesso B2C</LegalH2>
      <LegalP>
        Il diritto di recesso di 14 giorni previsto dal Codice del Consumo (D.Lgs. 206/2005) NON si
        applica al Servizio in quanto rivolto esclusivamente a operatori commerciali (B2B).
      </LegalP>

      <LegalH2>7. Contestazioni</LegalH2>
      <LegalP>
        Per controversie non risolte amichevolmente si rinvia al foro competente come indicato
        nei <LegalLink href="/termini">Termini di Servizio</LegalLink>.
      </LegalP>
    </LegalLayout>
  )
}
