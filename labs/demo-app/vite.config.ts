import * as Path from "node:path";
import { defineConfig } from "vite";
import viteMdx from "@mdx-js/rollup";
import viteReact from "@vitejs/plugin-react";
// import { VitePWA } from "vite-plugin-pwa";
// Local
// import manifest from "./pwa/manifest.json";

const src = Path.join(__dirname, "src");

/**
 * Vite config. See https://vitejs.dev/config/
 */
export default defineConfig({
  envDir: __dirname,
  publicDir: Path.join(__dirname, "public"),
  root: src,
  server: {
    port: 40141,
    proxy: {
      "/sockets/v1": {
        target: "ws://localhost:40140",
        ws: true,
      },
      "/api/v1": {
        target: "http://localhost:40140",
        changeOrigin: true,
      },
    },
  },
  base: "/designer",
  build: {
    chunkSizeWarningLimit: 1000,
    emptyOutDir: true,
    outDir: Path.join(__dirname, "dist"),
    rollupOptions: {
      input: [Path.join(__dirname, "src/index.html")],
      output: {
        /**
         * The default chunk name is `[name]-[hash].js` but if we let names into
         * our chunks then depending on the name, som adblocker could block it.
         * - https://github.com/vitejs/vite/issues/11804#issuecomment-2009619365
         */
        chunkFileNames: "chunk-[hash].js",
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: { api: "modern" },
    },
  },
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
  plugins: [
    { enforce: "pre", ...viteMdx() },
    viteReact(),
    // VitePWA({
    //   manifest,
    //   includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
    //   // switch to "true" to enable sw on development
    //   devOptions: {
    //     enabled: false,
    //   },
    //   workbox: {
    //     globPatterns: ['**/*.{js,css,html}', '**/*.{svg,png,jpg,gif}'],
    //   },
    // }),
    /**
     * Plugin to do full reloads instead of hot module reloads.
     * https://stackoverflow.com/a/77129675
     */
    {
      name: "full-reload",
      handleHotUpdate({ server }) {
        server.ws.send({ type: "full-reload" });
        return [];
      },
    },
  ],
  resolve: {
    alias: {
      // Easily import anything in `./src`, e.g. `import {X} from "@/base/ui"`.
      "@": src,
    },
  },
});
