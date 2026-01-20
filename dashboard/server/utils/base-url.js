import config from "../config.js";
import { getSetting } from "./settings.js";

export async function resolveBaseUrl() {
  const publicIp = await getSetting("publicIp");
  const httpEnabled = config.http?.enabled !== false;
  const httpsEnabled = config.https?.enabled === true;

  let protocol = httpsEnabled ? "https" : "http";
  if (protocol === "http" && !httpEnabled && httpsEnabled) {
    protocol = "https";
  }

  const host = publicIp && publicIp.trim()
    ? publicIp.trim()
    : (config.host && config.host !== "0.0.0.0" ? config.host : "localhost");

  const port = protocol === "https"
    ? (config.https?.apiPort || 3002)
    : (config.http?.apiPort || 3001);

  return `${protocol}://${host}:${port}`;
}