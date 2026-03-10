# Agent Architecture

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

### File layout

Installed paths on Linux:

- `/opt/agentautoupdate/app` (agent code)
- `/opt/agentautoupdate/venv` (Python virtualenv)
- `/opt/agentautoupdate/config.json` (agent config)
- `/opt/agentautoupdate/state.json` (last run state)
- `/opt/agentautoupdate/logs/` (log files)

### Services

The installer creates systemd units:

- `agentautoupdate.service` (poller, long running)
- `agentautoupdate-run.service` (one shot update)
- `agentautoupdate-run.timer` (daily schedule)

### Polling flow

1) Poller sends `/api/agent/poll` with status, schedule, uptime, reboot flag
2) Dashboard returns a command (or null)
3) Agent executes the command
4) Agent posts `/api/agent/command-result`

### Supported commands

- RUN_NOW
- SET_SCHEDULE
- SET_POLL_INTERVAL
- UPDATE_AGENT
- UNINSTALL
- LIST_LOGS
- FETCH_LOG
- FETCH_INFO

### Updates

Package manager detection:

- APT: update, full-upgrade, autoremove, autoclean
- DNF/YUM: makecache, upgrade, autoremove, clean all

### Agent update

The agent can update itself by downloading the bundle from:

```
/agent/latest.tar.gz
```

Then it swaps the app directory and restarts the poller.

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

### Arborescence

Chemins installes sur Linux :

- `/opt/agentautoupdate/app` (code agent)
- `/opt/agentautoupdate/venv` (virtualenv Python)
- `/opt/agentautoupdate/config.json` (config agent)
- `/opt/agentautoupdate/state.json` (etat dernier run)
- `/opt/agentautoupdate/logs/` (logs)

### Services

L installateur cree des units systemd :

- `agentautoupdate.service` (poller, long running)
- `agentautoupdate-run.service` (one shot update)
- `agentautoupdate-run.timer` (horaire quotidien)

### Flux de polling

1) Le poller envoie `/api/agent/poll`
2) Le dashboard renvoie une commande (ou null)
3) L agent execute la commande
4) L agent envoie `/api/agent/command-result`

### Commandes supportees

- RUN_NOW
- SET_SCHEDULE
- SET_POLL_INTERVAL
- UPDATE_AGENT
- UNINSTALL
- LIST_LOGS
- FETCH_LOG
- FETCH_INFO

### Mises a jour

Detection du gestionnaire :

- APT : update, full-upgrade, autoremove, autoclean
- DNF/YUM : makecache, upgrade, autoremove, clean all

### Update agent

L agent se met a jour en telechargeant :

```
/agent/latest.tar.gz
```

Puis il remplace le dossier app et redemarre le poller.
