"""
Agent Local Web Server Module

Provides an optional local web interface for managing the agent directly
without going through the central dashboard. Can be enabled/disabled 
per-agent from the dashboard.

Security:
- PAM authentication using Linux system users
- Session-based authentication with secure tokens
- Optional TLS support for HTTPS
- Automatic firewall configuration (ufw, firewalld, iptables)

Usage:
    from lib.local_web import LocalWebManager
    
    # Create manager
    manager = LocalWebManager()
    
    # Apply configuration received from dashboard
    manager.apply_config(agent_config)
    
    # Stop the server
    manager.stop()
"""

import json
import html as html_mod
import os
import platform
import ssl
import threading
import time
import base64
from collections import defaultdict
from functools import wraps
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from typing import Optional

# Rate limiting for login attempts
_login_attempts: dict = defaultdict(list)
_LOGIN_WINDOW_S = 900  # 15 minutes
_MAX_LOGIN_ATTEMPTS = 5

from .config import LOCAL_WEB_STATE_PATH, LOG_DIR, load_config, read_state, get_agent_version
from .system_info import collect_system_info, get_uptime_seconds, get_reboot_required
from .util import get_hostname, get_primary_ip
from .logs import log

# Try to import PAM auth module
try:
    from .pam_auth import login, logout, validate_session, get_session_info, get_pam_auth
except ImportError:
    login = None
    logout = None
    validate_session = None
    get_session_info = None
    get_pam_auth = None
    log("Module pam_auth non disponible")

# Try to import firewall module
try:
    from .firewall import get_firewall_manager, open_port, close_port, update_port
    FIREWALL_AVAILABLE = True
except ImportError:
    FIREWALL_AVAILABLE = False
    log("Module firewall non disponible")


# Default ports that can be used
ALLOWED_PORTS = [8080, 8090, 8180, 8190]

# State file for local web configuration
LOCAL_WEB_STATE_FILE = LOCAL_WEB_STATE_PATH


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """HTTP Server that handles each request in a new thread."""
    daemon_threads = True
    allow_reuse_address = True


class AgentWebHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the local web interface."""
    
    # Class-level reference to the manager
    manager = None
    
    def log_message(self, format, *args):
        """Override to use our logging."""
        log(f"[LocalWeb] {format % args}")
    
    def _send_security_headers(self):
        """Send common security headers on all responses."""
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'")

    def send_json(self, data, status=200):
        """Send JSON response."""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode())

    def send_html(self, html, status=200):
        """Send HTML response."""
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))
    
    def get_session_token(self) -> Optional[str]:
        """Extract session token from request."""
        # Check Authorization header
        auth_header = self.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        
        # Check cookie
        cookies = self.headers.get("Cookie", "")
        for cookie in cookies.split(";"):
            cookie = cookie.strip()
            if cookie.startswith("session="):
                return cookie[8:]
        
        return None
    
    def check_auth(self) -> Optional[str]:
        """
        Check if request is authenticated.
        
        Returns:
            Username if authenticated, None otherwise
        """
        token = self.get_session_token()
        if token and validate_session:
            username = validate_session(token)
            if username:
                return username
        
        return None
    
    def send_login_page(self, error: str = ""):
        """Send the login page."""
        error_html = f'<div class="error">{html_mod.escape(error)}</div>' if error else ""
        
        html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Auto Update - Connexion</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .login-container {{
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }}
        h1 {{
            text-align: center;
            margin-bottom: 8px;
            color: #10b981;
        }}
        .subtitle {{
            text-align: center;
            color: #9ca3af;
            margin-bottom: 32px;
            font-size: 14px;
        }}
        .form-group {{
            margin-bottom: 20px;
        }}
        label {{
            display: block;
            margin-bottom: 8px;
            color: #9ca3af;
            font-size: 14px;
        }}
        input {{
            width: 100%;
            padding: 12px 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.3);
            color: #fff;
            font-size: 16px;
            transition: border-color 0.2s;
        }}
        input:focus {{
            outline: none;
            border-color: #10b981;
        }}
        button {{
            width: 100%;
            padding: 14px;
            border: none;
            border-radius: 8px;
            background: #10b981;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }}
        button:hover {{
            background: #059669;
        }}
        .error {{
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #f87171;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }}
        .info {{
            margin-top: 24px;
            padding: 16px;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            font-size: 13px;
            color: #93c5fd;
        }}
        .info-icon {{ margin-right: 8px; }}
    </style>
</head>
<body>
    <div class="login-container">
        <h1>🔐 Agent AutoUpdate</h1>
        <p class="subtitle">Interface de gestion locale</p>
        
        {error_html}
        
        <form method="POST" action="/login">
            <div class="form-group">
                <label for="username">Nom d'utilisateur Linux</label>
                <input type="text" id="username" name="username" required 
                       autocomplete="username" placeholder="Votre utilisateur système">
            </div>
            <div class="form-group">
                <label for="password">Mot de passe</label>
                <input type="password" id="password" name="password" required
                       autocomplete="current-password" placeholder="Votre mot de passe système">
            </div>
            <button type="submit">Se connecter</button>
        </form>
        
        <div class="info">
            <span class="info-icon">ℹ️</span>
            Utilisez vos identifiants de connexion Linux.
            Seuls les utilisateurs autorisés peuvent accéder à cette interface.
        </div>
    </div>
</body>
</html>"""
        self.send_html(html)
    
    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = parsed.path
        
        # Public routes (no auth required)
        if path == "/login":
            error = parse_qs(parsed.query).get("error", [""])[0]
            self.send_login_page(error)
            return
        
        if path == "/health":
            self.send_json({"status": "ok"})
            return
        
        # Check authentication for all other routes
        username = self.check_auth()
        if not username:
            self.send_response(302)
            self.send_header("Location", "/login")
            self.end_headers()
            return
        
        # Authenticated routes
        if path == "/" or path == "/index.html":
            self.serve_dashboard(username)
        elif path == "/api/status":
            self.api_status()
        elif path == "/api/info":
            self.api_info()
        elif path == "/api/logs":
            self.api_logs()
        elif path == "/api/firewall":
            self.api_firewall_status()
        elif path == "/logout":
            self.handle_logout()
        else:
            self.send_json({"error": "Not found"}, 404)
    
    def do_POST(self):
        """Handle POST requests."""
        parsed = urlparse(self.path)
        path = parsed.path
        
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else ""
        
        # Login doesn't require auth
        if path == "/login":
            self.handle_login(body)
            return
        
        # Check authentication for all other routes
        username = self.check_auth()
        if not username:
            self.send_json({"error": "Authentication required"}, 401)
            return
        
        try:
            data = json.loads(body) if body and body.startswith("{") else {}
        except json.JSONDecodeError:
            data = {}
        
        # Parse form data if not JSON
        if not data and body:
            data = dict(parse_qs(body))
            data = {k: v[0] if len(v) == 1 else v for k, v in data.items()}
        
        if path == "/api/run-update":
            self.api_run_update()
        else:
            self.send_json({"error": "Not found"}, 404)
    
    def _get_client_ip(self) -> str:
        """Get client IP address."""
        return self.client_address[0] if self.client_address else "unknown"

    def _is_login_rate_limited(self, ip: str) -> bool:
        """Check if login is rate-limited for this IP."""
        now = time.time()
        _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _LOGIN_WINDOW_S]
        return len(_login_attempts[ip]) >= _MAX_LOGIN_ATTEMPTS

    def handle_login(self, body: str):
        """Handle login form submission."""
        client_ip = self._get_client_ip()

        # Rate limiting
        if self._is_login_rate_limited(client_ip):
            self.send_response(302)
            self.send_header("Location", "/login?error=Trop+de+tentatives.+Reessayez+plus+tard.")
            self.end_headers()
            return

        # Parse form data
        from urllib.parse import parse_qs
        params = parse_qs(body)
        username = params.get("username", [""])[0]
        password = params.get("password", [""])[0]

        if not username or not password:
            self.send_response(302)
            self.send_header("Location", "/login?error=Identifiants+requis")
            self.end_headers()
            return

        if not login:
            log("Authentification non disponible (module pam_auth manquant)")
            self.send_response(302)
            self.send_header("Location", "/login?error=Authentification+non+disponible")
            self.end_headers()
            return

        # Authenticate with PAM/shadow
        success, message, token = login(username, password)
        
        if success and token:
            # Clear rate-limit on success
            _login_attempts.pop(client_ip, None)
            log(f"Connexion réussie pour {username}")
            self.send_response(302)
            # Set session cookie (HttpOnly, Secure if HTTPS)
            cookie = f"session={token}; Path=/; HttpOnly; SameSite=Strict"
            if isinstance(self.connection, ssl.SSLSocket):
                cookie += "; Secure"
            self.send_header("Set-Cookie", cookie)
            self.send_header("Location", "/")
            self.end_headers()
        else:
            _login_attempts[client_ip].append(time.time())
            log(f"Échec connexion pour {username}: {message}")
            self.send_response(302)
            self.send_header("Location", "/login?error=Identifiants+invalides")
            self.end_headers()
    
    def handle_logout(self):
        """Handle logout."""
        token = self.get_session_token()
        if token:
            logout(token)
        
        self.send_response(302)
        self.send_header("Set-Cookie", "session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
        self.send_header("Location", "/login")
        self.end_headers()
    
    def serve_dashboard(self, username: str):
        """Serve the main dashboard HTML page."""
        config = load_config()
        state = read_state()

        # Get system info
        try:
            sys_info = collect_system_info()
        except:
            sys_info = {}

        hostname = get_hostname()
        ip_address = get_primary_ip()
        version = get_agent_version()

        # Format timestamps
        def format_timestamp(iso_str):
            if not iso_str or iso_str == "N/A":
                return "—"
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
                return dt.astimezone().strftime('%Y-%m-%d %H:%M:%S')
            except:
                return iso_str

        last_poll = format_timestamp(state.get("lastPoll"))
        last_update = format_timestamp(state.get("lastUpdate"))
        dashboard_url = config.get("dashboardUrl", "N/A")
        
        # Firewall status
        firewall_status = "Non disponible"
        if FIREWALL_AVAILABLE:
            fw = get_firewall_manager()
            fw_status = fw.get_status()
            firewall_status = f"{fw_status['firewall_type']} (actif)" if fw_status["active"] else "Aucun firewall actif"

        # OS info
        os_info = sys_info.get('os', {})
        if isinstance(os_info, dict):
            os_display = f"{os_info.get('name', '')} {os_info.get('version', '')}".strip() or "N/A"
        else:
            os_display = str(os_info)

        # Resources
        cpu = sys_info.get('cpu', {})
        memory = sys_info.get('memory', {})
        disks = [d for d in sys_info.get('disks', []) if d.get('totalBytes', 0) > 0]
        ips = sys_info.get('ips', [])
        gpus = sys_info.get('gpu', [])
        packages_count = sys_info.get('packagesInstalled', 0)
        reboot_required = get_reboot_required()

        def fmt_bytes(size):
            if not size:
                return "0 B"
            for unit, thr in [("TB", 1 << 40), ("GB", 1 << 30), ("MB", 1 << 20), ("KB", 1 << 10)]:
                if size >= thr:
                    return f"{size / thr:.1f} {unit}"
            return f"{size} B"

        # CPU values
        cpu_pct = cpu.get('usagePercent', 0)
        cpu_free = round(100 - cpu_pct, 1)
        cpu_model = html_mod.escape(cpu.get('model', 'N/A'))
        cpu_cores = cpu.get('cores', 0)
        cpu_threads = cpu.get('threads', 0)
        cpu_bar_cls = "danger" if cpu_pct >= 90 else ("warn" if cpu_pct >= 75 else "")

        # Memory values
        mem_total_b = memory.get('totalBytes', 0) or 1
        mem_used_b = memory.get('usedBytes', 0)
        mem_free_b = memory.get('availableBytes', 0)
        mem_pct = round(mem_used_b / mem_total_b * 100)
        mem_total = fmt_bytes(memory.get('totalBytes', 0))
        mem_used = fmt_bytes(mem_used_b)
        mem_free = fmt_bytes(mem_free_b)
        mem_bar_cls = "danger" if mem_pct >= 90 else ("warn" if mem_pct >= 75 else "")

        # Disk HTML (server-rendered, updated via JS polling)
        def disk_bar_cls(pct):
            return "danger" if pct >= 90 else ("warn" if pct >= 75 else "")

        disk_html_parts = []
        for disk in disks[:4]:
            dtotal = disk.get('totalBytes', 0) or 1
            dused = disk.get('usedBytes', 0)
            dfree = disk.get('availableBytes', 0)
            dpct = round(dused / dtotal * 100)
            dcls = disk_bar_cls(dpct)
            mp = html_mod.escape(disk.get('mountpoint', '/'))
            dev = html_mod.escape(disk.get('device', 'N/A'))
            disk_html_parts.append(f"""<div class="disk-item">
                <div class="disk-name">{mp}</div>
                <div class="disk-device">{dev} &bull; Total : {fmt_bytes(dtotal)}</div>
                <div class="res-hdr"><span class="res-lbl">Utilisé</span><span class="res-val">{fmt_bytes(dused)} ({dpct}%)</span></div>
                <div class="prog-track"><div class="prog-fill {dcls}" style="width:{dpct}%"></div></div>
                <div class="res-sub">Disponible : {fmt_bytes(dfree)}</div>
            </div>""")
        disk_html = "\n".join(disk_html_parts) or '<div style="color:#64748b;font-size:14px">Aucun disque détecté</div>'

        # IP section
        ip_section = ""
        if ips:
            chips = "".join(f'<div class="ip-chip">{html_mod.escape(str(ip))}</div>' for ip in ips[:8])
            ip_section = f'<div class="card"><div class="card-title">Interfaces réseau</div><div class="ip-list">{chips}</div></div>'

        # GPU section
        gpu_section = ""
        if gpus:
            items = "".join(f'<div class="list-item">{html_mod.escape(str(g))}</div>' for g in gpus)
            gpu_section = f'<div class="card"><div class="card-title">GPU</div><div class="list-stack">{items}</div></div>'

        # Reboot display
        reboot_val = "Oui ⚠️" if reboot_required else "Non ✓"
        reboot_style = "color:#f59e0b;font-weight:700" if reboot_required else "color:#10b981"
        reboot_pill_style = "" if reboot_required else "display:none"

        h_hostname = html_mod.escape(hostname)
        h_version = html_mod.escape(str(version))
        h_ip = html_mod.escape(str(ip_address))
        h_os = html_mod.escape(os_display)
        h_fw = html_mod.escape(firewall_status)
        h_dash = html_mod.escape(dashboard_url)
        h_user = html_mod.escape(username)

        html = (
            "<!DOCTYPE html>\n"
            '<html lang="fr">\n'
            "<head>\n"
            '<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            f"<title>Agent – {h_hostname}</title>\n"
            "<style>\n"
            "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n"
            ":root{"
            "--bg:#0f172a;--surf:#1e293b;--bdr:rgba(255,255,255,0.08);"
            "--grn:#10b981;--grnd:rgba(16,185,129,0.12);"
            "--txt:#e2e8f0;--mut:#64748b;"
            "--red:#ef4444;--amb:#f59e0b"
            "}\n"
            "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--txt);min-height:100vh}\n"
            ".hdr{background:var(--surf);border-bottom:1px solid var(--bdr);padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}\n"
            ".hdr-l{display:flex;align-items:center;gap:12px}\n"
            ".logo{font-size:17px;font-weight:700;color:var(--grn)}\n"
            ".host-chip{font-size:13px;color:var(--mut);background:rgba(255,255,255,0.06);padding:4px 10px;border-radius:6px}\n"
            ".hdr-r{display:flex;align-items:center;gap:12px}\n"
            ".ver-chip{font-size:12px;color:var(--grn);background:var(--grnd);padding:3px 8px;border-radius:4px;font-family:monospace}\n"
            ".usr-chip{font-size:13px;color:var(--mut)}\n"
            ".logout{font-size:13px;color:var(--red);text-decoration:none;padding:5px 12px;border:1px solid rgba(239,68,68,0.3);border-radius:6px;transition:background .2s}\n"
            ".logout:hover{background:rgba(239,68,68,0.1)}\n"
            ".sbar{background:var(--surf);border-bottom:1px solid var(--bdr);padding:8px 24px;display:flex;align-items:center;gap:20px;font-size:13px;color:var(--mut)}\n"
            ".dot{width:8px;height:8px;border-radius:50%;background:var(--grn);flex-shrink:0;animation:pulse 2s infinite}\n"
            "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}\n"
            ".sbar-item{display:flex;align-items:center;gap:6px}\n"
            ".reboot-pill{margin-left:auto;color:var(--amb);background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);padding:3px 10px;border-radius:12px;font-size:12px}\n"
            ".tabs{display:flex;padding:0 24px;border-bottom:1px solid var(--bdr);overflow-x:auto}\n"
            ".tab{padding:14px 18px;background:none;border:none;color:var(--mut);cursor:pointer;font-size:14px;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s;white-space:nowrap}\n"
            ".tab:hover{color:var(--txt)}\n"
            ".tab.active{color:var(--grn);border-bottom-color:var(--grn)}\n"
            ".wrap{padding:24px;max-width:960px;margin:0 auto}\n"
            ".pane{display:none}.pane.active{display:block}\n"
            ".card{background:var(--surf);border:1px solid var(--bdr);border-radius:12px;padding:20px;margin-bottom:16px}\n"
            ".card-title{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);margin-bottom:16px;font-weight:700}\n"
            ".igrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}\n"
            ".icell{background:rgba(0,0,0,.2);padding:14px;border-radius:8px}\n"
            ".ilbl{font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}\n"
            ".ival{font-size:15px;font-weight:600;overflow-wrap:break-word}\n"
            ".two-col{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}\n"
            ".res-item{margin-bottom:18px}.res-item:last-child{margin-bottom:0}\n"
            ".res-hdr{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px}\n"
            ".res-lbl{color:var(--mut)}.res-val{font-weight:600}\n"
            ".prog-track{height:6px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden}\n"
            ".prog-fill{height:100%;border-radius:3px;background:var(--grn);transition:width .5s ease}\n"
            ".prog-fill.warn{background:var(--amb)}.prog-fill.danger{background:var(--red)}\n"
            ".res-sub{font-size:12px;color:var(--mut);margin-top:5px}\n"
            ".disk-item{margin-bottom:20px}.disk-item:last-child{margin-bottom:0}\n"
            ".disk-name{font-size:14px;font-weight:600;margin-bottom:2px}\n"
            ".disk-device{font-size:12px;color:var(--mut);margin-bottom:8px}\n"
            ".log-box{background:#070d17;border:1px solid var(--bdr);border-radius:8px;padding:12px 14px;font-family:'Courier New',Consolas,monospace;font-size:12px;height:430px;overflow-y:auto;line-height:1.65}\n"
            ".log-line{color:#7a8fa8;margin:0}\n"
            ".log-line.err{color:#f87171}.log-line.wrn{color:#fbbf24}\n"
            ".log-ctrl{display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap}\n"
            ".btn{padding:10px 22px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s}\n"
            ".btn-p{background:var(--grn);color:#fff}.btn-p:hover{background:#059669}.btn-p:disabled{opacity:.5;cursor:not-allowed}\n"
            ".btn-g{background:rgba(255,255,255,.07);color:var(--txt);border:1px solid var(--bdr)}.btn-g:hover{background:rgba(255,255,255,.12)}\n"
            ".btn-sm{padding:6px 14px;font-size:13px}\n"
            ".mo{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(4px)}\n"
            ".mo-box{background:#1e293b;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px;max-width:560px;width:90%}\n"
            ".mo-title{font-size:17px;font-weight:700;color:var(--grn);margin-bottom:16px}\n"
            ".mo-log{background:#070d17;border-radius:8px;padding:14px;font-family:monospace;font-size:12px;height:220px;overflow-y:auto;color:#7a8fa8;margin-bottom:16px}\n"
            ".ip-list{display:flex;flex-wrap:wrap;gap:8px}\n"
            ".ip-chip{background:rgba(0,0,0,.3);padding:5px 12px;border-radius:6px;font-family:monospace;font-size:13px}\n"
            ".list-stack{display:flex;flex-direction:column;gap:8px}\n"
            ".list-item{background:rgba(0,0,0,.2);padding:10px 14px;border-radius:8px;font-size:13px}\n"
            ".act-row{display:flex;align-items:center;justify-content:space-between;padding:16px;background:rgba(0,0,0,.2);border-radius:10px;gap:16px}\n"
            ".act-info h3{font-size:14px;font-weight:600;margin-bottom:4px}\n"
            ".act-info p{font-size:13px;color:var(--mut)}\n"
            "</style>\n"
            "</head>\n"
            "<body>\n"
            '<header class="hdr">\n'
            f'  <div class="hdr-l"><span class="logo">⚙ Agent AutoUpdate</span><span class="host-chip">{h_hostname}</span></div>\n'
            f'  <div class="hdr-r"><span class="ver-chip" id="hdr-ver">v{h_version}</span><span class="usr-chip">👤 {h_user}</span><a href="/logout" class="logout">Déconnexion</a></div>\n'
            "</header>\n"
            '<div class="sbar">\n'
            '  <div class="sbar-item"><div class="dot"></div><span>En ligne</span></div>\n'
            f'  <div class="sbar-item">Poll : <strong id="sb-poll">{last_poll}</strong></div>\n'
            f'  <div class="sbar-item">MàJ : <strong id="sb-upd">{last_update}</strong></div>\n'
            f'  <div class="reboot-pill" id="sb-reboot" style="{reboot_pill_style}">⚠️ Redémarrage requis</div>\n'
            "</div>\n"
            '<nav class="tabs">\n'
            '  <button class="tab active" onclick="showTab(\'ov\',this)">📊 Aperçu</button>\n'
            '  <button class="tab" onclick="showTab(\'res\',this)">💻 Ressources</button>\n'
            '  <button class="tab" onclick="showTab(\'logs\',this)">📋 Journaux</button>\n'
            '  <button class="tab" onclick="showTab(\'act\',this)">⚡ Actions</button>\n'
            "</nav>\n"
            '<div class="wrap">\n'

            # ── Aperçu ──
            '<div id="pane-ov" class="pane active">\n'
            '<div class="card"><div class="card-title">Informations système</div><div class="igrid">\n'
            f'<div class="icell"><div class="ilbl">Hostname</div><div class="ival">{h_hostname}</div></div>\n'
            f'<div class="icell"><div class="ilbl">Adresse IP</div><div class="ival">{h_ip}</div></div>\n'
            f'<div class="icell"><div class="ilbl">OS</div><div class="ival" style="font-size:13px">{h_os}</div></div>\n'
            f'<div class="icell"><div class="ilbl">Version Agent</div><div class="ival" id="ov-ver">{h_version}</div></div>\n'
            f'<div class="icell"><div class="ilbl">Firewall</div><div class="ival" style="font-size:13px">{h_fw}</div></div>\n'
            f'<div class="icell"><div class="ilbl">Packages installés</div><div class="ival">{packages_count}</div></div>\n'
            "</div></div>\n"

            '<div class="card"><div class="card-title">État des mises à jour</div><div class="igrid">\n'
            f'<div class="icell" style="grid-column:span 2"><div class="ilbl">Serveur Dashboard</div><div class="ival" style="font-size:13px;font-family:monospace">{h_dash}</div></div>\n'
            f'<div class="icell"><div class="ilbl">Dernier poll</div><div class="ival" style="font-size:13px" id="ov-poll">{last_poll}</div></div>\n'
            f'<div class="icell"><div class="ilbl">Dernière MàJ</div><div class="ival" style="font-size:13px" id="ov-upd">{last_update}</div></div>\n'
            f'<div class="icell"><div class="ilbl">Redémarrage requis</div><div class="ival" id="ov-reboot" style="{reboot_style}">{reboot_val}</div></div>\n'
            "</div></div>\n"
            f"{ip_section}\n{gpu_section}\n"
            "</div>\n"  # end pane-ov

            # ── Ressources ──
            '<div id="pane-res" class="pane">\n'
            '<div class="two-col">\n'
            '<div class="card"><div class="card-title">CPU</div>\n'
            f'<div style="font-size:13px;margin-bottom:4px;overflow-wrap:break-word">{cpu_model}</div>\n'
            f'<div style="font-size:12px;color:var(--mut);margin-bottom:16px">{cpu_cores} cœurs / {cpu_threads} threads</div>\n'
            '<div class="res-item">\n'
            f'<div class="res-hdr"><span class="res-lbl">Utilisation</span><span class="res-val" id="cpu-pct">{cpu_pct}%</span></div>\n'
            f'<div class="prog-track"><div class="prog-fill {cpu_bar_cls}" id="cpu-bar" style="width:{cpu_pct}%"></div></div>\n'
            f'<div class="res-sub" id="cpu-free">{cpu_free}% disponible</div>\n'
            "</div></div>\n"
            '<div class="card"><div class="card-title">Mémoire</div>\n'
            f'<div style="font-size:13px;margin-bottom:16px">Total : <strong>{mem_total}</strong></div>\n'
            '<div class="res-item">\n'
            f'<div class="res-hdr"><span class="res-lbl">Utilisé</span><span class="res-val" id="mem-used">{mem_used}</span></div>\n'
            f'<div class="prog-track"><div class="prog-fill {mem_bar_cls}" id="mem-bar" style="width:{mem_pct}%"></div></div>\n'
            f'<div class="res-sub" id="mem-free">Disponible : {mem_free}</div>\n'
            "</div></div>\n"
            "</div>\n"  # two-col
            '<div class="card"><div class="card-title">Stockage</div>\n'
            f'<div id="disk-list">{disk_html}</div>\n'
            "</div>\n"
            "</div>\n"  # end pane-res

            # ── Journaux ──
            '<div id="pane-logs" class="pane">\n'
            '<div class="card"><div class="card-title">Journaux de l\'agent</div>\n'
            '<div class="log-ctrl">\n'
            '<button class="btn btn-g btn-sm" onclick="loadLogs()">🔄 Rafraîchir</button>\n'
            '<button class="btn btn-g btn-sm" onclick="scrollBottom()">⬇ Fin</button>\n'
            '<label style="font-size:13px;color:var(--mut);display:flex;align-items:center;gap:6px;cursor:pointer;margin-left:4px">'
            '<input type="checkbox" id="auto-sc" checked> Auto-défilement</label>\n'
            '<span id="log-cnt" style="font-size:12px;color:var(--mut);margin-left:auto"></span>\n'
            "</div>\n"
            '<div class="log-box" id="log-box"><div class="log-line" style="color:var(--mut)">Chargement...</div></div>\n'
            "</div></div>\n"  # end pane-logs

            # ── Actions ──
            '<div id="pane-act" class="pane">\n'
            '<div class="card"><div class="card-title">Actions disponibles</div>\n'
            '<div class="act-row"><div class="act-info">'
            '<h3>Lancer une mise à jour système</h3>'
            '<p>Exécute apt/yum pour mettre à jour les packages installés.</p>'
            '</div>'
            '<button class="btn btn-p" onclick="runUpdate()" style="flex-shrink:0">🔄 Mettre à jour</button>'
            "</div></div></div>\n"  # end pane-act

            "</div>\n"  # end wrap

            "<script>\n"
            "function showTab(id,el){\n"
            "  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));\n"
            "  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));\n"
            "  document.getElementById('pane-'+id).classList.add('active');\n"
            "  el.classList.add('active');\n"
            "  if(id==='logs')loadLogs();\n"
            "}\n"

            "function fmtB(b){\n"
            "  if(!b)return'0 B';\n"
            "  if(b>=1099511627776)return(b/1099511627776).toFixed(1)+' TB';\n"
            "  if(b>=1073741824)return(b/1073741824).toFixed(1)+' GB';\n"
            "  if(b>=1048576)return(b/1048576).toFixed(1)+' MB';\n"
            "  if(b>=1024)return(b/1024).toFixed(1)+' KB';\n"
            "  return b+' B';\n"
            "}\n"
            "function barCls(p){return p>=90?'danger':p>=75?'warn':''}\n"
            "function setBar(id,pct){\n"
            "  const el=document.getElementById(id);\n"
            "  if(!el)return;\n"
            "  el.style.width=pct+'%';\n"
            "  el.className='prog-fill '+barCls(pct);\n"
            "}\n"
            "function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}\n"

            "async function refresh(){\n"
            "  try{\n"
            "    const d=await fetch('/api/status').then(r=>r.json());\n"
            "    const poll=d.lastPoll||'—',upd=d.lastUpdate||'—';\n"
            "    ['sb-poll','ov-poll'].forEach(i=>setText(i,poll));\n"
            "    ['sb-upd','ov-upd'].forEach(i=>setText(i,upd));\n"
            "    const rb=document.getElementById('sb-reboot');\n"
            "    const ovRb=document.getElementById('ov-reboot');\n"
            "    if(rb)rb.style.display=d.rebootRequired?'':'none';\n"
            "    if(ovRb){ovRb.textContent=d.rebootRequired?'Oui ⚠️':'Non ✓';ovRb.style.color=d.rebootRequired?'#f59e0b':'#10b981';}\n"
            "    if(d.version){const v='v'+d.version;setText('hdr-ver',v);setText('ov-ver',d.version);}\n"
            "    const cpu=d.cpu||{};\n"
            "    const cp=cpu.usagePercent||0;\n"
            "    setText('cpu-pct',cp+'%');\n"
            "    setBar('cpu-bar',cp);\n"
            "    setText('cpu-free',(100-cp).toFixed(1)+'% disponible');\n"
            "    const mem=d.memory||{};\n"
            "    const mt=mem.totalBytes||1,mu=mem.usedBytes||0,mf=mem.availableBytes||0;\n"
            "    const mp=Math.round(mu/mt*100);\n"
            "    setText('mem-used',fmtB(mu));\n"
            "    setBar('mem-bar',mp);\n"
            "    setText('mem-free','Disponible : '+fmtB(mf));\n"
            "  }catch(e){console.warn('refresh err',e);}\n"
            "}\n"
            "setInterval(refresh,5000);\n"
            "refresh();\n"

            "async function loadLogs(){\n"
            "  const box=document.getElementById('log-box');\n"
            "  const cnt=document.getElementById('log-cnt');\n"
            "  try{\n"
            "    const d=await fetch('/api/logs').then(r=>r.json());\n"
            "    const lines=d.logs||[];\n"
            "    if(cnt)cnt.textContent=lines.length+' lignes';\n"
            "    box.innerHTML=lines.map(l=>{\n"
            "      const e=l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n"
            "      const c=/error|erreur|failed/i.test(l)?'err':/warn/i.test(l)?'wrn':'';\n"
            "      return '<div class=\"log-line '+c+'\">'+e+'</div>';\n"
            "    }).join('');\n"
            "    if(document.getElementById('auto-sc')?.checked)scrollBottom();\n"
            "  }catch(e){box.innerHTML='<div class=\"log-line err\">Erreur de chargement.</div>';}\n"
            "}\n"
            "function scrollBottom(){const b=document.getElementById('log-box');if(b)b.scrollTop=b.scrollHeight;}\n"
            "setInterval(()=>{const p=document.getElementById('pane-logs');if(p&&p.classList.contains('active'))loadLogs();},10000);\n"

            "async function runUpdate(){\n"
            "  if(!confirm('Lancer une mise à jour maintenant ?'))return;\n"
            "  const ov=document.createElement('div');\n"
            "  ov.className='mo';\n"
            "  ov.innerHTML='<div class=\"mo-box\"><div class=\"mo-title\">⚙️ Mise à jour en cours...</div>'"
            "+'<div class=\"mo-log\" id=\"mu-log\">Démarrage...<br></div>'"
            "+'<button id=\"mu-btn\" class=\"btn btn-g\" style=\"width:100%\" disabled>En cours...</button></div>';\n"
            "  document.body.appendChild(ov);\n"
            "  const logEl=document.getElementById('mu-log');\n"
            "  const btn=document.getElementById('mu-btn');\n"
            "  function addLog(msg,col){\n"
            "    const sp=document.createElement('span');\n"
            "    if(col)sp.style.color=col;\n"
            "    sp.textContent=msg;\n"
            "    logEl.appendChild(sp);\n"
            "    logEl.appendChild(document.createElement('br'));\n"
            "    logEl.scrollTop=logEl.scrollHeight;\n"
            "  }\n"
            "  try{\n"
            "    const r=await fetch('/api/run-update',{method:'POST'});\n"
            "    const d=await r.json();\n"
            "    if(d.success){\n"
            "      addLog('✓ Mise à jour terminée !','#10b981');\n"
            "      if(d.message)addLog(d.message,'#94a3b8');\n"
            "      btn.disabled=false;btn.textContent='Fermer et rafraîchir';\n"
            "      btn.className='btn btn-p';btn.style.width='100%';\n"
            "      btn.onclick=()=>location.reload();\n"
            "    }else{\n"
            "      addLog('✗ Erreur : '+(d.error||'Échec'),'#f87171');\n"
            "      btn.disabled=false;btn.textContent='Fermer';\n"
            "      btn.onclick=()=>ov.remove();\n"
            "    }\n"
            "  }catch(e){\n"
            "    addLog('✗ Erreur réseau : '+e.message,'#f87171');\n"
            "    btn.disabled=false;btn.textContent='Fermer';\n"
            "    btn.onclick=()=>ov.remove();\n"
            "  }\n"
            "}\n"
            "</script>\n"
            "</body></html>"
        )
        self.send_html(html)
    
    def api_status(self):
        """API: Get agent status including live resource metrics."""
        state = read_state()

        try:
            sys_info = collect_system_info()
        except:
            sys_info = {}

        def fmt_ts(iso_str):
            if not iso_str:
                return None
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
                return dt.astimezone().strftime('%Y-%m-%d %H:%M:%S')
            except:
                return iso_str

        self.send_json({
            "status": "online",
            "hostname": get_hostname(),
            "ip": get_primary_ip(),
            "version": get_agent_version(),
            "lastPoll": fmt_ts(state.get("lastPoll")),
            "lastUpdate": fmt_ts(state.get("lastUpdate")),
            "rebootRequired": get_reboot_required(),
            "cpu": sys_info.get("cpu", {}),
            "memory": sys_info.get("memory", {}),
            "uptimeSeconds": get_uptime_seconds(),
        })
    
    def api_info(self):
        """API: Get detailed system info."""
        try:
            sys_info = collect_system_info()
            self.send_json(sys_info)
        except Exception as e:
            log(f"Erreur api_info: {e}")
            self.send_json({"error": "Internal server error"}, 500)
    
    def api_logs(self):
        """API: Get recent agent logs."""
        log_file = LOG_DIR / "agent.log"
        if not log_file.exists():
            self.send_json({"logs": []})
            return
        
        try:
            lines = log_file.read_text().strip().split("\n")[-100:]  # Last 100 lines
            self.send_json({"logs": lines})
        except Exception as e:
            log(f"Erreur api_logs: {e}")
            self.send_json({"error": "Internal server error"}, 500)

    def api_firewall_status(self):
        """API: Get firewall status."""
        if not FIREWALL_AVAILABLE:
            self.send_json({"available": False})
            return
        
        fw = get_firewall_manager()
        self.send_json({
            "available": True,
            **fw.get_status()
        })
    
    def api_run_update(self):
        """API: Trigger an update check."""
        try:
            # Import and run the update from agent_runner
            import sys
            from pathlib import Path
            # Add parent directory to path to import agent_runner
            app_dir = Path(__file__).parent.parent
            if str(app_dir) not in sys.path:
                sys.path.insert(0, str(app_dir))
            from agent_runner import run_update
            result = run_update()
            self.send_json({
                "success": True, 
                "status": result.get("status"),
                "message": result.get("message", "Mise à jour terminée")
            })
        except Exception as e:
            log(f"Erreur lors de la mise à jour: {e}")
            self.send_json({"success": False, "error": "Update failed"}, 500)


class LocalWebManager:
    """
    Manages the local web server lifecycle, including:
    - Starting/stopping the server
    - Firewall configuration
    - Configuration persistence
    """
    
    def __init__(self):
        self.server: Optional[ThreadedHTTPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.current_port: Optional[int] = None
        self.enabled: bool = False
        
        # Load saved state
        self._load_state()
    
    def _load_state(self):
        """Load saved state from file."""
        try:
            if LOCAL_WEB_STATE_FILE.exists():
                data = json.loads(LOCAL_WEB_STATE_FILE.read_text())
                self.current_port = data.get("port")
                self.enabled = data.get("enabled", False)
        except (json.JSONDecodeError, IOError) as e:
            log(f"Erreur lecture état local web: {e}")
    
    def _save_state(self):
        """Save current state to file."""
        try:
            LOCAL_WEB_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            LOCAL_WEB_STATE_FILE.write_text(json.dumps({
                "port": self.current_port,
                "enabled": self.enabled
            }, indent=2))
        except IOError as e:
            log(f"Erreur sauvegarde état local web: {e}")
    
    def apply_config(self, config: dict):
        """
        Apply configuration received from the dashboard.
        
        This handles:
        - Enabling/disabling the local web server
        - Changing ports
        - Managing firewall rules
        
        Args:
            config: Agent configuration with localWeb settings
        """
        local_web_config = config.get("localWeb", {})
        new_enabled = local_web_config.get("enabled", False)
        new_port = local_web_config.get("port", 8180)

        if platform.system() != "Linux" and new_enabled:
            log("Local web interface is supported on Linux agents only.")
            new_enabled = False
        
        # Validate port
        if new_port not in ALLOWED_PORTS:
            log(f"Port {new_port} non autorisé. Ports valides: {ALLOWED_PORTS}")
            new_port = 8180
        
        log(f"Application config local web: enabled={new_enabled}, port={new_port}")
        
        # Case 1: Disable
        if not new_enabled:
            if self.enabled:
                self._stop_server()
                self._close_firewall_port()
            self.enabled = False
            self._save_state()
            return
        
        # Case 2: Enable or change port
        log(f"[LocalWeb] État actuel: enabled={self.enabled}, current_port={self.current_port}, server_running={self.server is not None}")
        if self.enabled and self.current_port != new_port:
            # Port change - stop old, open new firewall, start new
            self._stop_server()
            if FIREWALL_AVAILABLE:
                update_port(self.current_port, new_port)
            self.current_port = new_port
            self._start_server(new_port, local_web_config)
        elif self.enabled and self.current_port == new_port and self.server is None:
            # Server was enabled but crashed/restarted - restart it
            log(f"[LocalWeb] Serveur était activé mais non actif, redémarrage sur port {new_port}")
            self._start_server(new_port, local_web_config)
        elif not self.enabled:
            # Fresh start
            log(f"[LocalWeb] Démarrage initial sur port {new_port}")
            if FIREWALL_AVAILABLE:
                open_port(new_port)
            self.current_port = new_port
            self._start_server(new_port, local_web_config)
        
        self.enabled = True
        self._save_state()
    
    def _start_server(self, port: int, config: dict):
        """Start the HTTP server on the specified port."""
        try:
            log(f"[LocalWeb] Tentative démarrage serveur sur port {port}")
            AgentWebHandler.manager = self
            self.server = ThreadedHTTPServer(("0.0.0.0", port), AgentWebHandler)
            
            # Enable HTTPS if certificates are configured
            ssl_config = config.get("ssl", {})
            if ssl_config.get("enabled"):
                cert_path = ssl_config.get("certPath")
                key_path = ssl_config.get("keyPath")
                if cert_path and key_path:
                    cert_path = Path(cert_path)
                    key_path = Path(key_path)
                    if cert_path.exists() and key_path.exists():
                        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                        context.load_cert_chain(str(cert_path), str(key_path))
                        self.server.socket = context.wrap_socket(
                            self.server.socket, server_side=True
                        )
                        log(f"[LocalWeb] HTTPS activé sur port {port}")
            
            self.server_thread = threading.Thread(
                target=self.server.serve_forever,
                daemon=True
            )
            self.server_thread.start()
            
            protocol = "https" if ssl_config.get("enabled") else "http"
            log(f"[LocalWeb] Serveur démarré: {protocol}://0.0.0.0:{port}")
            
        except Exception as e:
            log(f"[LocalWeb] Échec démarrage serveur: {e}")
            self.server = None
            self.server_thread = None
    
    def _stop_server(self):
        """Stop the HTTP server if running."""
        if self.server:
            try:
                self.server.shutdown()
                log("[LocalWeb] Serveur arrêté")
            except Exception as e:
                log(f"[LocalWeb] Erreur arrêt serveur: {e}")
            finally:
                self.server = None
                self.server_thread = None
    
    def _close_firewall_port(self):
        """Close the firewall port."""
        if FIREWALL_AVAILABLE and self.current_port:
            close_port(self.current_port)
            self.current_port = None
    
    def stop(self):
        """Stop the server and clean up firewall."""
        self._stop_server()
        self._close_firewall_port()
        self.enabled = False
        self._save_state()
    
    def is_running(self) -> bool:
        """Check if the server is running."""
        return self.server is not None
    
    def get_status(self) -> dict:
        """Get the current status of the local web server."""
        firewall_status = None
        if FIREWALL_AVAILABLE:
            fw = get_firewall_manager()
            firewall_status = fw.get_status()
        
        return {
            "enabled": self.enabled,
            "running": self.is_running(),
            "port": self.current_port,
            "firewall": firewall_status
        }


# Global manager instance
_manager: Optional[LocalWebManager] = None


def get_local_web_manager() -> LocalWebManager:
    """Get the singleton LocalWebManager instance."""
    global _manager
    if _manager is None:
        _manager = LocalWebManager()
    return _manager


# Convenience functions for backward compatibility
def start_local_server(config: dict) -> bool:
    """Start the local web server if enabled in config."""
    manager = get_local_web_manager()
    manager.apply_config(config)
    return manager.is_running()


def stop_local_server():
    """Stop the local web server."""
    if _manager:
        _manager.stop()


def is_server_running() -> bool:
    """Check if the local web server is running."""
    return _manager is not None and _manager.is_running()
