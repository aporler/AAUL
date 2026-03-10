#!/usr/bin/env bash
# ===========================================================================
#  Agent Auto Update Linux — Dashboard install / update script
#
#  Structure on server:
#    /opt/AAUL/              ← dashboard server  (ce script)
#    /opt/agentautoupdate/   ← agent client      (géré par le dashboard)
#
#  Usage (depuis n'importe où, ex: /tmp/autoupdatelinux/):
#
#    sudo ./install.sh              # Install ou mise à jour automatique
#    sudo ./install.sh --dev        # Mode dev hot-reload (pas de systemd)
#    sudo ./install.sh --update     # Forcer le mode update
#    sudo ./install.sh --no-build   # Sauter le build React (update rapide)
#    AAUL -help                     # CLI locale du dashboard après install
# ===========================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
#  Couleurs
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ---------------------------------------------------------------------------
#  Chemins
# ---------------------------------------------------------------------------
# Là où se trouve le script (source uploadée, ex: /tmp/autoupdatelinux)
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Destination permanente du dashboard sur le serveur
INSTALL_DIR="/opt/AAUL"
BACKUP_ROOT="/opt/AAUL-backups"
BACKUP_DIR=""

SERVICE_NAME="agentautoupdate-dashboard"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODE_MIN_MAJOR=18
IS_UPDATE=false
SERVICE_WAS_ACTIVE=false

# Utilisateur propriétaire (le user sudo original, sinon l'user courant)
SERVICE_USER="${SUDO_USER:-$(id -un)}"
# Si on tourne directement en root sans sudo, on reste root
[ -z "$SERVICE_USER" ] && SERVICE_USER="root"

# ---------------------------------------------------------------------------
#  Arguments
# ---------------------------------------------------------------------------
DEV_MODE=false
FORCE_UPDATE=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --dev)      DEV_MODE=true ;;
    --update)   FORCE_UPDATE=true ;;
    --no-build) SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: sudo $0 [--dev] [--update] [--no-build]"
      echo ""
      echo "  (aucun flag)  Install ou update automatique vers $INSTALL_DIR"
      echo "  --dev         Mode développement hot-reload (pas de systemd)"
      echo "  --update      Forcer le mode update"
      echo "  --no-build    Sauter le build React (mise à jour rapide)"
      exit 0 ;;
    *)
      echo "Option inconnue: $arg  (--help pour l'aide)"
      exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------
log()  { printf "\n${GREEN}${BOLD}==> %s${NC}\n" "$1"; }
info() { printf "  ${BLUE}->  %s${NC}\n" "$1"; }
warn() { printf "  ${YELLOW}[!] %s${NC}\n" "$1"; }
ok()   { printf "  ${GREEN}[ok] %s${NC}\n" "$1"; }
die()  { printf "\n${RED}${BOLD}ERREUR: %s${NC}\n" "$1" >&2; exit 1; }

has_cmd()  { command -v "$1" >/dev/null 2>&1; }
is_linux() { [ "$(uname -s)" = "Linux" ]; }
is_macos() { [ "$(uname -s)" = "Darwin" ]; }
is_root()  { [ "${EUID:-$(id -u)}" -eq 0 ]; }

# Lire la version depuis un package.json (pur bash, pas besoin de node)
parse_pkg_version() {
  grep '"version"' "$1" 2>/dev/null | head -1 \
    | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

get_sudo() {
  if is_root; then echo ""
  elif has_cmd sudo; then echo "sudo"
  else die "Droits root requis mais sudo n'est pas disponible."
  fi
}

# Exécuter une commande en tant que SERVICE_USER (si on est root et user != root)
run_as_user() {
  if is_root && [ "$SERVICE_USER" != "root" ]; then
    sudo -u "$SERVICE_USER" "$@"
  else
    "$@"
  fi
}

paths_match() {
  [ "$(cd "$1" 2>/dev/null && pwd -P)" = "$(cd "$2" 2>/dev/null && pwd -P)" ]
}

backup_existing_install() {
  [ -d "$INSTALL_DIR" ] || return 0
  local sudo_cmd; sudo_cmd="$(get_sudo)"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="${BACKUP_ROOT}/${stamp}"

  log "Sauvegarde de l'installation actuelle vers $BACKUP_DIR"
  $sudo_cmd mkdir -p "$BACKUP_DIR"
  if has_cmd rsync; then
    $sudo_cmd rsync -a "$INSTALL_DIR/" "$BACKUP_DIR/"
  else
    $sudo_cmd cp -a "$INSTALL_DIR/." "$BACKUP_DIR/"
  fi
  ok "Sauvegarde créée"
}

rollback_from_backup() {
  [ -n "${BACKUP_DIR:-}" ] || return 0
  [ -d "$BACKUP_DIR" ] || return 0
  local sudo_cmd; sudo_cmd="$(get_sudo)"

  warn "Restauration depuis la sauvegarde $BACKUP_DIR"
  $sudo_cmd mkdir -p "$INSTALL_DIR"
  if has_cmd rsync; then
    $sudo_cmd rsync -a --delete "$BACKUP_DIR/" "$INSTALL_DIR/"
  else
    $sudo_cmd cp -a "$BACKUP_DIR/." "$INSTALL_DIR/"
  fi

  if $SERVICE_WAS_ACTIVE; then
    warn "Tentative de redémarrage du service initial"
    start_service || true
  fi
}

on_error() {
  local exit_code="$1"
  local line_no="$2"
  warn "Échec du script à la ligne $line_no (code $exit_code)"
  if $IS_UPDATE; then
    rollback_from_backup || true
  fi
  exit "$exit_code"
}

# ---------------------------------------------------------------------------
#  Détection : installation existante ?
# ---------------------------------------------------------------------------
dashboard_is_installed() {
  [ -f "$SERVICE_FILE" ] || [ -d "$INSTALL_DIR/dashboard" ]
}

service_is_active() {
  is_linux && has_cmd systemctl && \
    systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null
}

# ---------------------------------------------------------------------------
#  Node.js >= NODE_MIN_MAJOR
# ---------------------------------------------------------------------------
ensure_node() {
  log "Vérification Node.js"
  if has_cmd node; then
    local version major
    version="$(node -v | tr -d 'v')"
    major="${version%%.*}"
    if [ "${major:-0}" -ge "$NODE_MIN_MAJOR" ]; then
      ok "Node.js v$version (>= v$NODE_MIN_MAJOR requis)"
      return
    fi
    warn "Node.js v$version trouvé — besoin de v$NODE_MIN_MAJOR+. Mise à jour..."
  else
    info "Node.js absent. Installation..."
  fi

  local sudo_cmd; sudo_cmd="$(get_sudo)"

  if is_macos; then
    has_cmd brew || die "Homebrew absent. Installer Node.js $NODE_MIN_MAJOR+ manuellement."
    brew install node
    ok "Node.js $(node -v) installé via Homebrew"
    return
  fi

  if is_linux; then
    if has_cmd apt-get; then
      $sudo_cmd apt-get update -y -q
      $sudo_cmd apt-get install -y -q curl ca-certificates gnupg
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x" \
        | $sudo_cmd -E bash - >/dev/null
      $sudo_cmd apt-get install -y -q nodejs
      ok "Node.js $(node -v) installé via NodeSource (apt)"
      return
    fi
    if has_cmd dnf; then
      $sudo_cmd dnf -y -q install curl ca-certificates
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MIN_MAJOR}.x" \
        | $sudo_cmd bash - >/dev/null
      $sudo_cmd dnf -y -q install nodejs
      ok "Node.js $(node -v) installé via NodeSource (dnf)"
      return
    fi
    if has_cmd yum; then
      $sudo_cmd yum -y -q install curl ca-certificates
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MIN_MAJOR}.x" \
        | $sudo_cmd bash - >/dev/null
      $sudo_cmd yum -y -q install nodejs
      ok "Node.js $(node -v) installé via NodeSource (yum)"
      return
    fi
  fi

  die "OS ou package manager non supporté. Installer Node.js $NODE_MIN_MAJOR+ manuellement."
}

# ---------------------------------------------------------------------------
#  Outils de compilation (pour sqlite3, bcrypt, node-pty)
# ---------------------------------------------------------------------------
ensure_build_tools() {
  log "Vérification outils de compilation"
  local sudo_cmd; sudo_cmd="$(get_sudo)"

  if is_linux; then
    if has_cmd apt-get; then
      local python_pkgs=(python3 python3-setuptools)
      if has_cmd apt-cache; then
        local candidate
        candidate="$(apt-cache policy python3-distutils 2>/dev/null \
                     | awk '/Candidate:/{print $2}')"
        if [ -n "${candidate:-}" ] && [ "${candidate}" != "(none)" ]; then
          python_pkgs+=(python3-distutils)
        fi
      fi
      $sudo_cmd apt-get install -y -q build-essential make g++ "${python_pkgs[@]}"
      ok "Outils de compilation prêts (apt)"
      return
    fi
    if has_cmd dnf; then
      $sudo_cmd dnf -y -q install gcc gcc-c++ make python3 python3-setuptools
      ok "Outils de compilation prêts (dnf)"
      return
    fi
    if has_cmd yum; then
      $sudo_cmd yum -y -q install gcc gcc-c++ make python3 python3-setuptools
      ok "Outils de compilation prêts (yum)"
      return
    fi
  fi

  if is_macos; then
    xcode-select -p >/dev/null 2>&1 \
      && ok "Xcode Command Line Tools présents" \
      || warn "Xcode Command Line Tools absents. Lancer: xcode-select --install"
  fi
}

# ---------------------------------------------------------------------------
#  Copie / sync des fichiers source vers INSTALL_DIR
#
#  Fresh install : copie complète
#  Update        : sync du nouveau code SANS écraser les données :
#                    dashboard/.env              (config locale / secrets)
#                    dashboard/config/config.json (config production)
#                    dashboard/*.sqlite           (base de données)
#                    dashboard/ssl/               (certificats TLS)
#                    dashboard/node_modules/      (réinstallés)
#                    dashboard/client/node_modules/
#                    dashboard/client/dist/       (rebuilt)
#                    dashboard/public/agent/      (rebuilt)
# ---------------------------------------------------------------------------
sync_files() {
  local sudo_cmd; sudo_cmd="$(get_sudo)"

  if $IS_UPDATE; then
    if paths_match "$SRC_DIR" "$INSTALL_DIR"; then
      log "Source identique à l'installation existante — aucun recopiage nécessaire"
      return
    fi

    log "Synchronisation du code vers $INSTALL_DIR (données préservées)"

    if has_cmd rsync; then
      $sudo_cmd rsync -a --delete \
        --exclude="dashboard/.env" \
        --exclude="dashboard/config/config.json" \
        --exclude="dashboard/client/vite.config.js" \
        --exclude="dashboard/*.sqlite" \
        --exclude="dashboard/*.sqlite-journal" \
        --exclude="dashboard/*.sessions.sqlite" \
        --exclude="dashboard/*.sessions.sqlite-journal" \
        --exclude="dashboard/.session-secret" \
        --exclude="dashboard/.data-protection-key" \
        --exclude="dashboard/.initial-admin-password" \
        --exclude="dashboard/ssl/" \
        --exclude="dashboard/public/agent/" \
        --exclude="dashboard/node_modules/" \
        --exclude="dashboard/client/node_modules/" \
        --exclude="dashboard/client/dist/" \
        --exclude=".git/" \
        --exclude=".claude/" \
        "$SRC_DIR/" "$INSTALL_DIR/"
      ok "Synchronisation rsync terminée"
    else
      # Fallback : cp manuel sans les répertoires protégés
      warn "rsync absent — utilisation de cp (les anciens fichiers peuvent subsister)"
      $sudo_cmd mkdir -p "$INSTALL_DIR"

      # Copier l'arborescence agent complète
      $sudo_cmd cp -r "$SRC_DIR/agent" "$INSTALL_DIR/"
      $sudo_cmd cp    "$SRC_DIR/AAUL" "$INSTALL_DIR/" 2>/dev/null || true
      $sudo_cmd cp    "$SRC_DIR/install.sh" "$INSTALL_DIR/" 2>/dev/null || true

      # Copier le code dashboard sans les répertoires de données
      $sudo_cmd mkdir -p "$INSTALL_DIR/dashboard"
      for item in \
          scripts server client package.json package-lock.json \
          .env.example; do
        local src="$SRC_DIR/dashboard/$item"
        [ -e "$src" ] || continue
        $sudo_cmd cp -r "$src" "$INSTALL_DIR/dashboard/"
      done

      # Copier config/config.json seulement s'il n'existe pas encore
      if [ ! -f "$INSTALL_DIR/dashboard/config/config.json" ]; then
        $sudo_cmd mkdir -p "$INSTALL_DIR/dashboard/config"
        $sudo_cmd cp "$SRC_DIR/dashboard/config/config.json" \
                     "$INSTALL_DIR/dashboard/config/config.json"
      fi

      ok "Copie terminée"
    fi

  else
    # Fresh install — tout copier
    log "Copie des fichiers vers $INSTALL_DIR"
    $sudo_cmd mkdir -p "$INSTALL_DIR"
    if has_cmd rsync; then
      $sudo_cmd rsync -a --delete \
        --exclude=".git/" \
        --exclude=".claude/" \
        --exclude="dashboard/node_modules/" \
        --exclude="dashboard/client/node_modules/" \
        --exclude="dashboard/client/dist/" \
        --exclude="dashboard/public/agent/" \
        "$SRC_DIR/" "$INSTALL_DIR/"
    else
      $sudo_cmd cp -r "$SRC_DIR/." "$INSTALL_DIR/"
    fi
    ok "Fichiers copiés vers $INSTALL_DIR"
  fi

  # Propriété du répertoire
  $sudo_cmd chown -R "$SERVICE_USER:" "$INSTALL_DIR" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
#  Fichiers .env — créer depuis les exemples UNIQUEMENT au premier install
# ---------------------------------------------------------------------------
ensure_env_files() {
  log "Vérification des fichiers d'environnement"
  local sudo_cmd; sudo_cmd="$(get_sudo)"
  local env_path="$INSTALL_DIR/dashboard/.env"
  local example_path="$INSTALL_DIR/dashboard/.env.example"

  if [ ! -f "$env_path" ]; then
    [ -f "$example_path" ] || die ".env.example introuvable dans $INSTALL_DIR/dashboard/"
    $sudo_cmd cp "$example_path" "$env_path"
    ok "Créé : $env_path"
    warn "Editer $env_path : définir SESSION_SECRET, ports, HTTPS, etc."
  else
    ok "$env_path déjà présent (inchangé)"
  fi

  local client_env="$INSTALL_DIR/dashboard/client/.env"
  local client_example="$INSTALL_DIR/dashboard/client/.env.example"
  if [ -f "$client_example" ] && [ ! -f "$client_env" ]; then
    $sudo_cmd cp "$client_example" "$client_env"
    ok "Créé : $client_env"
  fi

  $sudo_cmd chown "$SERVICE_USER:" "$env_path" "$client_env" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
#  Dépendances npm
# ---------------------------------------------------------------------------
install_deps() {
  log "Installation/mise à jour des dépendances Node.js"
  (cd "$INSTALL_DIR/dashboard" && \
    run_as_user npm install --prefer-offline 2>&1 | tail -20)
  ok "Dépendances serveur prêtes"

  (cd "$INSTALL_DIR/dashboard" && \
    run_as_user npm --prefix client install --prefer-offline 2>&1 | tail -20)
  ok "Dépendances client prêtes"
}

# ---------------------------------------------------------------------------
#  Bundle agent (tar.gz téléchargé par les agents clients pour leur update)
# ---------------------------------------------------------------------------
build_agent_bundle() {
  log "Construction du bundle agent"
  run_as_user bash "$INSTALL_DIR/dashboard/scripts/build-agent-bundle.sh"
  local version
  version="$(cat "$INSTALL_DIR/agent/app/VERSION" 2>/dev/null || echo "inconnu")"
  ok "Bundle agent prêt — version $version"
}

# ---------------------------------------------------------------------------
#  Build React (production)
# ---------------------------------------------------------------------------
build_client() {
  if $SKIP_BUILD; then
    warn "Build React ignoré (--no-build)"
    return
  fi
  log "Build React (production)"
  (cd "$INSTALL_DIR/dashboard" && \
    run_as_user npm run build:client 2>&1 | tail -5)
  ok "Build client terminé -> $INSTALL_DIR/dashboard/client/dist/"
}

# ---------------------------------------------------------------------------
#  Commande CLI locale AAUL
# ---------------------------------------------------------------------------
install_cli_command() {
  local sudo_cmd; sudo_cmd="$(get_sudo)"
  local node_bin; node_bin="$(command -v node)"
  local cli_target="/usr/local/bin/AAUL"
  local cli_alias="/usr/local/bin/aaul"

  log "Installation de la commande CLI locale : AAUL"

  $sudo_cmd tee "$cli_target" > /dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec ${node_bin} ${INSTALL_DIR}/dashboard/server/cli.js "\$@"
EOF

  $sudo_cmd chmod 755 "$cli_target"
  $sudo_cmd ln -sf "$cli_target" "$cli_alias"
  ok "Commande CLI installée"
}

# ---------------------------------------------------------------------------
#  Service systemd
# ---------------------------------------------------------------------------
install_service() {
  if ! is_linux || ! has_cmd systemctl; then
    warn "systemd non disponible — service ignoré"
    return
  fi

  local sudo_cmd; sudo_cmd="$(get_sudo)"
  local node_bin; node_bin="$(command -v node)"

  log "Écriture du service systemd : $SERVICE_FILE"

  $sudo_cmd tee "$SERVICE_FILE" > /dev/null <<UNIT
[Unit]
Description=Agent Auto Update Dashboard (AAUL)
After=network.target
Wants=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/dashboard
ExecStart=${node_bin} server/index.js
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
UNIT

  $sudo_cmd systemctl daemon-reload
  $sudo_cmd systemctl enable "$SERVICE_NAME"
  ok "Service systemd écrit et activé"
}

# ---------------------------------------------------------------------------
#  Contrôle du service
# ---------------------------------------------------------------------------
stop_service() {
  if service_is_active; then
    local sudo_cmd; sudo_cmd="$(get_sudo)"
    info "Arrêt de $SERVICE_NAME..."
    $sudo_cmd systemctl stop "$SERVICE_NAME"
    ok "Service arrêté"
  else
    info "Service non actif (rien à arrêter)"
  fi
}

start_service() {
  is_linux && has_cmd systemctl || return
  local sudo_cmd; sudo_cmd="$(get_sudo)"
  $sudo_cmd systemctl start "$SERVICE_NAME"
  ok "Service démarré"
  sleep 1
  $sudo_cmd systemctl status "$SERVICE_NAME" --no-pager --lines 6 || true
}

restart_service() {
  is_linux && has_cmd systemctl || return
  local sudo_cmd; sudo_cmd="$(get_sudo)"
  $sudo_cmd systemctl restart "$SERVICE_NAME"
  ok "Service redémarré"
  sleep 1
  $sudo_cmd systemctl status "$SERVICE_NAME" --no-pager --lines 6 || true
}

# ---------------------------------------------------------------------------
#  Résumé final
# ---------------------------------------------------------------------------
print_summary() {
  local mode="$1"
  local cfg="$INSTALL_DIR/dashboard/config/config.json"
  local api_port="3001"

  if [ -f "$cfg" ] && has_cmd node; then
    api_port="$(node -e "
      try{const c=require('$cfg');process.stdout.write(String(c.http?.apiPort||3001));}
      catch{process.stdout.write('3001');}
    " 2>/dev/null || echo "3001")"
  fi

  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "IP_SERVEUR")"

  local new_dashboard_ver; new_dashboard_ver="$(parse_pkg_version "$INSTALL_DIR/dashboard/package.json")"
  local new_agent_ver; new_agent_ver="$(cat "$INSTALL_DIR/agent/app/VERSION" 2>/dev/null | tr -d '[:space:]')"
  new_dashboard_ver="${new_dashboard_ver:-?}"
  new_agent_ver="${new_agent_ver:-?}"

  echo ""
  printf "${CYAN}${BOLD}"
  echo "==================================================================="
  printf "  AAUL Dashboard — %-48s\n" "$mode terminé"
  echo "==================================================================="
  printf "${NC}"
  echo ""
  printf "  %-24s ${GREEN}${BOLD}v%s${NC}\n" "Dashboard :"    "$new_dashboard_ver"
  printf "  %-24s ${GREEN}${BOLD}v%s${NC}\n" "Agent bundle :" "$new_agent_ver"
  echo ""
  printf "  %-24s %s\n" "Installé dans :"  "$INSTALL_DIR"
  printf "  %-24s %s\n" "Tourne en tant que :" "$SERVICE_USER"
  echo ""
  if is_linux && has_cmd systemctl; then
    printf "  %-24s %s\n" "Statut service :"  "systemctl status $SERVICE_NAME"
    printf "  %-24s %s\n" "Logs en direct :"  "journalctl -u $SERVICE_NAME -f"
    printf "  %-24s %s\n" "CLI locale :"      "AAUL -help"
    echo ""
  fi
  # En production, Express sert le client React buildé sur le même port que l'API
  printf "  %-24s %s\n" "Dashboard :"  "http://$host_ip:$api_port"
  printf "  %-24s %s\n" "API :"        "http://$host_ip:$api_port/api"
  echo ""
  printf "  %-24s %s\n" "Config :"    "$INSTALL_DIR/dashboard/config/config.json"
  printf "  %-24s %s\n" "Env :"       "$INSTALL_DIR/dashboard/.env"
  printf "  %-24s %s\n" "Base de données :" "$INSTALL_DIR/dashboard/dashboard.sqlite"
  if [ -n "${BACKUP_DIR:-}" ]; then
    printf "  %-24s %s\n" "Sauvegarde rollback :" "$BACKUP_DIR"
  fi
  echo ""
  printf "${CYAN}${BOLD}===================================================================${NC}\n"
  echo ""
}

# ===========================================================================
#  MAIN
# ===========================================================================

echo ""
printf "${CYAN}${BOLD}"
echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║          Agent Auto Update Linux — Dashboard Setup               ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
printf "${NC}"
echo ""
info "Source  : $SRC_DIR"
info "Cible   : $INSTALL_DIR"
info "Service : $SERVICE_NAME  (user: $SERVICE_USER)"

# Versions dans les sources
SRC_DASHBOARD_VER="$(parse_pkg_version "$SRC_DIR/dashboard/package.json")"
SRC_AGENT_VER="$(cat "$SRC_DIR/agent/app/VERSION" 2>/dev/null | tr -d '[:space:]')"
SRC_DASHBOARD_VER="${SRC_DASHBOARD_VER:-?}"
SRC_AGENT_VER="${SRC_AGENT_VER:-?}"

# ---------------------------------------------------------------------------
#  DEV MODE (mode développement — reste dans SRC_DIR, pas de systemd)
# ---------------------------------------------------------------------------
if $DEV_MODE; then
  log "Mode développement (hot-reload depuis $SRC_DIR)"
  INSTALL_DIR="$SRC_DIR"   # dev : on travaille directement dans les sources
  ensure_node
  ensure_build_tools
  # .env dans les sources
  [ -f "$SRC_DIR/dashboard/.env" ] || \
    cp "$SRC_DIR/dashboard/.env.example" "$SRC_DIR/dashboard/.env" 2>/dev/null || true
  install_deps
  build_agent_bundle
  log "Démarrage des serveurs de développement (Ctrl+C pour arrêter)"
  cd "$SRC_DIR/dashboard"
  exec npm run dev:all
fi

# ---------------------------------------------------------------------------
#  PRODUCTION — détection automatique : install vs update
# ---------------------------------------------------------------------------
if dashboard_is_installed || $FORCE_UPDATE; then
  IS_UPDATE=true
fi

trap 'on_error $? $LINENO' ERR

if $IS_UPDATE; then
  # Versions actuellement en production
  INST_DASHBOARD_VER="$(parse_pkg_version "$INSTALL_DIR/dashboard/package.json")"
  INST_AGENT_VER="$(cat "$INSTALL_DIR/agent/app/VERSION" 2>/dev/null | tr -d '[:space:]')"
  INST_DASHBOARD_VER="${INST_DASHBOARD_VER:-?}"
  INST_AGENT_VER="${INST_AGENT_VER:-?}"

  printf "\n${YELLOW}${BOLD}  Mode UPDATE — installation existante détectée dans $INSTALL_DIR${NC}\n"
  printf "\n"
  printf "  %-22s ${YELLOW}v%-10s${NC}  →  ${GREEN}${BOLD}v%s${NC}\n" \
    "Dashboard :"  "$INST_DASHBOARD_VER"  "$SRC_DASHBOARD_VER"
  printf "  %-22s ${YELLOW}v%-10s${NC}  →  ${GREEN}${BOLD}v%s${NC}\n" \
    "Agent bundle :" "$INST_AGENT_VER"    "$SRC_AGENT_VER"
  printf "\n"
else
  printf "\n${GREEN}${BOLD}  Mode INSTALL — premier déploiement vers $INSTALL_DIR${NC}\n"
  printf "\n"
  printf "  %-22s ${GREEN}${BOLD}v%s${NC}\n" "Dashboard :"    "$SRC_DASHBOARD_VER"
  printf "  %-22s ${GREEN}${BOLD}v%s${NC}\n" "Agent bundle :" "$SRC_AGENT_VER"
  printf "\n"
fi

  ensure_node
  ensure_build_tools

if $IS_UPDATE; then
  # -----------------------------------------------------------------------
  #  MISE À JOUR
  #  1. Arrêt du service
  #  2. Sync du nouveau code (DB/config/SSL préservés)
  #  3. npm install (nouvelles dépendances)
  #  4. Rebuild bundle agent + React
  #  5. Mise à jour du fichier systemd
  #  6. Redémarrage du service
  # -----------------------------------------------------------------------
  if service_is_active; then
    SERVICE_WAS_ACTIVE=true
  fi
  stop_service
  backup_existing_install
  sync_files
  install_deps
  build_agent_bundle
  build_client
  install_cli_command
  install_service
  restart_service
  print_summary "Mise à jour"

else
  # -----------------------------------------------------------------------
  #  INSTALLATION FRAÎCHE
  #  1. Copie de tous les fichiers
  #  2. Création des .env
  #  3. npm install
  #  4. Build bundle agent + React
  #  5. Création du service systemd
  #  6. Démarrage du service
  # -----------------------------------------------------------------------
  sync_files
  ensure_env_files
  install_deps
  build_agent_bundle
  build_client
  install_cli_command
  install_service
  start_service
  print_summary "Installation"
fi
