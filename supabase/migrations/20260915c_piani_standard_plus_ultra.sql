-- I piani si chiamano Standard, Plus e Ultra. E per ora se ne vende uno solo.
--
-- Decisione del titolare, 15/09/2026: si offre il **Plus**, con tutto dentro.
-- Standard e Ultra restano definiti — nel codice e qui — perché il giorno che
-- si riaprono non si riparte da zero, ma non si mostrano in vetrina.
--
-- ── Il difetto che questa migrazione corregge per strada ───────────────────
--
-- `plan_pricing` era ferma al **27/05/2026**: due sole righe, `pro` a 8.900
-- centesimi e `chain` a 14.900, con le etichette "Pro" e "Chain". Il 21/06 i
-- piani sono stati rinominati e riprezzati (69 / 149 / 399) ma **questa
-- tabella non è mai stata aggiornata**.
--
-- Non era un dettaglio interno: `usePlanPricing` fa vincere la riga del
-- database sul valore scritto nel codice, quindi **la pagina pubblica mostrava
-- 89 € e 149 €** dove il listino diceva 149 € e 399 €. Da giugno. Chiunque
-- abbia guardato i prezzi di Foodos in questi tre mesi ha letto dei numeri che
-- non erano quelli.
--
-- La riga `base` non esisteva proprio: quel piano campava solo sul valore di
-- riserva scritto nel codice.

-- Standard — non in vendita adesso.
insert into public.plan_pricing (plan, prezzo_mese_cents, valuta, label, nome_display, descrizione, attivo, aggiornato_il)
values ('base', 6900, 'eur', 'Standard', 'Standard', 'Una sede, l''essenziale.', false, now())
on conflict (plan) do update set
  prezzo_mese_cents = excluded.prezzo_mese_cents,
  label = excluded.label, nome_display = excluded.nome_display,
  descrizione = excluded.descrizione, attivo = excluded.attivo,
  aggiornato_il = now();

-- Plus — l'unico che si vende.
insert into public.plan_pricing (plan, prezzo_mese_cents, valuta, label, nome_display, descrizione, attivo, aggiornato_il)
values ('pro', 14900, 'eur', 'Plus', 'Plus', 'Tutto Foodos, senza limiti di sede o di utenti.', true, now())
on conflict (plan) do update set
  prezzo_mese_cents = excluded.prezzo_mese_cents,
  label = excluded.label, nome_display = excluded.nome_display,
  descrizione = excluded.descrizione, attivo = excluded.attivo,
  aggiornato_il = now();

-- Ultra — non in vendita adesso.
insert into public.plan_pricing (plan, prezzo_mese_cents, valuta, label, nome_display, descrizione, attivo, aggiornato_il)
values ('chain', 39900, 'eur', 'Ultra', 'Ultra', 'Per gruppi e catene.', false, now())
on conflict (plan) do update set
  prezzo_mese_cents = excluded.prezzo_mese_cents,
  label = excluded.label, nome_display = excluded.nome_display,
  descrizione = excluded.descrizione, attivo = excluded.attivo,
  aggiornato_il = now();
