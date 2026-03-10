/**
 * HTTPS/SSL Configuration Helper
 * 
 * Provides utilities for loading SSL certificates and creating HTTPS servers.
 * Supports Let's Encrypt, commercial certificates, and self-signed certificates.
 * 
 * @module utils/ssl
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * SSL configuration object
 * @typedef {Object} SSLConfig
 * @property {boolean} enabled - Whether SSL is enabled
 * @property {string} keyPath - Path to private key file
 * @property {string} certPath - Path to certificate file
 * @property {string} [caPath] - Path to CA chain file (optional)
 * @property {boolean} [rejectUnauthorized] - Whether to reject unauthorized certs
 * @property {number} [httpsPort] - HTTPS port (default: 443)
 * @property {boolean} [redirectHttp] - Redirect HTTP to HTTPS
 * @property {number} [httpPort] - HTTP port for redirect (default: 80)
 */

/**
 * Resolves a certificate path (absolute or relative to server directory)
 * @param {string} certPath - Path to certificate file
 * @returns {string} Absolute path
 */
function resolveCertPath(certPath) {
  if (!certPath) {
    return null;
  }
  if (path.isAbsolute(certPath)) {
    return certPath;
  }
  // Relative to server directory
  return path.join(__dirname, "..", certPath);
}

/**
 * Loads SSL certificates from disk
 * @param {SSLConfig} sslConfig - SSL configuration
 * @returns {Object|null} HTTPS options or null if loading fails
 */
export function loadCertificates(sslConfig) {
  if (!sslConfig || !sslConfig.enabled) {
    return null;
  }
  
  const keyPath = resolveCertPath(sslConfig.keyPath);
  const certPath = resolveCertPath(sslConfig.certPath);
  const caPath = resolveCertPath(sslConfig.caPath);
  
  if (!keyPath || !certPath) {
    console.error("[SSL] Missing keyPath or certPath in configuration");
    return null;
  }
  
  if (!fs.existsSync(keyPath)) {
    console.error(`[SSL] Private key file not found: ${keyPath}`);
    return null;
  }
  
  if (!fs.existsSync(certPath)) {
    console.error(`[SSL] Certificate file not found: ${certPath}`);
    return null;
  }
  
  try {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    
    // Load CA chain if provided (for commercial certificates)
    if (caPath && fs.existsSync(caPath)) {
      options.ca = fs.readFileSync(caPath);
    }
    
    // Handle self-signed certificates in development
    if (sslConfig.rejectUnauthorized === false) {
      options.rejectUnauthorized = false;
    }
    
    console.log("[SSL] Certificates loaded successfully");
    return options;
  } catch (err) {
    console.error("[SSL] Failed to load certificates:", err.message);
    return null;
  }
}

/**
 * Creates an HTTPS server with the Express app
 * @param {Object} app - Express application
 * @param {SSLConfig} sslConfig - SSL configuration
 * @returns {Object} Server object with { server, type, port }
 */
export function createSecureServer(app, sslConfig) {
  const httpsOptions = loadCertificates(sslConfig);
  
  if (!httpsOptions) {
    console.log("[SSL] Falling back to HTTP server");
    return {
      server: http.createServer(app),
      type: "http",
      port: sslConfig?.httpPort || 3001
    };
  }
  
  const httpsServer = https.createServer(httpsOptions, app);
  
  return {
    server: httpsServer,
    type: "https",
    port: sslConfig.httpsPort || 443
  };
}

/**
 * Creates an HTTP to HTTPS redirect server
 * @param {number} httpPort - HTTP port to listen on
 * @param {number} httpsPort - HTTPS port to redirect to
 * @param {string} host - Hostname for redirects
 * @returns {Object} HTTP server
 */
export function createRedirectServer(httpPort, httpsPort, host) {
  const redirectApp = (req, res) => {
    const targetHost = host === "0.0.0.0" ? req.headers.host?.split(":")[0] : host;
    const targetPort = httpsPort === 443 ? "" : `:${httpsPort}`;
    const redirectUrl = `https://${targetHost}${targetPort}${req.url}`;
    
    res.writeHead(301, { Location: redirectUrl });
    res.end();
  };
  
  return http.createServer(redirectApp);
}

/**
 * Watches certificate files for changes (useful for Let's Encrypt auto-renewal)
 * @param {SSLConfig} sslConfig - SSL configuration
 * @param {Function} onReload - Callback when certificates are reloaded
 */
export function watchCertificates(sslConfig, onReload) {
  if (!sslConfig || !sslConfig.enabled) {
    return;
  }
  
  const certPath = resolveCertPath(sslConfig.certPath);
  if (!certPath || !fs.existsSync(certPath)) {
    return;
  }
  
  let debounceTimer = null;
  
  fs.watch(certPath, (eventType) => {
    if (eventType === "change") {
      // Debounce to avoid multiple reloads
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        console.log("[SSL] Certificate file changed, reloading...");
        const newOptions = loadCertificates(sslConfig);
        if (newOptions && typeof onReload === "function") {
          onReload(newOptions);
        }
      }, 1000);
    }
  });
  
  console.log("[SSL] Watching certificate files for changes");
}

/**
 * Generates a self-signed certificate command for the user
 * @param {string} domain - Domain name (default: localhost)
 * @param {string} outputDir - Output directory for certificates
 * @returns {string} OpenSSL command
 */
export function getSelfSignedCommand(domain = "localhost", outputDir = "./server/ssl") {
  return `openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
  -keyout ${outputDir}/server.key \\
  -out ${outputDir}/server.crt \\
  -subj "/C=CA/ST=Quebec/L=Montreal/O=AutoUpdateLinux/CN=${domain}"`;
}

export default {
  loadCertificates,
  createSecureServer,
  createRedirectServer,
  watchCertificates,
  getSelfSignedCommand
};
