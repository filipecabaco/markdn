import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The bundle is emitted straight into priv/static, which is what Francis serves
// (config :francis, static:) and what the mix release copies into the desktop app.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../priv/static",
    emptyOutDir: false,
    assetsDir: "assets",
  },
  server: {
    port: 5173,
    // `pnpm dev` serves the UI with HMR while the Elixir app runs separately on
    // 43118; API and websocket calls are proxied so the frontend uses the same
    // relative URLs in dev as it does when Francis serves the built bundle.
    proxy: {
      "/api": "http://localhost:43118",
      "/mcp": "http://localhost:43118",
      "/ws": { target: "ws://localhost:43118", ws: true },
    },
  },
});
