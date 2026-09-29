// Eigene Dialoge statt window.confirm/alert (28.09.2026): im App-Stil, mit klarer Beschriftung
// der Knoepfe ("Löschen" statt "OK") und ohne dass der Browser die Seite blockiert.
//
//   if (!(await frage({ text: "…", ja: "Löschen", gefahr: true }))) return;
//   hinweis("12 Rezepte geladen.");
//
// Ein <DialogHost /> einmal an der Wurzel der App; frage/hinweis gehen von ueberall.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

let zeige = null; // vom Host gesetzt

/** Rueckfrage. Liefert ein Promise<boolean>. */
export function frage(opt) {
  const o = typeof opt === "string" ? { text: opt } : opt;
  if (!zeige) return Promise.resolve(window.confirm(o.text)); // ohne Host (Tests) wie bisher
  return new Promise((resolve) => zeige({ ...o, art: "frage", resolve }));
}

/** Reine Mitteilung mit einem OK-Knopf. */
export function hinweis(opt) {
  const o = typeof opt === "string" ? { text: opt } : opt;
  if (!zeige) { window.alert(o.text); return Promise.resolve(); }
  return new Promise((resolve) => zeige({ ...o, art: "hinweis", resolve }));
}

export function DialogHost() {
  const [d, setD] = useState(null);
  const jaRef = useRef(null);
  useEffect(() => { zeige = setD; return () => { zeige = null; }; }, []);
  useEffect(() => { if (d) jaRef.current?.focus(); }, [d]);
  if (!d) return null;

  const schliesse = (wert) => { d.resolve(d.art === "frage" ? wert : undefined); setD(null); };
  const Icon = d.gefahr ? AlertTriangle : Info;
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
      onKeyDown={(e) => { if (e.key === "Escape") schliesse(false); }}
      onClick={(e) => { if (e.target === e.currentTarget) schliesse(false); }}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
        <div className="flex gap-3">
          <Icon size={20} className={`shrink-0 mt-0.5 ${d.gefahr ? "text-red-600" : "text-emerald-700"}`} />
          <div className="space-y-1.5">
            {d.titel && <h2 className="font-semibold text-gray-900">{d.titel}</h2>}
            <p className="text-sm text-gray-700 whitespace-pre-line">{d.text}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {d.art === "frage" && (
            <button onClick={() => schliesse(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              {d.nein || "Abbrechen"}
            </button>
          )}
          <button ref={jaRef} onClick={() => schliesse(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${d.gefahr ? "bg-red-600 hover:bg-red-700" : "bg-emerald-700 hover:bg-emerald-800"}`}>
            {d.ja || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
