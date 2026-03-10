# Premiers pas

Ce dossier contient le code source propre du projet AAUL, prêt à être poussé sur GitHub.

## Base de données de démarrage

Le fichier `dashboard/starter.sqlite` contient une base vierge avec un compte administrateur par défaut :

| Champ      | Valeur       |
|------------|--------------|
| Utilisateur | `admin`     |
| Mot de passe | `Admin1234!` |

> **Important :** Le compte est marqué `must_change_password = 1`.
> Le tableau de bord forcera un changement de mot de passe dès la première connexion.

Pour utiliser cette base de démarrage :

```bash
cp dashboard/starter.sqlite dashboard/dashboard.sqlite
```

Sinon, le serveur créera automatiquement un compte admin avec un mot de passe aléatoire
au premier démarrage. Ce mot de passe sera écrit dans `.initial-admin-password`.

## Démarrage rapide

```bash
cd dashboard
npm install
npm --prefix client install
npm --prefix client run build
npm start
```

Le tableau de bord sera accessible sur `http://localhost:3001`.

## Notes avant publication GitHub

- Ne jamais inclure `dashboard/dashboard.sqlite` dans le dépôt (déjà dans `.gitignore`)
- Ne jamais inclure `dashboard/ssl/` ni `dashboard/server/ssl/*.key`
- Changer `sessionSecret` dans `dashboard/config/config.json` avant la mise en production
- Ce fichier `DEMARRAGE.md` peut être retiré ou conservé selon la préférence
