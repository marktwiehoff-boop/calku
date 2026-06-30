// ============================================================
//  Supabase-Anbindung — gemeinsamer Speicher + Google-Login
// ============================================================
// Cloud-Modus ist nur aktiv, wenn beide ENV-Variablen gesetzt sind
// (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY). Fehlen sie, läuft die
// App im lokalen Modus (Daten aus dem Build, Speichern = Datei-Download).
import { createClient } from "@supabase/supabase-js";

const URL  = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudEnabled = Boolean(URL && ANON);
export const supabase = cloudEnabled ? createClient(URL, ANON) : null;

// Wer darf schreiben? (zusätzlich serverseitig per RLS erzwungen)
export const WRITER_EMAILS = [
  "mark.twiehoff@mein-immergruen.de",
  "susanne.sedlaczek@mein-immergruen.de",
];
export const ALLOWED_DOMAIN = "mein-immergruen.de";
const ROW_ID = "main";

export function isWriter(email) {
  return !!email && WRITER_EMAILS.includes(email.toLowerCase());
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

// Lädt das gespeicherte Kalkulations-Dokument ({ produkte, mix }) oder null.
export async function loadKalkulation() {
  const { data, error } = await supabase
    .from("kalkulation_state")
    .select("data, updated_at, updated_by")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Speichert das komplette Dokument (nur Writer; sonst blockt RLS).
export async function saveKalkulation(payload) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("kalkulation_state").upsert({
    id: ROW_ID,
    data: payload,
    updated_at: new Date().toISOString(),
    updated_by: u?.user?.email || null,
  });
  if (error) throw error;
}

// Live-Sync: ruft cb(neuesDokument) bei jeder Änderung des Datensatzes.
export function subscribeKalkulation(cb) {
  return supabase
    .channel("kalkulation_state_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "kalkulation_state", filter: `id=eq.${ROW_ID}` },
      (payload) => cb(payload.new?.data, payload.new?.updated_by, payload.new?.updated_at)
    )
    .subscribe();
}
