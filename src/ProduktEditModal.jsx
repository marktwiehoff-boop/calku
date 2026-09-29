// Rezept anlegen/bearbeiten. Aus App.jsx ausgelagert (28.09.2026).
import { useState } from "react";
import { BOWL_GROESSEN, BOWL_VARIANTE, BOWL_VARIANTEN, DEFAULT_UNTERGRUPPE, EINHEIT, EINHEITEN, MWST_GETRAENK, MWST_SPEISEN, SUBGROUPS_BY_GRUPPE, WARENGRUPPEN, ampelFarbe, berechne, bowlGroesse, bowlVarianten, fmtEUR, fmtNum2, fmtPct, istStueck, istStueckArtikel, mitEinheit, mitMenge, mitPreis, mwstSatz, normalisiereZutat, stueckgewicht, stueckpreis, zutatEinheit, zutatMenge, zutatPreisAnzeige } from "./kalkulation.js";
import { findeZutat } from "./zutaten.js";
import { frage, hinweis } from "./ui/dialog.jsx";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { ARTIKELARTEN, artikelartVon } from "./artikelart.js";
// ============================================================
//  IMPORT-MODAL (CSV-Preisliste)
// ============================================================
// ============================================================
//  EDIT-MODAL pro Produkt (Name, Warengruppe, Zutaten, VK, Verpackung)
// ============================================================
export function leeresProdukt(gruppe, kampagne = null, start = null, ende = null) {
  return {
    id: `neu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    gruppe: gruppe || "Smoothies",
    untergruppe: null,
    kampagne: gruppe === "Kampagnen" ? (kampagne || null) : null,
    zutaten: [],
    verpackung_eur: 0.18,
    vk_in_brutto: 0,
    vk_out_brutto: 0,
    kampagne_start: start,
    kampagne_ende: ende,
    artikelart: null,
  };
}

export function ProduktEditModal({ open, produkt, priceList, bowlBasis, zutaten = [], onNeueZutat, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(produkt);

  // Form-State bei Wechsel des Produkts neu initialisieren
  const produktKey = produkt?.id || "neu";
  const [lastKey, setLastKey] = useState(produktKey);
  if (produktKey !== lastKey) {
    setForm(produkt);
    setLastKey(produktKey);
  }

  if (!open || !form) return null;

  const priceEntries = Object.values(priceList || {});
  const setF = (patch) => setForm({ ...form, ...patch });

  // Ganze Zeile ersetzen (nicht mischen) - Einheitswechsel raeumt Felder ab.
  const replaceZutat = (idx, zeile) => {
    setForm({ ...form, zutaten: form.zutaten.map((z, i) => (i === idx ? zeile : z)) });
  };

  const handleNameChange = (idx, name) => {
    // Wenn der eingegebene Name exakt einer Preisliste-Zutat entspricht, übernehme Preis automatisch
    const treffer = priceList[name.toLowerCase()];
    let next = { ...form.zutaten[idx], name };
    if (treffer) {
      next.lieferant = "Transgourmet";
      // Artikel-Eigenschaften aus der Preisliste mitnehmen (zentral gepflegt)
      next.ausbeute_prozent = treffer.ausbeute_prozent ?? null;
      if (istStueckArtikel(treffer)) {
        // Stück-Artikel (Eier, Wraps): die Zeile rechnet in Stück mit Stückpreis
        next = mitEinheit(next, "stk", treffer);
        next.gramm_je_stueck = stueckgewicht(treffer) || next.gramm_je_stueck || null;
        const sp = stueckpreis(treffer);
        if (sp != null) next.preis_je_stueck = sp;
      } else {
        if (istStueck(next)) next = mitEinheit(next, "g", treffer);
        next.gramm_je_stueck = null;
        if (treffer.price_per_gram_ml != null) next.preis_pro_g = treffer.price_per_gram_ml;
      }
    }
    // Zutatenstamm (Stufe 1): Name oder Alias trifft eine Zutat -> Referenz setzen, Stammwerte
    // (Stueck, Stueckgewicht, Ausbeute) uebernehmen, wo die Preisliste nichts geliefert hat.
    const stammTreffer = findeZutat(zutaten, { name });
    if (stammTreffer) {
      next.zutat_id = stammTreffer.id;
      if (!treffer) {
        if (stammTreffer.einheit === "stk" && stammTreffer.stueck_gramm > 0 && !istStueck(next)) {
          next = mitEinheit(next, "stk", null);
          next.gramm_je_stueck = stammTreffer.stueck_gramm;
        }
        if (stammTreffer.ausbeute_prozent != null) next.ausbeute_prozent = stammTreffer.ausbeute_prozent;
      }
    } else {
      delete next.zutat_id;
    }
    replaceZutat(idx, normalisiereZutat(next));
  };

  const handleMengeChange = (idx, menge) => replaceZutat(idx, mitMenge(form.zutaten[idx], menge));
  const handlePreisChange = (idx, preis) => replaceZutat(idx, mitPreis(form.zutaten[idx], preis));
  const handleEinheitChange = (idx, einheit) => {
    const z = form.zutaten[idx];
    replaceZutat(idx, mitEinheit(z, einheit, priceList[(z.name || "").toLowerCase()]));
  };
  const handleGewichtChange = (idx, g) =>
    replaceZutat(idx, normalisiereZutat({ ...form.zutaten[idx], gramm_je_stueck: Math.max(0, +g || 0) || null }));

  // Bowls: angebotene Basen und Groesse
  const varianten = form.gruppe === "Bowls" ? (bowlVarianten(form, bowlBasis) || []) : [];
  const toggleVariante = (key) => {
    let neu = varianten.includes(key) ? varianten.filter(k => k !== key) : [...varianten, key];
    if (!neu.length) return;                                                   // mindestens eine
    neu = BOWL_VARIANTEN.map(v => v.key).filter(k => neu.includes(k));         // feste Reihenfolge
    const einzel = neu.length === 1 ? BOWL_VARIANTE[neu[0]] : null;
    setF({ varianten: neu, untergruppe: einzel ? einzel.untergruppe : null });
  };
  const setVkVariante = (key, wert) => {
    const vkv = { ...(form.vk_varianten || {}) };
    const v = Math.max(0, +wert || 0);
    if (wert === "" || v <= 0) delete vkv[key]; else vkv[key] = { vk_in_brutto: v, vk_out_brutto: v };
    setF({ vk_varianten: Object.keys(vkv).length ? vkv : undefined });
  };

  const addZutat = () => {
    setForm({
      ...form,
      zutaten: [...form.zutaten, { name: "", menge_g: 0, lieferant: "Transgourmet",
                                   preis_pro_g: 0, cost: 0,
                                   ausbeute_prozent: null, gramm_je_stueck: null }],
    });
  };

  const removeZutat = (idx) => {
    setForm({ ...form, zutaten: form.zutaten.filter((_, i) => i !== idx) });
  };

  const calc = berechne(form);
  const aOut = ampelFarbe(calc.we_out, form.gruppe);
  const istNeu = !produkt?.name || produkt.id === form.id && produkt.name === "";

  const handleSave = () => {
    if (!form.name.trim()) { hinweis("Bitte einen Produktnamen eingeben."); return; }
    onSave({ ...form, zutaten: (form.zutaten || []).map(normalisiereZutat) });
    onClose();
  };

  const handleDelete = async () => {
    if (!(await frage({ titel: "Rezept löschen", text: `„${form.name}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`, ja: "Löschen", gefahr: true }))) return;
    onDelete(form.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Pencil className="text-emerald-600" size={20} />
            {istNeu ? "Neues Rezept anlegen" : `Rezept bearbeiten: ${produkt.name}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Stammdaten */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-xs font-medium text-gray-600 flex flex-col md:col-span-2">
              Produktname
              <input type="text" value={form.name} onChange={e => setF({ name: e.target.value })}
                placeholder="z. B. Acai Classic Bowl"
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white" />
            </label>
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Warengruppe
              <select value={form.gruppe} onChange={e => setF({ gruppe: e.target.value, untergruppe: SUBGROUPS_BY_GRUPPE[e.target.value] ? form.untergruppe : null })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                {WARENGRUPPEN.map(g => <option key={g} value={g}>{g}</option>)}
                <option value="Archiv">Archiv</option>
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Artikelart
              <select value={artikelartVon(form) || ""} onChange={e => setF({ artikelart: e.target.value || null })}
                className={`mt-1 border rounded px-3 py-2 text-sm bg-white ${artikelartVon(form) ? "border-gray-200" : "border-amber-400"}`}>
                <option value="">— bitte wählen —</option>
                {ARTIKELARTEN.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
              <span className="text-[11px] text-gray-400 mt-1 font-normal">Pflichtartikel führt jede Filiale, Zusatzartikel ist optional.</span>
            </label>
          </div>

          {form.gruppe === "Bowls" ? (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs font-medium text-gray-600 flex flex-col">
                  Größe
                  <select value={bowlGroesse(form)} onChange={e => setF({ groesse: e.target.value })}
                    className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                    {BOWL_GROESSEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <span className="text-[11px] text-gray-400 mt-1 font-normal">Bestimmt die Basismengen (Kartoffeln 230 g normal / 155 g klein usw.).</span>
                </label>
                <div className="md:col-span-2 text-xs font-medium text-gray-600">
                  Angeboten als
                  <div className="mt-1 flex flex-wrap gap-2">
                    {BOWL_VARIANTEN.map(v => (
                      <label key={v.key} className="inline-flex items-center gap-1.5 font-normal text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={varianten.includes(v.key)} onChange={() => toggleVariante(v.key)} /> {v.label}
                      </label>
                    ))}
                  </div>
                  <span className="block text-[11px] text-gray-400 mt-1 font-normal">
                    {varianten.length > 1
                      ? "Basis wählbar: das Rezept unten ist die Salatbowl. Kartoffel- und Reisbowl entstehen daraus mit der zentralen Basis-Rezeptur (Bowls-Tab) — nichts doppelt pflegen."
                      : "Eine Variante: das Rezept unten ist komplett, inklusive Basis."}
                  </span>
                </div>
              </div>
              {varianten.length > 1 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <span className="text-xs text-gray-600 md:col-span-2">VK je Variante (brutto, optional) — leer = wie der VK des Rezepts</span>
                  {varianten.filter(k => k !== "salat").map(k => (
                    <label key={k} className="text-xs font-medium text-gray-600 flex flex-col">
                      {BOWL_VARIANTE[k].label}
                      <input type="number" step="0.05" min="0" placeholder={form.vk_out_brutto ? String(form.vk_out_brutto) : "wie oben"}
                        value={form.vk_varianten?.[k]?.vk_out_brutto ?? ""}
                        onChange={e => setVkVariante(k, e.target.value)}
                        className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : SUBGROUPS_BY_GRUPPE[form.gruppe] && (
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Untergruppe
              <select value={form.untergruppe || DEFAULT_UNTERGRUPPE[form.gruppe] || ""} onChange={e => setF({ untergruppe: e.target.value || null })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white w-full md:w-1/3">
                {!DEFAULT_UNTERGRUPPE[form.gruppe] && <option value="">— keine —</option>}
                {SUBGROUPS_BY_GRUPPE[form.gruppe].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}

          {form.gruppe === "Kampagnen" && (
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Kampagne (Oberbegriff)
              <input type="text" value={form.kampagne || ""} onChange={e => setF({ kampagne: e.target.value || null })}
                placeholder="z. B. Sommerkampagne"
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white w-full md:w-1/2" />
              <span className="text-[11px] text-gray-400 mt-1">Artikel mit gleichem Oberbegriff werden zu einer Kampagne gebündelt.</span>
            </label>
          )}

          {form.gruppe === "Kampagnen" && (
            <div className="grid grid-cols-2 gap-3 md:w-1/2">
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                Kampagnen-Start
                <input type="date" value={form.kampagne_start || ""} onChange={e => setF({ kampagne_start: e.target.value || null })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white" />
              </label>
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                Kampagnen-Ende
                <input type="date" value={form.kampagne_ende || ""} onChange={e => setF({ kampagne_ende: e.target.value || null })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white" />
              </label>
            </div>
          )}

          {/* Verkaufspreise */}
          <div className="bg-gray-50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Verkaufspreise (brutto)</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                VK IN (Im Haus)
                <input type="number" step="0.10" min="0" value={form.vk_in_brutto}
                  onChange={e => setF({ vk_in_brutto: Math.max(0, +e.target.value || 0) })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
              </label>
              <label className="text-xs font-medium text-gray-600 flex flex-col">
                VK OUT (Außer Haus)
                <input type="number" step="0.10" min="0" value={form.vk_out_brutto}
                  onChange={e => setF({ vk_out_brutto: Math.max(0, +e.target.value || 0) })}
                  className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
              </label>
            </div>
            <label className="text-xs font-medium text-gray-600 flex flex-col mt-3">
              MwSt.-Satz
              <select value={mwstSatz(form)}
                onChange={e => setF({ mwst_satz: +e.target.value })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white">
                <option value={MWST_SPEISEN}>7 % — Speisen, Açaí, Smoothies, Frozen Yoghurt</option>
                <option value={MWST_GETRAENK}>19 % — übrige Getränke</option>
              </select>
              <span className="mt-1 text-[11px] text-gray-400 font-normal">
                Gilt im Haus wie außer Haus. Vorgabe kommt aus der Warengruppe.
              </span>
            </label>
          </div>

          {/* Zutaten */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Zutaten ({form.zutaten.length})</h4>
              <button onClick={addZutat}
                className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-2.5 py-1.5 rounded hover:bg-emerald-700">
                <Plus size={12} /> Zutat hinzufügen
              </button>
            </div>
            <datalist id="zutat-liste">
              {/* Zutatenstamm zuerst (Stufe 1), dann Artikel der Preisliste, die keine Zutat treffen */}
              {zutaten.map(z => (
                <option key={`z-${z.id}`} value={z.name}>
                  {`Stamm${z.arbeitseinheit?.name ? ` · ${z.arbeitseinheit.name}` : ""}${z.artikel_nr ? ` · TG ${z.artikel_nr}` : ""}`}
                </option>
              ))}
              {priceEntries.filter(p => !findeZutat(zutaten, { name: p.ingredient_name })).map(p => (
                <option key={p.ingredient_name} value={p.ingredient_name}>
                  {istStueckArtikel(p) && stueckpreis(p) != null
                    ? `${fmtNum2(stueckpreis(p))} €/Stk`
                    : `${((p.price_per_gram_ml || 0) * 1000).toFixed(2)} €/kg`}
                </option>
              ))}
            </datalist>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Zutat (aus Preisliste wählen)</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20">Menge</th>
                    <th className="text-left px-2 py-1.5 font-medium w-16">Einheit</th>
                    <th className="text-right px-2 py-1.5 font-medium w-32">Preis</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20" title="Gramm je Stück — Gramm-Äquivalent für Bestellvorschlag und Bons">g/Stk</th>
                    <th className="text-right px-2 py-1.5 font-medium w-20">Kosten</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.zutaten.length === 0 && (
                    <tr><td colSpan={7} className="px-2 py-4 text-center text-gray-400">Noch keine Zutaten. Klick auf „Zutat hinzufügen".</td></tr>
                  )}
                  {form.zutaten.map((z, i) => {
                    const e = EINHEIT[zutatEinheit(z)];
                    const stk = istStueck(z);
                    return (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">
                        <input list="zutat-liste" type="text" value={z.name}
                          onChange={ev => handleNameChange(i, ev.target.value)}
                          placeholder="Tippen oder aus Liste wählen…"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white" />
                        {zutaten.length > 0 && (z.zutat_id
                          ? <span className="text-[10px] text-green-700">✓ Stamm</span>
                          : (z.name || "").trim() && onNeueZutat && (
                            <button type="button" className="text-[10px] text-amber-700 hover:underline"
                              title="Diesen Namen als Zutat im Stamm anlegen (Tab Zutaten)"
                              onClick={() => { const id = onNeueZutat(z.name); if (id) replaceZutat(i, { ...z, zutat_id: id }); }}>
                              nicht im Stamm — anlegen
                            </button>
                          ))}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input type="number" step="1" min="0" value={zutatMenge(z)}
                          onChange={ev => handleMengeChange(i, ev.target.value)}
                          className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={zutatEinheit(z)} onChange={ev => handleEinheitChange(i, ev.target.value)}
                          className="border border-gray-200 rounded px-1 py-1 text-xs bg-white" title="g, ml oder Stück (Ei, Wrap: Stück mit Stückpreis)">
                          {EINHEITEN.map(u => <option key={u.key} value={u.key}>{u.menge}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="inline-flex items-center gap-1">
                          <input type="number" step="0.01" min="0" value={+zutatPreisAnzeige(z).toFixed(2)}
                            onChange={ev => handlePreisChange(i, ev.target.value)}
                            className="w-20 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white" />
                          <span className="text-gray-400 w-9 text-left">{e.preis}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {stk ? (
                          <input type="number" step="1" min="0" value={z.gramm_je_stueck || ""} placeholder="g"
                            onChange={ev => handleGewichtChange(i, ev.target.value)}
                            title="Gramm je Stück — ohne diesen Wert fehlt die Zutat im Bestellvorschlag (Gramm-Äquivalent)"
                            className={`w-16 border rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white ${(+z.gramm_je_stueck > 0) ? "border-gray-200" : "border-amber-400"}`} />
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-700"
                          title={z.ausbeute_prozent && z.ausbeute_prozent < 100
                            ? `inkl. Ausbeute ${z.ausbeute_prozent} % (Pflege im Tab Einkaufspreise)` : undefined}>
                        {fmtEUR(z.cost)}{z.ausbeute_prozent && z.ausbeute_prozent < 100 ? "*" : ""}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button onClick={() => removeZutat(i)}
                          className="text-gray-400 hover:text-red-600 p-1" title="Zutat entfernen">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Tipp: Beim Wählen einer Zutat aus der Liste wird der Preis automatisch übernommen. Du kannst Preis und Menge danach noch anpassen.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Stück-Zutaten (Ei, Wrap): Einheit „Stk“ und Preis je Stück. „g/Stk“ ist das Gramm-Äquivalent für Bestellvorschlag und Bons (Ei: 50 g).
              Ausbeute wird zentral im Tab „Einkaufspreise" gepflegt und wirkt hier automatisch (Kosten mit * sind inkl. Ausbeute).
            </p>
          </div>

          {/* Verpackung + Ergebnis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs font-medium text-gray-600 flex flex-col">
              Verpackung (€)
              <input type="number" step="0.01" min="0" value={+form.verpackung_eur.toFixed(2)}
                onChange={e => setF({ verpackung_eur: Math.max(0, +e.target.value || 0) })}
                className="mt-1 border border-gray-200 rounded px-3 py-2 text-sm bg-white tabular-nums" />
            </label>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Wareneinsatz OUT</div>
              <div className="text-lg font-bold tabular-nums">{fmtEUR(calc.wareneinsatz)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 border ${aOut.bg} ${aOut.border}`}>
              <div className={`text-xs uppercase tracking-wide ${aOut.text}`}>WE % OUT · DB OUT</div>
              <div className={`text-lg font-bold tabular-nums ${aOut.text}`}>
                {fmtPct(calc.we_out)} · {fmtEUR(calc.db_out)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 flex justify-between items-center sticky bottom-0 bg-white">
          <div>
            {!istNeu && (
              <button onClick={handleDelete}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 px-3 py-2 hover:bg-red-50 rounded">
                <Trash2 size={14} /> Rezept löschen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
            <button onClick={handleSave}
              className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">
              {istNeu ? "Anlegen" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

