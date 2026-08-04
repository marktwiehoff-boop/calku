import React, { useMemo, useState } from "react";
import BonVorlagenEditor from "./BonVorlagenEditor.jsx";
import BonEditor from "./BonEditor.jsx";
import { bonStatus, bonsAlsCsv, bonsAlsJson } from "./bon.js";

const PUNKT = {
  auto:       { farbe: "#cbd5e1", titel: "nur Automatik" },
  gepflegt:   { farbe: "#15803d", titel: "Schritte gepflegt" },
  abweichend: { farbe: "#ea580c", titel: "abweichend von der Rezeptur" },
};

function download(inhalt, dateiname, typ) {
  const blob = new Blob([inhalt], { type: typ });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}

// Reiter "Produktionsbons": Vorlagen oben, Rezeptliste links, Editor rechts.
export default function BonsTab({ produkte, warengruppen, vorlagen, onVorlagen, onFeld, canEdit }) {
  const [filter, setFilter] = useState("Alle");
  const [suche, setSuche]   = useState("");
  const [gewaehlt, setGewaehlt] = useState(null);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return produkte
      .filter(p => filter === "Alle" || p.gruppe === filter)
      .filter(p => !q || (p.name || "").toLowerCase().includes(q));
  }, [produkte, filter, suche]);

  const aktiv = produkte.find(p => p.id === gewaehlt) || sichtbar[0] || null;
  const gepflegt = produkte.filter(p => bonStatus(p) !== "auto").length;

  const exportieren = (art) => {
    const stand = new Date().toISOString().slice(0, 10);
    if (art === "csv") {
      download(bonsAlsCsv(produkte, vorlagen), `bons_${stand}.csv`, "text/csv;charset=utf-8");
    } else {
      download(bonsAlsJson(produkte, vorlagen, stand), `bons_${stand}.json`, "application/json");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Produktionsbons</h2>
          <p className="text-xs text-gray-400">
            {`${gepflegt} von ${produkte.length} Rezepten gepflegt. Zutaten kommen live aus der Rezeptur.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportieren("csv")}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300">
            Export CSV
          </button>
          <button onClick={() => exportieren("json")}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300">
            Export JSON
          </button>
        </div>
      </div>

      <BonVorlagenEditor warengruppen={warengruppen} vorlagen={vorlagen}
        onChange={onVorlagen} canEdit={canEdit} />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-3 h-fit">
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Rezept suchen"
            className="w-full text-sm px-3 py-2 mb-2 rounded-lg border border-gray-200 focus:border-green-600 focus:outline-none" />
          <div className="flex gap-1 flex-wrap mb-3">
            {["Alle", ...warengruppen].map(g => (
              <button key={g} onClick={() => setFilter(g)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                  filter === g
                    ? "bg-green-700 text-white border-green-700"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}>
                {g}
              </button>
            ))}
          </div>
          <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
            {sichtbar.length === 0 && <p className="text-xs text-gray-400 px-2 py-3">Kein Rezept gefunden.</p>}
            {sichtbar.map(p => {
              const s = PUNKT[bonStatus(p)];
              return (
                <button key={p.id} onClick={() => setGewaehlt(p.id)}
                  className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg transition ${
                    aktiv?.id === p.id ? "bg-green-50" : "hover:bg-gray-50"
                  }`}>
                  <span title={s.titel} className="h-2 w-2 rounded-full shrink-0" style={{ background: s.farbe }} />
                  <span className="text-sm text-gray-700 truncate">{p.name}</span>
                  <span className="ml-auto text-[10px] text-gray-400 shrink-0">{p.gruppe}</span>
                </button>
              );
            })}
          </div>
        </div>

        <BonEditor produkt={aktiv} vorlagen={vorlagen} onFeld={onFeld} canEdit={canEdit} />
      </div>
    </div>
  );
}
