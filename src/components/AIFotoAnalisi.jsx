import React, { useState } from 'react'

const CATEGORIE = ['Torte','Biscotti','Crostate','Muffin','Croissant','Pane','Pizze','Primi','Secondi','Dolci','Altro']
const UNITA = ['g','kg','ml','l','pz','cucchiai','cucchiaino','tazze','noce','pizzico','qb']

const INPUT = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0',
  borderRadius: 6, fontSize: 13, background: '#FFF', color: '#0F172A',
  boxSizing: 'border-box',
}

export default function AIFotoAnalisi({ dati, onConferma, onRianalizza, onAnnulla }) {
  const [form, setForm] = useState(dati)
  const [ingredienti, setIngredienti] = useState(dati.ingredienti || [])

  function updateIngrediente(i, field, val) {
    const nuovi = [...ingredienti]
    nuovi[i] = { ...nuovi[i], [field]: val }
    setIngredienti(nuovi)
  }

  function rimuoviIngrediente(i) {
    setIngredienti(ingredienti.filter((_, idx) => idx !== i))
  }

  function aggiungiIngrediente() {
    setIngredienti([...ingredienti, { nome: '', quantita: 0, unita: 'g' }])
  }

  return (
    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: '#065F46', fontSize: 15 }}>
          Dati estratti — controlla e modifica se necessario
        </div>
        <button onClick={onRianalizza} style={{
          padding: '6px 12px', background: '#FFF', border: '1px solid #E2E8F0',
          borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#64748B'
        }}>
          Rianalizza
        </button>
      </div>

      {/* Nome ricetta */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
          Nome ricetta
        </label>
        <input
          style={INPUT}
          value={form.nome || ''}
          onChange={e => setForm({ ...form, nome: e.target.value })}
          placeholder="Nome ricetta"
        />
      </div>

      {/* Categoria e porzioni */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
            Categoria
          </label>
          <select style={INPUT} value={form.categoria || 'Altro'} onChange={e => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
            Porzioni / unità
          </label>
          <input
            style={INPUT}
            type="number"
            min="1"
            value={form.porzioni || 8}
            onChange={e => setForm({ ...form, porzioni: parseInt(e.target.value) || 1 })}
          />
        </div>
      </div>

      {/* Ingredienti */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase' }}>
          Ingredienti ({ingredienti.length})
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ingredienti.map((ing, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 28px', gap: 6, alignItems: 'center' }}>
              <input
                style={INPUT}
                value={ing.nome}
                onChange={e => updateIngrediente(i, 'nome', e.target.value)}
                placeholder="Ingrediente"
              />
              <input
                style={INPUT}
                type="number"
                value={ing.quantita}
                onChange={e => updateIngrediente(i, 'quantita', parseFloat(e.target.value) || 0)}
                placeholder="Qtà"
              />
              <select style={INPUT} value={ing.unita || 'g'} onChange={e => updateIngrediente(i, 'unita', e.target.value)}>
                {UNITA.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button
                onClick={() => rimuoviIngrediente(i)}
                style={{ width: 28, height: 28, background: '#FEE2E2', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#DC2626', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>
          ))}
        </div>
        <button
          onClick={aggiungiIngrediente}
          style={{ marginTop: 8, padding: '6px 12px', background: '#FFF', border: '1px dashed #CBD5E1', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#64748B', width: '100%' }}
        >
          + Aggiungi ingrediente
        </button>
      </div>

      {/* Procedimento */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>
          Note procedimento
        </label>
        <textarea
          style={{ ...INPUT, height: 60, resize: 'vertical' }}
          value={form.procedimento || ''}
          onChange={e => setForm({ ...form, procedimento: e.target.value })}
          placeholder="Temperatura, tempi, note…"
        />
      </div>

      {/* Bottoni */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onConferma({ ...form, ingredienti })}
          style={{
            flex: 1, padding: '12px', background: '#059669', color: '#FFF',
            border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14
          }}
        >
          Conferma e salva ricetta
        </button>
        {onAnnulla && (
          <button
            onClick={onAnnulla}
            style={{ padding: '12px 16px', background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#64748B' }}
          >
            Annulla
          </button>
        )}
      </div>
    </div>
  )
}
