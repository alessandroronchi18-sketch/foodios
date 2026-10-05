// Il meteo di un mese a Torino (archivio open-meteo), con i dati di riserva
// dei mesi già misurati. Spostato qui da Dashboard.jsx il 05/10/2026, così
// com'era, per tenere quel file sotto il tetto di righe (adminFileGrandi).

const METEO_FB = {"2025-12":{tempMean:3.9,giorniSole:2,giorniPioggia:8},"2026-01":{tempMean:1.6,giorniSole:12,giorniPioggia:11},"2026-02":{tempMean:4.6,giorniSole:12,giorniPioggia:9}};
export async function fetchMeteo(m,y) {
  const k=`${y}-${String(m).padStart(2,"0")}`;
  if (METEO_FB[k]) return METEO_FB[k];
  try {
    const pad=n=>String(n).padStart(2,"0"), last=new Date(y,m,0).getDate();
    const url=`https://archive-api.open-meteo.com/v1/archive?latitude=45.0703&longitude=7.6869&start_date=${y}-${pad(m)}-01&end_date=${y}-${pad(m)}-${last}&daily=temperature_2m_mean,precipitation_sum,sunshine_duration&timezone=Europe/Rome`;
    const r=await fetch(url); if(!r.ok) return null;
    const d=await r.json(); if(!d.daily) return null;
    const avg=a=>a.filter(v=>v!=null).reduce((s,v)=>s+v,0)/a.filter(v=>v!=null).length;
    return {tempMean:parseFloat(avg(d.daily.temperature_2m_mean).toFixed(1)),giorniSole:d.daily.sunshine_duration.filter(v=>v>21600).length,giorniPioggia:d.daily.precipitation_sum.filter(v=>v>1).length};
  } catch { return null; }
}
