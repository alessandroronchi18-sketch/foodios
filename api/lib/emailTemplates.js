// Email template builders puri (no side effect, no fetch).
//
// Estratti da api/send-email.js per:
//   - testabilita' (snapshot HTML deterministico)
//   - riuso (es. tab admin "Anteprima email")
//   - separazione: layout vs invio (Resend)
//
// Tutti i template usano stesso layout base (font system-ui, palette
// terracotta/cream, max-width 560px) per consistenza visuale.

const FROM_NAME = 'FoodOS'
const SUPPORT_EMAIL = 'support@foodios.it'

// Escape HTML minimale (idem a send-email.js).
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Frame esterno comune (header + footer support).
function frame(inner) {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">${inner}
      <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
      <p style="color:#9C7B76;font-size:12px;">
        Notifica automatica ${FROM_NAME} · scrivici a
        <a href="mailto:${SUPPORT_EMAIL}" style="color:#C0392B;">${SUPPORT_EMAIL}</a>
      </p>
    </div>`
}

// ── 1. Benvenuto (signup) ────────────────────────────────────────────────
export function templateBenvenuto({ nomeAttivita }) {
  return {
    subject: 'Benvenuto in FoodOS — la tua prova gratuita è iniziata 🍰',
    html: frame(`
      <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">Benvenuto in FoodOS! 🎉</h1>
      <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
        La tua attività <strong>${escapeHtml(nomeAttivita)}</strong> è stata registrata con successo.<br>
        Hai <strong>3 mesi gratuiti</strong> per esplorare tutte le funzionalità —
        nessuna carta di credito richiesta.
      </p>
      <p style="color:#6B4C44;font-size:14px;line-height:1.7;">
        Ti contatteremo entro 24 ore per attivare il tuo account.
      </p>`),
  }
}

// ── 2. Approvazione (admin attiva) ───────────────────────────────────────
export function templateApprovazione({ nomeOrg, nomeCompleto }) {
  return {
    subject: 'Il tuo account FoodOS è attivo! ✅',
    html: frame(`
      <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">Account attivato! 🎉</h1>
      <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
        Ciao ${escapeHtml(nomeCompleto || '')},<br>
        il tuo account per <strong>${escapeHtml(nomeOrg || 'la tua attività')}</strong> è stato attivato.
      </p>
      <a href="https://foodios.it"
         style="display:inline-block;padding:12px 28px;background:#C0392B;color:#FFF;
                border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
        Vai alla dashboard →
      </a>`),
  }
}

// ── 3. Custom (admin pannello) ───────────────────────────────────────────
export function templateCustom({ oggetto, messaggio }) {
  const bodyHtml = escapeHtml(messaggio).replace(/\n/g, '<br>')
  return {
    subject: oggetto,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#FDFAF7;">
        <div style="background:#FFF;border:1px solid #E8DDD8;border-radius:12px;padding:28px 24px;">
          <p style="color:#1C0A0A;font-size:15px;line-height:1.7;margin:0 0 16px;">${bodyHtml}</p>
        </div>
        <hr style="border:none;border-top:1px solid #E8DDD8;margin:24px 0;">
        <p style="color:#9C7B76;font-size:12px;">
          Inviato dal team FoodOS · scrivici a
          <a href="mailto:${SUPPORT_EMAIL}" style="color:#C0392B;">${SUPPORT_EMAIL}</a>
        </p>
      </div>`,
  }
}

// ── 4. Scadenza trial (T-7) ──────────────────────────────────────────────
export function templateScadenzaTrial() {
  return {
    subject: 'La tua prova FoodOS scade tra 7 giorni ⏰',
    html: frame(`
      <h1 style="color:#1C0A0A;font-size:24px;margin:0 0 8px;">La tua prova sta per scadere</h1>
      <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
        La tua prova gratuita di FoodOS scade tra <strong>7 giorni</strong>.<br>
        I tuoi dati saranno conservati, ma non potrai accedervi senza un abbonamento attivo.
      </p>
      <a href="mailto:${SUPPORT_EMAIL}?subject=Attivazione%20abbonamento%20FoodOS"
         style="display:inline-block;padding:12px 28px;background:#C0392B;color:#FFF;
                border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
        Attiva ora →
      </a>`),
  }
}

// ── 5. Magazzino sotto soglia ────────────────────────────────────────────
export function templateMagazzinoSottoSoglia({ nomeAttivita, ingredienti }) {
  const items = Array.isArray(ingredienti) ? ingredienti : []
  const righe = items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#1C0A0A;font-size:14px;">${escapeHtml(i.nome || '—')}${i.sede ? ` <span style="color:#9C7B76;">(${escapeHtml(i.sede)})</span>` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#C0392B;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(String(i.giacenza ?? ''))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#6B4C44;font-size:14px;text-align:right;">${escapeHtml(String(i.soglia ?? ''))}</td>
    </tr>`).join('')
  const plurale = items.length === 1 ? 'ingrediente' : 'ingredienti'
  return {
    subject: `⚠️ ${items.length} ${plurale} sotto soglia — FoodOS`,
    html: frame(`
      <h1 style="color:#1C0A0A;font-size:22px;margin:0 0 8px;">Scorte sotto soglia 📦</h1>
      <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
        <strong>${escapeHtml(nomeAttivita || 'La tua attività')}</strong> ha ${items.length} ${plurale} da riordinare:
      </p>
      <table style="width:100%;border-collapse:collapse;background:#FFF;border:1px solid #E8DDD8;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#F5EDE8;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;text-transform:uppercase;">Ingrediente</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9C7B76;text-transform:uppercase;">Giacenza</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9C7B76;text-transform:uppercase;">Soglia</th>
        </tr></thead>
        <tbody>${righe}</tbody>
      </table>`),
  }
}

// ── 6. Fatture in scadenza ───────────────────────────────────────────────
export function templateFattureInScadenza({ nomeAttivita, fatture }) {
  const items = Array.isArray(fatture) ? fatture : []
  const righe = items.map(f => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#1C0A0A;font-size:14px;">${escapeHtml(f.fornitore || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#6B4C44;font-size:13px;">${escapeHtml(String(f.data_fattura || ''))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DDD8;color:#C0392B;font-size:14px;font-weight:700;text-align:right;">€ ${Number(f.totale || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>`).join('')
  return {
    subject: `📄 ${items.length} fattur${items.length === 1 ? 'a' : 'e'} in scadenza — FoodOS`,
    html: frame(`
      <h1 style="color:#1C0A0A;font-size:22px;margin:0 0 8px;">Fatture in scadenza</h1>
      <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
        <strong>${escapeHtml(nomeAttivita || 'La tua attività')}</strong> ha ${items.length} fattur${items.length === 1 ? 'a' : 'e'} fornitore in scadenza entro 7 giorni:
      </p>
      <table style="width:100%;border-collapse:collapse;background:#FFF;border:1px solid #E8DDD8;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#F5EDE8;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;text-transform:uppercase;">Fornitore</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#9C7B76;text-transform:uppercase;">Scadenza</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#9C7B76;text-transform:uppercase;">Totale</th>
        </tr></thead>
        <tbody>${righe}</tbody>
      </table>`),
  }
}

// ── 7. Report mensile ────────────────────────────────────────────────────
export function templateReportMensile({ nomeAttivita, mese, ricaviTotali, foodCostMedio, prodottoPiuVenduto, prodottoMenoVenduto }) {
  const stat = (label, val) => `
    <div style="flex:1;background:#FFF;border:1px solid #E8DDD8;border-radius:8px;padding:14px 16px;">
      <div style="font-size:11px;color:#9C7B76;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">${label}</div>
      <div style="font-size:18px;font-weight:800;color:#1C0A0A;">${val}</div>
    </div>`
  const piuVenduto = String(prodottoPiuVenduto || '').slice(0, 120)
  const menoVenduto = String(prodottoMenoVenduto || '').slice(0, 120)
  return {
    subject: `📊 Report ${escapeHtml(mese)} — FoodOS`,
    html: frame(`
      <h1 style="color:#1C0A0A;font-size:22px;margin:0 0 8px;">Report di ${escapeHtml(mese)}</h1>
      <p style="color:#6B4C44;font-size:15px;line-height:1.7;margin:0 0 20px;">
        Ecco il riepilogo del mese per <strong>${escapeHtml(nomeAttivita || 'la tua attività')}</strong>:
      </p>
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        ${stat('Ricavi', '€ ' + Number(ricaviTotali || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
        ${stat('Food cost medio', Number(foodCostMedio || 0).toFixed(1) + '%')}
      </div>
      ${piuVenduto ? `<p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0 0 6px;">🥇 Più venduto: <strong>${escapeHtml(piuVenduto)}</strong></p>` : ''}
      ${menoVenduto ? `<p style="color:#6B4C44;font-size:14px;line-height:1.7;margin:0;">🐢 Meno venduto: <strong>${escapeHtml(menoVenduto)}</strong></p>` : ''}`),
  }
}
