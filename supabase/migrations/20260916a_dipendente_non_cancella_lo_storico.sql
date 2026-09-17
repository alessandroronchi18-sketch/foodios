-- Il dipendente può cancellare lo storico di produzione che non gli è
-- consentito leggere.
--
-- Trovato il 16/09/2026 con l'audit di sicurezza, verificato sul database di
-- produzione in sola lettura.
--
-- Ci sono due elenchi di chiavi, e nessuno aveva mai guardato la loro
-- sovrapposizione:
--
--   `is_chiave_operativa`  → le 6 chiavi su cui il dipendente può SCRIVERE
--   `is_chiave_sensibile`  → le 12 chiavi che al dipendente sono NASCOSTE
--
-- Una chiave sta in tutti e due gli elenchi: `pasticceria-giornaliero-v1`, lo
-- storico della produzione. Il dipendente non lo può leggere e lo può
-- riscrivere. E siccome `user_data` tiene ogni chiave come un unico blocco
-- JSON, "riscrivere" vuol dire sostituire tutto: non si aggiunge una giornata,
-- si rimpiazza l'intero storico.
--
-- Le due porte aperte, tutte e due verificate:
--
--   1. la tabella. `data_update_own` e `data_insert_own` ammettono il
--      dipendente su qualunque chiave operativa, e `data_delete_own` gli
--      lascia perfino cancellare la riga intera. Una sola chiamata REST con il
--      suo normale token di accesso:
--          DELETE /rest/v1/user_data?data_key=eq.pasticceria-giornaliero-v1
--
--   2. la funzione. `fos_user_data_set_batch` fa `update ... set data_value =
--      v_val`, cioè un rimpiazzo totale, e gira in SECURITY DEFINER: le regole
--      di riga non la fermano, controlla da sola solo che la chiave sia
--      operativa.
--
-- Quanto storico è esposto oggi (misurato il 16/09/2026):
--   Gelateria Demo      142 giornate, 56 kB   (ultimo aggiornamento 20/06)
--   Mara dei Boschi       2 giornate          (15/09)
--   Pasticceria Mara 1    1 giornata          (27/05)
--
-- La parte peggiore è che chi lo fa non se ne accorge e non può rimediare: non
-- vedendo la chiave, non sa che c'era dentro qualcosa. E il titolare se ne
-- accorge solo quando apre lo storico e lo trova vuoto.
--
-- La regola che si scrive qui non è "proteggi quella chiave", è una regola
-- generale: **una chiave che il dipendente non può leggere, il dipendente non
-- la può nemmeno scrivere.** Scritta così regge anche domani, quando qualcuno
-- aggiungerà una chiave nuova a uno dei due elenchi senza guardare l'altro.
--
-- Cosa NON cambia per il prodotto. Attenzione, qui la prima stesura di questo
-- commento diceva una cosa falsa — «la pagina Produzione non scrive dal
-- browser» — e va corretta, perché chi la legge si fida (riletto e verificato
-- il 17/09/2026, riga per riga, su `src/views/ProduzioneGiornalieraView.jsx`).
--
-- Quella pagina **scrive dal browser, in quattro punti**:
--
--   riga 200  modifica di una sessione già registrata   → `ssaveBatch`
--   riga 278  eliminazione di una sessione              → `ssaveBatch`
--   riga 551  registrazione del DIPENDENTE              → `/api/produzione-registra`
--   riga 651  registrazione del TITOLARE                → `ssaveBatch`
--
-- Il motivo per cui questa guardia non blocca il lavoro vero è un altro, ed è
-- che i tre punti che scrivono davvero dal browser il dipendente non li
-- raggiunge:
--
--   • riga 551 — è dentro il ramo `if (isDipendente)` che comincia a riga 535.
--     Non scrive `user_data`: manda tutto a `api/produzione-registra.js`, che
--     gira sul server con la chiave di servizio. Lì `auth.uid()` è nullo,
--     quindi `v_dip` è falso e la guardia non lo tocca. È il server che rilegge
--     lo storico vero, aggiunge la giornata in testa e riscrive. Quel ramo
--     finisce con `return` (riga 586): il dipendente non arriva mai più in giù.
--
--   • riga 651 — è `handleConferma` del titolare, cioè il codice dopo quel
--     `return`. Al dipendente è irraggiungibile.
--
--   • righe 200 e 278 — modifica ed elimina stanno nella linguetta «Storico»,
--     che al dipendente non esiste: riga 757 gli costruisce la barra con la
--     sola voce «Nuova sessione», e riga 1205 apre il pannello dello storico
--     solo `!isDipendente`.
--
-- Quindi: la guardia morde esattamente chi deve mordere — qualcuno che chiama
-- l'API con il token di un dipendente fuori dalle schermate del prodotto — e
-- non tocca nessuno dei percorsi che il laboratorio usa davvero.


-- ── 1. La tabella ───────────────────────────────────────────────────────────
-- Le tre regole di scrittura restano identiche per il titolare. Per il
-- dipendente si aggiunge la condizione mancante.

drop policy if exists data_insert_own on public.user_data;
create policy data_insert_own on public.user_data
  for insert to public
  with check (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or (public.is_chiave_operativa(data_key) and not public.is_chiave_sensibile(data_key))
    )
  );

drop policy if exists data_update_own on public.user_data;
create policy data_update_own on public.user_data
  for update to public
  using (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or (public.is_chiave_operativa(data_key) and not public.is_chiave_sensibile(data_key))
    )
  )
  with check (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or (public.is_chiave_operativa(data_key) and not public.is_chiave_sensibile(data_key))
    )
  );

drop policy if exists data_delete_own on public.user_data;
create policy data_delete_own on public.user_data
  for delete to public
  using (
    organization_id = public.get_user_org_id()
    and (
      not public.is_dipendente()
      or (public.is_chiave_operativa(data_key) and not public.is_chiave_sensibile(data_key))
    )
  );


-- ── 2. La funzione ──────────────────────────────────────────────────────────
-- Stesso corpo di prima, con quattro righe in più. Le regole di riga qui non
-- arrivano (SECURITY DEFINER), quindi la guardia va ripetuta: è la stessa
-- doppia rete della migrazione 20260914g — il permesso E il controllo.

create or replace function public.fos_user_data_set_batch(p_items jsonb, p_org uuid default null::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org  uuid;
  v_dip  boolean;
  it     jsonb;
  v_key  text;
  v_val  jsonb;
  v_sede uuid;
begin
  if auth.uid() is not null then
    v_org := public.get_user_org_id();
    v_dip := public.is_dipendente();
  else
    v_org := p_org;
    v_dip := false;
  end if;
  if v_org is null then raise exception 'Organizzazione non determinabile'; end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_key  := it->>'data_key';
    v_val  := it->'data_value';
    v_sede := nullif(it->>'sede_id', '')::uuid;

    if v_dip and not public.is_chiave_operativa(v_key) then
      raise exception 'Operazione non consentita sulla chiave %', v_key;
    end if;

    -- La riga nuova: scrivere qui vuol dire sostituire tutto il blocco. Chi
    -- non può leggere il blocco non sa cosa sta sostituendo, quindi non lo
    -- sostituisce.
    if v_dip and public.is_chiave_sensibile(v_key) then
      raise exception 'La chiave % non si può riscrivere dal browser: contiene dati che il tuo profilo non legge', v_key;
    end if;

    update public.user_data
       set data_value = v_val, updated_at = now()
     where organization_id = v_org and data_key = v_key
       and (sede_id = v_sede or (v_sede is null and sede_id is null));
    if not found then
      insert into public.user_data (organization_id, sede_id, data_key, data_value, updated_at)
      values (v_org, v_sede, v_key, v_val, now());
    end if;
  end loop;
end $function$;

revoke execute on function public.fos_user_data_set_batch(jsonb, uuid) from public, anon;
grant execute on function public.fos_user_data_set_batch(jsonb, uuid) to authenticated, service_role;
