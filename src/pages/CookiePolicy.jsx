import React from 'react'
import LegalLayout, { LegalH2, LegalP, LegalUl, LegalLink } from './_LegalLayout'

export default function CookiePolicy() {
  return (
    <LegalLayout title="Cookie Policy" updated="2026-05-29" related={[['Privacy Policy', '/privacy']]}>
      <LegalP>
        La presente Cookie Policy descrive le tecnologie utilizzate da <strong>FoodOS</strong> per
        il funzionamento del sito e dell'applicazione, in conformita' al Provvedimento del Garante
        per la Protezione dei Dati Personali dell'8 maggio 2014 e successive Linee Guida 2021.
      </LegalP>

      <LegalH2>1. Cosa sono i cookie</LegalH2>
      <LegalP>
        I cookie sono piccoli file di testo che i siti web installano sul dispositivo dell'utente
        per memorizzare informazioni utili a far funzionare il sito o a migliorarne l'utilizzo.
      </LegalP>

      <LegalH2>2. Cookie utilizzati da FoodOS</LegalH2>
      <LegalP>
        FoodOS utilizza esclusivamente <strong>cookie tecnici di prima parte strettamente necessari</strong>:
      </LegalP>
      <LegalUl items={[
        <><strong>Cookie di sessione di autenticazione</strong> (Supabase Auth): conservano il token JWT che ti tiene loggato. Scadono alla chiusura del browser o al logout esplicito. Senza questi cookie, l'accesso al servizio non e' possibile.</>,
        <><strong>localStorage / sessionStorage</strong>: contengono preferenze interfaccia (es. stato apertura sezioni menu) e cache temporanea dei dati per ridurre i tempi di caricamento. Sono dati esclusivamente locali, non vengono trasmessi a server di terze parti.</>,
      ]} />

      <LegalH2>3. Cookie di terze parti</LegalH2>
      <LegalP>
        Quando attivi il pagamento, il flusso di checkout puo' utilizzare cookie tecnici di
        <strong> Stripe Payments</strong> esclusivamente per la sicurezza della transazione
        (fraud prevention). Stripe e' certificato PCI-DSS L1. Vedi la{' '}
        <LegalLink href="https://stripe.com/cookies-policy/legal" target="_blank">Cookie Policy di Stripe</LegalLink>.
      </LegalP>
      <LegalP>
        Non utilizziamo Google Analytics, Facebook Pixel, o altri strumenti di tracciamento /
        profilazione pubblicitaria. Non utilizziamo cookie per finalita' di marketing.
      </LegalP>

      <LegalH2>4. Consenso</LegalH2>
      <LegalP>
        I cookie tecnici e quelli strettamente necessari NON richiedono il consenso preventivo
        dell'utente ai sensi dell'art. 122 D.Lgs. 196/2003 e del Provvedimento del Garante
        dell'8 maggio 2014. Poiche' FoodOS utilizza solo questa categoria di cookie, non e' presente
        un banner di gestione del consenso.
      </LegalP>

      <LegalH2>5. Come disabilitare i cookie</LegalH2>
      <LegalP>
        Puoi disabilitare l'uso dei cookie dalle impostazioni del tuo browser. Disabilitando i
        cookie tecnici, tuttavia, NON sarai in grado di accedere all'area riservata di FoodOS.
        Istruzioni per i browser piu' diffusi:
      </LegalP>
      <LegalUl items={[
        <LegalLink href="https://support.google.com/chrome/answer/95647" target="_blank">Google Chrome</LegalLink>,
        <LegalLink href="https://support.mozilla.org/it/kb/Gestione%20dei%20cookie" target="_blank">Mozilla Firefox</LegalLink>,
        <LegalLink href="https://support.apple.com/it-it/guide/safari/sfri11471/mac" target="_blank">Apple Safari</LegalLink>,
        <LegalLink href="https://support.microsoft.com/it-it/microsoft-edge/eliminare-i-cookie-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank">Microsoft Edge</LegalLink>,
      ]} />

      <LegalH2>6. Modifiche</LegalH2>
      <LegalP>
        La presente Cookie Policy puo' essere aggiornata periodicamente. La data dell'ultimo
        aggiornamento e' indicata in cima alla pagina.
      </LegalP>

      <LegalH2>7. Contatti</LegalH2>
      <LegalP>
        Per domande sulla Cookie Policy o sul trattamento dei dati:{' '}
        <LegalLink href="mailto:support@foodios.it">support@foodios.it</LegalLink>.
      </LegalP>
    </LegalLayout>
  )
}
