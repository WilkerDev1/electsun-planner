import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA del mural móvil (MOV-01, MOV-07). El registro se hace solo desde src/movil con scope /m/.
    // La fase F2·E puede ajustar este bloque; el resto del archivo es compartido.
    VitePWA({
      injectRegister: null,
      registerType: "autoUpdate",
      manifest: {
        name: "Electsun Obras",
        short_name: "Obras",
        description: "Tus obras, tu equipo y el calendario de Electsun.",
        lang: "es-DO",
        start_url: "/m",
        scope: "/m/",
        display: "standalone",
        background_color: "#F4F5F7",
        theme_color: "#F4F5F7",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: [/^\/m(\/|$)/],
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  server: { proxy: { "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 8092}`, changeOrigin: false } } },
  build: { chunkSizeWarningLimit: 900 },
});
