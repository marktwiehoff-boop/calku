import React, { useRef, useState } from "react";
import { standardVorlage, aufloeseVorlage } from "./bon.js";

const PLATZHALTER = [
  { tag: "{produkt}",     hilfe: "Produktname" },
  { tag: "{gruppe}",      hilfe: "Warengruppe" },
  { tag: "{untergruppe}", hilfe: "Untergruppe, z. B. Salatbowls" },
  { tag: "{vk}",          hilfe: "Verkaufspreis brutto" },
  { tag: "{zutaten}",     hilfe: "Zutatenliste mit Mengen" },
  { tag: "{schritte}",    hilfe: "Arbeitsschritte, nummeriert" },
  { tag: "{hinweise}",    hilfe: "Hinweise, mit ! markiert" },
];

// Kopfbereich des Bon-Reiters: eine Vorlage je Warengruppe, sonst Standard.
export default function BonVorlagenEditor({ warengruppen, vorlagen, onChange, canEdit }) {
  const [offen, setOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState("_default");
  const areaRef = useRef(null);

  const eigen    = vorlagen?.[gewaehlt];
  const hatEigen = gewaehlt === "_default" || (typeof eigen === "string" && eigen.trim().length > 0);
  const wert     = gewaehlt === "_default"
    ? standardVorlage(vorlagen)
    : (hatEigen ? eigen : aufloeseVorlage(gewaehlt, vorlagen));

  const setzeVorlage = (text) => onChange({ ...(vorlagen || {}), [gewaehlt]: text });

  const platzhalterEinfuegen = (tag) => {
    const el = areaRef.current;
    if (!el || !canEdit || !hatEigen) return;
    const s = el.selectionStart ?? wert.length;
    const e = el.selectionEnd ?? wert.length;
    setzeVorlage(wert.slice(0, s) + tag + wert.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); });
  };

  const eintraege = [{ id: "_default", label: "Standard" }, ...warengruppen.map(g => ({ id: g, label: g }))];

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <button onClick={() => setOffen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-gray-700">
          Bon-Vorlagen{" "}
          <span className="font-normal text-gray-400">
            ({eintraege.filter(e => e.id !== "_default" && vorlagen?.[e.id]?.trim()).length} Warengruppen abweichend)
          </span>
        </span>
        <span className="text-xs text-gray-400">{offen ? "zuklappen" : "aufklappen"}</span>
      </button>

      {offen && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <div className="flex gap-1 flex-wrap mb-3">
            {eintraege.map(e => {
              const abweichend = e.id !== "_default" && typeof vorlagen?.[e.id] === "string" && vorlagen[e.id].trim();
              return (
                <button key={e.id} onClick={() => setGewaehlt(e.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    gewaehlt === e.id
                      ? "bg-green-700 text-white border-green-700"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}>
                  {e.label}{abweichend ? " ●" : ""}
                </button>
              );
            })}
          </div>

          {!hatEigen && (
            <div className="flex items-center justify-between gap-3 mb-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
              <span className="text-xs text-gray-500">
                {`Diese Warengruppe nutzt die Standardvorlage.`}
              </span>
              {canEdit && (
                <button onClick={() => setzeVorlage(wert)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800">
                  Eigene Vorlage anlegen
                </button>
              )}
            </div>
          )}

          <div className="flex gap-1 flex-wrap mb-2">
            {PLATZHALTER.map(p => (
              <button key={p.tag} title={p.hilfe} onClick={() => platzhalterEinfuegen(p.tag)}
                disabled={!canEdit || !hatEigen}
                className="px-2 py-1 rounded-md text-[11px] font-mono bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 disabled:opacity-40">
                {p.tag}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-400 mb-2">
            {`Ein Label gehoert mit seinem Platzhalter auf eine eigene Zeile, z. B. "VK {vk}". Ist der Wert leer, faellt die ganze Zeile weg. Steht das Label zusammen mit anderem Text in einer Zeile, bleibt es allein stehen.`}
          </p>

          <textarea ref={areaRef} value={wert} rows={12} spellCheck={false}
            readOnly={!canEdit || !hatEigen}
            onChange={(ev) => setzeVorlage(ev.target.value)}
            className="w-full font-mono text-xs p-3 rounded-lg border border-gray-200 focus:border-green-600 focus:outline-none read-only:bg-gray-50 read-only:text-gray-500" />

          {hatEigen && gewaehlt !== "_default" && canEdit && (
            <button
              onClick={() => {
                if (!window.confirm(`Eigene Vorlage fuer ${gewaehlt} loeschen? Danach gilt wieder der Standard.`)) return;
                const next = { ...(vorlagen || {}) };
                next[gewaehlt] = null;
                onChange(next);
              }}
              className="mt-2 text-xs font-medium text-red-600 hover:text-red-700">
              Auf Standard zuruecksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
