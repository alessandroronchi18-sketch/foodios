export const config = { runtime: 'edge' }

const FROM = 'FoodOS <noreply@foodios.it>'
const SUPPORT = 'support@foodios.it'

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

async function sendEmail({ to, subject, html }) {
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.emails.send({ from: FROM, to, subject, html })
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.json()
  const { tipo, orgId, email, nomeAttivita } = body
  const supabase = await getSupabase()

  try {
    // ── Benvenuto ────────────────────────────────────────────────────────────
    if (tipo === 'benvenuto') {
      await sendEmail({
        to: email,
        subject: 'Benvenuto in FoodOS — la tua prova gratuita è iniziata 🍰',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">Benvenuto in FoodOS! 🎉</h1>
            <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
              La tua attività <strong>${nomeAttivita}</strong> è stata registrata con successo.<br>
              Hai <strong>3 mesi gratuiti</strong> per esplorare tutte le funzionalità — 
              nessuna carta di credito richiesta.
            </p>
            <p style="color:#6B4C44;font-size:14px;line-height:1.7;">
              Ti contatteremo entro 24 ore per attivare il tuo account.
            </p>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">
              Domande? Rispondi a questa email o scrivi a 
              <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
            </p>
          </div>
        `,
      })
    }

    // ── Approvazione ─────────────────────────────────────────────────────────
    else if (tipo === 'approvazione') {
      // Recupera email dell'org
      const { data: prof } = await supabase
        .from('profiles')
        .select('email, nome_completo')
        .eq('organization_id', orgId)
        .eq('ruolo', 'titolare')
        .single()

      const { data: org } = await supabase
        .from('organizations')
        .select('nome')
        .eq('id', orgId)
        .single()

      if (prof?.email) {
        await sendEmail({
          to: prof.email,
          subject: 'Il tuo account FoodOS è attivo! ✅',
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
              <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">Account attivato! 🎉</h1>
              <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
                Ciao ${prof.nome_completo || ''},<br>
                il tuo account per <strong>${org?.nome || 'la tua attività'}</strong> è stato attivato.
                Puoi accedere subito alla dashboard.
              </p>
              <a href="https://foodios.it" 
                 style="display:inline-block;padding:12px 28px;background:#C0392B;color:#FFF;
                        border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
                Vai alla dashboard →
              </a>
              <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
              <p style="color:#9C7B76;font-size:12px;">
                Hai domande? Scrivici a 
                <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
              </p>
            </div>
          `,
        })
      }
    }

    // ── Scadenza trial (7 giorni prima) ──────────────────────────────────────
    else if (tipo === 'scadenza_trial') {
      await sendEmail({
        to: email,
        subject: 'La tua prova FoodOS scade tra 7 giorni ⏰',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">La tua prova sta per scadere</h1>
            <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
              La tua prova gratuita di FoodOS scade tra <strong>7 giorni</strong>.<br>
              I tuoi dati saranno conservati, ma non potrai accedervi senza un abbonamento attivo.
            </p>
            <p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0 0 24px;">
              Per continuare a usare FoodOS, contattaci per attivare il tuo abbonamento 
              a partire da <strong>€39/mese</strong>.
            </p>
            <a href="mailto:${SUPPORT}?subject=Attivazione%20abbonamento%20FoodOS"
               style="display:inline-block;padding:12px 28px;background:#C0392B;color:#FFF;
                      border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
              Attiva ora →
            </a>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:12px;">
              Hai domande? Scrivi a 
              <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
            </p>
          </div>
        `,
      })
    }

    // ── Magazzino sotto soglia ────────────────────────────────────────────────
    else if (tipo === 'magazzino_sotto_soglia') {
      const { ingredienti } = body
      const listaHTML = (ingredienti || []).map(i =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;font-size:13px;color:#1C0A0A;">${i.nome}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;font-size:13px;color:#C0392B;font-weight:700;">${i.giacenza}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;font-size:13px;color:#9C7B76;">${i.soglia}</td>
        </tr>`
      ).join('')
      await sendEmail({
        to: email,
        subject: '⚠️ Magazzino: alcuni ingredienti stanno finendo',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h2 style="color:#1C0A0A;font-size:20px;margin:0 0 16px;">⚠️ Ingredienti sotto soglia</h2>
            <p style="color:#6B4C44;font-size:14px;margin:0 0 20px;">
              Ciao,<br>i seguenti ingredienti di <strong>${nomeAttivita}</strong> hanno raggiunto la soglia minima:
            </p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <thead>
                <tr style="background:#FAF5F3;">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Ingrediente</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Giacenza attuale</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Soglia minima</th>
                </tr>
              </thead>
              <tbody>${listaHTML}</tbody>
            </table>
            <a href="https://foodios-rose.vercel.app" style="display:inline-block;padding:10px 22px;background:#C0392B;color:#FFF;border-radius:7px;font-weight:700;text-decoration:none;font-size:13px;">
              Vai al Magazzino →
            </a>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:11px;">
              FoodOS · <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a>
            </p>
          </div>
        `,
      })
    }

    // ── Fattura in scadenza ───────────────────────────────────────────────────
    else if (tipo === 'fattura_in_scadenza') {
      const { fatture } = body
      const fmt = (v) => `€ ${Number(v||0).toLocaleString('it-IT', {minimumFractionDigits:2})}`
      const fmtD = (d) => d ? new Date(d+'T12:00:00').toLocaleDateString('it-IT') : '—'
      const righeHTML = (fatture || []).map(f =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;font-size:13px;color:#1C0A0A;">${f.fornitore || '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;font-size:13px;color:#1C0A0A;">${f.numero_rif || '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;font-size:13px;color:#9C7B76;">${fmtD(f.data_fattura)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;font-size:13px;color:#C0392B;font-weight:700;">${fmt(f.totale)}</td>
        </tr>`
      ).join('')
      const totale = (fatture || []).reduce((s, f) => s + (f.totale || 0), 0)
      await sendEmail({
        to: email,
        subject: '📄 Hai fatture in scadenza questa settimana',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h2 style="color:#1C0A0A;font-size:20px;margin:0 0 16px;">📄 Fatture in scadenza</h2>
            <p style="color:#6B4C44;font-size:14px;margin:0 0 20px;">
              Le seguenti fatture di <strong>${nomeAttivita}</strong> scadono entro 7 giorni:
            </p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
              <thead>
                <tr style="background:#FAF5F3;">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;">Fornitore</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;">N. Fattura</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;">Data</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;">Importo</th>
                </tr>
              </thead>
              <tbody>${righeHTML}</tbody>
            </table>
            <p style="color:#1C0A0A;font-size:14px;font-weight:700;margin:0 0 20px;">
              Totale da pagare: <span style="color:#C0392B;">${fmt(totale)}</span>
            </p>
            <a href="https://foodios-rose.vercel.app" style="display:inline-block;padding:10px 22px;background:#C0392B;color:#FFF;border-radius:7px;font-weight:700;text-decoration:none;font-size:13px;">
              Vai allo Scadenzario →
            </a>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:11px;">FoodOS · <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a></p>
          </div>
        `,
      })
    }

    // ── Report mensile ────────────────────────────────────────────────────────
    else if (tipo === 'report_mensile') {
      const { mese, ricaviTotali, foodCostMedio, prodottoPiuVenduto, prodottoMenoRedditizio } = body
      const fmt = (v) => `€ ${Number(v||0).toLocaleString('it-IT', {minimumFractionDigits:2})}`
      await sendEmail({
        to: email,
        subject: `📊 Il tuo report FoodOS di ${mese || 'questo mese'}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
            <h2 style="color:#1C0A0A;font-size:20px;margin:0 0 8px;">📊 Report mensile</h2>
            <p style="color:#9C7B76;font-size:13px;margin:0 0 24px;">${mese || ''} · ${nomeAttivita}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
              <div style="background:#FFF;border:1px solid #E8DDD8;border-radius:10px;padding:16px;">
                <div style="font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Ricavi totali</div>
                <div style="font-size:22px;font-weight:900;color:#065F46;">${fmt(ricaviTotali)}</div>
              </div>
              <div style="background:#FFF;border:1px solid #E8DDD8;border-radius:10px;padding:16px;">
                <div style="font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Food Cost medio</div>
                <div style="font-size:22px;font-weight:900;color:#C0392B;">${Number(foodCostMedio||0).toFixed(1)}%</div>
              </div>
              <div style="background:#FFF;border:1px solid #E8DDD8;border-radius:10px;padding:16px;">
                <div style="font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">🏆 Più venduto</div>
                <div style="font-size:15px;font-weight:700;color:#1C0A0A;">${prodottoPiuVenduto || '—'}</div>
              </div>
              <div style="background:#FFF;border:1px solid #E8DDD8;border-radius:10px;padding:16px;">
                <div style="font-size:11px;color:#9C7B76;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">⚠️ Da ottimizzare</div>
                <div style="font-size:15px;font-weight:700;color:#1C0A0A;">${prodottoMenoRedditizio || '—'}</div>
              </div>
            </div>
            <a href="https://foodios-rose.vercel.app" style="display:inline-block;padding:10px 22px;background:#C0392B;color:#FFF;border-radius:7px;font-weight:700;text-decoration:none;font-size:13px;">
              Apri la dashboard →
            </a>
            <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
            <p style="color:#9C7B76;font-size:11px;">FoodOS · <a href="mailto:${SUPPORT}" style="color:#C0392B;">${SUPPORT}</a></p>
          </div>
        `,
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
