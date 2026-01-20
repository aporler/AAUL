/**
 * Settings API Routes
 * 
 * Provides endpoints for managing dashboard configuration settings.
 * Settings are stored in the SQLite database and override config.json values.
 * 
 * @module routes/settings
 */

import express from "express";
import config from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { dbOps } from "../db/index.js";
import { getSettings, setSettings } from "../utils/settings.js";
import { resolveBaseUrl } from "../utils/base-url.js";

const router = express.Router();

/**
 * GET /api/settings
 * Retrieve current settings merged with defaults from config
 */
router.get("/", requireAuth, async (req, res) => {
  const settings = await getSettings();
  const installUrl = await resolveBaseUrl();
  res.json({
    ok: true,
    settings: {
      // Network settings
      publicIp: settings.publicIp || "",
      installUrl,
      defaultPollSeconds: settings.defaultPollSeconds || String(config.agentDefaultPollSeconds),

      // Agent local web settings
      agentLocalWebEnabled: settings.agentLocalWebEnabled === "true" || config.agentLocalWebEnabled || false,
      agentLocalWebPort: settings.agentLocalWebPort || String(config.agentLocalWebPort || 8080)
    }
  });
});

/**
 * POST /api/settings
 * Update settings
 * Note: SSL and port changes require server restart to take effect
 */
router.post("/", requireAuth, async (req, res) => {
  const { 
    publicIp, 
    defaultPollSeconds,
    agentLocalWebEnabled,
    agentLocalWebPort
  } = req.body || {};
  
  const current = await getSettings();
  const nextPoll = defaultPollSeconds ? String(defaultPollSeconds) : "";
  const currentPoll = current.defaultPollSeconds || String(config.agentDefaultPollSeconds);
  
  // Build settings object with all values
  const newSettings = {
    publicIp: publicIp ? String(publicIp) : "",
    defaultPollSeconds: nextPoll,
    agentLocalWebEnabled: agentLocalWebEnabled ? "true" : "false",
    agentLocalWebPort: agentLocalWebPort ? String(agentLocalWebPort) : "8080"
  };
  
  await setSettings(newSettings);
  
  // Update pending poll interval for all agents if changed
  if (nextPoll && nextPoll !== String(currentPoll)) {
    const pollValue = Number.parseInt(nextPoll, 10);
    if (Number.isFinite(pollValue) && pollValue > 0) {
      await dbOps.run(
        "UPDATE agents SET pending_poll_interval_seconds = ?",
        [pollValue]
      );
    }
  }
  
  res.json({ ok: true, message: "Settings saved." });
});

export default router;
