import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalLink } from './_LegalLayout'

export default function ChiSiamo() {
  return (
    <LegalLayout title="Chi siamo" updated="2026-05-29" related={[['Contatti', '/contatti']]}>
      <LegalP>
        Foodos nasce da un problema concreto: <strong>gestire una pasticceria, una gelateria o un
        ristorante artigianale e' un casino di Excel, post-it e WhatsApp</strong>. Tra ricette,
        food cost, scontrini e fornitori, ogni settimana si perdono ore a fare quello che un
        software dovrebbe fare da solo.
      </LegalP>

      <LegalH2>Cosa fa Foodos</LegalH2>
      <LegalP>
        Un unico posto per <strong>ricettario, food cost, produzione, magazzino, cassa, fornitori,
        HACCP e fatturazione</strong> - pensato per chi produce dolci o gelato e vende al banco.
        Niente formule complicate, niente integrazioni infinite. Calcola da solo il costo di ogni
        ricetta, ti dice cosa hai venduto e cosa no, scala il magazzino quando produci.
      </LegalP>

      <LegalH2>Per chi</LegalH2>
      <LegalP>
        Pasticcerie e gelaterie artigianali italiane con 1-10 sedi. Soggetti con partita IVA che
        vogliono capire i numeri della propria attivita' senza diventare contabili. Lavoriamo
        bene con chi ha tra <strong>1 e 6 sedi</strong>; ogni sede ha la sua dashboard, e dal
        backoffice vedi tutto consolidato.
      </LegalP>

      <LegalH2>Da dove veniamo</LegalH2>
      <LegalP>
        Foodos nasce dall'esperienza diretta in laboratorio: tutto quello che vedi nel software
        e' nato da un problema concreto del banco, del laboratorio o della cassa.
        La filosofia: niente feature inutili, niente AI per il gusto di averla,
        solo cose che fanno risparmiare tempo e ridurre errori.
      </LegalP>

      <LegalH2>Come lavoriamo</LegalH2>
      <LegalP>
        Foodos e' guidato dai feedback dei design partner: <strong>chi usa il prodotto decide le
        prossime feature</strong>. Ogni settimana raccogliamo bug, idee, frustrazioni. Le più
        urgenti diventano release nello stesso giorno; le altre entrano in roadmap.
      </LegalP>

      <LegalH2>Il team</LegalH2>
      <LegalP>
        Siamo piccoli, italiani, con esperienza nella ristorazione e nello sviluppo software.
        Vuoi conoscerci? Scrivi a{' '}
        <LegalLink href="mailto:hello@foodios.it">hello@foodios.it</LegalLink>.
      </LegalP>

      <LegalH2>Trasparenza</LegalH2>
      <LegalP>
        Foodos non e' finanziato da venture capital. Cresciamo con i ricavi reali dei nostri
        clienti. Questo significa: niente pressione a fare crescita a tutti i costi, niente
        vendita dei tuoi dati, niente cambio di prezzi improvvisi. Se decidiamo di chiudere il
        servizio (improbabile, ma onesti) ti garantiamo l'export integrale dei tuoi dati
        in formato standard con preavviso di almeno 6 mesi.
      </LegalP>
    </LegalLayout>
  )
}
