# AAUL Wiki

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

AAUL (Agent Auto Update Linux) is a full stack system for managing Linux updates
at scale. It is composed of:

- Dashboard: React UI + Express API + SQLite storage
- Agent: Python service installed on Linux machines

The agent never opens a local port. It only polls the dashboard for commands,
executes them, and reports the result.

Quick links:

- [Installation](Installation)
- [Configuration](Configuration)
- [Dashboard Usage](Dashboard-Usage)
- [Agent CLI](Agent-CLI)
- [Agent Architecture](Agent-Architecture)
- [Security and TLS](Security-and-TLS)
- [Plugin System](Plugin-System)
- [API Reference](API-Reference)
- [Troubleshooting](Troubleshooting)
- [Build and Release](Build-and-Release)

Quick start (development):

1) Run the installer script
2) Open the UI
3) Add an agent and install it on a Linux host

Example:

```
chmod +x install.sh
./install.sh
```

Then open `http://localhost:5173`.

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

AAUL (Agent Auto Update Linux) est un systeme complet pour gerer les mises a
jour Linux a grande echelle. Il est compose de :

- Dashboard : UI React + API Express + stockage SQLite
- Agent : service Python installe sur les machines Linux

L agent n ouvre pas de port local. Il interroge le dashboard, execute les
commandes, puis renvoie les resultats.

Liens rapides :

- [Installation](Installation)
- [Configuration](Configuration)
- [Utilisation du dashboard](Dashboard-Usage)
- [CLI de l agent](Agent-CLI)
- [Architecture de l agent](Agent-Architecture)
- [Securite et TLS](Security-and-TLS)
- [Systeme de plugins](Plugin-System)
- [Reference API](API-Reference)
- [Depannage](Troubleshooting)
- [Build et release](Build-and-Release)

Demarrage rapide (developpement) :

1) Lancer le script d installation
2) Ouvrir l interface web
3) Ajouter un agent et l installer sur un hote Linux

Exemple :

```
chmod +x install.sh
./install.sh
```

Puis ouvrir `http://localhost:5173`.
