-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSTICA EMERGENZA — perdita dati dopo logout/login
-- Esegui questi blocchi UNO PER VOLTA nell'SQL Editor Supabase e
-- incolla i risultati nella chat per la diagnosi.
-- IMPORTANTE: questi sono SOLO SELECT, non modificano nulla.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Quante organizzazioni esistono? E quante per email? ────────────────
--    Se vedi DUE org per la stessa email → trigger ha duplicato l'org al login.
select
  o.id                              as org_id,
  o.nome,
  o.created_at,
  count(p.id)                       as num_profili,
  string_agg(p.email, ', ')         as emails,
  (select count(*) from public.user_data d where d.organization_id = o.id) as num_record_dati
from public.organizations o
left join public.profiles p on p.organization_id = o.id
group by o.id, o.nome, o.created_at
order by o.created_at desc;

-- ── 2) Quanti profili esistono per ogni utente auth? ──────────────────────
--    Atteso: 1 profilo per utente. Se ci sono duplicati → bug grave.
select
  u.id                              as user_id,
  u.email,
  u.created_at                      as auth_creato_il,
  count(p.id)                       as num_profili,
  string_agg(p.organization_id::text, ', ') as org_ids
from auth.users u
left join public.profiles p on p.id = u.id
group by u.id, u.email, u.created_at
order by u.created_at desc;

-- ── 3) Tutti i dati salvati: quanti record per ogni org? ──────────────────
--    Se l'org ha 0 record → i dati non sono mai stati salvati su Supabase
--    (o sono stati cancellati).
select
  d.organization_id,
  o.nome                            as nome_org,
  count(*)                          as num_record,
  string_agg(distinct d.data_key, ', ' order by d.data_key) as chiavi_presenti,
  max(d.updated_at)                 as ultimo_salvataggio
from public.user_data d
left join public.organizations o on o.id = d.organization_id
group by d.organization_id, o.nome
order by max(d.updated_at) desc;

-- ── 4) Per la tua email specifica: profilo + org + tutti i record ─────────
--    SOSTITUISCI 'tua@email.com' con la tua email reale.
with mio_user as (
  select id, email from auth.users where email = 'tua@email.com'
)
select
  'profilo'  as tipo, p.id::text       as id, p.organization_id::text as info, p.email as extra, p.created_at
from public.profiles p, mio_user u where p.id = u.id
union all
select
  'org'      as tipo, o.id::text       as id, o.nome                  as info, o.tipo as extra, o.created_at
from public.organizations o
where o.id in (select organization_id from public.profiles p, mio_user u where p.id = u.id)
union all
select
  'dato'     as tipo, d.id::text       as id, d.data_key              as info,
  ('size=' || length(d.data_value::text)::text) as extra, d.updated_at
from public.user_data d
where d.organization_id in (select organization_id from public.profiles p, mio_user u where p.id = u.id)
order by created_at desc;

-- ── 5) Il trigger handle_new_user: cosa fa attualmente? ───────────────────
--    Verifica che non venga eseguito ad ogni login.
select
  t.tgname              as nome_trigger,
  t.tgenabled           as abilitato,
  c.relname             as tabella,
  p.proname             as funzione,
  pg_get_triggerdef(t.oid) as definizione
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
where t.tgname = 'on_auth_user_created';

-- ── 6) Codice corrente della funzione handle_new_user ─────────────────────
select prosrc from pg_proc where proname = 'handle_new_user';

-- ── 7) RLS funziona? Prova la helper function nel contesto admin ──────────
--    Restituisce NULL perché nel SQL Editor non c'è auth.uid().
--    Eseguila in produzione (via app) per vedere l'org_id reale.
select public.get_user_org_id() as my_org_id_da_sql_editor;

-- ── 8) Conta righe in user_data per ogni data_key (vista globale) ─────────
select
  data_key,
  count(*)                          as num_org_con_dato,
  sum(length(data_value::text))     as size_totale_bytes,
  max(updated_at)                   as ultimo_aggiornamento
from public.user_data
group by data_key
order by ultimo_aggiornamento desc nulls last;
