# Security and TLS

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

### Core security model

- Agents authenticate with a bearer token.
- The dashboard UI uses a session cookie.
- The agent does not open inbound ports.

### Recommended hardening

1) Change the default admin password immediately.
2) Set a strong `SESSION_SECRET`.
3) Enable HTTPS and disable HTTP for installs.
4) Restrict dashboard network access (firewall or VPN).
5) Rotate agent tokens when reinstalling.

### HTTPS configuration

Set HTTPS in `dashboard/config/config.json`:

```
"https": {
  "enabled": true,
  "apiPort": 3002,
  "keyPath": "./ssl/server.key",
  "certPath": "./ssl/server.crt",
  "caPath": ""
}
```

Or via environment variables:

```
HTTPS_ENABLED=true
HTTPS_API_PORT=3002
HTTPS_KEY_PATH=./ssl/server.key
HTTPS_CERT_PATH=./ssl/server.crt
```

### HTTP install control

If you enable HTTPS, also set:

```
ALLOW_HTTP_INSTALL=false
DEFAULT_API_PROTOCOL=https
```

This forces install scripts to use HTTPS.

### Token handling

Tokens are stored in the SQLite database. If you delete an agent, its tokens
are removed. Reinstalling an agent issues new tokens.

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

### Modele de securite

- Les agents utilisent un token bearer.
- Le dashboard utilise un cookie de session.
- L agent n ouvre pas de port entrant.

### Recommandations

1) Changer le mot de passe admin par defaut.
2) Definir un `SESSION_SECRET` robuste.
3) Activer HTTPS et desactiver HTTP pour les installs.
4) Restreindre l acces reseau du dashboard (firewall ou VPN).
5) Regenerer les tokens lors d une reinstall.

### Configuration HTTPS

Configurer `dashboard/config/config.json` :

```
"https": {
  "enabled": true,
  "apiPort": 3002,
  "keyPath": "./ssl/server.key",
  "certPath": "./ssl/server.crt",
  "caPath": ""
}
```

Ou via variables d environnement :

```
HTTPS_ENABLED=true
HTTPS_API_PORT=3002
HTTPS_KEY_PATH=./ssl/server.key
HTTPS_CERT_PATH=./ssl/server.crt
```

### Controle HTTP pour l install

Si HTTPS est actif, definir :

```
ALLOW_HTTP_INSTALL=false
DEFAULT_API_PROTOCOL=https
```

Cela force les installations en HTTPS.

### Tokens

Les tokens sont stockes dans SQLite. Supprimer un agent supprime ses tokens.
Une reinstall genere de nouveaux tokens.
