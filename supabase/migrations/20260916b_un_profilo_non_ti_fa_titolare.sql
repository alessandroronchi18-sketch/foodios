-- Chi non ha un profilo se ne può scrivere uno da titolare, nell'azienda che
-- sceglie lui.
--
-- Trovato il 16/09/2026 con l'audit di sicurezza, verificato sul database di
-- produzione in sola lettura.
--
-- La regola che permette di crearsi il profilo controlla una cosa sola:
--
--     profile_insert_self  →  with check (id = auth.uid())
--
-- Cioè: "la riga deve essere tua". Niente sulle colonne che dicono **di chi
-- sei** e **cosa puoi fare**. E sopra non c'è nessun trigger: quello che
-- esiste, `trg_guard_profile_escalation`, è BEFORE **UPDATE**, e in un
-- inserimento non viene proprio chiamato.
--
-- Letto sul database, colonna per colonna:
--
--     authenticated può INSERIRE organization_id ..... sì
--     authenticated può INSERIRE ruolo ............... sì
--     authenticated può INSERIRE approvato ........... sì
--     authenticated può AGGIORNARE ruolo ............. no
--     trigger BEFORE INSERT su profiles .............. 0
--
-- La quarta riga è la chiave di lettura del difetto: la migrazione
-- `20260914g` ha tolto i permessi sulle colonne in **aggiornamento** e si è
-- dimenticata l'**inserimento**. La porta davanti è stata chiusa, quella sul
-- retro è rimasta aperta.
--
-- L'attacco è una richiesta sola, con la chiave pubblica del sito e il proprio
-- normale accesso:
--
--     POST /rest/v1/profiles
--     { "id": "<il mio>", "email": "...",
--       "organization_id": "<id di Mara dei Boschi>",
--       "ruolo": "titolare", "approvato": true }
--
-- Da quel momento `get_user_org_id()` risponde con l'azienda altrui e
-- `is_dipendente()` risponde di no: ricettario con i costi, food cost, cassa,
-- fatture fornitori, dipendenti e stipendi. Tutto, in lettura e in scrittura.
--
-- SERVE non avere un profilo. E qui va detta una cosa che l'audit ha
-- misurato male la prima volta: i 1.635 utenti senza profilo che ci sono oggi
-- **non sono clienti**, sono gli account dei test automatici
-- (`@foodos-e2e.test` e `@foodios-e2e.test`). Nessuna persona vera è in quella
-- condizione adesso.
--
-- Ma la strada per finirci è dentro il prodotto, e la percorriamo noi:
-- `profiles_organization_id_fkey` è ON DELETE CASCADE, quindi cancellare
-- un'organizzazione porta via le righe di `profiles` e lascia in piedi gli
-- utenti in `auth.users`, con la loro password e la mail confermata.
-- `azElimina` (api/lib/admin/eliminaCliente.js) cancella gli utenti dopo, uno
-- per uno e senza garanzie — il commento nel codice lo dice già: «Tracciare
-- fallimenti per evitare utenti orfani che possono ancora fare login senza
-- profilo». Ogni cancellazione di cliente in cui quel passo fallisce fabbrica
-- una chiave d'ingresso. Oggi ce ne sono 1.635 fabbricate così.
--
-- Cosa NON cambia per il prodotto: nessuna pagina del sito scrive mai su
-- `profiles` in inserimento — verificato, nel client ci sono solo letture e un
-- `update` di `nome_completo`. I profili li crea il trigger `handle_new_user`
-- alla registrazione e le funzioni serverless con la chiave di servizio: in
-- tutti e due i casi `auth.uid()` è nullo, quindi la guardia qui sotto non li
-- sfiora.


-- ── 1. I permessi ───────────────────────────────────────────────────────────
-- Stessa medicina della 20260914g, stavolta sull'inserimento. Si tolgono i
-- permessi in blocco e si riconcedono per nome: restano le tre colonne che
-- descrivono la persona, spariscono quelle che descrivono i suoi poteri.

revoke insert on public.profiles from authenticated;
grant insert (id, email, nome_completo) on public.profiles to authenticated;

-- `anon` non deve scrivere qui in nessun modo. Oggi non ci riesce comunque,
-- perché tutte le regole chiedono `id = auth.uid()` e per un anonimo
-- `auth.uid()` è nullo mentre `id` non ammette il nullo. È un permesso morto,
-- ma un permesso morto è una trappola per il prossimo che scriverà una regola
-- nuova senza sapere questa storia.
revoke insert, update on public.profiles from anon;


-- ── 2. La guardia ───────────────────────────────────────────────────────────
-- Il permesso da solo non basta: una regola di riga scritta domani potrebbe
-- riaprire tutto. Il trigger dice la cosa in modo esplicito, e la dice anche a
-- chi legge il codice.

create or replace function public.guard_profile_insert_self()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Nessun utente davanti alla tastiera: è il trigger di registrazione
  -- (`handle_new_user`) o una funzione serverless con la chiave di servizio.
  -- Sono loro che devono poter assegnare azienda, ruolo e approvazione.
  if auth.uid() is null then
    return new;
  end if;

  -- Riga di qualcun altro: la ferma già `profile_insert_self`. Qui non si
  -- aggiunge niente, per non cambiare il messaggio d'errore che arriva.
  if new.id is distinct from auth.uid() then
    return new;
  end if;

  -- Il profilo che ci si scrive da soli è nudo: nessuna azienda, nessuna
  -- approvazione. L'azienda la assegna chi la possiede, non chi entra.
  if new.organization_id is not null then
    raise exception 'Non si entra in un''azienda scrivendosi il profilo da soli: serve un invito';
  end if;
  if coalesce(new.approvato, false) then
    raise exception 'Un profilo non si approva da solo';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_profile_insert_self on public.profiles;
create trigger trg_guard_profile_insert_self
  before insert on public.profiles
  for each row execute function public.guard_profile_insert_self();

-- Qui NON si revoca l'EXECUTE, e la ragione va scritta perché sembra una
-- dimenticanza: una funzione che restituisce `trigger` non si può chiamare
-- come le altre (Postgres risponde «trigger functions can only be called as
-- triggers»), quindi il permesso non concede niente a nessuno. È lo stesso
-- motivo per cui `guard_profile_escalation`, che sta lì dal 14/09, lo ha
-- ancora.
