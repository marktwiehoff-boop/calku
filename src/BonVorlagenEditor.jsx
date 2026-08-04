import React, { useRef, useState } from "react";
import { standardVorlage, aufloeseVorlage, gepflegt } from "./bon.js";

const PLATZHALTER = [
  { tag: "{produkt}",     hilfe: "Produktname" },
  { tag: "{gruppe}",      hilfe: "Warengruppe" },
  { tag: "{untergruppe}", hilfe: "Untergruppe, z. B. Salatbowls" },
  { tag: "{vk}",          hilfe: "Verkaufspreis brutto" },
  { tag: "{zutaten}",     hilfe: "Zutatenliste mit Mengen" },
  { tag: "{schritte}",    hilfe: "Arbeitsschritte, nummeriert" },
  { tag: "{hinweise}",    hilfe: "Hinweise, mit ! markiert" },
];

// Textbereich der Vorlage: lokaler Puffer, Commit erst onBlur (Konvention).
// Ueber key={gewaehlt} im Elternteil neu gemountet, sobald Warengruppe/Standard
// wechselt - so wird der Tippspeicher nie von einem Realtime-Update ueberschrieben.
function VorlagenFeld({ initialWert, canEdit, hatEigen, onCommit }) {
  const [lokal, setLokal] = useState(initialWert);
  const areaRef = useRef(null);

  const platzhalterEinfuegen = (tag) => {
    const el = areaRef.current;
    if (!el || !canEdit || !hatEigen) return;
    const s = el.selectionStart ?? lokal.length;
    const e = el.selectionEnd ?? lokal.length;
    const naechster = lokal.slice(0, s) + tag + lokal.slice(e);
    setLokal(naechster);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); });
  };

  return (
    <>
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
        {`Ein Label gehört mit seinem Platzhalter auf eine eigene Zeile, z. B. "VK {vk}". Ist der Wert leer, fällt die ganze Zeile weg. Steht das Label zusammen mit anderem Text in einer Zeile, bleibt es allein stehen.`}
      </p>

      <textarea ref={areaRef} value={lokal} rows={12} spellCheck={false}
        readOnly={!canEdit || !hatEigen}
        onChange={(ev) => setLokal(ev.target.value)}
        onBlur={() => { if (lokal !== initialWert) onCommit(lokal); }}
        className="w-full font-mono text-xs p-3 rounded-lg border border-gray-200 focus:border-green-600 focus:outline-none read-only:bg-gray-50 read-only:text-gray-500" />
    </>
  );
}

// Kopfbereich des Bon-Reiters: eine Vorlage je Warengruppe, sonst Standard.
export default function BonVorlagenEditor({ warengruppen, vorlagen, onChange, canEdit }) {
  const [offen, setOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState("_default");

  const eigen    = vorlagen?.[gewaehlt];
  const hatEigen = gewaehlt === "_default" || gepflegt(eigen);
  const wert     = gewaehlt === "_default"
    ? standardVorlage(vorlagen)
    : (hatEigen ? eigen : aufloeseVorlage(gewaehlt, vorlagen));

  // Leerstring wird zu null, damit "leer" ueberall dasselbe bedeutet (= Erben vom Standard).
  const setzeVorlage = (text) => onChange({ ...(vorlagen || {}), [gewaehlt]: text && text.trim() ? text : null });

  const eintraege = [{ id: "_default", label: "Standard" }, ...warengruppen.map(g => ({ id: g, label: g }))];

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <button onClick={() => setOffen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-gray-700">
          Bon-Vorlagen{" "}
          <span className="font-normal text-gray-400">
            ({eintraege.filter(e => e.id !== "_default" && gepflegt(vorlagen?.[e.id])).length} Warengruppen abweichend)
          </span>
        </span>
        <span className="text-xs text-gray-400">{offen ? "zuklappen" : "aufklappen"}</span>
      </button>

      {offen && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <div className="flex gap-1 flex-wrap mb-3">
            {eintraege.map(e => {
              const abweichend = e.id !== "_default" && gepflegt(vorlagen?.[e.id]);
              return (
                <button key={e.id} onClick={() => setGewaehlt(e.id)} aria-pressed={gewaehlt === e.id}
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
                Diese Warengruppe nutzt die Standardvorlage.
              </span>
              {canEdit && (
                <button onClick={() => setzeVorlage(wert)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800">
                  Eigene Vorlage anlegen
                </button>
              )}
            </div>
          )}

          <VorlagenFeld key={`${gewaehlt}|${hatEigen}`} initialWert={wert} canEdit={canEdit} hatEigen={hatEigen}
            onCommit={setzeVorlage} />

          {hatEigen && gewaehlt !== "_default" && canEdit && (
            <button
              onClick={() => {
                if (!window.confirm(`Eigene Vorlage für ${gewaehlt} löschen? Danach gilt wieder der Standard.`)) return;
                const next = { ...(vorlagen || {}) };
                next[gewaehlt] = null;
                onChange(next);
              }}
              className="mt-2 text-xs font-medium text-red-600 hover:text-red-700">
              Auf Standard zurücksetzen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
