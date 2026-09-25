import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.BASE_PATH || "/";
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        id: base,
        name: "15 天人身保險考試通關系統",
        short_name: "15天通關",
        description: "每天一步，掌握人身保險核心考點",
        lang: "zh-Hant",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f5f7f8",
        theme_color: "#163b3d",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,png,svg,woff2}"],
        navigateFallback: "index.html",
        maximumFileSizeToCacheInBytes: 5000000,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
