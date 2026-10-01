// Tab Zuordnung: jede Rezept-Zutat einmal mit ihrem Einkaufsartikel verbinden (zuordnung.js).
// Danach laufen neue Einkaufspreise ueber die Artikelnummer automatisch in alle Rezepturen.
import { useMemo, useState } from "react";
import { Link2, Link2Off, RotateCcw, Search } from "lucide-react";
import { artikelPreis, baueArtikelIndex, vorschlaege, suche, zutatenUebersicht } from "../zuordnung.js";

const fmt = (v) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
const preisText = (v, stueck) => (v > 0 ? `${fmt(v)} ${stueck ? "€/Stk" : "€/kg"}` : "kein Preis");

function FaktorBadge({ faktor }) {
  if (!faktor) return null;
  const nah = faktor > 0.7 && faktor < 1.45;
  const pct = Math.round((1 / faktor - 1) * 100);
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded-full tabular-nums ${nah ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
      title="Artikelpreis im Vergleich zum Preis, mit dem die Rezeptur heute rechnet">
      {pct === 0 ? "gleicher Preis" : `${pct > 0 ? "+" : ""}${pct} % zur Rezeptur`}
    </span>
  );
}

function OffeneZutat({ e, index, canEdit, onZuordnen, onEigen }) {
  const [text, setText] = useState("");
  const vor = useMemo(() => vorschlaege(e.name, { rezeptPreis: e.rezeptPreis, stueck: e.stueck }, index), [e.name, e.rezeptPreis, e.stueck, index]);
  const treffer = useMemo(() => suche(text, index), [text, index]);
  const zeile = (v) => {
    const preis = v.preis ?? artikelPreis(v.artikel, e.stueck);
    return (
    <li key={v.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <span className="min-w-0">
        <span className="text-gray-800">{v.artikel.ingredient_name}</span>
        <span className="text-gray-400 text-xs"> · Nr. {String(v.artikel.article_number || "–").replace(/\.0$/, "")} · {preisText(preis, e.stueck)}</span>
        {" "}<FaktorBadge faktor={e.rezeptPreis && preis ? e.rezeptPreis / preis : null} />
      </span>
      {canEdit && (
        <button onClick={() => onZuordnen(e.name, v.key)}
          className="shrink-0 text-xs rounded-lg px-2.5 py-1 border border-emerald-300 text-emerald-800 hover:bg-emerald-50 flex items-center gap-1">
          <Link2 size={12} /> Zuordnen
        </button>
      )}
    </li>
    );
  };
  return (
    <div className="space-y-2">
      {vor.length > 0
        ? <ul className="divide-y divide-gray-100">{vor.map(zeile)}</ul>
        : <p className="text-xs text-gray-500">Kein naheliegender Artikel. Unten suchen oder als eigene Kalkulation markieren.</p>}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2 top-2 text-gray-400" />
            <input value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Anderen Artikel suchen (Name oder Nummer) …"
              className="w-full border border-gray-200 rounded-lg pl-7 pr-2 py-1.5 text-xs bg-white" />
          </label>
          <button onClick={() => onEigen(e.name)} title="Hausgemacht oder aus mehreren Artikeln zusammengesetzt – der Preis bleibt in der Rezeptur"
            className="text-xs rounded-lg px-2.5 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50">
            Kein Einkaufsartikel (eigene Kalkulation)
          </button>
        </div>
      )}
      {treffer.length > 0 && <ul className="divide-y divide-gray-100 border-t border-gray-100">{treffer.map((t) => zeile({ ...t, preis: null }))}</ul>}
    </div>
  );
}

export default function ZuordnungTab({ produkte, priceList, zuordnung, zutaten, canEdit, onZuordnen, onEigen, onLoesen, onPreis }) {
  const [filter, setFilter] = useState("offen");
  const index = useMemo(() => baueArtikelIndex(priceList), [priceList]);
  const liste = useMemo(() => zutatenUebersicht(produkte, zuordnung, zutaten), [produkte, zuordnung, zutaten]);
  const zahl = (s) => liste.filter((e) => e.stand === s).length;
  const kostenGesamt = liste.reduce((s, e) => s + e.kosten, 0) || 1;
  const kostenVerknuepft = liste.filter((e) => e.stand !== "offen").reduce((s, e) => s + e.kosten, 0);
  const preisAbweichend = (e) => e.stand === "zugeordnet" && e.artikelPreis > 0 && e.preisSpanne
    && (Math.abs(e.preisSpanne[0] / e.artikelPreis - 1) > 0.02 || Math.abs(e.preisSpanne[1] / e.artikelPreis - 1) > 0.02);
  const sichtbar = liste.filter((e) => filter === "alle" || (filter === "preis" ? preisAbweichend(e) : e.stand === filter));
  const chip = (k, label, n) => (
    <button key={k} onClick={() => setFilter(k)}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${filter === k ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"}`}>
      {label} · {n}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm text-gray-600 max-w-3xl">
          <span className="font-medium text-gray-800">Jede Zutat einmal mit ihrem Einkaufsartikel verbinden.</span>{" "}
          Danach fließen neue Preise aus der Transgourmet-Liste über die Artikelnummer automatisch in alle Rezepturen.
          Die Vorschläge kommen aus Namensähnlichkeit und Preisvergleich – bitte kurz prüfen, dann „Zuordnen“.
          Die teuersten Zutaten stehen oben.
        </p>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden" title="Anteil der Materialkosten, deren Preis an einem Artikel hängt">
          <div className="h-full bg-emerald-600" style={{ width: `${Math.round((kostenVerknuepft / kostenGesamt) * 100)}%` }} />
        </div>
        <p className="text-xs text-gray-500">
          {zahl("zugeordnet")} von {liste.length} Zutaten zugeordnet, {zahl("eigen")} eigene Kalkulation ·
          {" "}{Math.round((kostenVerknuepft / kostenGesamt) * 100)} % der Materialkosten hängen an einem Artikel
        </p>
        <div className="flex flex-wrap gap-1.5">
          {chip("offen", "Offen", zahl("offen"))}
          {chip("preis", "Preis weicht vom Artikel ab", liste.filter(preisAbweichend).length)}
          {chip("zugeordnet", "Zugeordnet", zahl("zugeordnet"))}
          {chip("eigen", "Eigene Kalkulation", zahl("eigen"))}
          {chip("alle", "Alle", liste.length)}
        </div>
      </div>

      {sichtbar.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-500">
          {filter === "offen" ? "Alle Zutaten sind zugeordnet." : "Keine Einträge in dieser Ansicht."}
        </div>
      )}

      <div className="space-y-2">
        {sichtbar.slice(0, 60).map((e) => (
          <div key={e.name} className={`bg-white rounded-xl border p-3 space-y-2 ${e.stand === "offen" ? "border-amber-200" : "border-gray-100"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-gray-900">{e.name}</span>
                <span className="text-xs text-gray-500"> · {e.zeilen} Zeilen in {e.produkte} Rezepten · rechnet mit {e.preisSpanne
                  ? (Math.abs(e.preisSpanne[1] - e.preisSpanne[0]) < 0.005 ? preisText(e.preisSpanne[0], e.stueck) : `${fmt(e.preisSpanne[0])} bis ${preisText(e.preisSpanne[1], e.stueck)}`)
                  : "0 €"}</span>
              </div>
              <span className="text-xs text-gray-400 tabular-nums">{fmt(e.kosten)} € Material gesamt</span>
            </div>

            {e.stand === "offen" && (
              <OffeneZutat e={e} index={index} canEdit={canEdit} onZuordnen={onZuordnen} onEigen={onEigen} />
            )}

            {e.stand === "zugeordnet" && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-gray-700">
                  <Link2 size={12} className="inline text-emerald-600 mr-1" />
                  {e.artikel?.ingredient_name} <span className="text-gray-400">· Nr. {String(e.artikel?.article_number || "–").replace(/\.0$/, "")} · {preisText(e.artikelPreis, e.stueck)}</span>
                  {" "}{preisAbweichend(e) && <FaktorBadge faktor={e.rezeptPreis / e.artikelPreis} />}
                </span>
                {canEdit && (
                  <span className="flex gap-1.5">
                    {preisAbweichend(e) && (
                      <button onClick={() => onPreis(e)}
                        className="rounded-lg px-2.5 py-1 bg-emerald-700 text-white hover:bg-emerald-800 flex items-center gap-1">
                        <RotateCcw size={12} /> Artikelpreis in {e.zeilen} Zeilen übernehmen
                      </button>
                    )}
                    {e.zutat && (
                      <button onClick={() => onLoesen(e.name)} title="Zuordnung lösen"
                        className="rounded-lg px-2 py-1 border border-gray-200 text-gray-500 hover:bg-gray-50"><Link2Off size={12} /></button>
                    )}
                  </span>
                )}
              </div>
            )}

            {e.stand === "eigen" && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Eigene Kalkulation – der Preis wird in der Rezeptur gepflegt.</span>
                {canEdit && <button onClick={() => onLoesen(e.name)} className="rounded-lg px-2 py-1 border border-gray-200 hover:bg-gray-50">Doch zuordnen</button>}
              </div>
            )}
          </div>
        ))}
        {sichtbar.length > 60 && <p className="text-xs text-gray-500 text-center">… und {sichtbar.length - 60} weitere. Die oberen zuerst erledigen.</p>}
      </div>
    </div>
  );
}
