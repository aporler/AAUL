/**
 * Agent Auto Update Dashboard Server
 * 
 * Main entry point for the Express server.
 * Supports both HTTP and HTTPS with SSL/TLS certificates.
 * Can run both simultaneously on different ports.
 * 
 * @module server
 */

import express from "express";
import path from "path";
import fs from "fs";
import http from "http";
import https from "https";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import { fileURLToPath } from "url";
import config from "./config.js";
import { initDb } from "./db/index.js";
import { loadCertificates, watchCertificates } from "./utils/ssl.js";
import { loadAllPlugins, triggerHook, notifyServerReady } from "./plugins/plugin-loader.js";

// Route imports
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import agentsRoutes from "./routes/agents.js";
import agentApiRoutes from "./routes/agent-api.js";
import installRoutes from "./routes/install.js";
import bundleRoutes from "./routes/bundle.js";
import adminRoutes from "./routes/admin.js";
import settingsRoutes from "./routes/settings.js";
import pluginsRoutes from "./routes/plugins.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");

// Initialize database
await initDb();

// Create Express application
const app = express();

// Determine if HTTPS is enabled
const httpsEnabled = config.https?.enabled === true;
const httpEnabled = config.http?.enabled !== false; // Default to true

// Security headers
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  if (req.secure || httpsEnabled) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Trust proxy for HTTPS behind reverse proxy
if (httpsEnabled) {
  app.set("trust proxy", 1);
}

// Body parsing middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// Session configuration
const SQLiteStore = connectSqlite3(session);
const dbDir = path.dirname(path.resolve(config.dbPath));
const sessionDb = path.basename(
  config.dbPath.endsWith(".sqlite")
    ? config.dbPath.replace(/\.sqlite$/, ".sessions.sqlite")
    : `${config.dbPath}.sessions.sqlite`
);

app.use(
  session({
    store: new SQLiteStore({
      db: sessionDb,
      dir: dbDir,
      table: "sessions"
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: httpsEnabled && !httpEnabled // Only secure if HTTPS-only
    }
  })
);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/agent", agentApiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/plugins", pluginsRoutes);

// Agent installation and bundle routes
app.use("/install", installRoutes);
app.use("/agent", bundleRoutes);

// Load plugins
await loadAllPlugins(app);

// Static files for production
const uiDist = path.join(rootDir, "dashboard", "client", "dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(uiDist)) {
  app.use(express.static(uiDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(uiDist, "index.html"));
  });
}

// Track active servers for graceful shutdown
const servers = [];
let httpServer = null;
let httpsServer = null;

// Start HTTP server if enabled
if (httpEnabled) {
  const httpPort = config.http?.apiPort || 3001;
  httpServer = http.createServer(app);
  
  httpServer.listen(httpPort, config.host, () => {
    console.log(`📡 HTTP API listening on http://${config.host}:${httpPort}`);
  });
  
  servers.push(httpServer);
}

// Start HTTPS server if enabled
if (httpsEnabled) {
  const httpsPort = config.https?.apiPort || 3002;
  const httpsOptions = loadCertificates({
    enabled: true,
    keyPath: config.https?.keyPath,
    certPath: config.https?.certPath,
    caPath: config.https?.caPath
  });
  
  if (httpsOptions) {
    httpsServer = https.createServer(httpsOptions, app);
    
    httpsServer.listen(httpsPort, config.host, () => {
      console.log(`🔒 HTTPS API listening on https://${config.host}:${httpsPort}`);
    });
    
    servers.push(httpsServer);
    
    // Watch for certificate changes
    watchCertificates(config.https, (newOptions) => {
      console.log("[SSL] Certificates changed. Restart server to apply.");
    });
  } else {
    console.error("❌ HTTPS enabled but certificates failed to load!");
  }
}

// Show summary
console.log("");
console.log("═══════════════════════════════════════════════════");
console.log("  Agent Auto Update Dashboard - Server Started");
console.log("═══════════════════════════════════════════════════");
if (httpEnabled) {
  console.log(`  HTTP API:  http://${config.host}:${config.http?.apiPort || 3001}`);
}
if (httpsEnabled) {
  console.log(`  HTTPS API: https://${config.host}:${config.https?.apiPort || 3002}`);
}
console.log(`  Default API Protocol: ${config.defaultApiProtocol || 'http'}`);
console.log("═══════════════════════════════════════════════════");
console.log("");

// Trigger server start hook for plugins
await triggerHook("server:start", config);

// Notify plugins that servers are ready (for WebSocket setup, etc.)
await notifyServerReady({ app, httpServer, httpsServer });

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  await triggerHook("server:stop");
  
  for (const server of servers) {
    server.close();
  }
  
  console.log("Server closed");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
