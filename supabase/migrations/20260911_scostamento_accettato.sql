-- Celle dell'inventario il cui scostamento è VOLUTO.
--
-- Il conto del venduto (rimasto ieri + prodotto - rimasto - scarto - spedito)
-- a volte non torna per ragioni vere: un omaggio non registrato, una vaschetta
-- rovesciata, un assaggio, un furto. Sui dati del design partner sono 604
-- celle su 7.012 (8,6%), per -2.650 kg.
--
-- Finora quelle celle restavano rosse per sempre e si mescolavano agli errori
-- di compilazione, che invece vanno corretti. Chi guarda non ha modo di
-- distinguere "l'ho già guardata, è così" da "non l'ho ancora vista".
--
-- `scostamento_accettato` = il titolare ha guardato e dice che è giusta.
-- `scostamento_nota`      = perché (resta scritto, serve fra sei mesi).
alter table public.inventario_produzione
  add column if not exists scostamento_accettato boolean not null default false,
  add column if not exists scostamento_nota text;

comment on column public.inventario_produzione.scostamento_accettato is
  'Il titolare ha verificato lo scostamento e lo considera corretto (omaggio, rottura, assaggio). Le celle accettate non contano fra quelle "da controllare".';
comment on column public.inventario_produzione.scostamento_nota is
  'Perché lo scostamento è accettato. Testo libero scritto dal titolare.';

-- Indice parziale: le celle accettate sono poche e si cercano solo quelle.
create index if not exists idx_inv_prod_scostamento_ok
  on public.inventario_produzione (organization_id, sede_id, data)
  where scostamento_accettato = true;
