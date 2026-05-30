import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalUl, LegalLink } from './_LegalLayout'

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="2026-05-29" related={[['Termini di servizio', '/termini'], ['Cookie Policy', '/cookie']]}>
      <LegalP>
        La presente Privacy Policy descrive come <strong>FoodOS</strong> raccoglie, utilizza e
        protegge i dati personali degli utenti, in conformità con il Regolamento UE 2016/679
        (GDPR), il D.Lgs. 196/2003 (Codice Privacy italiano) e il Provvedimento del Garante
        dell'8 maggio 2014 in materia di cookie.
      </LegalP>

      <LegalH2>1. Titolare del trattamento</LegalH2>
      <LegalP>
        <strong>[RAGIONE SOCIALE]</strong> — sede legale: [INDIRIZZO COMPLETO], C.F./P.IVA [INSERIRE].<br />
        Email del titolare: <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>.<br />
        Non e' nominato un DPO obbligatorio ai sensi dell'art. 37 GDPR. Per richieste relative
        ai dati personali contatta il titolare all'indirizzo email indicato.
      </LegalP>

      <LegalH2>2. Categorie di dati raccolti</LegalH2>
      <LegalUl items={[
        <><strong>Dati identificativi e di contatto:</strong> email, nome, cognome, telefono (facoltativo), nome dell'attivita', tipo di attivita', citta'.</>,
        <><strong>Dati di fatturazione (B2B):</strong> ragione sociale, P.IVA, codice fiscale, codice destinatario SDI / PEC, indirizzo completo. Necessari per emettere fattura elettronica.</>,
        <><strong>Dati operativi inseriti dall'utente:</strong> ricette, ingredienti, costi, dati di produzione, chiusure cassa, fatture fornitori, dati HACCP, anagrafica personale. Sono dati di tua proprieta'.</>,
        <><strong>Dati di accesso e tecnici:</strong> indirizzo IP, user-agent, timestamp degli accessi, log di rate limiting (necessari per sicurezza).</>,
        <><strong>Dati di pagamento:</strong> NON raccogliamo numeri di carta. I pagamenti passano direttamente a Stripe (vedi sez. 7). Riceviamo solo metadati (importo, ID transazione, esito).</>,
      ]} />

      <LegalH2>3. Finalita' e base giuridica</LegalH2>
      <LegalUl items={[
        <><strong>Erogazione del servizio</strong> (esecuzione del contratto, art. 6.1.b GDPR): account, sincronizzazione dati, accesso alle funzionalita', supporto.</>,
        <><strong>Fatturazione elettronica</strong> (obbligo di legge, art. 6.1.c GDPR): emissione fattura via Sistema di Interscambio (SDI).</>,
        <><strong>Comunicazioni transazionali</strong> (esecuzione del contratto): conferma registrazione, attivazione, scadenza trial, ricevute, avvisi pagamento.</>,
        <><strong>Miglioramento del servizio</strong> (legittimo interesse, art. 6.1.f GDPR): analisi aggregata e anonima degli utilizzi, audit log per sicurezza.</>,
        <><strong>Adempimenti contabili e fiscali</strong> (obbligo di legge): conservazione registri obbligatori per il termine di prescrizione (10 anni).</>,
      ]} />
      <LegalP>
        NON utilizziamo i tuoi dati per finalita' di marketing senza consenso esplicito separato.
        NON facciamo profilazione automatizzata con effetti giuridici significativi.
      </LegalP>

      <LegalH2>4. Conservazione dei dati</LegalH2>
      <LegalUl items={[
        <><strong>Account attivo:</strong> per tutta la durata dell'abbonamento.</>,
        <><strong>Dopo la cessazione:</strong> 12 mesi (per consentire riattivazione e contestazioni), poi cancellati o anonimizzati.</>,
        <><strong>Dati fiscali e fatture:</strong> 10 anni dalla data di emissione (art. 2220 c.c.).</>,
        <><strong>Log tecnici e audit:</strong> 12 mesi.</>,
      ]} />

      <LegalH2>5. Diritti dell'interessato</LegalH2>
      <LegalP>Ai sensi degli artt. 15-22 GDPR puoi esercitare in qualsiasi momento i seguenti diritti:</LegalP>
      <LegalUl items={[
        <><strong>Accesso</strong> (art. 15) — copia dei tuoi dati personali trattati.</>,
        <><strong>Rettifica</strong> (art. 16) — correzione dati inesatti o incompleti.</>,
        <><strong>Cancellazione</strong> (art. 17, diritto all'oblio) — salvo obblighi di legge.</>,
        <><strong>Limitazione del trattamento</strong> (art. 18).</>,
        <><strong>Portabilita'</strong> (art. 20) — ricezione dei dati in formato JSON/CSV strutturato, leggibile da macchina.</>,
        <><strong>Opposizione</strong> (art. 21) — al trattamento basato su legittimo interesse.</>,
        <><strong>Revoca del consenso</strong> (art. 7.3) — in qualsiasi momento, senza pregiudicare la liceita' del trattamento precedente.</>,
      ]} />
      <LegalP>
        Per esercitare i tuoi diritti: <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>.
        Rispondiamo entro 30 giorni (estensibili a 60 in casi complessi). Hai inoltre il diritto di proporre
        reclamo al <LegalLink href="https://www.garanteprivacy.it" target="_blank">Garante per la Protezione dei Dati Personali</LegalLink>.
      </LegalP>

      <LegalH2>6. Modalita' del trattamento e sicurezza</LegalH2>
      <LegalUl items={[
        'Tutte le comunicazioni client/server sono cifrate via HTTPS/TLS 1.2+.',
        'Le password sono salvate con hash bcrypt (gestione delegata a Supabase Auth).',
        'Accesso amministrativo a backoffice limitato e protetto con MFA (TOTP).',
        'Tutte le tabelle del database hanno Row Level Security (RLS) attiva: ogni utente vede solo i dati della propria organizzazione.',
        'Backup automatici giornalieri con cifratura a riposo.',
        'Audit log delle operazioni amministrative.',
      ]} />

      <LegalH2>7. Soggetti terzi (responsabili del trattamento)</LegalH2>
      <LegalP>
        I dati vengono trattati anche dai seguenti fornitori, regolarmente nominati responsabili
        ex art. 28 GDPR mediante DPA (Data Processing Agreement):
      </LegalP>
      <LegalUl items={[
        <><strong>Supabase Inc.</strong> (USA, infrastruttura su AWS Europa) — database, autenticazione, storage file. Trasferimento extra-UE coperto da Standard Contractual Clauses (SCC).</>,
        <><strong>Vercel Inc.</strong> (USA, regione di esecuzione Europa) — hosting CDN, serverless functions. SCC applicabili.</>,
        <><strong>Stripe Payments Europe</strong> (Irlanda) — gestione pagamenti e subscription. Certificato PCI-DSS Livello 1.</>,
        <><strong>Resend Inc.</strong> (USA) — invio email transazionali. SCC applicabili.</>,
        <><strong>Anthropic, PBC</strong> (USA) — funzionalita' AI Assistant facoltative. I dati inviati all'AI non vengono usati per training (vedi privacy Anthropic). SCC applicabili.</>,
        <><strong>[PROVIDER SDI]</strong> (Italia) — emissione fattura elettronica via Sistema di Interscambio. Riceve dati di fatturazione strettamente necessari.</>,
        <><strong>GitHub Inc. / Sentry / log providers</strong> — log di sistema anonimi per debug.</>,
      ]} />

      <LegalH2>8. Cookie e tecnologie simili</LegalH2>
      <LegalP>
        FoodOS utilizza esclusivamente <strong>cookie tecnici</strong> necessari al funzionamento del
        servizio (gestione della sessione autenticata, preferenze interfaccia). Non utilizziamo cookie
        di profilazione, tracciamento pubblicitario o analytics di terze parti. Per i cookie tecnici
        non e' richiesto il consenso ai sensi del Provvedimento del Garante dell'8 maggio 2014.
        Maggiori dettagli nella <LegalLink href="/cookie">Cookie Policy</LegalLink>.
      </LegalP>

      <LegalH2>9. Minori</LegalH2>
      <LegalP>
        Il servizio e' destinato a soggetti maggiorenni titolari di un'attivita' di ristorazione o
        pasticceria. Non raccogliamo consapevolmente dati di minori di 18 anni.
      </LegalP>

      <LegalH2>10. Modifiche alla presente Privacy Policy</LegalH2>
      <LegalP>
        Eventuali modifiche sostanziali verranno comunicate via email con almeno 30 giorni di
        preavviso. La data dell'ultimo aggiornamento e' indicata in cima a questa pagina.
      </LegalP>

      <LegalH2>11. Contatti</LegalH2>
      <LegalP>
        Per qualsiasi domanda relativa alla presente Privacy Policy o al trattamento dei tuoi dati
        scrivi a <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>.
      </LegalP>
    </LegalLayout>
  )
}
