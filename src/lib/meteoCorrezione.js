// Quanto il tempo che farà sposta la domanda.
//
// Per una gelateria il meteo NON è un dettaglio: è la variabile più forte
// dopo il giorno della settimana. Trenta gradi e sole non sono la stessa
// giornata di quindici gradi e pioggia, e chi produce la mattina decide sulla
// base di quello.
//
// Questa regola viveva dentro api/cron-forecast.js, cioè girava solo di notte
// sul server per riempire la tabella delle previsioni. La pagina "Previsione
// domanda", che il titolare guarda la mattina prima di impastare, non la
// usava affatto: dava lo stesso numero col sole e col diluvio.
//
// Portandola qui la usano tutte e due, e c'è un posto solo da correggere
// quando le percentuali andranno tarate sui dati veri.

// I moltiplicatori sono volutamente grossolani e conservativi: sono una
// correzione di buon senso, non un modello. Meglio uno scostamento del 15%
// dichiarato come tale che una finta precisione al decimale.
export const SOGLIA_CALDO_C = 28
export const SOGLIA_FREDDO_C = 10
export const SOGLIA_PIOGGIA_MM = 5

export function correzioneMeteo(meteo, tipoBusiness) {
  if (!meteo) return 1
  const gelateria = tipoBusiness === 'gelateria'
  let mult = 1
  // Caldo: il gelato vola, il caffè cala un po'.
  if (Number(meteo.t_max) >= SOGLIA_CALDO_C) mult *= gelateria ? 1.15 : 0.97
  // Freddo: il contrario, e per il gelato pesa di più.
  if (Number(meteo.t_max) <= SOGLIA_FREDDO_C) mult *= gelateria ? 0.80 : 1.05
  // Pioggia vera: meno gente in giro, per tutti.
  if (Number(meteo.precip) > SOGLIA_PIOGGIA_MM) mult *= 0.85
  return mult
}

// La correzione spiegata a parole, per scriverla accanto al numero: un numero
// corretto senza dire perché è un numero di cui non ci si fida.
export function spiegaCorrezione(meteo, tipoBusiness) {
  if (!meteo) return null
  const gelateria = tipoBusiness === 'gelateria'
  const parti = []
  if (Number(meteo.t_max) >= SOGLIA_CALDO_C) parti.push(gelateria ? 'caldo, più gelato' : 'caldo, meno caffè')
  if (Number(meteo.t_max) <= SOGLIA_FREDDO_C) parti.push(gelateria ? 'freddo, meno gelato' : 'freddo, più caffè')
  if (Number(meteo.precip) > SOGLIA_PIOGGIA_MM) parti.push('pioggia, meno gente in giro')
  return parti.length ? parti.join(' · ') : null
}

// Meteo dei prossimi giorni da Open-Meteo (gratis, senza chiave).
// Ritorna [] se qualcosa non va: una previsione senza meteo è meno buona, ma
// una pagina che non si apre è peggio.
export async function meteoProssimiGiorni(citta, giorni = 7) {
  if (!citta) return []
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citta)}&count=1&country=IT&language=it`,
    ).then(r => r.json())
    const loc = geo?.results?.[0]
    if (!loc) return []
    const dati = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code`
      + `&forecast_days=${giorni}&timezone=Europe%2FRome`,
    ).then(r => r.json())
    const d = dati?.daily
    if (!d?.time) return []
    return d.time.map((data, i) => ({
      data,
      t_max: d.temperature_2m_max?.[i] ?? null,
      t_min: d.temperature_2m_min?.[i] ?? null,
      precip: d.precipitation_sum?.[i] ?? 0,
      weather_code: d.weather_code?.[i] ?? null,
    }))
  } catch {
    return []
  }
}
