-- ── «Mail già in uso» va detto, e va detto guardando dappertutto ─────────
--
-- Richiesta del titolare, 21/09/2026: «se inserisco una mail il sistema deve
-- controllare se quella mail è già presente in qualsiasi punto del nostro
-- sistema, se è già presente deve dare l'avviso, mail già in uso».
--
-- ── Il difetto, misurato ────────────────────────────────────────────────
--
-- `api/laboratorio-crea.js` il controllo lo faceva così:
--
--     supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
--
-- cioè **guardava i primi duecento utenti**. Al 21/09/2026 in `auth.users` ce
-- ne sono **2.343**: il 91% delle mail esistenti era invisibile al controllo.
-- Una mail già di qualcun altro passava, e nasceva un secondo account sulla
-- stessa identità — due accessi che si sovrascrivono a vicenda, e il guaio
-- si scopre il giorno in cui uno dei due non riesce più a entrare.
--
-- Paginare fino in fondo non è la risposta: sarebbero dodici chiamate per
-- ogni tentativo, e fra un anno venti. Una domanda si fa al database.
--
-- ── Dove può stare una mail, in questo sistema ─────────────────────────
--
--   `auth.users`   — chi ha già un accesso (titolari, dipendenti, laboratori)
--   `profiles`     — la scheda collegata a quell'accesso
--   `org_inviti`   — chi è stato invitato e non è ancora entrato. Questa è la
--                    più insidiosa: l'invito non ha ancora un utente, quindi
--                    un controllo su `auth.users` non lo vede, e due persone
--                    possono essere invitate con la stessa mail in due aziende
--                    diverse. La prima che accetta si prende l'altra.
--
-- ── Cosa esce da qui, e cosa no ────────────────────────────────────────
--
-- Esce **sì o no**, e basta. Non esce a quale azienda appartiene la mail, né
-- che ruolo ha, né quando è stata creata: sapere che una mail è occupata è
-- quello che serve a chi sta compilando un modulo, tutto il resto sarebbe
-- solo un modo per farsi raccontare chi sono i clienti di Foodos.
--
-- Può chiamarla solo chi è autenticato **e non è un dipendente**: gli account
-- si creano dal pannello del titolare, e un dipendente non ha nessun motivo
-- di poter provare indirizzi.

create or replace function public.email_gia_in_uso(p_email text)
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  -- Chi può chiamarla, e le due strade da cui arriva.
  --
  -- Dal browser del titolare c'è sempre un utente (`auth.uid()`), e lì si
  -- controlla che non sia un dipendente. Dal server — `api/laboratorio-crea.js`
  -- usa la chiave di servizio — di utente non ce n'è nessuno: `auth.uid()` è
  -- nullo. Un JWT «authenticated» porta sempre il suo `sub`, quindi un uid
  -- nullo qui vuol dire soltanto una cosa: è il nostro server a chiedere.
  --
  -- Il permesso è dato ai soli `authenticated` (vedi il `grant` in fondo):
  -- un visitatore non loggato non arriva fin qui a provare indirizzi.
  if v_uid is not null and public.is_dipendente() then
    return jsonb_build_object('ok', false, 'error', 'non_autorizzato');
  end if;

  -- Una mail malformata non è «libera»: è una mail che non si può usare.
  -- Rispondere «libera» qui manderebbe avanti chi ha sbagliato a scrivere.
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', true, 'in_uso', false, 'valida', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'valida', true,
    'in_uso',
      exists (select 1 from auth.users u where lower(u.email) = v_email)
      or exists (select 1 from public.profiles p where lower(p.email) = v_email)
      or exists (select 1 from public.org_inviti i where lower(i.email) = v_email)
  );
end;
$$;

comment on function public.email_gia_in_uso(text) is
  'Dice solo se una mail è già usata da qualche parte nel sistema (accessi, profili, inviti in sospeso). Non dice di chi è né dove: serve a non creare due accessi sulla stessa identità.';

revoke all on function public.email_gia_in_uso(text) from public;
grant execute on function public.email_gia_in_uso(text) to authenticated;

-- Gli indici: senza, ogni controllo è una scansione di 2.343 righe.
-- `lower(email)` perché il confronto è senza maiuscole — «Mario@x.it» e
-- «mario@x.it» sono la stessa persona, e nessuno se lo ricorda quando scrive.
create index if not exists idx_profiles_email_lower on public.profiles (lower(email));
create index if not exists idx_org_inviti_email_lower on public.org_inviti (lower(email));
