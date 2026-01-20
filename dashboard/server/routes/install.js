import express from "express";
import config from "../config.js";
import { dbOps } from "../db/index.js";
import { resolveBaseUrl } from "../utils/base-url.js";
import { getSetting } from "../utils/settings.js";

const router = express.Router();

function isHttps(req) {
  if (req.secure) {
    return true;
  }
  const proto = req.headers["x-forwarded-proto"];
  return proto === "https";
}

router.get("/", async (req, res) => {
  const { token } = req.query || {};
  if (!token) {
    res.status(404).send("Not found");
    return;
  }
  if (!config.allowHttpInstall && !isHttps(req)) {
    res.status(403).send("HTTPS required");
    return;
  }
  const agent = await dbOps.get(
    "SELECT * FROM agents WHERE install_token = ?",
    [token]
  );
  if (!agent) {
    res.status(404).send("Not found");
    return;
  }
  const baseUrl = (await resolveBaseUrl()).replace(/\/$/, "");
  const scheduleEnabled = agent.schedule_enabled ? 1 : 0;
  const scheduleTime = agent.schedule_daily_time || "03:00";
  const defaultPoll = await getSetting("defaultPollSeconds");
  const pollSeconds = defaultPoll || config.agentDefaultPollSeconds;

  const safeDisplayName = agent.display_name
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r?\n/g, " ");

  const script = `#!/bin/sh
set -euo pipefail

DASHBOARD_URL="${baseUrl}"
AGENT_ID="${agent.id}"
DISPLAY_NAME="${safeDisplayName}"
AGENT_API_TOKEN="${agent.agent_api_token}"
POLL_SECONDS="${pollSeconds}"
SCHEDULE_ENABLED="${scheduleEnabled}"
SCHEDULE_TIME="${scheduleTime}"

INSTALL_DIR="/opt/agentautoupdate"
APP_DIR="$INSTALL_DIR/app"
LOG_DIR="$INSTALL_DIR/logs"
VENV_DIR="$INSTALL_DIR/venv"
TMP_BUNDLE="/tmp/agentautoupdate-latest.tar.gz"

CURL_TLS=""
if echo "$DASHBOARD_URL" | grep -q '^https://'; then
  CURL_TLS="-k"
fi

mkdir -p "$INSTALL_DIR" "$LOG_DIR"

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y python3 python3-venv python3-pip curl
elif command -v dnf >/dev/null 2>&1; then
  if ! dnf -y install python3 python3-pip python3-virtualenv curl; then
    dnf -y install python3 python3-pip curl
  fi
elif command -v yum >/dev/null 2>&1; then
  if ! yum -y install python3 python3-pip python3-virtualenv curl; then
    yum -y install python3 python3-pip curl
  fi
else
  echo "Unsupported distribution: apt-get or dnf required." >&2
  exit 1
fi

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip

curl $CURL_TLS -fsSL "$DASHBOARD_URL/agent/latest.tar.gz" -o "$TMP_BUNDLE"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
tar -xzf "$TMP_BUNDLE" -C "$APP_DIR"

"$VENV_DIR/bin/pip" install -r "$APP_DIR/requirements.txt"

cat > "$INSTALL_DIR/config.json" <<JSON
{
  "agentId": "$AGENT_ID",
  "displayName": "$DISPLAY_NAME",
  "dashboardUrl": "$DASHBOARD_URL",
  "agentApiToken": "$AGENT_API_TOKEN",
  "pollIntervalSeconds": $POLL_SECONDS,
  "schedule": {
    "enabled": ${scheduleEnabled},
    "dailyTime": "$SCHEDULE_TIME"
  }
}
JSON

cat > /usr/local/bin/agentautoupdate <<'EOF'
#!/bin/sh
exec /opt/agentautoupdate/venv/bin/python /opt/agentautoupdate/app/agent_cli.py "$@"
EOF
chmod +x /usr/local/bin/agentautoupdate

cat > /etc/systemd/system/agentautoupdate.service <<'EOF'
[Unit]
Description=Agent Auto Update Poller
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/agentautoupdate
ExecStart=/opt/agentautoupdate/venv/bin/python /opt/agentautoupdate/app/agent_poller.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/agentautoupdate-run.service <<'EOF'
[Unit]
Description=Agent Auto Update Runner
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=/opt/agentautoupdate
ExecStart=/opt/agentautoupdate/venv/bin/python /opt/agentautoupdate/app/agent_runner.py --run-once
Environment=PYTHONUNBUFFERED=1
EOF

cat > /etc/systemd/system/agentautoupdate-run.timer <<EOF
[Unit]
Description=Agent Auto Update Schedule

[Timer]
OnCalendar=*-*-* ${scheduleTime}:00
Persistent=true
Unit=agentautoupdate-run.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now agentautoupdate.service

if [ "$SCHEDULE_ENABLED" = "1" ]; then
  systemctl enable --now agentautoupdate-run.timer
else
  systemctl disable --now agentautoupdate-run.timer || true
fi

"$VENV_DIR/bin/python" "$APP_DIR/agent_poller.py" --once || true

echo "Agent installed."
`;

  res.setHeader("Content-Type", "text/x-sh");
  res.send(script);
});

export default router;
