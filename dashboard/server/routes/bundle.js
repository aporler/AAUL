import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public", "agent");
const fallbackVersionPath = path.join(rootDir, "..", "agent", "app", "VERSION");

function readVersion() {
  const publicVersion = path.join(publicDir, "VERSION");
  if (fs.existsSync(publicVersion)) {
    return fs.readFileSync(publicVersion, "utf8").trim();
  }
  if (fs.existsSync(fallbackVersionPath)) {
    return fs.readFileSync(fallbackVersionPath, "utf8").trim();
  }
  return "0.0.0";
}

router.get("/version", (req, res) => {
  res.json({ version: readVersion() });
});

router.get("/latest.tar.gz", (req, res) => {
  const bundlePath = path.join(publicDir, "latest.tar.gz");
  if (!fs.existsSync(bundlePath)) {
    res.status(404).json({ error: "Bundle not found" });
    return;
  }
  res.sendFile(bundlePath);
});

export default router;