export const config = { runtime: 'edge' }

// Cron Daily Brief AI
//
// Eseguito ogni mattina alle 07:00 UTC (riusa cron-giornaliero).
// Per ogni organization attiva con opt-in (default true), genera un brief
// narrativo (3-4 frasi) dai dati di ieri + trend e lo persiste su daily_briefs.
// Opzionalmente lo spedisce via email (RESEND, se RESEND_API_KEY presente).
//
// Idempotente: se brief per (org, today) esiste, skip.
// Limitato a MAX_ORG_PER_RUN per esecuzione (per stare nel runtime Edge).

import { verifyBearerSecret } from './lib/cryptoCompare.js'
import { safeError } from './lib/safeError.js'
import { callClaude, collectOrgSnapshot } from './lib/aiEngine.js'

const MAX_ORG_PER_RUN = 30
const BRIEF_MODEL = 'claude-haiku-4-5-20251001'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

function fmtIt0(n) {
  return Number(n || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 })
}

// Prompt SETTIMANALE: 5-6 frasi, narrativa con insight + 1 azione strategica.
function buildSystemPromptSettimanale() {
  return `Sei l'assistente AI di un titolare di pasticceria/gelateria italiana.
Ogni lunedi' mattina scrivi un BRIEF SETTIMANALE che riassume la settimana
appena conclusa (max 6 frasi, max 130 parole TOTALI):
- 1-2 highlight numerici (ricavi vs settimana prec., food cost medio)
- top e dog della settimana (prodotti che vanno e che non vanno)
- 1 insight strategico (perche' i numeri sono cosi, opportunita/rischi)
- 1 azione CONCRETA per la settimana che inizia (es. "aumenta produzione X mercoledi")

REGOLE:
- Tono diretto, italiano corrente. NIENTE saluti, NIENTE emoji.
- USA solo i numeri del payload. NIENTE percentuali inventate.
- Frasi brevi (<18 parole). Numeri formato italiano (€1.247, 12%).
- Comincia con il fatto piu' importante. Concludi con l'azione.`
}

// Prompt: il sistema produce 3-4 frasi totali, niente saluti, italiano nudo.
function buildSystemPrompt() {
  return `Sei l'assistente AI di un titolare di pasticceria/gelateria italiana.
Ogni mattina gli scrivi un brief breve (max 4 frasi, max 80 parole TOTALI) con i 2-3 fatti piu' importanti del momento:
- variazioni significative (>10%) di ricavi/food cost/trend prodotti
- avvisi azionabili (scorte critiche, fatture scadute, chiusure mancanti)
- 1 suggerimento operativo concreto

REGOLE:
- Tono diretto, in italiano corrente. NIENTE saluti, NIENTE "buongiorno", NIENTE emoji.
- NIENTE percentuali inventate: usa SOLO i numeri del payload.
- Se il dato e' mancante o zero, NON menzionarlo: passa avanti.
- Frasi brevi (<15 parole). Numeri in formato italiano (€ 1.247, 12%).
- Inizia con la notizia piu' urgente. Concludi con 1 azione concreta.`
}

function buildUserPayload(snap, orgName) {
  const lines = []
  lines.push(`Attivita: ${orgName}`)
  lines.push(`Data brief: ${snap.date}`)
  if (snap.ricaviIeri > 0) lines.push(`Ricavi ieri: €${fmtIt0(snap.ricaviIeri)}`)
  if (snap.ricaviSettCorr > 0) lines.push(`Ricavi settimana in corso: €${fmtIt0(snap.ricaviSettCorr)}`)
  if (snap.ricaviSettPrec > 0) {
    lines.push(`Ricavi settimana scorsa: €${fmtIt0(snap.ricaviSettPrec)}`)
    if (snap.ricaviSettPrec > 0) {
      const dPct = ((snap.ricaviSettCorr - snap.ricaviSettPrec) / snap.ricaviSettPrec) * 100
      lines.push(`Delta vs settimana scorsa: ${dPct >= 0 ? '+' : ''}${dPct.toFixed(1)}%`)
    }
  }
  if (snap.foodCostMedio != null) lines.push(`Food cost medio settimana: ${snap.foodCostMedio.toFixed(1)}%`)
  if (snap.foodCostIeri != null) lines.push(`Food cost ieri: ${snap.foodCostIeri.toFixed(1)}%`)
  if (snap.topProdotto) lines.push(`Top prodotto settimana: ${snap.topProdotto.nome} (${snap.topProdotto.qta} pz, €${fmtIt0(snap.topProdotto.ricavo)})`)
  if (snap.prodottiInCalo.length > 0) lines.push(`Prodotti in calo: ${snap.prodottiInCalo.slice(0, 3).map(p => `${p.nome} (${p.deltaPct.toFixed(0)}%)`).join(', ')}`)
  if (snap.mpSottoSoglia.length > 0) lines.push(`Materie prime sotto soglia: ${snap.mpSottoSoglia.slice(0, 3).map(m => `${m.nome} (${m.giacenza}g/${m.soglia}g)`).join(', ')}`)
  if (snap.fattureScadute.length > 0) lines.push(`Fatture scadute: ${snap.fattureScadute.length} (totale €${fmtIt0(snap.fattureScadute.reduce((s, f) => s + f.importo, 0))})`)
  if (snap.fattureInScadenza7gg.length > 0) lines.push(`Fatture in scadenza 7gg: ${snap.fattureInScadenza7gg.length}`)
  if (snap.chiusureMancanti.length > 0) lines.push(`Chiusure cassa mancanti: ${snap.chiusureMancanti.join(', ')}`)
  if (snap.turniScoperti.length > 0) lines.push(`Turni scoperti prossimi 3gg: ${snap.turniScoperti.length}`)
  return lines.join('\n')
}

// Genera HTML email del brief (sobrio, brand FoodOS).
function emailHtml({ brief, orgName, briefDate, appUrl }) {
  const BRAND = '#6E0E1A'
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5F1ED;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#F5F1ED;padding:32px 16px;">
    <tr><td align="center">
      <table cellspacing="0" cellpadding="0" border="0" width="560" style="background:#FFF;border:1px solid #E5E9EF;border-radius:14px;overflow:hidden;max-width:100%;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #F1ECE7;">
          <div style="font-size:11px;font-weight:700;color:${BRAND};letter-spacing:0.18em;text-transform:uppercase;">Brief del mattino</div>
          <div style="margin-top:4px;font-size:13px;color:#8B95A7;">${briefDate}</div>
          <div style="margin-top:8px;font-size:18px;font-weight:700;color:#0E1726;">${orgName}</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.65;color:#1C0A0A;">
          ${brief.split(/\n+/).map(p => `<p style="margin:0 0 12px;">${p.trim()}</p>`).join('')}
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <a href="${appUrl}" style="display:inline-block;padding:11px 22px;background:${BRAND};color:#FFF;text-decoration:none;font-size:13px;font-weight:700;border-radius:8px;">Apri dashboard &rarr;</a>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#FAFAF6;border-top:1px solid #F1ECE7;font-size:11px;color:#8B95A7;line-height:1.5;">
          Ricevi questo brief perche' sei un titolare FoodOS. Puoi disattivarlo da <strong>Impostazioni &rarr; Notifiche</strong>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

async function sendBriefEmail({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) return null
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  return await resend.emails.send({
    from: 'FoodOS <noreply@foodios.it>',
    to, subject, html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  })
}

// Push best-effort: invia il brief come notifica push a TUTTI i dispositivi
// dell'org (titolare + dipendenti) che hanno fatto subscribe via PWA.
// Ritorna { sent, failed, no_subscribers? } o null su errore.
// Audit 2026-06-19: wiring iniziale push notifications da cron a /api/push-send.
async function sendBriefPush({ appUrl, orgId, title, body }) {
  const secret = process.env.INTERNAL_SECRET || process.env.CRON_SECRET
  if (!secret) return null
  try {
    const r = await fetch(`${appUrl}/api/push-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({
        organization_id: orgId,
        title,
        body: (body || '').slice(0, 140),
        url: '/',
        tag: 'foodios-daily-brief',
      }),
    })
    if (!r.ok) return { error: `http_${r.status}` }
    return await r.json()
  } catch (e) {
    return { error: e.message?.slice(0, 80) || 'fetch_failed' }
  }
}

export default async function handler(req) {
  const auth = verifyBearerSecret(
    req.headers.get('Authorization') || req.headers.get('authorization') || '',
    process.env.CRON_SECRET,
  )
  if (!auth.ok) return new Response('Unauthorized', { status: 401 })

  const supabase = await getSupabase()
  const today = new Date().toISOString().slice(0, 10)
  const appUrl = (() => {
    try { return new URL(req.url).origin } catch { return 'https://foodios-rose.vercel.app' }
  })()

  // Lista organizzazioni candidate: attive (no trial scaduto) e non gia' processate oggi.
  const { data: orgs, error: errOrgs } = await supabase
    .from('organizations')
    .select('id, nome, nome_attivita')
    .order('created_at', { ascending: true })
    .limit(MAX_ORG_PER_RUN * 4)  // overfetch per scarto

  if (errOrgs) {
    const safe = safeError(errOrgs, { endpoint: 'cron-daily-brief', step: 'list_orgs' })
    return new Response(JSON.stringify(safe.body), { status: safe.status })
  }

  // Filtra org gia' processate oggi (brief giornaliero).
  const orgIds = (orgs || []).map(o => o.id)
  let processedToday = new Set()
  if (orgIds.length > 0) {
    const { data: existing } = await supabase
      .from('daily_briefs')
      .select('organization_id, tipo')
      .in('organization_id', orgIds)
      .eq('data', today)
      .is('sede_id', null)
      .eq('tipo', 'giornaliero')
    processedToday = new Set((existing || []).map(r => r.organization_id))
  }
  // Lunedi: anche brief settimanale (controllato a parte).
  const isLunedi = new Date().getUTCDay() === 1
  let processedWeekToday = new Set()
  if (isLunedi && orgIds.length > 0) {
    const { data: existingWk } = await supabase
      .from('daily_briefs')
      .select('organization_id')
      .in('organization_id', orgIds)
      .eq('data', today)
      .is('sede_id', null)
      .eq('tipo', 'settimanale')
    processedWeekToday = new Set((existingWk || []).map(r => r.organization_id))
  }

  const todo = (orgs || []).filter(o => !processedToday.has(o.id)).slice(0, MAX_ORG_PER_RUN)
  const results = []

  for (const org of todo) {
    const orgName = org.nome_attivita || org.nome || 'la tua attivita'
    try {
      // 1) Carica eventuali settings (opt-in/out + canali) dal user_data.
      const { data: settingsRow } = await supabase
        .from('user_data')
        .select('data_value')
        .eq('organization_id', org.id)
        .eq('data_key', 'ai-brief-settings-v1')
        .is('sede_id', null)
        .maybeSingle()
      const settings = settingsRow?.data_value || {}
      if (settings.optOut === true) {
        results.push({ orgId: org.id, skipped: 'opt-out' })
        continue
      }

      // 2) Snapshot KPI org-wide (sedeId=null aggrega tutte).
      const snap = await collectOrgSnapshot({ supabase, orgId: org.id, sedeId: null })

      // 3) Se nessun dato significativo, brief minimo "non c'e' nulla di urgente".
      const hasSignal = snap.ricaviIeri > 0 || snap.ricaviSettCorr > 0 ||
        snap.mpSottoSoglia.length || snap.fattureScadute.length ||
        snap.fattureInScadenza7gg.length || snap.chiusureMancanti.length ||
        snap.prodottiInCalo.length
      let briefText = ''
      let modelUsed = null

      if (!hasSignal) {
        briefText = `Niente di urgente oggi per ${orgName}. Buona giornata: ricordati di registrare la chiusura cassa stasera.`
      } else {
        const system = buildSystemPrompt()
        const userMsg = buildUserPayload(snap, orgName)
        const cl = await callClaude({
          system,
          messages: [{ role: 'user', content: userMsg }],
          model: BRIEF_MODEL,
          max_tokens: 280,
          temperature: 0.35,
        })
        briefText = (cl.text || '').trim() || `Niente di urgente oggi per ${orgName}.`
        modelUsed = cl.model
      }

      // 4) Insert brief.
      const { data: inserted, error: errIns } = await supabase
        .from('daily_briefs')
        .insert({
          organization_id: org.id,
          sede_id: null,
          data: today,
          contenuto: briefText,
          kpi_snapshot: snap,
          model: modelUsed,
        })
        .select('id')
        .single()
      if (errIns) {
        // Race su unique constraint (org+null+today): ignora se 23505.
        if (errIns.code === '23505') {
          results.push({ orgId: org.id, skipped: 'race-duplicate' })
          continue
        }
        throw errIns
      }

      // 5) Opzionale: invio email al titolare se non opt-out su canale email.
      let emailSent = null
      if (settings.email !== false) {
        const { data: titolare } = await supabase
          .from('profiles')
          .select('email')
          .eq('organization_id', org.id)
          .eq('ruolo', 'titolare')
          .limit(1)
          .maybeSingle()
        if (titolare?.email) {
          try {
            const r = await sendBriefEmail({
              to: titolare.email,
              subject: `Brief del mattino — ${orgName}`,
              html: emailHtml({ brief: briefText, orgName, briefDate: today, appUrl }),
            })
            // Resend ritorna {data, error}: marca sent_email_at SOLO se nessun errore.
            if (r?.error) {
              emailSent = `resend-error: ${String(r.error?.message || r.error).slice(0, 80)}`
            } else if (r?.data?.id) {
              emailSent = r.data.id
              await supabase.from('daily_briefs')
                .update({ sent_email_at: new Date().toISOString() })
                .eq('id', inserted.id)
            } else {
              emailSent = 'sent-no-id'
              await supabase.from('daily_briefs')
                .update({ sent_email_at: new Date().toISOString() })
                .eq('id', inserted.id)
            }
          } catch (e) {
            emailSent = `error: ${e.message?.slice(0, 80)}`
          }
        }
      }

      // 6) Push notifications best-effort. Rispetta settings.push === false
      // (canale disattivabile separato da email). Idempotente per giorno: il
      // service-worker dedup via tag 'foodios-daily-brief'.
      let pushSent = null
      if (settings.push !== false) {
        const pr = await sendBriefPush({
          appUrl,
          orgId: org.id,
          title: `Brief del mattino · ${orgName}`,
          body: briefText,
        })
        if (pr) pushSent = pr.error ? `err:${pr.error}` : `${pr.sent ?? 0}/${(pr.sent ?? 0) + (pr.failed ?? 0)}`
      }

      results.push({ orgId: org.id, briefId: inserted.id, emailSent, pushSent, hasSignal })

      // ─── Brief SETTIMANALE (solo lunedi, idempotente) ────────────────────
      if (isLunedi && !processedWeekToday.has(org.id) && hasSignal) {
        try {
          const wkText = await (async () => {
            const sys = buildSystemPromptSettimanale()
            const um = buildUserPayload(snap, orgName)
            const cl = await callClaude({
              system: sys,
              messages: [{ role: 'user', content: um + '\n\nQuesto e un brief SETTIMANALE (riassunto della settimana appena chiusa).' }],
              model: BRIEF_MODEL,
              max_tokens: 420,
              temperature: 0.4,
            })
            return (cl.text || '').trim()
          })()
          if (wkText) {
            const { data: wkInserted } = await supabase
              .from('daily_briefs')
              .insert({
                organization_id: org.id, sede_id: null, data: today,
                tipo: 'settimanale',
                contenuto: wkText,
                kpi_snapshot: snap,
                model: BRIEF_MODEL,
              })
              .select('id').single()
            // Email opzionale (riusa stesso template, subject diverso)
            if (settings.email !== false && wkInserted) {
              const { data: titolare } = await supabase
                .from('profiles')
                .select('email')
                .eq('organization_id', org.id)
                .eq('ruolo', 'titolare')
                .limit(1).maybeSingle()
              if (titolare?.email) {
                try {
                  await sendBriefEmail({
                    to: titolare.email,
                    subject: `Brief settimanale — ${orgName}`,
                    html: emailHtml({ brief: wkText, orgName, briefDate: today, appUrl }),
                  })
                  await supabase.from('daily_briefs')
                    .update({ sent_email_at: new Date().toISOString() })
                    .eq('id', wkInserted.id)
                } catch {}
              }
            }
            // Push settimanale: tag distinto per non sovrapporsi al giornaliero.
            if (settings.push !== false) {
              await sendBriefPush({
                appUrl,
                orgId: org.id,
                title: `Brief settimanale · ${orgName}`,
                body: wkText,
              })
            }
            results.push({ orgId: org.id, weeklyBriefId: wkInserted?.id })
          }
        } catch (e) {
          results.push({ orgId: org.id, weeklyError: e.message?.slice(0, 100) })
        }
      }
    } catch (e) {
      results.push({ orgId: org.id, error: e.message || String(e) })
    }
  }

  return new Response(JSON.stringify({
    ok: true, processed: results.length, total_candidates: todo.length, results,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
