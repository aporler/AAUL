# Agent Auto Update Linux

Agent Auto Update Linux, or `AAUL`, is a small fleet management project built around two parts:

- `dashboard/`: the server-side dashboard and API used by administrators
- `agent/`: the client-side agent installed on managed machines

The original project name says "Linux", but the current codebase also supports macOS and Windows for agent installation and update flows.

## What the project does

AAUL lets you register a machine in the dashboard, generate a one-time installer URL, and let the agent poll the dashboard for work.

The dashboard can:

- register agents and generate installation commands
- queue commands such as `RUN_NOW`, `SET_SCHEDULE`, `UPDATE_AGENT`, `UNINSTALL`
- display machine state, package information, logs, and last-seen activity
- build and serve the latest agent bundle used for agent self-update

The agent can:

- install on Debian/Ubuntu, Fedora/RHEL, Arch Linux, macOS, and Windows 11
- report local system information back to the dashboard
- apply operating system updates using the native package manager
- update itself from the bundle exposed by the dashboard
- run as a background service on each supported platform

## Repository layout

```text
agent/
  app/                    Python agent runtime
  systemd/                Linux service templates

dashboard/
  client/                 React + Vite frontend
  server/                 Express API and server-side logic
  public/agent/           Built agent bundle served to clients
  config/config.json      Static dashboard configuration

docs/
  ARCHITECTURE.md         High-level codebase tour
  SECURITY_AUDIT.md       Security notes and historical findings

install.sh                Production installer / updater for the dashboard
AAUL                      Local wrapper for the dashboard CLI during development
```

## How it works

1. An administrator creates an agent entry from the dashboard.
2. The dashboard stores an install token and an agent API token.
3. The generated `/install?token=...` URL returns a platform-specific installer script.
4. The installer downloads the latest agent bundle from `/agent/latest.tar.gz`.
5. The installed agent polls `/api/agent/poll` and executes queued commands.
6. The agent reports results to `/api/agent/command-result`.

The agent never needs inbound access from the dashboard. The communication model is poll-based.

## Supported platforms

Agent package updates are implemented for:

- Debian and derivatives through `apt`
- Fedora / RHEL families through `dnf` or `yum`
- Arch Linux and derivatives through `pacman`
- macOS through `softwareupdate`, plus Homebrew when present
- Windows 11 through `winget` and Windows Update APIs

Service management is implemented through:

- `systemd` on Linux
- `launchd` on macOS
- Task Scheduler on Windows

## Development

Install dashboard dependencies:

```bash
cd dashboard
npm install
npm --prefix client install
```

Run the server:

```bash
cd dashboard
npm run dev:server
```

Run the frontend:

```bash
cd dashboard
npm run dev:client
```

Or run both:

```bash
cd dashboard
npm run dev:all
```

Build the agent bundle used by `/install` and agent self-update:

```bash
bash dashboard/scripts/build-agent-bundle.sh
```

## Production install / update

The intended production entrypoint is `install.sh`.

Fresh install or upgrade:

```bash
sudo ./install.sh
```

The installer:

- copies the project to `/opt/AAUL`
- preserves runtime data during upgrades
- installs Node.js dependencies
- builds the frontend
- builds the agent bundle
- installs the `agentautoupdate-dashboard` systemd service
- installs the local `AAUL` CLI on the host

## Dashboard CLI

After a production install, the host gets an `AAUL` command for local administration.

Examples:

```bash
AAUL -status
AAUL -version
AAUL -reset-admin
AAUL -agent -list
AAUL -agent -update <AGENT_ID>
AAUL -agent -remove <AGENT_ID>
```

## Documentation

Current entry points:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

The older `docs/wiki/` pages were removed from this public tree because they no longer matched the current codebase.

## Notes for contributors

This repository is meant to stay readable by contributors who are new to the project.

The code should prefer:

- explicit names over short names
- small helpers over repeated inline logic
- comments that explain intent, not syntax
- platform-specific code that is isolated instead of hidden in conditionals everywhere

See [CONTRIBUTING.md](CONTRIBUTING.md) for the maintainer-facing conventions used in this repository.

## Links

- GitHub: [github.com/aporler/AAUL](https://github.com/aporler/AAUL)
- Project page: [aaul.auxinux.ca](https://aaul.auxinux.ca)
- Auxinux wiki: [auxinux.ca/projets/projet-aaul](https://auxinux.ca/projets/projet-aaul)

## License

MIT — Copyright (c) 2026 André Porlier — Projet Auxinux
