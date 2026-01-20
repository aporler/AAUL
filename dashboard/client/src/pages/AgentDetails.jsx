import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";
import DonutChart from "../components/DonutChart.jsx";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 120;

function formatDate(value, locale) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(locale);
}

function formatBytes(size) {
  if (size === null || size === undefined || size === 0) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) {
    return "-";
  }
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export default function AgentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [agent, setAgent] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [infoError, setInfoError] = useState("");
  const [autoRequested, setAutoRequested] = useState(false);
  
  // Local web interface state
  const [localWebEnabled, setLocalWebEnabled] = useState(false);
  const [localWebPort, setLocalWebPort] = useState(8180);
  const [localWebSaving, setLocalWebSaving] = useState(false);
  const [localWebMessage, setLocalWebMessage] = useState("");
  const allowedPorts = [8080, 8090, 8180, 8190];

  const loadAgent = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/api/agents/${id}`);
      setAgent(data.agent || null);
      setInfo(data.info || null);
      // Load local web settings from agent
      if (data.agent?.localWeb) {
        setLocalWebEnabled(data.agent.localWeb.enabled);
        setLocalWebPort(data.agent.localWeb.port || 8180);
      }
    } catch (err) {
      setError(err.message || t("errors.loadAgentInfo"));
    } finally {
      setLoading(false);
    }
  };
  
  const saveLocalWebSettings = async () => {
    setLocalWebSaving(true);
    setLocalWebMessage("");
    try {
      await apiFetch(`/api/agents/${id}/local-web`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: localWebEnabled,
          port: localWebPort
        })
      });
      setLocalWebMessage(t("details.localWebSaved"));
      setTimeout(() => setLocalWebMessage(""), 3000);
    } catch (err) {
      setLocalWebMessage(err.message || t("errors.saveFailed"));
    } finally {
      setLocalWebSaving(false);
    }
  };

  useEffect(() => {
    loadAgent();
    setAutoRequested(false);
    
    // Auto-refresh agent data every 60 seconds
    const interval = setInterval(() => {
      loadAgent();
      // Also refresh system info if not currently refreshing
      if (!refreshing && !waiting) {
        refreshInfo();
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, [id]);

  const pollCommand = async (commandId) => {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const data = await apiFetch(`/api/agents/${id}/commands/${commandId}`);
      if (data.command?.status === "DONE" || data.command?.status === "ERROR") {
        return data.command;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(t("errors.commandTimeout"));
  };

  const refreshInfo = async () => {
    setRefreshing(true);
    setInfoError("");
    setWaiting(true);
    try {
      const result = await apiFetch(`/api/agents/${id}/commands/info`, {
        method: "POST"
      });
      const command = await pollCommand(result.commandId);
      if (command.status === "ERROR") {
        setInfoError(command.errorMessage || t("errors.commandFailed"));
      } else {
        setInfo(command.result || null);
      }
    } catch (err) {
      setInfoError(err.message || t("errors.commandFailed"));
    } finally {
      setWaiting(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (loading || refreshing || autoRequested) {
      return;
    }
    if (agent && !info) {
      setAutoRequested(true);
      refreshInfo();
    }
  }, [agent, autoRequested, info, loading, refreshing]);

  const memory = info?.memory;
  const cpu = info?.cpu;
  const osInfo = info?.os;
  const packageManager = info?.packageManager;
  const disks = info?.disks || [];
  const ips = info?.ips || [];
  const gpus = info?.gpu || [];
  const repositories = info?.repositories || [];
  const packagesInstalled = info?.packagesInstalled ?? null;
  const infoUpdated = info?.collectedAt || agent?.lastInfoUpdatedAt;
  const uptimeSeconds =
    info?.uptimeSeconds ?? agent?.uptimeSeconds ?? null;
  const rebootRequired =
    info?.rebootRequired !== undefined
      ? info?.rebootRequired
      : agent?.rebootRequired;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              {agent?.displayName || t("details.title")}
            </h2>
            <p className="text-sm text-slate-400">{t("details.subtitle")}</p>
            {agent ? (
              <p className="mt-2 text-xs text-slate-500">
                {agent.hostname || "-"} - {agent.ip || "-"}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => navigate("/dashboard")}>
              {t("details.back")}
            </button>
            <button
              className="btn btn-primary"
              onClick={refreshInfo}
              disabled={refreshing}
            >
              {refreshing ? t("details.refreshing") : t("details.refresh")}
            </button>
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-400">{t("common.loading")}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {waiting ? <p className="text-xs text-slate-500">{t("details.waiting")}</p> : null}
      {infoError ? <p className="text-sm text-red-400">{infoError}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <div className="card space-y-3">
            <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              {t("details.system")}
            </h3>
            {!info ? (
              <p className="text-sm text-slate-500">{t("details.noInfo")}</p>
            ) : null}
            {osInfo ? (
              <div className="text-sm text-slate-200">
                <div className="font-semibold text-white">{osInfo.prettyName || "-"}</div>
                <div className="text-xs text-slate-400">
                  {t("details.osName")}: {osInfo.name || "-"} · {t("details.osVersion")}:{" "}
                  {osInfo.version || "-"}
                </div>
              </div>
            ) : null}
            {packageManager ? (
              <p className="text-xs text-slate-400">
                {t("details.packageManager")}: {packageManager}
              </p>
            ) : null}
            {uptimeSeconds !== null ? (
              <p className="text-xs text-slate-400">
                {t("details.uptime")}: {formatDuration(uptimeSeconds)}
              </p>
            ) : null}
            {rebootRequired ? (
              <p className="text-xs font-semibold text-red-400">
                {t("details.rebootRequired")}
              </p>
            ) : null}
            {infoUpdated ? (
              <p className="text-xs text-slate-500">
                {t("details.lastUpdated", { time: formatDate(infoUpdated, lang) })}
              </p>
            ) : null}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="card space-y-3">
              <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
                {t("details.cpu")}
              </h3>
              {cpu ? (
                <>
                  <div className="text-sm text-slate-200">{cpu.model || "-"}</div>
                  <div className="text-xs text-slate-500">
                  {t("details.cores")}: {cpu.cores ?? "-"} / {t("details.threads")}:
                    {" "}{cpu.threads ?? "-"}
                  </div>
                  {cpu.usagePercent !== undefined && cpu.usagePercent !== null ? (
                    <div className="mt-4">
                      <DonutChart
                        used={cpu.usagePercent}
                        total={100}
                        usedLabel={t("details.used")}
                        freeLabel={t("details.available")}
                        usedValue={`${cpu.usagePercent}%`}
                        freeValue={`${(100 - cpu.usagePercent).toFixed(1)}%`}
                        size={88}
                        thickness={10}
                        layout="stacked"
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">{t("details.noInfo")}</p>
              )}
            </div>

            <div className="card space-y-3">
              <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
                {t("details.memory")}
              </h3>
              {memory ? (
                <div className="flex flex-col gap-4">
                  <div className="text-sm text-slate-200">
                    {t("details.total")}: {formatBytes(memory.totalBytes)}
                  </div>
                  <DonutChart
                    used={memory.usedBytes}
                    total={memory.totalBytes}
                    usedLabel={t("details.used")}
                    freeLabel={t("details.available")}
                    usedValue={formatBytes(memory.usedBytes)}
                    freeValue={formatBytes(memory.availableBytes)}
                    size={88}
                    thickness={10}
                    layout="stacked"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t("details.noInfo")}</p>
              )}
            </div>
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              {t("details.disks")}
            </h3>
            {disks.length ? (
              <div className="space-y-2">
                {disks.map((disk) => (
                  <div
                    key={`${disk.device}-${disk.mount}`}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-ink-700 bg-ink-800 p-3 text-xs text-slate-300 md:flex-row md:items-center"
                  >
                    <div className="text-sm text-slate-200">
                      {disk.mount} ({disk.fsType})
                      <div className="text-xs text-slate-500">{disk.device}</div>
                      <div className="text-xs text-slate-400">
                        {t("details.total")}: {formatBytes(disk.sizeBytes)}
                      </div>
                    </div>
                    <DonutChart
                      used={disk.usedBytes}
                      total={disk.sizeBytes}
                      usedLabel={t("details.used")}
                      freeLabel={t("details.available")}
                      usedValue={formatBytes(disk.usedBytes)}
                      freeValue={formatBytes(disk.availBytes)}
                      size={72}
                      thickness={8}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("details.noDisks")}</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-3">
            <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              {t("details.ips")}
            </h3>
            {ips.length ? (
              <ul className="space-y-2 text-sm text-slate-200">
                {ips.map((ip) => (
                  <li key={ip} className="rounded-lg bg-ink-800 px-3 py-2">
                    {ip}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("details.noIps")}</p>
            )}
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              {t("details.gpu")}
            </h3>
            {gpus.length ? (
              <ul className="space-y-2 text-sm text-slate-200">
                {gpus.map((gpu) => (
                  <li key={gpu} className="rounded-lg bg-ink-800 px-3 py-2">
                    {gpu}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("details.noGpu")}</p>
            )}
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              {t("details.packages")}
            </h3>
            {packagesInstalled !== null ? (
              <div className="text-sm text-slate-200">
                {t("details.packageCount", { count: packagesInstalled })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t("details.noInfo")}</p>
            )}
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
              {t("details.repositories")}
            </h3>
            {repositories.length ? (
              <ul className="max-h-[240px] space-y-2 overflow-auto text-xs text-slate-200">
                {repositories.map((repo) => (
                  <li key={repo} className="rounded-lg bg-ink-800 px-3 py-2">
                    {repo}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t("details.noRepos")}</p>
            )}
          </div>
          
          {/* Local Web Interface Configuration */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-[0.3em] text-slate-400">
                {t("details.localWebTitle")}
              </h3>
              {localWebEnabled && agent?.ip && (
                <a
                  href={`http://${agent.ip}:${localWebPort}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-400 hover:underline"
                >
                  {t("details.openLocalWeb")} ↗
                </a>
              )}
            </div>
            
            <p className="text-xs text-slate-500">
              {t("details.localWebDescription")}
            </p>
            
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={localWebEnabled}
                  onChange={(e) => setLocalWebEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-600 bg-ink-800 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-200">
                  {t("details.enableLocalWeb")}
                </span>
              </label>
            </div>
            
            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wider text-slate-400">
                {t("details.localWebPort")}
              </label>
              <select
                value={localWebPort}
                onChange={(e) => setLocalWebPort(parseInt(e.target.value, 10))}
                disabled={!localWebEnabled}
                className="w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              >
                {allowedPorts.map((port) => (
                  <option key={port} value={port}>
                    {port}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                {t("details.allowedPorts")}: {allowedPorts.join(", ")}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                className="btn btn-primary"
                onClick={saveLocalWebSettings}
                disabled={localWebSaving}
              >
                {localWebSaving ? t("common.saving") : t("common.save")}
              </button>
              {localWebMessage && (
                <span className={`text-xs ${localWebMessage.includes("error") || localWebMessage.includes("Erreur") ? "text-red-400" : "text-emerald-400"}`}>
                  {localWebMessage}
                </span>
              )}
            </div>
            
            {localWebEnabled && (
              <div className="rounded-lg bg-ink-800 p-3 text-xs text-slate-400">
                <p className="font-medium text-slate-300">{t("details.localWebInfo")}</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>{t("details.localWebFirewall")}</li>
                  <li>{t("details.localWebAuth")}</li>
                  <li>{t("details.localWebUrl")}: http://{agent?.ip || "AGENT_IP"}:{localWebPort}</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
