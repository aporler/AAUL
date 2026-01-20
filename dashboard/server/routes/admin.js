import express from "express";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "..", "config", "config.json");

const router = express.Router();

router.get("/network-ips", requireAuth, (req, res) => {
  const interfaces = os.networkInterfaces();
  const ips = [];

  Object.entries(interfaces).forEach(([name, entries]) => {
    if (!entries) {
      return;
    }
    entries.forEach((entry) => {
      if (entry.internal) {
        return;
      }
      const family = String(entry.family);
      if (family !== "IPv4" && family !== "4") {
        return;
      }
      ips.push({
        name,
        address: entry.address,
        family: "IPv4"
      });
    });
  });

  res.json({ ok: true, ips });
});

// Get current server configuration
router.get("/config", requireAuth, async (req, res) => {
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, "utf8"));
    res.json({
      ok: true,
      config: {
        host: configData.host || "0.0.0.0",
        http: {
          enabled: configData.http?.enabled !== false,
          apiPort: configData.http?.apiPort || 3001,
          webPort: configData.http?.webPort || 5173
        },
        https: {
          enabled: configData.https?.enabled || false,
          apiPort: configData.https?.apiPort || 3002,
          webPort: configData.https?.webPort || 5174,
          keyPath: configData.https?.keyPath || "./ssl/server.key",
          certPath: configData.https?.certPath || "./ssl/server.crt"
        },
        defaultApiProtocol: configData.defaultApiProtocol || "http"
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to read config" });
  }
});

// Update HTTP/HTTPS configuration
router.post("/config/server", requireAuth, async (req, res) => {
  try {
    const { http, https, defaultApiProtocol } = req.body;
    
    const configData = JSON.parse(fs.readFileSync(configPath, "utf8"));
    
    // Update HTTP settings
    if (http) {
      if (!configData.http) configData.http = {};
      if (typeof http.enabled === "boolean") configData.http.enabled = http.enabled;
      if (typeof http.apiPort === "number") configData.http.apiPort = http.apiPort;
      if (typeof http.webPort === "number") configData.http.webPort = http.webPort;
    }
    
    // Update HTTPS settings
    if (https) {
      if (!configData.https) configData.https = {};
      if (typeof https.enabled === "boolean") configData.https.enabled = https.enabled;
      if (typeof https.apiPort === "number") configData.https.apiPort = https.apiPort;
      if (typeof https.webPort === "number") configData.https.webPort = https.webPort;
      if (typeof https.keyPath === "string") configData.https.keyPath = https.keyPath;
      if (typeof https.certPath === "string") configData.https.certPath = https.certPath;
    }
    
    // Update default API protocol
    if (defaultApiProtocol === "http" || defaultApiProtocol === "https") {
      configData.defaultApiProtocol = defaultApiProtocol;
    }
    
    // Validation: at least one protocol must be enabled
    if (configData.http?.enabled === false && configData.https?.enabled !== true) {
      return res.status(400).json({ 
        ok: false, 
        error: "At least one protocol (HTTP or HTTPS) must be enabled" 
      });
    }
    
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    
    res.json({ ok: true, message: "Configuration updated. Restart server to apply changes." });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to update config: " + err.message });
  }
});

// Check if SSL certificates exist
router.get("/config/ssl-status", requireAuth, async (req, res) => {
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const keyPath = path.join(__dirname, "..", "..", configData.https?.keyPath || "./ssl/server.key");
    const certPath = path.join(__dirname, "..", "..", configData.https?.certPath || "./ssl/server.crt");
    
    res.json({
      ok: true,
      keyExists: fs.existsSync(keyPath),
      certExists: fs.existsSync(certPath),
      keyPath: configData.https?.keyPath || "./ssl/server.key",
      certPath: configData.https?.certPath || "./ssl/server.crt"
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Restart server endpoint
router.post("/restart", requireAuth, async (req, res) => {
  res.json({ ok: true, message: "Server restarting..." });
  
  setTimeout(() => {
    console.log("[Admin] Server restart requested via API");
    process.exit(0);
  }, 500);
});

export default router;
