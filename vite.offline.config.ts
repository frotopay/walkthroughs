// The player alone, for `walkthroughs offline`: one script and one stylesheet, nothing loaded at run time. Built
// with the package, into dist/offline.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: fileURLToPath(new URL("src/player/offline", import.meta.url)),
  plugins: [react(), tailwindcss()],
  base: "./",
  publicDir: false,
  // At most 64 files open at once: the player imports lucide-react, whose ~1,500 icon files would otherwise all be
  // opened together, past a build machine's open-file limit (EMFILE on Cloudflare's builder, 5 Nov 2026).
  build: {
    outDir: fileURLToPath(new URL("dist/offline", import.meta.url)),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { maxParallelFileOps: 64, output: { inlineDynamicImports: true, entryFileNames: "player.js", assetFileNames: "player[extname]" } },
  },
});
