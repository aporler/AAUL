/**
 * Server Configuration Module
 * 
 * Loads configuration from config.json and environment variables.
 * Environment variables take precedence over file configuration.
 * 
 * @module config
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
const envPath = path.join(rootDir, "dashboard", ".env");

// Load environment variables from .env file if it exists
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Load base configuration from config.json
const configPath = path.join(rootDir, "dashboard", "config", "config.json");
const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

/**
 * Parse HTTP/HTTPS configuration from environment variables
 */
function parseHttpFromEnv() {
  if (process.env.HTTP_ENABLED === undefined
      && process.env.HTTP_API_PORT === undefined
      && process.env.HTTP_WEB_PORT === undefined) {
    return undefined;
  }
  return {
    enabled: process.env.HTTP_ENABLED === "false" ? false : true,
    apiPort: process.env.HTTP_API_PORT ? Number(process.env.HTTP_API_PORT) : 3001,
    webPort: process.env.HTTP_WEB_PORT ? Number(process.env.HTTP_WEB_PORT) : 5173
  };
}

function parseHttpsFromEnv() {
  if (process.env.HTTPS_ENABLED === undefined
      && process.env.HTTPS_API_PORT === undefined
      && process.env.HTTPS_WEB_PORT === undefined
      && process.env.HTTPS_KEY_PATH === undefined
      && process.env.HTTPS_CERT_PATH === undefined) {
    return undefined;
  }
  return {
    enabled: process.env.HTTPS_ENABLED === "true",
    apiPort: process.env.HTTPS_API_PORT ? Number(process.env.HTTPS_API_PORT) : 3002,
    webPort: process.env.HTTPS_WEB_PORT ? Number(process.env.HTTPS_WEB_PORT) : 5174,
    keyPath: process.env.HTTPS_KEY_PATH || "./ssl/server.key",
    certPath: process.env.HTTPS_CERT_PATH || "./ssl/server.crt",
    caPath: process.env.HTTPS_CA_PATH || ""
  };
}

/**
 * Environment variable overrides
 * These take precedence over config.json values
 */
const envConfig = {
  host: process.env.HOST,
  dbPath: process.env.DB_PATH,
  sessionSecret: process.env.SESSION_SECRET,
  allowHttpInstall: process.env.ALLOW_HTTP_INSTALL === "true" ? true : 
                    process.env.ALLOW_HTTP_INSTALL === "false" ? false : undefined,
  agentDefaultPollSeconds: process.env.AGENT_DEFAULT_POLL_SECONDS
    ? Number(process.env.AGENT_DEFAULT_POLL_SECONDS)
    : undefined,
  agentDefaultScheduleEnabled: process.env.AGENT_DEFAULT_SCHEDULE_ENABLED
    ? Number(process.env.AGENT_DEFAULT_SCHEDULE_ENABLED)
    : undefined,
  agentDefaultDailyTime: process.env.AGENT_DEFAULT_DAILY_TIME,
  logLevel: process.env.LOG_LEVEL,
  http: parseHttpFromEnv(),
  https: parseHttpsFromEnv(),
  defaultApiProtocol: process.env.DEFAULT_API_PROTOCOL,
  agentLocalWebEnabled: process.env.AGENT_LOCAL_WEB_ENABLED === "true" ? true : undefined,
  agentLocalWebPort: process.env.AGENT_LOCAL_WEB_PORT 
    ? Number(process.env.AGENT_LOCAL_WEB_PORT) 
    : undefined
};

/**
 * Merged configuration object
 * Environment variables override file configuration
 */
const config = {
  ...fileConfig,
  ...Object.fromEntries(
    Object.entries(envConfig).filter(([, value]) => value !== undefined)
  )
};

// Ensure HTTP/HTTPS config exists with defaults
if (!config.http) {
  config.http = {
    enabled: true,
    apiPort: 3001,
    webPort: 5173
  };
}

if (!config.https) {
  config.https = {
    enabled: false,
    apiPort: 3002,
    webPort: 5174,
    keyPath: "./ssl/server.key",
    certPath: "./ssl/server.crt",
    caPath: ""
  };
}

if (!config.defaultApiProtocol) {
  config.defaultApiProtocol = "http";
}

export default config;