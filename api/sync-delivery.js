// Sync automatica notturna — Cassa in Cloud + SumUp
// Cron: ogni notte alle 02:00 (configurato in vercel.json)
// Verifica Authorization: Bearer <CRON_SECRET> per proteggere l'endpoint

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Protezione cron — Vercel invia automaticamente il secret configurato
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const ieri = new Date();
  ieri.setDate(ieri.getDate() - 1);
  const dataIeri = ieri.toISOString().slice(0, 10);

  const risultati = [];

  // Carica tutte le integrazioni attive con API key
  const { data: integrazioni, error } = await supabase
    .from('integrazioni')
    .select('*')
    .eq('attiva', true)
    .in('tipo', ['cassaincloud', 'sumup']);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  for (const integrazione of integrazioni || []) {
    try {
      let movimenti = [];
      if (integrazione.tipo === 'cassaincloud') {
        movimenti = await syncCassaInCloud(integrazione.config?.api_key, dataIeri);
      } else if (integrazione.tipo === 'sumup') {
        movimenti = await syncSumUp(integrazione.config?.access_token, dataIeri);
      }

      if (movimenti.length > 0) {
        // Salva movimenti nel user_data dell'organizzazione
        await salvaMovimenti(integrazione.organization_id, movimenti, integrazione.tipo);
        risultati.push({ org: integrazione.organization_id, tipo: integrazione.tipo, n: movimenti.length });
      }

      // Aggiorna ultimo_sync
      await supabase.from('integrazioni').update({ ultimo_sync: new Date().toISOString() }).eq('id', integrazione.id);
    } catch (e) {
      risultati.push({ org: integrazione.organization_id, tipo: integrazione.tipo, error: e.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, data: dataIeri, risultati }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Cassa in Cloud API ────────────────────────────────────────────────────────
async function syncCassaInCloud(apiKey, data) {
  if (!apiKey) throw new Error('API key mancante');
  const url = `https://api.cassaincloud.it/v1/sales?date=${data}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Cassa in Cloud API error: ${res.status}`);
  const json = await res.json();

  // Normalizza risposta → formato FoodOS
  const vendite = json.sales || json.data || [];
  const byData = {};
  for (const v of vendite) {
    const d = (v.date || v.data || data).slice(0, 10);
    if (!byData[d]) byData[d] = { importo: 0, righe: 0 };
    byData[d].importo += parseFloat(v.total || v.totale || 0);
    byData[d].righe += 1;
  }
  return Object.entries(byData).map(([d, v]) => ({
    data: d, importo: Math.round(v.importo * 100) / 100,
    righe: v.righe, fonte: 'Cassa in Cloud',
  }));
}

// ── SumUp API ─────────────────────────────────────────────────────────────────
async function syncSumUp(accessToken, data) {
  if (!accessToken) throw new Error('Access token mancante');
  const from = `${data}T00:00:00.000Z`;
  const to   = `${data}T23:59:59.999Z`;
  const url  = `https://api.sumup.com/v0.1/me/transactions/history?newest_time=${to}&oldest_time=${from}&limit=100&statuses=SUCCESSFUL`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`SumUp API error: ${res.status}`);
  const json = await res.json();

  const items = json.items || [];
  const sales = items.filter(t => t.type === 'PAYMENT' && t.status === 'SUCCESSFUL');
  const byData = {};
  for (const t of sales) {
    const d = (t.timestamp || data).slice(0, 10);
    if (!byData[d]) byData[d] = { importo: 0, righe: 0 };
    byData[d].importo += parseFloat(t.amount || 0);
    byData[d].righe += 1;
  }
  return Object.entries(byData).map(([d, v]) => ({
    data: d, importo: Math.round(v.importo * 100) / 100,
    righe: v.righe, fonte: 'SumUp',
  }));
}

// ── Salva in user_data Supabase ───────────────────────────────────────────────
async function salvaMovimenti(orgId, movimenti, fonte) {
  for (const mov of movimenti) {
    const key = `sync-${fonte}-${mov.data}`;
    const { data: existing } = await supabase.from('user_data')
      .select('id, data_value').eq('organization_id', orgId).eq('data_key', key).maybeSingle();

    const val = {
      ...(existing?.data_value || {}),
      ...mov,
      aggiornatoAt: new Date().toISOString(),
    };

    if (existing) {
      await supabase.from('user_data').update({ data_value: val }).eq('id', existing.id);
    } else {
      await supabase.from('user_data').insert({ organization_id: orgId, sede_id: null, data_key: key, data_value: val });
    }
  }
}
