// The player alone, for e2e/tools/offline.mjs: one script and one stylesheet, nothing loaded at run time.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  publicDir: false,
  build: {
    outDir: "dist-learn",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: "learn.html", output: { inlineDynamicImports: true, entryFileNames: "player.js", assetFileNames: "player[extname]" } },
  },
});
