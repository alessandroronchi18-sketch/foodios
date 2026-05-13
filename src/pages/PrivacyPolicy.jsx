import React from 'react'

const S = {
  wrap: { minHeight: '100vh', background: '#FDFAF7', fontFamily: "'Inter', system-ui, sans-serif", color: '#1C0A0A' },
  header: { background: '#1C0A0A', color: '#FFF', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  body: { maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' },
  h1: { fontSize: 28, fontWeight: 900, color: '#1C0A0A', marginBottom: 8, marginTop: 0 },
  h2: { fontSize: 16, fontWeight: 800, color: '#1C0A0A', marginTop: 36, marginBottom: 10 },
  p: { fontSize: 14, lineHeight: 1.8, color: '#4B3832', marginBottom: 12 },
  ul: { fontSize: 14, lineHeight: 1.9, color: '#4B3832', paddingLeft: 20, marginBottom: 12 },
  badge: { display: 'inline-block', background: '#FEF2F2', color: '#C0392B', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, marginBottom: 24 },
}

export default function PrivacyPolicy() {
  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <span style={{ fontWeight: 900, fontSize: 18 }}>🍰 FoodOS</span>
        <a href="/" style={{ color: '#FFF', fontSize: 13, opacity: 0.7, textDecoration: 'none' }}>← Torna all'app</a>
      </div>

      <div style={S.body}>
        <h1 style={S.h1}>Privacy Policy</h1>
        <span style={S.badge}>Aggiornata: maggio 2026</span>

        <p style={S.p}>
          La presente Privacy Policy descrive come FoodOS raccoglie, utilizza e protegge i dati personali
          degli utenti, in conformità con il Regolamento UE 2016/679 (GDPR) e la normativa italiana applicabile.
        </p>

        <h2 style={S.h2}>1. Titolare del trattamento</h2>
        <p style={S.p}>
          <strong>[NOME LEGALE]</strong><br />
          [INDIRIZZO]<br />
          Email: <a href="mailto:support@foodios.it" style={{ color: '#C0392B' }}>support@foodios.it</a>
        </p>

        <h2 style={S.h2}>2. Dati raccolti</h2>
        <p style={S.p}>Raccogliamo le seguenti categorie di dati:</p>
        <ul style={S.ul}>
          <li><strong>Dati di registrazione:</strong> email, nome, cognome, nome dell'attività, tipo di attività, città</li>
          <li><strong>Dati operativi:</strong> ricette e ingredienti inseriti, dati di produzione giornaliera, chiusure di cassa, movimenti di magazzino, fatture fornitori</li>
          <li><strong>Dati di accesso:</strong> indirizzo IP, tipo di browser, data e ora degli accessi (log tecnici)</li>
          <li><strong>Dati di pagamento:</strong> non raccogliamo dati di carte di credito — i pagamenti sono gestiti tramite provider certificati</li>
        </ul>

        <h2 style={S.h2}>3. Finalità e base giuridica</h2>
        <ul style={S.ul}>
          <li><strong>Erogazione del servizio</strong> (base: esecuzione del contratto) — gestione account, sincronizzazione dati, accesso alle funzionalità</li>
          <li><strong>Comunicazioni transazionali</strong> (base: esecuzione del contratto) — conferma registrazione, attivazione account, scadenza trial, fatture</li>
          <li><strong>Miglioramento del servizio</strong> (base: legittimo interesse) — analisi aggregata degli utilizzi anonimi</li>
          <li><strong>Obblighi di legge</strong> (base: obbligo legale) — conservazione per fini fiscali e contabili</li>
        </ul>

        <h2 style={S.h2}>4. Conservazione dei dati</h2>
        <p style={S.p}>
          I dati vengono conservati per l'intera durata del contratto di abbonamento e per i
          <strong> 12 mesi successivi</strong> alla cessazione del rapporto contrattuale, salvo obblighi di
          legge che richiedano periodi di conservazione più lunghi (es. 10 anni per documenti fiscali).
          Trascorso tale periodo, i dati vengono eliminati o resi anonimi in modo irreversibile.
        </p>

        <h2 style={S.h2}>5. Diritti dell'utente</h2>
        <p style={S.p}>In qualità di interessato, hai il diritto di:</p>
        <ul style={S.ul}>
          <li><strong>Accesso</strong> — richiedere una copia dei tuoi dati personali trattati</li>
          <li><strong>Rettifica</strong> — correggere dati inesatti o incompleti</li>
          <li><strong>Cancellazione ("diritto all'oblio")</strong> — richiedere la cancellazione dei tuoi dati, salvo obblighi di legge</li>
          <li><strong>Portabilità</strong> — ricevere i tuoi dati in formato strutturato e leggibile da macchina</li>
          <li><strong>Limitazione del trattamento</strong> — richiedere la sospensione del trattamento in determinate circostanze</li>
          <li><strong>Opposizione</strong> — opporti al trattamento basato su legittimo interesse</li>
          <li><strong>Revoca del consenso</strong> — revocare in qualsiasi momento il consenso prestato</li>
        </ul>
        <p style={S.p}>
          Per esercitare i tuoi diritti scrivi a{' '}
          <a href="mailto:support@foodios.it" style={{ color: '#C0392B' }}>support@foodios.it</a>.
          Risponderemo entro 30 giorni. Hai inoltre il diritto di proporre reclamo al Garante per la
          Protezione dei Dati Personali (<a href="https://www.garanteprivacy.it" style={{ color: '#C0392B' }} target="_blank" rel="noreferrer">garanteprivacy.it</a>).
        </p>

        <h2 style={S.h2}>6. Cookie</h2>
        <p style={S.p}>
          FoodOS utilizza esclusivamente <strong>cookie tecnici</strong> necessari al funzionamento del servizio
          (gestione della sessione autenticata). Non utilizziamo cookie di profilazione, tracciamento pubblicitario
          o analytics di terze parti. Non è richiesto il consenso per i cookie tecnici ai sensi del
          Provvedimento del Garante dell'8 maggio 2014.
        </p>

        <h2 style={S.h2}>7. Terze parti e trasferimenti</h2>
        <p style={S.p}>
          I dati sono ospitati su <strong>Supabase</strong> (infrastruttura PostgreSQL su AWS EU) e
          <strong> Vercel</strong> (CDN e serverless functions, regione Europa). Entrambi i fornitori
          operano in conformità al GDPR e dispongono di adeguate garanzie contrattuali (DPA).
          Non vendiamo né cediamo dati a terze parti per finalità di marketing.
        </p>

        <h2 style={S.h2}>8. Sicurezza</h2>
        <p style={S.p}>
          Adottiamo misure tecniche e organizzative adeguate: comunicazioni cifrate via HTTPS/TLS,
          autenticazione sicura, accessi amministrativi limitati e monitorati, backup regolari con cifratura a riposo.
        </p>

        <h2 style={S.h2}>9. Contatti</h2>
        <p style={S.p}>
          Per qualsiasi domanda relativa alla presente Privacy Policy o al trattamento dei tuoi dati:{' '}
          <a href="mailto:support@foodios.it" style={{ color: '#C0392B' }}>support@foodios.it</a>
        </p>

        <div style={{ borderTop: '1px solid #E8DDD8', marginTop: 48, paddingTop: 20 }}>
          <p style={{ fontSize: 12, color: '#9C7B76' }}>
            © 2026 FoodOS · <a href="/termini" style={{ color: '#C0392B' }}>Termini di Servizio</a>
          </p>
        </div>
      </div>
    </div>
  )
}
