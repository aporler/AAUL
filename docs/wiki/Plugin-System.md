# Plugin System

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

AAUL supports plugins located in:

```
dashboard/server/plugins/
```

### Plugin structure

Each plugin is a folder containing:

- `package.json`
- a `main` entry point (default export)

Example `package.json`:

```
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "aaul": {
    "displayName": "My Plugin",
    "category": "other",
    "permissions": ["agents:read"]
  }
}
```

### Plugin API

`onLoad(context)` is required. The context exposes:

- `app` (Express app)
- `db` (SQLite access)
- `config` (sanitized config)
- `registerRoute(path, options)`
- `registerHook(name, callback)`
- `registerUI(slot, component)`
- `log(level, message)`

Available hooks:

- agent:poll
- agent:registered
- agent:command:queued
- agent:command:complete
- agent:uninstalled
- server:start
- server:ready
- server:stop
- settings:changed

### Enable/disable plugins

Plugins can be managed via API:

- `GET /api/plugins` (list)
- `POST /api/plugins/:name/enable`
- `POST /api/plugins/:name/disable`
- `POST /api/plugins/install` (upload .pg)
- `DELETE /api/plugins/:name`

When a plugin is enabled/disabled/installed/removed, the server restarts.

### Plugin packages (.pg)

A `.pg` file is a zip containing the plugin folder. The upload API extracts
it into `dashboard/server/plugins/`.

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

AAUL supporte des plugins dans :

```
dashboard/server/plugins/
```

### Structure d un plugin

Chaque plugin contient :

- `package.json`
- un point d entree `main`

Exemple `package.json` :

```
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "aaul": {
    "displayName": "My Plugin",
    "category": "other",
    "permissions": ["agents:read"]
  }
}
```

### API plugin

`onLoad(context)` est obligatoire. Le context expose :

- `app` (Express app)
- `db` (acces SQLite)
- `config` (config nettoyee)
- `registerRoute(path, options)`
- `registerHook(name, callback)`
- `registerUI(slot, component)`
- `log(level, message)`

Hooks disponibles :

- agent:poll
- agent:registered
- agent:command:queued
- agent:command:complete
- agent:uninstalled
- server:start
- server:ready
- server:stop
- settings:changed

### Activer/desactiver

Gestion via API :

- `GET /api/plugins` (liste)
- `POST /api/plugins/:name/enable`
- `POST /api/plugins/:name/disable`
- `POST /api/plugins/install` (upload .pg)
- `DELETE /api/plugins/:name`

Le serveur redemarre apres activation/desactivation/install/suppression.

### Packages .pg

Un `.pg` est un zip contenant le dossier plugin. L API extrait dans
`dashboard/server/plugins/`.
