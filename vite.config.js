import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Bibliotheken in eigene Dateien: Sie aendern sich selten und bleiben so ueber Deploys hinweg
// im Browser-Cache - nach einem Update laedt der Browser nur noch den App-Code neu.
// recharts (Diagramme) kommt ueber den System-Wareneinsatz-Tab erst bei Bedarf.
const VENDOR = [
  ["react", /node_modules\/(react|react-dom|scheduler)\//],
  ["supabase", /node_modules\/@supabase\//],
  ["papaparse", /node_modules\/papaparse\//],
];

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const pfad = id.replace(/\\/g, "/");
          for (const [name, re] of VENDOR) if (re.test(pfad)) return `vendor-${name}`;
          if (pfad.includes("/src/data/") && !pfad.includes("naehrwerte")) return "stammdaten";
        },
      },
    },
  },
});
