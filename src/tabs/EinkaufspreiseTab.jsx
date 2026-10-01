// Einkaufspreise: Artikelstamm, Warengruppen, Gebinde-Check, neue Artikel. Aus App.jsx ausgelagert (28.09.2026).
import { useMemo, useState } from "react";
import { LIEFERANTEN } from "../preisimport.js";
import { stammUebernahme } from "../inventurstamm.js";
import inventurJson from "../data/inventur.json";
import { Download, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { gebindeBefunde } from "../gebinde.js";
import { PREISBASEN, fmtDate, fmtNum2, preisbasisAuto, stueckgewicht, stueckpreis } from "../kalkulation.js";
import { frage } from "../ui/dialog.jsx";
import { einheitenReparatur } from "../artikelpreis.js";
// ============================================================
//  EINKAUFSPREISE — Zutaten aus dem priceList, gruppiert
// ============================================================
export const EINKAUF_UNTERGRUPPEN = [
  "Frische",
  "Tiefkühl",
  "Molkerei & Vegan",
  "Proteine",
  "Saucen & Dressings",
  "Sirupe & Süßes",
  "Säfte & Getränke",
  "Brot & Wraps",
  "Trockenwaren & Toppings",
  "Verpackung",
  "Reinigung & Hygiene",
];
// Kein Sammelbecken "Sonstiges" mehr (28.09.2026): Jeder Artikel gehoert in eine echte
// Warengruppe. Was weder gepflegt noch erkennbar ist, steht als "Ohne Gruppe" ganz oben
// und wird dort zugeordnet - neue Artikel lassen sich ohne Gruppe gar nicht anlegen.
export const OHNE_GRUPPE = "Ohne Gruppe";
export const GRUPPEN_ANZEIGE = [OHNE_GRUPPE, ...EINKAUF_UNTERGRUPPEN];

// Warengruppe eines Stammartikels: gepflegtes Feld einkaufsgruppe, sonst Non-Food nach der
// Warengruppe der Inventurliste, sonst Vorschlag aus dem Namen, sonst "Ohne Gruppe".
export function einkaufsgruppeVon(a) {
  if (a?.einkaufsgruppe && EINKAUF_UNTERGRUPPEN.includes(a.einkaufsgruppe)) return a.einkaufsgruppe;
  if (a?.nonfood) return ["Reinigung", "Reinigungsmittel", "Diverses"].includes(a.warengruppe) ? "Reinigung & Hygiene" : "Verpackung";
  return untergruppeMitWarengruppe(kategorisiereZutat(a?.ingredient_name), a?.warengruppe);
}

// Vorschlag aus dem Namen - nur noch Startwert, gespeichert wird einkaufsgruppe.
export function kategorisiereZutat(name) {
  const n = (name || "").toLowerCase().trim();
  if (!n) return OHNE_GRUPPE;

  // Edge-Cases (überstimmen alle Patterns)
  if (n === "agavendicksaft") return "Sirupe & Süßes";
  if (n === "tortilla chips") return "Trockenwaren & Toppings";

  // Verpackung zuerst (Becher, Deckel, Besteck, etc.)
  if (/becher|deckel|strohhalm|trinkhalm|löffel|gabel|messer|serviette|einwickelpapier|faltenbeutel|salatschale|aufwärmschälchen|tragetasche|^verpackung$/.test(n)) return "Verpackung";

  // Tiefkühl (TK-Marker, Sorbet, Eis, Crushed Ice, frostige Halbfertige)
  if (/^tk\s|\stk\s|\stk$|tiefkühl|^acai|sorbet|joghurt\s?eis|ice cream|frappe weiß|frappepulver|crushed ice|crusheis|falafel tk|bulgur köfte/.test(n)) return "Tiefkühl";

  // Säfte & Getränke (Saft/Nektar/Schorle/Cola/Tee/Limonade/Wasser/Mischungen für Getränke)
  if (/saft\b|nektar|schorle|cola\b|fuze tea|pfanner|eistee|cold brew|kaffee frappe|lemonade|^getränke$|^wasser$|vio (still|medium)|monin cloudy|zitronenlimonade|frozen iced tea zutaten|^pfirsich mischung$|^maracuja mischung$|^hibiskus himbeere mischung$/.test(n)) return "Säfte & Getränke";

  // Sirupe & Süßes (Monin/Teisseire/Honig/Agave/Karamell/Schoko/Erdnussbutter)
  if (/sirup|honig\b|agavendicksaft|karamell|cinnamon plum|schokoladensoße|erdnussbutter/.test(n)) return "Sirupe & Süßes";

  // Saucen, Dressings, Pürees, Hummus, Dips, Aufstriche
  if (/sauce|dressing|vinaigrette|dip\b|aufstrich|püree|hummus|teriyaki|chipotle|sylter art|caesar/.test(n)) return "Saucen & Dressings";

  // Molkerei & Vegane Alternativen
  if (/h-milch|hafermilch|kokosmilch|kokosdrink|mandeldrink|^milch$|alpro|frischkäse|gran moravia|kräuterquark|violife/.test(n)) return "Molkerei & Vegan";

  // Proteine (Tofu, Chicken, Pulled, Eier, Pulver)
  if (/sesam tofu|chicken|pulled (beef|lachs)|hähnchen|^eier$|vanille (eiweiß|protein)|^protein\b|kollagen/.test(n)) return "Proteine";

  // Brot & Wraps
  if (/^wrap|tortilla|baguette|focaccia/.test(n)) return "Brot & Wraps";

  // Trockenwaren & Toppings (Reis, Quinoa, Hafer, Nüsse, Croutons, Pulver, Öl)
  if (/jasminreis|reis gekocht|garkartoffel|quinoa|haferflocke|körnermix|sesamkörner|kräutercrouton|röstzwiebel|^erdnüsse$|oreo|cookie|keks|granola|chia|kokosraspel|pistazien topping|matcha pulver|spirulina|traubenkernöl|datteln/.test(n)) return "Trockenwaren & Toppings";

  // Frische (Obst, Gemüse, Kräuter)
  if (/mixsalat|spinat|tomate|cherrytomate|gurke|möhre|möhren|rotkohl|rote bete|^mais|banane|orange|^zitrone|apfel|äpfel|jalapen|ingwer|^minze$|edamame|beere frisch|^heidelbeer|^erdbeer|^himbeer/.test(n)) return "Frische";

  return OHNE_GRUPPE;
}

// Frisch gepresste Säfte: Preis hängt von der Auspressquote (Nettomenge) ab.
export const FRISCH_ARTIKEL = [
  { key: "apfel",   label: "Äpfel",    zutat: "Frischer Apfelsaft" },
  { key: "orange",  label: "Orangen",  zutat: "Frischer Orangensaft" },
  { key: "karotte", label: "Karotten", zutat: "Karottensaft" },
];
export const FRISCH_INIT = { apfel: { preis: "", netto: "" }, orange: { preis: "", netto: "" }, karotte: { preis: "", netto: "" } };
export const parseDe = (s) => { const n = parseFloat(String(s).replace(/\s/g, "").replace(",", ".")); return isNaN(n) || n < 0 ? 0 : n; };

// Artikel aus der Inventurliste, die der Namens-Regel entgehen, landen nach ihrer Warengruppe
// statt unter "Ohne Gruppe".
export const WARENGRUPPE_ZU_UNTERGRUPPE = {
  "Tiefkühlwaren": "Tiefkühl", "Frische (CF Gastro)": "Frische", "Kühlwaren": "Molkerei & Vegan",
  "Dip & Saucen": "Saucen & Dressings", "Getränke": "Säfte & Getränke", "Säfte & Flüssigkeiten": "Säfte & Getränke",
  "Konserven & Haltbares": "Trockenwaren & Toppings", "Öl": "Trockenwaren & Toppings", "Kampagnenprodukte": "Sirupe & Süßes",
};
export const untergruppeMitWarengruppe = (untergruppe, warengruppe) =>
  untergruppe === OHNE_GRUPPE && WARENGRUPPE_ZU_UNTERGRUPPE[warengruppe] ? WARENGRUPPE_ZU_UNTERGRUPPE[warengruppe] : untergruppe;

// Artikel der Inventurliste, die der Stamm noch nicht fuehrt (inventurstamm.js; Entscheidungen
// 26.09.2026: BUNZL, dann Transgourmet). Erscheint nur, solange etwas zu tun ist. Moegliche
// Dubletten (gleicher Kernname) legt der Sammelknopf NICHT an - die entscheidet man einzeln.
export function StammUebernahme({ priceList, onArtikelPatches }) {
  const ergebnisse = useMemo(
    () => LIEFERANTEN.map(l => ({ lieferant: l, ...stammUebernahme(inventurJson, priceList || {}, l) })),
    [priceList]);
  const [msg, setMsg] = useState("");
  const offen = ergebnisse.filter(e => e.neu + e.verknuepft > 0 || e.pruefen.length > 0);
  if (!offen.length && !msg) return null;

  const eur = (v) => v == null ? "?" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(+v);
  const packung = (a) => `${a?.package_size ?? "?"} ${a?.unit || ""} für ${eur(a?.package_price)}`.replace(/\s+/g, " ");
  const alle = (e) => {
    onArtikelPatches?.(e.patches);
    setMsg(`✓ ${e.neu} ${e.lieferant}-Artikel angelegt${e.verknuepft ? `, ${e.verknuepft} vorhandene verknüpft` : ""}`);
  };
  const einzeln = ({ key, artikel }, text) => {
    onArtikelPatches?.({ [key]: artikel });
    setMsg(`✓ ${text}`);
  };
  const knopf = "rounded-lg px-3 py-1.5 text-xs font-medium border";

  return (
    <div className="space-y-3">
      {offen.map(e => (
        <div key={e.lieferant} className="bg-white rounded-xl border-2 border-emerald-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              <span className="font-semibold text-emerald-900">{e.lieferant}-Artikel aus der Inventurliste in den Stamm</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Inventurliste {inventurJson.stand}: {e.neu} neu
                {e.verknuepft ? `, ${e.verknuepft} vorhandene werden verknüpft` : ""}
                {e.pruefen.length ? `, ${e.pruefen.length} bitte unten einzeln entscheiden` : ""}.
                Preis je Gebinde aus der Liste; danach aktualisiert „CSV-Preise" (Lieferant {e.lieferant}) sie über
                die Artikelnummer, und IG-Inventur liest die Preise live.
              </span>
            </div>
            {e.neu + e.verknuepft > 0 && (
              <button onClick={() => alle(e)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0">
                <Plus size={14} /> {e.neu + e.verknuepft} {e.lieferant}-Artikel übernehmen
              </button>
            )}
          </div>
          {e.pruefen.length > 0 && (
            <div className="border-t border-emerald-100 pt-3">
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                Mögliche Dubletten: Im Stamm gibt es schon einen Artikel mit gleichem Namen. „Nummer übernehmen"
                nur, wenn es <b>derselbe Artikel mit gleicher Packung</b> ist (nicht frisch statt TK) — der nächste
                Preisimport zieht sonst falsche Preise in die Rezepturen. Im Zweifel: „Eigener Artikel".
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 pr-2 font-medium">Inventurliste</th>
                    <th className="py-1 pr-2 font-medium">Schon im Stamm</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {e.pruefen.map(p => (
                    <tr key={p.nummer} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-gray-800">{p.bezeichnung}</div>
                        <div className="text-gray-500">Nr. {p.nummer} · {packung(p.liste)}</div>
                      </td>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-gray-800">{p.calcu.ingredient_name}</div>
                        <div className="text-gray-500">
                          {p.platzhalter ? `ohne echte Nummer (${p.calcu.article_number || "leer"})` : `Nr. ${String(p.calcu.article_number).replace(/\.0$/, "")}`}
                          {" · "}{packung(p.calcu)}
                        </div>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {p.verknuepfung && (
                          <button onClick={() => einzeln(p.verknuepfung, `Nummer ${p.nummer} bei „${p.calcu.ingredient_name}" eingetragen`)}
                            className={`${knopf} border-emerald-300 text-emerald-800 hover:bg-emerald-50 mr-1`}>
                            Nummer übernehmen
                          </button>
                        )}
                        <button onClick={() => einzeln(p.neuerArtikel, `„${p.neuerArtikel.artikel.ingredient_name}" angelegt`)}
                          className={`${knopf} border-gray-300 text-gray-700 hover:bg-gray-50`}>
                          Eigener Artikel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      {msg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800 flex items-center justify-between gap-2">
          <span>{msg}</span>
          <button onClick={() => setMsg("")} className="text-emerald-400 hover:text-emerald-700"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

// Gebinde-Check (28.09.2026): Stamm-Packung gegen das Gebinde der Inventurliste (gebinde.js).
// Erscheint nur, solange es etwas zu entscheiden gibt.
export const eur = (v) => v == null ? "?" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 3 }).format(+v);
export const packungText = (a) => `${a?.package_size ?? "?"} ${a?.unit || ""} für ${eur(a?.package_price)}`.replace(/\s+/g, " ");

export function GebindeCheck({ priceList, onGebinde }) {
  const befunde = useMemo(() => gebindeBefunde(inventurJson, priceList || {}), [priceList]);
  const [anzahl, setAnzahl] = useState({});
  const [offen, setOffen] = useState(false);
  if (!befunde.length) return null;
  const karton = befunde.filter(b => b.art === "kartonpreis").length;
  const knopf = "rounded-lg px-3 py-1.5 text-xs font-medium border whitespace-nowrap";
  const TEXT = {
    kartonpreis: "Kartonpreis steht auf der Einzelpackung — Rezepturen zu teuer",
    gebinde: "Packung kleiner als das Liefergebinde — der nächste Import würde falsch rechnen",
    packung: "Packung im Stamm größer als das Liefergebinde — bitte Packungsgröße prüfen",
  };
  return (
    <div className={`bg-white rounded-xl border-2 p-4 space-y-3 ${karton ? "border-red-200" : "border-amber-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm text-gray-700">
          <span className={`font-semibold ${karton ? "text-red-800" : "text-amber-900"}`}>
            Gebinde-Check: {befunde.length} Artikel{karton ? `, davon ${karton} mit falschem Preis` : ""}
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Die Lieferantenliste führt Preise je Gebinde (Karton, Kiste), der Stamm oft die Einzelpackung.
            „Packungen je Gebinde“ festhalten — dann teilt jeder Import den Listenpreis richtig.
            Abgleich mit der Inventurliste {inventurJson.stand}.
          </span>
        </div>
        <button onClick={() => setOffen(o => !o)} className={`${knopf} border-gray-300 text-gray-700 hover:bg-gray-50`}>
          {offen ? "Zuklappen" : "Ansehen"}
        </button>
      </div>
      {offen && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2 font-medium">Artikel im Stamm</th>
              <th className="py-1 pr-2 font-medium">Liefergebinde</th>
              <th className="py-1 pr-2 font-medium text-right">Packungen je Gebinde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {befunde.map(b => {
              const n = +(anzahl[b.key] ?? b.vorschlag ?? 0);
              return (
                <tr key={b.key} className="border-t border-gray-100 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-gray-800">{b.name}</div>
                    <div className="text-gray-500">{packungText(b.artikel)}</div>
                    <div className={b.art === "kartonpreis" ? "text-red-700" : b.art === "packung" ? "text-gray-500" : "text-amber-700"}>{TEXT[b.art]}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="text-gray-800">{b.liste.bezeichnung}</div>
                    <div className="text-gray-500">
                      {eur(b.liste.preis_ve)} je {b.liste.ve || "VE"}{+b.liste.stk_pro_ve > 1 ? ` (${b.liste.stk_pro_ve} × ${eur(b.liste.preis_stk)})` : ""}
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {b.art !== "packung" && (
                      <input type="number" min="1" step="1" value={n || ""}
                        onChange={e => setAnzahl(a => ({ ...a, [b.key]: e.target.value }))}
                        className="w-16 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white" />
                    )}
                    {b.art === "kartonpreis" && n > 0 && (
                      <div className="text-gray-500 mt-1 whitespace-nowrap">neu: {eur(b.liste.preis_ve / n)} je Packung</div>
                    )}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap space-x-1">
                    {b.art === "kartonpreis" && (
                      <button disabled={!(n > 0)} onClick={() => onGebinde?.(b.key, n, b.liste.preis_ve)}
                        className={`${knopf} border-red-300 text-red-800 hover:bg-red-50 disabled:opacity-40`}>Preis korrigieren</button>
                    )}
                    {b.art === "gebinde" && (
                      <button disabled={!(n > 0)} onClick={() => onGebinde?.(b.key, n)}
                        className={`${knopf} border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:opacity-40`}>Gebinde festhalten</button>
                    )}
                    <button onClick={() => onGebinde?.(b.key, 1)}
                      title="Stamm-Packung = Liefergebinde. Der Artikel verschwindet aus dieser Liste."
                      className={`${knopf} border-gray-300 text-gray-600 hover:bg-gray-50`}>Passt so</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Warengruppen-Pflege: Artikel ohne gepflegte Gruppe. Der Vorschlag aus dem Namen wird mit einem
// Klick festgeschrieben; was keinen Vorschlag hat, steht unter "Ohne Gruppe" und wird in der
// Tabelle einzeln zugeordnet.
// Vertauschte Einheiten ("1000 kg" = 1000 g): ein Klick stellt alle auf g bzw. ml. Menge und
// Preise bleiben, die Rezepturen aendern sich nicht (artikelpreis.js, einheitenReparatur).
export function EinheitenPflege({ priceList, onArtikelPatches }) {
  const patches = useMemo(() => einheitenReparatur(priceList || {}), [priceList]);
  const [msg, setMsg] = useState("");
  const liste = Object.values(patches);
  if (!liste.length && !msg) return null;
  if (!liste.length) {
    return <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800">{msg}</div>;
  }
  const beispiele = liste.slice(0, 3).map(a => `„${a.ingredient_name}“ ${new Intl.NumberFormat("de-DE").format(a.package_size)} ${priceList[a.ingredient_name.toLowerCase()]?.unit}`).join(", ");
  const reparieren = async () => {
    const ok = await frage({ titel: "Einheiten reparieren", ja: `${liste.length} Artikel reparieren`,
      text: `${liste.length} Artikel bekommen g bzw. ml statt kg bzw. l. Packungsgröße, Packungspreis und Kilopreis bleiben gleich, die Rezepturen ändern sich nicht.` });
    if (!ok) return;
    onArtikelPatches?.(patches);
    setMsg(`✓ ${liste.length} Einheiten repariert. Packungspreise lassen sich jetzt gefahrlos ändern.`);
  };
  return (
    <div className="bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3 text-xs text-red-900 flex flex-wrap items-center justify-between gap-3">
      <span className="max-w-3xl">
        <b>{liste.length} Artikel mit vertauschter Einheit</b>, z. B. {beispiele}. Gemeint sind Gramm bzw. Milliliter.
        Der Kilopreis stimmt, aber eine Änderung des Packungspreises würde 1.000-fach zu niedrig rechnen.
        Bitte vor der Preispflege reparieren.
      </span>
      <button onClick={reparieren} className="shrink-0 rounded-lg px-3 py-1.5 font-medium bg-red-700 text-white hover:bg-red-800">
        Einheiten reparieren
      </button>
    </div>
  );
}

export function GruppenPflege({ zutaten, priceList, onArtikelPatches, onZeigen }) {
  const [msg, setMsg] = useState("");
  const mitVorschlag = zutaten.filter(z => !z.gruppeGepflegt && z.untergruppe !== OHNE_GRUPPE);
  const ohne = zutaten.filter(z => z.untergruppe === OHNE_GRUPPE).length;
  if (!mitVorschlag.length && !ohne && !msg) return null;
  const festschreiben = () => {
    const patches = {};
    for (const z of mitVorschlag) {
      const key = z.name.toLowerCase();
      if (priceList[key]) patches[key] = { ...priceList[key], einkaufsgruppe: z.untergruppe };
    }
    onArtikelPatches?.(patches);
    setMsg(`✓ ${Object.keys(patches).length} Warengruppen festgeschrieben`);
  };
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
      <span>
        {ohne > 0 && <><b>{ohne} Artikel ohne Warengruppe</b> — bitte in der Tabelle zuordnen. </>}
        {mitVorschlag.length > 0 && <>{mitVorschlag.length} Artikel tragen nur einen Vorschlag aus dem Namen (grau). </>}
        {msg && <span className="text-emerald-800">{msg}</span>}
      </span>
      <span className="flex gap-2">
        {ohne > 0 && (
          <button onClick={onZeigen} className="rounded-lg px-3 py-1.5 font-medium border border-amber-400 bg-white hover:bg-amber-100">
            Ohne Gruppe zeigen
          </button>
        )}
        {mitVorschlag.length > 0 && (
          <button onClick={festschreiben} className="rounded-lg px-3 py-1.5 font-medium bg-emerald-700 text-white hover:bg-emerald-800">
            Vorschläge festschreiben
          </button>
        )}
      </span>
    </div>
  );
}

export function EinkaufspreiseTab({ priceList, produkte = [], onFrischpreise, onAddArtikel, onGebinde, onPreisAbgleich, onDeleteArtikel, onUpdateArtikel, onAltAusbeute, onArtikelPatches, onSpeichern, speichernMsg, canEdit = true }) {
  const [suche, setSuche]       = useState("");
  const [gruppe, setGruppe]     = useState("Alle");
  const [sortBy, setSortBy]     = useState("name");
  const [sortDir, setSortDir]   = useState("asc");
  const [frischOpen, setFrischOpen] = useState(false);
  const [frisch, setFrisch]     = useState(FRISCH_INIT);
  const [frischMsg, setFrischMsg] = useState("");
  const [artikelOpen, setArtikelOpen] = useState(false);
  const NEU_ART_LEER = { name: "", artNr: "", gruppe: "", einheit: "g", preis: "", menge: "", stueckGramm: "" };
  const [neuArt, setNeuArt]     = useState(NEU_ART_LEER);
  const [artMsg, setArtMsg]     = useState("");
  const [abgleichMsg, setAbgleichMsg] = useState("");

  // aktueller €/g je Zutat (aus den Rezepturen) – für die Anzeige „aktuell"
  const aktuellerProG = useMemo(() => {
    const m = {};
    for (const p of produkte) for (const z of (p.zutaten || [])) {
      if (m[z.name] == null && z.preis_pro_g != null) m[z.name] = z.preis_pro_g;
    }
    return m;
  }, [produkte]);

  const frischUebernehmen = () => {
    const list = [];
    for (const a of FRISCH_ARTIKEL) {
      const preis = parseDe(frisch[a.key].preis);
      const netto = parseDe(frisch[a.key].netto);
      if (preis > 0 && netto > 0) list.push({ name: a.zutat, proG: preis / netto });
    }
    if (!list.length) { setFrischMsg("Bitte für mindestens einen Artikel Preis und Nettomenge eingeben."); return; }
    onFrischpreise?.(list);
    setFrischMsg(`✓ ${list.length} Artikel aktualisiert.`);
  };

  // Neuer Einkaufsartikel: Warengruppe ist Pflicht. Inhalt je Packung in g, ml oder Stück -
  // bis 09/2026 stand "kg" in der Einheit und die Menge in Gramm, der Artikel war damit
  // 1000-fach zu gross; Stück wurde trotzdem als €/kg gerechnet.
  const neuArtRechnung = (() => {
    const preis = parseDe(neuArt.preis), menge = parseDe(neuArt.menge), gramm = parseDe(neuArt.stueckGramm);
    if (!(preis > 0 && menge > 0)) return null;
    if (neuArt.einheit === "stk") {
      const jeStueck = preis / menge;
      return { jeStueck, proG: gramm > 0 ? jeStueck / gramm : null, text: `${fmtNum2(jeStueck)} €/Stk` };
    }
    const proG = preis / menge;
    return { proG, text: `${fmtNum2(proG * 1000)} ${neuArt.einheit === "ml" ? "€/l" : "€/kg"}` };
  })();

  const artikelSpeichern = () => {
    const name = neuArt.name.trim();
    if (!name) { setArtMsg("Bitte einen Artikelnamen eingeben."); return; }
    if (!neuArt.gruppe) { setArtMsg("Bitte eine Warengruppe wählen."); return; }
    if (priceList?.[name.toLowerCase()]) { setArtMsg(`„${name}" gibt es schon — bitte in der Tabelle ändern.`); return; }
    const r = neuArtRechnung;
    if (!r) { setArtMsg("Bitte Einkaufspreis und Inhalt der Packung (> 0) eingeben."); return; }
    const preis = parseDe(neuArt.preis), menge = parseDe(neuArt.menge);
    const stueck = neuArt.einheit === "stk";
    const gramm = parseDe(neuArt.stueckGramm);
    onAddArtikel?.({
      ingredient_name: name,
      article_number: neuArt.artNr.trim(),
      einkaufsgruppe: neuArt.gruppe,
      unit: stueck ? "Stück" : neuArt.einheit,
      preisbasis: stueck ? "stueck" : neuArt.einheit === "ml" ? "ml100" : "gramm",
      package_size: menge,
      package_price: preis,
      ...(stueck
        ? { net_price_per_unit: +r.jeStueck.toFixed(6), ...(gramm > 0 ? { gewicht_je_stueck_g: gramm } : {}),
            price_per_gram_ml: r.proG != null ? +r.proG.toFixed(10) : null }
        : { net_weight: menge, price_per_gram_ml: +r.proG.toFixed(10) }),
      manuell: true,
    });
    setArtMsg(`✓ „${name}" angelegt (${r.text}, ${neuArt.gruppe}). Sofort als Zutat nutzbar.`);
    setNeuArt(NEU_ART_LEER);
  };

  const zutaten = useMemo(() => {
    const arr = Object.values(priceList || {});
    return arr.map(z => ({
      name:           z.ingredient_name || "",
      art:            z.article_number ? String(z.article_number).replace(/\.0$/, "") : "",
      einheit:        z.unit || "",
      packGroesse:    z.package_size ?? null,
      packPreis:      z.package_price ?? null,
      preisProGramm:  z.price_per_gram_ml ?? null,
      ausbeute:       z.ausbeute_prozent ?? null,
      preisbasis:     z.preisbasis ?? null,
      gewichtJeStueck: z.gewicht_je_stueck_g ?? null,
      preisManuellAm: z.preis_manuell_am ?? null,
      lieferant:      z.lieferant ?? null,
      untergruppe:    einkaufsgruppeVon(z),
      gruppeGepflegt: !!z.einkaufsgruppe,
    }));
  }, [priceList]);

  // Einheit, Packungsgroesse, Packungspreis und Kilopreis sind HIER aenderbar
  // (Eigenschaft des Artikels). Jede Aenderung geht ueber onUpdateArtikel und
  // wird sofort in alle Rezepturen gestempelt. Eingaben gelten beim Verlassen
  // des Feldes oder mit Enter.
  const EINHEIT_OPTIONEN = ["kg", "g", "l", "ml", "Stück"];
  const commitOnEnter = (e) => { if (e.key === "Enter") e.currentTarget.blur(); };
  const preisZellen = (z) => {
    const proKg = z.preisProGramm != null ? z.preisProGramm * 1000 : null;
    const manuell = z.preisManuellAm ? `von Hand geändert am ${fmtDate(z.preisManuellAm)}` : null;
    if (!canEdit) {
      return (
        <>
          <td className="px-3 py-2 text-gray-500 text-xs">{z.einheit || "—"}</td>
          <td className="px-3 py-2 text-right tabular-nums">{z.packGroesse != null ? `${new Intl.NumberFormat("de-DE").format(z.packGroesse)} ${z.einheit || ""}` : "—"}</td>
          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtPreis(z.packPreis)}</td>
          <td className="px-3 py-2 text-right tabular-nums text-gray-600 text-xs" title={manuell || undefined}>
            {fmtPreisProG(z.preisProGramm)}{manuell && <span className="ml-1 text-emerald-700">✎</span>}
          </td>
        </>
      );
    }
    const einheiten = !z.einheit || EINHEIT_OPTIONEN.includes(z.einheit) ? EINHEIT_OPTIONEN : [z.einheit, ...EINHEIT_OPTIONEN];
    const cls = "border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white focus:border-emerald-500 outline-none";
    const anders = (v, alt) => v > 0 && Math.abs(v - (+alt || 0)) > 1e-9;
    return (
      <>
        <td className="px-3 py-2">
          <select value={z.einheit || ""} onChange={e => onUpdateArtikel?.(z.name, { unit: e.target.value })}
            className="border border-gray-200 rounded px-1 py-1 text-xs bg-white" title="Einheit der Packung">
            {!z.einheit && <option value="">—</option>}
            {einheiten.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td className="px-3 py-2 text-right">
          <input type="number" min="0" step="any" key={`ps_${z.name}_${z.packGroesse ?? ""}`}
            defaultValue={z.packGroesse ?? ""} placeholder="Größe" onKeyDown={commitOnEnter}
            onBlur={e => { const v = +e.target.value; if (anders(v, z.packGroesse)) onUpdateArtikel?.(z.name, { package_size: v }); }}
            title="Packungsgröße in der Einheit links — der Preis je Gramm wird daraus neu gerechnet"
            className={`w-20 ${cls}`} />
        </td>
        <td className="px-3 py-2 text-right">
          <span className="inline-flex items-center gap-1">
            <input type="number" min="0" step="0.01" key={`pp_${z.name}_${z.packPreis ?? ""}`}
              defaultValue={z.packPreis ?? ""} placeholder="Preis" onKeyDown={commitOnEnter}
              onBlur={e => { const v = +e.target.value; if (anders(v, z.packPreis)) onUpdateArtikel?.(z.name, { package_price: v }); }}
              title="Einkaufspreis je Packung — der Preis je Gramm wird daraus neu gerechnet"
              className={`w-20 ${cls} font-medium`} />
            <span className="text-xs text-gray-500">€</span>
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1">
              <input type="number" min="0" step="0.01" key={`pk_${z.name}_${proKg ?? ""}`}
                defaultValue={proKg != null ? +proKg.toFixed(2) : ""} placeholder="€/kg" onKeyDown={commitOnEnter}
                onBlur={e => { const v = +e.target.value; if (v > 0 && Math.abs(v - (proKg || 0)) > 0.004) onUpdateArtikel?.(z.name, { price_per_gram_ml: v / 1000 }); }}
                title="Kilopreis direkt setzen — der Packungspreis wird passend gezogen, alle Rezepturen mit dieser Zutat rechnen neu"
                className={`w-20 ${cls}`} />
              <span className="text-xs text-gray-500">€/kg</span>
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums" title={manuell || undefined}>
              {z.preisProGramm != null
                ? `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(z.preisProGramm)} €/g`
                : "kein Grammpreis"}
              {manuell && <span className="ml-1 text-emerald-700">✎ von Hand</span>}
            </span>
          </div>
        </td>
      </>
    );
  };

  // Warengruppe je Artikel: Pflichtfeld, hier zuordnen oder ändern. Solange nur der
  // Vorschlag aus dem Namen gilt, ist sie grau; "Ohne Gruppe" ist gelb markiert.
  const gruppeZelle = (z) => {
    const ohne = z.untergruppe === OHNE_GRUPPE;
    if (!canEdit) return <td className="px-3 py-2 text-xs text-gray-500">{z.untergruppe}</td>;
    return (
      <td className="px-3 py-2">
        <select value={ohne ? "" : z.untergruppe}
          onChange={e => e.target.value && onUpdateArtikel?.(z.name, { einkaufsgruppe: e.target.value })}
          title={z.gruppeGepflegt ? "Warengruppe (gepflegt)" : ohne ? "Bitte Warengruppe zuordnen" : "Vorschlag aus dem Namen — mit Auswahl festlegen"}
          className={`border rounded px-1 py-1 text-xs bg-white max-w-[9.5rem] ${ohne ? "border-amber-400 text-amber-800 bg-amber-50" : z.gruppeGepflegt ? "border-gray-200 text-gray-800" : "border-gray-200 text-gray-400"}`}>
          {ohne && <option value="">bitte wählen …</option>}
          {EINKAUF_UNTERGRUPPEN.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </td>
    );
  };

  // Ausbeute und g/Stück werden HIER zentral gepflegt (Eigenschaft des
  // Artikels, nicht der Rezeptzeile) und wirken sofort auf alle Rezepturen.
  const ausbeuteZellen = (z) => (
    <>
      <td className="px-3 py-2 text-right">
        {canEdit ? (
          <input type="number" min="1" max="100" step="1"
            key={`a_${z.name}_${z.ausbeute ?? 100}`}
            defaultValue={z.ausbeute ?? 100}
            onBlur={e => { const v = +e.target.value;
              onUpdateArtikel?.(z.name, { ausbeute_prozent: v >= 1 && v < 100 ? v : null }); }}
            className="w-14 border border-gray-200 rounded px-1.5 py-1 text-xs text-right tabular-nums bg-white" />
        ) : <span className="tabular-nums text-xs">{z.ausbeute ?? 100} %</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {(() => {
          const art = { unit: z.einheit, package_size: z.packGroesse,
                        package_price: z.packPreis, price_per_gram_ml: z.preisProGramm,
                        preisbasis: z.preisbasis, gewicht_je_stueck_g: z.gewichtJeStueck };
          const basis = z.preisbasis || preisbasisAuto(art);
          const gewicht = stueckgewicht({ ...art, preisbasis: basis });
          const jeStueck = stueckpreis({ ...art, preisbasis: basis });
          const fmt0 = (v) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(v);
          return (
            <div className="flex flex-col items-end gap-0.5">
              {canEdit ? (
                <select value={basis}
                  onChange={e => onUpdateArtikel?.(z.name, { preisbasis: e.target.value })}
                  className="border border-gray-200 rounded px-1 py-1 text-xs bg-white">
                  {PREISBASEN.map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
                </select>
              ) : <span className="text-xs">{(PREISBASEN.find(p => p[0] === basis) || ["", "—"])[1]}</span>}
              {basis === "stueck" && (
                <span className="text-[10px] text-gray-400 tabular-nums inline-flex items-center gap-1">
                  {canEdit ? (
                    <input type="number" min="0" step="1"
                      key={`g_${z.name}_${z.gewichtJeStueck ?? ""}`}
                      defaultValue={z.gewichtJeStueck ?? ""}
                      placeholder={gewicht ? `≈ ${fmt0(gewicht)}` : "?"}
                      onBlur={e => { const v = +e.target.value; onUpdateArtikel?.(z.name, { gewicht_je_stueck_g: v > 0 ? v : null }); }}
                      title="Gramm je Stück — leer = rechnerisch aus Stückpreis ÷ Preis pro Gramm. Pflegen, wo die Liste keinen Grammpreis kennt (Eier: 50 g)."
                      className="w-14 border border-gray-200 rounded px-1 py-0.5 text-[10px] text-right bg-white" />
                  ) : (gewicht ? `≈ ${fmt0(gewicht)}` : "—")}
                  g/Stück{jeStueck != null && <span> · {fmtNum2(jeStueck)} €/Stk</span>}
                </span>
              )}
            </div>
          );
        })()}
      </td>
    </>
  );

  const gruppenZaehlung = useMemo(() => {
    const z = {};
    for (const u of GRUPPEN_ANZEIGE) z[u] = 0;
    for (const it of zutaten) z[it.untergruppe] = (z[it.untergruppe] || 0) + 1;
    return z;
  }, [zutaten]);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    let arr = zutaten.filter(z => {
      if (gruppe !== "Alle" && z.untergruppe !== gruppe) return false;
      if (q && !z.name.toLowerCase().includes(q) && !z.art.includes(q)) return false;
      return true;
    });

    // Sortierung: erst nach Untergruppe (in fester Reihenfolge), dann nach Spalte
    const gruppenIdx = (g) => {
      const i = GRUPPEN_ANZEIGE.indexOf(g);
      return i === -1 ? 999 : i;
    };
    arr.sort((a, b) => {
      if (gruppe === "Alle") {
        const gd = gruppenIdx(a.untergruppe) - gruppenIdx(b.untergruppe);
        if (gd !== 0) return gd;
      }
      const va = a[sortBy] ?? "";
      const vb = b[sortBy] ?? "";
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else if (va === null || va === "") cmp = 1;
      else if (vb === null || vb === "") cmp = -1;
      else cmp = String(va).localeCompare(String(vb), "de");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [zutaten, suche, gruppe, sortBy, sortDir]);

  const sortHeader = (key, label, align = "right") => (
    <th className={`text-${align} px-3 py-2 font-medium cursor-pointer hover:bg-gray-100`}
        onClick={() => {
          if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
          else { setSortBy(key); setSortDir(align === "right" ? "desc" : "asc"); }
        }}>
      {label}{sortBy === key && (sortDir === "asc" ? " ▲" : " ▼")}
    </th>
  );

  const fmtPreis = (v) =>
    v == null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);

  const fmtPreisProG = (v) => {
    if (v == null) return "—";
    // sehr kleine Werte als €/kg umrechnen für Lesbarkeit
    const proKg = v * 1000;
    return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v)} €/g  ·  ${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(proKg)} €/kg`;
  };

  // Gruppierte Ausgabe wenn "Alle" gewählt — sonst flache Liste
  const renderTabelle = () => {
    if (gruppe !== "Alle") {
      return (
        <tbody>
          {sichtbar.length === 0 && (
            <tr><td colSpan={canEdit ? 10 : 9} className="px-3 py-8 text-center text-gray-400 text-sm">
              Keine Treffer. Filter anpassen.
            </td></tr>
          )}
          {sichtbar.map((z, i) => (
            <tr key={`${z.name}_${i}`} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-800">{z.name}</td>
              <td className="px-3 py-2 text-gray-500 text-xs tabular-nums">{z.art || "—"}</td>
              {gruppeZelle(z)}
              {preisZellen(z)}
              {ausbeuteZellen(z)}
              {canEdit && (
                <td className="px-2 py-2 text-center">
                  <button onClick={() => frage({ text: `Artikel „${z.name}“ wirklich aus der Preisliste löschen?`, ja: "Löschen", gefahr: true }).then(ok => ok && onDeleteArtikel?.(z.name))}
                    className="text-gray-300 hover:text-red-600 p-1" title="Artikel löschen">
                    <Trash2 size={13} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      );
    }
    // Gruppiert
    const bloecke = [];
    let aktuelleGruppe = null;
    let buffer = [];
    const flush = () => {
      if (aktuelleGruppe && buffer.length) {
        bloecke.push(
          <tbody key={aktuelleGruppe}>
            <tr className="bg-emerald-50">
              <td colSpan={canEdit ? 10 : 9} className="px-3 py-2 text-xs font-semibold text-emerald-900 uppercase tracking-wide">
                {aktuelleGruppe} <span className="text-emerald-600 font-normal">· {buffer.length}</span>
              </td>
            </tr>
            {buffer}
          </tbody>
        );
      }
    };
    for (const [i, z] of sichtbar.entries()) {
      if (z.untergruppe !== aktuelleGruppe) {
        flush();
        aktuelleGruppe = z.untergruppe;
        buffer = [];
      }
      buffer.push(
        <tr key={`${z.name}_${i}`} className="border-b border-gray-100 hover:bg-gray-50">
          <td className="px-3 py-2 text-gray-800">{z.name}</td>
          <td className="px-3 py-2 text-gray-500 text-xs tabular-nums">{z.art || "—"}</td>
          {gruppeZelle(z)}
          {preisZellen(z)}
          {ausbeuteZellen(z)}
          {canEdit && (
            <td className="px-2 py-2 text-center">
              <button onClick={() => frage({ text: `Artikel „${z.name}“ wirklich aus der Preisliste löschen?`, ja: "Löschen", gefahr: true }).then(ok => ok && onDeleteArtikel?.(z.name))}
                className="text-gray-300 hover:text-red-600 p-1" title="Artikel löschen">
                <Trash2 size={13} />
              </button>
            </td>
          )}
        </tr>
      );
    }
    flush();
    if (bloecke.length === 0) {
      return (
        <tbody>
          <tr><td colSpan={canEdit ? 10 : 9} className="px-3 py-8 text-center text-gray-400 text-sm">
            Keine Treffer. Filter anpassen.
          </td></tr>
        </tbody>
      );
    }
    return <>{bloecke}</>;
  };

  const fmtKg = (proG) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(proG * 1000);
  const fmtG  = (proG) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(proG);

  return (
    <div className="space-y-4">
      {/* Eigene Preise pflegen */}
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-800">Eigene Preise pflegen</span> — Einheit, Packungsgröße, Packungspreis und Kilopreis direkt in der Tabelle ändern (Feld verlassen oder Enter), neuen Einkaufsartikel anlegen oder Frischpress-Preise setzen. Jede Preisänderung rechnet sofort alle Rezepturen mit dieser Zutat neu.
            <span className="block text-xs text-amber-600 mt-1">
              Ausbeute %: Wie viel der eingekauften Ware im Produkt ankommt (geschälte Ananas ≈ 60). Bei Presswaren ist es die Auspressquote in ml je Gramm Einkauf: 40 heißt, aus 1 kg Möhren werden 400 ml Saft — so wird aus dem Kilopreis der Milliliterpreis. Wirkt sofort auf alle Rezepturen mit dieser Zutat; der Preis muss dann der reine Einkaufspreis sein, sonst wird der Verschnitt doppelt gerechnet.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => {
                const n = onPreisAbgleich?.() ?? 0;
                setAbgleichMsg(n > 0
                  ? `✓ ${n} Zutatenpreise in die Rezepturen übernommen`
                  : "Alle Rezept-Zutaten haben bereits einen Preis — nichts zu übernehmen.");
              }}
              className="bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0"
              title="Zutaten ohne Preis tolerant mit der Preisliste abgleichen und Preise ziehen">
              <RotateCcw size={14} /> Preise aus Liste ziehen
            </button>
            <button onClick={() => onAltAusbeute?.()}
              className="bg-white border border-amber-400 text-amber-700 hover:bg-amber-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0"
              title="Aus der alten Excel-Liste steckt bei manchen Frischwaren der Verschnitt noch IM Listenpreis (Apfel: netto 1,25 €/kg, Liste 2,08 €/kg). Diese Bereinigung setzt den Preis auf netto zurück und trägt den Faktor in die Ausbeute-Spalte ein — Rezeptkosten bleiben unverändert.">
              Alt-Ausbeuten bereinigen
            </button>
            <button onClick={() => { setArtikelOpen(o => !o); setArtMsg(""); }}
              className="bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0">
              <Plus size={14} /> Neuer Artikel
            </button>
            <button onClick={() => { setFrischOpen(o => !o); setFrischMsg(""); }}
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 shrink-0">
              <Pencil size={14} /> Frischpress-Preise
            </button>
          </div>
        </div>
      )}

      {canEdit && <StammUebernahme priceList={priceList} onArtikelPatches={onArtikelPatches} />}

      {canEdit && <GebindeCheck priceList={priceList} onGebinde={onGebinde} />}

      {canEdit && <EinheitenPflege priceList={priceList} onArtikelPatches={onArtikelPatches} />}

      {canEdit && <GruppenPflege zutaten={zutaten} priceList={priceList} onArtikelPatches={onArtikelPatches}
        onZeigen={() => setGruppe(OHNE_GRUPPE)} />}

      {canEdit && abgleichMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800 flex items-center justify-between gap-2">
          <span>{abgleichMsg}</span>
          <button onClick={() => setAbgleichMsg("")} className="text-emerald-400 hover:text-emerald-700"><X size={14} /></button>
        </div>
      )}

      {canEdit && artikelOpen && (
        <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">Neuer Einkaufsartikel</h3>
              <p className="text-xs text-gray-500 mt-0.5">Eigenen Artikel + Preis anlegen (z. B. für eine Kampagne). Stückware (Kekse, Eier, Wraps) als „Stück“ anlegen, dann rechnet die Rezeptur je Stück. Sofort als Zutat verwendbar.</p>
            </div>
            <button onClick={() => setArtikelOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <label className="md:col-span-4 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Artikelname *</span>
              <input value={neuArt.name} onChange={e => setNeuArt(s => ({ ...s, name: e.target.value }))}
                onBlur={() => setNeuArt(s => {
                  if (s.gruppe || !s.name.trim()) return s;
                  const v = kategorisiereZutat(s.name);
                  return v === OHNE_GRUPPE ? s : { ...s, gruppe: v };
                })}
                placeholder="z. B. Sommer-Sirup Pfirsich" className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
            </label>
            <label className="md:col-span-3 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Warengruppe *</span>
              <select value={neuArt.gruppe} onChange={e => setNeuArt(s => ({ ...s, gruppe: e.target.value }))}
                className={`border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none ${neuArt.gruppe ? "" : "text-gray-400"}`}>
                <option value="">bitte wählen …</option>
                {EINKAUF_UNTERGRUPPEN.map(g => <option key={g} value={g} className="text-gray-800">{g}</option>)}
              </select>
            </label>
            <label className="md:col-span-2 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Artikel-Nr.</span>
              <input value={neuArt.artNr} onChange={e => setNeuArt(s => ({ ...s, artNr: e.target.value }))}
                placeholder="optional" className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
            </label>
            <div className="md:col-span-3 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Rechnet in</span>
              <div className="flex rounded border border-gray-200 overflow-hidden text-sm">
                {[["g", "Gramm"], ["ml", "Milliliter"], ["stk", "Stück"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setNeuArt(s => ({ ...s, einheit: k }))}
                    className={`flex-1 px-2 py-1.5 ${neuArt.einheit === k ? "bg-emerald-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>{l}</button>
                ))}
              </div>
            </div>
            <label className="md:col-span-3 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">Einkaufspreis je Packung (€)</span>
              <input value={neuArt.preis} inputMode="decimal" onChange={e => setNeuArt(s => ({ ...s, preis: e.target.value }))}
                placeholder="z. B. 8,90" className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
            </label>
            <label className="md:col-span-3 flex flex-col">
              <span className="text-[11px] text-gray-500 mb-0.5">
                Inhalt je Packung ({neuArt.einheit === "stk" ? "Stück" : neuArt.einheit})
              </span>
              <input value={neuArt.menge} inputMode="decimal" onChange={e => setNeuArt(s => ({ ...s, menge: e.target.value }))}
                placeholder={neuArt.einheit === "stk" ? "z. B. 14 Kekse" : "z. B. 1000"} className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
            </label>
            {neuArt.einheit === "stk" && (
              <label className="md:col-span-3 flex flex-col">
                <span className="text-[11px] text-gray-500 mb-0.5">Gramm je Stück (optional)</span>
                <input value={neuArt.stueckGramm} inputMode="decimal" onChange={e => setNeuArt(s => ({ ...s, stueckGramm: e.target.value }))}
                  placeholder="für Bestellvorschlag, z. B. 11" className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
              </label>
            )}
            <div className="md:col-span-3 flex flex-col justify-end pb-1.5">
              <span className="text-[11px] text-gray-500">Ergibt</span>
              <span className="text-sm font-semibold text-emerald-800 tabular-nums">{neuArtRechnung ? neuArtRechnung.text : "—"}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-700">{artMsg}</span>
            <button onClick={artikelSpeichern}
              className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-4 py-2 text-sm font-medium">Artikel anlegen</button>
          </div>
        </div>
      )}

      {canEdit && frischOpen && (
        <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">Frischpress-Preise · Auspressquote</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Einkaufspreis ÷ ausgepresste Nettomenge = €/g. Wird auf alle Rezepturen mit dieser Zutat angewendet.
              </p>
            </div>
            <button onClick={() => setFrischOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          <div className="space-y-2">
            {FRISCH_ARTIKEL.map(a => {
              const row = frisch[a.key];
              const preis = parseDe(row.preis), netto = parseDe(row.netto);
              const proG = (preis > 0 && netto > 0) ? preis / netto : null;
              const cur = aktuellerProG[a.zutat];
              return (
                <div key={a.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center border border-gray-100 rounded-lg p-2.5">
                  <div className="md:col-span-3">
                    <div className="text-sm font-medium text-gray-800">{a.label}</div>
                    <div className="text-xs text-gray-400">
                      {a.zutat}{cur != null && ` · aktuell ${fmtKg(cur)} €/kg`}
                    </div>
                  </div>
                  <label className="md:col-span-3 flex flex-col">
                    <span className="text-[11px] text-gray-500 mb-0.5">Einkaufspreis (€)</span>
                    <input value={row.preis} inputMode="decimal" placeholder="z. B. 12,50"
                      onChange={e => setFrisch(f => ({ ...f, [a.key]: { ...f[a.key], preis: e.target.value } }))}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
                  </label>
                  <label className="md:col-span-3 flex flex-col">
                    <span className="text-[11px] text-gray-500 mb-0.5">Nettomenge (g/ml)</span>
                    <input value={row.netto} inputMode="decimal" placeholder="z. B. 3000"
                      onChange={e => setFrisch(f => ({ ...f, [a.key]: { ...f[a.key], netto: e.target.value } }))}
                      className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
                  </label>
                  <div className="md:col-span-3 text-right">
                    <div className="text-sm font-semibold text-emerald-700 tabular-nums">{proG != null ? `${fmtKg(proG)} €/kg` : "—"}</div>
                    <div className="text-[11px] text-gray-400 tabular-nums">{proG != null ? `${fmtG(proG)} €/g` : "Preis & Menge eingeben"}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-emerald-700">{frischMsg}</span>
            <div className="flex gap-2">
              <button onClick={() => { setFrisch(FRISCH_INIT); setFrischMsg(""); }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 flex items-center gap-1.5">
                <RotateCcw size={14} /> Zurücksetzen
              </button>
              <button onClick={frischUebernehmen}
                className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-4 py-2 text-sm font-medium">
                Preise übernehmen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter-Leiste */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-gray-600 mb-1">Suche</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
                placeholder="z. B. Mango, Becher, Artikelnummer …"
                className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm bg-white" />
            </div>
          </label>
          <label className="flex flex-col">
            <span className="text-xs font-medium text-gray-600 mb-1">Warengruppe</span>
            <select value={gruppe} onChange={e => setGruppe(e.target.value)}
              className="border border-gray-200 rounded px-3 py-2 text-sm bg-white">
              <option value="Alle">Alle ({zutaten.length})</option>
              {GRUPPEN_ANZEIGE.map(g => (
                <option key={g} value={g} disabled={!gruppenZaehlung[g]}>
                  {g} ({gruppenZaehlung[g] || 0})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => setGruppe("Alle")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
              gruppe === "Alle"
                ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
            }`}>
            Alle
          </button>
          {GRUPPEN_ANZEIGE.filter(g => gruppenZaehlung[g] > 0).map(g => (
            <button key={g} onClick={() => setGruppe(g)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                g === OHNE_GRUPPE
                  ? (gruppe === g ? "bg-amber-100 border-amber-400 text-amber-900" : "bg-amber-50 border-amber-300 text-amber-800 hover:border-amber-500")
                  : gruppe === g
                  ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
              }`}>
              {g} <span className="text-gray-400">· {gruppenZaehlung[g]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        {sichtbar.length} von {zutaten.length} Zutaten
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                {sortHeader("name",            "Zutat",              "left")}
                {sortHeader("art",             "Artikel-Nr.",        "left")}
                {sortHeader("untergruppe",     "Warengruppe",        "left")}
                {sortHeader("einheit",         "Einheit",            "left")}
                {sortHeader("packGroesse",     "Packungsgröße")}
                {sortHeader("packPreis",       "Packungspreis")}
                {sortHeader("preisProGramm",   "Preis / g · / kg")}
                {sortHeader("ausbeute",        "Ausbeute %")}
                {sortHeader("preisbasis",      "Berechnung", "left")}
                {canEdit && <th className="w-10"></th>}
              </tr>
            </thead>
            {renderTabelle()}
          </table>
        </div>
      </div>

      {canEdit && onSpeichern && (
        <div className="flex items-center gap-3 pt-2">
          <button onClick={onSpeichern}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2.5 text-sm font-semibold flex items-center gap-2">
            <Download size={14} /> Speichern
          </button>
          {speichernMsg && <span className="text-xs text-gray-500">{speichernMsg}</span>}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Einkaufspreise werden in den Kalkulationen pro Zutat verwendet. Quelle: aktive Preisliste
        (rezeptdatenbank + smoothies v3 + juices v3 + refresher v1). Über „CSV-Preise" im Header
        lassen sich neue Lieferantenpreise importieren.
      </p>
    </div>
  );
}

