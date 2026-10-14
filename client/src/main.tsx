import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initMonitoring, installGlobalErrorHandlers } from "./lib/monitoring";

// Error reporting starts in the background; the app does not wait for it.
installGlobalErrorHandlers();
void initMonitoring();

createRoot(document.getElementById("root")!).render(<App />);

// Install prompt / service worker registration is handled by vite-plugin-pwa
// (see vite.config.ts); it is switched off in development.
