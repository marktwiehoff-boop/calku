// Warengruppen-Tabs (Smoothies … Wraps), Bowl-Basis und Kampagnen. Aus App.jsx ausgelagert (28.09.2026).
import { BOWL_VARIANTE, EINHEIT, GRUPPIERBARE, SCHWELLWERTE, SUBGROUPS_BY_GRUPPE, ampelFarbe, aufgeloesteProdukte, basisWaehlbar, basisZutaten, berechne, bowlBasisOderDefault, bowlGroesse, bowlUntergruppe, bowlVariante, bowlVarianten, fmtDate, fmtEUR, fmtMenge, fmtNum, fmtNum2, fmtPct, fmtRange, gruppiereProdukte, istSalatZutat, istStueck, mitMenge, mitPreis, untergruppeVon, zutatEinheit, zutatKosten, zutatMenge, zutatMengeVariante, zutatPreisAnzeige } from "../kalkulation.js";
import { ARTIKELART, artikelartVon, naechsteArtikelart, ohneArtikelart } from "../artikelart.js";
import { AlertTriangle, Calendar, Check, ChevronDown, ChevronRight, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { frage } from "../ui/dialog.jsx";
import { useMemo, useState } from "react";
// ============================================================
//  KOMPONENTEN
// ============================================================
export function KPICard({ title, value, sub, stufe }) {
  const styles = {
    rot:   "bg-red-50    border-red-300    text-red-800",
    gruen: "bg-green-50  border-green-300  text-green-800",
    info:  "bg-blue-50   border-blue-300   text-blue-800",
    grau:  "bg-gray-50   border-gray-200   text-gray-800",
  };
  return (
    <div className={`border rounded-xl p-4 ${styles[stufe || "grau"]}`}>
      <div className="text-xs font-medium opacity-70 uppercase tracking-wide">{title}</div>
      <div className="text-2xl font-bold mt-1 leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  );
}

export function AmpelDot({ quote, gruppe }) {
  const a = ampelFarbe(quote, gruppe);
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${a.dot}`} title={`Schwellwert ${gruppe}: rot > ${SCHWELLWERTE[gruppe].rot}%`} />;
}

// Editierbarer Zahlen-Input (Inline) — stopPropagation, damit Klick ins Feld nicht die Zeile zuklappt
export function EditNum({ value, onChange, step = "0.01", min = "0", suffix, width = "w-20" }) {
  return (
    <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        type="number" step={step} min={min} value={value}
        onChange={e => onChange(e.target.value)}
        className={`${width} text-right tabular-nums bg-transparent border-b border-gray-200 hover:border-gray-400 focus:border-emerald-600 focus:outline-none px-1 py-0.5`}
      />
      {suffix && <span className="text-gray-500">{suffix}</span>}
    </span>
  );
}

// readOnly: abgeleitete Zeilen (Bowl-Variante in der Kassen-Sicht) zeigen nur;
// bearbeitet wird das Grundrezept unter „Alle“ bzw. im Bearbeiten-Dialog.
// Kennzeichen Pflicht-/Zusatzartikel in der Produktzeile. Klick wechselt
// (leer -> Pflicht -> Zusatz -> Pflicht), solange die Zeile editierbar ist.
// Ohne Kennzeichen steht gestrichelt "Art?" - jeder Verkaufsartikel braucht eins.
export function ArtikelartBadge({ p, onUpdate, readOnly }) {
  const art = artikelartVon(p);
  const klickbar = !readOnly && typeof onUpdate === "function";
  const cls = art === "pflicht" ? "text-emerald-800 bg-emerald-100 border-emerald-200"
            : art === "zusatz" ? "text-sky-800 bg-sky-100 border-sky-200"
            : "text-amber-800 bg-amber-50 border-amber-300 border-dashed";
  const label = art ? ARTIKELART[art].kurz : "Art?";
  const title = art
    ? `${ARTIKELART[art].label}${klickbar ? " — klicken zum Wechseln" : ""}`
    : "Artikelart fehlt: Pflichtartikel oder Zusatzartikel?" + (klickbar ? " Klicken setzt Pflichtartikel." : "");
  const base = `text-[10px] uppercase tracking-wide border rounded px-1 ${cls}`;
  if (!klickbar) return <span title={title} className={base}>{label}</span>;
  return (
    <button type="button" title={title}
      onClick={(e) => { e.stopPropagation(); onUpdate({ artikelart: naechsteArtikelart(art) }); }}
      className={`${base} hover:brightness-95`}>{label}</button>
  );
}

// Datenpflege-Leiste: Produkte ohne Artikelart in der aktuellen Sicht.
// Bewusst OHNE Sammel-Kennzeichnung (Mark, 22.09.2026): nicht alle Smoothies,
// Juices oder Bowls sind Pflichtartikel - die Entscheidung faellt je Artikel,
// im Rezeptdialog oder per Klick auf das Kennzeichen in der Zeile.
export function ArtikelartHinweis({ produkte }) {
  const offen = ohneArtikelart(produkte);
  if (!offen.length) return null;
  const namen = offen.slice(0, 5).map(p => p.name || "(ohne Name)").join(", ") + (offen.length > 5 ? " …" : "");
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
      <span className="text-xs leading-relaxed">
        <span className="inline-flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} className="text-amber-700" /> {offen.length} Artikel ohne Artikelart</span>
        {" "}({namen}). Jeder Verkaufsartikel wird einzeln als <strong>Pflichtartikel</strong> oder <strong>Zusatzartikel</strong> gekennzeichnet —
        im Rezeptdialog oder per Klick auf das Kennzeichen in der Zeile.
      </span>
    </div>
  );
}

export function ProduktZeile({ p, calc, gruppe, expanded, onToggle, onUpdate, onEdit, onDelete, displayName, indent, readOnly, hinweis }) {
  const aIn  = ampelFarbe(calc.we_in,  gruppe);
  const aOut = ampelFarbe(calc.we_out, gruppe);
  const editierbar = !readOnly && typeof onUpdate === "function";

  const updateZutat = (idx, field, value) => {
    const zutaten = p.zutaten.map((z, i) => {
      if (i !== idx) return z;
      return field === "menge" ? mitMenge(z, value) : mitPreis(z, value);
    });
    onUpdate({ zutaten });
  };
  const hatBasis = (p.zutaten || []).some(z => z.basis);

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2">
          <div className={`flex items-center gap-2 ${indent ? "pl-8" : ""}`}>
            {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            <span className={`${indent ? "text-gray-700" : "font-medium text-gray-800"}`}>{displayName || p.name}</span>
            {p.untergruppe && <span className="text-xs text-gray-400">({p.untergruppe})</span>}
            <ArtikelartBadge p={p} onUpdate={onUpdate} readOnly={readOnly} />
            {hinweis && <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1">{hinweis}</span>}
            <span className="ml-2 inline-flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); onEdit && onEdit(p); }}
                className="text-gray-300 hover:text-emerald-600 p-1" title="Bearbeiten">
                <Pencil size={12} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); frage({ text: `Rezept „${p.name}“ wirklich löschen?`, ja: "Löschen", gefahr: true }).then(ok => ok && onDelete && onDelete(p.basis_produkt_id || p.id)); }}
                className="text-gray-300 hover:text-red-600 p-1" title="Löschen">
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(calc.wareneinsatz)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(p.vk_in_brutto)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-500 text-xs">{fmtEUR(calc.vk_in_netto)}</td>
        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${aIn.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={calc.we_in} gruppe={gruppe} />
            {fmtPct(calc.we_in)}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(calc.db_in)}</td>
        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${aOut.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={calc.we_out} gruppe={gruppe} />
            {fmtPct(calc.we_out)}
          </span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtEUR(calc.db_out)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={8} className="px-6 py-3">
            <div className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wide flex items-center gap-2">
              Zutaten <span className="text-gray-400 normal-case font-normal">
                {editierbar ? "— Mengen und Preise sind editierbar" : "— abgeleitet aus dem Grundrezept; bearbeiten unter „Alle“ oder über den Stift"}
              </span>
            </div>
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="text-left  px-2 py-1 font-medium">Zutat</th>
                  <th className="text-right px-2 py-1 font-medium">Menge</th>
                  <th className="text-right px-2 py-1 font-medium">Preis</th>
                  <th className="text-right px-2 py-1 font-medium">Kosten</th>
                  <th className="text-left  px-2 py-1 font-medium">Lieferant</th>
                </tr>
              </thead>
              <tbody>
                {p.zutaten.map((z, i) => {
                  const e = EINHEIT[zutatEinheit(z)];
                  const ohneGewicht = istStueck(z) && !(+z.gramm_je_stueck > 0);
                  return (
                  <tr key={i} className={`border-t border-gray-100 ${z.basis ? "text-gray-500 bg-emerald-50/30" : ""}`}>
                    <td className="px-2 py-1 text-gray-700">
                      {z.name}
                      {z.basis && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1">Basis</span>}
                      {ohneGewicht && (
                        <span className="ml-1.5 text-[10px] text-amber-700"
                          title="g/Stück fehlt — ohne Gramm-Äquivalent fehlt die Zutat im Bestellvorschlag. Pflege im Bearbeiten-Dialog oder im Tab Einkaufspreise.">
                          ⚠ g/Stk fehlt
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {editierbar && !z.basis
                        ? <EditNum value={zutatMenge(z)} step="1" suffix={e.menge} width="w-16" onChange={v => updateZutat(i, "menge", v)} />
                        : <span>{fmtMenge(zutatMenge(z))} <span className="text-gray-500">{e.menge}</span></span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {editierbar && !z.basis
                        ? <EditNum value={+zutatPreisAnzeige(z).toFixed(2)} step="0.01" suffix={e.preis} width="w-20" onChange={v => updateZutat(i, "preis", v)} />
                        : <span>{fmtNum2(zutatPreisAnzeige(z))} <span className="text-gray-500">{e.preis}</span></span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums"
                        title={z.ausbeute_prozent && z.ausbeute_prozent < 100
                          ? `inkl. Ausbeute ${z.ausbeute_prozent} % (Pflege im Tab Einkaufspreise)` : undefined}>
                      {fmtEUR(z.cost)}{z.ausbeute_prozent && z.ausbeute_prozent < 100 ? "*" : ""}
                    </td>
                    <td className="px-2 py-1 text-gray-500">{z.lieferant}</td>
                  </tr>
                  );
                })}
                <tr className="border-t border-gray-300 font-medium">
                  <td className="px-2 py-1">Material</td>
                  <td colSpan={2} />
                  <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(calc.material)}</td>
                  <td />
                </tr>
                <tr className="text-gray-600">
                  <td className="px-2 py-1">+ Verpackung</td>
                  <td colSpan={2} className="text-right">
                    {editierbar
                      ? <EditNum value={+(p.verpackung_eur || 0).toFixed(2)} step="0.01" suffix="€" width="w-16"
                          onChange={v => onUpdate({ verpackung_eur: Math.max(0, +v || 0) })} />
                      : <span className="tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</span>}
                  </td>
                  <td />
                  <td />
                </tr>
                <tr className="font-semibold text-gray-800">
                  <td className="px-2 py-1">= Wareneinsatz außer Haus</td>
                  <td colSpan={2} />
                  <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(calc.wareneinsatz)}</td>
                  <td />
                </tr>
                {p.zutaten.some(z => z.ausbeute_prozent && z.ausbeute_prozent < 100) && (
                  <tr>
                    <td colSpan={5} className="px-2 pt-1 text-[11px] text-gray-400">
                      * inkl. Ausbeute — zentral gepflegt im Tab „Einkaufspreise".
                    </td>
                  </tr>
                )}
                {hatBasis && (
                  <tr>
                    <td colSpan={5} className="px-2 pt-1 text-[11px] text-gray-400">
                      Basis-Zeilen kommen aus der zentralen Basis-Rezeptur (Bowls-Tab, oben) und gelten für alle Bowls mit wählbarer Basis.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// Sammelzeile für eine Sorte (z. B. „Erdbeerliebe" mit 3 Größen) — gruppierter Modus
export function SortenGruppeZeile({ sorte, gruppe, expanded, onToggle, expandedProdukt, onToggleProdukt, onUpdate, onEdit, onDelete }) {
  const calcs = sorte.items.map(p => ({ p, c: berechne(p) }));
  const weInArr  = calcs.map(x => x.c.we_in);
  const weOutArr = calcs.map(x => x.c.we_out);
  const wareArr  = calcs.map(x => x.c.wareneinsatz);
  const vkInArr      = calcs.map(x => x.p.vk_in_brutto);
  const vkInNettoArr = calcs.map(x => x.c.vk_in_netto);
  const dbInArr  = calcs.map(x => x.c.db_in);
  const dbOutArr = calcs.map(x => x.c.db_out);

  // Ampel-Farbe = schlechtester (höchster) WE-Wert in der Gruppe
  const worstWeIn  = Math.max(...weInArr);
  const worstWeOut = Math.max(...weOutArr);
  const aIn  = ampelFarbe(worstWeIn,  gruppe);
  const aOut = ampelFarbe(worstWeOut, gruppe);

  return (
    <>
      <tr className="border-b border-gray-200 bg-emerald-50/40 hover:bg-emerald-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown size={14} className="text-emerald-700" />
              : <ChevronRight size={14} className="text-emerald-700" />}
            <span className="font-semibold text-gray-800">{sorte.base}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(wareArr, fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(vkInArr, fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">{fmtRange(vkInNettoArr, fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aIn.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstWeIn} gruppe={gruppe} />
            {fmtRange(weInArr, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(dbInArr, fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aOut.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstWeOut} gruppe={gruppe} />
            {fmtRange(weOutArr, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(dbOutArr, fmtEUR)}</td>
      </tr>
      {expanded && calcs.map(({ p, c }) => (
        <ProduktZeile
          key={p.id}
          p={p}
          calc={c}
          gruppe={gruppe}
          displayName={p._size || p.name}
          indent
          expanded={expandedProdukt === p.id}
          onToggle={() => onToggleProdukt(p.id)}
          onUpdate={(updates) => onUpdate(p.id, updates)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

// ============================================================
//  BOWLS: eine Zeile je Bowl, darunter die Varianten Salat / Kartoffel / Reis
// ============================================================
export function BowlZeile({ p, gruppe, basis, expanded, onToggle, onUpdate, onEdit, onDelete, canEdit }) {
  const keys = bowlVarianten(p, basis) || ["salat"];
  const varianten = keys.map(k => {
    const vp = bowlVariante(p, k, basis);
    return { key: k, def: BOWL_VARIANTE[k], vp, c: berechne(vp) };
  });
  const groesse = bowlGroesse(p);
  const arr = (f) => varianten.map(f);
  const weIn = arr(x => x.c.we_in), weOut = arr(x => x.c.we_out);
  const worstIn = Math.max(...weIn), worstOut = Math.max(...weOut);
  const aIn = ampelFarbe(worstIn, gruppe), aOut = ampelFarbe(worstOut, gruppe);
  const editierbar = canEdit && typeof onUpdate === "function";

  // Salat-Spalte = Menge des Rezepts; Kartoffel-/Reis-Spalte = Ausnahme nur
  // für diese Bowl (leer = zurück zur Regel bzw. zur Rezeptmenge).
  const updateZutat = (idx, field, value, variante) => {
    if (!editierbar) return;
    const zutaten = p.zutaten.map((z, i) => {
      if (i !== idx) return z;
      if (field === "preis") return mitPreis(z, value);
      if (variante === "salat") return mitMenge(z, value);
      const mjv = { ...(z.menge_je_variante || {}) };
      if (value === "" || value == null) delete mjv[variante];
      else mjv[variante] = Math.max(0, +value || 0);
      const next = { ...z, menge_je_variante: mjv };
      if (!Object.keys(mjv).length) delete next.menge_je_variante;
      return next;
    });
    onUpdate({ zutaten });
  };

  // VK je Variante: Salat = VK des Rezepts; Kartoffel/Reis nur, wenn er
  // abweicht (sonst gilt der VK des Rezepts).
  const updateVk = (variante, wert) => {
    if (!editierbar) return;
    const v = Math.max(0, +wert || 0);
    if (variante === "salat") { onUpdate({ vk_in_brutto: v, vk_out_brutto: v }); return; }
    const vkv = { ...(p.vk_varianten || {}) };
    if (v > 0 && Math.abs(v - (+p.vk_out_brutto || 0)) > 0.004) vkv[variante] = { vk_in_brutto: v, vk_out_brutto: v };
    else delete vkv[variante];
    onUpdate({ vk_varianten: Object.keys(vkv).length ? vkv : undefined });
  };

  const basisZeilen = varianten.filter(x => x.key !== "salat")
    .flatMap(x => basisZutaten(x.key, p, basis).map(bz => ({ ...bz, _variante: x.key })));
  const th = (text, right = true, key) => (
    <th key={key} className={`${right ? "text-right" : "text-left"} px-2 py-1 font-medium`}>{text}</th>
  );

  return (
    <>
      <tr className="border-b border-gray-200 bg-emerald-50/40 hover:bg-emerald-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {expanded ? <ChevronDown size={14} className="text-emerald-700" /> : <ChevronRight size={14} className="text-emerald-700" />}
            <span className="font-semibold text-gray-800">{p.name}</span>
            <span className="text-xs text-gray-400">({varianten.map(x => x.def.kurz).join(" · ")})</span>
            <ArtikelartBadge p={p} onUpdate={editierbar ? onUpdate : null} />
            <span className="ml-2 inline-flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); onEdit && onEdit(p); }}
                className="text-gray-300 hover:text-emerald-600 p-1" title="Bearbeiten">
                <Pencil size={12} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); frage({ text: `Rezept „${p.name}“ wirklich löschen?`, ja: "Löschen", gefahr: true }).then(ok => ok && onDelete && onDelete(p.id)); }}
                className="text-gray-300 hover:text-red-600 p-1" title="Löschen">
                <Trash2 size={12} />
              </button>
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.c.wareneinsatz), fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.vp.vk_in_brutto), fmtEUR)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">{fmtRange(arr(x => x.c.vk_in_netto), fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aIn.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstIn} gruppe={gruppe} />
            {fmtRange(weIn, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.c.db_in), fmtEUR)}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${aOut.text}`}>
          <span className="inline-flex items-center gap-1.5">
            <AmpelDot quote={worstOut} gruppe={gruppe} />
            {fmtRange(weOut, fmtPct)}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{fmtRange(arr(x => x.c.db_out), fmtEUR)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={8} className="px-6 py-3">
            <div className="space-y-4">
              {/* Varianten-Kennzahlen: so, wie der Gast bestellt */}
              <div>
                <div className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wide">
                  Varianten <span className="text-gray-400 normal-case font-normal">— so, wie der Gast bestellt · Größe {groesse === "klein" ? "Klein" : "Normal"}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      {th("Variante", false, "v")}{th("Material", true, "m")}{th("Verpackung", true, "p")}{th("WE OUT €", true, "w")}
                      {th("VK brutto", true, "vk")}{th("WE % IN", true, "wi")}{th("DB IN €", true, "di")}{th("WE % OUT", true, "wo")}{th("DB OUT €", true, "do")}
                    </tr>
                  </thead>
                  <tbody>
                    {varianten.map(x => {
                      const ai = ampelFarbe(x.c.we_in, gruppe), ao = ampelFarbe(x.c.we_out, gruppe);
                      const eigenerVk = x.key !== "salat" && !!p.vk_varianten?.[x.key];
                      return (
                        <tr key={x.key} className="border-t border-gray-100">
                          <td className="px-2 py-1 font-medium text-gray-700">
                            {x.def.label} <span className="text-gray-400 font-normal font-mono text-[10px]">{x.vp.id}</span>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.material)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</td>
                          <td className="px-2 py-1 text-right tabular-nums font-medium">{fmtEUR(x.c.wareneinsatz)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {editierbar
                              ? <EditNum value={+(x.vp.vk_out_brutto || 0).toFixed(2)} step="0.05" suffix="€" width="w-16" onChange={v => updateVk(x.key, v)} />
                              : fmtEUR(x.vp.vk_out_brutto)}
                            {eigenerVk && <span className="ml-1 text-[10px] text-emerald-700" title="eigener VK dieser Variante">✎</span>}
                          </td>
                          <td className={`px-2 py-1 text-right tabular-nums font-semibold ${ai.text}`}>
                            <span className="inline-flex items-center gap-1"><AmpelDot quote={x.c.we_in} gruppe={gruppe} />{fmtPct(x.c.we_in)}</span>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.db_in)}</td>
                          <td className={`px-2 py-1 text-right tabular-nums font-semibold ${ao.text}`}>
                            <span className="inline-flex items-center gap-1"><AmpelDot quote={x.c.we_out} gruppe={gruppe} />{fmtPct(x.c.we_out)}</span>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.db_out)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Zutaten mit einer Mengen- und Kostenspalte je Variante */}
              <div>
                <div className="text-xs text-gray-600 mb-2 font-medium uppercase tracking-wide">
                  Zutaten <span className="text-gray-400 normal-case font-normal">— Menge je Variante · Kartoffel/Reis grau = abgeleitet (Rezeptmenge bzw. Salatmix-Regel), eingetragen = Ausnahme dieser Bowl</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      {th("Zutat", false, "z")}
                      {varianten.map(x => th(`Menge ${x.def.kurz}`, true, `m_${x.key}`))}
                      {th("Preis", true, "p")}
                      {varianten.map(x => th(`Kosten ${x.def.kurz}`, true, `k_${x.key}`))}
                      {th("Lieferant", false, "l")}
                    </tr>
                  </thead>
                  <tbody>
                    {p.zutaten.map((z, i) => {
                      const e = EINHEIT[zutatEinheit(z)];
                      const salat = istSalatZutat(z, basis);
                      const ohneGewicht = istStueck(z) && !(+z.gramm_je_stueck > 0);
                      return (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-2 py-1 text-gray-700">
                            {z.name}
                            {salat && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1" title="Salatmix-Regel: in Kartoffel- und Reisbowl weniger — zentral in der Basis-Rezeptur">Regel</span>}
                            {ohneGewicht && <span className="ml-1.5 text-[10px] text-amber-700" title="g/Stück fehlt — ohne Gramm-Äquivalent fehlt die Zutat im Bestellvorschlag.">⚠ g/Stk fehlt</span>}
                          </td>
                          {varianten.map(x => {
                            const menge = zutatMengeVariante(z, x.key, p, basis);
                            const ausnahme = z.menge_je_variante?.[x.key] != null;
                            const abgeleitet = x.key !== "salat" && !ausnahme;
                            return (
                              <td key={x.key} className={`px-2 py-1 text-right tabular-nums ${abgeleitet ? "text-gray-400" : ""}`}>
                                {editierbar ? (
                                  <span className="inline-flex items-center gap-0.5">
                                    <EditNum value={menge} step="1" suffix={e.menge} width="w-14" onChange={v => updateZutat(i, "menge", v, x.key)} />
                                    {ausnahme && (
                                      <button onClick={ev => { ev.stopPropagation(); updateZutat(i, "menge", "", x.key); }}
                                        title="Ausnahme löschen — zurück zur Regel" className="text-gray-300 hover:text-emerald-700">
                                        <RotateCcw size={10} />
                                      </button>
                                    )}
                                  </span>
                                ) : <span>{fmtMenge(menge)} {e.menge}</span>}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1 text-right tabular-nums">
                            {editierbar
                              ? <EditNum value={+zutatPreisAnzeige(z).toFixed(2)} step="0.01" suffix={e.preis} width="w-20" onChange={v => updateZutat(i, "preis", v)} />
                              : <span>{fmtNum2(zutatPreisAnzeige(z))} {e.preis}</span>}
                          </td>
                          {varianten.map(x => (
                            <td key={x.key} className="px-2 py-1 text-right tabular-nums">
                              {fmtEUR(zutatKosten(mitMenge(z, zutatMengeVariante(z, x.key, p, basis))))}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-gray-500">{z.lieferant}</td>
                        </tr>
                      );
                    })}
                    {basisZeilen.map((bz, i) => (
                      <tr key={`b${i}`} className="border-t border-gray-100 text-gray-500 bg-emerald-50/30">
                        <td className="px-2 py-1">
                          {bz.name}
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1">Basis</span>
                        </td>
                        {varianten.map(x => (
                          <td key={x.key} className="px-2 py-1 text-right tabular-nums">{x.key === bz._variante ? `${fmtMenge(bz.menge_g)} g` : "—"}</td>
                        ))}
                        <td className="px-2 py-1 text-right tabular-nums">{fmtNum2(bz.preis_pro_g * 1000)} €/kg</td>
                        {varianten.map(x => (
                          <td key={x.key} className="px-2 py-1 text-right tabular-nums">{x.key === bz._variante ? fmtEUR(bz.cost) : "—"}</td>
                        ))}
                        <td className="px-2 py-1">{bz.lieferant}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-300 font-medium">
                      <td className="px-2 py-1">Material</td>
                      {varianten.map(x => <td key={x.key} />)}
                      <td />
                      {varianten.map(x => <td key={x.key} className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.material)}</td>)}
                      <td />
                    </tr>
                    <tr className="text-gray-600">
                      <td className="px-2 py-1">+ Verpackung</td>
                      {varianten.map(x => <td key={x.key} />)}
                      <td className="px-2 py-1 text-right">
                        {editierbar
                          ? <EditNum value={+(p.verpackung_eur || 0).toFixed(2)} step="0.01" suffix="€" width="w-16" onChange={v => onUpdate({ verpackung_eur: Math.max(0, +v || 0) })} />
                          : <span className="tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</span>}
                      </td>
                      {varianten.map(x => <td key={x.key} className="px-2 py-1 text-right tabular-nums">{fmtEUR(p.verpackung_eur || 0)}</td>)}
                      <td />
                    </tr>
                    <tr className="font-semibold text-gray-800">
                      <td className="px-2 py-1">= Wareneinsatz außer Haus</td>
                      {varianten.map(x => <td key={x.key} />)}
                      <td />
                      {varianten.map(x => <td key={x.key} className="px-2 py-1 text-right tabular-nums">{fmtEUR(x.c.wareneinsatz)}</td>)}
                      <td />
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 mt-1">
                  Basis-Zeilen kommen aus der zentralen Basis-Rezeptur (oben im Tab) und gelten für alle Bowls mit wählbarer Basis.
                  Salatmix folgt der Regel dort; eine eingetragene Kartoffel-/Reis-Menge ist eine Ausnahme nur für diese Bowl.
                  Beim Speichern entstehen daraus die Kassenartikel <span className="font-mono">{p.id}</span>, <span className="font-mono">{p.id}_kartoffel</span>, <span className="font-mono">{p.id}_reis</span>.
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Zentrale Basis-Rezeptur: einmal pflegen, gilt für alle Bowls mit wählbarer Basis.
export function BowlBasisPanel({ basis, onChange, canEdit, anzahlBowls }) {
  const [offen, setOffen] = useState(false);
  const b = bowlBasisOderDefault(basis);
  const editierbar = canEdit && typeof onChange === "function";
  const set = (patch) => editierbar && onChange({ ...b, ...patch, version: 1 });

  const setSalatMenge = (groesse, variante, wert) => {
    const menge = { ...(b.salat?.menge || {}) };
    menge[groesse] = { ...(menge[groesse] || {}), [variante]: Math.max(0, +wert || 0) };
    set({ salat: { ...(b.salat || {}), menge } });
  };
  const setSalatZutaten = (text) =>
    set({ salat: { ...(b.salat || {}), zutaten: text.split(",").map(s => s.trim()).filter(Boolean) } });
  const zeilen = (variante) => b.varianten?.[variante]?.zutaten || [];
  const setZeilen = (variante, zutaten) =>
    set({ varianten: { ...(b.varianten || {}), [variante]: { ...(b.varianten?.[variante] || {}), zutaten } } });
  const setZeile = (variante, idx, patch) =>
    setZeilen(variante, zeilen(variante).map((z, i) => (i === idx ? { ...z, ...patch } : z)));
  const setZeileMenge = (variante, idx, groesse, wert) =>
    setZeile(variante, idx, { menge: { ...(zeilen(variante)[idx]?.menge || {}), [groesse]: Math.max(0, +wert || 0) } });
  const addZeile = (variante) =>
    setZeilen(variante, [...zeilen(variante), { name: "", lieferant: "Transgourmet", preis_pro_g: 0, menge: { normal: 0, klein: 0 } }]);
  const removeZeile = (variante, idx) => setZeilen(variante, zeilen(variante).filter((_, i) => i !== idx));
  const kosten = (variante, groesse) =>
    zeilen(variante).reduce((s, z) => s + (+(z.menge?.[groesse]) || 0) * (+z.preis_pro_g || 0), 0);
  const inputCls = "border border-gray-200 rounded px-1.5 py-1 text-xs bg-white";

  return (
    <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
      <button onClick={() => setOffen(o => !o)} className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-emerald-50/50">
        <span className="flex items-center gap-2">
          {offen ? <ChevronDown size={14} className="text-emerald-700" /> : <ChevronRight size={14} className="text-emerald-700" />}
          <span className="text-sm font-semibold text-gray-800">Basis-Rezeptur: Salat / Kartoffel / Reis</span>
          <span className="text-xs text-gray-400">· gilt für {anzahlBowls} Bowls mit wählbarer Basis</span>
        </span>
        <span className="text-xs text-gray-500 tabular-nums">
          Kartoffelbasis {fmtEUR(kosten("kartoffel", "normal"))} / {fmtEUR(kosten("kartoffel", "klein"))} ·
          Reisbasis {fmtEUR(kosten("reis", "normal"))} / {fmtEUR(kosten("reis", "klein"))} <span className="text-gray-400">(Normal / Klein)</span>
        </span>
      </button>
      {offen && (
        <div className="px-4 pb-4 space-y-4 text-xs">
          <p className="text-gray-500">
            Eine Bowl ist ein Rezept. In der Kasse gibt es sie als Salat-, Kartoffel- und Reisbowl: gleiche Zutaten, nur der Salatmix
            schrumpft in Kartoffel- und Reisbowl, und die Basis kommt dazu. Was hier steht, gilt für alle Bowls mit wählbarer Basis —
            einmal pflegen statt in jeder Bowl. Änderungen wirken sofort auf alle Varianten; zum Sichern oben „Speichern“.
          </p>

          <div className="border border-gray-100 rounded-lg p-3">
            <div className="font-medium text-gray-700 mb-2">Salatmix in Kartoffel- und Reisbowl</div>
            <div className="flex flex-wrap gap-4 items-end">
              <label className="flex flex-col text-gray-600">
                Zutat(en), kommagetrennt
                {editierbar
                  ? <input value={(b.salat?.zutaten || []).join(", ")} onChange={e => setSalatZutaten(e.target.value)} className={`${inputCls} mt-1 w-48`} />
                  : <span className="mt-1 text-gray-800">{(b.salat?.zutaten || []).join(", ")}</span>}
              </label>
              {["kartoffel", "reis"].map(v => ["normal", "klein"].map(g => (
                <label key={v + g} className="flex flex-col text-gray-600">
                  {BOWL_VARIANTE[v].label} · {g === "klein" ? "Klein" : "Normal"}
                  <span className="mt-1">
                    {editierbar
                      ? <EditNum value={+(b.salat?.menge?.[g]?.[v] ?? 0)} step="5" suffix="g" width="w-14" onChange={val => setSalatMenge(g, v, val)} />
                      : <span className="text-gray-800 tabular-nums">{fmtMenge(b.salat?.menge?.[g]?.[v] ?? 0)} g</span>}
                  </span>
                </label>
              )))}
            </div>
            <p className="text-gray-400 mt-2">Die Salatbowl behält die Salatmix-Menge des Rezepts (Normal 100 g). Die Klein-Werte sind eine Vorgabe — bitte bestätigen.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {["kartoffel", "reis"].map(v => (
              <div key={v} className="border border-gray-100 rounded-lg p-3">
                <div className="font-medium text-gray-700 mb-2">{BOWL_VARIANTE[v].label}: Basis kommt dazu</div>
                <table className="w-full">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left px-1 py-1 font-medium">Zutat</th>
                      <th className="text-right px-1 py-1 font-medium">Normal</th>
                      <th className="text-right px-1 py-1 font-medium">Klein</th>
                      <th className="text-right px-1 py-1 font-medium">Preis</th>
                      <th className="text-right px-1 py-1 font-medium">Kosten N / K</th>
                      {editierbar && <th className="w-6" />}
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen(v).map((z, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-1 py-1">
                          {editierbar
                            ? <input value={z.name || ""} onChange={e => setZeile(v, i, { name: e.target.value })} className={`${inputCls} w-full`} placeholder="Zutat wie in der Preisliste" />
                            : <span className="text-gray-800">{z.name}</span>}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums">
                          {editierbar
                            ? <EditNum value={+(z.menge?.normal || 0)} step="5" suffix="g" width="w-14" onChange={val => setZeileMenge(v, i, "normal", val)} />
                            : `${fmtMenge(z.menge?.normal)} g`}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums">
                          {editierbar
                            ? <EditNum value={+(z.menge?.klein || 0)} step="5" suffix="g" width="w-14" onChange={val => setZeileMenge(v, i, "klein", val)} />
                            : `${fmtMenge(z.menge?.klein)} g`}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums">
                          {editierbar
                            ? <EditNum value={+((z.preis_pro_g || 0) * 1000).toFixed(2)} step="0.01" suffix="€/kg" width="w-16" onChange={val => setZeile(v, i, { preis_pro_g: Math.max(0, +val || 0) / 1000 })} />
                            : `${fmtNum2((z.preis_pro_g || 0) * 1000)} €/kg`}
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums text-gray-600">
                          {fmtEUR((+(z.menge?.normal) || 0) * (+z.preis_pro_g || 0))} / {fmtEUR((+(z.menge?.klein) || 0) * (+z.preis_pro_g || 0))}
                        </td>
                        {editierbar && (
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => removeZeile(v, i)} className="text-gray-300 hover:text-red-600" title="Zeile entfernen"><Trash2 size={12} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="border-t border-gray-300 font-medium">
                      <td className="px-1 py-1">Basis gesamt</td>
                      <td colSpan={3} />
                      <td className="px-1 py-1 text-right tabular-nums">{fmtEUR(kosten(v, "normal"))} / {fmtEUR(kosten(v, "klein"))}</td>
                      {editierbar && <td />}
                    </tr>
                  </tbody>
                </table>
                {editierbar && (
                  <button onClick={() => addZeile(v)} className="mt-2 flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium">
                    <Plus size={12} /> Zutat
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-gray-400">
            Vorgabe der Mengen: Rezeptur-Entscheidung 03./05.09.2026 (Kartoffeln gegart 230 g, Basissauce 40 g, Röstzwiebeln 5 g, Reis 150 g;
            Klein zwei Drittel). Preise: CALKU-Rezepte Quark Kartoffel Bowl / Korean Glaze Bowl bzw. TG-Preisliste — „Preise aus Liste ziehen“ im
            Tab Einkaufspreise füllt fehlende Preise auch hier.
          </p>
        </div>
      )}
    </div>
  );
}

// Was die Daten noch nicht sauber abbilden - mit Knopf zum Umstellen.
export function DatenpflegeHinweis({ befunde, canEdit, onEiUmstellen, onStueckUmstellen, onDuplikateEntfernen }) {
  const { eier, stueck = [], duplikate } = befunde || { eier: [], stueck: [], duplikate: [] };
  if (!eier.length && !stueck.length && !duplikate.length) return null;
  const namen = (arr, f) => { const n = [...new Set(arr.map(f))]; return n.slice(0, 4).join(", ") + (n.length > 4 ? " …" : ""); };
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-3">
      <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="text-amber-700" /> Datenpflege</div>
      {eier.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs leading-relaxed max-w-3xl">
            <strong>Ei steht noch in Gramm</strong> in {eier.length} Rezeptzeile{eier.length === 1 ? "" : "n"} ({namen(eier, x => x.produkt.name)}).
            Ein Ei ist ein Stück mit Stückpreis. Die Umstellung setzt die Einheit auf Stück, den Stückpreis aus der Preisliste
            (Eier: 8,45 € je 30 = 0,28 €/Stk) und 50 g je Ei als Gramm-Äquivalent für Bestellvorschlag und Bons.
          </span>
          {canEdit && (
            <button onClick={onEiUmstellen} className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-2 text-xs font-medium">
              Ei auf Stück umstellen
            </button>
          )}
        </div>
      )}
      {stueck.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs leading-relaxed max-w-3xl">
            <strong>Stückware steht noch in Gramm</strong> in {stueck.length} Rezeptzeile{stueck.length === 1 ? "" : "n"} ({namen(stueck, x => `${x.zutat.name} · ${x.produkt.name}`)}).
            Die Umstellung rechnet sie je Stück mit dem Stückpreis aus dem Artikel (Oreo: Packungspreis ÷ 14 Kekse).
            Cookie Monster: 400 ml 1 Keks, 500 und 600 ml je 2 Kekse.
          </span>
          {canEdit && (
            <button onClick={onStueckUmstellen} className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-2 text-xs font-medium">
              Auf Stück umstellen
            </button>
          )}
        </div>
      )}
      {duplikate.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs leading-relaxed max-w-3xl">
            <strong>{duplikate.length} Varianten-Duplikate</strong> aus dem Import vom 03.09.2026 ({namen(duplikate, p => p.name)}):
            Kartoffel- und Reisvarianten entstehen jetzt aus dem Grundrezept, die eigenen Produkte dafür sind doppelt und würden im
            Bestellvorschlag mit derselben id kollidieren.
          </span>
          {canEdit && (
            <button onClick={() => onDuplikateEntfernen(duplikate.map(p => p.id))} className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-2 text-xs font-medium">
              Duplikate entfernen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ProduktTabelle({ produkte, gruppe, onUpdate, onEdit, onDelete, gruppiert, bowlBasis, bowlModus, canEdit = true, produkteById }) {
  const [expanded, setExpanded] = useState(null);
  const [expandedSorte, setExpandedSorte] = useState(null);

  const sorten = useMemo(() => {
    if (!gruppiert) return null;
    return gruppiereProdukte(produkte, gruppe);
  }, [produkte, gruppe, gruppiert]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-gray-600">
              <th className="text-left  px-3 py-2 font-medium">{gruppiert ? "Sorte / Größe" : bowlModus ? "Bowl (Salat · Kartoffel · Reis)" : "Produkt"}</th>
              <th className="text-right px-3 py-2 font-medium">Wareneinsatz OUT €</th>
              <th className="text-right px-3 py-2 font-medium">VK IN brutto</th>
              <th className="text-right px-3 py-2 font-medium">netto</th>
              <th className="text-right px-3 py-2 font-medium">WE % IN</th>
              <th className="text-right px-3 py-2 font-medium">DB IN €</th>
              <th className="text-right px-3 py-2 font-medium">WE % OUT</th>
              <th className="text-right px-3 py-2 font-medium">DB OUT €</th>
            </tr>
          </thead>
          <tbody>
            {produkte.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">Keine Produkte in dieser Warengruppe.</td></tr>
            )}

            {gruppiert && sorten?.map(sorte => (
              <SortenGruppeZeile
                key={sorte.base}
                sorte={sorte}
                gruppe={gruppe}
                expanded={expandedSorte === sorte.base}
                onToggle={() => setExpandedSorte(expandedSorte === sorte.base ? null : sorte.base)}
                expandedProdukt={expanded}
                onToggleProdukt={(id) => setExpanded(expanded === id ? null : id)}
                onUpdate={onUpdate}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}

            {!gruppiert && produkte.map(p => {
              if (bowlModus && basisWaehlbar(p, bowlBasis)) {
                return (
                  <BowlZeile
                    key={p.id}
                    p={p}
                    gruppe={gruppe}
                    basis={bowlBasis}
                    expanded={expanded === p.id}
                    onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                    onUpdate={(updates) => onUpdate(p.id, updates)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    canEdit={canEdit}
                  />
                );
              }
              // Kassen-Sicht: abgeleitete Variante (basis_produkt_id) - nur
              // zeigen, bearbeiten ueber das Grundrezept.
              const virtuell = !!p.basis_produkt_id;
              const calc = berechne(p);
              return (
                <ProduktZeile
                  key={p.id}
                  p={p}
                  calc={calc}
                  gruppe={gruppe}
                  expanded={expanded === p.id}
                  onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                  onUpdate={virtuell ? null : (updates) => onUpdate(p.id, updates)}
                  readOnly={virtuell}
                  hinweis={virtuell ? "Variante" : null}
                  onEdit={virtuell ? (vp) => onEdit && onEdit((produkteById && produkteById[vp.basis_produkt_id]) || vp) : onEdit}
                  onDelete={onDelete}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WarengruppenTab({ produkte, gruppe, onUpdate, onEdit, onDelete, onNeu,
                           bowlBasis, onBowlBasis, canEdit = true, befunde, onEiUmstellen, onStueckUmstellen, onDuplikateEntfernen }) {
  const [subFilter, setSubFilter] = useState("Alle");
  const subgroups = SUBGROUPS_BY_GRUPPE[gruppe] || null;
  const istBowls = gruppe === "Bowls";

  // Bowls: die Kassen-Sicht (je Variante ein Produkt) fuer Unterfilter und
  // Kennzahlen; unter "Alle" steht jede Bowl einmal mit ihren Varianten.
  const aufgeloest = useMemo(() => (istBowls ? aufgeloesteProdukte(produkte, bowlBasis) : produkte),
                             [produkte, bowlBasis, istBowls]);
  const produkteById = useMemo(() => Object.fromEntries(produkte.map(p => [p.id, p])), [produkte]);
  const untergruppe = (p) => (istBowls ? bowlUntergruppe(p, bowlBasis) : untergruppeVon(p));

  const gefiltert = useMemo(() => {
    if (!subgroups || subFilter === "Alle") return produkte;
    return aufgeloest.filter(p => untergruppe(p) === subFilter);
  }, [produkte, aufgeloest, subgroups, subFilter, bowlBasis]);

  const statsBasis = (!subgroups || subFilter === "Alle") ? aufgeloest : gefiltert;
  const stats = useMemo(() => {
    const calced = statsBasis.map(p => ({ p, c: berechne(p) }));
    const n = calced.length;
    if (n === 0) return { n: 0, weOut: 0, dbOut: 0, ueberSchwelle: 0 };
    // Steuerungsgroesse ist das Ausser-Haus-Geschaeft (7 % MwSt.). Die
    // Im-Haus-Werte (19 %) bleiben in der Produkttabelle daneben stehen.
    const weOut = calced.reduce((s, x) => s + x.c.we_out, 0) / n;
    const dbOut = calced.reduce((s, x) => s + x.c.db_out, 0) / n;
    const schwelle = SCHWELLWERTE[gruppe].rot;
    const ueberSchwelle = calced.filter(x => x.c.we_out > schwelle).length;
    return { n, weOut, dbOut, ueberSchwelle };
  }, [statsBasis, gruppe]);

  const stufeWeOut = stats.weOut > SCHWELLWERTE[gruppe].rot ? "rot" : "gruen";
  const anzahlBasisBowls = istBowls ? produkte.filter(p => basisWaehlbar(p, bowlBasis)).length : 0;

  return (
    <div className="space-y-4">
      {subgroups && (
        <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {["Alle", ...subgroups].map(s => {
            const anzahl = s === "Alle" ? produkte.length : aufgeloest.filter(p => untergruppe(p) === s).length;
            return (
              <button key={s} onClick={() => setSubFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  subFilter === s ? "bg-green-700 text-white shadow-sm" : "text-gray-600 hover:bg-white"
                }`}>{s} <span className={subFilter === s ? "text-green-200" : "text-gray-400"}>· {anzahl}</span></button>
            );
          })}
        </div>
      )}

      <ArtikelartHinweis produkte={produkte} />

      {/* Bowls: alle Befunde; andere Gruppen: Stueckware ihrer eigenen Rezepturen (Oreo im Smoothie) */}
      {(istBowls || befunde?.stueck?.some(x => x.produkt.gruppe === gruppe)) && (
        <DatenpflegeHinweis canEdit={canEdit}
          befunde={istBowls ? befunde : { eier: [], duplikate: [], stueck: befunde.stueck.filter(x => x.produkt.gruppe === gruppe) }}
          onEiUmstellen={onEiUmstellen} onStueckUmstellen={onStueckUmstellen} onDuplikateEntfernen={onDuplikateEntfernen} />
      )}
      {istBowls && (
        <BowlBasisPanel basis={bowlBasis} onChange={onBowlBasis} canEdit={canEdit} anzahlBowls={anzahlBasisBowls} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard title={istBowls ? "Kassenartikel" : "Produkte"} value={fmtNum(stats.n)}
                 sub={istBowls ? `${produkte.length} Bowls · je Variante gezählt` : gruppe} stufe="info" />
        <KPICard title="Ø Wareneinsatz OUT" value={fmtPct(stats.weOut)}
                 sub={`Schwellwert: ${SCHWELLWERTE[gruppe].rot} % · 7 % MwSt.`} stufe={stufeWeOut} />
        <KPICard title="Ø Deckungsbeitrag OUT" value={fmtEUR(stats.dbOut)} sub="pro Produkt, netto (7 % MwSt.)" stufe="info" />
        <KPICard title="Über Schwellwert" value={`${stats.ueberSchwelle} / ${stats.n}`}
                 sub={`> ${SCHWELLWERTE[gruppe].rot} % WE (außer Haus)`}
                 stufe={stats.ueberSchwelle > 0 ? "rot" : "gruen"} />
      </div>

      <ProduktTabelle produkte={gefiltert} gruppe={gruppe} onUpdate={onUpdate} onEdit={onEdit} onDelete={onDelete}
        gruppiert={GRUPPIERBARE.has(gruppe)}
        bowlBasis={bowlBasis} bowlModus={istBowls && subFilter === "Alle"} canEdit={canEdit} produkteById={produkteById} />

      <div className="flex justify-end">
        <button onClick={() => onNeu && onNeu(gruppe)}
          className="flex items-center gap-1.5 text-sm bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800">
          <Plus size={14} /> Neues Rezept in „{gruppe}"
        </button>
      </div>
    </div>
  );
}

// ============================================================
//  KAMPAGNEN-TAB (mit Datumssteuerung)
// ============================================================
export function KampagnenTab({ produkte, setProdukte, onEdit, onDelete, onNeu, alleProdukte = [], onImport }) {
  const heute = new Date();
  const OHNE = "(Ohne Oberbegriff)";
  const obFor = (p) => p.kampagne || p.alte_kategorie || OHNE;

  // Produkte nach Oberbegriff (Kampagne) bündeln
  const kampagnen = useMemo(() => {
    const map = new Map();
    for (const p of produkte) {
      const ob = obFor(p);
      if (!map.has(ob)) map.set(ob, []);
      map.get(ob).push(p);
    }
    return Array.from(map.entries()).map(([name, items]) => {
      const start = items.find(i => i.kampagne_start)?.kampagne_start || "";
      const ende  = items.find(i => i.kampagne_ende)?.kampagne_ende || "";
      const s = start ? new Date(start) : null;
      const e = ende ? new Date(ende) : null;
      const aktiv = (!s || s <= heute) && (!e || e >= heute);
      const calcs = items.map(berechne);
      const avgWe = calcs.length ? calcs.reduce((x, c) => x + c.we_out, 0) / calcs.length : 0;
      const sumDb = calcs.reduce((x, c) => x + c.db_out, 0);
      return { name, items, start, ende, aktiv, avgWe, sumDb };
    }).sort((a, b) => (Number(b.aktiv) - Number(a.aktiv)) || a.name.localeCompare(b.name, "de"));
  }, [produkte]);

  // Datum auf alle Artikel der Kampagne anwenden
  const setKampagneDatum = (kampagneName, feld, wert) => {
    setProdukte(prev => prev.map(p => obFor(p) === kampagneName ? { ...p, [feld]: wert || null } : p));
  };

  // Kampagne umbenennen (Oberbegriff auf allen Artikeln ändern)
  const [editName, setEditName] = useState(null); // { old, value }
  const commitRename = () => {
    if (!editName) return;
    const neu = editName.value.trim();
    const alt = editName.old;
    if (neu && neu !== alt) {
      setProdukte(prev => prev.map(p => obFor(p) === alt ? { ...p, kampagne: neu } : p));
    }
    setEditName(null);
  };

  const neueKampagne = () => {
    const name = (prompt("Name der neuen Kampagne (Oberbegriff):", "Sommerkampagne") || "").trim();
    if (!name) return;
    onNeu && onNeu("Kampagnen", name);
  };

  // Import bestehender Rezepte in eine Kampagne
  const [importOpen, setImportOpen] = useState(false);
  const [importSuche, setImportSuche] = useState("");
  const [importSel, setImportSel] = useState(null);
  const [importKampagne, setImportKampagne] = useState("");
  const importTreffer = alleProdukte
    .filter(p => (p.name || "").toLowerCase().includes(importSuche.trim().toLowerCase()))
    .slice(0, 200);

  return (
    <div className="space-y-5">
      <ArtikelartHinweis produkte={produkte} />

      {kampagnen.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Noch keine Kampagnen angelegt. Starte unten mit „Neue Kampagne anlegen".
        </div>
      )}

      {kampagnen.map(k => {
        const ampel = ampelFarbe(k.avgWe, "Kampagnen");
        return (
          <div key={k.name} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Kampagnen-Kopf */}
            <div className={`px-4 py-3 border-b border-gray-100 ${k.aktiv ? "bg-emerald-50" : "bg-gray-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar size={16} className={k.aktiv ? "text-emerald-600" : "text-gray-400"} />
                  {editName?.old === k.name ? (
                    <span className="flex items-center gap-1">
                      <input autoFocus value={editName.value}
                        onChange={e => setEditName({ ...editName, value: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditName(null); }}
                        className="border border-emerald-300 rounded px-2 py-0.5 text-sm font-semibold bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                      <button onClick={commitRename} title="Übernehmen" className="text-emerald-700 hover:text-emerald-900 p-0.5"><Check size={14} /></button>
                      <button onClick={() => setEditName(null)} title="Abbrechen" className="text-gray-400 hover:text-gray-600 p-0.5"><X size={14} /></button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-gray-800">{k.name}</span>
                      {k.name !== OHNE && (
                        <button onClick={() => setEditName({ old: k.name, value: k.name })} title="Kampagne umbenennen"
                          className="text-gray-300 hover:text-emerald-700 p-0.5"><Pencil size={12} /></button>
                      )}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${k.aktiv ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
                    {k.aktiv ? "aktiv" : "inaktiv"}
                  </span>
                  <span className="text-xs text-gray-500">· {k.items.length} {k.items.length === 1 ? "Artikel" : "Artikel"}</span>
                </div>
                {k.name !== OHNE && (
                  <div className="flex items-end gap-2">
                    <label className="text-xs text-gray-600 flex flex-col">Start
                      <input type="date" value={k.start || ""} onChange={e => setKampagneDatum(k.name, "kampagne_start", e.target.value)}
                        className="mt-0.5 border border-gray-200 rounded px-2 py-1 text-xs bg-white" />
                    </label>
                    <label className="text-xs text-gray-600 flex flex-col">Ende
                      <input type="date" value={k.ende || ""} onChange={e => setKampagneDatum(k.name, "kampagne_ende", e.target.value)}
                        className="mt-0.5 border border-gray-200 rounded px-2 py-1 text-xs bg-white" />
                    </label>
                  </div>
                )}
              </div>
              {/* Rollup */}
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs">
                <span className={`font-medium ${ampel.text}`}>Ø Wareneinsatz {fmtPct(k.avgWe)}</span>
                <span className="text-gray-600">Σ Deckungsbeitrag (außer Haus) {fmtEUR(k.sumDb)}</span>
                {k.start && <span className="text-gray-500">{fmtDate(k.start)} – {k.ende ? fmtDate(k.ende) : "offen"}</span>}
              </div>
            </div>

            {/* Artikel der Kampagne */}
            <div className="divide-y divide-gray-100">
              {k.items.map(p => {
                const c = berechne(p);
                const a = ampelFarbe(c.we_out, "Kampagnen");
                return (
                  <div key={p.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3 hover:bg-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.dot}`} />
                    <span className="flex-1 min-w-[150px] text-sm font-medium text-gray-800 inline-flex items-center gap-2">
                      {p.name || "(ohne Name)"}
                      <ArtikelartBadge p={p} onUpdate={(u) => setProdukte(prev => prev.map(x => (x.id === p.id ? { ...x, ...u } : x)))} />
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      WE {fmtEUR(c.wareneinsatz)} · VK {fmtEUR(p.vk_out_brutto)} · WE-Quote {fmtPct(c.we_out)} · DB {fmtEUR(c.db_out)}
                    </span>
                    <button onClick={() => onEdit && onEdit(p)} title="Bearbeiten"
                      className="text-gray-300 hover:text-emerald-700 p-0.5"><Pencil size={13} /></button>
                    <button onClick={() => frage({ text: `„${p.name}“ löschen?`, ja: "Löschen", gefahr: true }).then(ok => ok && onDelete && onDelete(p.id))} title="Löschen"
                      className="text-gray-300 hover:text-red-600 p-0.5"><Trash2 size={13} /></button>
                  </div>
                );
              })}
            </div>

            {/* Artikel hinzufügen */}
            <div className="px-4 py-2 bg-gray-50/60">
              <button onClick={() => onNeu && onNeu("Kampagnen", k.name === OHNE ? null : k.name, k.start || null, k.ende || null)}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-1">
                <Plus size={13} /> Artikel zur Kampagne hinzufügen
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => { setImportOpen(true); setImportSel(null); setImportSuche(""); setImportKampagne(""); }}
          className="flex items-center gap-1.5 text-sm bg-white border border-green-700 text-green-800 px-3 py-2 rounded-lg hover:bg-green-50">
          <Plus size={14} /> Rezept übernehmen
        </button>
        <button onClick={neueKampagne}
          className="flex items-center gap-1.5 text-sm bg-green-700 text-white px-3 py-2 rounded-lg hover:bg-green-800">
          <Plus size={14} /> Neue Kampagne anlegen
        </button>
      </div>

      {importOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Rezept in Kampagne übernehmen</h3>
              <button onClick={() => setImportOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3 overflow-auto">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input value={importSuche} onChange={e => setImportSuche(e.target.value)} placeholder="Rezept suchen …"
                  className="w-full border border-gray-200 rounded px-3 py-2 pl-8 text-sm" />
              </div>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 max-h-60 overflow-auto">
                {importTreffer.length === 0 && (
                  <div className="px-3 py-6 text-center text-gray-400 text-sm">Kein Rezept gefunden.</div>
                )}
                {importTreffer.map(p => (
                  <button key={p.id} onClick={() => setImportSel(p.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${importSel === p.id ? "bg-emerald-50" : ""}`}>
                    <span className="font-medium text-gray-800">{p.name || "(ohne Name)"}</span>
                    <span className="text-xs text-gray-400">{p.gruppe}{p.untergruppe ? ` · ${p.untergruppe}` : ""}</span>
                  </button>
                ))}
              </div>
              <label className="block text-xs font-medium text-gray-600">
                Ziel-Kampagne (Oberbegriff)
                <input list="kampagnen-namen" value={importKampagne} onChange={e => setImportKampagne(e.target.value)}
                  placeholder="z. B. Sommerkampagne" className="mt-1 w-full border border-gray-200 rounded px-3 py-2 text-sm" />
                <datalist id="kampagnen-namen">
                  {kampagnen.filter(k => k.name !== OHNE).map(k => <option key={k.name} value={k.name} />)}
                </datalist>
              </label>
              <p className="text-[11px] text-gray-400">Es wird eine <strong>Kopie</strong> angelegt — das Original bleibt unverändert. Preise/VK werden mitkopiert.</p>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setImportOpen(false)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
              <button disabled={!importSel || !importKampagne.trim()}
                onClick={() => { onImport?.(importSel, importKampagne); setImportOpen(false); }}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed">
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

