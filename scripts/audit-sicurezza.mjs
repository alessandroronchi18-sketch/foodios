#!/usr/bin/env node
// Controlli di sicurezza sul database di produzione, da rifare quando serve.
//
// Nati dall'audit del 14/09/2026, dove sono usciti sei difetti veri. Ognuno di
// questi controlli corrisponde a uno di quelli: se un domani qualcuno
// reintroduce lo stesso schema di errore, qui si vede.
//
//   set -a && . ~/.config/foodos/supabase.env && set +a
//   node scripts/audit-sicurezza.mjs
import { execFileSync } from 'node:child_process'

const PSQL = process.env.PSQL || '/usr/local/opt/libpq/bin/psql'
const q = (sql) => execFileSync(PSQL, ['-At', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim()

const controlli = [
  {
    nome: 'ogni tabella ha le regole di isolamento attive',
    sql: `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`,
    atteso: '0',
    perche: 'senza RLS una tabella è leggibile da chiunque abbia la chiave pubblica',
  },
  {
    nome: 'nessuna funzione SECURITY DEFINER senza search_path',
    sql: `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.prosecdef
            and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) x where x like 'search_path=%'))`,
    atteso: '0',
    perche: 'è la via classica per far eseguire codice altrui con i privilegi del proprietario',
  },
  {
    nome: 'nessuna funzione che si fida di un id di organizzazione passato da fuori',
    sql: `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.prosecdef
            and has_function_privilege('anon', p.oid, 'EXECUTE')
            and pg_get_functiondef(p.oid) ilike '%p_org%'`,
    atteso: '0',
    perche: 'chi conosce un id di organizzazione potrebbe scrivere nei dati di quell azienda',
  },
  {
    nome: 'nessun confronto di proprietà che fallisce aperto su NULL',
    sql: `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.prosecdef
            and pg_get_functiondef(p.oid) ilike '%<> public.get_user_org_id()%'
            and pg_get_functiondef(p.oid) not ilike '%get_user_org_id() is null%'`,
    atteso: '0',
    perche: 'in SQL "x <> NULL" non è falso: è NULL, e un if con condizione NULL non scatta',
  },
  {
    nome: 'lo stato commerciale non è scrivibile dal cliente',
    sql: `select count(*) from information_schema.column_privileges
          where table_name='organizations' and grantee='authenticated' and privilege_type='UPDATE'
            and column_name in ('approvato','trial_ends_at','piano','attivo','mesi_bonus','stripe_status','stripe_subscription_id','note_admin','deleted_at','in_attesa')`,
    atteso: '0',
    perche: 'con approvato=true il server dà accesso illimitato: è l abbonamento',
  },
  {
    nome: 'sul proprio profilo si cambia solo il nome',
    sql: `select count(*) from information_schema.column_privileges
          where table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE'
            and column_name <> 'nome_completo'`,
    atteso: '0',
    perche: 'ruolo, approvazione e account di laboratorio non si cambiano da soli',
  },
  {
    nome: 'nessun TRUNCATE concesso ai ruoli pubblici',
    sql: `select count(*) from information_schema.role_table_grants
          where grantee in ('anon','authenticated') and table_schema='public' and privilege_type='TRUNCATE'`,
    atteso: '0',
    perche: 'TRUNCATE ignora le regole di isolamento: svuoterebbe la tabella di tutte le aziende',
  },
  {
    nome: 'nessun bucket di storage pubblico',
    sql: `select count(*) from storage.buckets where public`,
    atteso: '0',
    perche: 'un bucket pubblico serve i file senza autenticazione, a chiunque abbia l indirizzo',
  },
  {
    nome: 'i dati di lavoro non si scrivono senza essere loggati',
    sql: `select case when has_function_privilege('anon', 'public.fos_user_data_set_batch(jsonb,uuid)', 'EXECUTE') then 1 else 0 end`,
    atteso: '0',
    perche: 'è la funzione che scrive ricettario, magazzino, produzione e chiusure',
  },
]

let rotti = 0
for (const c of controlli) {
  let esito
  try { esito = q(c.sql) } catch (e) { esito = 'ERRORE: ' + e.message.split('\n')[0] }
  const ok = esito === c.atteso
  if (!ok) rotti++
  console.log(`${ok ? '  ok  ' : '  ✖   '} ${c.nome}${ok ? '' : `  → trovato ${esito}, atteso ${c.atteso}`}`)
  if (!ok) console.log(`        perché conta: ${c.perche}`)
}
console.log('')
console.log(rotti === 0
  ? `Tutti i ${controlli.length} controlli passano.`
  : `${rotti} controlli su ${controlli.length} FALLITI.`)
process.exit(rotti === 0 ? 0 : 1)
