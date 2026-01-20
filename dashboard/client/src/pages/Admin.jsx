/**
 * Admin Settings Page
 * 
 * Provides configuration options for:
 * - Network settings (IP, ports)
 * - SSL/TLS configuration
 * - Agent local web interface settings
 * - Default polling intervals
 */

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";

// Server Management Component - HTTP/HTTPS Configuration
function ServerManagement({ t }) {
  const [restarting, setRestarting] = useState(false);
  const [serverExpanded, setServerExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [sslStatus, setSslStatus] = useState({ keyExists: false, certExists: false });
  
  // Configuration state
  const [config, setConfig] = useState({
    http: { enabled: true, apiPort: 3001, webPort: 5173 },
    https: { enabled: false, apiPort: 3002, webPort: 5174 },
    defaultApiProtocol: "http"
  });

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [configRes, sslRes] = await Promise.all([
        apiFetch("/api/admin/config"),
        apiFetch("/api/admin/config/ssl-status")
      ]);
      
      if (configRes.ok) {
        setConfig({
          http: configRes.config.http,
          https: configRes.config.https,
          defaultApiProtocol: configRes.config.defaultApiProtocol
        });
      }
      
      if (sslRes.ok) {
        setSslStatus(sslRes);
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleRestart = async () => {
    if (!confirm(t("admin.confirmRestart") || "Restart the server? The dashboard will be unavailable briefly.")) {
      return;
    }
    
    setRestarting(true);
    try {
      await apiFetch("/api/admin/restart", { method: "POST" });
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      console.error("Restart failed:", err);
      setRestarting(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage("");
    
    // Validation
    if (!config.http.enabled && !config.https.enabled) {
      setMessage("Error: At least one protocol must be enabled");
      setSaving(false);
      return;
    }
    
    if (config.https.enabled && (!sslStatus.keyExists || !sslStatus.certExists)) {
      setMessage("Error: SSL certificates not found. Generate them first.");
      setSaving(false);
      return;
    }
    
    try {
      const res = await apiFetch("/api/admin/config/server", {
        method: "POST",
        body: JSON.stringify(config)
      });
      setMessage(res.message || "Configuration saved!");
    } catch (err) {
      setMessage("Error: " + (err.message || "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const updateHttp = (key, value) => {
    setConfig(prev => ({ ...prev, http: { ...prev.http, [key]: value } }));
  };
  
  const updateHttps = (key, value) => {
    setConfig(prev => ({ ...prev, https: { ...prev.https, [key]: value } }));
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-slate-400">Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <button 
        className="w-full flex items-center justify-between text-left"
        onClick={() => setServerExpanded(!serverExpanded)}
      >
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>⚙️</span> {t("admin.serverManagement") || "Server Management"}
        </h3>
        <span className="text-slate-400">{serverExpanded ? "▼" : "▶"}</span>
      </button>
      
      {serverExpanded && (
        <div className="space-y-4 pt-4 border-t border-ink-600">
          
          {/* HTTP Configuration */}
          <div className="rounded-lg bg-ink-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                📡 HTTP Configuration
              </h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.http.enabled}
                  onChange={(e) => updateHttp("enabled", e.target.checked)}
                  className="w-4 h-4 rounded"
                  disabled={!config.https.enabled}
                />
                <span className="text-sm text-slate-300">Enabled</span>
              </label>
            </div>
            
            {config.http.enabled && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    HTTP API Port
                  </label>
                  <input
                    type="number"
                    className="input mt-2"
                    value={config.http.apiPort}
                    onChange={(e) => updateHttp("apiPort", parseInt(e.target.value) || 3001)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    HTTP Dashboard Port
                  </label>
                  <input
                    type="number"
                    className="input mt-2"
                    value={config.http.webPort}
                    onChange={(e) => updateHttp("webPort", parseInt(e.target.value) || 5173)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* HTTPS Configuration */}
          <div className="rounded-lg bg-ink-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                🔒 HTTPS Configuration
                {config.https.enabled && (
                  <span className="badge bg-emerald-500/20 text-emerald-300 text-xs">Active</span>
                )}
              </h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.https.enabled}
                  onChange={(e) => updateHttps("enabled", e.target.checked)}
                  className="w-4 h-4 rounded"
                  disabled={!config.http.enabled && !sslStatus.keyExists}
                />
                <span className="text-sm text-slate-300">Enabled</span>
              </label>
            </div>
            
            {/* SSL Certificate Status */}
            <div className="flex items-center gap-4 text-xs">
              <span className={`flex items-center gap-1 ${sslStatus.keyExists ? "text-emerald-400" : "text-red-400"}`}>
                {sslStatus.keyExists ? "✓" : "✗"} server.key
              </span>
              <span className={`flex items-center gap-1 ${sslStatus.certExists ? "text-emerald-400" : "text-red-400"}`}>
                {sslStatus.certExists ? "✓" : "✗"} server.crt
              </span>
            </div>
            
            {!sslStatus.keyExists || !sslStatus.certExists ? (
              <div className="rounded-lg bg-ink-900 p-3 text-xs">
                <p className="text-slate-400 mb-2">Generate self-signed certificates:</p>
                <code className="text-ocean-300 break-all text-xs">
                  cd dashboard && mkdir -p ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/server.key -out ssl/server.crt -subj "/CN=localhost"
                </code>
              </div>
            ) : config.https.enabled && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    HTTPS API Port
                  </label>
                  <input
                    type="number"
                    className="input mt-2"
                    value={config.https.apiPort}
                    onChange={(e) => updateHttps("apiPort", parseInt(e.target.value) || 3002)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    HTTPS Dashboard Port
                  </label>
                  <input
                    type="number"
                    className="input mt-2"
                    value={config.https.webPort}
                    onChange={(e) => updateHttps("webPort", parseInt(e.target.value) || 5174)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Default API Protocol (when both are enabled) */}
          {config.http.enabled && config.https.enabled && (
            <div className="rounded-lg bg-ink-800 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-200">
                🌐 Default API Protocol for Agents
              </h4>
              <p className="text-xs text-slate-400">
                When both HTTP and HTTPS are enabled, choose which protocol new agents will use by default.
                This allows a gradual migration to HTTPS without interrupting existing agents.
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="defaultProtocol"
                    checked={config.defaultApiProtocol === "http"}
                    onChange={() => setConfig(prev => ({ ...prev, defaultApiProtocol: "http" }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-300">HTTP (port {config.http.apiPort})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="defaultProtocol"
                    checked={config.defaultApiProtocol === "https"}
                    onChange={() => setConfig(prev => ({ ...prev, defaultApiProtocol: "https" }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-300">HTTPS (port {config.https.apiPort})</span>
                </label>
              </div>
            </div>
          )}

          {/* Message */}
          {message && (
            <p className={`text-sm ${message.startsWith("Error") ? "text-red-400" : "text-emerald-300"}`}>
              {message}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button 
              className="btn btn-primary"
              onClick={saveConfig}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
            <button 
              className="btn btn-secondary flex items-center gap-2"
              onClick={handleRestart}
              disabled={restarting}
            >
              <span className={restarting ? "animate-spin" : ""}>🔄</span>
              {restarting ? "Restarting..." : "Restart Server"}
            </button>
            <button 
              className="btn btn-secondary"
              onClick={loadConfig}
            >
              Refresh
            </button>
          </div>
          
          <p className="text-xs text-slate-500">
            After saving, click "Restart Server" to apply the changes.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { t } = useI18n();
  const [ips, setIps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  
  // Network settings
  const [publicIp, setPublicIp] = useState("");
  const [defaultPollSeconds, setDefaultPollSeconds] = useState("15");
  const [serverConfig, setServerConfig] = useState({
    http: { enabled: true, apiPort: 3001, webPort: 5173 },
    https: { enabled: false, apiPort: 3002, webPort: 5174 },
    defaultApiProtocol: "http"
  });
  
  // Expandable sections
  const [agentWebExpanded, setAgentWebExpanded] = useState(false);

  const baseUrl = useMemo(() => {
    const ip = publicIp?.trim();
    if (!ip) {
      return "";
    }
    let protocol = serverConfig.https?.enabled ? "https" : "http";
    if (protocol === "http" && !serverConfig.http?.enabled && serverConfig.https?.enabled) {
      protocol = "https";
    }
    const port = protocol === "https"
      ? (serverConfig.https?.apiPort || 3002)
      : (serverConfig.http?.apiPort || 3001);
    return `${protocol}://${ip}:${port}`;
  }, [publicIp, serverConfig]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsRes, ipsRes, serverRes] = await Promise.all([
        apiFetch("/api/settings"),
        apiFetch("/api/admin/network-ips"),
        apiFetch("/api/admin/config")
      ]);
      const settings = settingsRes.settings || {};
      setPublicIp(settings.publicIp || "");
      setDefaultPollSeconds(settings.defaultPollSeconds || "15");
      if (serverRes.ok && serverRes.config) {
        setServerConfig(serverRes.config);
      }
      setIps(ipsRes.ips || []);
    } catch (err) {
      setError(err.message || t("errors.loadSettings"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch("/api/settings", {
        method: "POST",
        body: JSON.stringify({
          publicIp,
          defaultPollSeconds
        })
      });
      setMessage(t("admin.saved"));
    } catch (err) {
      setError(err.message || t("errors.saveSettings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl font-semibold text-white">{t("admin.title")}</h2>
        <p className="text-sm text-slate-400">{t("admin.subtitle")}</p>
      </div>

      {/* Network Settings */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>🌐</span> Network Settings
        </h3>
        
        {loading ? <p className="text-sm text-slate-400">{t("admin.loading")}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

        <div>
          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {t("admin.networkIp")}
          </label>
          <select
            className="input mt-2"
            value={publicIp}
            onChange={(event) => setPublicIp(event.target.value)}
          >
            <option value="">{t("admin.selectIp")}</option>
            {ips.map((ip) => (
              <option key={`${ip.name}-${ip.address}`} value={ip.address}>
                {ip.address} ({ip.name})
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">{t("admin.ipHint")}</p>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {t("admin.baseUrl")}
          </label>
          <div className="mt-2 rounded-xl bg-ink-800 p-4 text-sm text-slate-100">
            <code className="break-all font-mono">
              {baseUrl || t("admin.baseUrlPlaceholder")}
            </code>
          </div>
        </div>
      </div>

      {/* Agent Defaults */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>⏱️</span> {t("admin.defaultPoll")}
        </h3>
        <div>
          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {t("admin.defaultPoll")}
          </label>
          <input
            className="input mt-2"
            value={defaultPollSeconds}
            onChange={(event) => setDefaultPollSeconds(event.target.value)}
          />
          <p className="mt-2 text-xs text-slate-500">{t("admin.defaultPollHint")}</p>
        </div>
      </div>

      {/* Agent Local Web Interface - Info Section */}
      <div className="card space-y-4">
        <button 
          className="w-full flex items-center justify-between text-left"
          onClick={() => setAgentWebExpanded(!agentWebExpanded)}
        >
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>🖥️</span> {t("agentLocalWeb.title")}
          </h3>
          <span className="text-slate-400">{agentWebExpanded ? "▼" : "▶"}</span>
        </button>
        
        {agentWebExpanded && (
          <div className="space-y-4 pt-4 border-t border-ink-600">
            <div className="rounded-lg bg-ink-800 p-4">
              <p className="text-sm text-slate-200 mb-3">
                {t("agentLocalWeb.perAgentInfo")}
              </p>
              <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                <li>{t("agentLocalWeb.feature1")}</li>
                <li>{t("agentLocalWeb.feature2")}</li>
                <li>{t("agentLocalWeb.feature3")}</li>
                <li>{t("agentLocalWeb.feature4")}</li>
              </ul>
            </div>
            
            <p className="text-xs text-slate-500">
              {t("agentLocalWeb.configureHint")}
            </p>
          </div>
        )}
      </div>

      {/* Server Management */}
      <ServerManagement t={t} />

      {/* Save Actions */}
      <div className="card">
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("admin.save")}
          </button>
          <button className="btn btn-secondary" onClick={load}>
            {t("admin.refreshIps")}
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">{t("admin.note")}</p>
      </div>
    </div>
  );
}