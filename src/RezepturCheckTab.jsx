// Tab Rezeptur-Check: alle Rezepturen gegen die typischen Pflegefehler (rezepturcheck.js).
// Jeder Befund fuehrt mit einem Klick ins Rezept; veraltete Preise lassen sich direkt aus dem
// Artikelstamm nachziehen. Was behoben ist, verschwindet von selbst.
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import { PRUEFUNGEN } from "./rezepturcheck.js";

// befunde = pruefeRezepturen(...) aus der App (dort gerechnet, weil auch der Tab-Zaehler sie braucht)
export default function RezepturCheckTab({ produkte, befunde, onEdit, onPreiseUebernehmen, canEdit }) {
  const [typ, setTyp] = useState("alle");
  const [gruppe, setGruppe] = useState("alle");

  const zaehlung = useMemo(() => {
    const z = {};
    for (const b of befunde) z[b.typ] = (z[b.typ] || 0) + 1;
    return z;
  }, [befunde]);
  const gruppen = useMemo(() => [...new Set(befunde.map(b => b.gruppe))].sort(), [befunde]);
  const sichtbar = befunde.filter(b => (typ === "alle" || b.typ === typ) && (gruppe === "alle" || b.gruppe === gruppe));

  // je Produkt buendeln, Fehler vor Hinweisen
  const jeProdukt = useMemo(() => {
    const m = new Map();
    for (const b of sichtbar) {
      if (!m.has(b.produktId)) m.set(b.produktId, { id: b.produktId, name: b.produkt, gruppe: b.gruppe, befunde: [] });
      m.get(b.produktId).befunde.push(b);
    }
    const rang = (e) => (e.befunde.some(b => b.schwere === "fehler") ? 0 : 1);
    return [...m.values()].sort((a, b) => rang(a) - rang(b) || a.gruppe.localeCompare(b.gruppe, "de") || a.name.localeCompare(b.name, "de"));
  }, [sichtbar]);

  const preisAlt = sichtbar.filter(b => b.typ === "preis_alt");
  const chip = (aktiv) => `px-2.5 py-1 rounded-full text-xs font-medium border transition ${
    aktiv ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"}`;

  if (!befunde.length) {
    return (
      <div className="bg-white rounded-xl border border-emerald-200 p-8 text-center text-emerald-800 space-y-2">
        <CheckCircle2 className="mx-auto text-emerald-600" size={32} />
        <div className="font-semibold">Alle Rezepturen sind sauber.</div>
        <div className="text-sm text-gray-500">Preise, Artikel, Mengen, Staffeln und Verkaufspreise passen.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-800">{befunde.length} Befunde in {new Set(befunde.map(b => b.produktId)).size} Rezepturen.</span>{" "}
          Klick auf ein Rezept öffnet es zum Korrigieren. Was behoben ist, verschwindet von selbst aus der Liste.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTyp("alle")} className={chip(typ === "alle")}>Alle · {befunde.length}</button>
          {Object.entries(PRUEFUNGEN).filter(([k]) => zaehlung[k]).map(([k, p]) => (
            <button key={k} onClick={() => setTyp(k)} className={chip(typ === k)}>
              <span className={p.schwere === "fehler" ? "text-red-600" : "text-amber-600"}>●</span> {p.label} · {zaehlung[k]}
            </button>
          ))}
        </div>
        {gruppen.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setGruppe("alle")} className={chip(gruppe === "alle")}>Alle Warengruppen</button>
            {gruppen.map(g => <button key={g} onClick={() => setGruppe(g)} className={chip(gruppe === g)}>{g}</button>)}
          </div>
        )}
        {canEdit && preisAlt.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
            <span>
              {preisAlt.length} Zeilen rechnen mit einem anderen Preis als der Artikelstamm. Meist ist der Stamm aktueller
              (Preisimport). Große Abweichungen vorher kurz ansehen — manchmal ist die Packung im Stamm falsch.
            </span>
            <button onClick={() => onPreiseUebernehmen?.(preisAlt)}
              className="shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 py-1.5 font-medium flex items-center gap-1.5">
              <RotateCcw size={13} /> Alle {preisAlt.length} Preise aus dem Stamm übernehmen
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {jeProdukt.map(e => {
          const produkt = produkte.find(p => p.id === e.id);
          return (
            <div key={e.id} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-gray-800">{e.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{e.gruppe}</span>
                </div>
                {produkt && (
                  <button onClick={() => onEdit?.(produkt)}
                    className="text-xs text-emerald-800 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                    <Pencil size={12} /> {canEdit ? "Rezept öffnen" : "Ansehen"}
                  </button>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {e.befunde.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <AlertTriangle size={13} className={`mt-px shrink-0 ${b.schwere === "fehler" ? "text-red-500" : "text-amber-500"}`} />
                    <span className="text-gray-700">
                      <span className="text-gray-400">{PRUEFUNGEN[b.typ].label}:</span> {b.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
