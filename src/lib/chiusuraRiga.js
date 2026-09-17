// Traduzione fra la forma che usano i componenti e la riga di database.
//
// Sta in un modulo suo, senza nessun import, perché la usano due mondi che non
// possono condividere il client Supabase: `chiusure.js` (browser, client anon
// di `./supabase`) e `demoSeedFull.js`, che gira anche dentro la funzione
// Vercel dell'amministrazione con un client service-role passato da fuori.
// Importare `chiusure.js` di là farebbe esplodere l'endpoint: `./supabase`
// legge `import.meta.env`, che in Node non esiste.
//
// Una regola sola, in un posto solo: se domani si aggiunge una colonna, i due
// mondi restano allineati senza che nessuno debba ricordarsene.

// ── Le colonne che si leggono ─────────────────────────────────────────────
//
// `scontrino_medio_eur` mancava da questo elenco fino al 16/09/2026, e
// `rigaAChiusura` qui sotto la legge (`r.scontrino_medio_eur`). PostgREST non
// restituisce una colonna che non è stata chiesta: il campo arrivava
// `undefined`, e `undefined == null` è vero, quindi `scontrinoMedio` usciva
// SEMPRE `null`. Lo scontrino medio in euro si scriveva (riga 68 di
// `chiusuraARiga`), la colonna esiste nel database, e nessuno lo rileggeva mai:
// chi lo compilava nella chiusura rapida lo vedeva sparire al ricaricamento.
export const COLONNE = 'id, data, tot_venduto, tot_foodcost, tot_margine, tot_scarti, margine_pct, scontrino_medio, scontrino_medio_eur, incasso_pos, incasso_contanti, incasso_delivery, venduto, formati, extra, is_demo, legacy_id'

/** Riga di database → forma che i componenti si aspettano. */
export function rigaAChiusura(r) {
  return {
    ...(r.extra || {}),
    id: r.legacy_id || r.id,
    data: r.data,
    kpi: {
      totV:  Number(r.tot_venduto) || 0,
      totFC: Number(r.tot_foodcost) || 0,
      totM:  Number(r.tot_margine) || 0,
      totS:  Number(r.tot_scarti) || 0,
      totMP: Number(r.margine_pct) || 0,
      // `scontrino_medio` contiene il SELL-THROUGH in percentuale (nome
      // storico fuorviante, vedi il commento sulla colonna nel DB).
      // null resta null: "non rilevato" non è "0% smaltito".
      avgST: r.scontrino_medio == null ? null : Number(r.scontrino_medio),
      // Euro per scontrino: ha una colonna sua da 10/09/2026. Prima la
      // chiusura rapida lo scriveva dentro avgST e lo Storico lo mostrava
      // come una percentuale di sell-through, in rosso.
      scontrinoMedio: r.scontrino_medio_eur == null ? null : Number(r.scontrino_medio_eur),
      // Scomposizione per canale: null vuol dire "non rilevato", che e' diverso
      // da zero. Chi registra solo il totale continua a non vederli.
      pos:      r.incasso_pos == null ? null : Number(r.incasso_pos),
      contanti: r.incasso_contanti == null ? null : Number(r.incasso_contanti),
      delivery: r.incasso_delivery == null ? null : Number(r.incasso_delivery),
    },
    venduto: r.venduto || [],
    formati: r.formati || [],
    ...(r.is_demo ? { _demo: true } : {}),
  }
}

/** Oggetto dei componenti → riga di database. */
export function chiusuraARiga(c, orgId, sedeId) {
  // Tutto quello che non è previsto dallo schema finisce in extra: così un
  // campo aggiunto da una feature futura non viene perso nel salvataggio.
  const { id, data, kpi, venduto, formati, _demo, ...extra } = c
  return {
    organization_id: orgId,
    sede_id: sedeId || null,
    data: String(data).slice(0, 10),
    tot_venduto:     Number(kpi?.totV) || 0,
    tot_foodcost:    Number(kpi?.totFC) || 0,
    tot_margine:     Number(kpi?.totM) || 0,
    tot_scarti:      Number(kpi?.totS) || 0,
    margine_pct:     Number(kpi?.totMP) || 0,
    scontrino_medio: kpi?.avgST == null ? null : Number(kpi.avgST),
    scontrino_medio_eur: kpi?.scontrinoMedio == null ? null : Number(kpi.scontrinoMedio),
    incasso_pos:      kpi?.pos == null ? null : Number(kpi.pos),
    incasso_contanti: kpi?.contanti == null ? null : Number(kpi.contanti),
    incasso_delivery: kpi?.delivery == null ? null : Number(kpi.delivery),
    venduto: venduto || [],
    formati: formati || [],
    extra,
    is_demo: !!_demo,
    legacy_id: id ? String(id) : null,
  }
}

