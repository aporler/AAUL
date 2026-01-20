# Agent Auto Update Linux

Full stack dashboard + Linux agent for automated APT/DNF updates. The agent never opens a local port and only polls the dashboard for commands.

## Features

- **Dashboard**: React + Express web interface for managing agents
- **Agent**: Python service for executing updates on Linux hosts
- **Secure Communication**: HTTPS/TLS support with certificate validation
- **Plugin System**: Extend functionality with community or professional plugins
- **Local Agent Web UI**: Optional web interface for direct agent management

## Structure

```
agent/
  app/                 # Python agent code + systemd templates
  scripts/
dashboard/
  client/              # React (Vite) UI
  server/              # Express API
  public/agent/        # Agent bundle output (latest.tar.gz)
  config/config.json
README.md
```

## Requirements

- Node.js 18+
- Python 3 on supported distros (Ubuntu, Debian, Mint, Fedora, AlmaLinux, Rocky Linux, Red Hat)
- systemd

## Development (2 terminals)

Terminal 1 (API):

```bash
cd dashboard
npm install
npm run dev:server
```

Terminal 2 (UI):

```bash
cd dashboard/client
npm install
npm run dev
```

Or run both together:

```bash
cd dashboard
npm run dev:all
```

Generate the agent bundle so `/install` can download it:

```bash
bash dashboard/scripts/build-agent-bundle.sh
```

Then open `http://localhost:5173`.

Default credentials: `admin / admin`

## Production

1) Build the UI:

```bash
cd dashboard/client
npm install
npm run build
```

2) Build the agent bundle:

```bash
bash dashboard/scripts/build-agent-bundle.sh
```

3) Start the server:

```bash
cd dashboard
npm install
npm run start
```

The Express server serves `dashboard/client/dist` when `NODE_ENV=production`.

## Dashboard configuration

Edit `dashboard/config/config.json` or override with `dashboard/.env`.

Important fields:
- `baseUrl`: used to generate the curl install command.
- `allowHttpInstall`: set `false` to require HTTPS for `/install`.
- `agentDefaultPollSeconds`: agent poll interval.

### HTTPS/SSL Configuration

Enable HTTPS by setting SSL options in config.json:

```json
{
  "ssl": {
    "enabled": true,
    "keyPath": "./ssl/server.key",
    "certPath": "./ssl/server.crt",
    "caPath": "./ssl/ca.crt",
    "httpsPort": 443,
    "redirectHttp": true
  }
}
```

Or via environment variables:

```bash
SSL_ENABLED=true
SSL_KEY_PATH=./server/ssl/server.key
SSL_CERT_PATH=./server/ssl/server.crt
SSL_HTTPS_PORT=443
```

Generate a self-signed certificate for testing:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout dashboard/server/ssl/server.key \
  -out dashboard/server/ssl/server.crt \
  -subj "/C=CA/ST=Quebec/L=Montreal/O=AutoUpdateLinux/CN=localhost"
```

For production, use Let's Encrypt or commercial certificates.

## Plugin System

Extend the dashboard with custom functionality:

1. Create a plugin directory: `dashboard/server/plugins/my-plugin/`
2. Add `package.json` with plugin metadata
3. Create `index.js` with lifecycle hooks
4. Enable from the dashboard Plugins page

See `dashboard/server/plugins/README.md` for full documentation.

Example plugin structure:

```javascript
export default {
  name: 'my-plugin',
  async onLoad(context) {
    context.registerRoute('/api/my-plugin/status', {
      method: 'GET',
      handler: (req, res) => res.json({ ok: true })
    });
    
    context.registerHook('agent:poll', async (agent) => {
      console.log('Agent polled:', agent.id);
    });
  }
};
```

## Agent Local Web Interface

Enable a local web interface on agents for direct management:

1. Enable in dashboard Admin settings
2. Choose port (8080, 8090, 8180, or 8190)
3. Reinstall or update agents to apply

Access at: `http://AGENT_IP:PORT`

Default credentials: `agent / agent`

## Add an agent

In the UI: **Add Agent** -> enter display name -> copy the one-liner:

```bash
curl -fsSL http://IP_DASHBOARD:PORT/install?token=YOUR_TOKEN | sudo sh
```

The script installs:
- `/opt/agentautoupdate` (app + venv + logs)
- systemd units
- `/usr/local/bin/agentautoupdate` CLI

## CLI on agent

```bash
agentautoupdate --help
agentautoupdate -version
agentautoupdate -action update
agentautoupdate -action updateagent
agentautoupdate -action showlog
agentautoupdate -action uninstall --yes
```

## Commands & polling

The agent polls every `pollIntervalSeconds`:
- POST `/api/agent/poll` (state check-in)
- Receives an optional command
- POST `/api/agent/command-result` after execution

Supported commands:
- RUN_NOW
- SET_SCHEDULE
- UPDATE_AGENT
- UNINSTALL

## Security

- All agent-dashboard communication supports TLS encryption
- Agent tokens use Bearer authentication
- Optional request signing with HMAC-SHA256
- Certificate pinning support for enhanced security

## Logs

- Full logs: `/opt/agentautoupdate/logs/agent-YYYY-MM-DD.log`
- State JSON: `/opt/agentautoupdate/state.json`

## Ports

- Dashboard API: `3001` (configurable)
- HTTPS: `443` (when SSL enabled)
- Vite dev server: `5173`
- Agent Local Web: `8080/8090/8180/8190` (optional)

## Contributing

This project is open source. We welcome contributions!

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

See code comments for documentation aimed at contributors.

## License

MIT

## Screenshot

### Login
<img width="676" height="565" alt="image" src="https://github.com/user-attachments/assets/04c92713-c0cc-4df2-996b-ebd487bb5fcf" />

### Dashboard:
<img width="1636" height="965" alt="image" src="https://github.com/user-attachments/assets/67f82266-0652-4e9c-a70f-3a19b7b79bb3" />

### Detail Agent
<img width="1297" height="965" alt="image" src="https://github.com/user-attachments/assets/56574ead-46dc-45c9-a877-a65ceb51d85c" />


