import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const C = {
  bg:       '#FBF7F4',
  bgCard:   '#FFFFFF',
  text:     '#1C0A0A',
  textSoft: '#9B7B6E',
  textMid:  '#6B4A3E',
  red:      '#C0392B',
  redLight: '#FEF2F2',
  green:    '#16A34A',
  greenLight:'#F0FDF4',
  amber:    '#D97706',
  border:   '#E8DDD8',
  borderStr:'#D4C5BE',
  white:    '#FFFFFF',
};

const DELIVERY = [
  {
    id: 'deliveroo',
    nome: 'Deliveroo',
    desc: 'Import CSV ricavi giornalieri',
    logo: '🛵',
    tipo: 'delivery',
    apiDisponibile: false,
  },
  {
    id: 'justeat',
    nome: 'JustEat',
    desc: 'Import CSV ordini e commissioni',
    logo: '🍔',
    tipo: 'delivery',
    apiDisponibile: false,
  },
  {
    id: 'glovo',
    nome: 'Glovo / Foodinho',
    desc: 'Import Excel report vendite',
    logo: '💛',
    tipo: 'delivery',
    apiDisponibile: false,
  },
  {
    id: 'uber_eats',
    nome: 'Uber Eats',
    desc: 'Import CSV rendiconto settimanale',
    logo: '⬛',
    tipo: 'delivery',
    apiDisponibile: false,
  },
];

const CASSA = [
  {
    id: 'cassaincloud',
    nome: 'Cassa in Cloud',
    desc: 'Import CSV + sync automatica via API',
    logo: '☁️',
    tipo: 'cassa',
    apiDisponibile: true,
  },
  {
    id: 'sumup',
    nome: 'SumUp',
    desc: 'Import CSV + connessione OAuth2',
    logo: '🟦',
    tipo: 'cassa',
    apiDisponibile: true,
  },
  {
    id: 'zucchetti',
    nome: 'Zucchetti (Infinity/Kassa)',
    desc: 'Import CSV o XML export',
    logo: '🔷',
    tipo: 'cassa',
    apiDisponibile: false,
  },
  {
    id: 'lightspeed',
    nome: 'Lightspeed',
    desc: 'Import CSV transazioni',
    logo: '⚡',
    tipo: 'cassa',
    apiDisponibile: false,
  },
  {
    id: 'square',
    nome: 'Square',
    desc: 'Import CSV pagamenti',
    logo: '⬜',
    tipo: 'cassa',
    apiDisponibile: false,
  },
  {
    id: 'fattura_xml',
    nome: 'Fattura Elettronica (SDI)',
    desc: 'Import XML fatture per Scadenzario',
    logo: '📄',
    tipo: 'cassa',
    apiDisponibile: false,
  },
];

export default function Integrazioni({ orgId, notify }) {
  const [integrazioni, setIntegrazioni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configurando, setConfigurando] = useState(null); // id integrazione in config
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    caricaIntegrazioni();
  }, [orgId]);

  async function caricaIntegrazioni() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integrazioni')
        .select('*')
        .eq('organization_id', orgId);
      if (!error && data) setIntegrazioni(data);
    } catch (e) {
      console.error('Errore caricamento integrazioni', e);
    }
    setLoading(false);
  }

  function statoIntegrazione(id) {
    return integrazioni.find(i => i.tipo === id) || null;
  }

  async function salvaConfigurazione(tipo, config) {
    setSaving(true);
    try {
      const esistente = statoIntegrazione(tipo);
      if (esistente) {
        await supabase.from('integrazioni').update({ config, attiva: true }).eq('id', esistente.id);
      } else {
        await supabase.from('integrazioni').insert({ organization_id: orgId, tipo, config, attiva: true });
      }
      await caricaIntegrazioni();
      notify && notify(`✓ Integrazione ${tipo} configurata`);
      setConfigurando(null);
      setApiKey('');
    } catch (e) {
      notify && notify(`⚠ Errore: ${e.message}`);
    }
    setSaving(false);
  }

  async function disattivaIntegrazione(tipo) {
    const est = statoIntegrazione(tipo);
    if (!est) return;
    await supabase.from('integrazioni').update({ attiva: false }).eq('id', est.id);
    await caricaIntegrazioni();
    notify && notify(`Integrazione ${tipo} disattivata`);
  }

  function Card({ item }) {
    const stato = statoIntegrazione(item.id);
    const connessa = stato?.attiva === true;
    const inConfig = configurando === item.id;

    return (
      <div style={{
        background: C.bgCard,
        border: `1px solid ${connessa ? C.green + '40' : C.border}`,
        borderRadius: 14,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: connessa ? `0 0 0 2px ${C.green}20` : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 28, lineHeight: 1 }}>{item.logo}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{item.nome}</div>
            <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{item.desc}</div>
          </div>
          <div style={{
            padding: '3px 10px',
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 700,
            background: connessa ? C.greenLight : '#F5F0EE',
            color: connessa ? C.green : C.textSoft,
            border: `1px solid ${connessa ? C.green + '30' : C.border}`,
          }}>
            {connessa ? '● Connessa' : '○ Non connessa'}
          </div>
        </div>

        {/* Badge API */}
        {item.apiDisponibile && (
          <div style={{ fontSize: 9, fontWeight: 700, color: C.amber, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            ⚡ Sync automatica disponibile
          </div>
        )}

        {/* Form configurazione */}
        {inConfig && item.apiDisponibile && (
          <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '14px', marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              Chiave API {item.nome}
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Incolla qui la tua API key..."
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7, fontSize: 12,
                border: `1px solid ${C.borderStr}`, color: C.text, marginBottom: 10,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => salvaConfigurazione(item.id, { api_key: apiKey })}
                disabled={!apiKey.trim() || saving}
                style={{
                  flex: 1, padding: '8px', background: C.red, color: '#FFF',
                  border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  opacity: apiKey.trim() ? 1 : 0.5,
                }}>
                {saving ? 'Salvataggio…' : '💾 Salva'}
              </button>
              <button
                onClick={() => { setConfigurando(null); setApiKey(''); }}
                style={{
                  padding: '8px 14px', background: 'transparent', color: C.textSoft,
                  border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 11, cursor: 'pointer',
                }}>
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Ultima sync */}
        {stato?.ultimo_sync && (
          <div style={{ fontSize: 10, color: C.textSoft }}>
            Ultimo sync: {new Date(stato.ultimo_sync).toLocaleString('it-IT')}
          </div>
        )}

        {/* Azioni */}
        {!inConfig && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {item.apiDisponibile && (
              <button
                onClick={() => setConfigurando(connessa ? null : item.id)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700,
                  background: connessa ? '#F0FDF4' : C.red,
                  color: connessa ? C.green : '#FFF',
                }}>
                {connessa ? '✓ Configurata' : '⚙ Configura API'}
              </button>
            )}
            {!item.apiDisponibile && (
              <div style={{
                flex: 1, padding: '8px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                color: C.textSoft, background: '#F5F0EE', textAlign: 'center',
              }}>
                Solo import file
              </div>
            )}
            {connessa && (
              <button
                onClick={() => disattivaIntegrazione(item.id)}
                style={{
                  padding: '8px 12px', borderRadius: 7, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.textSoft, fontSize: 11, cursor: 'pointer',
                }}>
                Disattiva
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const Section = ({ title, icon, items }) => (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.red, marginBottom: 6 }}>
        {icon} {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {items.map(item => <Card key={item.id} item={item} />)}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.red, marginBottom: 6 }}>
          Connessioni
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: '-0.03em' }}>
          Integrazioni
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: C.textSoft, maxWidth: 600 }}>
          Collega FoodOS alle piattaforme delivery e ai sistemi cassa per importare automaticamente ricavi e movimenti.
        </p>
      </div>

      {/* Info box */}
      <div style={{
        background: '#FFF8EE', border: `1px solid ${C.amber}30`, borderRadius: 12,
        padding: '14px 20px', marginBottom: 28, display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 18 }}>💡</span>
        <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7 }}>
          <b>Import manuale:</b> vai in <b>Cassa</b> e usa i pulsanti "Importa da delivery" o "Importa da sistema cassa" per caricare i file export.<br />
          <b>Sync automatica:</b> configura qui l'API key — FoodOS scaricherà i dati ogni notte alle 02:00.
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.textSoft, fontSize: 13 }}>
          Caricamento integrazioni…
        </div>
      ) : (
        <>
          <Section title="Piattaforme Delivery" icon="🛵" items={DELIVERY} />
          <Section title="Sistemi Cassa" icon="🖥" items={CASSA} />
        </>
      )}
    </div>
  );
}
