import express from "express";
import { v4 as uuidv4 } from "uuid";
import { dbOps } from "../db/index.js";
import { requireAgentAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/poll", requireAgentAuth, async (req, res) => {
  const body = req.body || {};
  if (!body.agentId || body.agentId !== req.agent.id) {
    res.status(401).json({ error: "Invalid agent" });
    return;
  }
  const now = new Date().toISOString();
  const schedule = body.schedule || {};
  const uptimeSeconds = Number.parseInt(body.uptimeSeconds, 10);
  const uptimeValue = Number.isFinite(uptimeSeconds) ? uptimeSeconds : null;
  const rebootRequired =
    typeof body.rebootRequired === "boolean" ? (body.rebootRequired ? 1 : 0) : null;
  await dbOps.run(
    `UPDATE agents SET
      last_hostname = ?,
      last_ip = ?,
      last_seen_at = ?,
      last_run_at = ?,
      last_status = ?,
      last_exit_code = ?,
      last_duration_seconds = ?,
      schedule_enabled = ?,
      schedule_daily_time = ?,
      agent_version = ?,
      uptime_seconds = ?,
      reboot_required = ?
     WHERE id = ?`,
    [
      body.hostname || null,
      body.ip || null,
      body.lastSeenAt || now,
      body.lastRunAt || null,
      body.lastStatus || null,
      body.lastExitCode ?? null,
      body.lastDurationSeconds ?? null,
      schedule.enabled ? 1 : 0,
      schedule.dailyTime || null,
      body.agentVersion || null,
      uptimeValue,
      rebootRequired,
      req.agent.id
    ]
  );

  const skipCommand = req.headers["x-skip-command"] === "true";
  if (skipCommand) {
    res.json({ ok: true, command: null });
    return;
  }

  // Get agent's local web settings
  const agentSettings = await dbOps.get(
    "SELECT local_web_enabled, local_web_port FROM agents WHERE id = ?",
    [req.agent.id]
  );
  const localWebConfig = {
    enabled: agentSettings?.local_web_enabled === 1,
    port: agentSettings?.local_web_port || 8180
  };

  const inProgress = await dbOps.get(
    "SELECT id, type FROM commands WHERE agent_id = ? AND status = 'IN_PROGRESS' ORDER BY updated_at DESC LIMIT 1",
    [req.agent.id]
  );
  if (inProgress) {
    const updatedAt = new Date().toISOString();
    await dbOps.run(
      "UPDATE commands SET status = 'ERROR', error_message = ?, updated_at = ? WHERE id = ?",
      ["Agent reconnected before command completed", updatedAt, inProgress.id]
    );
  }

  const queued = await dbOps.get(
    "SELECT * FROM commands WHERE agent_id = ? AND status = 'QUEUED' ORDER BY created_at ASC LIMIT 1",
    [req.agent.id]
  );
  if (!queued) {
    const pendingPoll = Number.parseInt(req.agent.pending_poll_interval_seconds, 10);
    if (Number.isFinite(pendingPoll) && pendingPoll > 0) {
      const commandId = uuidv4();
      const payload = { pollIntervalSeconds: pendingPoll };
      await dbOps.run(
        "INSERT INTO commands (id, agent_id, type, payload_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?)",
        [
          commandId,
          req.agent.id,
          "SET_POLL_INTERVAL",
          JSON.stringify(payload),
          now,
          now
        ]
      );
      await dbOps.run(
        "UPDATE agents SET pending_poll_interval_seconds = NULL WHERE id = ?",
        [req.agent.id]
      );
      res.json({
        ok: true,
        localWeb: localWebConfig,
        command: {
          id: commandId,
          type: "SET_POLL_INTERVAL",
          payload
        }
      });
      return;
    }
    res.json({ ok: true, command: null, localWeb: localWebConfig });
    return;
  }

  const updatedAt = new Date().toISOString();
  await dbOps.run(
    "UPDATE commands SET status = 'IN_PROGRESS', updated_at = ? WHERE id = ?",
    [updatedAt, queued.id]
  );

  res.json({
    ok: true,
    localWeb: localWebConfig,
    command: {
      id: queued.id,
      type: queued.type,
      payload: queued.payload_json ? JSON.parse(queued.payload_json) : null
    }
  });
});

router.post("/command-result", requireAgentAuth, async (req, res) => {
  const body = req.body || {};
  if (!body.agentId || body.agentId !== req.agent.id) {
    res.status(401).json({ error: "Invalid agent" });
    return;
  }
  if (!body.commandId) {
    res.status(400).json({ error: "Missing commandId" });
    return;
  }
  const command = await dbOps.get(
    "SELECT id, type FROM commands WHERE id = ? AND agent_id = ?",
    [body.commandId, req.agent.id]
  );
  if (!command) {
    res.status(404).json({ error: "Command not found" });
    return;
  }
  const now = new Date().toISOString();
  const finalStatus = body.status || "DONE";
  await dbOps.run(
    "UPDATE commands SET status = ?, result_json = ?, error_message = ?, updated_at = ? WHERE id = ? AND agent_id = ?",
    [
      finalStatus,
      body.result ? JSON.stringify(body.result) : null,
      body.errorMessage || null,
      now,
      body.commandId,
      req.agent.id
    ]
  );
  if (command.type === "FETCH_INFO" && finalStatus !== "ERROR" && body.result) {
    await dbOps.run(
      "UPDATE agents SET last_info_json = ?, last_info_updated_at = ? WHERE id = ?",
      [JSON.stringify(body.result), now, req.agent.id]
    );
  }
  if (command.type === "UPDATE_AGENT" && finalStatus !== "ERROR") {
    const newVersion = body.result?.version || null;
    if (newVersion) {
      await dbOps.run("UPDATE agents SET agent_version = ? WHERE id = ?", [
        newVersion,
        req.agent.id
      ]);
    }
  }
  if (command.type === "UNINSTALL" && finalStatus !== "ERROR") {
    await dbOps.run("DELETE FROM commands WHERE agent_id = ?", [req.agent.id]);
    await dbOps.run("DELETE FROM agents WHERE id = ?", [req.agent.id]);
  }
  res.json({ ok: true });
});

export default router;
