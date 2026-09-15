-- Chili e pezzi si sommavano fra loro. E il valore della merce si perdeva.
--
-- ── 1. Le unità di misura non venivano guardate ──────────────────────────
--
-- `applica_delta_stock_pf` faceva così:
--
--     on conflict (organization_id, sede_id, prodotto_nome)
--     do update set quantita = stock_prodotti_finiti.quantita + excluded.quantita
--
-- Somma la quantità e **non guarda l'unità**. In tutto il percorso dei prodotti
-- finiti non c'è una sola conversione, e anche il controllo di disponibilità in
-- `trasferimento_invia` confronta due numeri ignorando cosa misurano.
--
-- Lo scenario: la sede di arrivo ha "TORTA MIMOSA" registrata in **kg** (5 kg).
-- Il form dei trasferimenti lascia scegliere fra pz, vassoi, kg, g, l, ml e non
-- mostra in che unità il prodotto è tenuto nelle due sedi. Si spediscono 20
-- **pz**. All'arrivo la giacenza diventa **25 kg**. Da lì in poi le soglie di
-- riordino e il valore di magazzino di quella sede sono sbagliati.
--
-- Oggi in produzione tutte e 21 le righe di stock sono in `pz`, quindi il danno
-- non si è ancora visto. Ma la pagina invita a scegliere fra sei unità.
--
-- La correzione: se la riga esiste già con un'unità diversa, **si alza
-- un'eccezione** invece di sommare. Non si converte in automatico: 20 pezzi di
-- torta non sono 20 kg, e il fattore lo sa solo chi la produce. Meglio fermarsi
-- e far scegliere a una persona che scrivere un numero inventato.
--
-- ── 2. Il valore unitario non arrivava mai a destinazione ────────────────
--
-- L'`insert` non passava `valore_unit`, quindi la riga nella sede di arrivo
-- nasceva con il valore predefinito: zero. E il trasferimento il valore ce
-- l'ha, è un campo del form.
--
-- Cosa si perde: in Magazzino il valore unitario è quello che fa comparire
-- «Valore di quello che scarti: 34 €» quando si butta della merce, e in
-- produzione ci sono valori veri (0,20 / 0,29 / 0,21). Nella sede di arrivo
-- quel messaggio non sarebbe mai comparso, e il magazzino di quella sede
-- varrebbe zero euro.
--
-- Si scrive **solo quando la riga nasce**, non quando si aggiorna: un
-- trasferimento non deve sovrascrivere il costo che quella sede già conosce.

-- ── Una funzione sola, non tre ───────────────────────────────────────────
--
-- Di `applica_delta_stock_pf` esistevano **tre versioni**, con cinque, sei e
-- sette argomenti, tutte con valori predefiniti. Con i default, una chiamata a
-- cinque argomenti combacia sia con la versione a cinque sia con quella a sei,
-- e Postgres si rifiuta di scegliere: `function ... is not unique`. Non è una
-- cosa nuova — un test di sicurezza del 14/09 lo annotava già: «Sei parametri,
-- non cinque: con cinque l'API non sa quale delle due versioni scegliere».
--
-- Finché restano tre, un controllo aggiunto a una delle tre non protegge le
-- altre due: la protezione ci sarebbe e non proteggerebbe niente.
--
-- Qui si riducono a **una**. Il `drop` e il `create` stanno nella stessa
-- transazione: o valgono tutti e due, o non cambia niente. Nessun chiamante va
-- toccato, perché la versione unica ha gli stessi valori predefiniti e accetta
-- le chiamate a cinque, sei o sette argomenti.

begin;

drop function if exists public.applica_delta_stock_pf(uuid, uuid, text, numeric, text);
drop function if exists public.applica_delta_stock_pf(uuid, uuid, text, numeric, text, uuid);
drop function if exists public.applica_delta_stock_pf(uuid, uuid, text, numeric, text, uuid, numeric);

create function public.applica_delta_stock_pf(
  p_org uuid, p_sede uuid, p_prodotto text, p_delta numeric,
  p_unita text default 'pz', p_dipendente_op uuid default null,
  p_valore_unit numeric default null)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nuova numeric;
  v_unita_esistente text;
  v_unita text := coalesce(p_unita, 'pz');
begin
  select unita into v_unita_esistente
    from public.stock_prodotti_finiti
   where organization_id = p_org and sede_id = p_sede and prodotto_nome = p_prodotto
   for update;

  if v_unita_esistente is not null and v_unita_esistente <> v_unita then
    raise exception 'In questa sede "%" è tenuto in % e stai aggiungendo %: non li posso sommare. Allinea l''unità di misura prima di procedere.',
      p_prodotto, v_unita_esistente, v_unita;
  end if;

  insert into public.stock_prodotti_finiti (
    organization_id, sede_id, prodotto_nome, quantita, unita,
    valore_unit, updated_at, dipendente_operativo_id)
  values (p_org, p_sede, p_prodotto, p_delta, v_unita,
    p_valore_unit, now(), p_dipendente_op)
  on conflict (organization_id, sede_id, prodotto_nome)
  do update set
    quantita = public.stock_prodotti_finiti.quantita + excluded.quantita,
    -- Il valore si scrive solo se quella sede non ne ha ancora uno: un
    -- trasferimento non deve sovrascrivere il costo che già conosce.
    valore_unit = coalesce(public.stock_prodotti_finiti.valore_unit, excluded.valore_unit),
    dipendente_operativo_id = excluded.dipendente_operativo_id,
    updated_at = now()
  returning quantita into v_nuova;
  return v_nuova;
end;
$function$;

revoke execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.applica_delta_stock_pf(uuid, uuid, text, numeric, text, uuid, numeric) to service_role;

commit;
