/**
 * Agent management routes used by the dashboard UI and local admin tooling.
 */
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { dbOps } from "../db/index.js";
import { requireAdmin } from "../middleware/auth.js";
import { decryptSecret, generateToken, protectToken } from "../utils/tokens.js";
import config from "../config.js";
import { resolveBaseUrl } from "../utils/base-url.js";
import { readVersion } from "./bundle.js";

const router = express.Router();
const INSTALLER_FILENAMES = {
  linux: "/tmp/aaul-install.sh",
  macos: "/tmp/aaul-install.sh",
  windows: "$env:TEMP\\aaul-install.ps1"
};

// Every platform uses the same one-time token, only the generated script differs.
function buildInstallUrls(baseUrl, installToken) {
  const encodedToken = encodeURIComponent(installToken);
  const root = `${baseUrl.replace(/\/$/, "")}/install?token=${encodedToken}`;
  return {
    linux: root,
    macos: `${root}&platform=macos`,
    windows: `${root}&platform=windows`
  };
}

// These commands are meant for display and copy/paste in the dashboard.
function buildInstallCommands(baseUrl, installToken) {
  const urls = buildInstallUrls(baseUrl, installToken);
  return {
    linux: `curl -fsSLo ${INSTALLER_FILENAMES.linux} '${urls.linux}' && sudo sh ${INSTALLER_FILENAMES.linux} && rm -f ${INSTALLER_FILENAMES.linux}`,
    macos: `curl -fsSLo ${INSTALLER_FILENAMES.macos} '${urls.macos}' && sudo bash ${INSTALLER_FILENAMES.macos} && rm -f ${INSTALLER_FILENAMES.macos}`,
    windows:
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "` +
      `Invoke-WebRequest '${urls.windows}' -UseBasicParsing -OutFile ${INSTALLER_FILENAMES.windows}; ` +
      `& ${INSTALLER_FILENAMES.windows}"`,
    urls
  };
}

// Older rows or broken key material can make token decryption fail; callers handle null.
function extractInstallToken(agent) {
  try {
    return agent.install_token_enc ? decryptSecret(agent.install_token_enc) : agent.install_token;
  } catch {
    return null;
  }
}

// The UI expects install information to exist even for migrated legacy rows.
async function ensureInstallToken(agent) {
  const installToken = extractInstallToken(agent);
  if (installToken) {
    return installToken;
  }

  const rotatedToken = generateToken(32);
  const protectedInstallToken = protectToken(rotatedToken);
  await dbOps.run(
    "UPDATE agents SET install_token = NULL, install_token_hash = ?, install_token_enc = ? WHERE id = ?",
    [protectedInstallToken.hash, protectedInstallToken.encrypted, agent.id]
  );
  agent.install_token = null;
  agent.install_token_hash = protectedInstallToken.hash;
  agent.install_token_enc = protectedInstallToken.encrypted;
  return rotatedToken;
}

// Keep command dispatch serialized per agent to avoid overlapping actions.
async function getPendingCommand(agentId) {
  return dbOps.get(
    "SELECT id, type, status, payload_json FROM commands WHERE agent_id = ? AND status IN ('QUEUED','IN_PROGRESS') ORDER BY created_at ASC LIMIT 1",
    [agentId]
  );
}

async function createCommand(agentId, type, payload) {
  const existing = await getPendingCommand(agentId);
  if (existing) {
    return { error: "Command already pending", status: 409 };
  }
  const now = new Date().toISOString();
  const id = uuidv4();
  await dbOps.run(
    "INSERT INTO commands (id, agent_id, type, payload_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'QUEUED', ?, ?)",
    [id, agentId, type, payload ? JSON.stringify(payload) : null, now, now]
  );
  return { id };
}

router.get("/", requireAdmin, async (req, res) => {
  const latestVersion = readVersion();
  const agents = await dbOps.all("SELECT * FROM agents ORDER BY created_at DESC");
  const enriched = await Promise.all(
    agents.map(async (agent) => {
      const pending = await getPendingCommand(agent.id);
      const isOutdated =
        Boolean(agent.agent_version) && agent.agent_version !== latestVersion;

      // Only expose the subset the dashboard uses in tables and tooltips.
      let osInfo = null;
      if (agent.last_info_json) {
        try {
          const info = JSON.parse(agent.last_info_json);
          if (info.os) {
            osInfo = {
              name: info.os.name || null,
              version: info.os.version || null,
              codename: info.os.codename || null
            };
          }
        } catch { /* ignore parse errors */ }
      }

      return {
        id: agent.id,
        displayName: agent.display_name,
        hostname: agent.last_hostname,
        ip: agent.last_ip,
        lastSeenAt: agent.last_seen_at,
        lastRunAt: agent.last_run_at,
        lastStatus: agent.last_status,
        lastExitCode: agent.last_exit_code,
        lastDurationSeconds: agent.last_duration_seconds,
        uptimeSeconds: agent.uptime_seconds,
        rebootRequired: agent.reboot_required === 1,
        agentVersion: agent.agent_version,
        isOutdated,
        isInternet: Boolean(agent.install_base_url),
        osInfo,
        schedule: {
          enabled: Boolean(agent.schedule_enabled),
          dailyTime: agent.schedule_daily_time
        },
        pendingCommand: pending
          ? {
              id: pending.id,
              type: pending.type,
              status: pending.status
            }
          : null,
        createdAt: agent.created_at
      };
    })
  );
  res.json({ ok: true, agents: enriched, latestVersion });
});

// Convenience action from the dashboard header.
router.post("/update-outdated", requireAdmin, async (req, res) => {
  const latestVersion = readVersion();
  const agents = await dbOps.all(
    "SELECT id, agent_version FROM agents WHERE agent_version IS NOT NULL AND agent_version != ?",
    [latestVersion]
  );
  const results = await Promise.all(
    agents.map(async (agent) => {
      const existing = await getPendingCommand(agent.id);
      if (existing) {
        return { id: agent.id, skipped: true };
      }
      const result = await createCommand(agent.id, "UPDATE_AGENT", null);
      return { id: agent.id, commandId: result.id, error: result.error || null };
    })
  );
  res.json({ ok: true, queued: results.filter((r) => r.commandId).length, results });
});

function sanitizeBaseUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Keep only the origin. Install scripts should never inherit an arbitrary path.
    return u.origin;
  } catch {
    return null;
  }
}

router.post("/", requireAdmin, async (req, res) => {
  const { displayName, baseUrl: rawBaseUrl } = req.body || {};
  const displayNameValue = String(displayName || "").trim();
  if (!displayNameValue) {
    res.status(400).json({ error: "Missing displayName" });
    return;
  }
  if (displayNameValue.length > 128 || /[\r\n\t\0]/.test(displayNameValue)) {
    res.status(400).json({ error: "Invalid displayName" });
    return;
  }

  let installBaseUrl = null;
  if (rawBaseUrl) {
    installBaseUrl = sanitizeBaseUrl(rawBaseUrl);
    if (!installBaseUrl) {
      res.status(400).json({ error: "Invalid baseUrl — must be a valid http/https URL" });
      return;
    }
  }

  const agentId = uuidv4();
  const installToken = generateToken(32);
  const agentApiToken = generateToken(32);
  const protectedInstallToken = protectToken(installToken);
  const protectedAgentApiToken = protectToken(agentApiToken);
  const now = new Date().toISOString();
  // Tokens are persisted as hash + encrypted value; plaintext leaves the server only once here.
  await dbOps.run(
    `INSERT INTO agents (
      id,
      display_name,
      install_token,
      agent_api_token,
      install_token_hash,
      install_token_enc,
      agent_api_token_hash,
      agent_api_token_enc,
      schedule_enabled,
      schedule_daily_time,
      install_base_url,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      agentId,
      displayNameValue,
      null,
      null,
      protectedInstallToken.hash,
      protectedInstallToken.encrypted,
      protectedAgentApiToken.hash,
      protectedAgentApiToken.encrypted,
      config.agentDefaultScheduleEnabled,
      config.agentDefaultDailyTime,
      installBaseUrl,
      now
    ]
  );

  const resolvedBase = installBaseUrl || (await resolveBaseUrl()).replace(/\/$/, "");
  const install = buildInstallCommands(resolvedBase, installToken);

  res.json({
    ok: true,
    agentId,
    installToken,
    installUrls: install.urls,
    installCommands: {
      linux: install.linux,
      macos: install.macos,
      windows: install.windows
    },
    installCommand: install.linux
  });
});

router.get("/:id", requireAdmin, async (req, res) => {
  const agent = await dbOps.get("SELECT * FROM agents WHERE id = ?", [req.params.id]);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const resolvedBase = agent.install_base_url
    ? agent.install_base_url.replace(/\/$/, "")
    : (await resolveBaseUrl()).replace(/\/$/, "");
  const installToken = await ensureInstallToken(agent);
  res.json({
    ok: true,
    agent: {
      id: agent.id,
      displayName: agent.display_name,
      hostname: agent.last_hostname,
      ip: agent.last_ip,
      lastSeenAt: agent.last_seen_at,
      lastRunAt: agent.last_run_at,
      lastStatus: agent.last_status,
      lastExitCode: agent.last_exit_code,
      lastDurationSeconds: agent.last_duration_seconds,
      uptimeSeconds: agent.uptime_seconds,
      rebootRequired: agent.reboot_required === 1,
      agentVersion: agent.agent_version,
      installBaseUrl: resolvedBase,
      schedule: {
        enabled: Boolean(agent.schedule_enabled),
        dailyTime: agent.schedule_daily_time
      },
      localWeb: {
        enabled: agent.local_web_enabled === 1,
        port: agent.local_web_port || 8180
      },
      createdAt: agent.created_at,
      lastInfoUpdatedAt: agent.last_info_updated_at
    },
    install: installToken ? buildInstallCommands(resolvedBase, installToken) : null,
    info: agent.last_info_json ? JSON.parse(agent.last_info_json) : null
  });
});

router.get("/:id/install", requireAdmin, async (req, res) => {
  const agent = await dbOps.get(
    "SELECT id, display_name, install_token, install_token_enc, install_token_hash, install_base_url FROM agents WHERE id = ?",
    [req.params.id]
  );
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const installToken = await ensureInstallToken(agent);
  if (!installToken) {
    res.status(500).json({ error: "Install token unavailable" });
    return;
  }
  const resolvedBase = agent.install_base_url
    ? agent.install_base_url.replace(/\/$/, "")
    : (await resolveBaseUrl()).replace(/\/$/, "");
  const install = buildInstallCommands(resolvedBase, installToken);
  res.json({
    ok: true,
    agentId: agent.id,
    displayName: agent.display_name,
    installToken,
    installUrls: install.urls,
    installCommands: {
      linux: install.linux,
      macos: install.macos,
      windows: install.windows
    },
    installCommand: install.linux
  });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  await dbOps.run("DELETE FROM commands WHERE agent_id = ?", [req.params.id]);
  await dbOps.run("DELETE FROM agents WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// The agent applies these settings on its next poll.
router.put("/:id/local-web", requireAdmin, async (req, res) => {
  const { enabled, port } = req.body || {};
  const allowedPorts = [8080, 8090, 8180, 8190];
  
  // Validate port
  const portValue = parseInt(port, 10);
  if (port !== undefined && !allowedPorts.includes(portValue)) {
    res.status(400).json({ 
      error: `Invalid port. Allowed ports: ${allowedPorts.join(', ')}` 
    });
    return;
  }
  
  const agent = await dbOps.get("SELECT id FROM agents WHERE id = ?", [req.params.id]);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  
  // Update the agent's local web settings
  await dbOps.run(
    "UPDATE agents SET local_web_enabled = ?, local_web_port = ? WHERE id = ?",
    [
      enabled ? 1 : 0,
      portValue || 8180,
      req.params.id
    ]
  );
  
  res.json({ 
    ok: true,
    localWeb: {
      enabled: Boolean(enabled),
      port: portValue || 8180
    }
  });
});

router.post("/:id/commands/run-now", requireAdmin, async (req, res) => {
  const result = await createCommand(req.params.id, "RUN_NOW", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/schedule", requireAdmin, async (req, res) => {
  const { enabled, dailyTime } = req.body || {};
  if (typeof enabled !== "boolean" || !dailyTime) {
    res.status(400).json({ error: "Missing schedule payload" });
    return;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(dailyTime))) {
    res.status(400).json({ error: "Invalid dailyTime format (HH:MM)" });
    return;
  }
  const result = await createCommand(req.params.id, "SET_SCHEDULE", {
    enabled,
    dailyTime: String(dailyTime)
  });
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/update-agent", requireAdmin, async (req, res) => {
  const result = await createCommand(req.params.id, "UPDATE_AGENT", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/info", requireAdmin, async (req, res) => {
  const result = await createCommand(req.params.id, "FETCH_INFO", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/uninstall", requireAdmin, async (req, res) => {
  const result = await createCommand(req.params.id, "UNINSTALL", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/logs", requireAdmin, async (req, res) => {
  const result = await createCommand(req.params.id, "LIST_LOGS", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/log-content", requireAdmin, async (req, res) => {
  const { logName } = req.body || {};
  if (!logName) {
    res.status(400).json({ error: "Missing logName" });
    return;
  }
  const result = await createCommand(req.params.id, "FETCH_LOG", { logName });
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/cancel", requireAdmin, async (req, res) => {
  const pending = await dbOps.get(
    "SELECT id FROM commands WHERE agent_id = ? AND status = 'QUEUED' ORDER BY created_at ASC LIMIT 1",
    [req.params.id]
  );
  if (!pending) {
    res.status(404).json({ error: "No queued command" });
    return;
  }
  const now = new Date().toISOString();
  await dbOps.run(
    "UPDATE commands SET status = 'ERROR', error_message = ?, updated_at = ? WHERE id = ?",
    ["Cancelled by admin", now, pending.id]
  );
  res.json({ ok: true });
});

router.get("/:id/commands/:commandId", requireAdmin, async (req, res) => {
  const command = await dbOps.get(
    "SELECT * FROM commands WHERE id = ? AND agent_id = ?",
    [req.params.commandId, req.params.id]
  );
  if (!command) {
    res.status(404).json({ error: "Command not found" });
    return;
  }
  res.json({
    ok: true,
    command: {
      id: command.id,
      type: command.type,
      status: command.status,
      result: command.result_json ? JSON.parse(command.result_json) : null,
      errorMessage: command.error_message,
      createdAt: command.created_at,
      updatedAt: command.updated_at
    }
  });
});

export default router;
