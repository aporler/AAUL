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
import os
import ssl
import threading
import time
import base64
from functools import wraps
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from typing import Optional

from .config import load_config, read_state, get_agent_version
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
LOCAL_WEB_STATE_FILE = Path("/var/lib/autoupdate-agent/local_web_state.json")


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
    
    def send_json(self, data, status=200):
        """Send JSON response."""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode())
    
    def send_html(self, html, status=200):
        """Send HTML response."""
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
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
        error_html = f'<div class="error">{error}</div>' if error else ""
        
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
    
    def handle_login(self, body: str):
        """Handle login form submission."""
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
            log(f"Connexion réussie pour {username}")
            self.send_response(302)
            # Set session cookie (HttpOnly, Secure if HTTPS)
            cookie = f"session={token}; Path=/; HttpOnly; SameSite=Strict"
            self.send_header("Set-Cookie", cookie)
            self.send_header("Location", "/")
            self.end_headers()
        else:
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
                return "N/A"
            try:
                from datetime import datetime, timezone
                # Parse UTC timestamp
                dt = datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
                # Convert to local timezone
                local_dt = dt.astimezone()
                return local_dt.strftime('%Y-%m-%d %H:%M:%S')
            except:
                return iso_str
        
        last_poll = format_timestamp(state.get("lastPoll"))
        last_update = format_timestamp(state.get("lastUpdate"))
        dashboard_url = config.get("dashboardUrl", "N/A")
        
        # Firewall status
        firewall_status = "Non disponible"
        if FIREWALL_AVAILABLE:
            fw = get_firewall_manager()
            status = fw.get_status()
            if status["active"]:
                firewall_status = f"{status['firewall_type']} (actif)"
            else:
                firewall_status = "Aucun firewall actif"
        
        # Format OS info
        os_info = sys_info.get('os', {})
        if isinstance(os_info, dict):
            os_name = os_info.get('name', 'N/A')
            os_version = os_info.get('version', '')
            os_display = f"{os_name} {os_version}".strip()
        else:
            os_display = str(os_info)
        
        # Extract system info
        cpu = sys_info.get('cpu', {})
        memory = sys_info.get('memory', {})
        disks = [d for d in sys_info.get('disks', []) if d.get('totalBytes', 0) > 0]  # Filter valid disks
        ips = sys_info.get('ips', [])
        gpus = sys_info.get('gpu', [])
        packages_count = sys_info.get('packagesInstalled', 0)
        
        # Helper function to format bytes
        def formatBytes(size):
            if not size or size == 0:
                return "0 B"
            if size < 1024:
                return f"{size} B"
            if size < 1024 * 1024:
                return f"{size / 1024:.1f} KB"
            if size < 1024 * 1024 * 1024:
                return f"{size / (1024 * 1024):.1f} MB"
            return f"{size / (1024 * 1024 * 1024):.2f} GB"
        
        # Helper function to create donut chart SVG
        def create_donut(used, total, size=88, thickness=10):
            if not total or total == 0:
                return ""
            percentage = (used / total) * 100
            radius = (size - thickness) / 2
            circumference = 2 * 3.14159 * radius
            offset = circumference - (percentage / 100 * circumference)
            center = size / 2
            
            return f'''
            <svg class="donut-chart" viewBox="0 0 {size} {size}">
                <circle cx="{center}" cy="{center}" r="{radius}" 
                    fill="none" stroke="#374151" stroke-width="{thickness}"/>
                <circle cx="{center}" cy="{center}" r="{radius}" 
                    fill="none" stroke="#10b981" stroke-width="{thickness}"
                    stroke-dasharray="{circumference}" 
                    stroke-dashoffset="{offset}"
                    transform="rotate(-90 {center} {center})"
                    style="transition: stroke-dashoffset 0.5s;"/>
                <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                    fill="#10b981" font-size="16" font-weight="700">
                    {int(percentage)}%
                </text>
            </svg>
            '''
        
        html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Auto Update - {hostname}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 20px;
        }}
        .container {{ max-width: 900px; margin: 0 auto; }}
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }}
        .header h1 {{ color: #10b981; }}
        .user-info {{
            display: flex;
            align-items: center;
            gap: 16px;
        }}
        .user-badge {{
            background: rgba(16, 185, 129, 0.2);
            color: #10b981;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
        }}
        .logout-btn {{
            background: transparent;
            border: 1px solid #ef4444;
            color: #ef4444;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            font-size: 14px;
            transition: all 0.2s;
        }}
        .logout-btn:hover {{
            background: #ef4444;
            color: white;
        }}
        .card {{
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
        }}
        .card h2 {{
            color: #10b981;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .info-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }}
        .info-item {{
            background: rgba(0, 0, 0, 0.2);
            padding: 16px;
            border-radius: 8px;
        }}
        .info-item label {{
            color: #9ca3af;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .info-item .value {{
            font-size: 18px;
            font-weight: 600;
            margin-top: 4px;
            word-break: break-all;
        }}
        .status-badge {{
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }}
        .status-online {{ background: #10b981; color: white; }}
        .status-offline {{ background: #ef4444; color: white; }}
        .actions {{
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }}
        .btn {{
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .btn-primary {{
            background: #10b981;
            color: white;
        }}
        .btn-primary:hover {{ background: #059669; }}
        .btn-secondary {{
            background: rgba(255, 255, 255, 0.1);
            color: #e0e0e0;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }}
        .btn-secondary:hover {{ background: rgba(255, 255, 255, 0.2); }}
        .footer {{
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            margin-top: 40px;
        }}
        .donut-container {{
            display: flex;
            align-items: center;
            gap: 16px;
            margin-top: 12px;
        }}
        .donut-chart {{
            position: relative;
            width: 88px;
            height: 88px;
        }}
        .donut-text {{
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            font-size: 16px;
            font-weight: 700;
            color: #10b981;
        }}
        .donut-legend {{
            flex: 1;
        }}
        .legend-item {{
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 13px;
        }}
        .legend-label {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}
        .legend-dot {{
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }}
        .dot-used {{ background: #10b981; }}
        .dot-free {{ background: #374151; }}
        .resources-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🖥️ Agent AutoUpdate</h1>
            <div class="user-info">
                <span class="user-badge">👤 {username}</span>
                <a href="/logout" class="logout-btn">Déconnexion</a>
            </div>
        </div>
        
        <div class="card">
            <h2>📊 Informations système</h2>
            <div class="info-grid">
                <div class="info-item">
                    <label>Hostname</label>
                    <div class="value">{hostname}</div>
                </div>
                <div class="info-item">
                    <label>Adresse IP</label>
                    <div class="value">{ip_address}</div>
                </div>
                <div class="info-item">
                    <label>Version Agent</label>
                    <div class="value">{version}</div>
                </div>
                <div class="info-item">
                    <label>OS</label>
                    <div class="value">{os_display}</div>
                </div>
                <div class="info-item">
                    <label>Firewall</label>
                    <div class="value">{firewall_status}</div>
                </div>
                <div class="info-item">
                    <label>Statut</label>
                    <div class="value"><span class="status-badge status-online">En ligne</span></div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>🔄 État des mises à jour</h2>
            <div class="info-grid">
                <div class="info-item">
                    <label>Dashboard</label>
                    <div class="value" style="font-size: 14px;">{dashboard_url}</div>
                </div>
                <div class="info-item">
                    <label>Dernier poll</label>
                    <div class="value" style="font-size: 14px;">{last_poll}</div>
                </div>
                <div class="info-item">
                    <label>Dernière mise à jour</label>
                    <div class="value" style="font-size: 14px;">{last_update}</div>
                </div>
                <div class="info-item">
                    <label>Redémarrage requis</label>
                    <div class="value">{'Oui ⚠️' if get_reboot_required() else 'Non ✓'}</div>
                </div>
            </div>
        </div>
        
        <div class="resources-grid">
            <div class="card">
                <h3 style="color: #10b981; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3em;">CPU</h3>
                <div style="font-size: 13px; color: #e0e0e0; margin-bottom: 8px;">{cpu.get('model', 'N/A')}</div>
                <div style="font-size: 11px; color: #9ca3af; margin-bottom: 12px;">
                    Cores: {cpu.get('cores', 0)} / Threads: {cpu.get('threads', 0)}
                </div>
                <div class="donut-container">
                    {create_donut(cpu.get('usagePercent', 0), 100)}
                    <div class="donut-legend">
                        <div class="legend-item">
                            <span class="legend-label">
                                <span class="legend-dot dot-used"></span>
                                Utilisé
                            </span>
                            <span>{cpu.get('usagePercent', 0)}%</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-label">
                                <span class="legend-dot dot-free"></span>
                                Disponible
                            </span>
                            <span>{round(100 - cpu.get('usagePercent', 0), 1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <h3 style="color: #10b981; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3em;">Mémoire</h3>
                <div style="font-size: 13px; color: #e0e0e0; margin-bottom: 12px;">
                    Total: {formatBytes(memory.get('totalBytes', 0))}
                </div>
                <div class="donut-container">
                    {create_donut(memory.get('usedBytes', 0), memory.get('totalBytes', 1))}
                    <div class="donut-legend">
                        <div class="legend-item">
                            <span class="legend-label">
                                <span class="legend-dot dot-used"></span>
                                Utilisé
                            </span>
                            <span>{formatBytes(memory.get('usedBytes', 0))}</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-label">
                                <span class="legend-dot dot-free"></span>
                                Disponible
                            </span>
                            <span>{formatBytes(memory.get('availableBytes', 0))}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        {''.join([f'''
        <div class="card" style="margin-top: 20px;">
            <h3 style="color: #10b981; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3em;">Disque - {disk.get('mountpoint', '/')}</h3>
            <div style="font-size: 13px; color: #e0e0e0; margin-bottom: 12px;">
                {disk.get('device', 'N/A')} • Total: {formatBytes(disk.get('totalBytes', 0))}
            </div>
            <div class="donut-container">
                {create_donut(disk.get('usedBytes', 0), disk.get('totalBytes', 1))}
                <div class="donut-legend">
                    <div class="legend-item">
                        <span class="legend-label">
                            <span class="legend-dot dot-used"></span>
                            Utilisé
                        </span>
                        <span>{formatBytes(disk.get('usedBytes', 0))}</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-label">
                            <span class="legend-dot dot-free"></span>
                            Disponible
                        </span>
                        <span>{formatBytes(disk.get('availableBytes', 0))}</span>
                    </div>
                </div>
            </div>
        </div>
        ''' for disk in disks[:3]])}
        
        {f'''
        <div class="card" style="margin-top: 20px;">
            <h3 style="color: #10b981; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3em;">Adresses IP</h3>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                {''.join([f'<div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 13px;">{ip}</div>' for ip in ips[:6]])}
            </div>
        </div>
        ''' if ips else ''}
        
        {f'''
        <div class="card" style="margin-top: 20px;">
            <h3 style="color: #10b981; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3em;">GPU</h3>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                {''.join([f'<div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; font-size: 13px;">{gpu}</div>' for gpu in gpus])}
            </div>
        </div>
        ''' if gpus else ''}
        
        <div class="card" style="margin-top: 20px;">
            <h3 style="color: #10b981; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.3em;">Packages</h3>
            <div style="font-size: 24px; font-weight: 700; color: #10b981;">{packages_count} packages installés</div>
        </div>
        
        <div class="card">
            <h2>⚡ Actions</h2>
            <div class="actions">
                <button class="btn btn-primary" onclick="runUpdate()">
                    🔄 Lancer mise à jour
                </button>
                <button class="btn btn-secondary" onclick="location.reload()">
                    🔃 Rafraîchir
                </button>
            </div>
        </div>
        
        <div class="footer">
            Agent Auto Update v{version} • Interface locale
        </div>
    </div>
    
    <script>
        let modalOpen = false;
        
        // Auto-refresh data every 10 seconds (without reloading page)
        async function refreshData() {{
            if (modalOpen) return; // Don't refresh while modal is open
            
            try {{
                const resp = await fetch('/api/status');
                const data = await resp.json();
                
                // Update page elements without reload
                // Note: For now just reload if no modal is open
                // In production, update individual DOM elements
                location.reload();
            }} catch (err) {{
                console.error('Refresh failed:', err);
            }}
        }}
        
        setInterval(refreshData, 10000);
        
        async function runUpdate() {{
            if (!confirm('Lancer une mise à jour maintenant ?')) return;
            
            modalOpen = true;
            
            // Show modal with progress
            const modal = document.createElement('div');
            modal.id = 'update-modal';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;';
            modal.innerHTML = `
                <div style="background: #1a1a2e; padding: 32px; border-radius: 16px; max-width: 600px; width: 90%; max-height: 80vh; overflow: auto; border: 1px solid rgba(16, 185, 129, 0.3);">
                    <h3 style="color: #10b981; margin-bottom: 16px;">⚙️ Mise à jour en cours...</h3>
                    <div id="update-logs" style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; font-family: monospace; font-size: 12px; max-height: 400px; overflow-y: auto;">
                        Démarrage de la mise à jour...<br>
                    </div>
                    <button id="close-modal-btn" style="margin-top: 16px; padding: 12px 24px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer; width: 100%;" disabled>
                        En cours...
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
            
            const logsDiv = document.getElementById('update-logs');
            const closeBtn = document.getElementById('close-modal-btn');
            
            try {{
                const resp = await fetch('/api/run-update', {{ method: 'POST' }});
                const data = await resp.json();
                
                if (data.success) {{
                    logsDiv.innerHTML += '<span style="color: #10b981;">✓ Mise à jour lancée avec succès !</span><br>';
                    logsDiv.innerHTML += 'Statut: ' + (data.status || 'OK') + '<br>';
                    logsDiv.innerHTML += 'Message: ' + (data.message || 'Terminé') + '<br>';
                    closeBtn.disabled = false;
                    closeBtn.style.background = '#10b981';
                    closeBtn.textContent = 'Fermer et rafraîchir';
                    closeBtn.onclick = () => location.reload();
                }} else {{
                    logsDiv.innerHTML += '<span style="color: #ef4444;">✗ Erreur: ' + (data.error || 'Échec de la mise à jour') + '</span><br>';
                    closeBtn.disabled = false;
                    closeBtn.style.background = '#ef4444';
                    closeBtn.textContent = 'Fermer';
                    closeBtn.onclick = () => {{
                        document.getElementById('update-modal').remove();
                        modalOpen = false;
                    }};
                }}
            }} catch (err) {{
                logsDiv.innerHTML += '<span style="color: #ef4444;">✗ Erreur de connexion: ' + err.message + '</span><br>';
                closeBtn.disabled = false;
                closeBtn.style.background = '#ef4444';
                closeBtn.textContent = 'Fermer';
                closeBtn.onclick = () => {{
                    document.getElementById('update-modal').remove();
                    modalOpen = false;
                }};
            }}
        }}
    </script>
</body>
</html>"""
        self.send_html(html)
    
    def api_status(self):
        """API: Get agent status."""
        config = load_config()
        state = read_state()
        
        self.send_json({
            "status": "online",
            "hostname": get_hostname(),
            "ip": get_primary_ip(),
            "version": get_agent_version(),
            "lastPoll": state.get("lastPoll"),
            "lastUpdate": state.get("lastUpdate"),
            "rebootRequired": get_reboot_required()
        })
    
    def api_info(self):
        """API: Get detailed system info."""
        try:
            sys_info = collect_system_info()
            self.send_json(sys_info)
        except Exception as e:
            self.send_json({"error": str(e)}, 500)
    
    def api_logs(self):
        """API: Get recent agent logs."""
        log_file = Path("/opt/agentautoupdate/agent.log")
        if not log_file.exists():
            self.send_json({"logs": []})
            return
        
        try:
            lines = log_file.read_text().strip().split("\n")[-100:]  # Last 100 lines
            self.send_json({"logs": lines})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)
    
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
            import traceback
            traceback.print_exc()
            self.send_json({"success": False, "error": str(e)}, 500)


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
