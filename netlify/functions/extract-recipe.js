// ============================================================
//  Netlify Function: Rezept-Erkennung via Claude
//  Nimmt eine hochgeladene Datei (Bild / PDF / Text) entgegen und gibt
//  strukturierte Produkte im CALKU-Schema zurück.
//  Benötigt ENV: ANTHROPIC_API_KEY (in Netlify hinterlegen).
// ============================================================
import Anthropic from "@anthropic-ai/sdk";

const GRUPPEN = ["Smoothies", "Juices", "Iced Drinks", "Bowls", "Wraps", "Kampagnen"];

const SYSTEM = `Du bist der Kalkulations-Assistent von immergrün (deutsches QSR-Franchise).
Du extrahierst aus hochgeladenen Rezepten strukturierte Produktdaten für die Kalkulations-App CALKU.
Regeln:
- Ordne jedes Produkt genau einer Warengruppe zu: ${GRUPPEN.join(", ")}.
- WICHTIG — Mehrere Produkte & Größen je Datei: Eine Datei (z. B. mehrere Tabellenblätter oder Abschnitte) kann MEHRERE Produkte enthalten (z. B. eine Bowl UND ein Getränk) — lege für JEDES Produkt einen eigenen Eintrag an.
- Größen-Varianten: Wenn ein Rezept mehrere Größen hat (z. B. Spalten "Menge Klein" / "Menge Normal", oder Angaben wie "Klein 8,95 € / Normal 12,95 €"), lege für JEDE Größe einen EIGENEN Eintrag an — mit der jeweiligen Menge je Zutat und dem zur Größe gehörenden Verkaufspreis. Hänge die Größe an den Namen an, z. B. "Korean Glaze Bowl Klein" und "Korean Glaze Bowl Normal".
- vk_in_brutto = vk_out_brutto = Brutto-Verkaufspreis der Größe (gleich, falls kein separater Außer-Haus-Preis genannt ist).
- Bei Bowls die Untergruppe bestimmen: Salatbowls, Reisbowls oder Kartoffelbowls (Default Salatbowls).
- Bei Iced Drinks die Untergruppe falls erkennbar: Sweet Iced Matcha, Iced Matcha, Frozen Iced Tea, Refresher, Iced Coffee Lattes (sonst leer).
- Zutatenmengen IMMER in Gramm/Milliliter als Zahl (menge_g). Rechne Angaben wie "1 EL" grob um (EL≈15, TL≈5, Stück nach Kontext), sonst 0.
- Einkaufspreis je Zutat als preis_pro_kg (Euro pro kg bzw. pro Liter). Wenn die Vorlage einen Preis pro kg/l oder einen Gesamt-Zutatenkosten-Wert enthält, leite preis_pro_kg daraus ab (Kosten ÷ Menge × 1000). Wenn kein Einkaufspreis erkennbar ist: 0.
- Wenn Verkaufspreise nicht im Rezept stehen: 0 setzen (werden später gepflegt).
- verpackung_eur: falls unbekannt, sinnvoller Default je Gruppe (Bowls 0.30, Wraps 0.15, Getränke 0.12), sonst 0.
- Erfinde keine Zutaten. Wenn etwas unklar ist, lass den Wert leer/0.
- Gib ausschließlich die geforderte JSON-Struktur zurück.`;

const PROMPT = `Extrahiere ALLE Produkte und ALLE Größen aus dem oben gezeigten Material.
Arbeite systematisch: Gehe jedes "# Tabellenblatt" bzw. jeden Produktabschnitt einzeln durch.
Für jede Größe (z. B. gibt es Spalten "Menge Klein" UND "Menge Normal", oder Preise "Klein 8,95 € / Normal 12,95 €") legst du einen EIGENEN Eintrag an — mit den JEWEILS eigenen Mengen je Zutat und dem zur Größe gehörenden Verkaufspreis. Die Klein-Variante nutzt die Klein-Mengen, die Normal-Variante die Normal-Mengen — niemals dieselben Mengen für beide.
Selbstkontrolle am Ende: Ist wirklich JEDE Größe und JEDES Produkt/Tabellenblatt als eigener Eintrag enthalten? Wenn etwas fehlt, ergänze es, bevor du antwortest.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    produkte: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          gruppe: { type: "string", enum: GRUPPEN },
          untergruppe: { type: "string" },
          verpackung_eur: { type: "number" },
          vk_in_brutto: { type: "number" },
          vk_out_brutto: { type: "number" },
          zutaten: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                menge_g: { type: "number" },
                preis_pro_kg: { type: "number" },
              },
              required: ["name", "menge_g", "preis_pro_kg"],
            },
          },
        },
        required: ["name", "gruppe", "untergruppe", "verpackung_eur", "vk_in_brutto", "vk_out_brutto", "zutaten"],
      },
    },
  },
  required: ["produkte"],
};

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY ist in Netlify nicht gesetzt." }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
  try {
    const { fileBase64, mimeType, text } = await req.json();
    const client = new Anthropic();

    const content = [];
    if (text && text.trim()) {
      content.push({ type: "text", text: `Rezept-Rohtext:\n\n${text}` });
    } else if (mimeType && mimeType.startsWith("image/")) {
      content.push({ type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } });
    } else if (mimeType === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } });
    } else if (fileBase64) {
      content.push({ type: "text", text: `Rezept-Rohtext:\n\n${Buffer.from(fileBase64, "base64").toString("utf-8")}` });
    } else {
      return new Response(JSON.stringify({ error: "Keine Datei/kein Text übergeben." }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    content.push({ type: "text", text: PROMPT });

    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });

    const out = resp.content.find((b) => b.type === "text")?.text || '{"produkte":[]}';
    return new Response(out, { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unbekannter Fehler" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};
