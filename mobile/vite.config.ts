import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  publicDir: "../public",
  css: { postcss: fileURLToPath(new URL("..", import.meta.url)) },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("..", import.meta.url)),
      "next/image": fileURLToPath(new URL("./src/image.tsx", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: {
    port: 4173,
    strictPort: true,
    // Development only. Native builds send requests using Capacitor's HTTP transport.
    proxy: { "/api": { target: "https://maximus-crm-next.netlify.app", changeOrigin: true } },
  },
});
