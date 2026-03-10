# Build and Release

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

### Build UI

```
cd dashboard/client
npm install
npm run build
```

The output is `dashboard/client/dist`.

### Build agent bundle

```
bash dashboard/scripts/build-agent-bundle.sh
```

This creates:

- `dashboard/public/agent/latest.tar.gz`
- `dashboard/public/agent/VERSION`

### Update agent version

Edit:

```
agent/app/VERSION
```

Then rebuild the agent bundle.

### Release checklist

1) Update version number
2) Build UI
3) Build agent bundle
4) Start server
5) Update agents from the dashboard

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

### Builder l UI

```
cd dashboard/client
npm install
npm run build
```

Le build est dans `dashboard/client/dist`.

### Builder le bundle agent

```
bash dashboard/scripts/build-agent-bundle.sh
```

Cela cree :

- `dashboard/public/agent/latest.tar.gz`
- `dashboard/public/agent/VERSION`

### Changer la version agent

Modifier :

```
agent/app/VERSION
```

Puis reconstruire le bundle agent.

### Checklist release

1) Mettre a jour la version
2) Builder l UI
3) Builder le bundle agent
4) Demarrer le serveur
5) Mettre a jour les agents depuis le dashboard
