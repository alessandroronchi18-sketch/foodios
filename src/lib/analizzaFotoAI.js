// AI Vision analysis di foto di ricette (scritte a mano, stampate, pagine
// libro). Estratto da Dashboard.jsx (audit 2026-07-01 batch 9: split file).
// Restituisce JSON strutturato { nome, categoria, ingredienti, procedimento,
// temperatura, tempo_cottura_minuti }.
//
// Auth: Bearer JWT della sessione Supabase corrente.
// Costo: chiamata /api/ai con Claude Sonnet 4.6 + immagine base64.

import { supabase } from './supabase'

const PROMPTS = {
  ricetta: `Analizza questa immagine di una ricetta (può essere scritta a mano, stampata, o una pagina di libro di ricette) e restituisci SOLO un oggetto JSON valido senza nessun testo aggiuntivo:
{"nome":"NOME RICETTA IN MAIUSCOLO","categoria":"una di: Torte/Biscotti/Crostate/Muffin/Croissant/Pane/Pizze/Primi/Secondi/Dolci/Altro","porzioni":8,"ingredienti":[{"nome":"nome ingrediente in italiano minuscolo","quantita":250,"unita":"g/kg/ml/l/pz/cucchiai/tazze"}],"procedimento":"breve descrizione se visibile","temperatura":null,"tempo_cottura_minuti":null}
Leggi con attenzione anche grafia difficile o scritte a mano. Se un valore non è leggibile metti null.`,
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function parseJsonLoose(testo) {
  try {
    const clean = testo.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(clean)
  } catch {
    const match = testo.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error("Impossibile leggere la risposta AI. Riprova con una foto più nitida.")
  }
}

export async function analizzaFotoAI(file, tipo = 'ricetta') {
  const base64 = await fileToBase64(file)
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token
  if (!token) throw new Error('Sessione scaduta. Ricarica la pagina e riprova.')

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPTS[tipo] || PROMPTS.ricetta },
        ],
      }],
    }),
  })
  if (res.status === 401) throw new Error("Sessione scaduta durante l'analisi. Esci e rientra per riprovare.")
  if (res.status === 429) throw new Error('Troppe richieste AI in poco tempo. Riprova fra un minuto.')
  if (!res.ok) throw new Error(`Errore servizio AI (${res.status}). Riprova fra qualche istante.`)

  const data = await res.json()
  const testo = data.content?.find(b => b.type === 'text')?.text || ''
  return parseJsonLoose(testo)
}
