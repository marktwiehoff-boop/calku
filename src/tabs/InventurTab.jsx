// Inventurliste zum Ausdrucken. Aus App.jsx ausgelagert (28.09.2026).
import { useMemo, useState } from "react";
import { frage } from "../ui/dialog.jsx";
import { Download, RotateCcw, Search } from "lucide-react";
import { fmtEUR } from "../kalkulation.js";
// ============================================================
//  INVENTUR — Liste pro Lieferant, händisch ausfüllbar (PDF-Druck)
//  Quelle: Inventurliste - 05.2026.xlsx → inventur.json
// ============================================================
export function InventurTab({ inventur }) {
  const heute = new Date().toISOString().slice(0, 10);
  const [filiale, setFiliale]   = useState("");
  const [datum,   setDatum]     = useState(heute);
  const [bearbeiter, setBearbeiter] = useState("");
  const [mengen,  setMengen]    = useState({});
  const [filter,  setFilter]    = useState(""); // Lieferant-Filter: "Alle" | "BUNZL" | "TRANSGOURMET"
  const [suche,   setSuche]     = useState("");

  const setMenge = (artnr, v) => setMengen(m => ({ ...m, [artnr]: v }));
  const resetMengen = () => {
    frage({ text: "Alle eingetragenen Mengen löschen?", ja: "Leeren", gefahr: true }).then(ok => ok && setMengen({}));
  };
  const druckNoetig = () => window.print();

  const gesamtArtikel = useMemo(() => {
    let n = 0;
    for (const L of inventur.lieferanten) for (const g of L.untergruppen) n += g.artikel.length;
    return n;
  }, [inventur]);

  const summe = useMemo(() => {
    let s = 0;
    for (const L of inventur.lieferanten) {
      for (const g of L.untergruppen) {
        for (const a of g.artikel) {
          const m = parseFloat(String(mengen[a.artikelnr] || "").replace(",", "."));
          if (!isNaN(m) && a.preis_stk) s += m * a.preis_stk;
        }
      }
    }
    return s;
  }, [inventur, mengen]);

  const sichtbarerInhalt = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return inventur.lieferanten
      .filter(L => !filter || filter === "Alle" || L.name === filter)
      .map(L => ({
        ...L,
        untergruppen: L.untergruppen.map(g => ({
          ...g,
          artikel: g.artikel.filter(a =>
            !q || a.bezeichnung.toLowerCase().includes(q) || a.artikelnr.includes(q)
          ),
        })).filter(g => g.artikel.length > 0),
      }))
      .filter(L => L.untergruppen.length > 0);
  }, [inventur, filter, suche]);

  return (
    <div className="space-y-4 inventur-druckbereich">
      {/* Druck-Stylesheet — wirkt global, blendet App-Chrome aus */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 10mm 12mm 10mm; }
          html, body { background: white !important; }
          .inventur-no-print { display: none !important; }
          .inventur-druckkopf { display: block !important; }
          /* App-Chrome ausblenden */
          .app-chrome-header,
          .app-chrome-nav,
          .app-chrome-footer { display: none !important; }
          /* Tabelle kompakt */
          .inventur-druckbereich { font-size: 9.5pt; }
          .inventur-druckbereich h2 { font-size: 13pt; }
          .inventur-druckbereich h3 { font-size: 11pt; }
          .inventur-druckbereich table { border-collapse: collapse; width: 100%; }
          .inventur-druckbereich tbody tr { page-break-inside: avoid; }
          .inventur-druckbereich .gruppe-block { page-break-inside: avoid; }
          /* Eingabefeld → schreibbare Linie */
          .inventur-menge-input {
            border: none !important;
            border-bottom: 1px solid #444 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 1px 2px !important;
            width: 60px !important;
          }
          .inventur-eingabe {
            border: none !important;
            border-bottom: 1px solid #444 !important;
            border-radius: 0 !important;
            background: transparent !important;
            min-width: 120px;
          }
          .inventur-lieferant-header {
            background: #2E7D32 !important;
            color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .inventur-summe-card {
            background: #E8F5E9 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
        @media screen {
          .inventur-druckkopf { display: none; }
        }
      `}</style>

      {/* DRUCK-KOPF (nur bei Print sichtbar) */}
      <div className="inventur-druckkopf" style={{ marginBottom: 8 }}>
        <table style={{ width: "100%", borderBottom: "2px solid #2E7D32", paddingBottom: 6 }}>
          <tbody>
            <tr>
              <td style={{ fontSize: "18pt", fontWeight: "bold", color: "#2E7D32" }}>
                immergrün · INVENTUR
              </td>
              <td style={{ textAlign: "right", fontSize: "10pt" }}>
                <div><b>Filiale:</b> {filiale || "_________________________"}</div>
                <div><b>Datum:</b> {datum ? new Date(datum).toLocaleDateString("de-DE") : "___________"}</div>
                <div><b>Bearbeiter/in:</b> {bearbeiter || "_________________________"}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* BILDSCHIRM-KOPF — Filter, Eingaben, Buttons */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 inventur-no-print">
        <div className="flex flex-wrap items-end gap-4 justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col">
              <span className="text-xs font-medium text-gray-600 mb-1">Filiale</span>
              <input type="text" value={filiale} onChange={e => setFiliale(e.target.value)}
                placeholder="z. B. Hannover Bahnhof"
                className="inventur-eingabe border border-gray-300 rounded px-3 py-2 text-sm min-w-[200px]" />
            </label>
            <label className="flex flex-col">
              <span className="text-xs font-medium text-gray-600 mb-1">Inventur-Datum</span>
              <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col">
              <span className="text-xs font-medium text-gray-600 mb-1">Bearbeiter/in</span>
              <input type="text" value={bearbeiter} onChange={e => setBearbeiter(e.target.value)}
                placeholder="Name"
                className="inventur-eingabe border border-gray-300 rounded px-3 py-2 text-sm min-w-[180px]" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={resetMengen}
              className="bg-white border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 text-gray-700">
              <RotateCcw size={14} /> Mengen leeren
            </button>
            <button onClick={druckNoetig}
              className="bg-green-700 hover:bg-green-800 text-white rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
              <Download size={14} /> Drucken / PDF
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-gray-100">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-gray-600 mb-1">Suche</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="Artikel oder Artikelnummer …"
                className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm bg-white" />
            </div>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium text-gray-600 mb-1">Lieferant</span>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="border border-gray-200 rounded px-3 py-2 text-sm bg-white">
              <option value="">Alle ({gesamtArtikel})</option>
              {inventur.lieferanten.map(L => {
                const n = L.untergruppen.reduce((s, g) => s + g.artikel.length, 0);
                return <option key={L.name} value={L.name}>{L.name} ({n})</option>;
              })}
            </select>
          </label>
        </div>
      </div>

      {/* Summen-Karte */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 inventur-summe-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Inventurwert (kalkuliert)</div>
            <div className="text-3xl font-bold text-emerald-900 tabular-nums">{fmtEUR(summe)}</div>
          </div>
          <div className="text-xs text-emerald-700">
            {Object.values(mengen).filter(v => v && parseFloat(String(v).replace(",", ".")) > 0).length} Artikel
            mit Menge erfasst<br/>
            Quelle: Inventurliste {inventur.stand}
          </div>
        </div>
      </div>

      {/* Tabellen pro Lieferant → Untergruppe → Artikel */}
      {sichtbarerInhalt.map(L => (
        <div key={L.name} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <h2 className="inventur-lieferant-header bg-green-800 text-white px-4 py-2.5 font-bold text-base">
            {L.name}
          </h2>
          {L.untergruppen.map(g => (
            <div key={g.name} className="gruppe-block">
              <h3 className="bg-emerald-50 text-emerald-900 px-4 py-1.5 font-semibold text-sm border-b border-emerald-100">
                {g.name} <span className="text-emerald-600 font-normal text-xs">· {g.artikel.length} Artikel</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium">Art.-Nr.</th>
                      <th className="text-left px-3 py-1.5 font-medium">Bezeichnung</th>
                      <th className="text-left px-3 py-1.5 font-medium w-20">VE</th>
                      <th className="text-right px-3 py-1.5 font-medium w-24">Preis / Stk</th>
                      <th className="text-right px-3 py-1.5 font-medium w-28">Menge</th>
                      <th className="text-right px-3 py-1.5 font-medium w-28">Wert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.artikel.map(a => {
                      const raw = mengen[a.artikelnr] || "";
                      const m = parseFloat(String(raw).replace(",", "."));
                      const w = !isNaN(m) && a.preis_stk ? m * a.preis_stk : null;
                      return (
                        <tr key={a.artikelnr} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-500 text-xs tabular-nums">{a.artikelnr}</td>
                          <td className="px-3 py-1.5 text-gray-800">{a.bezeichnung}</td>
                          <td className="px-3 py-1.5 text-gray-500 text-xs">{a.ve}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                            {a.preis_stk != null ? fmtEUR(a.preis_stk) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={raw}
                              onChange={e => setMenge(a.artikelnr, e.target.value)}
                              className="inventur-menge-input w-24 border border-gray-300 rounded px-2 py-1 text-right tabular-nums focus:outline-none focus:border-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                            {w !== null ? fmtEUR(w) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}

      {sichtbarerInhalt.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Keine Artikel — Filter/Suche anpassen.
        </div>
      )}

      {/* Druck-Fußzeile */}
      <div className="inventur-druckkopf" style={{ marginTop: 12, borderTop: "1px solid #ccc", paddingTop: 6, fontSize: "9pt" }}>
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td><b>Inventurwert kalkuliert:</b> {fmtEUR(summe)}</td>
              <td style={{ textAlign: "right" }}>Unterschrift: ______________________________</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 inventur-no-print">
        Tipp: Filiale + Datum + Bearbeiter/in eintragen → „Drucken / PDF" klicken → Drucker-Dialog
        bietet „Als PDF speichern" an. Mengen werden im Shop händisch in die Listenfelder eingetragen.
      </p>
    </div>
  );
}

