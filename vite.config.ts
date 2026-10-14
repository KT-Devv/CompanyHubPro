import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    // Installable app + works with no signal. The service worker keeps the app
    // itself (pages, scripts, styles, fonts) so it opens offline; it never
    // stores data from the database (that is handled, per user, by the
    // offline attendance copy in the app). Off in development and in demo mode.
    VitePWA({
      registerType: "autoUpdate",
      disable: process.env.NODE_ENV !== "production" || process.env.VITE_DEMO === "true",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "SiteTrack - TEK International Contractors",
        short_name: "SiteTrack",
        description: "Workforce, attendance, payroll and logistics for TEK International Contractors Ltd.",
        theme_color: "#222a72",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Never answer an API or auth request from a stored copy.
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The PDF/Excel export code is large and only needed online.
        globIgnores: ["**/jspdf*", "**/xlsx*", "**/html2canvas*"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { urlPattern: ({ url }) => /\.supabase\.co$/.test(url.hostname), handler: "NetworkOnly" },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // Vite's default (an explicit allowlist, localhost only) exists specifically
    // to stop DNS rebinding: a page on any website can point attacker-controlled
    // DNS at 127.0.0.1 and then request the dev server with a forged Host header,
    // reading back whatever the server would normally only serve to localhost.
    // `true` here would disable that check entirely. This project's dev server
    // is reached at a Replit-assigned domain, so localhost alone isn't enough —
    // but "any host" isn't the fix for that; naming the actual expected hosts is.
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".replit.dev",
      ".repl.co",
      ...(process.env.REPLIT_DEV_DOMAIN ? [process.env.REPLIT_DEV_DOMAIN] : []),
    ],
  },
});
