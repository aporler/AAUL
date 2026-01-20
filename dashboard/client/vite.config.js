import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config to get HTTP/HTTPS settings
let apiUrl = "http://127.0.0.1:3001";
let vitePort = 5173;
let httpsConfig = undefined;
const envProtocol = process.env.VITE_PROTOCOL;
const envPort = process.env.VITE_PORT ? Number(process.env.VITE_PORT) : undefined;
const envApiUrl = process.env.VITE_API_URL;

try {
  const configPath = path.join(__dirname, "..", "config", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  
  const httpEnabled = config.http?.enabled !== false;
  const httpsEnabled = config.https?.enabled === true;
  let protocol = envProtocol || (config.defaultApiProtocol === "https" && httpsEnabled ? "https" : "http");
  if (protocol === "https" && !httpsEnabled) {
    protocol = "http";
  }
  if (protocol === "http" && !httpEnabled && httpsEnabled) {
    protocol = "https";
  }
  
  // Determine which API to use (based on defaultApiProtocol or availability)
  const useHttps = protocol === "https";
  
  if (envApiUrl) {
    apiUrl = envApiUrl;
  } else if (useHttps) {
    // Use HTTPS API
    const port = config.https?.apiPort || 3002;
    apiUrl = `https://127.0.0.1:${port}`;
  } else if (httpEnabled) {
    // Use HTTP API
    const port = config.http?.apiPort || 3001;
    apiUrl = `http://127.0.0.1:${port}`;
  } else if (httpsEnabled) {
    // HTTP disabled, must use HTTPS
    const port = config.https?.apiPort || 3002;
    apiUrl = `https://127.0.0.1:${port}`;
  }
  
  // Determine Vite port and HTTPS settings
  if (protocol === "https") {
    // HTTPS mode - Vite also uses HTTPS
    vitePort = envPort || config.https?.webPort || 5174;
    
    const sslKeyPath = path.join(__dirname, "..", config.https?.keyPath || "./ssl/server.key");
    const sslCertPath = path.join(__dirname, "..", config.https?.certPath || "./ssl/server.crt");
    
    if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
      httpsConfig = {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath)
      };
      console.log(`[vite] 🔒 HTTPS mode on port ${vitePort}`);
    } else {
      console.warn("[vite] HTTPS requested but SSL certs not found.");
    }
  } else {
    // HTTP mode - Vite uses HTTP
    vitePort = envPort || config.http?.webPort || 5173;
    console.log(`[vite] 📡 HTTP mode on port ${vitePort}`);
  }
  
  console.log(`[vite] API target: ${apiUrl}`);
  
} catch (e) {
  console.warn("[vite] Could not load config, using defaults:", e.message);
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: vitePort,
    https: httpsConfig,
    proxy: {
      "/api": {
        target: apiUrl,
        changeOrigin: true,
        secure: false,  // Accept self-signed certs
        ws: true  // Enable WebSocket proxying
      },
      "/agent": {
        target: apiUrl,
        changeOrigin: true,
        secure: false
      },
      "/install": {
        target: apiUrl,
        changeOrigin: true,
        secure: false
      },
      // Plugin routes - proxy to API server
      "/local-console": {
        target: apiUrl,
        changeOrigin: true,
        secure: false
      },
      "/showinfohost": {
        target: apiUrl,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
