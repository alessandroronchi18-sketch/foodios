-- Normalizzazione di inventario_produzione.gusto_nome (UPPER + trim).
--
-- PERCHE': l'app cerca il gusto sempre in UPPER+trim (normGusto), ma
-- l'import generico (api/import-execute.js) scriveva il nome cosi' come
-- arrivava dal file. In produzione sono finite 117 righe "CAFFè FLORA"
-- (156,1 kg di produzione) mentre la pagina cercava "CAFFÈ FLORA": quelle
-- righe erano invisibili nel foglio settimanale, e scrivendo sul gusto si
-- creava una seconda serie parallela.
--
-- Il codice e' stato corretto in due punti (import-execute.js normalizza in
-- scrittura, calcolaVendutoSettimana normalizza in lettura). Questa
-- migration sistema le righe gia' entrate.
--
-- SICUREZZA: l'UPDATE tocca SOLO le righe non normalizzate e solo se il nome
-- normalizzato NON esiste gia' per la stessa (org, sede, data) — altrimenti
-- violerebbe l'unique. Verificato prima dell'applicazione: 0 collisioni.
-- Idempotente: rilanciata non fa niente.

update public.inventario_produzione a
   set gusto_nome = upper(btrim(a.gusto_nome))
 where a.gusto_nome <> upper(btrim(a.gusto_nome))
   and not exists (
     select 1 from public.inventario_produzione b
      where b.organization_id = a.organization_id
        and b.sede_id = a.sede_id
        and b.data = a.data
        and b.gusto_nome = upper(btrim(a.gusto_nome))
   );
