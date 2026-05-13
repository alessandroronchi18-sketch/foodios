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
  piani: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, margin: '16px 0' },
  pianoCard: { background: '#FFF', border: '1px solid #E8DDD8', borderRadius: 12, padding: '20px 24px' },
}

export default function TerminiServizio() {
  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <span style={{ fontWeight: 900, fontSize: 18 }}>🍰 FoodOS</span>
        <a href="/" style={{ color: '#FFF', fontSize: 13, opacity: 0.7, textDecoration: 'none' }}>← Torna all'app</a>
      </div>

      <div style={S.body}>
        <h1 style={S.h1}>Termini di Servizio</h1>
        <span style={S.badge}>Aggiornati: maggio 2026</span>

        <p style={S.p}>
          I presenti Termini di Servizio ("Termini") regolano l'accesso e l'utilizzo di FoodOS,
          il software gestionale per attività food artigianali. Utilizzando FoodOS accetti integralmente
          i presenti Termini.
        </p>

        <h2 style={S.h2}>1. Descrizione del servizio</h2>
        <p style={S.p}>
          FoodOS è un gestionale SaaS (Software as a Service) progettato per pasticcerie, panifici,
          bar e attività food artigianali. Offre strumenti per la gestione di ricette, calcolo del food cost,
          analisi P&L, gestione del magazzino, produzione giornaliera, chiusura di cassa e scadenzario fatture.
        </p>
        <p style={S.p}>
          Il servizio viene erogato tramite accesso web all'indirizzo{' '}
          <a href="https://foodios-rose.vercel.app" style={{ color: '#C0392B' }}>foodios-rose.vercel.app</a>{' '}
          e non richiede installazione di software.
        </p>

        <h2 style={S.h2}>2. Piani e prezzi</h2>

        <div style={S.piani}>
          <div style={S.pianoCard}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9C7B76', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Piano Pro</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#C0392B', marginBottom: 4 }}>€89<span style={{ fontSize: 14, fontWeight: 400, color: '#9C7B76' }}>/mese</span></div>
            <ul style={{ ...S.ul, margin: '12px 0 0', paddingLeft: 16 }}>
              <li>1 sede</li>
              <li>Ricettario illimitato</li>
              <li>Food cost, P&L, Magazzino</li>
              <li>Scadenzario fatture</li>
              <li>AI Assistant</li>
            </ul>
          </div>
          <div style={{ ...S.pianoCard, border: '2px solid #C0392B' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#C0392B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Piano Chain</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#C0392B', marginBottom: 4 }}>€149<span style={{ fontSize: 14, fontWeight: 400, color: '#9C7B76' }}>/mese</span></div>
            <ul style={{ ...S.ul, margin: '12px 0 0', paddingLeft: 16 }}>
              <li>Sedi illimitate</li>
              <li>Tutto il piano Pro</li>
              <li>Dashboard multi-sede</li>
              <li>Report consolidati</li>
              <li>Supporto prioritario</li>
            </ul>
          </div>
        </div>

        <h2 style={S.h2}>3. Trial gratuito</h2>
        <p style={S.p}>
          FoodOS offre un <strong>periodo di prova gratuito di 30 giorni</strong> senza alcun obbligo.
          Non è richiesta nessuna carta di credito per iniziare la prova. Al termine del periodo di prova,
          l'accesso al servizio è sospeso automaticamente se non viene attivato un abbonamento a pagamento.
          I dati inseriti durante il trial vengono conservati per 12 mesi dalla scadenza.
        </p>

        <h2 style={S.h2}>4. Pagamento e fatturazione</h2>
        <p style={S.p}>
          L'abbonamento è a <strong>pagamento mensile anticipato</strong>. La fattura viene emessa all'inizio
          di ogni periodo mensile. L'utente può disdire l'abbonamento in qualsiasi momento:
          la disdetta ha effetto a partire dal periodo successivo a quello già pagato, senza rimborsi
          per il periodo in corso.
        </p>
        <p style={S.p}>
          In caso di mancato pagamento, FoodOS si riserva il diritto di sospendere l'accesso al servizio
          previa notifica via email con almeno 7 giorni di preavviso.
        </p>

        <h2 style={S.h2}>5. Sospensione dell'account</h2>
        <p style={S.p}>FoodOS può sospendere o terminare l'account in caso di:</p>
        <ul style={S.ul}>
          <li>Mancato pagamento oltre i termini di grazia (7 giorni)</li>
          <li>Violazione dei presenti Termini</li>
          <li>Utilizzo del servizio per finalità illecite o fraudolente</li>
          <li>Richiesta esplicita dell'utente</li>
        </ul>
        <p style={S.p}>
          In caso di sospensione per mancato pagamento, i dati sono conservati per 12 mesi
          e possono essere ripristinati all'attivazione di un nuovo abbonamento.
        </p>

        <h2 style={S.h2}>6. Limitazione di responsabilità</h2>
        <p style={S.p}>
          FoodOS fornisce strumenti di analisi e supporto decisionale. <strong>FoodOS non è responsabile
          delle decisioni aziendali prese dall'utente sulla base dei dati e delle analisi fornite
          dal software.</strong> L'utente è il solo responsabile dell'accuratezza dei dati inseriti
          e delle scelte gestionali adottate.
        </p>
        <p style={S.p}>
          In nessun caso FoodOS sarà responsabile per danni indiretti, lucro cessante, perdita di dati
          o danni consequenziali derivanti dall'utilizzo o dall'impossibilità di utilizzo del servizio.
          La responsabilità massima di FoodOS è limitata all'importo pagato dall'utente nell'ultimo
          mese di abbonamento.
        </p>

        <h2 style={S.h2}>7. Proprietà intellettuale</h2>
        <p style={S.p}>
          FoodOS e tutti i suoi componenti (software, design, testi, algoritmi) sono di proprietà
          esclusiva di FoodOS. È vietata la riproduzione, modifica, distribuzione o reverse engineering
          del software senza autorizzazione scritta.
        </p>
        <p style={S.p}>
          I <strong>dati inseriti dall'utente</strong> (ricette, prezzi, dati operativi) rimangono
          di proprietà dell'utente. FoodOS non rivendica alcun diritto su tali contenuti e li tratta
          esclusivamente per l'erogazione del servizio.
        </p>

        <h2 style={S.h2}>8. Disponibilità del servizio</h2>
        <p style={S.p}>
          FoodOS si impegna a garantire la disponibilità del servizio per almeno il 99% del tempo
          su base mensile. Manutenzioni programmate vengono comunicate via email con almeno 24 ore
          di anticipo. FoodOS non è responsabile per interruzioni dovute a cause di forza maggiore
          o a guasti dei provider di infrastruttura terzi.
        </p>

        <h2 style={S.h2}>9. Modifiche ai Termini</h2>
        <p style={S.p}>
          FoodOS si riserva il diritto di modificare i presenti Termini con un preavviso di almeno
          30 giorni via email. L'utilizzo continuato del servizio dopo tale periodo costituisce
          accettazione dei nuovi Termini.
        </p>

        <h2 style={S.h2}>10. Foro competente e legge applicabile</h2>
        <p style={S.p}>
          I presenti Termini sono regolati dalla <strong>legge italiana</strong>. Per qualsiasi
          controversia relativa all'interpretazione o all'esecuzione dei presenti Termini è
          competente in via esclusiva il <strong>Foro di Torino</strong>.
        </p>

        <h2 style={S.h2}>11. Contatti</h2>
        <p style={S.p}>
          Per qualsiasi domanda sui presenti Termini:{' '}
          <a href="mailto:support@foodios.it" style={{ color: '#C0392B' }}>support@foodios.it</a>
        </p>

        <div style={{ borderTop: '1px solid #E8DDD8', marginTop: 48, paddingTop: 20 }}>
          <p style={{ fontSize: 12, color: '#9C7B76' }}>
            © 2026 FoodOS · <a href="/privacy" style={{ color: '#C0392B' }}>Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  )
}
