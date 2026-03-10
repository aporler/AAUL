# Agent CLI

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

The agent installs a CLI at `/usr/local/bin/agentautoupdate`.

Show help:

```
agentautoupdate --help
```

Show agent version:

```
agentautoupdate version
```

Show local status:

```
agentautoupdate status
```

Run updates now:

```
sudo agentautoupdate update
```

Update the agent itself (downloads latest bundle from the dashboard):

```
sudo agentautoupdate update-agent
```

Show latest log file:

```
agentautoupdate logs
agentautoupdate logs --tail 100
```

Uninstall the agent:

```
sudo agentautoupdate uninstall --yes
```

Change the dashboard address (requires confirmation):

```
sudo agentautoupdate config set-dashboard 10.0.0.5
sudo agentautoupdate config set-dashboard 10.0.0.5:3001
sudo agentautoupdate config set-dashboard https://dashboard.example.com:3001
```

Skip confirmation with `--yes`.

The legacy flags (`-action`, `-config`, `-newaddr`, `-version`) remain accepted for compatibility.

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

L agent installe un CLI dans `/usr/local/bin/agentautoupdate`.

Aide :

```
agentautoupdate --help
```

Version agent :

```
agentautoupdate version
```

Statut local :

```
agentautoupdate status
```

Executer une mise a jour maintenant :

```
sudo agentautoupdate update
```

Mettre a jour l agent (telecharge le dernier bundle) :

```
sudo agentautoupdate update-agent
```

Afficher le dernier log :

```
agentautoupdate logs
agentautoupdate logs --tail 100
```

Desinstaller :

```
sudo agentautoupdate uninstall --yes
```

Changer l adresse du dashboard (avec confirmation) :

```
sudo agentautoupdate config set-dashboard 10.0.0.5
sudo agentautoupdate config set-dashboard 10.0.0.5:3001
sudo agentautoupdate config set-dashboard https://dashboard.example.com:3001
```

Utilisez `--yes` pour sauter la confirmation.
Les anciens flags (`-action`, `-config`, `-newaddr`, `-version`) restent acceptes pour compatibilite.
