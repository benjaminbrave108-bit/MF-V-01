import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(({ mode }) => {
  // Server-side route handlers read process.env directly (e.g. db/index.ts's
  // DATABASE_URL) — Vite only auto-exposes VITE_-prefixed vars to client code,
  // so .env.local values are loaded and copied onto process.env explicitly.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [vinext(), sites()],
    // pg lazily requires the optional native "pg-native" addon in a try/catch
    // at runtime; Vite's static resolution doesn't know that, so it must be
    // excluded rather than bundled.
    optimizeDeps: { exclude: ["pg-native"] },
    ssr: { external: ["pg", "pg-native", "exceljs", "jszip"] },
  };
});
