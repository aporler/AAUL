# Troubleshooting

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

### Node native modules fail to load (sqlite3, bcrypt)

Rebuild native modules:

```
cd dashboard
npm rebuild
```

On Linux, make sure build tools are installed:

```
sudo apt-get install -y build-essential python3 make g++
```

### Vite fails with rollup optional dependency

Remove and reinstall client deps:

```
rm -rf dashboard/client/node_modules dashboard/client/package-lock.json
npm --prefix dashboard/client install
```

### Port already in use

Change ports in `dashboard/config/config.json` or `.env`, then restart.

### Agent does not appear online

Check on the agent host:

```
sudo systemctl status agentautoupdate.service
tail -n 100 /opt/agentautoupdate/logs/agent-YYYY-MM-DD.log
```

Confirm `dashboardUrl` and `agentApiToken` in:

```
/opt/agentautoupdate/config.json
```

### Install command fails

Make sure:

- `baseUrl` is correct in Admin settings
- HTTPS certificates are valid if using HTTPS
- `ALLOW_HTTP_INSTALL=false` is not blocking HTTP installs

### Reboot required flag not showing

The agent checks:

- `/var/run/reboot-required` or `/run/reboot-required`
- `needs-restarting -r` on RHEL based systems

If the file does not exist and `needs-restarting` is missing, the flag is false.

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

### Modules natifs Node en erreur (sqlite3, bcrypt)

Rebuild :

```
cd dashboard
npm rebuild
```

Sur Linux, installer les outils :

```
sudo apt-get install -y build-essential python3 make g++
```

### Vite echoue sur une dependance rollup optionnelle

Supprimer et reinstaller :

```
rm -rf dashboard/client/node_modules dashboard/client/package-lock.json
npm --prefix dashboard/client install
```

### Port deja utilise

Changer les ports dans `dashboard/config/config.json` ou `.env`, puis redemarrer.

### Agent hors ligne

Verifier sur l hote :

```
sudo systemctl status agentautoupdate.service
tail -n 100 /opt/agentautoupdate/logs/agent-YYYY-MM-DD.log
```

Verifier `dashboardUrl` et `agentApiToken` :

```
/opt/agentautoupdate/config.json
```

### Install command en erreur

Verifier :

- `baseUrl` dans Admin
- Certificats HTTPS valides si HTTPS
- `ALLOW_HTTP_INSTALL=false` ne bloque pas HTTP

### Indicateur reboot requis absent

L agent verifie :

- `/var/run/reboot-required` ou `/run/reboot-required`
- `needs-restarting -r` sur RHEL

Si aucun indicateur n existe, le flag est false.
