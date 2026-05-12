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

  const { tipo, orgId, email, nomeAttivita } = await req.json()
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
