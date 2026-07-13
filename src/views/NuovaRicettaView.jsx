// NuovaRicettaView - Editor ricetta (crea/modifica). Estratta da Dashboard.jsx.
//
// REBUILD: form guidato a sezioni (POV proprietario che aggiunge un prodotto) con
// pannello LIVE "Anteprima redditività" sempre visibile: food cost €/% calcolato
// in tempo reale (calcolaFC), margine €/%, semaforo verde/ambra/rosso e PREZZO
// CONSIGLIATO per un food cost target (default 30%, modificabile).
//
// CONTRATTO INVARIATO: stessa firma export, stesso onSave(nuovoRic, nuoveRegole, noRedirect)
// e stesso formato dati salvato nel ricettario (nome, sheetName:"manuale", numStampi,
// totImpasto1, foodCost1, ingredienti, note, unita, prezzo, tipo, congelabile, allergeni).
import React, { useState, useMemo, useEffect, useRef } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida, mergeIngredientiPerNorm, normIng, PREZZI_HORECA, translateIngredienteEN, translateProdottoEN } from '../lib/foodcost'
import { ALLERGENI, ALLERGENE_COLORS, detectAllergeniFromIngredienti, mergeAllergeni } from '../lib/allergeni'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { lessico } from '../lib/lessico'
import FotoOCR from '../components/FotoOCR'
import AIFotoAnalisi from '../components/AIFotoAnalisi'
import Icon from '../components/Icon'
import { C, fmt, fmtp, TNUM } from './_shared'
import { useUnsavedGuard } from '../lib/useUnsavedGuard'

// Ombra premium coerente con la Dashboard home.
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// Categorie suggerite (chip rapide). L'utente può anche digitare liberamente.
const CATEGORIE = ['Torte', 'Biscotti', 'Lievitati', 'Monoporzioni', 'Crostate', 'Salato', 'Bevande', 'Altro']

// Titolo di card con chip icona (gerarchia premium come la Dashboard home).
function PanelHead({ icon, title, color = C.red, badge, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: `${color}14`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{title}</div>
        {badge}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textSoft, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )
}

// Etichetta campo (uppercase tracking premium).
const fieldLabel = { fontSize: 9, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }
const inputBase = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, color: C.text, background: C.white, boxSizing: 'border-box' }

export default function NuovaRicettaView({ ricettario, onSave, notify, editingRicetta, onEditConsumed, LEX = lessico() }) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario]);
  const tuttiIng = useMemo(() => {
    const s = new Set();
    for (const ric of Object.values(ricettario?.ricette || {}))
      for (const ing of (ric.ingredienti || [])) s.add(normIng(ing.nome));
    for (const ric of Object.values(ricettario?.ricette || {}))
      if (getR(ric.nome, ric).tipo === "semilavorato") s.add(normIng(ric.nome || "").toLowerCase().trim());
    for (const k of Object.keys(PREZZI_HORECA)) s.add(k);
    return [...s].filter(k => k && k.length > 1).sort();
  }, [ricettario]);

  const empty = { nome: "", categoria: "", unita: 8, prezzo: 4, tipo: "fetta", note: "", ingredienti: [], congelabile: false, allergeniManual: [] };
  const [form, setForm] = useState(empty);
  // Snapshot del form all'ultimo save/load: serve al dirty-guard (useUnsavedGuard)
  // per capire se ci sono modifiche non salvate rispetto allo stato "pulito".
  const initialFormRef = useRef(empty);
  const [targetPct, setTargetPct] = useState(30); // food cost obiettivo (%) - modificabile

  // Allergeni rilevati automaticamente dagli ingredienti (Reg. UE 1169/2011).
  const autoAllergeni = useMemo(() => detectAllergeniFromIngredienti(form.ingredienti), [form.ingredienti]);
  const effectiveAllergeni = useMemo(() => mergeAllergeni(autoAllergeni, form.allergeniManual), [autoAllergeni, form.allergeniManual]);

  const [newIngNome, setNewIngNome] = useState("");
  const [newIngQty, setNewIngQty] = useState("");
  const [editMode, setEditMode] = useState(null);          // nome ricetta esistente in edit
  const [deleteConf, setDeleteConf] = useState(null);      // nome ricetta da cancellare (step 1)
  const [deletePin, setDeletePin] = useState("");          // PIN conferma cancellazione
  const [overwriteConf, setOverwriteConf] = useState(null);// nome ricetta da sovrascrivere
  const [forceOverwrite, setForceOverwrite] = useState(false); // per batch foto
  const [datiEstratti, setDatiEstratti] = useState(null);  // dati AI in attesa di conferma
  const [saving, setSaving] = useState(false);             // bottone salva in corso
  const [showMore, setShowMore] = useState(false);         // progressive disclosure: note + congelabile
  // Modal "imposta prezzo" per ingrediente con prezzo mancante:
  // { nome, costoKg: string, saving } | null
  const [priceModal, setPriceModal] = useState(null);
  // Toolbar azioni secondarie in cima: quale pannello e' aperto (null | 'foto' | 'modifica' | 'elimina')
  const [openAction, setOpenAction] = useState(null);
  // Allergeni manuali: elenco checkbox nascosto di default per non intasare
  // la card. Si apre col bottone "Modifica manualmente" o automaticamente se
  // l'utente ha gia' selezionato override manuali (es. edit di ricetta esistente).
  const [showManualAllergeni, setShowManualAllergeni] = useState(false);
  const formRef = useRef(null);
  // Audit 2026-07-01 HIGH: tracking scroll timer per cleanup unmount.
  const scrollTimerRef = useRef(null);
  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
  }, []);
  function scrollToFormDeferred(delay = 100) {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      try { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) } catch {}
      scrollTimerRef.current = null;
    }, delay);
  }

  const ricetteEsistenti = Object.keys(ricettario?.ricette || {}).filter(isRicettaValida);

  const isSemiOrInterno = form.tipo === "semilavorato" || form.tipo === "interno";

  const addIng = () => {
    if (!newIngNome.trim() || !newIngQty) return;
    setForm(f => ({ ...f, ingredienti: [...f.ingredienti, { nome: newIngNome.trim(), qty1stampo: parseFloat(newIngQty) || 0, costoPerG: 0, costo1stampo: 0 }] }));
    setNewIngNome(""); setNewIngQty("");
  };
  const removeIng = i => setForm(f => ({ ...f, ingredienti: f.ingredienti.filter((_, j) => j !== i) }));

  // Salva il prezzo di un ingrediente al kg nel ricettario e chiude il modal.
  // Al successo il form si aggiorna via prop `ricettario` (buildIngCosti rilegge)
  // e il badge "prezzo mancante" scompare da solo per quell'ingrediente.
  const handleSavePrezzoIng = async () => {
    if (!priceModal) return;
    const raw = String(priceModal.costoKg || '').replace(',', '.').trim();
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val < 0) {
      notify("Inserisci un prezzo valido in euro al kg (es. 8,50)", false);
      return;
    }
    setPriceModal(m => m ? { ...m, saving: true } : m);
    try {
      const key = normIng(priceModal.nome);
      const costoG = parseFloat((val / 1000).toFixed(6));
      const nuovoRic = {
        ...(ricettario || {}),
        ingredienti_costi: {
          ...(ricettario?.ingredienti_costi || {}),
          [key]: { costoKg: val, costoG }
        }
      };
      await onSave(nuovoRic, {}, true); // noRedirect: resta sul form
      setPriceModal(null);
      notify(`Prezzo di "${priceModal.nome}" salvato: ${val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`);
    } catch (e) {
      setPriceModal(m => m ? { ...m, saving: false } : m);
      notify("Errore salvataggio prezzo, riprova", false);
    }
  };

  const loadForEdit = nome => {
    const r = ricettario?.ricette?.[nome];
    if (!r) return;
    const reg = getR(nome, ricettario?.ricette?.[nome]);
    const ings = r.ingredienti.map(i => ({ ...i }));
    const auto = detectAllergeniFromIngredienti(ings);
    const manual = (r.allergeni || []).filter(a => !auto.includes(a));
    const loaded = { nome: r.nome, categoria: r.categoria || "", unita: reg.unita, prezzo: reg.prezzo, tipo: reg.tipo, note: r.note || "", ingredienti: ings, congelabile: r.congelabile || false, allergeniManual: manual };
    setForm(loaded);
    initialFormRef.current = loaded; // reset dirty
    setEditMode(nome);
    scrollToFormDeferred(100);
  };

  // Pre-carica una ricetta in modifica quando arriva dal click su card
  useEffect(() => {
    if (editingRicetta && ricettario?.ricette?.[editingRicetta]) {
      loadForEdit(editingRicetta);
      onEditConsumed && onEditConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRicetta, ricettario]);

  const handleDeleteRicetta = async nome => {
    if (deletePin !== "ELIMINA") { notify("Scrivi ELIMINA in maiuscolo per confermare", false); return; }
    const nuovoRic = { ...ricettario, ricette: Object.fromEntries(Object.entries(ricettario.ricette || {}).filter(([k]) => k !== nome)) };
    onSave(nuovoRic, {}, true); // noRedirect=true - rimane sulla pagina
    setDeleteConf(null); setDeletePin(""); setEditMode(null); setForm(empty);
    notify(`Ricetta "${nome}" eliminata`);
  };

  const doSaveRicetta = async () => {
    setSaving(true);
    try {
      const nuovaRic = {
        nome: form.nome.trim().toUpperCase(),
        sheetName: "manuale",
        numStampi: 1, totImpasto1: 0, foodCost1: 0,
        ingredienti: form.ingredienti,
        note: form.note,
        unita: form.unita,
        prezzo: form.prezzo,
        tipo: form.tipo,
        congelabile: form.congelabile || false,
        allergeni: effectiveAllergeni,
        categoria: (form.categoria || "").trim() || undefined,
      };
      const nuovoRic = {
        ingredienti_costi: ricettario?.ingredienti_costi || {},
        ...(ricettario || {}),
        ricette: { ...(ricettario?.ricette || {}), [nuovaRic.nome]: nuovaRic }
      };
      await onSave(nuovoRic, { [nuovaRic.nome]: { unita: form.unita, prezzo: form.prezzo, tipo: form.tipo } });
      setForm(empty); setEditMode(null); setOverwriteConf(null);
      initialFormRef.current = empty; // dirty pulito dopo save
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!form.nome.trim()) { notify("Inserisci il nome della ricetta", false); return; }
    if (form.ingredienti.length === 0) { notify("Nessun ingrediente - aggiungine almeno uno prima di salvare", false); return; }
    const nomeUp = form.nome.trim().toUpperCase();
    const esiste = ricettario?.ricette?.[nomeUp];
    const isEditing = editMode === nomeUp;
    if (esiste && !isEditing) { setOverwriteConf(nomeUp); } else { doSaveRicetta(); }
  };

  // Save invocato dal dirty-guard prima di navigare via: se il salvataggio
  // non e' possibile (nome vuoto / no ingredienti / overwrite richiesto) rifiuta
  // la promise cosi' il Dashboard mantiene l'utente sulla view.
  const handleSaveFromGuard = async () => {
    if (!form.nome.trim()) { notify("Serve il nome della ricetta prima di salvare", false); throw new Error('name empty'); }
    if (form.ingredienti.length === 0) { notify("Aggiungi almeno un ingrediente prima di salvare", false); throw new Error('no ingredients'); }
    const nomeUp = form.nome.trim().toUpperCase();
    const esiste = ricettario?.ricette?.[nomeUp];
    const isEditing = editMode === nomeUp;
    if (esiste && !isEditing) {
      notify("Esiste gia' una ricetta con questo nome: cambia nome o conferma la sovrascrittura prima di uscire.", false);
      throw new Error('overwrite required');
    }
    await doSaveRicetta();
  };

  // Dirty-guard: registra al Dashboard che la view ha modifiche non salvate.
  // Il Dashboard intercetta setView e mostra un modal "Salva / Esci senza salvare".
  useUnsavedGuard({
    isDirty: () => {
      try { return JSON.stringify(form) !== JSON.stringify(initialFormRef.current) }
      catch { return false }
    },
    save: handleSaveFromGuard,
    discard: () => {
      setForm(empty);
      setEditMode(null);
      initialFormRef.current = empty;
    },
  });

  // ─── Calcolo redditività LIVE ──────────────────────────────────────────────
  // Usa calcolaFC (motore ufficiale: gestisce semilavorati + rese) così l'anteprima
  // coincide col food cost mostrato nelle altre pagine.
  const live = useMemo(() => {
    const ricettaTmp = { ingredienti: form.ingredienti, tipo: form.tipo, unita: form.unita, prezzo: form.prezzo };
    const { tot: fc, mancanti } = calcolaFC(ricettaTmp, ingCosti, ricettario);
    const ricavo = +((form.unita || 0) * (form.prezzo || 0)).toFixed(2);
    const margine = +(ricavo - fc).toFixed(2);
    const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0;
    const fcPct = ricavo > 0 ? (fc / ricavo * 100) : 0;
    const fcUnit = form.unita > 0 ? fc / form.unita : 0;
    const target = targetPct / 100;
    // Prezzo per pezzo/fetta che porta il food cost ESATTAMENTE al target.
    const prezzoConsigliato = target > 0 ? +(fcUnit / target).toFixed(2) : 0;
    const deltaPrezzo = +(prezzoConsigliato - (form.prezzo || 0)).toFixed(2);
    return { fc, mancanti, ricavo, margine, margPct, fcPct, fcUnit, prezzoConsigliato, deltaPrezzo };
  }, [form.ingredienti, form.unita, form.prezzo, form.tipo, ingCosti, ricettario, targetPct]);

  // Semaforo basato sul food cost % rispetto al target.
  //   verde   = food cost ≤ target            (sano)
  //   ambra   = target < fc ≤ target + 10      (da tenere d'occhio)
  //   rosso   = fc > target + 10               (critico)
  const sem = useMemo(() => {
    if (live.ricavo <= 0) return { color: C.textSoft, bg: '#FAF8F7', border: C.border, label: 'Imposta unità e prezzo', icon: 'dot' };
    if (live.fcPct <= targetPct) return { color: C.green, bg: C.greenLight, border: `${C.green}40`, label: 'Sano', icon: 'checkCircle' };
    if (live.fcPct <= targetPct + 10) return { color: C.amber, bg: C.amberLight, border: `${C.amber}55`, label: 'Da tenere d’occhio', icon: 'warning' };
    return { color: C.red, bg: C.redLight, border: `${C.red}40`, label: 'Critico', icon: 'alert' };
  }, [live, targetPct]);

  const handleConfermaRicetta = (datiConfermati) => {
    const UNIT_G = { g: 1, gr: 1, grammi: 1, grammo: 1, kg: 1000, ml: 1, l: 1000, cl: 10, dl: 100,
      cucchiaio: 15, cucchiai: 15, tbsp: 15, cucchiaino: 5, cucchiaini: 5, tsp: 5,
      tazza: 240, cup: 240, tazze: 240, bicchiere: 200, noce: 15, pizzico: 2, qb: 0, pz: 1 };
    const ings = (datiConfermati.ingredienti || [])
      .filter(i => i.nome.trim())
      .map(i => ({
        nome: translateIngredienteEN(i.nome.toLowerCase().trim()),
        qty1stampo: Math.round((parseFloat(i.quantita) || 0) * (UNIT_G[(i.unita || 'g').toLowerCase()] ?? 1)),
        costoPerG: 0, costo1stampo: 0
      }));
    const nomeUp = (datiConfermati.nome || '').trim().toUpperCase();
    if (!nomeUp || !ings.length) { notify('Dati incompleti - inserisci nome e almeno un ingrediente', false); return; }
    const nuovaRic = {
      nome: nomeUp, sheetName: 'manuale', numStampi: 1, totImpasto1: 0, foodCost1: 0,
      ingredienti: ings, note: datiConfermati.procedimento || '',
      unita: datiConfermati.porzioni || 8, prezzo: 4, tipo: 'fetta',
      congelabile: false, allergeni: detectAllergeniFromIngredienti(ings),
    };
    const nuovoRic = {
      ingredienti_costi: ricettario?.ingredienti_costi || {},
      ...(ricettario || {}),
      ricette: { ...(ricettario?.ricette || {}), [nomeUp]: nuovaRic }
    };
    onSave(nuovoRic, { [nomeUp]: { unita: nuovaRic.unita, prezzo: nuovaRic.prezzo, tipo: nuovaRic.tipo } });
    setDatiEstratti(null);
  };

  const cardStyle = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: isMobile ? '16px' : '20px', boxShadow: SHADOW_PREMIUM };

  return (
    <>
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Hero + titolo: da' peso all'inserimento manuale che e' il flusso primario. */}
      <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: isMobile ? 44 : 52, height: isMobile ? 44 : 52, borderRadius: R.lg, background: `linear-gradient(135deg, ${T.brand}, #4A0612)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", flexShrink: 0, boxShadow: `0 8px 24px ${T.brand}33` }}>
          <Icon name={editMode ? "edit" : "plus"} size={isMobile ? 20 : 24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {editMode ? <>Modifica <span style={{ color: T.brand }}>{editMode}</span></> : "Nuova ricetta"}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: T.textSoft, lineHeight: 1.45 }}>
            {editMode
              ? "L'anteprima a destra ti dice subito se la ricetta regge i conti."
              : "Compila qui sotto: a destra vedi food cost e margine in tempo reale."}
          </p>
        </div>
      </div>

      {/* Banner "stai modificando" - resta in evidenza per non perdere il contesto. */}
      {editMode && (
        <div style={{ marginBottom: 14, fontSize: 12.5, color: T.amber, display: "flex", alignItems: "center", justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <Icon name="warning" size={12} /> Stai modificando <b style={{ fontWeight: 700, marginLeft: 4 }}>{editMode}</b> - il salvataggio sovrascrive.
          </div>
          <button type="button" onClick={() => { setEditMode(null); setForm(empty); initialFormRef.current = empty; }}
            style={{
              padding: '7px 14px', minHeight: isMobile ? 36 : 'auto',
              background: '#FFF', color: T.brand,
              border: `1px solid ${T.brand}40`, borderRadius: 7,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            <Icon name="plus" size={12} /> Ricetta nuova
          </button>
        </div>
      )}

      {/* Toolbar azioni secondarie: chip compatti che espandono un pannello contestuale.
          Regola UX: le azioni "shortcut" (foto, modifica esistente, elimina) NON devono
          dominare il flusso primario che e' la compilazione manuale del form sotto. */}
      <div style={{ marginBottom: openAction ? 12 : 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ActionChip
          isMobile={isMobile}
          active={openAction === 'foto'}
          onClick={() => setOpenAction(a => a === 'foto' ? null : 'foto')}
          icon={<Icon name="camera" size={15} />}
          color={T.brand}
          label="Parti da una foto"
          sub="OCR ricetta o listino"
        />
        {ricetteEsistenti.length > 0 && (
          <ActionChip
            isMobile={isMobile}
            active={openAction === 'modifica'}
            onClick={() => setOpenAction(a => a === 'modifica' ? null : 'modifica')}
            icon={<Icon name="edit" size={15} />}
            color="#0369A1"
            label="Modifica esistente"
            sub={`${ricetteEsistenti.length} nel ricettario`}
          />
        )}
        {ricetteEsistenti.length > 0 && (
          <ActionChip
            isMobile={isMobile}
            active={openAction === 'elimina'}
            onClick={() => setOpenAction(a => a === 'elimina' ? null : 'elimina')}
            icon={<Icon name="trash" size={15} />}
            color="#991B1B"
            label="Elimina ricetta"
            sub="conferma richiesta"
          />
        )}
      </div>

      {/* Pannello contestuale: "Modifica esistente" */}
      {openAction === 'modifica' && ricetteEsistenti.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 22, padding: isMobile ? '14px 16px' : '16px 20px', borderColor: '#0369A122' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0369A1', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Scegli la ricetta da modificare</div>
          <RicettaPicker
            label="Cerca fra le tue ricette"
            icon={<Icon name="search" size={14} />}
            variant="primary"
            ricette={ricetteEsistenti}
            activeNome={editMode}
            onSelect={(nome) => { loadForEdit(nome); setOpenAction(null); }}
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Pannello contestuale: "Elimina ricetta" */}
      {openAction === 'elimina' && ricetteEsistenti.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 22, padding: isMobile ? '14px 16px' : '16px 20px', borderColor: '#991B1B22' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Elimina una ricetta esistente</div>
          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10, lineHeight: 1.5 }}>
            La cancellazione e' definitiva. Serve confermare scrivendo <b>ELIMINA</b>.
          </div>
          <RicettaPickerDelete
            ricette={ricetteEsistenti}
            deleteConf={deleteConf}
            setDeleteConf={setDeleteConf}
            deletePin={deletePin}
            setDeletePin={setDeletePin}
            onConfirm={async (nome) => { await handleDeleteRicetta(nome); setOpenAction(null); }}
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Pannello contestuale: "Parti da una foto" (OCR upload) */}
      {openAction === 'foto' && (
        <div style={{ ...cardStyle, marginBottom: 22, padding: isMobile ? '14px 16px' : '16px 20px', borderColor: `${T.brand}22` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.brand, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Estrai una ricetta da una foto</div>
          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 12, lineHeight: 1.5 }}>
            Carica una foto della ricetta o del listino: leggo io nome, ingredienti e quantita', poi tu confermi.
          </div>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 6 : 10, marginBottom: 10, padding: isMobile ? "10px 12px" : "8px 12px", background: C.amberLight, borderRadius: 8, border: `1px solid ${C.amber}40`, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: isMobile ? 12 : 11, color: C.amber, fontWeight: 700, minHeight: isMobile ? 40 : 'auto', lineHeight: 1.35 }}>
              <input type="checkbox" checked={forceOverwrite} onChange={e => setForceOverwrite(e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }} />
              Sovrascrivi ricette gia' esistenti
            </label>
            <span style={{ fontSize: isMobile ? 10.5 : 9, color: C.textSoft, lineHeight: 1.4 }}>Se disattivato, le ricette con lo stesso nome vengono saltate</span>
          </div>
      <FotoOCR mode="ricetta" notify={notify} ricettario={ricettario}
        onResult={res => {
          const ingsRaw = (res.ingredienti || []).map(i => ({
            nome: translateIngredienteEN(i.nome || ''),
            quantita: parseFloat(i.quantita) || parseFloat(i.qty) || 0,
            unita: i.unita || 'g'
          }));
          // Accorpa doppi singolare/plurale (tuorlo+tuorli → un solo tuorlo con quantita' sommata).
          const ingredienti = mergeIngredientiPerNorm(ingsRaw, { qtyField: 'quantita' });
          setDatiEstratti({
            nome: translateProdottoEN(res.nome || ''),
            categoria: 'Altro',
            porzioni: res.porzioni || res.unita || 8,
            ingredienti,
            procedimento: res.note || ''
          });
          setOpenAction(null); // chiudi pannello foto: sotto compare AIFotoAnalisi
          scrollToFormDeferred(150);
        }}
        onBatchSave={async (res, idx, ricAcc, setRicAcc) => {
          const UNIT_G = { g: 1, gr: 1, grammi: 1, grammo: 1, kg: 1000, chilo: 1000, chilogrammo: 1000, ml: 1, millilitri: 1, l: 1000, litro: 1000, litri: 1000, cl: 10, centilitri: 10, dl: 100, decilitri: 100, cucchiaio: 15, cucchiai: 15, tbsp: 15, cucchiaino: 5, cucchiaini: 5, tsp: 5, tazza: 240, cup: 240, tazze: 240, bicchiere: 200, bicchieri: 200, noce: 15, pizzico: 2, pizzichi: 2, qb: 0 };
          const SKIP_ING_OCR = ["ingrediente", "ingredient", "ingredienti", "nome ingrediente in minuscolo", "n/d", "nan", "undefined", ""];
          const toGrams = (i) => { if (i.qty != null) return parseFloat(i.qty) || 0; const q = parseFloat(i.quantita) || 0; const u = (i.unita || "g").toLowerCase().trim(); return Math.round(q * (UNIT_G[u] ?? 1)); };
          const ingsRaw = (res.ingredienti || [])
            .map(i => ({ nome: translateIngredienteEN(i.nome || ""), qty1stampo: toGrams(i), costoPerG: 0, costo1stampo: 0 }))
            .filter(i => !SKIP_ING_OCR.includes(i.nome.toLowerCase().trim()) && i.qty1stampo >= 0);
          // Accorpa doppi singolare/plurale (es. tuorlo+tuorli → tuorlo con qty sommata).
          const ings = mergeIngredientiPerNorm(ingsRaw, { qtyField: 'qty1stampo' });
          const nomeIT = (translateProdottoEN(res.nome || "") || "").trim().toUpperCase();
          if (!nomeIT || ings.length === 0 || !isRicettaValida(nomeIT.toLowerCase())) return false;
          if ((ricAcc || ricettario)?.ricette?.[nomeIT] && !forceOverwrite) {
            notify(`"${nomeIT}" già esistente - saltata (attiva "Sovrascrivi esistenti" per aggiornare)`, false);
            return false;
          }
          const nuovaRic = {
            nome: nomeIT, sheetName: "manuale", numStampi: 1, totImpasto1: 0, foodCost1: 0,
            ingredienti: ings, note: res.note || "",
            unita: res.porzioni || res.unita || 8, prezzo: res.prezzo || 4, tipo: res.tipo || "fetta",
            congelabile: false, allergeni: detectAllergeniFromIngredienti(ings),
          };
          const base = ricAcc || ricettario || {};
          const nuovoRic = {
            ingredienti_costi: base.ingredienti_costi || {},
            ...base,
            ricette: { ...(base.ricette || {}), [nomeIT]: nuovaRic }
          };
          const nuoveRegole = { [nomeIT]: { unita: nuovaRic.unita, prezzo: nuovaRic.prezzo, tipo: nuovaRic.tipo } };
          await onSave(nuovoRic, nuoveRegole, true);
          setRicAcc(nuovoRic);
          return true;
        }}
      />
        </div>
      )}

      {datiEstratti && (
        <AIFotoAnalisi
          dati={datiEstratti}
          onConferma={handleConfermaRicetta}
          onRianalizza={() => setDatiEstratti(null)}
          onAnnulla={() => setDatiEstratti(null)}
        />
      )}

      <div ref={formRef} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr" : "1fr 340px", gap: isTablet ? 18 : 24 }}>
        {/* ── Form (sinistra) ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 1. Informazioni prodotto */}
          <div style={cardStyle}>
            <PanelHead icon={<Icon name="clipboard" size={18} />} title={`Informazioni ${LEX.prodotto}`} color={C.text} />
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              {/* Nome - full width */}
              <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                <div style={fieldLabel}>Nome {LEX.ricetta}</div>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value.toUpperCase() }))}
                  placeholder="es. TORTA AL CIOCCOLATO"
                  style={{ ...inputBase, fontWeight: 700 }} />
              </div>

              {/* Categoria - full width con chip rapide */}
              <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                <div style={fieldLabel}>Categoria</div>
                <input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  placeholder="es. Torte" list="cat-autocomplete"
                  style={inputBase} />
                <datalist id="cat-autocomplete">{CATEGORIE.map(c => <option key={c} value={c} />)}</datalist>
                <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 8 : 5, marginTop: 8 }}>
                  {CATEGORIE.map(c => {
                    const sel = (form.categoria || "").trim().toLowerCase() === c.toLowerCase();
                    return (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, categoria: c }))}
                        style={{ padding: isMobile ? "10px 14px" : "4px 11px", minHeight: isMobile ? 40 : 'auto', borderRadius: R.full, border: `1px solid ${sel ? C.red : C.border}`, background: sel ? C.redLight : C.white, color: sel ? C.red : C.textMid, fontSize: isMobile ? 13 : 11, fontWeight: sel ? 700 : 500, cursor: "pointer" }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tipo unità */}
              <div>
                <div style={fieldLabel}>Tipo unità</div>
                <select value={form.tipo} aria-label="Tipo unità" onChange={e => setForm(f => ({ ...f, tipo: e.target.value, unita: e.target.value === "semilavorato" || e.target.value === "interno" ? 0 : f.unita, prezzo: e.target.value === "semilavorato" || e.target.value === "interno" ? 0 : f.prezzo }))}
                  style={{ ...inputBase, fontSize: isMobile ? 16 : 14 }}>
                  <option value="fetta">Fetta</option><option value="pezzo">Pezzo</option><option value="interno">Uso interno</option><option value="semilavorato">Semilavorato (base/impasto)</option>
                </select>
                {form.tipo === "semilavorato" && <div style={{ marginTop: 6, padding: "6px 10px", background: "#F9F2FD", border: "1px solid #D4B0E8", borderRadius: 6, fontSize: 10, color: "#8E44AD", display: "flex", alignItems: "center", gap: 5 }}>
                  <Icon name="bulb" size={13} /> <span>Per i semilavorati usa la sezione dedicata <strong>"Semilavorati"</strong> in sidebar - ha template rapidi e import da foto.</span>
                </div>}
                {/* Niente flag is_gusto qui: in modalita' inventario, tutte
                    le ricette tipo fetta/pezzo sono trattate automaticamente
                    come gusti - la scelta del metodo si fa una sola volta
                    nelle Impostazioni sedi, non per ricetta. */}
              </div>

              {/* N° pezzi/fette per stampo */}
              <div>
                <div style={fieldLabel}>{form.tipo === "pezzo" ? "Pezzi per stampo" : "Fette / porzioni per stampo"}</div>
                <input type="number" min="0" value={form.unita} disabled={isSemiOrInterno}
                  aria-label={form.tipo === "pezzo" ? "Pezzi per stampo" : "Fette o porzioni per stampo"}
                  onChange={e => setForm(f => ({ ...f, unita: parseFloat(e.target.value) || 0 }))}
                  style={{ ...inputBase, opacity: isSemiOrInterno ? 0.5 : 1 }} />
              </div>

              {/* Prezzo di vendita */}
              <div>
                <div style={fieldLabel}>Prezzo vendita / unità (€)</div>
                <input type="number" min="0" step="0.5" value={form.prezzo} disabled={isSemiOrInterno}
                  aria-label="Prezzo vendita per unità in euro"
                  onChange={e => setForm(f => ({ ...f, prezzo: parseFloat(e.target.value) || 0 }))}
                  style={{ ...inputBase, opacity: isSemiOrInterno ? 0.5 : 1 }} />
              </div>

            </div>

            {/* Progressive disclosure: note + congelabile nascosti di default */}
            {!showMore && !form.note && !form.congelabile && (
              <button type="button" onClick={() => setShowMore(true)}
                style={{
                  marginTop: 14, padding: '10px 14px',
                  background: 'transparent', border: `1px dashed ${C.border}`,
                  borderRadius: 8, color: C.textMid, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                <Icon name="plus" size={12} /> Aggiungi note di cottura o congelabilità
              </button>
            )}

            {(showMore || form.note || form.congelabile) && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={fieldLabel}>Note (cottura, temperatura…)</div>
                  <input value={form.note} aria-label="Note ricetta (cottura, temperatura)" onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="es. 180°C per 45 min"
                    style={{ ...inputBase, fontSize: isMobile ? 16 : 14 }} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: form.congelabile ? "#EEF8FF" : "#F8F4F2", borderRadius: 8, border: `1px solid ${form.congelabile ? "#BDE" : "#E8E0DC"}`, cursor: "pointer" }}
                  onClick={() => setForm(f => ({ ...f, congelabile: !f.congelabile }))}>
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: form.congelabile ? "#2980B9" : "#C8B8B4", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                    <div style={{ position: "absolute", top: 2, left: form.congelabile ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: "#FFF", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: form.congelabile ? "#2980B9" : C.textMid, display: "flex", alignItems: "center", gap: 5 }}>
                      <Icon name="snow" size={13} /> {form.congelabile ? "Si può congelare" : "Si può congelare?"}
                    </div>
                    <div style={{ fontSize: 9, color: C.textSoft, marginTop: 1 }}>
                      {form.congelabile ? "Lo produci in anticipo, lo tieni in freezer, lo vendi nei giorni successivi." : "Attiva se lo produci e lo vendi in giorni diversi."}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Ingredienti */}
          <div style={cardStyle}>
            <PanelHead icon={<Icon name="receipt" size={18} />} title="Ingredienti"
              sub="Aggiungi ogni ingrediente con la quantità in grammi per uno stampo. Il costo viene preso dal tuo listino prezzi (o dalla stima HoReCa)." />
            {form.ingredienti.length > 0 && (
              <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 8, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 360 }}>
                  <thead>
                    <tr style={{ background: "#F8F4F2" }}>
                      {[["Ingrediente", null], ["g / stampo", "Grammi di ingrediente per uno stampo"], ["Costo €", "Costo dell'ingrediente per uno stampo"], ["", null]].map(([h, tip], i) => (
                        <th key={i} title={tip || undefined} style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: C.textSoft, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", ...(tip ? { cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: 3 } : null) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Ordine alfabetico per nome (richiesta utente 13/07/2026).
                        Manteniamo originalIndex per callback edit/remove che
                        agiscono su form.ingredienti per indice. */}
                    {form.ingredienti
                      .map((ing, originalIndex) => ({ ing, originalIndex }))
                      .sort((a, b) => String(a.ing.nome || '').localeCompare(String(b.ing.nome || ''), 'it', { sensitivity: 'base' }))
                      .map(({ ing, originalIndex: i }, rowIndex) => {
                      const c = ingCosti[normIng(ing.nome)];
                      const costo = c ? parseFloat((ing.qty1stampo * c.costoG).toFixed(3)) : 0;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: rowIndex % 2 === 0 ? C.white : "#FDFAF7" }}>
                          <td style={{ padding: "9px 10px", fontWeight: 600, color: C.text }}>
                            <span title={ing.nome} style={{ display: "inline-block", maxWidth: isMobile ? 130 : 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>{ing.nome}</span>
                            {!c && (
                              <button type="button"
                                onClick={() => setPriceModal({ nome: ing.nome, costoKg: '', saving: false })}
                                aria-label={`Imposta prezzo per ${ing.nome}`}
                                title={`Clicca per impostare il prezzo di ${ing.nome} (€/kg)`}
                                style={{ fontSize: 9, marginLeft: 6, background: C.amberLight, color: C.amber, padding: "2px 6px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", border: `1px solid ${C.amber}40`, fontFamily: 'inherit' }}>
                                prezzo mancante ›
                              </button>
                            )}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right" }}>
                            <input type="number" min="0" value={ing.qty1stampo}
                              aria-label={`Grammi per stampo di ${ing.nome}`}
                              onChange={e => {
                                const n = [...form.ingredienti];
                                n[i] = { ...n[i], qty1stampo: parseFloat(e.target.value) || 0 };
                                setForm(f => ({ ...f, ingredienti: n }));
                              }}
                              style={{ width: 80, padding: "7px 8px", borderRadius: 6, border: `1px solid ${C.borderStr}`, fontSize: 16, textAlign: "right", fontWeight: 700, color: C.text, background: C.white }} />
                            <span style={{ fontSize: 10, color: C.textSoft, marginLeft: 4 }}>g</span>
                          </td>
                          <td style={{ padding: "9px 10px", textAlign: "right", color: costo > 0 ? C.red : C.textSoft, fontWeight: 600, ...TNUM, whiteSpace: 'nowrap' }}>{costo > 0 ? fmt(costo) : "-"}</td>
                          <td style={{ padding: "6px 6px", textAlign: "right" }}>
                            <button aria-label="Rimuovi ingrediente" onClick={() => removeIng(i)} style={{ padding: 0, width: 40, height: 40, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.textSoft, fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: 'center' }}><Icon name="trash" size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Add ingrediente */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 110px auto", gap: 8, alignItems: "flex-end" }}>
              <div>
                <div style={fieldLabel}>Ingrediente</div>
                <input value={newIngNome} aria-label="Nome ingrediente da aggiungere"
                  onChange={e => setNewIngNome(e.target.value)}
                  onKeyDown={onEnterAutoComplete(tuttiIng, newIngNome, setNewIngNome, () => { if (newIngQty) addIng() })}
                  placeholder="es. burro" list="ing-autocomplete"
                  style={{ ...inputBase, fontSize: isMobile ? 16 : 14, padding: "9px 11px" }} />
                <datalist id="ing-autocomplete">{tuttiIng.map(k => <option key={k} value={k} />)}</datalist>
              </div>
              <div>
                <div style={fieldLabel}>Grammi</div>
                <input type="number" min="0" value={newIngQty} aria-label="Grammi di ingrediente da aggiungere" onChange={e => setNewIngQty(e.target.value)} onKeyDown={e => e.key === "Enter" && addIng()}
                  placeholder="es. 200"
                  style={{ ...inputBase, fontSize: isMobile ? 16 : 14, padding: "9px 11px" }} />
              </div>
              <button onClick={addIng} style={{ padding: "10px 16px", background: C.red, color: C.white, border: "none", borderRadius: 8, fontSize: isMobile ? 14 : 12, fontWeight: 700, cursor: "pointer", height: isMobile ? 46 : 42, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, width: isMobile ? '100%' : 'auto' }}>
                <Icon name="plus" size={14} /> Aggiungi
              </button>
            </div>

            {/* Helper conversioni - grammi restano l'unita' unica, ma ricordiamo
                le equivalenze comuni per uova e liquidi. */}
            <details style={{ marginTop: 12, fontSize: 12, color: C.textMid, background: '#FAF6F2', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: C.textMid, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="lightbulb" size={12} />
                Non hai la bilancia? Conversioni rapide
              </summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 6 : 14, lineHeight: 1.7 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Uova</div>
                  1 uovo medio ≈ 55 g<br />
                  1 tuorlo ≈ 18 g · 1 albume ≈ 33 g
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Liquidi (per ml)</div>
                  Acqua, latte, panna ≈ 1 g<br />
                  Olio ≈ 0,92 g · Miele ≈ 1,4 g
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Cucchiai</div>
                  1 cucchiaio ≈ 15 g<br />
                  1 cucchiaino ≈ 5 g
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Farina & zucchero</div>
                  1 bicchiere farina 00 ≈ 130 g<br />
                  1 bicchiere zucchero ≈ 200 g
                </div>
              </div>
            </details>
          </div>

          {/* 3. Allergeni - auto-rilevati */}
          <div style={cardStyle}>
            <PanelHead icon={<Icon name="warning" size={18} />} title="Allergeni presenti" color={C.amber}
              badge={<span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#E0F2FE", color: "#0369A1", textTransform: "uppercase", letterSpacing: "0.05em" }}>Auto</span>}
              sub="Calcolati automaticamente dagli ingredienti (Reg. UE 1169/2011). Aggiungi manualmente quelli mancanti se necessario." />

            {autoAllergeni.length === 0 ? (
              <div style={{ fontSize: 11, color: C.textSoft, padding: "10px 12px", background: "#FAF8F7", border: `1px dashed ${C.border}`, borderRadius: 8, marginBottom: 14 }}>
                Nessun allergene rilevato dagli ingredienti attuali. Verifica gli ingredienti o aggiungi manualmente sotto.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {autoAllergeni.map(aid => {
                  const a = ALLERGENI.find(x => x.id === aid);
                  if (!a) return null;
                  return (
                    <span key={aid} title="Rilevato automaticamente dagli ingredienti"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 20, background: `${ALLERGENE_COLORS[aid]}15`, color: ALLERGENE_COLORS[aid], border: `1.5px solid ${ALLERGENE_COLORS[aid]}55`, fontSize: 11, fontWeight: 700 }}>
                      <Icon name="check" size={11} />{a.label}
                    </span>
                  );
                })}
              </div>
            )}

            {(() => {
              const disponibili = ALLERGENI.filter(a => !autoAllergeni.includes(a.id));
              const manualSelezionati = (form.allergeniManual || []).filter(id => disponibili.some(a => a.id === id));
              const hasManual = manualSelezionati.length > 0;
              const isExpanded = showManualAllergeni || hasManual;
              if (disponibili.length === 0) {
                return (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, fontSize: 11, color: C.textSoft, fontStyle: "italic" }}>
                    Tutti gli allergeni UE sono gia' stati rilevati automaticamente.
                  </div>
                );
              }
              return (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  {/* Selezionati manualmente: sempre visibili come chip rimovibili */}
                  {hasManual && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {manualSelezionati.map(id => {
                        const a = ALLERGENI.find(x => x.id === id);
                        if (!a) return null;
                        return (
                          <button key={id} type="button" aria-label={`Rimuovi ${a.label} dagli allergeni manuali`}
                            onClick={() => setForm(f => ({ ...f, allergeniManual: (f.allergeniManual || []).filter(x => x !== id) }))}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: `${ALLERGENE_COLORS[id]}15`, color: ALLERGENE_COLORS[id], border: `1.5px solid ${ALLERGENE_COLORS[id]}55`, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            {a.label}
                            <Icon name="x" size={10} />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Toggle "Modifica manualmente" */}
                  {!isExpanded && (
                    <button type="button" onClick={() => setShowManualAllergeni(true)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#FFF", color: C.textMid, border: `1px dashed ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      <Icon name="plus" size={12} /> Modifica manualmente
                      <span style={{ fontSize: 10, color: C.textSoft, fontWeight: 500 }}>({disponibili.length} disponibili)</span>
                    </button>
                  )}

                  {/* Elenco checkbox: visibile solo se l'utente ha cliccato o ha selezioni esistenti */}
                  {isExpanded && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={fieldLabel}>{hasManual ? "Modifica selezione manuale" : "Seleziona allergeni aggiuntivi"}</div>
                        <button type="button" onClick={() => setShowManualAllergeni(false)}
                          style={{ background: "transparent", border: "none", color: C.textSoft, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "4px 8px", fontFamily: "inherit" }}>
                          Chiudi elenco
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 6 }}>
                        {disponibili.map(a => {
                          const sel = (form.allergeniManual || []).includes(a.id);
                          return (
                            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 7, cursor: "pointer", border: `1px solid ${sel ? ALLERGENE_COLORS[a.id] : "#E2D9D5"}`, background: sel ? `${ALLERGENE_COLORS[a.id]}10` : "#FDFAF8", transition: "all 0.15s" }}>
                              <input type="checkbox" checked={sel} style={{ display: "none" }}
                                onChange={() => setForm(f => ({ ...f, allergeniManual: sel ? (f.allergeniManual || []).filter(x => x !== a.id) : [...(f.allergeniManual || []), a.id] }))} />
                              <span style={{ fontSize: 11, fontWeight: sel ? 700 : 500, color: sel ? ALLERGENE_COLORS[a.id] : C.textMid }}>{a.label}</span>
                              {sel && <span style={{ marginLeft: "auto", color: ALLERGENE_COLORS[a.id], display: "inline-flex" }}><Icon name="check" size={12} /></span>}
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Overwrite conferma + Salva */}
          {overwriteConf && (
            <div style={{ padding: "14px 16px", background: C.amberLight, border: `2px solid ${C.amber}`, borderRadius: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.amber, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <Icon name="warning" size={14} /> "{overwriteConf}" esiste già - sovrascrivere?
              </div>
              <div style={{ fontSize: 11, color: C.textMid, marginBottom: 10 }}>La ricetta esistente verrà sostituita con i nuovi ingredienti e dati.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={doSaveRicetta} disabled={saving} style={{ padding: isMobile ? "12px 18px" : "9px 18px", minHeight: isMobile ? 44 : 'auto', background: C.amber, color: C.white, border: "none", borderRadius: 8, fontWeight: 800, fontSize: isMobile ? 13 : 12, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6, flex: isMobile ? '1 1 auto' : 'unset', justifyContent: 'center' }}>
                  <Icon name="checkCircle" size={14} /> {saving ? "Salvataggio…" : "Sì, sovrascrivi"}
                </button>
                <button onClick={() => setOverwriteConf(null)} disabled={saving} style={{ padding: isMobile ? "12px 14px" : "9px 14px", minHeight: isMobile ? 44 : 'auto', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, color: C.textMid, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, justifyContent: 'center' }}>
                  <Icon name="x" size={13} /> Annulla
                </button>
              </div>
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{ padding: isMobile ? "16px" : "14px", minHeight: isMobile ? 52 : 'auto', background: C.red, color: C.white, border: "none", borderRadius: 10, fontWeight: 900, fontSize: isMobile ? 15 : 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1, boxShadow: "0 2px 10px rgba(110,14,26,0.25)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <Icon name="save" size={16} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{saving ? "Salvataggio…" : (editMode ? `Salva modifiche a ${editMode}` : `Salva ${LEX.nuovaRicetta.toLowerCase()}`)}</span>
          </button>
        </div>

        {/* ── Anteprima redditività LIVE (destra) ──────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...cardStyle, position: isMobile ? "static" : "sticky", top: 20 }}>
            <PanelHead icon={<Icon name="barChart" size={18} />} title="Anteprima redditività" color={C.text} />

            {/* Semaforo */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: sem.bg, border: `1px solid ${sem.border}`, marginBottom: 14 }}>
              <span style={{ width: 38, height: 38, borderRadius: "50%", background: live.ricavo > 0 ? sem.color : C.border, color: C.white, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={sem.icon} size={20} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: sem.color, letterSpacing: "-0.01em" }}>{sem.label}</div>
                <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 1 }}>
                  {live.ricavo > 0 ? <>Food cost {fmtp(live.fcPct)} · obiettivo {targetPct}%</> : "Aggiungi ingredienti, unità e prezzo"}
                </div>
              </div>
            </div>

            {form.ingredienti.length === 0 ? (
              <div style={{ color: C.textSoft, fontSize: 11, textAlign: "center", padding: "12px 0 4px" }}>Aggiungi ingredienti per vedere il calcolo</div>
            ) : (
              // 4 righe perfettamente incolonnate: stessa altezza (44),
              // stessa fontSize per label (12) e value (15), grid 2col,
              // tutti tabular-nums. Niente prefissi +/-/= sulle label
              // (facevano shift di x), solo - sul VALORE di Food cost.
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { lbl: 'Ricavo',         val: fmt(live.ricavo),     c: C.green, bg: C.greenLight, brd: `${C.green}25` },
                  { lbl: 'Food cost',      val: `-${fmt(live.fc)}`,   c: C.red,   bg: C.redLight,   brd: `${C.red}20` },
                  { lbl: 'Margine lordo',  val: fmt(live.margine),    c: sem.color, bg: sem.bg, brd: sem.border, prominent: true },
                  { lbl: 'Margine %',      val: fmtp(live.margPct),   c: sem.color, bg: sem.bg, brd: sem.border },
                ].map((r, i) => (
                  <div key={i} style={{
                    padding: '11px 14px', background: r.bg, border: `1px solid ${r.brd}`, borderRadius: 8,
                    display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', minHeight: 44, columnGap: 12,
                  }}>
                    <span style={{ fontSize: 12, color: r.c, fontWeight: r.prominent ? 800 : 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{r.lbl}</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: r.c, ...TNUM, whiteSpace: 'nowrap', textAlign: 'right' }}>{r.val}</span>
                  </div>
                ))}
                {/* Per unità: nota piccola sotto */}
                <div style={{ fontSize: 10.5, color: C.textSoft, lineHeight: 1.5, display: "flex", alignItems: "center", gap: 6, marginTop: 2, padding: '0 4px' }}>
                  <Icon name="bulb" size={12} /> Per unità: FC {fmt(live.fcUnit)} · Margine {fmt(form.unita > 0 ? live.margine / form.unita : 0)}
                </div>
                {live.mancanti.length > 0 && (
                  <div style={{ fontSize: 10.5, color: C.amber, background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="warning" size={12} /></span>
                    <span>Food cost sottostimato: manca il prezzo di {live.mancanti.join(", ")}. Caricalo nel listino prezzi.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prezzo minimo per centrare il food cost obiettivo.
              Rinominato 26/06: era "Prezzo consigliato" ma poteva suggerire
              di abbassare il prezzo (= ricavo minore). Ora è chiaro che è il
              prezzo MINIMO sotto cui il food cost % sfora il target; sopra
              quel prezzo si guadagna di più, mai consigliato abbassarlo. */}
          {!isSemiOrInterno && (
            <div style={cardStyle}>
              <PanelHead icon={<Icon name="money" size={18} />} title="Prezzo minimo per il target" color={C.red} sub="prezzo minimo che mantiene il food cost dentro l'obiettivo. Sopra, guadagni di più." />

              {/* Target food cost selector */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...fieldLabel, marginBottom: 7 }}>Food cost obiettivo</div>
                <div style={{ display: "flex", gap: 3, padding: 3, background: C.bgSubtle, borderRadius: R.md }}>
                  {[25, 28, 30, 33, 35].map(t => (
                    <button key={t} onClick={() => setTargetPct(t)}
                      style={{ flex: 1, padding: isMobile ? "10px 4px" : "6px 4px", minHeight: isMobile ? 40 : 'auto', borderRadius: R.sm, border: "none", cursor: "pointer", fontSize: isMobile ? 13 : 12, fontWeight: targetPct === t ? 700 : 500, ...TNUM, background: targetPct === t ? C.bgCard : "transparent", color: targetPct === t ? C.red : C.textSoft, boxShadow: targetPct === t ? "0 1px 2px rgba(15,23,42,0.08)" : "none" }}>{t}%</button>
                  ))}
                </div>
              </div>

              {live.ricavo > 0 || live.fc > 0 ? (
                <>
                  <div style={{ textAlign: "center", padding: "8px 0 12px" }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: C.text, letterSpacing: "-0.03em", ...TNUM }}>{fmt(live.prezzoConsigliato)}</div>
                    <div style={{ fontSize: 10.5, color: C.textSoft, marginTop: 2 }}>prezzo minimo per {form.tipo === "pezzo" ? "pezzo" : "fetta/porzione"} · food cost al {targetPct}%</div>
                  </div>
                  {/* Messaggio: alzare se sotto, OK se sopra/in linea. MAI suggerire di scendere. */}
                  {live.deltaPrezzo > 0.01 ? (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.amberLight, border: `1px solid ${C.amber}40`, fontSize: 11, color: C.amber, fontWeight: 600, lineHeight: 1.5 }}>
                      Il prezzo attuale ({fmt(form.prezzo)}) è sotto il minimo: per centrare il food cost al {targetPct}% serve alzare di <b>{fmt(live.deltaPrezzo)}</b>.
                    </div>
                  ) : Math.abs(live.deltaPrezzo) < 0.01 ? (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.greenLight, border: `1px solid ${C.green}40`, fontSize: 11, color: C.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="checkCircle" size={14} /> Il prezzo attuale è in linea col target del {targetPct}%.
                    </div>
                  ) : (
                    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.greenLight, border: `1px solid ${C.green}40`, fontSize: 11, color: C.green, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="checkCircle" size={14} /> Sei sopra il minimo: stai guadagnando più del target del {targetPct}%.
                    </div>
                  )}
                  {/* Bottone "Imposta come prezzo" mostrato SOLO se il prezzo attuale è
                      SOTTO il minimo (alzare). Se sei già sopra, niente bottone:
                      non vogliamo nemmeno offrire l'opzione di abbassare. */}
                  {live.deltaPrezzo > 0.01 && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, prezzo: live.prezzoConsigliato }))}
                      style={{ marginTop: 10, width: "100%", padding: isMobile ? "13px" : "9px", minHeight: isMobile ? 44 : 'auto', background: C.white, color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Icon name="check" size={14} /> Alza al minimo target
                    </button>
                  )}
                </>
              ) : (
                <div style={{ color: C.textSoft, fontSize: 11, textAlign: "center", padding: "8px 0" }}>Aggiungi ingredienti con prezzo per il calcolo</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Modal "Imposta prezzo ingrediente" - aperto dai badge "prezzo mancante" */}
    {priceModal && (
      <div role="dialog" aria-modal="true" aria-labelledby="prezzo-ing-titolo"
        onClick={(e) => { if (e.target === e.currentTarget && !priceModal.saving) setPriceModal(null); }}
        style={{ position: "fixed", inset: 0, background: "rgba(28,10,10,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: C.bgCard, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxWidth: 420, width: "100%", padding: isMobile ? 20 : 24 }}>
          <div id="prezzo-ing-titolo" style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: "-0.01em" }}>
            Imposta prezzo di questo ingrediente
          </div>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>{priceModal.nome}</strong> non ha ancora un prezzo nel tuo listino.
            Inserisci il prezzo <strong>al chilo</strong> (€/kg) e verra' usato in tutte le ricette.
          </div>
          <div style={fieldLabel}>Prezzo € / kg</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18 }}>
            <input type="text" inputMode="decimal" value={priceModal.costoKg} autoFocus
              onChange={(e) => setPriceModal(m => m ? { ...m, costoKg: e.target.value } : m)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSavePrezzoIng(); if (e.key === "Escape") setPriceModal(null); }}
              placeholder="es. 8,50"
              aria-label="Prezzo al chilo in euro"
              style={{ ...inputBase, flex: 1, fontSize: 16, padding: "11px 12px" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textMid, whiteSpace: "nowrap" }}>€ / kg</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column-reverse" : "row", justifyContent: "flex-end" }}>
            <button onClick={() => setPriceModal(null)} disabled={priceModal.saving}
              style={{ padding: "10px 16px", minHeight: 42, background: "transparent", color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: priceModal.saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              Annulla
            </button>
            <button onClick={handleSavePrezzoIng} disabled={priceModal.saving || !String(priceModal.costoKg || "").trim()}
              style={{ padding: "10px 16px", minHeight: 42, background: priceModal.saving ? "#CBD5E1" : C.red, color: C.white, border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: priceModal.saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {priceModal.saving ? "Salvo…" : "Salva prezzo"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── ActionChip: chip compatto per la toolbar azioni secondarie in cima ──
// Le azioni "shortcut" (foto/modifica/elimina) usano queste chip: quando
// attivo il chip prende il colore dell'azione e mostra un chevron in giu';
// altrimenti resta neutro con icona colorata. Toggle open/close.
function ActionChip({ icon, label, sub, active, onClick, color, isMobile }) {
  const border = active ? color : 'rgba(15,23,42,0.10)'
  const bg = active ? `${color}0F` : '#FFF'
  return (
    <button type="button" onClick={onClick} aria-expanded={!!active}
      style={{
        padding: isMobile ? '11px 14px' : '13px 16px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: 'inherit',
        color: active ? color : C.text,
        transition: 'all 0.15s ease',
        flex: isMobile ? '1 1 100%' : '0 0 auto',
        minWidth: 0,
        boxShadow: active ? `0 4px 12px ${color}22` : 'none',
      }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 8,
        background: active ? color : `${color}15`,
        color: active ? '#FFF' : color,
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, textAlign: 'left' }}>
        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
        {sub && <span style={{ fontSize: 10.5, color: active ? color : C.textSoft, fontWeight: 500, marginTop: 2, opacity: active ? 0.8 : 1 }}>{sub}</span>}
      </span>
      <Icon name="chevDown" size={12} color={active ? color : C.textSoft} />
    </button>
  )
}

// ─── RicettaPicker: pulsante che apre dropdown con ricerca interna ──────
// Pattern futuristic-elegant: pulsante con icona + label + caret. Click apre
// un floating panel con barra di ricerca in cima + lista scrollabile delle
// ricette filtrate. Click outside o ESC chiude. Selezione → onSelect + close.
function RicettaPicker({ label, icon, variant = 'primary', ricette, activeNome, onSelect, isMobile }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    setTimeout(() => inputRef.current?.focus(), 30)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim()
    if (!s) return ricette
    return ricette.filter(n => n.toLowerCase().includes(s))
  }, [q, ricette])

  const isDelete = variant === 'danger'
  const accent = isDelete ? C.red : T.brand
  const accentLight = isDelete ? C.redLight : T.brandLight

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} type="button"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: isMobile ? '11px 16px' : '9px 16px',
          minHeight: isMobile ? 42 : 'auto',
          background: open ? accentLight : (isDelete ? 'transparent' : accent),
          color: open ? accent : (isDelete ? accent : '#FFF'),
          border: `1px solid ${isDelete ? `${accent}40` : accent}`,
          borderRadius: 10,
          fontSize: isMobile ? 13 : 12.5, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.01em',
          boxShadow: open ? 'none' : (isDelete ? 'none' : `0 6px 16px ${accent}28`),
          transition: `background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}, box-shadow ${M.durFast} ${M.ease}`,
          whiteSpace: 'nowrap',
        }}>
        {icon}
        <span>{label}</span>
        {activeNome && !open && (
          <span style={{ marginLeft: 4, padding: '2px 8px', background: isDelete ? 'transparent' : 'rgba(255,255,255,0.18)', color: isDelete ? accent : '#FFF', borderRadius: 6, fontSize: 11, fontWeight: 600, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeNome}
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0,
          width: isMobile ? 280 : 340,
          maxWidth: 'calc(100vw - 32px)',
          background: '#FFF',
          border: `1px solid ${accent}30`,
          borderRadius: 12,
          boxShadow: '0 18px 48px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.04) inset',
          overflow: 'hidden',
          zIndex: 1000,
          animation: '_fos_ricdrop_in 180ms cubic-bezier(.32,.72,0,1)',
        }}>
          <style>{`
            @keyframes _fos_ricdrop_in {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {/* Accent bar futuristic in cima */}
          <div aria-hidden="true" style={{
            height: 2,
            background: isDelete
              ? `linear-gradient(90deg, ${C.red} 0%, #FFB350 50%, ${C.red} 100%)`
              : 'linear-gradient(90deg, #E84B3A 0%, #FFB350 50%, #6E0E1A 100%)',
          }}/>
          {/* Search bar */}
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ position: 'relative' }}>
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                placeholder="Cerca ricetta…"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px',
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: isMobile ? 16 : 13, color: C.text,
                  background: '#FAFAFA', outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}/>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textSoft} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>
          {/* Lista risultati */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: C.textSoft }}>
                Nessuna ricetta trovata
              </div>
            ) : filtered.map(n => {
              const active = activeNome === n
              return (
                <button key={n} onClick={() => { onSelect(n); setOpen(false); setQ('') }} type="button"
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '11px 14px',
                    background: active ? accentLight : 'transparent',
                    color: active ? accent : C.text,
                    border: 'none', borderLeft: active ? `3px solid ${accent}` : '3px solid transparent',
                    fontSize: 13, fontWeight: active ? 800 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: `background ${M.durFast} ${M.ease}`,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.bgSubtle || '#F5F1EE' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RicettaPickerDelete: dropdown delete con doppio check ───────────────
// Step 1: scegli ricetta dalla lista filtrata. Step 2: scrivi "ELIMINA"
// nell'input per confermare. Step 3: bottone Conferma elimina diventa attivo
// solo con la parola esatta.
function RicettaPickerDelete({ ricette, deleteConf, setDeleteConf, deletePin, setDeletePin, onConfirm, isMobile }) {
  const handleSelect = (nome) => {
    setDeleteConf(nome)
    setDeletePin('')
  }
  return (
    <>
      <RicettaPicker
        label="Elimina ricetta"
        icon={<Icon name="trash" size={14} />}
        variant="danger"
        ricette={ricette}
        activeNome={deleteConf || null}
        onSelect={handleSelect}
        isMobile={isMobile}
      />
      {/* Modal-like confirmation panel: appare sotto i bottoni quando una
          ricetta è stata scelta. Scrivi ELIMINA per attivare la conferma. */}
      {deleteConf && (
        <div style={{
          flexBasis: '100%', width: '100%',
          marginTop: 4,
          background: 'linear-gradient(180deg, #FFF5F5 0%, #FFE9E9 100%)',
          border: `1px solid ${C.red}35`,
          borderRadius: 12,
          padding: '14px 16px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 12px rgba(204,0,0,0.06)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${C.red} 0%, #FFB350 50%, ${C.red} 100%)`, opacity: 0.7 }}/>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.red, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={14} /> Stai per eliminare <b style={{ fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{deleteConf}</b>
          </div>
          <div style={{ fontSize: 11.5, color: C.textSoft, marginBottom: 10, lineHeight: 1.5 }}>
            L'operazione è permanente. Scrivi <b style={{ color: C.red, letterSpacing: '0.05em' }}>ELIMINA</b> in maiuscolo per attivare il pulsante di conferma.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
            <input value={deletePin} onChange={e => setDeletePin(e.target.value)} placeholder="ELIMINA"
              autoFocus
              style={{
                flex: 1, minWidth: 140,
                padding: '11px 14px',
                borderRadius: 8,
                border: `2px solid ${deletePin === 'ELIMINA' ? C.red : '#E5C7C7'}`,
                fontSize: 16, fontWeight: 800,
                color: C.red, letterSpacing: '0.1em',
                textAlign: 'center',
                outline: 'none', background: '#FFF',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => onConfirm(deleteConf)} disabled={deletePin !== 'ELIMINA'}
                style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '11px 22px', minHeight: 44,
                  background: deletePin === 'ELIMINA' ? `linear-gradient(135deg, ${C.red} 0%, #8B0000 100%)` : '#E8DEDE',
                  color: deletePin === 'ELIMINA' ? '#FFF' : C.textSoft,
                  border: 'none', borderRadius: 8,
                  fontSize: 13, fontWeight: 800, letterSpacing: '0.02em',
                  cursor: deletePin === 'ELIMINA' ? 'pointer' : 'not-allowed',
                  boxShadow: deletePin === 'ELIMINA' ? `0 6px 16px ${C.red}40` : 'none',
                  transition: `background ${M.durFast} ${M.ease}, box-shadow ${M.durFast} ${M.ease}`,
                }}>
                Conferma elimina
              </button>
              <button type="button" onClick={() => { setDeleteConf(null); setDeletePin('') }}
                style={{
                  flex: isMobile ? 1 : 'unset',
                  padding: '11px 18px', minHeight: 44,
                  background: 'transparent', color: C.textMid,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
