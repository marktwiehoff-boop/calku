# -*- coding: utf-8 -*-
"""Bowl-Basis (Kartoffel / Reis) als Rezeptvarianten fuer CALKU.

Die Bowls in CALKU (bowl_klein_* / bowl_normal_*) enthalten keine Basis. In
der Kasse (SIDES) sind "Julius Caesar Bowl" (Salat), "Julius Caesar
Kartoffel (normal)" und "Julius Caesar Reis (normal)" drei Artikel, die in
BigQuery alle auf dasselbe CALKU-Rezept zeigen - Kartoffeln und Reis fehlen
damit in jedem Bestellvorschlag (siehe wilde_ziege_report.md, "Bewusst
weggelassen"). Entscheidung 03.09.2026 (Mark): die Basis wird in CALKU als
eigene Rezeptvarianten nachgepflegt.

Dieser Generator liest den lokalen Schnappschuss des CALKU-Dokuments und
erzeugt je Bowl zwei neue Produkte:

    <id>_kartoffel  "<Bowl> Kartoffel <Groesse>"  Untergruppe Kartoffelbowls
                    Original + Kartoffeln gegart, Kartoffel Basissauce,
                    Roestzwiebeln (Klein = 2/3, auf 5 g gerundet)
    <id>_reis       "<Bowl> Reis <Groesse>"       Untergruppe Reisbowls
                    Original + Quinoa Reismix

Das Original bleibt unveraendert (die App zeigt es ueber ihre
Default-Untergruppe ohnehin als Salatbowl). Preise der Basiszutaten kommen
aus vorhandenen CALKU-Rezepten, sonst aus der Einkaufspreisliste.

Ausgabe:  import_bowl_basis.json  (Format wie import_wilde_ziege.json)
          bowl_basis_report.md    (Pruefliste fuer Susanne)

Ausfuehren:
    py -3 bowl_basis_generator.py [stand.json]
    py -3 bowl_basis_generator.py --check            nur Selbsttest, schreibt nichts
    py -3 bowl_basis_generator.py --originale-aktualisieren
        setzt zusaetzlich bei den Originalen untergruppe = Salatbowls (ueber
        entfernen + Neuanlage). Nur mit einem FRISCHEN Export sinnvoll, sonst
        ueberschreibt der Import Live-Aenderungen seit dem Schnappschuss.
"""
import argparse
import copy
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

HIER = Path(__file__).resolve().parent
STAND_DEFAULT = HIER / "src" / "data" / "stand_2026-08-02b.json"
REZEPTDATENBANK = HIER / "src" / "data" / "rezeptdatenbank.json"
ZIEL_JSON = HIER / "import_bowl_basis.json"
ZIEL_REPORT = HIER / "bowl_basis_report.md"

ERZEUGT = "2026-09-03"
GRUPPE = "Bowls"
ID_PRAEFIXE = ("bowl_klein_", "bowl_normal_")
KLEIN_PRAEFIX = "bowl_klein_"
GROESSEN_SUFFIXE = (" Normal", " Klein")
# True: "Julius Caesar Kartoffel Normal" (Groesse bleibt hinten, wie bei allen
# CALKU-Bowls und wie in der Kasse). False: "Julius Caesar Normal Kartoffel".
ZUSATZ_VOR_GROESSE = True
LIEFERANT = "Transgourmet"
UNTERGRUPPE_SALAT = "Salatbowls"

# Kennzahlen wie in der App (berechne / SCHWELLWERTE in src/App.jsx):
# Wareneinsatz OUT = (Material + Verpackung) / (VK brutto / 1,07)
MWST_SPEISEN = 0.07
SCHWELLE_BOWLS = 26.0

KLEIN_FAKTOR = 2.0 / 3.0
RUNDUNG_G = 5

# Varianten: (id-Suffix, Namenszusatz, Untergruppe, Basiszutaten)
# Basiszutat: (CALKU-Zutatname, Gramm Normal, Gramm Klein oder None = 2/3
# von Normal, auf RUNDUNG_G gerundet). Zutatnamen exakt wie im Schnappschuss
# ("Kartoffeln gegart", "Kartoffel Basissauce", "Roestzwiebeln" aus der
# Quark Kartoffel Bowl, "Quinoa Reismix" aus der Korean Glaze Bowl).
VARIANTEN = [
    ("kartoffel", "Kartoffel", "Kartoffelbowls", [
        ("Kartoffeln gegart",    230, None),
        ("Kartoffel Basissauce",  40, None),
        ("Röstzwiebeln",           5, None),
    ]),
    ("reis", "Reis", "Reisbowls", [
        ("Quinoa Reismix", 150, 100),
    ]),
]

# Fallback, wenn ein Rezept im Schnappschuss keinen Preis (> 0) traegt:
# CALKU-Zutat -> Artikelname in der Einkaufspreisliste (artikel-Sektion des
# Schnappschusses bzw. price_list in rezeptdatenbank.json)
PREISLISTE_ARTIKEL = {
    "Kartoffeln gegart":    "Garkartoffel",
    "Kartoffel Basissauce": "Basissauce Kartoffel vegan",
    "Röstzwiebeln":         "Röstzwiebeln (kg)",
    "Quinoa Reismix":       "Quinoa Reis gekocht",
}


# ----------------------------------------------------------------------
#  Hilfen
# ----------------------------------------------------------------------
def runde_auf(gramm, schritt=RUNDUNG_G):
    return max(schritt, int(round(gramm / schritt)) * schritt)


def klein_menge(gramm_normal, gramm_klein):
    if gramm_klein is not None:
        return float(gramm_klein)
    return float(runde_auf(gramm_normal * KLEIN_FAKTOR))


def variantenname(name, zusatz):
    if ZUSATZ_VOR_GROESSE:
        for suffix in GROESSEN_SUFFIXE:
            if name.endswith(suffix):
                return name[:-len(suffix)] + " " + zusatz + suffix
    return name + " " + zusatz


def tg_nummer(artikel):
    roh = str((artikel or {}).get("article_number") or "").strip()
    if roh.endswith(".0"):
        roh = roh[:-2]
    return roh or "-"


def material(produkt):
    return sum((z.get("cost") or 0.0) for z in produkt["zutaten"])


def we_quote_out(produkt):
    """Wareneinsatz ausser Haus in % vom VK netto, wie die App rechnet."""
    vk_netto = (produkt.get("vk_out_brutto") or 0.0) / (1 + MWST_SPEISEN)
    if vk_netto <= 0:
        return 0.0
    return (material(produkt) + (produkt.get("verpackung_eur") or 0.0)) / vk_netto * 100


def eur(x):
    return f"{x:.2f}".replace(".", ",") + " €"


def pct(x):
    return f"{x:.1f}".replace(".", ",") + " %"


def eur_pro_g(x):
    return f"{x:.6f}".replace(".", ",")


def gramm(x):
    return f"{x:g} g"


# ----------------------------------------------------------------------
#  Preise
# ----------------------------------------------------------------------
def preise_aufloesen(stand, rezeptdatenbank):
    """CALKU-Zutat -> dict(preis, quelle, tg, listenpreis, liste_artikel).

    Reihenfolge: Rezept im Schnappschuss (erster Treffer mit Preis > 0),
    sonst artikel-Sektion des Schnappschusses, sonst price_list der
    rezeptdatenbank.json. Der Listenpreis wird immer mitgefuehrt, damit der
    Report Rezeptpreis und Einkaufspreisliste gegenueberstellen kann.
    """
    rezeptpreise = {}
    nullstellen = {}
    # Bowls zuerst, damit die Quelle moeglichst ein Bowl-Rezept ist
    reihenfolge = sorted(stand["produkte"], key=lambda p: p.get("gruppe") != GRUPPE)
    for p in reihenfolge:
        for z in p["zutaten"]:
            preis = z.get("preis_pro_g") or 0.0
            if preis > 0:
                rezeptpreise.setdefault(z["name"], (preis, p["id"]))
            else:
                nullstellen.setdefault(z["name"], []).append(p["id"])

    artikel_stand = {a.get("ingredient_name"): a for a in stand.get("artikel", [])
                     if a.get("ingredient_name")}
    artikel_db = {a.get("ingredient_name"): a
                  for a in rezeptdatenbank.get("price_list", [])}

    ergebnis = {}
    for zutat, artikelname in PREISLISTE_ARTIKEL.items():
        artikel = artikel_stand.get(artikelname)
        liste_quelle = "Einkaufspreisliste (artikel im Schnappschuss)"
        if artikel is None:
            artikel = artikel_db.get(artikelname)
            liste_quelle = "rezeptdatenbank.json price_list"
        listenpreis = (artikel or {}).get("price_per_gram_ml")

        if zutat in rezeptpreise:
            preis, produkt_id = rezeptpreise[zutat]
            quelle = f"CALKU-Rezept `{produkt_id}`"
        elif listenpreis:
            preis = float(listenpreis)
            quelle = f"{liste_quelle}, Artikel „{artikelname}“"
        else:
            preis = 0.0
            quelle = "kein Preis gefunden"
        ergebnis[zutat] = {
            "preis": preis,
            "quelle": quelle,
            "tg": tg_nummer(artikel),
            "liste_artikel": artikelname,
            "listenpreis": float(listenpreis) if listenpreis else None,
            "nullstellen": nullstellen.get(zutat, []),
        }
    return ergebnis


# ----------------------------------------------------------------------
#  Varianten bauen
# ----------------------------------------------------------------------
def basis_bowls(stand):
    return [p for p in stand["produkte"]
            if p.get("gruppe") == GRUPPE and p["id"].startswith(ID_PRAEFIXE)]


def baue_varianten(stand, preise):
    """Liefert [(original, variante, basiszutaten_namen)]."""
    ergebnis = []
    for original in basis_bowls(stand):
        klein = original["id"].startswith(KLEIN_PRAEFIX)
        for suffix, zusatz, untergruppe, basis in VARIANTEN:
            zutaten = copy.deepcopy(original["zutaten"])
            namen = []
            for zutat_name, g_normal, g_klein in basis:
                menge = klein_menge(g_normal, g_klein) if klein else float(g_normal)
                preis = preise[zutat_name]["preis"]
                zutaten.append({
                    "name": zutat_name,
                    "menge_g": menge,
                    "lieferant": LIEFERANT,
                    "preis_pro_g": preis,
                    "cost": round(menge * preis, 6),
                })
                namen.append(zutat_name)
            variante = {
                "id": f"{original['id']}_{suffix}",
                "name": variantenname(original["name"], zusatz),
                "gruppe": GRUPPE,
                "untergruppe": untergruppe,
                "verpackung_eur": original.get("verpackung_eur", 0),
                "vk_in_brutto": original.get("vk_in_brutto", 0),
                "vk_out_brutto": original.get("vk_out_brutto", 0),
                "kampagne_start": None,
                "kampagne_ende": None,
                "zutaten": zutaten,
            }
            ergebnis.append((original, variante, namen))
    return ergebnis


def originale_mit_salat(stand):
    """Originale ohne Untergruppe als Kopie mit untergruppe = Salatbowls."""
    kopien = []
    for original in basis_bowls(stand):
        if original.get("untergruppe"):
            continue
        kopie = copy.deepcopy(original)
        kopie["untergruppe"] = UNTERGRUPPE_SALAT
        kopien.append(kopie)
    return kopien


# ----------------------------------------------------------------------
#  Selbsttest
# ----------------------------------------------------------------------
def selbsttest(stand, varianten, preise):
    bowls = basis_bowls(stand)
    fehler = []

    def pruefe(bedingung, text):
        if not bedingung:
            fehler.append(text)

    erwartet = 2 * len(bowls)
    pruefe(len(varianten) == erwartet,
           f"{len(varianten)} Varianten, erwartet {erwartet} (2 je Bowl)")
    pruefe(len(bowls) == 14,
           f"{len(bowls)} Basis-Bowls im Schnappschuss, erwartet 14 (7 Bowls x 2 Groessen)")

    ids = [v["id"] for _, v, _ in varianten]
    pruefe(len(ids) == len(set(ids)), "doppelte Varianten-ids")
    vorhandene_ids = {p["id"] for p in stand["produkte"]}
    vorhandene_namen = {(p.get("name") or "").lower() for p in stand["produkte"]}
    for _, v, _ in varianten:
        pruefe(v["id"] not in vorhandene_ids, f"id {v['id']} gibt es schon")
        pruefe(v["name"].lower() not in vorhandene_namen,
               f"Name {v['name']!r} gibt es schon (Import wuerde ueberspringen)")

    for original, v, namen in varianten:
        zutatnamen = [z["name"] for z in v["zutaten"]]
        n_original = len(original["zutaten"])
        pruefe(zutatnamen[:n_original] == [z["name"] for z in original["zutaten"]],
               f"{v['id']}: Originalzutaten veraendert")
        pruefe(v["zutaten"][:n_original] == original["zutaten"],
               f"{v['id']}: Originalzutaten (Mengen/Preise) veraendert")
        if v["id"].endswith("_kartoffel"):
            pruefe(len(namen) == 3 and all(n in zutatnamen for n in namen),
                   f"{v['id']}: nicht alle drei Basiszutaten enthalten")
            pruefe(v["untergruppe"] == "Kartoffelbowls", f"{v['id']}: Untergruppe falsch")
        elif v["id"].endswith("_reis"):
            pruefe(len(namen) == 1 and namen[0] in zutatnamen,
                   f"{v['id']}: Reisbasis fehlt")
            pruefe(v["untergruppe"] == "Reisbowls", f"{v['id']}: Untergruppe falsch")
        else:
            fehler.append(f"{v['id']}: unbekannter Suffix")
        pruefe(material(v) > material(original),
               f"{v['id']}: Kosten nicht hoeher als Original")
        for z in v["zutaten"][n_original:]:
            pruefe((z.get("preis_pro_g") or 0) > 0,
                   f"{v['id']}: Basiszutat {z['name']!r} ohne Preis")
            pruefe(z["menge_g"] > 0 and z["menge_g"] % RUNDUNG_G == 0,
                   f"{v['id']}: Menge {z['menge_g']} von {z['name']!r} nicht auf {RUNDUNG_G} g")
        pruefe(v["vk_out_brutto"] == original.get("vk_out_brutto", 0)
               and v["vk_in_brutto"] == original.get("vk_in_brutto", 0),
               f"{v['id']}: VK weicht vom Original ab")

    for name, info in preise.items():
        pruefe(info["preis"] > 0, f"kein Preis fuer {name!r}")
    return fehler


# ----------------------------------------------------------------------
#  Report
# ----------------------------------------------------------------------
def schreibe_report(stand, stand_pfad, varianten, preise, originale_update):
    bowls = basis_bowls(stand)
    stand_meta = stand.get("meta", {})
    z = []
    z += ["# Bowl-Basis (Kartoffel / Reis) — Rezeptvarianten für CALKU", "",
          f"Erzeugt am {ERZEUGT} mit `bowl_basis_generator.py` aus dem Schnappschuss "
          f"`{stand_pfad.name}` (Stand {stand_meta.get('stand', '?')}). "
          "Importdatei: `import_bowl_basis.json`.", "",
          "## Warum", "",
          "Die Bowls in CALKU enthalten keine Basis. In der Kasse (SIDES) sind",
          "„Julius Caesar Bowl“ (Salat), „Julius Caesar Kartoffel (normal)“ und",
          "„Julius Caesar Reis (normal)“ drei Artikel, die in BigQuery alle auf dasselbe",
          "CALKU-Rezept zeigen — Kartoffeln, Basissauce, Röstzwiebeln und Reis tauchen",
          "dadurch in keinem Bestellvorschlag auf (siehe `wilde_ziege_report.md`,",
          "„Bewusst weggelassen“). Entscheidung 03.09.2026 (Mark): die Basis wird in",
          "CALKU als eigene Rezeptvarianten nachgepflegt, passend zu den drei",
          "Kassenartikeln je Bowl und Größe.", "",
          "## Datenbasis", "",
          f"- Quelle ist der lokale Schnappschuss `{stand_pfad.name}` "
          f"(exportiert {stand_meta.get('generiert_am', '?')}).",
          "  Die Live-Daten liegen in Supabase; darauf hatte der Generator keinen",
          "  Zugriff. Änderungen an den Bowls seit dem Export (Mengen, Preise, VK)",
          "  stecken deshalb **nicht** in den Varianten — bitte beim Prüfen gegen den",
          "  Live-Stand halten.",
          "- Die **Wilde Ziege** (Import vom 07.08.) ist im Schnappschuss noch nicht",
          "  enthalten und hat deshalb noch keine Varianten. Abhilfe: in CALKU",
          "  „JSON-Download“ ziehen und den Generator mit dieser Datei erneut laufen",
          "  lassen (`py -3 bowl_basis_generator.py <export.json>`); er nimmt alle",
          "  Bowls mit id `bowl_klein_*` / `bowl_normal_*` automatisch mit.",
          f"- Gefunden: {len(bowls)} Bowls → {len(varianten)} Varianten "
          f"({len(varianten) // 2} Kartoffel, {len(varianten) // 2} Reis).", ""]

    z += ["## Basis-Rezeptur", "",
          "| Zutat | Normal | Klein | Preis €/g | Preisquelle | TG-Artikel (Preisliste) | Listenpreis €/g |",
          "|---|---|---|---|---|---|---|"]
    for _suffix, _zusatz, untergruppe, basis in VARIANTEN:
        for name, g_normal, g_klein in basis:
            info = preise[name]
            liste = eur_pro_g(info["listenpreis"]) if info["listenpreis"] else "—"
            z.append(f"| {name} ({untergruppe}) | {gramm(g_normal)} | "
                     f"{gramm(klein_menge(g_normal, g_klein))} | {eur_pro_g(info['preis'])} | "
                     f"{info['quelle']} | {info['liste_artikel']} ({info['tg']}) | {liste} |")
    z += ["", "Klein = ⅔ der Normal-Menge, auf 5 g gerundet (Reis fest 100 g). "
          "Lieferant überall Transgourmet.", ""]

    z += ["## Varianten", "",
          "Wareneinsatz (WE) = Zutatenkosten ohne Verpackung; Quote = WE inkl. Verpackung "
          "in % vom VK außer Haus netto (7 % MwSt.), so wie die App rechnet. "
          f"Ampel rot ab {pct(SCHWELLE_BOWLS)} (Schwellwert Bowls). "
          "VK ist vom Original übernommen — **bitte prüfen**, Kartoffel- und "
          "Reis-Bowls kosten in der Kasse ggf. mehr.", "",
          "| Variante | id | Untergruppe | Zutaten | WE alt | WE neu | VK brutto | Quote alt | Quote neu |",
          "|---|---|---|---|---|---|---|---|---|"]
    ueber_schwelle = []
    for original, v, namen in varianten:
        teile = []
        for zt in v["zutaten"]:
            text = f"{zt['name']} {gramm(zt['menge_g'])}"
            teile.append(f"**{text}**" if zt["name"] in namen else text)
        q_alt, q_neu = we_quote_out(original), we_quote_out(v)
        if q_neu > SCHWELLE_BOWLS:
            ueber_schwelle.append((v["name"], q_neu))
        marke = " 🔴" if q_neu > SCHWELLE_BOWLS else ""
        z.append(f"| {v['name']} | `{v['id']}` | {v['untergruppe']} | {', '.join(teile)} | "
                 f"{eur(material(original))} | {eur(material(v))} | {eur(v['vk_out_brutto'])} | "
                 f"{pct(q_alt)} | {pct(q_neu)}{marke} |")
    z.append("")
    if ueber_schwelle:
        z += [f"**{len(ueber_schwelle)} Varianten liegen über {pct(SCHWELLE_BOWLS)}** "
              "(mit dem VK des Originals):", ""]
        for name, q in ueber_schwelle:
            z.append(f"- {name}: {pct(q)}")
        z.append("")

    z += ["## Annahmen — bitte bestätigen", "",
          "1. **Mengen der Basis:** Kartoffeln gegart 230 g, Kartoffel Basissauce 40 g,",
          "   Röstzwiebeln 5 g (normal); Klein jeweils ⅔ auf 5 g gerundet",
          "   (155 / 25 / 5 g). Reis: Quinoa Reismix 150 g normal, 100 g klein.",
          "   Abweichende Vorbilder: die Excel-Kalkulation (Blatt `Bowls_Kartoffel`)",
          "   und die Quark Kartoffel Bowl führen Röstzwiebeln mit 10 bzw. 15 g; die",
          "   Korean Glaze Bowl und das Excel-Blatt `Reis_Bowls` rechnen mit 200 g Reis",
          "   normal / 100 g klein. Die Mengen stehen als Konstanten oben im Generator.",
          "2. **Zutatennamen** exakt wie schon in CALKU: „Kartoffeln gegart“,",
          "   „Kartoffel Basissauce“, „Röstzwiebeln“ (Quark Kartoffel Bowl) und",
          "   „Quinoa Reismix“ (Korean Glaze Bowl). Keine neuen Zutaten.",
          "3. **Preise:**"]
    for name, info in preise.items():
        zusatz = ""
        if info["listenpreis"] and abs(info["listenpreis"] - info["preis"]) > 1e-9:
            zusatz = (f" — die Einkaufspreisliste sagt {eur_pro_g(info['listenpreis'])} €/g "
                      f"({info['liste_artikel']}, TG {info['tg']}); der Rezeptpreis wurde "
                      "übernommen, bitte klären, welcher gilt")
        if info["nullstellen"]:
            zusatz += (f" — steht in {', '.join('`' + n + '`' for n in info['nullstellen'])} "
                       "bisher mit 0 €")
        z.append(f"   - {name}: {eur_pro_g(info['preis'])} €/g aus {info['quelle']}{zusatz}")
    z += ["   Alle Listenpreise tragen das Prüfdatum 21.03.2025. Garkartoffel ist 1:1",
          "   als „Kartoffeln gegart“ gerechnet (kein Garverlust angesetzt).",
          "   „Quinoa Reismix“ / „Quinoa Reis gekocht“ hat in der Preisliste keine",
          "   Transgourmet-Artikelnummer (Platzhalter XXX) — für den Bestellvorschlag",
          "   fehlt damit die Zuordnung zum Rohartikel (Jasminreis 358785 / Quinoa Bunt",
          "   952717).",
          "4. **VK, Verpackung, Kampagne:** vom Original übernommen (Verpackung "
          f"{eur(bowls[0].get('verpackung_eur', 0))}, keine Kampagne).",
          "5. **Namen:** „<Bowl> Kartoffel Normal“ / „<Bowl> Reis Klein“ — der",
          "   Größenzusatz bleibt wie bei allen CALKU-Bowls hinten, so wie in der Kasse",
          "   („Julius Caesar Kartoffel (normal)“).",
          "6. **Originale unverändert.** Der Import kann bestehende Produkte nicht",
          "   ändern, nur über `entfernen` ersetzen. Mit einem Schnappschuss vom 02.08.",
          "   würde das Live-Änderungen überschreiben, deshalb fasst die Importdatei die",
          "   Originale nicht an. Die App zeigt Bowls ohne Untergruppe ohnehin als",
          "   „Salatbowls“ (Default in `src/App.jsx`)."]
    if originale_update:
        z += ["   **Achtung:** diese Importdatei wurde mit `--originale-aktualisieren`",
              "   erzeugt — sie ersetzt die Originale durch Kopien mit Untergruppe",
              "   „Salatbowls“ (Stand des Schnappschusses)."]
    z += ["", "## To-do Susanne", "",
          "1. Tabelle oben prüfen: Mengen der Basis, Preise, VK je Variante.",
          "2. In CALKU anmelden → „Rezepte importieren“ → `import_bowl_basis.json`",
          f"   wählen. Erwartete Meldung: „✓ {len(varianten)} Rezepte importiert“",
          "   (Produkte, deren id oder Name schon existiert, überspringt der Import).",
          "3. Prüfen, oben „Speichern“ / „In Cloud speichern“.",
          "4. Bei den 14 Original-Bowls im Bearbeiten-Dialog die Untergruppe",
          "   „Salatbowls“ ausdrücklich setzen (aktuell leer, wird nur als Default",
          "   angezeigt).",
          "5. Nebenbefund: in der Quark Kartoffel Bowl stehen „Kartoffeln gegart“ und",
          "   „Röstzwiebeln“ mit 0 € — die Preise aus der Tabelle oben passen dort auch.",
          "6. Sobald die Wilde Ziege live ist: frischen JSON-Export ziehen, Generator",
          "   erneut laufen lassen, die vier neuen Varianten nachimportieren.", "",
          "## Danach (Mark, nicht Susanne)", "",
          "Die Kassen-Zuordnung in BigQuery (`igorder_mapping_verkaufsartikel`, 42 Zeilen",
          "„… Kartoffel …“ / „… Reis …“) wird von den bisherigen Salat-Rezepten auf die",
          "neuen ids `<id>_kartoffel` / `<id>_reis` umgehängt. Erst dann rechnet der",
          "Forecast Kartoffeln, Basissauce, Röstzwiebeln und Reis in den Bedarf.", ""]
    ZIEL_REPORT.write_text("\n".join(z) + "\n", encoding="utf-8")


# ----------------------------------------------------------------------
#  main
# ----------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Bowl-Basis-Varianten fuer CALKU erzeugen")
    ap.add_argument("stand", nargs="?", default=str(STAND_DEFAULT),
                    help="Schnappschuss / JSON-Export des CALKU-Dokuments")
    ap.add_argument("--check", action="store_true",
                    help="nur Selbsttest, keine Dateien schreiben")
    ap.add_argument("--originale-aktualisieren", action="store_true",
                    help="Originale ohne Untergruppe per entfernen + Neuanlage auf "
                         "Salatbowls setzen (nur mit frischem Export!)")
    args = ap.parse_args()

    stand_pfad = Path(args.stand)
    stand = json.loads(stand_pfad.read_text(encoding="utf-8"))
    rezeptdatenbank = json.loads(REZEPTDATENBANK.read_text(encoding="utf-8"))

    preise = preise_aufloesen(stand, rezeptdatenbank)
    varianten = baue_varianten(stand, preise)

    fehler = selbsttest(stand, varianten, preise)
    print(f"Selbsttest: {len(varianten)} Varianten aus {len(basis_bowls(stand))} Bowls, "
          f"{len(fehler)} Fehler")
    for f in fehler:
        print(f"   FEHLER: {f}")
    if args.check:
        print("OK" if not fehler else "FEHLGESCHLAGEN")
        sys.exit(1 if fehler else 0)
    if fehler:
        sys.exit("Abbruch: Selbsttest fehlgeschlagen, nichts geschrieben.")

    produkte = [v for _, v, _ in varianten]
    entfernen = []
    if args.originale_aktualisieren:
        kopien = originale_mit_salat(stand)
        entfernen = [k["id"] for k in kopien]
        produkte = kopien + produkte

    out = {
        "meta": {
            "quelle": f"bowl_basis_generator.py aus {stand_pfad.name} "
                      f"(Stand {stand.get('meta', {}).get('stand', '?')})",
            "erzeugt": ERZEUGT,
            "hinweis": "Je Bowl zwei Varianten mit Kartoffel- bzw. Reisbasis; "
                       "Originale unveraendert, VK vom Original uebernommen. "
                       "Pruefliste in bowl_basis_report.md.",
        },
        "entfernen": entfernen,
        "produkte": produkte,
    }
    ZIEL_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    schreibe_report(stand, stand_pfad, varianten, preise, args.originale_aktualisieren)

    print(f"Import: {ZIEL_JSON.name} ({len(produkte)} Produkte, {len(entfernen)} ersetzt)")
    print(f"Report: {ZIEL_REPORT.name}")
    print()
    print("Preise der Basiszutaten:")
    for name, info in preise.items():
        print(f"   {name:<22} {info['preis']:.6f} EUR/g  <- {info['quelle']}")
    print()
    print(f"{'Variante':<38} {'WE alt':>8} {'WE neu':>8} {'VK':>7} {'Quote alt':>10} {'Quote neu':>10}")
    for original, v, _ in varianten:
        print(f"{v['name']:<38} {material(original):8.2f} {material(v):8.2f} "
              f"{v['vk_out_brutto']:7.2f} {we_quote_out(original):9.1f}% {we_quote_out(v):9.1f}%")


if __name__ == "__main__":
    main()
