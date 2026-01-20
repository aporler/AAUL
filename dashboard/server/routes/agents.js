import express from "express";
import { v4 as uuidv4 } from "uuid";
import { dbOps } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { generateToken } from "../utils/tokens.js";
import config from "../config.js";
import { resolveBaseUrl } from "../utils/base-url.js";

const router = express.Router();

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

router.get("/", requireAuth, async (req, res) => {
  const agents = await dbOps.all("SELECT * FROM agents ORDER BY created_at DESC");
  const enriched = await Promise.all(
    agents.map(async (agent) => {
      const pending = await getPendingCommand(agent.id);
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
  res.json({ ok: true, agents: enriched });
});

router.post("/", requireAuth, async (req, res) => {
  const { displayName } = req.body || {};
  if (!displayName) {
    res.status(400).json({ error: "Missing displayName" });
    return;
  }
  const agentId = uuidv4();
  const installToken = generateToken(32);
  const agentApiToken = generateToken(32);
  const now = new Date().toISOString();
  await dbOps.run(
    `INSERT INTO agents (
      id,
      display_name,
      install_token,
      agent_api_token,
      schedule_enabled,
      schedule_daily_time,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)` ,
    [
      agentId,
      displayName,
      installToken,
      agentApiToken,
      config.agentDefaultScheduleEnabled,
      config.agentDefaultDailyTime,
      now
    ]
  );

  const baseUrl = (await resolveBaseUrl()).replace(/\/$/, "");
  const curlFlags = baseUrl.startsWith("https://") ? "-k -fsSL" : "-fsSL";
  const installCommand = `curl ${curlFlags} ${baseUrl}/install?token=${installToken} | sudo sh`;

  res.json({
    ok: true,
    agentId,
    installToken,
    installCommand
  });
});

router.get("/:id", requireAuth, async (req, res) => {
  const agent = await dbOps.get("SELECT * FROM agents WHERE id = ?", [req.params.id]);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
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
    info: agent.last_info_json ? JSON.parse(agent.last_info_json) : null
  });
});

router.get("/:id/install", requireAuth, async (req, res) => {
  const agent = await dbOps.get(
    "SELECT id, display_name, install_token FROM agents WHERE id = ?",
    [req.params.id]
  );
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const baseUrl = (await resolveBaseUrl()).replace(/\/$/, "");
  const curlFlags = baseUrl.startsWith("https://") ? "-k -fsSL" : "-fsSL";
  const installCommand = `curl ${curlFlags} ${baseUrl}/install?token=${agent.install_token} | sudo sh`;
  res.json({
    ok: true,
    agentId: agent.id,
    displayName: agent.display_name,
    installToken: agent.install_token,
    installCommand
  });
});

router.delete("/:id", requireAuth, async (req, res) => {
  await dbOps.run("DELETE FROM commands WHERE agent_id = ?", [req.params.id]);
  await dbOps.run("DELETE FROM agents WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Update local web interface settings for an agent
router.put("/:id/local-web", requireAuth, async (req, res) => {
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

router.post("/:id/commands/run-now", requireAuth, async (req, res) => {
  const result = await createCommand(req.params.id, "RUN_NOW", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/schedule", requireAuth, async (req, res) => {
  const { enabled, dailyTime } = req.body || {};
  if (typeof enabled !== "boolean" || !dailyTime) {
    res.status(400).json({ error: "Missing schedule payload" });
    return;
  }
  const result = await createCommand(req.params.id, "SET_SCHEDULE", {
    enabled,
    dailyTime
  });
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/update-agent", requireAuth, async (req, res) => {
  const result = await createCommand(req.params.id, "UPDATE_AGENT", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/info", requireAuth, async (req, res) => {
  const result = await createCommand(req.params.id, "FETCH_INFO", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/uninstall", requireAuth, async (req, res) => {
  const result = await createCommand(req.params.id, "UNINSTALL", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/logs", requireAuth, async (req, res) => {
  const result = await createCommand(req.params.id, "LIST_LOGS", null);
  if (result.error) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true, commandId: result.id });
});

router.post("/:id/commands/log-content", requireAuth, async (req, res) => {
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

router.post("/:id/commands/cancel", requireAuth, async (req, res) => {
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

router.get("/:id/commands/:commandId", requireAuth, async (req, res) => {
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
