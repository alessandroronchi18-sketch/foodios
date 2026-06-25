import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalUl, LegalLink } from './_LegalLayout'

export default function TerminiServizio() {
  return (
    <LegalLayout title="Termini di Servizio" updated="2026-05-29" related={[['Privacy Policy', '/privacy'], ['Rimborsi', '/rimborsi']]}>
      <LegalP>
        I presenti Termini regolano l'utilizzo del servizio <strong>FoodOS</strong> ("il Servizio"),
        fornito da <strong>[RAGIONE SOCIALE]</strong> ("Fornitore"). Utilizzando il Servizio
        accetti integralmente le presenti condizioni.
      </LegalP>

      <LegalH2>1. Definizioni</LegalH2>
      <LegalUl items={[
        <><strong>Cliente:</strong> persona fisica o giuridica che si registra al Servizio per scopi di lavoro o professione (B2B).</>,
        <><strong>Account:</strong> profilo personale del Cliente, accessibile tramite credenziali.</>,
        <><strong>Piano:</strong> tipologia di abbonamento sottoscritta (Trial, Pro, Chain).</>,
        <><strong>Periodo di prova (Trial):</strong> 3 mesi gratuiti dalla registrazione, senza richiesta di carta di credito.</>,
      ]} />

      <LegalH2>2. Oggetto del contratto</LegalH2>
      <LegalP>
        Il Fornitore concede al Cliente, in modalita' Software-as-a-Service, il diritto non
        esclusivo di accedere e utilizzare le funzionalita' del Servizio per la durata
        dell'abbonamento sottoscritto. Le funzionalita' includono: gestione ricettario, food cost
        analysis, produzione giornaliera, magazzino, casse, fatturazione fornitori, HACCP,
        multi-sede, AI Assistant, integrazioni con sistemi terzi.
      </LegalP>

      <LegalH2>3. Registrazione e account</LegalH2>
      <LegalUl items={[
        'La registrazione e\' riservata a maggiorenni titolari di un\'attivita\' commerciale (B2B).',
        'Il Cliente garantisce la veridicita\' dei dati forniti.',
        'Le credenziali sono personali e non cedibili. Il Cliente e\' responsabile delle attivita\' svolte sul proprio account.',
        'In caso di sospetto accesso non autorizzato, il Cliente deve notificare immediatamente il Fornitore.',
      ]} />

      <LegalH2>4. Periodo di prova e attivazione</LegalH2>
      <LegalP>
        Alla registrazione il Cliente ha diritto a <strong>3 mesi di prova gratuita</strong>. Al termine
        del periodo di prova, l'accesso al Servizio richiede l'attivazione di un piano a pagamento.
        I dati inseriti durante il trial vengono conservati per 12 mesi (vedi Privacy Policy).
        Non e' richiesta carta di credito per attivare il trial.
      </LegalP>

      <LegalH2>5. Piani e prezzi</LegalH2>
      <LegalUl items={[
        <><strong>Pro</strong> — €89/mese (IVA esclusa). Una sede fisica, utenti illimitati per la sede, tutte le funzionalita' core.</>,
        <><strong>Chain</strong> — €149/mese (IVA esclusa). Sedi illimitate, gestione multi-sede, trasferimenti, consolidamento dati.</>,
      ]} />
      <LegalP>
        I prezzi indicati sono per pagamento mensile in modalita' subscription. La fatturazione
        avviene con periodicita' mensile, con addebito automatico sul metodo di pagamento registrato.
        Il Fornitore si riserva il diritto di modificare i prezzi con preavviso di 30 giorni
        comunicato via email; le modifiche non si applicano al periodo già pagato.
      </LegalP>

      <LegalH2>6. Pagamenti e fatturazione</LegalH2>
      <LegalUl items={[
        'I pagamenti sono gestiti tramite Stripe Payments Europe (Irlanda), certificato PCI-DSS L1.',
        'Il Cliente fornisce dati di fatturazione validi: ragione sociale, P.IVA, codice destinatario SDI o PEC, indirizzo completo.',
        'Per ogni periodo di fatturazione viene emessa fattura elettronica trasmessa tramite Sistema di Interscambio (SDI).',
        'In caso di mancato pagamento l\'account viene sospeso dopo 7 giorni di solleciti automatici. I dati restano conservati 12 mesi.',
        'Il Cliente puo\' aggiornare il metodo di pagamento dalle Impostazioni > Abbonamento in qualsiasi momento.',
      ]} />

      <LegalH2>7. Diritto di recesso e rimborsi</LegalH2>
      <LegalP>
        Il Cliente, essendo soggetto B2B, NON e' un consumatore ai sensi del Codice del Consumo
        (D.Lgs. 206/2005). Non si applicano pertanto i 14 giorni di recesso previsti per il B2C.
        Tuttavia il Cliente puo' disdire l'abbonamento in qualsiasi momento dalle Impostazioni;
        la disdetta diventa effettiva al termine del periodo già pagato (no proration di rimborso).
        Per casi particolari (es. malfunzionamento prolungato del Servizio), il Fornitore valuta
        rimborsi caso per caso — vedi <LegalLink href="/rimborsi">policy rimborsi</LegalLink>.
      </LegalP>

      <LegalH2>8. Livello di servizio (SLA)</LegalH2>
      <LegalP>
        Il Fornitore si impegna a garantire una disponibilita' indicativa del 99% su base mensile,
        esclusi gli interventi di manutenzione programmata (comunicati con almeno 24 ore di preavviso
        via banner in-app) e cause di forza maggiore. Eventuali interruzioni significative del
        Servizio possono dar luogo a crediti commerciali da valutare caso per caso.
      </LegalP>

      <LegalH2>9. Proprieta' dei dati</LegalH2>
      <LegalP>
        Tutti i dati inseriti dal Cliente (ricette, ingredienti, fatture, dati di produzione, dati
        del personale, ecc.) restano <strong>di proprieta' esclusiva del Cliente</strong>. Il Fornitore
        agisce esclusivamente come responsabile del trattamento ex art. 28 GDPR. Il Cliente puo'
        esportare i propri dati in qualsiasi momento (formato JSON/CSV) tramite l'apposita
        funzionalita' in Impostazioni → Esporta dati.
      </LegalP>

      <LegalH2>10. Proprieta' del Servizio</LegalH2>
      <LegalP>
        Codice sorgente, design, marchi, contenuti del sito e della piattaforma sono di proprieta'
        esclusiva del Fornitore. Al Cliente e' concessa solo una licenza d'uso non esclusiva, non
        cedibile e revocabile, limitata alla durata dell'abbonamento.
      </LegalP>

      <LegalH2>11. Uso accettabile</LegalH2>
      <LegalP>Il Cliente si impegna a NON:</LegalP>
      <LegalUl items={[
        'utilizzare il Servizio per attivita\' illecite o in violazione di legge;',
        'caricare contenuti che violino diritti di terzi (proprieta\' intellettuale, dati personali, ecc.);',
        'tentare di accedere a dati di altri Clienti o aggirare le misure di sicurezza;',
        'effettuare reverse engineering, decompilare o copiare il codice del Servizio;',
        'rivendere o cedere a terzi le funzionalita\' del Servizio;',
        'utilizzare le API in modo anomalo (es. scraping aggressivo, rate limit abuse).',
      ]} />
      <LegalP>
        La violazione di queste regole comporta sospensione immediata dell'account senza
        diritto a rimborso.
      </LegalP>

      <LegalH2>12. Limitazione di responsabilita'</LegalH2>
      <LegalP>
        Il Servizio e' fornito "as is". Nei limiti consentiti dalla legge, il Fornitore non
        risponde di danni indiretti, perdita di profitti, perdita di dati derivante da uso
        improprio o da forza maggiore. La responsabilita' complessiva del Fornitore verso il
        Cliente, per qualsiasi causa, e' limitata all'importo pagato dal Cliente nei 12 mesi
        precedenti l'evento dannoso.
      </LegalP>

      <LegalH2>13. Riservatezza</LegalH2>
      <LegalP>
        Entrambe le parti si impegnano a non divulgare a terzi informazioni riservate apprese
        nel corso del rapporto contrattuale, fatte salve le comunicazioni richieste per legge.
      </LegalP>

      <LegalH2>14. Modifica dei Termini</LegalH2>
      <LegalP>
        Il Fornitore puo' modificare i presenti Termini con preavviso di 30 giorni via email. In
        caso di modifiche sostanziali non gradite il Cliente puo' disdire l'abbonamento prima
        dell'entrata in vigore senza penalita'.
      </LegalP>

      <LegalH2>15. Legge applicabile e foro competente</LegalH2>
      <LegalP>
        Il presente contratto e' regolato dalla legge italiana. Per ogni controversia il foro
        competente in via esclusiva e' quello di <strong>[CITTA' SEDE LEGALE]</strong>.
      </LegalP>

      <LegalH2>16. Contatti</LegalH2>
      <LegalP>
        Per richieste contrattuali, commerciali o di supporto:{' '}
        <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>.
      </LegalP>
    </LegalLayout>
  )
}
