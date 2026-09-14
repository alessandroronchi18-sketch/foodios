-- Un titolare poteva dichiararsi cliente pagante da solo.
--
-- Trovato il 14/09/2026. La regola di scrittura su `organizations` dice: puoi
-- aggiornare la TUA riga se non sei un dipendente. Giusto — ma il permesso di
-- UPDATE era concesso su TUTTE le colonne, comprese quelle che non sono dati
-- dell'attività ma dello stato commerciale:
--
--   approvato        → `verificaToken` lo legge così: "Pagante (approvato=true)
--                       → accesso illimitato". Mettendolo a true si sblocca
--                       tutto senza pagare niente.
--   trial_ends_at    → si allunga la prova da soli, all'infinito
--   piano, mesi_bonus, stripe_*  → stato dell'abbonamento
--   attivo, in_attesa, note_admin, deleted_at → stato amministrativo
--
-- Non serviva un bug: bastava una chiamata dal browser, perché il permesso
-- c'era. Il registro delle modifiche lo avrebbe scritto (c'è un trigger che
-- logga ogni cambio su organizations) ma nessuno l'avrebbe fermato.
--
-- Cosa scrive davvero il client su questa tabella, controllato riga per riga:
-- `nome`, `metodo_produzione`, `telefono_whatsapp`. Tutto il resto lo scrive il
-- pannello admin o Stripe, con la chiave di servizio, che ignora questi
-- permessi perché è proprietaria.
--
-- Qui si toglie l'UPDATE su tutta la tabella e lo si ridà solo sulle colonne
-- che sono dati dell'attività. Le altre restano scrivibili solo dal servizio.

revoke update on public.organizations from authenticated;

grant update (
  nome, nome_attivita, tipo, metodo_produzione, telefono_whatsapp,
  giorni_chiusura, slug,
  -- dati fiscali, che il titolare inserisce dalle impostazioni
  ragione_sociale, partita_iva, codice_fiscale, pec, codice_destinatario,
  indirizzo, citta, cap, provincia, nazione, business_info_updated_at
) on public.organizations to authenticated;
