// CSV-Preisimport (Transgourmet/BUNZL). Logik in preisimport.js. Aus App.jsx ausgelagert (28.09.2026).
import { useRef, useState } from "react";
import { LIEFERANTEN, erkenneSpalten, spaltenSignatur } from "./preisimport.js";
import Papa from "papaparse";
import { FileSpreadsheet } from "lucide-react";
import { fmtNum2 } from "./kalkulation.js";
import { istTgErweitert, repariereTgCsv } from "./tgimport.js";

const fmt3 = (v) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v || 0);
// Preis je Basiseinheit lesbar: g/ml als EUR/kg bzw. EUR/l, Stueck als EUR/Stk
const jeEinheit = (wert, basis) => basis === "stk" ? `${fmt3(wert)} €/Stk` : `${fmt3((wert || 0) * 1000)} €/${basis === "ml" ? "l" : "kg"}`;

export function ImportModal({ open, onClose, onImport, onImportTg, onTgArtikel, onGebinde, mappings = {}, onMappingMerken }) {
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({ name: "", preis: "", einheit: "", artNr: "" });
  // Signatur der gerade geladenen Dateiform + Hinweis, ob die Zuordnung aus
  // dem Gedaechtnis kam (dann fragt der Dialog dieselbe Form nie wieder).
  const [signatur, setSignatur] = useState("");
  const [ausGedaechtnis, setAusGedaechtnis] = useState(false);
  // Preissemantik: die TG-Artikelliste (Artikel/Artikelkurztext/VKP-ME/
  // Kundenpreis) fuehrt den Preis JE GEBINDE - die alte Annahme "EUR pro kg"
  // haette dort selbst bei Treffern falsche Preise geschrieben.
  const [semantik, setSemantik] = useState("gebinde");
  // Lieferant der Liste: gematcht und als veraltet gemeldet werden nur dessen Stammartikel
  // (seit 26.09.2026 fuehrt der Stamm auch BUNZL - Verpackung und Reinigung).
  const [lieferant, setLieferant] = useState("Transgourmet");
  const [ergebnis, setErgebnis] = useState(null);
  // Preisspruenge: je Artikel die getroffene Entscheidung (Text) bzw. die eingetippte Packungszahl
  const [sprungErledigt, setSprungErledigt] = useState({});
  const [sprungAnzahl, setSprungAnzahl] = useState({});
  // Transgourmet "CSV Erweitert": eigener Weg (tgimport.js) - Preis je kg/l/Stueck direkt aus
  // Karton, Inhalt und Rezeptmenge, Stamm-Packung = Liefergebinde.
  const [tg, setTg] = useState(null);              // { rows, anzahl }
  const [tgErgebnis, setTgErgebnis] = useState(null);
  const [tgErledigt, setTgErledigt] = useState({}); // key -> Text
  const [neuUebernommen, setNeuUebernommen] = useState(false);
  const fileRef = useRef(null);

  if (!open) return null;

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const uebernehmen = (res) => {
        if (istTgErweitert(res.meta?.fields || [])) {
          setLieferant("Transgourmet");
          setTg({ rows: res.data, anzahl: res.data.length });
          return;
        }
        const cols = res.meta?.fields || [];
        setPreview({ rows: res.data.slice(0, 5), cols, all: res.data });

        // 1. Gedaechtnis: dieselbe Dateiform schon einmal importiert? Dann
        //    genau die Zuordnung von damals - inkl. Preissemantik. Fehlt auch
        //    nur eine der gemerkten Spalten in der Datei, ist die Erinnerung
        //    wertlos und wir erkennen neu (sonst importierte der Dialog
        //    stillschweigend gegen eine Spalte, die es nicht mehr gibt).
        const sig = spaltenSignatur(cols);
        setSignatur(sig);
        const gemerkt = mappings[sig];
        const vollstaendig = gemerkt && ["name", "preis", "einheit", "artNr"]
          .every(k => !gemerkt[k] || cols.includes(gemerkt[k]));
        if (gemerkt && vollstaendig) {
          setMapping({
            name: gemerkt.name || "", preis: gemerkt.preis || "",
            einheit: gemerkt.einheit || "", artNr: gemerkt.artNr || "",
          });
          if (gemerkt.semantik) setSemantik(gemerkt.semantik);
          if (gemerkt.lieferant) setLieferant(gemerkt.lieferant);
          setAusGedaechtnis(true);
          return;
        }
        // 2. Sonst inhaltsbasiert erkennen (siehe preisimport.js) - die
        //    Kopfzeile allein hat bei "Artikeltext1" und den drei
        //    Preis-Spalten nicht getragen.
        setAusGedaechtnis(false);
        setMapping(erkenneSpalten(cols, res.data));
    };

    // Erst als UTF-8 lesen. Steht danach das Ersatzzeichen im Text, war die
    // Datei ANSI (Excel-Standard beim CSV-Export, auch der TG-Shop) - dann als
    // windows-1252. Sonst sind alle Umlaute kaputt und Artikel wie "Erdnuesse"
    // finden ihren Stamm-Eintrag nicht mehr. Der Text wird vor dem Parsen
    // gelesen, damit die kaputten Anfuehrungszeichen der TG-Liste repariert
    // werden koennen.
    f.arrayBuffer().then((buf) => {
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
      const kopf = text.slice(0, text.indexOf("\n") + 1);
      if (kopf.includes("Rezeptmenge") && kopf.includes("Inhalt")) text = repariereTgCsv(text);
      uebernehmen(Papa.parse(text, { header: true, skipEmptyLines: true }));
    });
  };

  const tgImportieren = () => {
    const bericht = onImportTg?.(tg.rows);
    setTg(null);
    setTgErgebnis(bericht || null);
  };

  const importieren = () => {
    if (!preview || !mapping.name || !mapping.preis) return;
    const aktualisierungen = preview.all
      .map(r => ({
        name:    r[mapping.name],
        preis:   parseFloat((r[mapping.preis] || "").toString().replace(",", ".")),
        einheit: r[mapping.einheit] || "kg",
        artNr:   r[mapping.artNr]   || null,
      }))
      .filter(r => r.name && !isNaN(r.preis));
    // Die tatsaechlich benutzte Zuordnung merken - auch die von Hand
    // korrigierte. Beim naechsten Upload derselben Dateiform fragt der Dialog
    // dann nicht noch einmal.
    if (signatur && onMappingMerken) onMappingMerken(signatur, mapping, semantik, lieferant);
    const bericht = onImport(aktualisierungen, semantik, lieferant);
    setPreview(null);
    setAusGedaechtnis(false);
    setErgebnis(bericht || null);
  };

  const schliessen = () => {
    setErgebnis(null); setPreview(null); setAusGedaechtnis(false); setSignatur("");
    setSprungErledigt({}); setSprungAnzahl({});
    setTg(null); setTgErgebnis(null); setTgErledigt({}); setNeuUebernommen(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="text-emerald-600" size={20} /> {lieferant}-Preisliste importieren
          </h2>
          <button onClick={schliessen} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {!ergebnis && !tg && !tgErgebnis && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="font-medium">Lieferant der Liste:</span>
              {LIEFERANTEN.map(l => (
                <button key={l} type="button" onClick={() => setLieferant(l)}
                  className={`px-3 py-1 rounded-full border text-sm ${lieferant === l ? "bg-green-700 border-green-700 text-white" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {tgErgebnis ? (
            <TgErgebnis e={tgErgebnis} erledigt={tgErledigt} neuUebernommen={neuUebernommen}
              onSprung={(sp, uebernehmen) => {
                if (uebernehmen) onTgArtikel?.({ [sp.key]: sp.artikel }, false);
                setTgErledigt(x => ({ ...x, [sp.key]: uebernehmen ? `übernommen: ${jeEinheit(sp.nachher, sp.zeile.basis)}` : "bleibt wie bisher" }));
              }}
              onAlleSpruenge={() => {
                const offen = tgErgebnis.spruenge.filter(sp => sp.artikel && !tgErledigt[sp.key]);
                onTgArtikel?.(Object.fromEntries(offen.map(sp => [sp.key, sp.artikel])), false);
                setTgErledigt(x => ({ ...x, ...Object.fromEntries(offen.map(sp => [sp.key, `übernommen: ${jeEinheit(sp.nachher, sp.zeile.basis)}`])) }));
              }}
              onNeu={() => {
                onTgArtikel?.(Object.fromEntries(tgErgebnis.neu.map(n => [n.artikel.ingredient_name.toLowerCase(), n.artikel])), true);
                setNeuUebernommen(true);
              }}
              onFertig={schliessen} />
          ) : tg ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 space-y-1">
                <div className="font-semibold">Transgourmet-Preisliste „CSV Erweitert“ erkannt · {tg.anzahl} Zeilen</div>
                <p className="text-xs text-emerald-800">
                  Der Preis je kg, l oder Stück wird direkt aus Kartonpreis, Inhalt und Rezeptmenge gerechnet.
                  Jeder Artikel bekommt das Liefergebinde als Packung, Gebinde-Faktoren sind nicht mehr nötig.
                  Abgeglichen wird über die Artikelnummer. Die neuen Preise fließen in alle Rezepturen, deren
                  Zutat mit dem Artikel verknüpft ist.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setTg(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Zurück</button>
                <button onClick={tgImportieren} className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">
                  Preise übernehmen
                </button>
              </div>
            </>
          ) : ergebnis ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Preise geändert", wert: ergebnis.geaendert, farbe: "text-green-700" },
                  { label: "unverändert (Stempel neu)", wert: ergebnis.unveraendert, farbe: "text-gray-700" },
                  { label: "ohne Treffer im Stamm", wert: ergebnis.ohneMatch.length, farbe: ergebnis.ohneMatch.length ? "text-amber-600" : "text-gray-700" },
                  { label: "Veraltet-Kandidaten", wert: ergebnis.veraltet.length, farbe: ergebnis.veraltet.length ? "text-red-600" : "text-gray-700" },
                ].map(k => (
                  <div key={k.label} className="border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500">{k.label}</div>
                    <div className={`text-xl font-bold tabular-nums ${k.farbe}`}>{k.wert}</div>
                  </div>
                ))}
              </div>
              {ergebnis.spruenge?.length > 0 && (
                <div className="border-2 border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-red-800">
                    <b>{ergebnis.spruenge.length} Preissprünge — nicht übernommen.</b> Der neue Preis weicht um das
                    Doppelte oder mehr ab. Meist führt die Liste ein anderes Gebinde als der Stamm (Karton statt
                    Packung). Bitte je Artikel entscheiden:
                  </p>
                  <table className="w-full text-xs">
                    <tbody>
                      {ergebnis.spruenge.map(sp => {
                        const erledigt = sprungErledigt[sp.key];
                        const n = +(sprungAnzahl[sp.key] ?? sp.vorschlag ?? 0);
                        const entscheide = (packungen, text) => {
                          onGebinde?.(sp.key, packungen, sp.listenpreis);
                          setSprungErledigt(e => ({ ...e, [sp.key]: text }));
                        };
                        return (
                          <tr key={sp.key} className="border-t border-gray-100 align-top">
                            <td className="py-2 pr-2">
                              <div className="font-medium text-gray-800">{sp.name}</div>
                              <div className="text-gray-500">
                                bisher {fmtNum2(sp.altPreis)} € · Liste {fmtNum2(sp.listenpreis)} €
                                {sp.packungen > 1 ? ` ÷ ${sp.packungen} = ${fmtNum2(sp.neuPreis)} €` : ""}
                                {" "}(×{new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(sp.faktor)})
                              </div>
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              {erledigt ? <span className="text-emerald-700">✓ {erledigt}</span> : (
                                <span className="inline-flex items-center gap-1">
                                  <input type="number" min="1" step="1" value={n || ""}
                                    onChange={e => setSprungAnzahl(a => ({ ...a, [sp.key]: e.target.value }))}
                                    title="Wie viele Stamm-Packungen stecken im Gebinde der Liste?"
                                    className="w-14 border border-gray-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                  <button disabled={!(n > 0)} onClick={() => entscheide(n, `${n} Packungen je Gebinde, ${fmtNum2(sp.listenpreis / n)} €`)}
                                    className="px-2 py-1 rounded border border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">
                                    Packungen je Gebinde
                                  </button>
                                  <button onClick={() => entscheide(sp.packungen, `${fmtNum2(sp.neuPreis)} € übernommen`)}
                                    className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                                    Preis so übernehmen
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {ergebnis.pruefen.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Ohne alten Gebindepreis übernommen, bitte prüfen: {ergebnis.pruefen.join(", ")}
                </p>
              )}
              {ergebnis.ohneMatch.length > 0 && (
                <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
                  CSV-Zeilen ohne Treffer im CALKU-Stamm (weder Nummer noch Name) — zum Kopieren:
                  <textarea readOnly rows={Math.min(6, ergebnis.ohneMatch.length)}
                    className="border border-gray-200 rounded-lg p-2 text-xs font-mono"
                    value={ergebnis.ohneMatch.map(z => `${z.artNr || "?"}  ${z.name || "?"}  ${z.preis}`).join("\n")} />
                </label>
              )}
              {ergebnis.veraltet.length > 0 && (
                <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
                  Stammartikel, deren Nummer in der CSV fehlt — veraltete Nummern ODER Artikel, die diese Liste
                  gar nicht führt (z. B. Frische bei der Trockensortiment-Liste). Nachpflegeliste:
                  <textarea readOnly rows={Math.min(6, ergebnis.veraltet.length)}
                    className="border border-gray-200 rounded-lg p-2 text-xs font-mono"
                    value={ergebnis.veraltet.map(a => `${a.article_number || "?"}  ${a.ingredient_name}`).join("\n")} />
                </label>
              )}
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  Änderungen sind übernommen
                </span>
                <button onClick={schliessen}
                  className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">
                  Fertig
                </button>
              </div>
            </>
          ) : !preview ? (
            <>
              <p className="text-sm text-gray-600">
                {lieferant === "BUNZL"
                  ? "Lade die aktuelle BUNZL-Preisliste als CSV hoch (Preis je Karton/VE). Abgeglichen wird über die BUNZL-Artikelnummer."
                  : "Lade die aktuelle Transgourmet-Preisliste als CSV hoch (Export aus shop.transgourmet.de)."}
                {" "}Die App erkennt die Spalten automatisch — du kannst sie danach bestätigen.
                Gematcht und als veraltet gemeldet werden nur Artikel dieses Lieferanten.
              </p>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg
                           file:border-0 file:text-sm file:font-medium file:bg-green-700 file:text-white
                           hover:file:bg-green-800 cursor-pointer" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { k: "name",    label: "Artikelname *" },
                  { k: "preis",   label: "Preis *" },
                  { k: "einheit", label: "Einheit" },
                  { k: "artNr",   label: "Artikelnummer" },
                ].map(f => (
                  <label key={f.k} className="text-xs font-medium text-gray-600 flex flex-col">
                    {f.label}
                    <select value={mapping[f.k]}
                      onChange={e => { setAusGedaechtnis(false); setMapping({ ...mapping, [f.k]: e.target.value }); }}
                      className="mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm bg-white">
                      <option value="">— Spalte wählen —</option>
                      {preview.cols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              {ausGedaechtnis && (
                <p className="text-xs text-gray-500">
                  Zuordnung übernommen aus dem letzten Import dieser Dateiform — änderbar, die Änderung wird gemerkt.
                </p>
              )}

              {(!mapping.name || !mapping.preis) && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {!mapping.name
                    ? `Die Spalte mit dem Artikelnamen wurde nicht automatisch erkannt. Bitte oben unter „Artikelname" die richtige Spalte wählen, bei Transgourmet-Listen ist das meist „Artikeltext1". Danach lässt sich der Import starten.`
                    : `Bitte oben unter „Preis" die richtige Spalte wählen, danach lässt sich der Import starten.`}
                </p>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">Vorschau (erste 5 Zeilen)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-t border-gray-200">
                      <tr>{preview.cols.map(c => <th key={c} className="text-left px-2 py-1 text-gray-600 font-medium">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {preview.cols.map(c => <td key={c} className="px-2 py-1 text-gray-700">{r[c]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-4 text-sm text-gray-700 border border-gray-200 rounded-lg p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="semantik" checked={semantik === "gebinde"}
                    onChange={() => setSemantik("gebinde")} />
                  Preis je Gebinde/VE (TG-Artikelliste, „Kundenpreis" — Standard)
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="semantik" checked={semantik === "grundpreis"}
                    onChange={() => setSemantik("grundpreis")} />
                  Preis je kg/l (Grundpreisliste)
                </label>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{preview.all.length} Zeilen werden importiert</span>
                <div className="flex gap-2">
                  <button onClick={() => setPreview(null)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Zurück</button>
                  <button onClick={importieren} disabled={!mapping.name || !mapping.preis}
                    className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:bg-gray-300">
                    Preise übernehmen
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// Ergebnis des erweiterten TG-Imports: Kennzahlen, Spruenge zur Entscheidung, neue Artikel.
function TgErgebnis({ e, erledigt, neuUebernommen, onSprung, onAlleSpruenge, onNeu, onFertig }) {
  const offen = e.spruenge.filter(sp => sp.artikel && !erledigt[sp.key]).length;
  const gruppen = {};
  for (const n of e.neu) { const g = n.artikel.einkaufsgruppe || "ohne Gruppe"; gruppen[g] = (gruppen[g] || 0) + 1; }
  const knopf = "px-2 py-1 rounded border text-xs whitespace-nowrap";
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Preise aktualisiert", wert: e.geaendert, farbe: "text-green-700" },
          { label: "bestätigt", wert: e.unveraendert, farbe: "text-gray-700" },
          { label: "Sprünge zur Entscheidung", wert: e.spruenge.length, farbe: e.spruenge.length ? "text-red-600" : "text-gray-700" },
          { label: "neu in der Liste", wert: e.neu.length, farbe: "text-gray-700" },
          { label: "nicht mehr in der Liste", wert: e.veraltet.length, farbe: e.veraltet.length ? "text-amber-600" : "text-gray-700" },
        ].map(k => (
          <div key={k.label} className="border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className={`text-xl font-bold tabular-nums ${k.farbe}`}>{k.wert}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Preisstand der Liste: {e.stand}. Aktualisierte Preise sind schon in den verknüpften Rezepturen.</p>

      {e.spruenge.length > 0 && (
        <div className="border-2 border-red-200 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-red-800 max-w-xl">
              <b>Diese Preise sind noch nicht übernommen.</b> Sie ändern sich um das Doppelte oder mehr, oder die
              Liste widerspricht sich selbst. Meist stand bisher ein Kartonpreis auf der Einzelpackung, dann ist der
              neue Preis richtig. Gelbe Hinweise bitte genau ansehen.
            </p>
            {offen > 0 && (
              <button onClick={onAlleSpruenge} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-700 text-white hover:bg-red-800">
                Alle {offen} übernehmen
              </button>
            )}
          </div>
          <table className="w-full text-xs">
            <tbody>
              {e.spruenge.map(sp => (
                <tr key={sp.key} className="border-t border-gray-100 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-gray-800">{sp.alt.ingredient_name}</div>
                    {sp.faktor && (
                      <div className="text-gray-500">
                        bisher {jeEinheit(sp.vorher, sp.zeile.basis)} → Liste {jeEinheit(sp.nachher, sp.zeile.basis)} (×{new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(sp.faktor)})
                      </div>
                    )}
                    {sp.grund && <div className="text-amber-700">{sp.grund}</div>}
                    <div className="text-gray-400">{sp.zeile.name} · {fmtNum2(sp.zeile.preis)} € je Karton mit {sp.zeile.inhalt} × {sp.zeile.rm}</div>
                  </td>
                  <td className="py-2 text-right">
                    {erledigt[sp.key] ? <span className="text-emerald-700 whitespace-nowrap">✓ {erledigt[sp.key]}</span>
                      : sp.artikel ? (
                        <span className="inline-flex gap-1">
                          <button onClick={() => onSprung(sp, true)} className={`${knopf} border-emerald-300 text-emerald-800 hover:bg-emerald-50`}>Übernehmen</button>
                          <button onClick={() => onSprung(sp, false)} className={`${knopf} border-gray-300 text-gray-600 hover:bg-gray-50`}>Nicht übernehmen</button>
                        </span>
                      ) : <span className="text-amber-700">von Hand</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {e.neu.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-gray-700 max-w-xl">
              <b>{e.neu.length} Artikel der Liste fehlen im Stamm.</b> Übernommen stehen sie mit Preis, Packung und
              Warengruppe bereit und tauchen als Vorschlag in der Zutaten-Zuordnung auf.
              <span className="block text-gray-500 mt-1">{Object.entries(gruppen).map(([g, n]) => `${g} ${n}`).join(" · ")}</span>
            </p>
            {neuUebernommen
              ? <span className="text-emerald-700">✓ übernommen</span>
              : <button onClick={onNeu} className="px-3 py-1.5 rounded-lg font-medium bg-green-700 text-white hover:bg-green-800">{e.neu.length} Artikel übernehmen</button>}
          </div>
        </div>
      )}

      {e.neuPruefen?.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-1 text-xs">
          <p className="text-amber-900"><b>{e.neuPruefen.length} neue Artikel nicht übernommen:</b> Bezeichnung und Liste
            widersprechen sich bei der Menge. Bitte mit der Rechnung prüfen und von Hand anlegen.</p>
          {e.neuPruefen.map(n => (
            <div key={n.zeile.artNr} className="border-t border-amber-200 pt-1">
              <span className="font-medium">{n.zeile.artNr} · {n.zeile.name}</span>
              <span className="block text-amber-800">{n.grund}</span>
            </div>
          ))}
        </div>
      )}

      {e.veraltet.length > 0 && (
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer">{e.veraltet.length} Transgourmet-Artikel im Stamm, die diese Liste nicht führt</summary>
          <textarea readOnly rows={Math.min(8, e.veraltet.length)} className="mt-2 w-full border border-gray-200 rounded-lg p-2 font-mono"
            value={e.veraltet.map(a => `${a.article_number || "?"}  ${a.ingredient_name}`).join("\n")} />
        </details>
      )}

      <div className="flex justify-end">
        <button onClick={onFertig} className="px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800">Fertig</button>
      </div>
    </>
  );
}
