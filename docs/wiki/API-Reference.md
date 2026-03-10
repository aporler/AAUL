# API Reference

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

Base URLs:

- HTTP: `http://HOST:HTTP_API_PORT`
- HTTPS: `https://HOST:HTTPS_API_PORT`

### Auth

- `POST /api/auth/login` { username, password }
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Users

- `GET /api/users`
- `POST /api/users` { username, password }
- `PUT /api/users/:id/password` { password }
- `DELETE /api/users/:id`

### Agents (admin)

- `GET /api/agents`
- `POST /api/agents` { displayName }
- `GET /api/agents/:id`
- `GET /api/agents/:id/install`
- `DELETE /api/agents/:id`

Commands (queue):

- `POST /api/agents/:id/commands/run-now`
- `POST /api/agents/:id/commands/schedule` { enabled, dailyTime }
- `POST /api/agents/:id/commands/update-agent`
- `POST /api/agents/:id/commands/info`
- `POST /api/agents/:id/commands/uninstall`
- `POST /api/agents/:id/commands/logs`
- `POST /api/agents/:id/commands/log-content` { logName }
- `POST /api/agents/:id/commands/cancel`
- `GET /api/agents/:id/commands/:commandId`

### Agent API (agent auth)

Bearer token required:

- `POST /api/agent/poll`
- `POST /api/agent/command-result`

### Settings and admin

- `GET /api/settings`
- `POST /api/settings`
- `GET /api/admin/network-ips`

### Plugins

- `GET /api/plugins`
- `POST /api/plugins/:name/enable`
- `POST /api/plugins/:name/disable`
- `POST /api/plugins/install` (upload .pg)
- `DELETE /api/plugins/:name`
- `GET /api/plugins/ui/:slot`
- `GET /api/plugins/:name`

### Installer and bundle

- `GET /install?token=...` (shell script)
- `GET /agent/version`
- `GET /agent/latest.tar.gz`

## Francais

Base URLs :

- HTTP : `http://HOST:HTTP_API_PORT`
- HTTPS : `https://HOST:HTTPS_API_PORT`

### Auth

- `POST /api/auth/login` { username, password }
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Utilisateurs

- `GET /api/users`
- `POST /api/users` { username, password }
- `PUT /api/users/:id/password` { password }
- `DELETE /api/users/:id`

### Agents (admin)

- `GET /api/agents`
- `POST /api/agents` { displayName }
- `GET /api/agents/:id`
- `GET /api/agents/:id/install`
- `DELETE /api/agents/:id`

Commandes (file d attente) :

- `POST /api/agents/:id/commands/run-now`
- `POST /api/agents/:id/commands/schedule` { enabled, dailyTime }
- `POST /api/agents/:id/commands/update-agent`
- `POST /api/agents/:id/commands/info`
- `POST /api/agents/:id/commands/uninstall`
- `POST /api/agents/:id/commands/logs`
- `POST /api/agents/:id/commands/log-content` { logName }
- `POST /api/agents/:id/commands/cancel`
- `GET /api/agents/:id/commands/:commandId`

### Agent API (auth agent)

Token bearer requis :

- `POST /api/agent/poll`
- `POST /api/agent/command-result`

### Parametres et admin

- `GET /api/settings`
- `POST /api/settings`
- `GET /api/admin/network-ips`

### Plugins

- `GET /api/plugins`
- `POST /api/plugins/:name/enable`
- `POST /api/plugins/:name/disable`
- `POST /api/plugins/install` (upload .pg)
- `DELETE /api/plugins/:name`
- `GET /api/plugins/ui/:slot`
- `GET /api/plugins/:name`

### Installateur et bundle

- `GET /install?token=...` (script shell)
- `GET /agent/version`
- `GET /agent/latest.tar.gz`
