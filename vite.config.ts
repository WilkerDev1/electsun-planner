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
      // Alcance del service worker (lo usa registerSW de src/movil). Sin barra final para que /m, la página de
      // inicio de la PWA, también quede cubierta y abra sin conexión; el navigateFallbackAllowlist limita el
      // atajo de navegación a /m y /m/*, así que las rutas de administración (/mural…) no se ven afectadas.
      scope: "/m",
      manifest: {
        name: "Electsun Obras",
        short_name: "Obras",
        description: "Tus obras, tu equipo y el calendario de Electsun.",
        lang: "es-DO",
        start_url: "/m",
        scope: "/m",
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
        // Logotipos de empresas (EQP-07): se sirven de la caché y se refrescan por detrás. La URL lleva ?v=<hash>, así que
        // cada logotipo nuevo es otra entrada; las viejas salen al pasar de 50.
        runtimeCaching: [
          {
            urlPattern: /\/api\/companies\/[0-9a-f-]{36}\/logo(\?|$)/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "company-logos", expiration: { maxEntries: 50 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  server: { proxy: { "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 8092}`, changeOrigin: false } } },
  build: { chunkSizeWarningLimit: 900 },
});
