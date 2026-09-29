// Naehrwerttabelle. Wird erst beim Oeffnen geladen (Naehrwertdaten).
// Quelle: NWT_Stand_08.10.2025.xlsx → naehrwerte.json. Werte pro 100 g/ml. Allergene aggregiert
// (Gluten umfasst Weizen/Roggen/…).
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { WARENGRUPPEN } from "../kalkulation.js";
import naehrwerteJson from "../data/naehrwerte.json";

const ALLE_ALLERGENE = [
  "Gluten", "Milch", "Eier", "Soja", "Schalenfrüchte",
  "Sesam", "Erdnüsse", "Sellerie", "Senf", "Fisch", "Lupinen", "Schwefeldioxid",
];

export function NaehrwerteTab({ produkte = naehrwerteJson.produkte }) {
  const [suche, setSuche]       = useState("");
  const [gruppe, setGruppe]     = useState("Alle");
  const [alOhne, setAlOhne]     = useState([]); // ausgewählte „ohne …"-Filter
  const [sortBy, setSortBy]     = useState("name");
  const [sortDir, setSortDir]   = useState("asc");

  const toggleOhne = (a) => setAlOhne(alOhne.includes(a) ? alOhne.filter(x => x !== a) : [...alOhne, a]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    let arr = produkte.filter(p => {
      if (gruppe !== "Alle" && p.gruppe !== gruppe) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.groesse || "").toLowerCase().includes(q)) return false;
      // „ohne X" — Produkt muss frei von X sein
      for (const a of alOhne) if (p.allergene.includes(a)) return false;
      return true;
    });
    arr.sort((a, b) => {
      const va = a[sortBy] ?? "";
      const vb = b[sortBy] ?? "";
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [produkte, suche, gruppe, alOhne, sortBy, sortDir]);

  const sortHeader = (key, label, align = "right") => (
    <th className={`text-${align} px-3 py-2 font-medium cursor-pointer hover:bg-gray-100`}
        onClick={() => {
          if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else { setSortBy(key); setSortDir(align === "right" ? "desc" : "asc"); }
        }}>
      {label}{sortBy === key && (sortDir === "asc" ? " ▲" : " ▼")}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Filter-Leiste */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-gray-600 mb-1">Suche</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="z. B. Caesar, Mango, 0,5l …"
                className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm bg-white" />
            </div>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium text-gray-600 mb-1">Warengruppe</span>
            <select value={gruppe} onChange={e => setGruppe(e.target.value)}
              className="border border-gray-200 rounded px-3 py-2 text-sm bg-white">
              <option value="Alle">Alle ({produkte.length})</option>
              {WARENGRUPPEN.map(g => {
                const n = produkte.filter(p => p.gruppe === g).length;
                return <option key={g} value={g} disabled={n === 0}>{g} ({n})</option>;
              })}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-medium text-gray-600">Nur Produkte ohne:</span>
          {ALLE_ALLERGENE.map(a => (
            <button key={a} onClick={() => toggleOhne(a)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                alOhne.includes(a)
                  ? "bg-red-100 border-red-300 text-red-800"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
              }`}>
              {alOhne.includes(a) ? "✓ ohne " : "ohne "}{a}
            </button>
          ))}
          {alOhne.length > 0 && (
            <button onClick={() => setAlOhne([])}
              className="text-xs text-gray-500 hover:text-gray-800 underline ml-2">Zurücksetzen</button>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        {sichtbar.length} von {produkte.length} Produkten · Werte pro 100 g / 100 ml ·
        Quelle: NWT-Excel Stand 08.10.2025
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                {sortHeader("name",    "Produkt",       "left")}
                {sortHeader("groesse", "Größe",         "left")}
                {sortHeader("gruppe",  "Gruppe",        "left")}
                {sortHeader("kcal",    "kcal")}
                {sortHeader("kh",      "KH g")}
                {sortHeader("zucker",  "Zucker g")}
                {sortHeader("eiweiss", "Eiweiß g")}
                {sortHeader("fett",    "Fett g")}
                {sortHeader("salz",    "Salz g")}
                <th className="text-left px-3 py-2 font-medium">Allergene</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">
                  Keine Treffer. Filter anpassen.
                </td></tr>
              )}
              {sichtbar.map((p, i) => (
                <tr key={`${p.name}_${p.groesse}_${p.gruppe}_${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{p.name}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{p.groesse || "—"}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{p.gruppe}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{p.kcal != null ? Math.round(p.kcal) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.kh != null ? p.kh.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.zucker != null ? p.zucker.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.eiweiss != null ? p.eiweiss.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.fett != null ? p.fett.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.salz != null ? p.salz.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2">
                    {p.allergene.length === 0
                      ? <span className="text-xs text-gray-400">—</span>
                      : <div className="flex flex-wrap gap-1">
                          {p.allergene.map(a => (
                            <span key={a} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">{a}</span>
                          ))}
                        </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Nährwerte sind kalkulatorische Werte aus der zentralen NWT-Excel (Stand 08.10.2025).
        Allergen-Kennzeichnung gilt rechtlich nur am POS — Stand bei Lieferantenwechsel prüfen.
      </p>
    </div>
  );
}

