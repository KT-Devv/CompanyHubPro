import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// This app has no server-side routes of its own — the client talks to
// Supabase directly — so this middleware is the one place that reliably
// covers every response this process sends, whichever way it's deployed
// (Replit/Node running this file directly, or any other Express host). A
// Netlify deployment never runs this file at all (Netlify serves the static
// build and applies its own header rules from netlify.toml instead), so both
// are kept in sync deliberately.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // No inline/eval scripts in the production build; nothing here needs them.
        scriptSrc: ["'self'"],
        // React sets some inline `style` attributes at runtime. That can't execute
        // script on its own, so allowing it is a standard, low-risk trade-off —
        // the actual XSS protection comes from the strict scriptSrc above.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // This app is never meant to be framed; frame-ancestors above covers modern
    // browsers, this covers older ones.
    crossOriginEmbedderPolicy: false,
  }),
);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // No API is served from here (the client talks to Supabase directly). Answer
  // unknown /api paths with a JSON 404 instead of letting them fall through to
  // the SPA catch-all, which would return index.html with a 200.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Not found" });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    // Always log the real error server-side. Only echo err.message back to the
    // client for expected 4xx cases (e.g. body-parser rejecting malformed JSON)
    // where it's a safe, actionable string; a 500 can originate from anywhere,
    // including a driver or dependency whose message may contain internal
    // detail (file paths, connection info) that has no business leaving this
    // process.
    console.error(err);
    const message = status < 500 ? err.message || "Bad request" : "Internal Server Error";

    res.status(status).json({ message });
    // Do not rethrow - response already sent; rethrowing can cause unhandled rejection
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
