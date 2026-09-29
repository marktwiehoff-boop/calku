// System-Wareneinsatz (Mix-Kalkulator). Wird erst beim Oeffnen geladen - zieht die Diagramm-Bibliothek.
import { useMemo } from "react";
import { SCHWUND_PCT, WARENGRUPPEN, berechne, fmtPct } from "../kalkulation.js";
import { Info, Package } from "lucide-react";
import { KPICard } from "./Warengruppen.jsx";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// ============================================================
//  SYSTEM-WARENEINSATZ-TAB (Mix-Kalkulator)
// ============================================================
export function SystemWeTab({ produkte, mix, setMix }) {
  // Pro Warengruppe: Ø WE-Quote (OUT, 7 % MwSt.) und Anzahl Produkte
  const gruppenStats = useMemo(() => {
    return WARENGRUPPEN.map(g => {
      const ps = produkte.filter(p => p.gruppe === g);
      if (ps.length === 0) return { gruppe: g, anzahl: 0, we_quote: 0 };
      const sum = ps.reduce((s, p) => s + berechne(p).we_out, 0);
      return { gruppe: g, anzahl: ps.length, we_quote: sum / ps.length };
    });
  }, [produkte]);

  const summeMix = WARENGRUPPEN.reduce((s, g) => s + (mix[g] || 0), 0);
  const sollWe = gruppenStats.reduce((s, gs) => {
    const anteil = (mix[gs.gruppe] || 0) / 100;
    return s + gs.we_quote * anteil;
  }, 0);
  const sollInklSchwund = sollWe + SCHWUND_PCT;

  const updateMix = (g, val) => {
    const v = Math.max(0, Math.min(100, +val || 0));
    setMix(prev => ({ ...prev, [g]: v }));
  };

  const verteilen = () => {
    const each = +(100 / WARENGRUPPEN.length).toFixed(1);
    const next = {};
    WARENGRUPPEN.forEach((g, i) => next[g] = i === WARENGRUPPEN.length - 1 ? 100 - each * (WARENGRUPPEN.length - 1) : each);
    setMix(next);
  };

  const chartData = gruppenStats.map(gs => ({
    name: gs.gruppe,
    "Ø WE %": +gs.we_quote.toFixed(1),
    "Anteil %": +(mix[gs.gruppe] || 0).toFixed(1),
    "Beitrag zum Soll": +(gs.we_quote * (mix[gs.gruppe] || 0) / 100).toFixed(2),
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Package size={16} className="text-emerald-600" /> Produktmix-Verteilung
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Wie viel Prozent des Gesamtumsatzes entfallen auf jede Warengruppe? Summe muss 100 % ergeben.
            </p>
          </div>
          <button onClick={verteilen}
            className="text-xs text-emerald-700 hover:text-emerald-800 underline whitespace-nowrap">
            Gleichmäßig verteilen
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {gruppenStats.map(gs => (
            <div key={gs.gruppe} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{gs.gruppe}</span>
                <span className="text-xs text-gray-400">{gs.anzahl} Produkte · Ø {fmtPct(gs.we_quote)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="100" step="0.5"
                  value={mix[gs.gruppe] || 0}
                  onChange={e => updateMix(gs.gruppe, e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-green-500" />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-right text-sm">
          Mix-Summe: <span className={`font-semibold tabular-nums ${
            Math.abs(summeMix - 100) < 0.1 ? "text-green-700" : "text-red-700"
          }`}>{fmtPct(summeMix)}</span>
          {Math.abs(summeMix - 100) >= 0.1 && (
            <span className="ml-2 text-xs text-red-600">⚠ Sollte exakt 100 % ergeben</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Soll-Wareneinsatz" value={fmtPct(sollWe)}
                 sub="gewichtet aus Produktmix" stufe="info" />
        <KPICard title="+ Schwund / Abschreibung" value={fmtPct(SCHWUND_PCT)}
                 sub="Sicherheitspuffer (max. tolerabel)" stufe="grau" />
        <KPICard title="Soll inkl. Schwund" value={fmtPct(sollInklSchwund)}
                 sub="Ist-WE darüber = Warnung" stufe="rot" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Warengruppen-Beitrag zur Soll-Quote</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} />
            <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} unit=" %" />
            <Tooltip
              formatter={(v, n) => [`${(+v).toLocaleString("de-DE", { minimumFractionDigits: 1 })} %`, n]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Anteil %"        fill="#86efac" radius={[4,4,0,0]} />
            <Bar dataKey="Ø WE %"          fill="#16a34a" radius={[4,4,0,0]} />
            <Bar dataKey="Beitrag zum Soll" fill="#2d6a4f" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-500 mt-2">
          „Beitrag zum Soll" = Ø WE % × Anteil %. Die Summe aller Beiträge ergibt den Soll-Wareneinsatz.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm">
        <Info size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="text-amber-900">
          <strong>Lesart:</strong> Der Soll-Wareneinsatz (z.B. {fmtPct(sollWe)}) ist der theoretisch perfekte Wert
          aus deinem Produktmix. Da Schwund (Abschreibung, Bruch, Verderb) immer entsteht, addieren wir pauschal
          {" "}{fmtPct(SCHWUND_PCT)} als Sicherheitspuffer. Der resultierende Wert ({fmtPct(sollInklSchwund)})
          ist die rote Linie: Liegt der gemessene Ist-Wareneinsatz darüber, läuft etwas aus dem Ruder.
        </div>
      </div>
    </div>
  );
}

