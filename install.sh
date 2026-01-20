#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
  printf "\n==> %s\n" "$1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

require_sudo() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    if ! has_cmd sudo; then
      echo "sudo is required but not installed."
      exit 1
    fi
    echo "sudo"
  else
    echo ""
  fi
}

ensure_node() {
  if has_cmd node; then
    local version major
    version="$(node -v | tr -d 'v')"
    major="${version%%.*}"
    if [ "${major:-0}" -ge 18 ]; then
      return
    fi
    echo "Node.js 18+ required. Found v$version."
  else
    echo "Node.js not found."
  fi

  local os
  os="$(uname -s)"
  if [ "$os" = "Darwin" ]; then
    if ! has_cmd brew; then
      echo "Homebrew not found. Install Node.js 18+ and rerun."
      echo "https://brew.sh/"
      exit 1
    fi
    log "Installing Node.js via Homebrew"
    brew install node
    return
  fi

  if [ "$os" = "Linux" ]; then
    local sudo_cmd
    sudo_cmd="$(require_sudo)"
    if has_cmd apt-get; then
      log "Installing Node.js via NodeSource (apt)"
      $sudo_cmd apt-get update -y
      $sudo_cmd apt-get install -y curl ca-certificates gnupg
      curl -fsSL https://deb.nodesource.com/setup_18.x | $sudo_cmd -E bash -
      $sudo_cmd apt-get install -y nodejs
      return
    fi
    if has_cmd dnf; then
      log "Installing Node.js via NodeSource (dnf)"
      $sudo_cmd dnf -y install curl ca-certificates
      curl -fsSL https://rpm.nodesource.com/setup_18.x | $sudo_cmd bash -
      $sudo_cmd dnf -y install nodejs
      return
    fi
    if has_cmd yum; then
      log "Installing Node.js via NodeSource (yum)"
      $sudo_cmd yum -y install curl ca-certificates
      curl -fsSL https://rpm.nodesource.com/setup_18.x | $sudo_cmd bash -
      $sudo_cmd yum -y install nodejs
      return
    fi
  fi

  echo "Unsupported OS or package manager. Install Node.js 18+ manually."
  exit 1
}

ensure_build_tools() {
  local os
  os="$(uname -s)"
  if [ "$os" = "Linux" ]; then
    local sudo_cmd
    sudo_cmd="$(require_sudo)"
    if has_cmd apt-get; then
      log "Installing build tools (apt)"
      $sudo_cmd apt-get update -y
      local python_pkgs=(python3 python3-setuptools)
      if has_cmd apt-cache; then
        candidate="$(apt-cache policy python3-distutils 2>/dev/null | awk '/Candidate:/{print $2}')"
        if [ -n "${candidate:-}" ] && [ "${candidate}" != "(none)" ]; then
          python_pkgs+=(python3-distutils)
        fi
      fi
      $sudo_cmd apt-get install -y build-essential make g++ "${python_pkgs[@]}"
      return
    fi
    if has_cmd dnf; then
      log "Installing build tools (dnf)"
      $sudo_cmd dnf -y install gcc gcc-c++ make python3 python3-setuptools
      return
    fi
    if has_cmd yum; then
      log "Installing build tools (yum)"
      $sudo_cmd yum -y install gcc gcc-c++ make python3 python3-setuptools
      return
    fi
  fi
  if [ "$os" = "Darwin" ]; then
    if ! xcode-select -p >/dev/null 2>&1; then
      echo "Xcode Command Line Tools not found."
      echo "Install with: xcode-select --install"
    fi
  fi
}

ensure_env_files() {
  if [ ! -f "$ROOT_DIR/dashboard/.env" ]; then
    log "Creating dashboard/.env from example"
    cp "$ROOT_DIR/dashboard/.env.example" "$ROOT_DIR/dashboard/.env"
  fi
  if [ ! -f "$ROOT_DIR/dashboard/client/.env" ]; then
    log "Creating dashboard/client/.env from example"
    cp "$ROOT_DIR/dashboard/client/.env.example" "$ROOT_DIR/dashboard/client/.env"
  fi
}

install_deps() {
  log "Installing dashboard dependencies"
  (cd "$ROOT_DIR/dashboard" && npm install)

  log "Installing client dependencies"
  (cd "$ROOT_DIR/dashboard" && npm --prefix client install)
}

build_agent_bundle() {
  log "Building agent bundle"
  bash "$ROOT_DIR/dashboard/scripts/build-agent-bundle.sh"
}

start_servers() {
  log "Starting API + UI dev servers"
  cd "$ROOT_DIR/dashboard"
  npm run dev:all
}

ensure_node
ensure_build_tools
ensure_env_files
install_deps
build_agent_bundle
start_servers
