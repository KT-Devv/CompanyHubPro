import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
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
