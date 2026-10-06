import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { Download, FileSpreadsheet, AlertTriangle, RotateCcw, Lock, CheckCircle2 } from "lucide-react";
import { verarbeitePreisimport, gebindeUebernehmen } from "./preisimport.js";
import { baueZuordnung, artikelKey } from "./artikelzuordnung.js";
import { pruefeRezepturen } from "./rezepturcheck.js";
import RezepturCheckTab from "./RezepturCheckTab.jsx";
import { DialogHost, frage } from "./ui/dialog.jsx";
import { artikelPreisAendern, istPreisPatch } from "./artikelpreis.js";
import { ohneArtikelart, normalisiereArtikelart } from "./artikelart.js";
import rezeptdatenbankJson from "./data/rezeptdatenbank.json";
import smoothiesV3 from "./data/smoothies_v3.json";
import juicesV3 from "./data/juices_v3.json";
import refresherV1 from "./data/refresher_v1.json";
import bowlsV2 from "./data/bowls_v2.json";
import wrapsV1 from "./data/wraps_v1.json";
import icedDrinksV1 from "./data/iced_drinks_v1.json";
import standAktuell from "./data/stand_2026-06-05.json"; // Aktueller Stand inkl. Susannes Korrekturen (05.06.2026)
import {
  cloudEnabled, isWriter, signInWithGoogle, signOut,
  loadKalkulation, saveKalkulation, subscribeKalkulation, supabase, ARCHIV,
} from "./supabase";
import inventurJson from "./data/inventur.json";
import logoWeiss from "./assets/logo-weiss.png";
import BonsTab from "./BonsTab.jsx";
import { bonStatus } from "./bon.js";
import ZutatenTab from "./ZutatenTab.jsx";
import { verknuepfeProdukte, importiereZutaten, zutatAusRezeptzeilen, sortiereStamm as sortiereZutatenstamm, findeZutat, artikelNummer, normalisiereStamm } from "./zutaten.js";

import { DEFAULT_BOWL_BASIS, DEMO_PRODUKTE, EI_GEWICHT_G, EI_MUSTER, SCHWUND_PCT, WARENGRUPPEN, aufgeloesteProdukte, berechne, bowlBasisOderDefault, buildPlIndex, dokumentZumSpeichern, findPreisProG, fmtDate, fmtEUR, fmtNum, fmtNum2, fmtPct, istStueck, normalisiereZutat, normalizeRecipe, pflegeBefunde, stueckGrammAusArtikel, stueckVorgabe, stueckgewicht, stueckpreis, versteckteStueckzeile } from "./kalkulation.js";
import { ProduktEditModal, leeresProdukt } from "./ProduktEditModal.jsx";
import { EinkaufspreiseTab, FRISCH_ARTIKEL, OHNE_GRUPPE, kategorisiereZutat } from "./tabs/EinkaufspreiseTab.jsx";
import { verarbeiteTgErweitert } from "./tgimport.js";
import ZuordnungTab from "./tabs/ZuordnungTab.jsx";
import { InventurTab } from "./tabs/InventurTab.jsx";
import { KampagnenTab, WarengruppenTab } from "./tabs/Warengruppen.jsx";
import { ImportModal } from "./ImportModal.jsx";

const SystemWeTab = lazy(() => import("./tabs/SystemWeTab.jsx").then(m => ({ default: m.SystemWeTab })));
const NaehrwerteTab = lazy(() => import("./tabs/NaehrwerteTab.jsx").then(m => ({ default: m.NaehrwerteTab })));

// ============================================================
//  INITIAL STATE — aus rezeptdatenbank.json (146 Rezepte, 142 Zutaten)
// ============================================================
function buildInitialState(json, ...overrides) {
  const priceList = {};
  (json?.price_list || []).forEach(p => {
    if (p.ingredient_name) priceList[p.ingredient_name.toLowerCase()] = p;
  });
  for (const ov of overrides) {
    (ov?.price_list || []).forEach(p => {
      if (p.ingredient_name) priceList[p.ingredient_name.toLowerCase()] = p;
    });
  }

  // Pseudo-Rezepte aus der Excel-Konvertierung filtern (Tabellen-Header wie
  // „Steuersatz in Haus %", „IN"/„Out", „Wareneinsatz Durchschnitt …" wurden
  // beim Parsen fälschlich als Rezepte gespeichert).
  const istMuell = (name) => {
    const n = (name || "").trim().toLowerCase();
    if (n === "in" || n === "out" || n === "summe" || n === "mwst") return true;
    return n.includes("steuersatz") || n.includes("wareneinsatz durschnitt") ||
           n.includes("wareneinsatz durchschnitt") || n.includes("verkaufspreis");
  };

  let produkte = (json?.recipes || [])
    .filter(r => r.name && r.name.trim().length > 0 && !istMuell(r.name))
    .map(r => normalizeRecipe(r, priceList))
    .filter(p => p.gruppe !== "Archiv"); // Archiv-Tab wurde entfernt → diese Rezepte werden nicht mehr angezeigt

  // Pro Override: alle Produkte der dort definierten Gruppen ersetzen
  for (const ov of overrides) {
    if (!ov?.produkte) continue;
    const overrideGruppen = new Set(ov.produkte.map(p => p.gruppe));
    produkte = produkte.filter(p => !overrideGruppen.has(p.gruppe));
    produkte = [...produkte, ...ov.produkte];
  }

  return { produkte, priceList };
}

// Quellen, die ihre Warengruppe komplett ersetzen (kanonische Kalkulations-Excels):
// bowls_v2 (7 Normal + 7 Klein) ersetzt die Bowls-Gruppe komplett.
// wraps_v1 (8 Wraps) ersetzt die Wraps-Gruppe komplett.
// iced_drinks_v1 (2 Iced Coffee Latte + 3 Frozen Iced Tea) ersetzt die alten
// Junk-Einträge der Iced-Drinks-Gruppe; Refresher kommen via APPENDING dazu.
const REPLACING_OVERRIDES = [smoothiesV3, juicesV3, bowlsV2, wrapsV1, icedDrinksV1];
// Quellen, die nur hinzufügen (Untergruppen-Ergänzungen, Spezialprodukte):
const APPENDING_OVERRIDES = [refresherV1];

const INITIAL = (() => {
  try {
    let { produkte, priceList } = buildInitialState(rezeptdatenbankJson, ...REPLACING_OVERRIDES);
    for (const ov of APPENDING_OVERRIDES) {
      if (ov?.produkte) produkte = [...produkte, ...ov.produkte];
      if (ov?.price_list) {
        for (const p of ov.price_list) {
          if (p.ingredient_name) priceList[p.ingredient_name.toLowerCase()] = p;
        }
      }
    }
    // Aktueller Stand (Susanne, 05.06.2026) ersetzt die gesamte Produktliste.
    // priceList bleibt aus rezeptdatenbank+Overrides (für CSV-Preisimport-Lookups).
    if (standAktuell?.produkte?.length) {
      produkte = standAktuell.produkte;
    }
    if (produkte.length === 0) throw new Error("Keine Rezepte gefunden");
    return { produkte, priceList };
  } catch (e) {
    console.warn("Rezeptdatenbank nicht ladbar, nutze Demo-Daten:", e);
    return { produkte: DEMO_PRODUKTE, priceList: {} };
  }
})();

// Speicherstatus im Header. Cloud: speichert von selbst, der Knopf ist nur fuer "jetzt sofort"
// und fuer den Fehlerfall. Lokal: Speichern = Datei herunterladen.
function SpeicherStatus({ status, onSpeichern, automatisch = false }) {
  const basis = "rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 transition";
  if (status === "fehler") {
    return (
      <button onClick={onSpeichern} title="Speichern ist fehlgeschlagen — klicken zum erneuten Versuch"
        className={`${basis} bg-red-600 hover:bg-red-700 text-white`}>
        <AlertTriangle size={14} /> Nicht gespeichert · erneut versuchen
      </button>
    );
  }
  if (status === "speichert") {
    return <span className={`${basis} bg-white/15 text-green-50`}><RotateCcw size={14} className="animate-spin" /> Speichert …</span>;
  }
  if (status === "ungesichert") {
    return (
      <button onClick={onSpeichern}
        title={automatisch ? "Wird gleich automatisch gespeichert — klicken speichert sofort" : "Änderungen als Datei speichern"}
        className={`${basis} bg-white text-green-800 hover:bg-green-50`}>
        <span className="w-2 h-2 rounded-full bg-amber-500" /> {automatisch ? "Änderungen · speichert gleich" : "Speichern"}
      </button>
    );
  }
  return automatisch
    ? <span className={`${basis} bg-white/15 text-green-50`} title="Alle Änderungen sind gespeichert und für alle sichtbar"><CheckCircle2 size={14} /> Gespeichert</span>
    : (
      <button onClick={onSpeichern} className={`${basis} bg-white/15 hover:bg-white/25`}>
        <Download size={14} /> Speichern
      </button>
    );
}

// ============================================================
//  HAUPTKOMPONENTE
// ============================================================
export default function KalkulationsApp() {
  const [produkte, setProdukte] = useState(INITIAL.produkte);
  const [priceList, setPriceList] = useState(INITIAL.priceList);
  const [manuelleArtikel, setManuelleArtikel] = useState([]); // selbst angelegte Einkaufsartikel (persistiert)
  const [geloeschteArtikel, setGeloeschteArtikel] = useState([]); // gelöschte Einkaufsartikel (Namen, lowercase; persistiert, sonst kämen Basis-Artikel beim Neuladen zurück)
  const [aktiverTab, setAktiverTab] = useState("Smoothies");
  const [importOpen, setImportOpen] = useState(false);
  const [editProdukt, setEditProdukt] = useState(null); // null | "neu" | produktObjekt
  const [mix, setMix] = useState({
    "Smoothies": 22, "Juices": 8, "Iced Drinks": 15,
    "Bowls": 30, "Wraps": 22, "Kampagnen": 3,
  });
  const [letzterImport, setLetzterImport] = useState(null);
  // Bon-Vorlagen je Warengruppe + "_default"; leer = Fallback aus bon.js
  const [bonVorlagen, setBonVorlagen] = useState({});
  // Gemerkte Spaltenzuordnungen des Preisimports, je Dateiform (Signatur der
  // Spaltenliste) -> {name, preis, einheit, artNr, semantik}. Damit fragt der
  // Import-Dialog dieselbe TG-Exportform kein zweites Mal.
  const [importMappings, setImportMappings] = useState({});
  // Zentrale Basis-Rezeptur der Bowls (Salat / Kartoffel / Reis); persistiert
  // im Dokument als bowl_basis, Vorgabe bis zur ersten Pflege.
  const [bowlBasis, setBowlBasis] = useState(DEFAULT_BOWL_BASIS);
  // Zutatenstamm (E11, Stufe 1): persistiert als `zutaten`, Rezeptzeilen verweisen per zutat_id.
  const [zutaten, setZutaten] = useState([]);

  // Artikel einer Rezeptzeile: Name, sonst Zutat -> Artikelnummer (artikelzuordnung.js). Preisimport,
  // Preisaenderungen und Rezeptur-Check laufen alle ueber diese eine Zuordnung.
  const zuordnung = useMemo(() => baueZuordnung(priceList, zutaten), [priceList, zutaten]);
  const artikelVon = useMemo(() => (z) => { const k = artikelKey(z, zuordnung); return k ? priceList[k] : null; }, [zuordnung, priceList]);

  // Alles, was gespeichert wird - Cloud wie Export - kommt aus dieser einen Stelle.
  const dokument = () => dokumentZumSpeichern({
    mix, produkte, bowlBasis, artikel: manuelleArtikel, geloescht: geloeschteArtikel,
    bonVorlagen, importMappings, zutaten,
  });

  // ---- Cloud / Auth (Supabase) ----
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [cloudMsg, setCloudMsg] = useState("");
  const [cloudInfo, setCloudInfo] = useState(null); // { updated_at, updated_by }
  const email  = session?.user?.email || "";
  const writer = !cloudEnabled || isWriter(email); // lokaler Modus = Vollzugriff
  const seededRef = useRef(false);

  // ---- Speichern (28.09.2026): Cloud speichert automatisch 2 s nach der letzten Aenderung;
  // lokal zeigt der Status, dass die Datei noch nicht heruntergeladen ist. Verglichen wird das
  // gespeicherte Dokument selbst, nicht einzelne Aktionen - was nicht im Dokument landet, macht
  // nichts "ungesichert".
  const [speicherStatus, setSpeicherStatus] = useState("gespeichert"); // gespeichert | ungesichert | speichert | fehler
  const basisRef = useRef(null);              // JSON des zuletzt geladenen/gespeicherten Stands
  const aktuellRef = useRef(null);            // JSON des aktuellen Stands
  const syncRef = useRef(true);               // naechster Stand kommt aus Laden/Live-Sync, nicht vom Nutzer
  const eigeneSpeicherungRef = useRef(null);  // Zeitstempel der letzten eigenen Speicherung (Echo im Live-Sync)

  // Auth-Session beobachten
  useEffect(() => {
    if (!cloudEnabled) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Daten aus der Cloud laden + Live-Sync, sobald eingeloggt
  useEffect(() => {
    if (!cloudEnabled || !session) return;
    let active = true;
    (async () => {
      try {
        const row = await loadKalkulation();
        if (!active) return;
        if (row?.data?.produkte) {
          syncRef.current = true;
          setProdukte(row.data.produkte);
          if (row.data.mix) setMix(row.data.mix);
          if (row.data.artikel?.length) {
            setManuelleArtikel(row.data.artikel);
            setPriceList(prev => { const m = { ...prev }; for (const a of row.data.artikel) m[a.ingredient_name.toLowerCase()] = a; return m; });
          }
          if (row.data.geloescht?.length) {
            setGeloeschteArtikel(row.data.geloescht);
            setPriceList(prev => { const m = { ...prev }; for (const k of row.data.geloescht) delete m[k]; return m; });
          }
          if (row.data.bon_vorlagen) setBonVorlagen(row.data.bon_vorlagen);
          if (row.data.import_mappings) setImportMappings(row.data.import_mappings);
          if (row.data.bowl_basis?.varianten) setBowlBasis(row.data.bowl_basis);
          setZutaten(Array.isArray(row.data.zutaten) ? row.data.zutaten : []);
          setCloudInfo({ updated_at: row.updated_at, updated_by: row.updated_by });
        } else if (isWriter(session.user?.email) && !seededRef.current) {
          // Erstbefüllung: aktuellen Stand (Susanne) in die Cloud schreiben
          seededRef.current = true;
          await saveKalkulation(dokument());
          setCloudMsg("Startdaten in die Cloud übertragen.");
        }
      } catch (e) {
        if (active) setCloudMsg("Cloud-Laden fehlgeschlagen: " + e.message);
      }
    })();
    const ch = subscribeKalkulation((data, by, at) => {
      if (!data?.produkte) return;
      // Echo der eigenen Speicherung: nichts neu setzen - sonst ueberschriebe es Aenderungen,
      // die waehrend des Speicherns gemacht wurden.
      if (eigeneSpeicherungRef.current && at && Date.parse(at) === Date.parse(eigeneSpeicherungRef.current)) {
        setCloudInfo({ updated_at: at, updated_by: by });
        return;
      }
      syncRef.current = true;
      setProdukte(data.produkte);
      if (data.mix) setMix(data.mix);
      if (data.artikel?.length) {
        setManuelleArtikel(data.artikel);
        setPriceList(prev => { const m = { ...prev }; for (const a of data.artikel) m[a.ingredient_name.toLowerCase()] = a; return m; });
      }
      if (data.geloescht) {
        setGeloeschteArtikel(data.geloescht);
        setPriceList(prev => { const m = { ...prev }; for (const k of data.geloescht) delete m[k]; return m; });
      }
      if (data.bon_vorlagen) setBonVorlagen(data.bon_vorlagen);
      if (data.import_mappings) setImportMappings(data.import_mappings);
      if (data.bowl_basis?.varianten) setBowlBasis(data.bowl_basis);
      if (Array.isArray(data.zutaten)) setZutaten(data.zutaten);
      setCloudInfo({ updated_at: at, updated_by: by });
    });
    return () => { active = false; try { supabase.removeChannel(ch); } catch (_) {} };
  }, [session]);

  const handleCloudSave = async () => {
    if (!writer) return;
    const doc = dokument();
    const json = JSON.stringify(doc);
    try {
      setSpeicherStatus("speichert");
      const at = await saveKalkulation(doc);
      eigeneSpeicherungRef.current = at;
      basisRef.current = json;
      setCloudInfo({ updated_at: at, updated_by: email });
      // Wurde waehrend des Speicherns weiter geaendert, bleibt es ungesichert (der naechste
      // Autosave laeuft schon).
      setSpeicherStatus(aktuellRef.current === json ? "gespeichert" : "ungesichert");
    } catch (e) {
      setSpeicherStatus("fehler");
      setCloudMsg("Speichern fehlgeschlagen: " + e.message);
    }
  };

  useEffect(() => {
    const json = JSON.stringify(dokument());
    aktuellRef.current = json;
    if (syncRef.current || basisRef.current === null) {
      syncRef.current = false;
      basisRef.current = json;
      setSpeicherStatus("gespeichert");
      return;
    }
    if (json === basisRef.current) { setSpeicherStatus("gespeichert"); return; }
    setSpeicherStatus(s => (s === "fehler" || s === "speichert" ? s : "ungesichert"));
    if (!cloudEnabled || !writer || !session) return;
    const t = setTimeout(() => { handleCloudSave(); }, 2000);
    return () => clearTimeout(t);
    // dokument() liest genau diese Zustaende
  }, [mix, produkte, bowlBasis, manuelleArtikel, geloeschteArtikel, bonVorlagen, importMappings, zutaten, session, writer]);

  // Seite verlassen mit ungesicherten Aenderungen: der Browser fragt nach
  useEffect(() => {
    if (speicherStatus === "gespeichert") return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [speicherStatus]);

  // Neue Rezepte aus einer JSON-Datei einspielen ({produkte:[...]}).
  // Zutaten werden gegen die Preisliste angereichert (Preis, Ausbeute,
  // Stueckgewicht) und die Kosten ueber zutatKosten gerechnet. Vorhandene
  // Produkte (gleiche id oder gleicher Name) werden uebersprungen.
  const handleRezeptImport = (datei) => {
    const reader = new FileReader();
    reader.onload = () => {
      const roh = String(reader.result || "");
      // Haeufigster Fehlgriff: eine Excel-Rezeptur statt einer JSON-Importdatei.
      // xlsx/docx/zip beginnen alle mit "PK" - ohne diesen Hinweis kommt nur ein
      // unverstaendlicher Parserfehler ("Unexpected token 'P'").
      if (roh.startsWith("PK")) {
        setCloudMsg(`„${datei.name}“ ist eine Excel-Datei. „Rezepte importieren“ liest nur JSON-Importdateien. Excel-Rezepturen müssen vorher umgewandelt werden.`);
        return;
      }
      try {
        const daten = JSON.parse(reader.result);
        const neue = Array.isArray(daten.produkte) ? daten.produkte : [];
        // Optional: 'entfernen' = Liste von Produkt-ids, die die Importdatei
        // ersetzt (z. B. Korrektur falsch angelegter Varianten)
        const zuEntfernen = new Set(Array.isArray(daten.entfernen) ? daten.entfernen : []);
        // Optional (Stufe 1): 'zutaten' = Stammzeilen (Upsert je id), 'zutaten_entfernen' = ids
        const zutatenImport = Array.isArray(daten.zutaten) ? daten.zutaten : [];
        const zutatenWeg = Array.isArray(daten.zutaten_entfernen) ? daten.zutaten_entfernen : [];
        if (!neue.length && !zuEntfernen.size && !zutatenImport.length && !zutatenWeg.length) {
          setCloudMsg("Importdatei enthält weder Produkte noch Zutaten."); return;
        }
        let stamm = zutaten;
        let stammText = "";
        if (zutatenImport.length || zutatenWeg.length) {
          const r = importiereZutaten(zutaten, zutatenImport, zutatenWeg);
          stamm = r.zutaten;
          setZutaten(stamm);
          stammText = `, Zutaten: ${r.neu} neu, ${r.geaendert} geändert${r.entfernt ? `, ${r.entfernt} entfernt` : ""}`;
        }
        const basis = produkte.filter(p => !zuEntfernen.has(p.id));
        const entfernt = produkte.length - basis.length;
        const ids = new Set(basis.map(p => p.id));
        const namen = new Set(basis.map(p => (p.name || "").toLowerCase()));
        let uebersprungen = 0;
        const angereichert = [];
        for (const p of neue) {
          if (ids.has(p.id) || namen.has((p.name || "").toLowerCase())) {
            uebersprungen++; continue;
          }
          const zutaten = (p.zutaten || []).map(roh => {
            const z = { lieferant: "Transgourmet", ...roh };
            const treffer = priceList[(z.name || "").toLowerCase()];
            if (treffer) {
              if (istStueck(z)) {
                // Stück-Zeile ({einheit:"stk", menge_stk, preis_je_stueck}): Stückpreis aus dem Artikel
                if (!(z.preis_je_stueck > 0) && stueckpreis(treffer) != null) z.preis_je_stueck = stueckpreis(treffer);
              } else if (!(z.preis_pro_g > 0) && treffer.price_per_gram_ml != null) {
                z.preis_pro_g = treffer.price_per_gram_ml;
              }
              z.ausbeute_prozent = treffer.ausbeute_prozent ?? z.ausbeute_prozent ?? null;
              z.gramm_je_stueck = stueckgewicht(treffer) || z.gramm_je_stueck || null;
            }
            return normalisiereZutat(z);
          });
          angereichert.push({ verpackung_eur: 0, vk_in_brutto: 0, vk_out_brutto: 0,
            kampagne_start: null, kampagne_ende: null, untergruppe: null,
            ...p, zutaten, artikelart: normalisiereArtikelart(p.artikelart) });
        }
        if (angereichert.length || zuEntfernen.size || stamm !== zutaten) {
          // neue und alte Zeilen gegen den (ggf. gerade importierten) Stamm verknuepfen
          setProdukte(prev => verknuepfeProdukte([...prev.filter(p => !zuEntfernen.has(p.id)), ...angereichert], stamm).produkte);
        }
        setCloudMsg(`✓ ${angereichert.length} Rezepte importiert`
          + (entfernt ? `, ${entfernt} alte Varianten entfernt` : "")
          + (uebersprungen ? `, ${uebersprungen} schon vorhanden` : "")
          + stammText
          + ``);
      } catch (fehler) {
        setCloudMsg(`„${datei.name}“ ist keine gültige JSON-Importdatei (${fehler.message}).`);
      }
    };
    reader.readAsText(datei);
  };

  const handleJsonDownload = () => {
    const out = {
      meta: { generiert_am: new Date().toISOString(), version: "1.1", quelle: "kalkulations-app",
              stand: new Date().toISOString().slice(0, 10) },
      mix,
      produkte,
      bowl_basis: bowlBasis,
      // Zutatenstamm (Stufe 1)
      zutaten,
      // Kassen-Sicht: je Bowl-Variante ein Produkt (<id>, <id>_kartoffel, <id>_reis)
      produkte_aufgeloest: verknuepfeProdukte(aufgeloesteProdukte(produkte, bowlBasis), zutaten).produkte,
      // kompletter Artikelstamm inkl. Ausbeute/Preisbasis - Quelle fuer die
      // Bestell-App (igorder); dort werden die Zutatenwerte daraus gelesen
      artikel: Object.values(priceList),
      bon_vorlagen: bonVorlagen,
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `immergruen-kalkulation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (!cloudEnabled) { basisRef.current = aktuellRef.current; setSpeicherStatus("gespeichert"); }
  };

  // Preislisten-Import: matcht ueber die Artikelnummer gegen den STAMM
  // (priceList), aktualisiert dort Preis + Pruefdatum und stempelt von da in
  // alle Rezepturen. Bis 08/2026 traf der Import nur namensgleiche
  // Rezeptzeilen und liess den Stamm auf dem Ur-Import von 03/2025 stehen -
  // Susannes Wochen-Upload kam deshalb nie an. Logik in preisimport.js
  // (getestet); Persistenz wie handleArtikelFelder ueber manuelleArtikel.
  // Geaenderte Stammartikel (Preisimport, Gebinde-Entscheidungen) uebernehmen und ihren Preis
  // in alle Rezeptzeilen stempeln: Stueck-Zeilen den Stueckpreis, Gramm-Zeilen den Grammpreis.
  const artikelPreisPatches = (patches) => {
    if (Object.keys(patches).length > 0) {
      setPriceList(prev => ({ ...prev, ...patches }));
      setManuelleArtikel(prev => [
        ...prev.filter(a => !patches[(a.ingredient_name || "").toLowerCase()]),
        ...Object.values(patches),
      ]);
      setProdukte(prev => prev.map(p => ({
        ...p,
        zutaten: (p.zutaten || []).map(z => {
          const neu = patches[artikelKey(z, zuordnung) ?? (z.name || "").toLowerCase()];
          if (!neu) return z;
          if (istStueck(z)) {
            // Stück-Zeile: nur der Stückpreis des Artikels zählt, nicht der Grammpreis
            const sp = stueckpreis(neu);
            if (sp == null || Math.abs(sp - (+z.preis_je_stueck || 0)) < 1e-9) return z;
            return normalisiereZutat({ ...z, preis_je_stueck: sp });
          }
          if (!(+neu.price_per_gram_ml > 0) || neu.price_per_gram_ml === z.preis_pro_g) return z;
          return normalisiereZutat({ ...z, preis_pro_g: neu.price_per_gram_ml });
        }),
      })));
    }
  };

  // Transgourmet "CSV Erweitert" (tgimport.js): Preis je kg/l/Stueck direkt aus der Liste,
  // Stamm-Packung = Liefergebinde. Aenderungen gehen sofort in Stamm und verknuepfte Rezepturen;
  // Spruenge und neue Artikel entscheidet der Nutzer im Dialog (handleTgArtikel).
  const handleTgImport = (rows) => {
    const e = verarbeiteTgErweitert({ rows, priceList,
      gruppeVorschlag: (name) => { const g = kategorisiereZutat(name); return g === OHNE_GRUPPE ? null : g; } });
    artikelPreisPatches(e.patches);
    setLetzterImport({ datum: new Date(), anzahl: rows.length, veraendert: e.geaendert });
    setCloudMsg(`Transgourmet-Liste ${e.stand}: ${e.geaendert} Preise aktualisiert, ${e.unveraendert} bestätigt`
      + (e.spruenge.length ? `, ${e.spruenge.length} Sprünge zur Entscheidung` : "")
      + (e.neu.length ? `, ${e.neu.length} neue Artikel in der Liste` : "") + ".");
    return e;
  };

  // Aus dem TG-Dialog: entschiedene Spruenge (neu = false, Preise in die Rezepturen) oder neue
  // Artikel (neu = true). Neue Artikel mit einem Namen, den es schon gibt, bekommen die Nummer dazu.
  const handleTgArtikel = (patches, neu) => {
    if (!writer) return;
    if (!neu) { artikelPreisPatches(patches); return; }
    const sauber = {};
    for (const a of Object.values(patches)) {
      let name = a.ingredient_name;
      if (priceList[name.toLowerCase()] || sauber[name.toLowerCase()]) name = `${name} (Art. ${a.article_number})`;
      sauber[name.toLowerCase()] = { ...a, ingredient_name: name };
    }
    handleArtikelPatches(sauber);
    setCloudMsg(`${Object.keys(sauber).length} Transgourmet-Artikel in den Stamm übernommen.`);
  };

  const handlePriceImport = (aktualisierungen, semantik = "gebinde", lieferant = "Transgourmet") => {
    const ergebnis = verarbeitePreisimport({ zeilen: aktualisierungen, priceList, semantik, lieferant });
    artikelPreisPatches(ergebnis.patches);
    setLetzterImport({ datum: new Date(), anzahl: aktualisierungen.length,
                       veraendert: ergebnis.geaendert });
    setCloudMsg(`Preisimport ${lieferant}: ${ergebnis.geaendert} geändert, ${ergebnis.unveraendert} bestätigt, `
      + `${ergebnis.ohneMatch.length} ohne Treffer`
      + (ergebnis.spruenge.length ? `, ${ergebnis.spruenge.length} Preissprünge zur Entscheidung` : "")
      + ``);
    return ergebnis;
  };

  // Gebinde-Entscheidung (Preissprung im Import oder Gebinde-Check): packungen = Stamm-Packungen
  // je Listen-Gebinde. listenpreis null = Preis bleibt, nur das Gebinde wird festgehalten.
  const handleGebinde = (key, packungen, listenpreis = null) => {
    const alt = priceList[key];
    if (!alt || !writer) return;
    if (listenpreis == null) {
      handleArtikelPatches({ [key]: { ...alt, packungen_je_gebinde: packungen } });
      setCloudMsg(`„${alt.ingredient_name}": ${packungen} Packung${packungen === 1 ? "" : "en"} je Gebinde festgehalten`);
      return;
    }
    const neu = gebindeUebernehmen(alt, listenpreis, packungen);
    artikelPreisPatches({ [key]: neu });
    setCloudMsg(`„${alt.ingredient_name}": ${fmtNum2(alt.package_price)} € → ${fmtNum2(neu.package_price)} € je Packung, Rezepturen neu gerechnet`);
  };

  const handleProduktUpdate = (id, updates) => {
    setProdukte(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Frischpress-Preise: setzt für bestimmte Zutaten (z. B. Frischer Apfelsaft)
  // einen neuen Preis pro g und rechnet die Kosten aller betroffenen Rezepturen neu.
  // list: [{ name, proG }]
  const handleFrischpreise = (list) => {
    const map = {};
    list.forEach(u => { map[u.name.toLowerCase()] = u.proG; });
    setProdukte(prev => prev.map(p => ({
      ...p,
      zutaten: (p.zutaten || []).map(z => {
        const neuerProG = map[z.name.toLowerCase()];
        return neuerProG != null && !istStueck(z)
          ? normalisiereZutat({ ...z, preis_pro_g: neuerProG })
          : z;
      }),
    })));
  };

  const handleProduktNeu = (gruppe, kampagne = null, start = null, ende = null) => {
    setEditProdukt(leeresProdukt(gruppe, kampagne, start, ende));
  };

  // Individuellen Einkaufsartikel anlegen (z. B. für Kampagnen) – ergänzt die Preisliste.
  const handleAddArtikel = (artikel) => {
    const key = artikel.ingredient_name.toLowerCase();
    setPriceList(prev => ({ ...prev, [key]: artikel }));
    setManuelleArtikel(prev => [...prev.filter(a => a.ingredient_name.toLowerCase() !== key), artikel]);
    // Falls der Name zuvor gelöscht war: Löschvermerk aufheben, sonst verschwindet er beim nächsten Laden wieder
    setGeloeschteArtikel(prev => prev.filter(k => k !== key));
  };

  // Einkaufsartikel aus der Preisliste löschen. Rezepturen behalten ihre Preise
  // (die Preise sind pro Zutat in den Rezepten gespeichert) — der Artikel ist nur
  // nicht mehr in der Liste/Auswahl. Löschvermerk wird mit in die Cloud gespeichert.
  const handleDeleteArtikel = (name) => {
    const key = (name || "").toLowerCase();
    if (!key) return;
    setPriceList(prev => { const m = { ...prev }; delete m[key]; return m; });
    setManuelleArtikel(prev => prev.filter(a => a.ingredient_name.toLowerCase() !== key));
    setGeloeschteArtikel(prev => prev.includes(key) ? prev : [...prev, key]);
    setCloudMsg(`„${name}" aus der Preisliste entfernt`);
  };

  // Artikel-Eigenschaften zentral pflegen (Tab Einkaufspreise): Ausbeute,
  // Preisbasis, g/Stück - und seit 09/2026 auch Einheit, Packungsgröße,
  // Packungspreis und Kilopreis (Logik in artikelpreis.js, getestet). Die
  // Werte sind Eigenschaften des ARTIKELS, nicht der Rezeptzeile: sie werden
  // hier gesetzt und sofort in alle Rezepturen und die Bowl-Basis gestempelt,
  // die die Zutat verwenden. Persistenz wie handleAddArtikel über
  // manuelleArtikel in die Cloud.
  // Artikelstamm-Bereinigung (E11.8, Tab Zutaten): Etiketten-Patches (Einheit, Packungsgroesse,
  // Preisbasis, Nettogewicht) in Preisliste und persistierte Artikel uebernehmen. Preise bleiben
  // unveraendert, deshalb werden keine Rezeptzeilen angefasst.
  const handleArtikelPatches = (patches) => {
    if (!writer) return;
    const eintraege = Object.entries(patches || {});
    if (!eintraege.length) return;
    const keys = new Set(eintraege.map(([k]) => k));
    setPriceList(prev => ({ ...prev, ...patches }));
    setManuelleArtikel(prev => [...prev.filter(a => !keys.has((a.ingredient_name || "").toLowerCase())), ...eintraege.map(([, a]) => a)]);
    setGeloeschteArtikel(prev => prev.filter(k => !keys.has(k)));
  };

  // Aus dem Rezept-Editor: Namen als Zutat im Stamm anlegen (angereichert aus dem Artikel mit
  // gleichem Namen). Gibt die id zurueck, damit die Zeile sofort verweist.
  const handleNeueZutat = (name) => {
    if (!writer || !(name || "").trim()) return null;
    const z = zutatAusRezeptzeilen(name, [], priceList[(name || "").toLowerCase()] ?? null);
    if (!z.id) return null;
    setZutaten(prev => (prev.some(x => x.id === z.id) ? prev : sortiereZutatenstamm([...prev, z])));
    return z.id;
  };

  const handleArtikelFelder = (name, patch) => {
    const key = (name || "").toLowerCase();
    const alt = priceList[key];
    if (!alt) return;
    let neu = { ...alt, ...patch };
    let preisInfo = null;
    if (istPreisPatch(patch)) {
      preisInfo = artikelPreisAendern(alt, patch);
      neu = { ...neu, ...preisInfo.artikel };
    }
    // Stueckgewicht: gepflegtes gewicht_je_stueck_g, sonst rechnerisch
    // (Stueckpreis / Preis pro Gramm) - haengt von Preisbasis und Preisen ab
    neu.gramm_je_stueck = stueckgewicht(neu);
    const preisNeu = !!preisInfo && preisInfo.geaendert;
    const proG = +neu.price_per_gram_ml || 0;
    const jeStueck = stueckpreis(neu);

    setPriceList(prev => ({ ...prev, [key]: neu }));
    setManuelleArtikel(prev => [...prev.filter(a => a.ingredient_name.toLowerCase() !== key), neu]);
    setGeloeschteArtikel(prev => prev.filter(k => k !== key));

    let zeilen = 0;
    setProdukte(produkte.map(p => {
      let betroffen = false;
      const zutaten = (p.zutaten || []).map(z => {
        if (artikelKey(z, zuordnung) !== key) return z;
        betroffen = true;
        // Stueck-Zeilen behalten ihr Gewicht, wenn der Artikel keins liefert
        const n = { ...z,
          ausbeute_prozent: neu.ausbeute_prozent ?? null,
          gramm_je_stueck: neu.gramm_je_stueck ?? (istStueck(z) ? z.gramm_je_stueck : null) ?? null };
        if (preisNeu) {
          zeilen++;
          if (istStueck(n)) { if (jeStueck != null) n.preis_je_stueck = jeStueck; }
          else if (proG > 0) n.preis_pro_g = proG;
        }
        return normalisiereZutat(n);
      });
      return betroffen ? { ...p, zutaten } : p;
    }));

    if (preisNeu && proG > 0) {
      // Basiszutaten der Bowls mit demselben Namen ziehen mit
      const b = bowlBasisOderDefault(bowlBasis);
      let treffer = 0;
      const varianten = Object.fromEntries(Object.entries(b.varianten || {}).map(([k, v]) => [k, {
        ...v,
        zutaten: (v.zutaten || []).map(z => {
          if ((z.name || "").trim().toLowerCase() !== key) return z;
          treffer++;
          return { ...z, preis_pro_g: proG };
        }),
      }]));
      if (treffer) setBowlBasis({ ...b, varianten });
    }

    if (preisNeu) {
      const preisText = jeStueck != null
        ? `${fmtNum2(jeStueck)} €/Stk`
        : `${fmtNum2(preisInfo.proGAlt * 1000)} → ${fmtNum2(preisInfo.proGNeu * 1000)} €/kg`;
      setCloudMsg(`„${name}": ${preisText}, ${zeilen} Rezeptzeile${zeilen === 1 ? "" : "n"} neu gerechnet`);
    } else {
      setCloudMsg(`„${name}" aktualisiert — Rezepturen neu gerechnet.`);
    }
  };

  // Alt-Ausbeuten aus der Excel-Aera herausloesen: Manche Frischartikel tragen
  // den Verschnitt noch IM Listenpreis (Apfel: netto 1,25 €/kg eingekauft,
  // Liste 2,08 €/kg = 60 % Ausbeute eingepreist). Diese Bereinigung setzt den
  // Listenpreis auf den echten Netto-Einkauf (Packungspreis / Packungsgroesse)
  // zurueck und traegt den Faktor in die Ausbeute-Spalte ein. Die Rezeptkosten
  // bleiben dadurch unveraendert: netto / Ausbeute = alter Preis.
  const handleAltAusbeuten = async () => {
    const funde = [];
    const auffaellig = [];
    for (const [key, a] of Object.entries(priceList)) {
      if (a.ausbeute_prozent != null) continue;          // schon manuell gepflegt
      const einheit = String(a.unit || "").toLowerCase();
      let groesseG = null;
      if (einheit === "g" || einheit === "ml") groesseG = +a.package_size || null;
      else if (einheit === "kg" || einheit === "l") groesseG = (+a.package_size || 0) * 1000 || null;
      if (!groesseG || !(+a.package_price > 0) || !(+a.price_per_gram_ml > 0)) continue;
      const netto = a.package_price / groesseG;
      const ratio = a.price_per_gram_ml / netto;
      if (ratio >= 1.02 && ratio <= 5) {
        funde.push({ key, name: a.ingredient_name, alt: a.price_per_gram_ml,
                     netto, ausbeute: Math.round(1000 / ratio) / 10 });
      } else if (ratio < 0.98) {
        auffaellig.push(a.ingredient_name);
      }
    }
    if (!funde.length) {
      setCloudMsg("Keine Alt-Ausbeuten in den Listenpreisen gefunden — nichts zu tun."
        + (auffaellig.length ? ` (${auffaellig.length} Artikel liegen UNTER dem Netto-Einkauf — bitte manuell prüfen: ${auffaellig.slice(0, 5).join(", ")}…)` : ""));
      return;
    }
    const beispiele = funde.slice(0, 8).map(f => `${f.name} (${f.ausbeute} %)`).join(", ");
    if (!(await frage({ titel: "Alt-Ausbeuten bereinigen", ja: "Bereinigen", text: `${funde.length} Artikel tragen den Verschnitt noch im Listenpreis:\n${beispiele}${funde.length > 8 ? " …" : ""}\n\nDer Listenpreis wird auf den Netto-Einkauf zurückgesetzt, die Ausbeute-Spalte übernimmt den Faktor — die Rezeptkosten bleiben unverändert.` }))) return;

    const map = {};
    funde.forEach(f => { map[f.key] = f; });

    setPriceList(prev => {
      const m = { ...prev };
      for (const f of funde) {
        m[f.key] = { ...m[f.key], price_per_gram_ml: f.netto, ausbeute_prozent: f.ausbeute };
      }
      return m;
    });
    setManuelleArtikel(prev => {
      const rest = prev.filter(a => !map[(a.ingredient_name || "").toLowerCase()]);
      const neue = funde.map(f => ({ ...(priceList[f.key] || {}),
        price_per_gram_ml: f.netto, ausbeute_prozent: f.ausbeute }));
      return [...rest, ...neue];
    });

    // Rezeptzeilen mitziehen — aber NUR wenn ihr Preis dem alten Listenpreis
    // entspricht (±2 %). Manuell abweichende Preise bleiben unangetastet,
    // sonst wuerden sich deren Kosten still veraendern.
    let zeilen = 0, uebersprungen = 0;
    setProdukte(prev => prev.map(p => ({
      ...p,
      zutaten: (p.zutaten || []).map(z => {
        const f = map[(z.name || "").toLowerCase()];
        if (!f || istStueck(z)) return z;
        const abweichung = Math.abs((z.preis_pro_g || 0) - f.alt) / f.alt;
        if (abweichung > 0.02) { uebersprungen++; return z; }
        zeilen++;
        return normalisiereZutat({ ...z, preis_pro_g: f.netto, ausbeute_prozent: f.ausbeute });
      }),
    })));
    setCloudMsg(`✓ ${funde.length} Artikel bereinigt, ${zeilen} Rezeptzeilen umgestellt`
      + (uebersprungen ? `, ${uebersprungen} Zeilen mit abweichendem Preis unangetastet` : "")
      + ` — Kosten unverändert.`);
  };

  // Alle Zutaten ohne Preis tolerant gegen die Preisliste abgleichen und Preise ziehen.
  // Liefert die Anzahl übernommener Preise zurück (für die Rückmeldung am Button).
  const handlePreisAbgleich = () => {
    const plIndex = buildPlIndex(priceList);
    let count = 0;
    const next = produkte.map(p => ({
      ...p,
      zutaten: (p.zutaten || []).map(z => {
        if (istStueck(z) || (z.preis_pro_g || 0) > 0) return z;
        const proG = findPreisProG(z.name, plIndex);
        if (proG > 0) {
          count++;
          return normalisiereZutat({ ...z, preis_pro_g: proG });
        }
        return z;
      }),
    }));
    if (count > 0) setProdukte(next);
    // Basiszutaten der Bowls ohne Preis ebenso aus der Liste fuellen
    let basisCount = 0;
    const b = bowlBasisOderDefault(bowlBasis);
    const basisNeu = { ...b, varianten: Object.fromEntries(Object.entries(b.varianten || {}).map(([k, v]) => [k, {
      ...v,
      zutaten: (v.zutaten || []).map(z => {
        if ((+z.preis_pro_g || 0) > 0) return z;
        const proG = findPreisProG(z.name, plIndex);
        if (proG > 0) { basisCount++; return { ...z, preis_pro_g: proG }; }
        return z;
      }),
    }])) };
    if (basisCount > 0) setBowlBasis(basisNeu);
    setCloudMsg(count + basisCount > 0
      ? `✓ ${count} Zutatenpreise aus der Preisliste übernommen${basisCount ? ` (+ ${basisCount} in der Bowl-Basis)` : ""}`
      : "Keine weiteren Preise aus der Liste zuordenbar.");
    return count + basisCount;
  };

  // Datenpflege: Ei von Gramm auf Stück. Stückpreis aus dem Artikel „Eier“
  // (8,45 € je 30 = 0,28 €), 50 g je Ei als Gramm-Äquivalent - so rechnet
  // auch der Bestellvorschlag (Eimer 60 St = 3.000 g).
  // Rezeptur-Check: Befunde fuer Tab und Zaehler. Frischpress-Saefte rechnen bewusst mit dem
  // Preis aus „Frischpress-Preise“, nicht mit dem Stamm.
  // Zutaten mit "eigener Kalkulation" (Zuordnung) brauchen keinen Artikel.
  const ohneStammabgleich = useMemo(() => new Set([
    ...FRISCH_ARTIKEL.map(a => a.zutat.toLowerCase()),
    ...zutaten.filter(z => z.ohne_artikel).flatMap(z => [z.name, ...(z.aliase || [])].map(n => String(n).trim().toLowerCase())),
  ]), [zutaten]);

  // Zuordnungs-Assistent: Zutat <-> Einkaufsartikel im Zutatenstamm festhalten. key = Artikel,
  // null + eigen = bewusst ohne Artikel, null ohne eigen = Zuordnung loesen.
  const zutatSetzen = (name, key, eigen = false) => {
    if (!writer) return;
    const artikel = key ? priceList[key] : null;
    let liste = [...zutaten];
    let z = findeZutat(liste, { name });
    if (!z) {
      const zeilen = produkte.flatMap(p => (p.zutaten || []).filter(r => String(r.name || "").trim().toLowerCase() === name.trim().toLowerCase()));
      z = zutatAusRezeptzeilen(name, zeilen, artikel);
      let id = z.id || "zutat", n = 2;
      while (liste.some(x => x.id === id)) id = `${z.id}-${n++}`;
      z = { ...z, id };
      liste.push(z);
    }
    const nr = artikel ? artikelNummer(artikel) : null;
    const neu = normalisiereStamm({ ...z, artikel_nr: nr, artikel_key: artikel && !nr ? key : null, ohne_artikel: !artikel && eigen });
    liste = sortiereZutatenstamm(liste.map(x => (x.id === z.id ? neu : x)));
    setZutaten(liste);
    setProdukte(prev => verknuepfeProdukte(prev, liste).produkte);
    setCloudMsg(artikel ? `„${name}“ → ${artikel.ingredient_name}` : eigen ? `„${name}“: eigene Kalkulation` : `„${name}“: Zuordnung gelöst`);
  };
  const zuordnungOffen = useMemo(() => {
    const namen = new Set();
    for (const p of produkte) for (const z of p.zutaten || []) {
      const n = String(z.name || "").trim();
      if (!n || namen.has(n.toLowerCase())) continue;
      if (!artikelVon(z) && !ohneStammabgleich.has(n.toLowerCase())) namen.add(n.toLowerCase());
    }
    return namen.size;
  }, [produkte, artikelVon, ohneStammabgleich]);

  const rezepturBefunde = useMemo(
    () => pruefeRezepturen(produkte, { artikelVon, ohneStammabgleich }),
    [produkte, artikelVon, ohneStammabgleich]);

  // Veraltete Zeilenpreise (Befund preis_alt) auf den Preis des Artikelstamms ziehen
  const handleStammpreiseUebernehmen = (liste) => {
    if (!writer || !liste?.length) return;
    const ziel = new Set(liste.map(b => `${b.produktId}|${String(b.zutat || "").trim().toLowerCase()}`));
    setProdukte(prev => prev.map(p => {
      let geaendert = false;
      const zs = (p.zutaten || []).map(z => {
        if (!ziel.has(`${p.id}|${String(z.name || "").trim().toLowerCase()}`)) return z;
        const a = artikelVon(z);
        if (!a) return z;
        if (istStueck(z)) {
          const sp = stueckpreis({ ...a, preisbasis: a.preisbasis || "stueck" });
          if (!(sp > 0)) return z;
          geaendert = true;
          return normalisiereZutat({ ...z, preis_je_stueck: sp });
        }
        if (!(+a.price_per_gram_ml > 0)) return z;
        geaendert = true;
        return normalisiereZutat({ ...z, preis_pro_g: +a.price_per_gram_ml });
      });
      return geaendert ? { ...p, zutaten: zs } : p;
    }));
    setCloudMsg(`${liste.length} Zeilenpreise aus dem Artikelstamm übernommen — Rezepturen neu gerechnet.`);
  };

  // Versteckte Stueck-Zeilen (Oreo "1 g") auf Stueck umstellen: Menge aus STUECK_VORGABEN bzw.
  // der alten Zahl, Stueckpreis und Gramm je Stueck aus dem Artikel. Der Artikel bekommt
  // Preisbasis Stueck und einen echten Grammpreis (Stueckpreis / Gramm je Stueck).
  const handleStueckzeilenUmstellen = () => {
    if (!writer) return;
    const artikelNeu = {};
    let zeilen = 0;
    const next = produkte.map(p => {
      let geaendert = false;
      const zutaten = (p.zutaten || []).map(z => {
        const key = (z.name || "").toLowerCase();
        const artikel = priceList[key];
        if (!versteckteStueckzeile(z, artikel)) return z;
        geaendert = true; zeilen++;
        const gramm = stueckGrammAusArtikel(artikel);
        const jeStueck = stueckpreis({ ...artikel, preisbasis: "stueck" });
        if (!artikelNeu[key]) {
          artikelNeu[key] = { ...artikel, preisbasis: "stueck",
            ...(gramm ? { gewicht_je_stueck_g: gramm, price_per_gram_ml: +(jeStueck / gramm).toFixed(10) } : {}) };
        }
        const stk = stueckVorgabe(z, p) ?? Math.max(1, Math.round(+z.menge_g || 0));
        return normalisiereZutat({ ...z, einheit: "stk", menge_stk: stk, preis_je_stueck: jeStueck, gramm_je_stueck: gramm || null });
      });
      return geaendert ? { ...p, zutaten } : p;
    });
    if (!zeilen) { setCloudMsg("Keine Stückware in Gramm gefunden."); return; }
    setProdukte(next);
    handleArtikelPatches(artikelNeu);
    setCloudMsg(`${zeilen} Rezeptzeile${zeilen === 1 ? "" : "n"} auf Stück umgestellt (${Object.values(artikelNeu).map(a => a.ingredient_name).join(", ")})`);
  };

  const handleEiAufStueck = () => {
    if (!writer) return;
    const artikel = priceList["eier"]
      || Object.values(priceList).find(a => EI_MUSTER.test(a.ingredient_name || ""));
    const sp = artikel ? stueckpreis({ ...artikel, preisbasis: "stueck" }) : null;
    let zeilen = 0;
    const next = produkte.map(p => {
      let geaendert = false;
      const zutaten = (p.zutaten || []).map(z => {
        if (!EI_MUSTER.test((z.name || "").trim()) || istStueck(z)) return z;
        geaendert = true; zeilen++;
        const mengeG = +z.menge_g || 0;
        // 50 g = 1 Ei (bisherige Rezeptur); kleine Zahlen waren schon als Stück gemeint
        const stk = mengeG >= 20 ? Math.max(1, Math.round(mengeG / EI_GEWICHT_G)) : Math.max(1, Math.round(mengeG) || 1);
        const preisAlt = +z.preis_pro_g || 0;
        const preis = sp ?? (mengeG >= 20 ? preisAlt * EI_GEWICHT_G : preisAlt * 1000);
        return normalisiereZutat({ ...z, einheit: "stk", menge_stk: stk, preis_je_stueck: preis, gramm_je_stueck: EI_GEWICHT_G });
      });
      return geaendert ? { ...p, zutaten } : p;
    });
    if (!zeilen) { setCloudMsg("Keine Ei-Zeile in Gramm gefunden."); return; }
    setProdukte(next);
    if (artikel) {
      const key = (artikel.ingredient_name || "").toLowerCase();
      const neu = { ...artikel, preisbasis: "stueck", gewicht_je_stueck_g: +artikel.gewicht_je_stueck_g || EI_GEWICHT_G };
      neu.gramm_je_stueck = stueckgewicht(neu);
      setPriceList(prev => ({ ...prev, [key]: neu }));
      setManuelleArtikel(prev => [...prev.filter(a => (a.ingredient_name || "").toLowerCase() !== key), neu]);
    }
    setCloudMsg(`✓ Ei in ${zeilen} Rezeptzeile${zeilen === 1 ? "" : "n"} auf Stück umgestellt`
      + (sp != null ? ` (${fmtEUR(sp)} je Ei aus der Preisliste)` : "") + ``);
  };

  // Datenpflege: eigene Kartoffel-/Reis-Produkte (Import 03.09.2026) entfernen -
  // die Varianten entstehen jetzt aus dem Grundrezept.
  const handleDuplikateEntfernen = async (ids) => {
    if (!writer || !ids?.length) return;
    if (!(await frage({ text: `${ids.length} Varianten-Duplikate löschen? Kartoffel- und Reisvarianten entstehen ab jetzt aus dem Grundrezept.`, ja: "Löschen", gefahr: true }))) return;
    const weg = new Set(ids);
    setProdukte(prev => prev.filter(p => !weg.has(p.id)));
    setCloudMsg(`✓ ${ids.length} Duplikate entfernt`);
  };

  const befunde = useMemo(() => pflegeBefunde(produkte, bowlBasis, priceList), [produkte, bowlBasis, priceList]);

  const handleProduktSave = (roh) => {
    // Rezeptzeilen gegen den Zutatenstamm verknuepfen (Stufe 1) - der Editor setzt zutat_id
    // beim Tippen, hier faengt die Verknuepfung auch eingefuegte oder alte Zeilen.
    const produkt = verknuepfeProdukte([roh], zutaten).produkte[0];
    setProdukte(prev => {
      const idx = prev.findIndex(p => p.id === produkt.id);
      if (idx === -1) return [...prev, produkt];
      return prev.map(p => p.id === produkt.id ? produkt : p);
    });
  };

  const handleProduktDelete = (id) => {
    setProdukte(prev => prev.filter(p => p.id !== id));
  };

  // Bon-Felder eines Rezepts setzen. Leerstring wird zu null, damit
  // "leer" ueberall dasselbe bedeutet (= Automatik).
  const handleBonFeld = (produktId, patch) => {
    if (!writer) return;
    const sauber = {};
    for (const [k, v] of Object.entries(patch)) {
      sauber[k] = typeof v === "string" && v.trim() ? v : null;
    }
    setProdukte(prev => prev.map(p => (p.id === produktId ? { ...p, ...sauber } : p)));
  };

  // Bon-Felder EINER Zutat (Kuechenmass, Handlungsanweisung) setzen.
  const handleBonZutat = (produktId, index, patch) => {
    if (!writer) return;
    const sauber = {};
    for (const [k, v] of Object.entries(patch)) {
      sauber[k] = typeof v === "string" && v.trim() ? v : null;
    }
    setProdukte(prev => prev.map(p => {
      if (p.id !== produktId) return p;
      const zutaten = (p.zutaten || []).map((z, i) => (i === index ? { ...z, ...sauber } : z));
      return { ...p, zutaten };
    }));
  };

  // Bestehendes Rezept als Kopie in eine Kampagne übernehmen.
  const handleKampagneImport = (produktId, kampagneName) => {
    setProdukte(prev => {
      const src = prev.find(p => p.id === produktId);
      if (!src) return prev;
      const kopie = {
        ...src,
        id: `kamp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        gruppe: "Kampagnen",
        untergruppe: null,
        kampagne: (kampagneName || "").trim() || null,
        zutaten: (src.zutaten || []).map(z => ({ ...z })),
        kampagne_start: null,
        kampagne_ende: null,
      };
      return [...prev, kopie];
    });
  };

  // Kassen-Sicht fuer verdichtete Kennzahlen: Bowls je Variante gezaehlt
  const produkteAufgeloest = useMemo(() => aufgeloesteProdukte(produkte, bowlBasis), [produkte, bowlBasis]);

  // System-Soll-WE (für globalen KPI im Header)
  const sollWeGlobal = useMemo(() => {
    return WARENGRUPPEN.reduce((s, g) => {
      const ps = produkteAufgeloest.filter(p => p.gruppe === g);
      if (ps.length === 0) return s;
      const avg = ps.reduce((x, p) => x + berechne(p).we_out, 0) / ps.length;
      return s + avg * (mix[g] || 0) / 100;
    }, 0);
  }, [produkteAufgeloest, mix]);

  // Verkaufsartikel ohne Kennzeichnung Pflicht-/Zusatzartikel (Kopf-Kennzahl)
  const ohneArtikelartAnzahl = useMemo(() => ohneArtikelart(produkte).length, [produkte]);

  const produkteImTab = useMemo(() => {
    if (aktiverTab === "Kampagnen")  return produkte.filter(p => p.gruppe === "Kampagnen");
    if (aktiverTab === "SystemWE")   return produkte;
    return produkte.filter(p => p.gruppe === aktiverTab);
  }, [produkte, aktiverTab]);

  const tabs = [
    ...WARENGRUPPEN.map(g => ({ id: g, label: g })),
    { id: "SystemWE",       label: "System-Wareneinsatz" },
    { id: "Naehrwerte",     label: "Nährwerttabelle" },
    { id: "Einkaufspreise", label: "Einkaufspreise" },
    { id: "Zutaten",        label: "Zutaten" },
    { id: "Zuordnung",      label: "Zuordnung" },
    { id: "Rezepturcheck",  label: "Rezeptur-Check" },
    { id: "Produktionsbons", label: "Produktionsbons" },
    { id: "Inventur",       label: "Inventur" },
  ];

  const bonsGepflegt = useMemo(() => produkte.filter(p => bonStatus(p) !== "auto").length, [produkte]);

  const inventurArtikelGesamt = useMemo(() => {
    let n = 0;
    for (const L of inventurJson.lieferanten) for (const g of L.untergruppen) n += g.artikel.length;
    return n;
  }, []);

  // ---- Auth-Gate (nur im Cloud-Modus) ----
  const FOREST_GRADIENT = "linear-gradient(135deg, #0d2818 0%, #1b4332 45%, #2d6a4f 100%)";
  const HEADER_GRADIENT = "linear-gradient(135deg, #1b4332 0%, #2d6a4f 40%, #40916c 100%)";
  if (cloudEnabled && !authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background: FOREST_GRADIENT }}>
        <img src={logoWeiss} alt="immergrün" className="h-10 w-auto opacity-95" />
        <div className="h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        <p className="text-sm" style={{ color: "#cfe8d6" }}>Lädt …</p>
      </div>
    );
  }
  if (cloudEnabled && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: FOREST_GRADIENT }}>
        {/* Dekorative Akzent-Flächen in IG-Fresh / Bright */}
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full blur-3xl opacity-20" style={{ background: "#96c31e" }} />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full blur-3xl opacity-10" style={{ background: "#52b788" }} />

        <div className="relative w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <img src={logoWeiss} alt="immergrün" className="h-12 w-auto drop-shadow" />
          </div>

          <div className="bg-white rounded-3xl shadow-2xl px-8 py-9 text-center border-t-4" style={{ borderTopColor: "#96c31e" }}>
            <h1 className="text-6xl font-black tracking-tight leading-none" style={{ color: "#084b32" }}>
              CALKU<span style={{ color: "#96c31e" }}>.</span>
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] mt-3" style={{ color: "#40916c" }}>
              Wareneinsatz &amp; Kalkulation
            </p>
            <p className="text-gray-500 text-sm mt-4 mb-7 leading-relaxed">
              Interner Zugang für das immergrün-Team.<br />
              Bitte mit deinem immergrün-Google-Konto anmelden.
            </p>

            <button onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-0.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              Mit Google anmelden
            </button>

            {cloudMsg && <p className="text-xs text-red-600 mt-4">{cloudMsg}</p>}

            <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
              <Lock size={12} /> Geschützter Bereich · nur @mein-immergruen.de
            </div>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: "#cfe8d6" }}>
            immergrün Franchise GmbH · Wareneinsatz &amp; Kalkulation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {ARCHIV && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-6 py-2 text-center">
          <b>Archiv:</b> Stand der alten Kalkulation vor dem Umstieg, nur lesbar. Gearbeitet wird in{" "}
          <a href="https://igcalku.netlify.app" className="underline font-medium">CALKU 2 (igcalku.netlify.app)</a>.
        </div>
      )}
      {/* Header */}
      <header className="text-white app-chrome-header" style={{ background: HEADER_GRADIENT, borderBottom: "3px solid #96c31e" }}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={logoWeiss} alt="immergrün" className="h-12 w-auto" />
              <div>
                <h1 className="text-3xl font-black tracking-tight leading-none">
                  CALKU<span style={{ color: "#96c31e" }}>.</span>
                </h1>
                <p className="text-green-100 text-sm mt-1">
                  Wareneinsatz, Deckungsbeiträge, Soll-/Ist-Vergleich
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex flex-wrap items-center gap-2">
                {writer && (
                  <label title="Neue Rezepte aus einer JSON-Importdatei einspielen (Preise/Ausbeuten werden aus der Preisliste ergänzt)"
                    className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <FileSpreadsheet size={14} /> Rezepte importieren
                    <input type="file" accept=".json,application/json" className="hidden"
                      onChange={e => { const f = e.target.files && e.target.files[0];
                        if (f) handleRezeptImport(f); e.target.value = ""; }} />
                  </label>
                )}
                {writer && (
                  <button onClick={() => setImportOpen(true)}
                    className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
                    <FileSpreadsheet size={14} /> CSV-Preise
                  </button>
                )}
                {/* Ein Speichern-Button: im Cloud-Modus speichert er für alle (Supabase),
                    im lokalen Modus lädt er die Daten als JSON-Datei herunter. */}
                {cloudEnabled && writer && <SpeicherStatus status={speicherStatus} onSpeichern={handleCloudSave} automatisch />}
                {cloudEnabled && (
                  <button onClick={handleJsonDownload}
                    title="Aktuellen Stand als JSON-Datei herunterladen — u. a. als Quelle für die Bestell-App (igorder)"
                    className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2">
                    <FileSpreadsheet size={14} /> Export
                  </button>
                )}
                {!cloudEnabled && <SpeicherStatus status={speicherStatus} onSpeichern={handleJsonDownload} />}
                {cloudEnabled && !writer && (
                  <span className="bg-white/15 rounded-lg px-3 py-2 text-sm font-medium">Nur-Lese-Zugriff</span>
                )}
                {cloudEnabled && session && (
                  <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/30">
                    <span className="text-xs text-green-100 max-w-[180px] truncate" title={email}>{email}</span>
                    <button onClick={signOut}
                      className="bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-2 text-xs font-medium">Abmelden</button>
                  </div>
                )}
              </div>
              {/* Import- und Speichermeldungen gehoeren nicht an den Cloud-Modus:
                  im lokalen Modus lief der Import sonst ohne jede Rueckmeldung. */}
              {(cloudMsg || (cloudEnabled && cloudInfo?.updated_by)) && (
                <span className="text-xs text-green-100">
                  {cloudMsg || `Zuletzt gespeichert: ${cloudInfo.updated_by || "—"}`}
                </span>
              )}
            </div>
          </div>

          {/* Globale KPI-Leiste */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Produkte gesamt</div>
              <div className="text-xl font-bold mt-1 tabular-nums">{fmtNum(produkte.length)}</div>
              {ohneArtikelartAnzahl > 0 && (
                <div className="text-[11px] text-amber-200 mt-0.5">{fmtNum(ohneArtikelartAnzahl)} ohne Artikelart (Pflicht/Zusatz)</div>
              )}
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Soll-WE (Mix)</div>
              <div className="text-xl font-bold mt-1 tabular-nums">{fmtPct(sollWeGlobal)}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Soll inkl. Schwund</div>
              <div className="text-xl font-bold mt-1 tabular-nums">{fmtPct(sollWeGlobal + SCHWUND_PCT)}</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="text-xs text-green-100 uppercase tracking-wide">Letzter Preisimport</div>
              <div className="text-sm font-medium mt-1">
                {letzterImport
                  ? `${fmtDate(letzterImport.datum)} · ${letzterImport.veraendert} Preise geändert`
                  : "noch keiner"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab-Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 app-chrome-nav">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setAktiverTab(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  aktiverTab === t.id
                    ? "border-green-700 text-green-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}>
                {t.label}
                {aktiverTab !== t.id && (() => {
                  if (t.id === "SystemWE")       return null;
                  if (t.id === "Einkaufspreise") return <span className="ml-1.5 text-xs text-gray-400">({Object.keys(priceList).length})</span>;
                  if (t.id === "Zutaten")        return <span className="ml-1.5 text-xs text-gray-400">({zutaten.length})</span>;
                  if (t.id === "Zuordnung")      return zuordnungOffen
                    ? <span className="ml-1.5 text-xs font-semibold text-amber-600">({zuordnungOffen})</span>
                    : <span className="ml-1.5 text-xs text-emerald-600">✓</span>;
                  if (t.id === "Rezepturcheck")  return rezepturBefunde.length
                    ? <span className="ml-1.5 text-xs font-semibold text-amber-600">({rezepturBefunde.length})</span>
                    : <span className="ml-1.5 text-xs text-emerald-600">✓</span>;
                  if (t.id === "Inventur")       return <span className="ml-1.5 text-xs text-gray-400">({inventurArtikelGesamt})</span>;
                  if (t.id === "Produktionsbons") return <span className="ml-1.5 text-xs text-gray-400">({bonsGepflegt}/{produkte.length})</span>;
                  const n = produkte.filter(p => p.gruppe === t.id).length;
                  return n > 0 ? <span className="ml-1.5 text-xs text-gray-400">({n})</span> : null;
                })()}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Suspense fallback={<div className="py-16 text-center text-sm text-gray-400">Lädt …</div>}>
          {aktiverTab === "SystemWE"       && <SystemWeTab produkte={produkteAufgeloest} mix={mix} setMix={setMix} />}
          {aktiverTab === "Naehrwerte"     && <NaehrwerteTab />}
        </Suspense>
        {aktiverTab === "Einkaufspreise" && (
          <EinkaufspreiseTab priceList={priceList} produkte={produkte} onUpdateArtikel={handleArtikelFelder} onAltAusbeute={handleAltAusbeuten}
            onFrischpreise={handleFrischpreise} onAddArtikel={handleAddArtikel} onGebinde={handleGebinde}
            onPreisAbgleich={handlePreisAbgleich} onDeleteArtikel={handleDeleteArtikel} canEdit={writer}
            onArtikelPatches={handleArtikelPatches}
            onSpeichern={cloudEnabled ? null : handleJsonDownload}
            speichernMsg={cloudMsg} />
        )}
        {aktiverTab === "Zutaten" && (
          <ZutatenTab zutaten={zutaten} produkte={produkte} priceList={priceList} canEdit={writer}
            onZutaten={setZutaten} onProdukte={setProdukte} onArtikelPatches={handleArtikelPatches}
            normalisiere={normalisiereZutat}
            onSpeichern={cloudEnabled ? null : handleJsonDownload}
            speichernMsg={cloudMsg} />
        )}
        {aktiverTab === "Inventur"       && <InventurTab inventur={inventurJson} />}
        {aktiverTab === "Zuordnung" && (
          <ZuordnungTab produkte={produkte} priceList={priceList} zuordnung={zuordnung} zutaten={zutaten} canEdit={writer}
            onZuordnen={(name, key) => zutatSetzen(name, key)}
            onEigen={(name) => zutatSetzen(name, null, true)}
            onLoesen={(name) => zutatSetzen(name, null, false)}
            onPreis={(e) => handleStammpreiseUebernehmen(e.rezeptzeilen.map(r => ({ produktId: r.produktId, zutat: e.name })))} />
        )}
        {aktiverTab === "Rezepturcheck"  && (
          <RezepturCheckTab produkte={produkte} befunde={rezepturBefunde} canEdit={writer}
            onEdit={setEditProdukt} onPreiseUebernehmen={handleStammpreiseUebernehmen} />
        )}
        {aktiverTab === "Produktionsbons" && (
          <BonsTab produkte={produkte} warengruppen={WARENGRUPPEN} vorlagen={bonVorlagen}
            onVorlagen={setBonVorlagen} onFeld={handleBonFeld} onZutat={handleBonZutat} canEdit={writer} />
        )}
        {aktiverTab === "Kampagnen"&& <KampagnenTab produkte={produkteImTab} setProdukte={setProdukte}
                                       onEdit={setEditProdukt} onDelete={handleProduktDelete} onNeu={handleProduktNeu}
                                       alleProdukte={produkte} onImport={handleKampagneImport} />}
        {WARENGRUPPEN.includes(aktiverTab) && aktiverTab !== "Kampagnen" && (
          <WarengruppenTab produkte={produkteImTab} gruppe={aktiverTab}
            onUpdate={handleProduktUpdate}
            onEdit={setEditProdukt}
            onDelete={handleProduktDelete}
            onNeu={handleProduktNeu}
            bowlBasis={bowlBasis} onBowlBasis={writer ? setBowlBasis : null} canEdit={writer}
            befunde={befunde} onEiUmstellen={handleEiAufStueck} onStueckUmstellen={handleStueckzeilenUmstellen} onDuplikateEntfernen={handleDuplikateEntfernen} />
        )}
      </main>

      <DialogHost />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handlePriceImport} onImportTg={handleTgImport} onTgArtikel={handleTgArtikel} onGebinde={handleGebinde}
        mappings={importMappings}
        onMappingMerken={(signatur, mapping, semantik, lieferant) =>
          setImportMappings(prev => ({ ...prev, [signatur]: { ...mapping, semantik, lieferant } }))} />

      <ProduktEditModal
        open={editProdukt !== null}
        produkt={editProdukt}
        priceList={priceList}
        bowlBasis={bowlBasis}
        zutaten={zutaten}
        onNeueZutat={writer ? handleNeueZutat : null}
        onClose={() => setEditProdukt(null)}
        onSave={handleProduktSave}
        onDelete={handleProduktDelete}
      />

      <footer className="max-w-7xl mx-auto px-6 py-4 text-xs text-gray-400 text-center app-chrome-footer">
        MwSt.: Speisen, Açaí, Smoothies, Frozen Yoghurt 7 % · übrige Getränke 19 % ·
        im Haus wie außer Haus · Unterschied IN/OUT ist allein die Verpackung ·
        Kennzahlen und Ampeln rechnen mit OUT (außer Haus) ·
        Schwellwert Smoothies/Juices/Iced Drinks: 24 % · Bowls/Wraps/Kampagnen: 26 % ·
        Schwund-Puffer: 3 %
      </footer>
    </div>
  );
}

