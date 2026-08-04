import React, { useMemo, useState } from "react";
import { renderBon, zutatenZeilen, BON_BREITE } from "./bon.js";

// Gezackte Bon-Unterkante, als Konstante statt ~700 Zeichen Inline-Style.
const BON_CLIP_PATH =
  "polygon(0 0, 100% 0, 100% calc(100% - 6px), 96% 100%, 92% calc(100% - 6px), 88% 100%, 84% calc(100% - 6px), 80% 100%, 76% calc(100% - 6px), 72% 100%, 68% calc(100% - 6px), 64% 100%, 60% calc(100% - 6px), 56% 100%, 52% calc(100% - 6px), 48% 100%, 44% calc(100% - 6px), 40% 100%, 36% calc(100% - 6px), 32% 100%, 28% calc(100% - 6px), 24% 100%, 20% calc(100% - 6px), 16% 100%, 12% calc(100% - 6px), 8% 100%, 4% calc(100% - 6px), 0 100%)";

// Lokaler Puffer, Commit erst onBlur. Kein Derive-during-render: der Aufrufer
// (BonEditor) wird bei jedem Rezeptwechsel per key neu gemountet, damit ein
// eingehendes Realtime-Update den Tippspeicher nie ueberschreibt.
function Feld({ label, hinweis, wert, rows, onCommit, canEdit }) {
  const [lokal, setLokal] = useState(wert || "");

  const feld = (
    <textarea value={lokal} rows={rows} spellCheck={false} readOnly={!canEdit}
      onChange={(e) => setLokal(e.target.value)}
      onBlur={() => { if ((wert || "") !== lokal) onCommit(lokal); }}
      className="w-full text-sm p-3 rounded-lg border border-gray-200 focus:border-green-600 focus:outline-none read-only:bg-gray-50 read-only:text-gray-500" />
  );

  if (!label) {
    return <div className="mb-4">{feld}</div>;
  }

  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label}
        {hinweis && <span className="block text-[11px] font-normal text-gray-400 mb-1">{hinweis}</span>}
        {feld}
      </label>
    </div>
  );
}

// Rechte Spalte des Bon-Reiters: Felder, Notausgang, Live-Vorschau.
export default function BonEditor({ produkt, vorlagen, onFeld, canEdit }) {
  const [overrideOffen, setOverrideOffen] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  const text = useMemo(() => renderBon(produkt, vorlagen), [produkt, vorlagen]);

  if (!produkt) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        Links ein Rezept wählen.
      </div>
    );
  }

  const abweichendeZutaten = typeof produkt.bon_zutaten === "string" && produkt.bon_zutaten.trim().length > 0;
  const hatOverride        = typeof produkt.bon_override === "string" && produkt.bon_override.trim().length > 0;

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch (_) {
      window.prompt("Bon-Text kopieren:", text);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-gray-800">{produkt.name}</h3>
            <p className="text-xs text-gray-400">{produkt.gruppe}</p>
          </div>
          {hatOverride && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
              Freier Bon aktiv, Vorlage wirkungslos
            </span>
          )}
        </div>

        <div className="mb-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-600">Zutaten</span>
          {abweichendeZutaten ? (
            <>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                abweichend, folgt der Rezeptur nicht mehr
              </span>
              {canEdit && (
                <button onClick={() => onFeld(produkt.id, { bon_zutaten: null })}
                  className="text-[11px] font-medium text-green-700 hover:text-green-800">
                  Zurück auf Automatik
                </button>
              )}
            </>
          ) : (
            <>
              <span className="text-[11px] text-gray-400">live aus der Rezeptur</span>
              {canEdit && (
                <button onClick={() => onFeld(produkt.id, { bon_zutaten: zutatenZeilen(produkt).join("\n") })}
                  className="text-[11px] font-medium text-green-700 hover:text-green-800">
                  Aus Rezeptur befüllen
                </button>
              )}
            </>
          )}
        </div>
        {abweichendeZutaten ? (
          <Feld wert={produkt.bon_zutaten} rows={6} canEdit={canEdit}
            onCommit={(v) => onFeld(produkt.id, { bon_zutaten: v })} />
        ) : (
          <pre className="w-full text-sm p-3 mb-4 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 whitespace-pre-wrap">
            {zutatenZeilen(produkt).join("\n") || "(keine Zutaten im Rezept)"}
          </pre>
        )}

        <Feld label="Arbeitsschritte" hinweis="Eine Zeile = ein Schritt, wird automatisch nummeriert."
          wert={produkt.bon_schritte} rows={6} canEdit={canEdit}
          onCommit={(v) => onFeld(produkt.id, { bon_schritte: v })} />

        <Feld label="Hinweise" hinweis="Eine Zeile = ein Hinweis, erscheint mit ! auf dem Bon."
          wert={produkt.bon_hinweise} rows={3} canEdit={canEdit}
          onCommit={(v) => onFeld(produkt.id, { bon_hinweise: v })} />

        <button onClick={() => setOverrideOffen(o => !o)}
          className="text-xs font-medium text-gray-500 hover:text-gray-700">
          {overrideOffen ? "Freien Bon zuklappen" : "Kompletten Bon frei schreiben"}
        </button>
        {overrideOffen && (
          <div className="mt-2">
            <Feld label="Freier Bon (ersetzt die Vorlage)"
              hinweis="Nur für Sonderfälle. Platzhalter funktionieren auch hier."
              wert={produkt.bon_override} rows={10} canEdit={canEdit}
              onCommit={(v) => onFeld(produkt.id, { bon_override: v })} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-600">Vorschau ({BON_BREITE} Zeichen)</span>
          <button onClick={kopieren}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800">
            {kopiert ? "kopiert" : "Bon kopieren"}
          </button>
        </div>
        <div className="flex justify-center">
          <pre className="bg-white text-gray-800 font-mono text-[11px] leading-[1.45] px-3 py-4 whitespace-pre shadow-md"
            style={{ width: `${BON_BREITE}ch`, clipPath: BON_CLIP_PATH }}>
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}
