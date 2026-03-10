# Dashboard Usage

Note: This wiki is valid for version 0.10 (January 19, 2026).

## English

### Login

The server creates a default admin account on first start:

- username: admin
- password: admin

Log in, then change the password from the Users page.

### Add an agent

1) Go to "Add Agent"
2) Enter a display name
3) Copy the install command
4) Run it on the target Linux host

The installer writes the agent config, creates systemd services, and starts the
poller immediately.

### Dashboard table

Each agent row shows:

- Last seen / last run / status
- Online vs offline state
- Agent version and schedule
- Pending command (if any)
- "Reboot required" badge when detected

### Agent details page

The details page shows:

- OS, CPU, memory, disks, IPs, GPU, repositories
- Uptime
- Reboot required indicator
- Last info update time

### Commands

Commands are queued and executed on the next poll:

- Run now
- Set schedule
- Update agent
- Fetch info
- Uninstall
- View logs

### Logs

The Logs page requests the log list from the agent, then retrieves a log file
on demand.

### Admin settings

Use the Admin page to set:

- baseUrl for install commands
- Default poll interval for new agents
- Helper fields (public IP and ports)

## Francais

Note: Ce wiki est valide pour la version 0.10 (19 janvier 2026).

### Connexion

Le serveur cree un compte admin par defaut au premier demarrage :

- utilisateur : admin
- mot de passe : admin

Connectez-vous puis changez le mot de passe via la page Utilisateurs.

### Ajouter un agent

1) Aller sur "Ajouter un agent"
2) Entrer un nom affiche
3) Copier la commande d installation
4) Lancer la commande sur l hote Linux

L installateur ecrit la config, cree les services systemd, puis lance le poller.

### Tableau de bord

Chaque ligne affiche :

- Dernier contact / derniere execution / statut
- Etat en ligne ou hors ligne
- Version agent et horaire
- Commande en attente
- Badge "reboot requis" si detecte

### Details agent

La page details affiche :

- OS, CPU, memoire, disques, IPs, GPU, depots
- Uptime
- Indication de redemarrage requis
- Date de mise a jour des infos

### Commandes

Les commandes sont executees au prochain poll :

- Executer maintenant
- Horaire
- Mettre a jour l agent
- Recuperer les infos
- Desinstaller
- Logs

### Logs

La page Logs demande la liste des logs puis ouvre un fichier a la demande.

### Parametres Admin

Utilisez la page Admin pour :

- baseUrl pour les commandes d installation
- Intervalle de poll par defaut
- Champs aide (IP publique et ports)
