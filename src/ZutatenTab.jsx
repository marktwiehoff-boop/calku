// ============================================================
//  Tab „Zutaten" — der Zutatenstamm (E11, Stufe 1)
// ============================================================
// Eine Zeile je Zutat: Name, Aliase (alte Rezeptnamen), Artikel, Einheit, Stückgewicht,
// Arbeitseinheit (Beutel, Schale, Stück, Bund — womit das Team im Store hantiert), Ausbeute,
// Klasse. Rezeptzeilen verweisen per zutat_id; die Kandidatenliste „Rezeptnamen ohne Zutat"
// zeigt, was noch Freitext ist. Datenpflege: Stamm aus Rezepten anlegen, Verknüpfung
// auffrischen, Altlast Stückgewichte, Artikelstamm bereinigen (E11.8).
import { useMemo, useState } from "react";
import { AlertTriangle, Check, Plus, Search, Trash2, X } from "lucide-react";
import {
  KLASSEN, KLASSE_TITEL, STAMM_EINHEITEN,
  normalisiereName, normalisiereStamm, sortiereStamm, artikelNummer,
  verknuepfeProdukte, rezeptnamenOhneZutat, zeilenJeZutat, zutatAusRezeptzeilen, zutatenAusRezepten,
  zusammenfuehren, stempleStamm, bereinigeStueckgewichte, stammBefunde, bereinigeListe,
} from "./zutaten.js";
import { bereinigeArtikel } from "./artikelbereinigung.js";

const fmtNum = (v) => new Intl.NumberFormat("de-DE").format(Math.round(v || 0));
const fmtG = (g) => (g >= 1000 ? `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(g / 1000)} kg` : `${fmtNum(g)} g`);
const alsText = (w) => (w === null || w === undefined ? "" : String(w));
const leseZahl = (t) => {
  const s = String(t ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const FELD = "border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:border-green-600 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500";
const KNOPF = "bg-green-700 hover:bg-green-800 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50";
const KNOPF_LEISE = "border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50";

// Aliase als Chips mit Eingabe
function Aliase({ zutat, canEdit, onChange }) {
  const [neu, setNeu] = useState("");
  const aliase = (zutat.aliase ?? []).filter((a) => normalisiereName(a) !== normalisiereName(zutat.name));
  const hinzu = () => {
    const w = neu.trim();
    if (!w) return;
    onChange(bereinigeListe([...(zutat.aliase ?? []), w]));
    setNeu("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {aliase.map((a) => (
        <span key={a} className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
          {a}
          {canEdit && (
            <button type="button" onClick={() => onChange((zutat.aliase ?? []).filter((x) => normalisiereName(x) !== normalisiereName(a)))} aria-label={`${a} entfernen`} className="text-gray-400 hover:text-red-600">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        <input value={neu} onChange={(e) => setNeu(e.target.value)} onBlur={hinzu}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); hinzu(); } }}
          placeholder="+ Alias" aria-label={`Alias für ${zutat.name}`} className={`${FELD} w-24`} />
      )}
    </div>
  );
}

// Eine Stammzeile mit Inline-Bearbeitung (Commit bei Blur/Change).
function ZutatZeile({ zutat, zeilen, artikelOptionen, konflikt, canEdit, onPatch, onZusammenfuehren, onLoeschen, alleZutaten }) {
  const [ziel, setZiel] = useState("");
  const set = (patch) => onPatch(zutat.id, patch);
  const ae = zutat.arbeitseinheit ?? {};
  const ohneArbeit = !(ae.gramm > 0) && !(zutat.einheit === "stk" && zutat.stueck_gramm > 0);
  return (
    <tr className={`border-t border-gray-100 align-top ${konflikt ? "bg-amber-50" : ""}`}>
      <td className="px-2 py-1.5">
        <input value={alsText(zutat.name)} disabled={!canEdit} aria-label="Name"
          onChange={(e) => set({ name: e.target.value })} className={`${FELD} w-full font-medium`} />
        <div className="mt-1 text-[10px] text-gray-400 font-mono">{zutat.id}{zeilen ? ` · ${zeilen} Zeilen` : " · kein Rezept"}</div>
        {konflikt && <div className="text-[10px] text-amber-700">Alias doppelt: {konflikt.join(", ")}</div>}
      </td>
      <td className="px-2 py-1.5"><Aliase zutat={zutat} canEdit={canEdit} onChange={(aliase) => set({ aliase })} /></td>
      <td className="px-2 py-1.5">
        <select value={alsText(zutat.artikel_nr)} disabled={!canEdit} aria-label="Artikel"
          onChange={(e) => set({ artikel_nr: e.target.value || null })} className={`${FELD} w-40`}>
          <option value="">— kein Artikel —</option>
          {zutat.artikel_nr && !artikelOptionen.some((o) => o.nr === zutat.artikel_nr) && <option value={zutat.artikel_nr}>{zutat.artikel_nr} (nicht im Stamm)</option>}
          {artikelOptionen.map((o) => <option key={o.nr} value={o.nr}>{o.nr} · {o.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select value={zutat.einheit} disabled={!canEdit} aria-label="Einheit" onChange={(e) => set({ einheit: e.target.value })} className={FELD}>
          {STAMM_EINHEITEN.map((u) => <option key={u} value={u}>{u === "stk" ? "Stk" : u}</option>)}
        </select>
        {zutat.einheit === "stk" && (
          <input type="text" inputMode="decimal" defaultValue={alsText(zutat.stueck_gramm)} key={`sg-${zutat.stueck_gramm}`} disabled={!canEdit} aria-label="Gramm je Stück" placeholder="g/Stk"
            onBlur={(e) => set({ stueck_gramm: leseZahl(e.target.value) })}
            className={`${FELD} mt-1 w-16 text-right ${zutat.stueck_gramm > 0 ? "" : "border-amber-400"}`} />
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input type="text" defaultValue={alsText(ae.name)} key={`aen-${ae.name}`} disabled={!canEdit} aria-label="Arbeitseinheit Name" placeholder="Beutel, Schale …"
            onBlur={(e) => set({ arbeitseinheit: { ...ae, name: e.target.value } })} className={`${FELD} w-24`} />
          <input type="text" inputMode="decimal" defaultValue={alsText(ae.gramm)} key={`aeg-${ae.gramm}`} disabled={!canEdit} aria-label="Arbeitseinheit Gramm" placeholder="g"
            onBlur={(e) => set({ arbeitseinheit: { ...ae, gramm: leseZahl(e.target.value) } })} className={`${FELD} w-16 text-right ${ohneArbeit ? "border-amber-400" : ""}`} />
        </div>
      </td>
      <td className="px-2 py-1.5 text-right">
        <input type="text" inputMode="decimal" defaultValue={alsText(zutat.ausbeute_prozent)} key={`ab-${zutat.ausbeute_prozent}`} disabled={!canEdit} aria-label="Ausbeute Prozent" placeholder="100"
          onBlur={(e) => set({ ausbeute_prozent: leseZahl(e.target.value) })} className={`${FELD} w-14 text-right`} />
      </td>
      <td className="px-2 py-1.5">
        <select value={alsText(zutat.klasse)} disabled={!canEdit} aria-label="Klasse" onChange={(e) => set({ klasse: e.target.value || null })} className={FELD}>
          <option value="">—</option>
          {KLASSEN.map((k) => <option key={k} value={k}>{KLASSE_TITEL[k]}</option>)}
        </select>
      </td>
      {canEdit && (
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <select value={ziel} onChange={(e) => setZiel(e.target.value)} aria-label={`${zutat.name} zusammenführen mit`} className={`${FELD} w-28`}>
              <option value="">zusammenführen …</option>
              {alleZutaten.filter((z) => z.id !== zutat.id).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
            <button type="button" disabled={!ziel} onClick={() => { onZusammenfuehren(ziel, zutat.id); setZiel(""); }} className={KNOPF_LEISE} title="Diese Zutat geht in der gewählten auf">
              <Check size={12} />
            </button>
            <button type="button" disabled={zeilen > 0} onClick={() => onLoeschen(zutat.id)} className="text-gray-300 hover:text-red-600 disabled:opacity-30" title={zeilen > 0 ? "Hat Rezeptzeilen — erst zusammenführen" : "Zutat löschen"}>
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

export default function ZutatenTab({ zutaten = [], produkte = [], priceList = {}, canEdit = true, onZutaten, onProdukte, onArtikelPatches, normalisiere = (z) => z, onSpeichern, speichernMsg }) {
  const [suche, setSuche] = useState("");
  const [nurOffen, setNurOffen] = useState(false);
  const [aliasZiel, setAliasZiel] = useState({});
  const [bericht, setBericht] = useState(null);
  const [meldung, setMeldung] = useState("");

  const sortiert = useMemo(() => sortiereStamm(zutaten), [zutaten]);
  const jeZeilen = useMemo(() => zeilenJeZutat(produkte), [produkte]);
  const offen = useMemo(() => rezeptnamenOhneZutat(produkte, zutaten, priceList), [produkte, zutaten, priceList]);
  const befunde = useMemo(() => stammBefunde(zutaten, produkte), [zutaten, produkte]);
  const konfliktJeId = useMemo(() => {
    const m = new Map();
    for (const k of befunde.konflikte) for (const id of k.ids) m.set(id, [...(m.get(id) ?? []), k.alias]);
    return m;
  }, [befunde]);
  const artikelOptionen = useMemo(() => {
    const seen = new Set();
    return Object.values(priceList)
      .map((a) => ({ nr: artikelNummer(a), name: a.ingredient_name }))
      .filter((o) => o.nr && !seen.has(o.nr) && seen.add(o.nr))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  }, [priceList]);
  const zeilenGesamt = useMemo(() => produkte.reduce((n, p) => n + (p.zutaten ?? []).filter((z) => String(z.name ?? "").trim()).length, 0), [produkte]);
  const zeilenVerknuepft = useMemo(() => [...jeZeilen.values()].reduce((a, b) => a + b, 0), [jeZeilen]);

  const gefiltert = useMemo(() => {
    const s = normalisiereName(suche);
    return sortiert.filter((z) => {
      if (nurOffen && !(!(z.arbeitseinheit?.gramm > 0) && !(z.einheit === "stk" && z.stueck_gramm > 0))) return false;
      if (!s) return true;
      return normalisiereName(z.name).includes(s) || (z.aliase ?? []).some((a) => normalisiereName(a).includes(s)) || String(z.artikel_nr ?? "").includes(s);
    });
  }, [sortiert, suche, nurOffen]);

  // ---- Aktionen (immer Stamm UND Produkte aus demselben Stand ableiten) ----
  const setzeBeides = (stamm, prod, text) => {
    onZutaten(stamm);
    if (prod !== produkte) onProdukte(prod);
    if (text) setMeldung(text);
  };

  const anlegenAusRezepten = () => {
    const { zutaten: neu, neu: n } = zutatenAusRezepten(produkte, priceList, zutaten);
    const { produkte: pn, verknuepft } = verknuepfeProdukte(produkte, neu);
    setzeBeides(neu, pn, `${n} Zutaten angelegt, ${verknuepft} Rezeptzeilen verknüpft — bitte prüfen und oben „Speichern".`);
  };

  const patchZutat = (id, patch) => {
    const alt = zutaten.find((z) => z.id === id);
    if (!alt) return;
    const neu = normalisiereStamm({ ...alt, ...patch });
    const stamm = zutaten.map((z) => (z.id === id ? neu : z));
    let prod = produkte;
    let text = "";
    if ("ausbeute_prozent" in patch || "stueck_gramm" in patch || "einheit" in patch) {
      const r = stempleStamm(produkte, neu, normalisiere);
      prod = r.produkte;
      if (r.zeilen) text = `${neu.name}: ${r.zeilen} Rezeptzeilen nachgezogen.`;
    }
    if ("name" in patch || "aliase" in patch) prod = verknuepfeProdukte(prod, stamm).produkte;
    setzeBeides(stamm, prod, text);
  };

  const neueZutat = (o) => {
    const z = zutatAusRezeptzeilen(o.name, o.rezeptzeilen, o.artikel);
    if (zutaten.some((x) => x.id === z.id)) { setMeldung(`Den Schlüssel „${z.id}" gibt es schon — als Alias hinzufügen oder umbenennen.`); return; }
    const stamm = sortiereStamm([...zutaten, z]);
    setzeBeides(stamm, verknuepfeProdukte(produkte, stamm).produkte, `„${z.name}" angelegt.`);
  };

  const alsAlias = (o) => {
    const zielId = aliasZiel[o.name] ?? sortiert[0]?.id;
    const ziel = zutaten.find((z) => z.id === zielId);
    if (!ziel) return;
    patchZutat(zielId, { aliase: [...(ziel.aliase ?? []), o.name] });
    setMeldung(`„${o.name}" ist jetzt Alias von ${ziel.name}.`);
  };

  const fuehreZusammen = (zielId, quellId) => {
    const r = zusammenfuehren({ zutaten, produkte }, zielId, quellId);
    const ziel = r.zutaten.find((z) => z.id === zielId);
    setzeBeides(r.zutaten, r.produkte, `Zusammengeführt in „${ziel?.name}" — ${r.zeilen} Rezeptzeilen umgehängt.`);
  };

  const loeschen = (id) => {
    if (jeZeilen.get(id)) return;
    const z = zutaten.find((x) => x.id === id);
    if (!window.confirm(`„${z?.name}" wirklich löschen?`)) return;
    setzeBeides(zutaten.filter((x) => x.id !== id), produkte, `„${z?.name}" gelöscht.`);
  };

  const verknuepfung = () => {
    const r = verknuepfeProdukte(produkte, zutaten);
    setzeBeides(zutaten, r.produkte, `Verknüpfung geprüft: ${r.verknuepft} Zeilen mit Zutat, ${r.ohne} ohne, ${r.geaendert} geändert.`);
  };

  const stueckgewichte = () => {
    const r = bereinigeStueckgewichte(produkte);
    setzeBeides(zutaten, r.produkte, r.zeilen ? `${r.zeilen} Altlast-Stückgewichte aus Gramm-Zeilen entfernt.` : "Keine Altlast-Stückgewichte mehr.");
  };

  const artikelPruefen = () => setBericht(bereinigeArtikel(priceList));
  const artikelUebernehmen = () => {
    if (!bericht) return;
    onArtikelPatches(bericht.patches);
    setMeldung(`${bericht.geaendert} Artikel bereinigt (Einheit, Packungsgröße, Preisbasis, Nettogewicht) — Preise unverändert. Bitte oben „Speichern".`);
    setBericht(null);
  };

  const altlast = useMemo(() => bereinigeStueckgewichte(produkte).zeilen, [produkte]);

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Zutatenstamm</h2>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl">
              Eine Zeile je Zutat. Rezeptzeilen verweisen darauf, statt den Namen frei zu tragen. Arbeitseinheit (Beutel, Schale, Stück, Bund) und Ausbeute
              sind das, was die IG-Store-Schnittliste braucht, um „7 Beutel" oder „9 Gurken" statt Gramm zu zeigen. Ausbeute und Stückgewicht werden beim Ändern in die Rezepturen gestempelt.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-gray-500">Zutaten</div><div className="text-base font-bold tabular-nums">{fmtNum(zutaten.length)}</div></div>
            <div className="bg-gray-50 rounded-lg px-3 py-2"><div className="text-gray-500">Zeilen verknüpft</div><div className="text-base font-bold tabular-nums">{fmtNum(zeilenVerknuepft)}<span className="text-gray-400 font-normal"> / {fmtNum(zeilenGesamt)}</span></div></div>
            <div className={`rounded-lg px-3 py-2 ${offen.length ? "bg-amber-50" : "bg-gray-50"}`}><div className="text-gray-500">Namen ohne Zutat</div><div className="text-base font-bold tabular-nums">{fmtNum(offen.length)}</div></div>
            <div className={`rounded-lg px-3 py-2 ${befunde.ohneArbeitseinheit ? "bg-amber-50" : "bg-gray-50"}`}><div className="text-gray-500">ohne Arbeitseinheit</div><div className="text-base font-bold tabular-nums">{fmtNum(befunde.ohneArbeitseinheit)}</div></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {canEdit && zutaten.length === 0 && (
            <button type="button" onClick={anlegenAusRezepten} className={KNOPF}><Plus size={12} className="inline mr-1" />Stamm aus den Rezepten anlegen</button>
          )}
          {canEdit && zutaten.length > 0 && offen.length > 0 && (
            <button type="button" onClick={anlegenAusRezepten} className={KNOPF_LEISE}>alle {offen.length} offenen Namen als Zutaten anlegen</button>
          )}
          {canEdit && <button type="button" onClick={verknuepfung} className={KNOPF_LEISE}>Verknüpfung prüfen</button>}
          {canEdit && altlast > 0 && <button type="button" onClick={stueckgewichte} className={KNOPF_LEISE} title="gramm_je_stueck in Gramm-Zeilen trägt Gebindegrößen aus einer alten Ableitung (Banane 1000, Ingwer 1500)">Altlast Stückgewichte entfernen ({altlast})</button>}
          {canEdit && <button type="button" onClick={artikelPruefen} className={KNOPF_LEISE}>Artikelstamm prüfen</button>}
          {onSpeichern && canEdit && <button type="button" onClick={onSpeichern} className={`${KNOPF} ml-auto`}>Speichern</button>}
        </div>
        {(meldung || speichernMsg) && <p className="text-xs text-green-800 mt-2">{speichernMsg || meldung}</p>}
        {befunde.konflikte.length > 0 && (
          <p className="text-xs text-amber-800 mt-2"><AlertTriangle size={12} className="inline mr-1" />Aliase in mehreren Zutaten: {befunde.konflikte.map((k) => `${k.alias} (${k.ids.join(", ")})`).join(" · ")} — die erste bekommt die Rezeptzeilen.</p>
        )}
      </div>

      {/* Artikel-Bericht */}
      {bericht && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-gray-800">Artikelstamm — Bericht</h3>
            <span className="text-xs text-gray-500">{bericht.gesamt} Artikel · {bericht.geaendert} automatisch bereinigbar · {bericht.pruefen} von Hand prüfen</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Bereinigt werden nur Etiketten (Einheit „Liter" → „l", Gramm unter „kg", Preisbasis, Nettogewicht-Platzhalter). Preise bleiben, wie sie sind. Faktor-Abweichungen jenseits 1000 (Jasminreis, Frappepulver) sind Preisfehler und bleiben Handarbeit.
          </p>
          <ul className="mt-2 max-h-72 overflow-auto divide-y divide-gray-100 text-xs">
            {bericht.bericht.map((b) => (
              <li key={b.key} className={`py-1.5 flex gap-2 ${b.pruefen ? "text-amber-800" : "text-gray-700"}`}>
                <span className="w-56 shrink-0 font-medium truncate" title={b.name}>{b.name}</span>
                <span className="flex-1">{b.hinweise.join(" · ") || "Preisbasis gesetzt"}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={artikelUebernehmen} disabled={!bericht.geaendert} className={KNOPF}>{bericht.geaendert} Artikel bereinigen</button>
            <button type="button" onClick={() => setBericht(null)} className={KNOPF_LEISE}>Schließen</button>
          </div>
        </div>
      )}

      {/* Rezeptnamen ohne Zutat */}
      {offen.length > 0 && zutaten.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold text-amber-900">Rezeptnamen ohne Zutat</h3>
            <span className="text-xs text-amber-800">{offen.length} Namen · Freitext, den keine Zutat kennt</span>
          </div>
          <ul className="mt-2 divide-y divide-amber-200 bg-white rounded-lg">
            {offen.map((o) => (
              <li key={o.name} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800">{o.name}</span>
                  <span className="text-gray-500"> · {o.zeilen} {o.zeilen === 1 ? "Zeile" : "Zeilen"} in {o.produkte} {o.produkte === 1 ? "Produkt" : "Produkten"}{o.artikel ? ` · Artikel ${artikelNummer(o.artikel) || "ohne Nr."}` : ""}</span>
                </span>
                {canEdit && (
                  <>
                    <button type="button" onClick={() => neueZutat(o)} className={KNOPF_LEISE}>Zutat anlegen</button>
                    <select value={aliasZiel[o.name] ?? sortiert[0]?.id ?? ""} onChange={(e) => setAliasZiel((m) => ({ ...m, [o.name]: e.target.value }))} aria-label={`Zutat für ${o.name}`} className={`${FELD} w-40`}>
                      {sortiert.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                    <button type="button" onClick={() => alsAlias(o)} className={KNOPF_LEISE}>als Alias</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stamm */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
          <span className="relative">
            <Search size={12} className="absolute left-2 top-2 text-gray-400" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen (Name, Alias, Artikelnummer)" aria-label="Suchen" className={`${FELD} pl-6 w-64`} />
          </span>
          <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> nur ohne Arbeitseinheit</label>
          <span className="ml-auto text-xs text-gray-400">{gefiltert.length} von {zutaten.length}</span>
        </div>
        {zutaten.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Noch kein Zutatenstamm. „Stamm aus den Rezepten anlegen" liest alle Zutatennamen der Rezepturen, trifft Artikel über den Namen und übernimmt Stückgewicht und Ausbeute aus den Rezeptzeilen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium w-52">Zutat</th>
                  <th className="text-left px-2 py-1.5 font-medium">Aliase</th>
                  <th className="text-left px-2 py-1.5 font-medium">Artikel (Transgourmet)</th>
                  <th className="text-left px-2 py-1.5 font-medium w-20">Einheit</th>
                  <th className="text-left px-2 py-1.5 font-medium" title="Womit das Team hantiert: Beutel 1000, Schale 500, Stück 470, Bund 100">Arbeitseinheit · g</th>
                  <th className="text-right px-2 py-1.5 font-medium w-16" title="Anteil der Rohware, der im Rezept ankommt (Gurke 80)">Ausb. %</th>
                  <th className="text-left px-2 py-1.5 font-medium w-20">Klasse</th>
                  {canEdit && <th className="w-44"></th>}
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((z) => (
                  <ZutatZeile key={z.id} zutat={z} zeilen={jeZeilen.get(z.id) ?? 0} artikelOptionen={artikelOptionen} konflikt={konfliktJeId.get(z.id) ?? null}
                    canEdit={canEdit} onPatch={patchZutat} onZusammenfuehren={fuehreZusammen} onLoeschen={loeschen} alleZutaten={sortiert} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400">
        ids sind die Schlüssel des IG-Store-Stamms (T16). Der Nachtjob liest ab Stufe 3 diesen Stamm und spiegelt Aliase, Arbeitseinheit, Stückgewicht, Ausbeute und Artikelnummer nach IG Store.
      </p>
    </div>
  );
}
