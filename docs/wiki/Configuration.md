# Configuration

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

The dashboard loads configuration from:

- `dashboard/config/config.json`
- `dashboard/.env` (overrides config.json)

The dashboard UI stores some settings in the SQLite `settings` table
(editable from the Admin page).

### Core settings (config.json / .env)

| Key | Description | Default |
| --- | --- | --- |
| host | Bind address for HTTP/HTTPS | 0.0.0.0 |
| dbPath | SQLite file path | ./dashboard.sqlite |
| sessionSecret | Session secret for cookies | change-me |
| allowHttpInstall | Allow `http://` installs | true |
| agentDefaultPollSeconds | Agent poll interval (seconds) | 15 |
| agentDefaultScheduleEnabled | Default schedule state | 0 |
| agentDefaultDailyTime | Default schedule time | 03:00 |
| logLevel | Logging level | info |

HTTP/HTTPS settings:

| Key | Description | Default |
| --- | --- | --- |
| http.enabled | Enable HTTP API | true |
| http.apiPort | HTTP API port | 3001 |
| http.webPort | UI dev port (reference) | 5173 |
| https.enabled | Enable HTTPS API | false |
| https.apiPort | HTTPS API port | 3002 |
| https.webPort | UI dev port (reference) | 5174 |
| https.keyPath | SSL key file | ./ssl/server.key |
| https.certPath | SSL cert file | ./ssl/server.crt |
| https.caPath | CA bundle | "" |
| defaultApiProtocol | Default protocol for agents | http |

### Environment variable overrides

Common variables:

```
HOST=0.0.0.0
DB_PATH=./dashboard.sqlite
SESSION_SECRET=change-me
ALLOW_HTTP_INSTALL=true
AGENT_DEFAULT_POLL_SECONDS=15
AGENT_DEFAULT_SCHEDULE_ENABLED=0
AGENT_DEFAULT_DAILY_TIME=03:00
LOG_LEVEL=info
```

HTTP/HTTPS variables:

```
HTTP_ENABLED=true
HTTP_API_PORT=3001
HTTP_WEB_PORT=5173

HTTPS_ENABLED=false
HTTPS_API_PORT=3002
HTTPS_WEB_PORT=5174
HTTPS_KEY_PATH=./ssl/server.key
HTTPS_CERT_PATH=./ssl/server.crt
HTTPS_CA_PATH=

DEFAULT_API_PROTOCOL=http
```

### Admin settings (UI)

The Admin page stores values in the `settings` table:

- baseUrl (used to build the install command)
- apiPort / clientPort / publicIp (UI helpers)
- defaultPollSeconds (if changed, agents are queued to update their poll)

### Agent config (on client machines)

The agent writes a config file at:

```
/opt/agentautoupdate/config.json
```

It includes:

- agentId, displayName
- dashboardUrl
- agentApiToken
- pollIntervalSeconds
- schedule { enabled, dailyTime }

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

Le dashboard charge la configuration depuis :

- `dashboard/config/config.json`
- `dashboard/.env` (ecrase config.json)

Le dashboard stocke aussi des valeurs dans la table SQLite `settings`
modifiables via la page Admin.

### Parametres principaux (config.json / .env)

| Cle | Description | Defaut |
| --- | --- | --- |
| host | Adresse d ecoute HTTP/HTTPS | 0.0.0.0 |
| dbPath | Fichier SQLite | ./dashboard.sqlite |
| sessionSecret | Secret de session | change-me |
| allowHttpInstall | Autoriser les installs http | true |
| agentDefaultPollSeconds | Intervalle de poll (secondes) | 15 |
| agentDefaultScheduleEnabled | Etat horaire par defaut | 0 |
| agentDefaultDailyTime | Heure par defaut | 03:00 |
| logLevel | Niveau de logs | info |

Parametres HTTP/HTTPS :

| Cle | Description | Defaut |
| --- | --- | --- |
| http.enabled | Activer l API HTTP | true |
| http.apiPort | Port API HTTP | 3001 |
| http.webPort | Port UI dev (reference) | 5173 |
| https.enabled | Activer l API HTTPS | false |
| https.apiPort | Port API HTTPS | 3002 |
| https.webPort | Port UI dev (reference) | 5174 |
| https.keyPath | Chemin cle SSL | ./ssl/server.key |
| https.certPath | Chemin cert SSL | ./ssl/server.crt |
| https.caPath | Bundle CA | "" |
| defaultApiProtocol | Protocole par defaut | http |

### Variables d environnement

Variables communes :

```
HOST=0.0.0.0
DB_PATH=./dashboard.sqlite
SESSION_SECRET=change-me
ALLOW_HTTP_INSTALL=true
AGENT_DEFAULT_POLL_SECONDS=15
AGENT_DEFAULT_SCHEDULE_ENABLED=0
AGENT_DEFAULT_DAILY_TIME=03:00
LOG_LEVEL=info
```

Variables HTTP/HTTPS :

```
HTTP_ENABLED=true
HTTP_API_PORT=3001
HTTP_WEB_PORT=5173

HTTPS_ENABLED=false
HTTPS_API_PORT=3002
HTTPS_WEB_PORT=5174
HTTPS_KEY_PATH=./ssl/server.key
HTTPS_CERT_PATH=./ssl/server.crt
HTTPS_CA_PATH=

DEFAULT_API_PROTOCOL=http
```

### Parametres Admin (UI)

La page Admin stocke :

- baseUrl (pour generer la commande d install)
- apiPort / clientPort / publicIp (aide UI)
- defaultPollSeconds (si modifie, les agents sont mis a jour)

### Config agent (sur les machines clientes)

Le fichier de config agent est :

```
/opt/agentautoupdate/config.json
```

Il contient :

- agentId, displayName
- dashboardUrl
- agentApiToken
- pollIntervalSeconds
- schedule { enabled, dailyTime }
