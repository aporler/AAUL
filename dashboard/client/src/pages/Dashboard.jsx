import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";
import StatusBadge from "../components/StatusBadge.jsx";
import Modal from "../components/Modal.jsx";
import DonutChart from "../components/DonutChart.jsx";

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

const AUTO_REFRESH_MS = 15000;
const ONLINE_THRESHOLD_SECONDS = 180;
const COLUMN_STORAGE_KEY = "aaul.columns";
const DEFAULT_COLUMNS = [
  "name",
  "host",
  "lastSeen",
  "lastRun",
  "status",
  "state",
  "exit",
  "version",
  "schedule",
  "command",
  "actions"
];

function formatBytes(value) {
  if (value === null || value === undefined) return "-";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  let sizeIndex = 0;
  let size = Number(value);
  while (size >= 1024 && sizeIndex < sizes.length - 1) {
    size /= 1024;
    sizeIndex += 1;
  }
  return `${size.toFixed(1)} ${sizes[sizeIndex]}`;
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scheduleAgent, setScheduleAgent] = useState(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [scheduleTime, setScheduleTime] = useState("03:00");
  const [installAgent, setInstallAgent] = useState(null);
  const [installInfo, setInstallInfo] = useState(null);
  const [installError, setInstallError] = useState("");
  const [installLoading, setInstallLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [confirmAgent, setConfirmAgent] = useState(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [afterAgentsWidgets, setAfterAgentsWidgets] = useState([]);
  const [hostStats, setHostStats] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_COLUMNS;
    }
    try {
      const saved = JSON.parse(window.localStorage.getItem(COLUMN_STORAGE_KEY));
      if (Array.isArray(saved) && saved.length > 0) {
        return saved;
      }
    } catch (err) {
      return DEFAULT_COLUMNS;
    }
    return DEFAULT_COLUMNS;
  });

  const columns = useMemo(
    () => [
      { id: "name", label: t("dashboard.table.name") },
      { id: "host", label: t("dashboard.table.hostIp") },
      { id: "lastSeen", label: t("dashboard.table.lastSeen") },
      { id: "lastRun", label: t("dashboard.table.lastRun") },
      { id: "status", label: t("dashboard.table.status") },
      { id: "state", label: t("dashboard.table.state") },
      { id: "exit", label: t("dashboard.table.exit") },
      { id: "version", label: t("dashboard.table.version") },
      { id: "schedule", label: t("dashboard.table.schedule") },
      { id: "command", label: t("dashboard.table.command") },
      { id: "actions", label: t("dashboard.table.actions") }
    ],
    [t]
  );

  const isColumnVisible = (id) => visibleColumns.includes(id);

  const toggleColumn = (id) => {
    setVisibleColumns((prev) => {
      const isVisible = prev.includes(id);
      if (isVisible && prev.length === 1) {
        return prev;
      }
      if (isVisible) {
        return prev.filter((column) => column !== id);
      }
      return [...prev, id];
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const loadAgents = useCallback(
    async (options = {}) => {
      const { silent = false } = options;
      if (!silent) {
        setLoading(true);
      }
      setError("");
      try {
        const data = await apiFetch("/api/agents");
        setAgents(data.agents || []);
      } catch (err) {
        setError(err.message || t("errors.loadAgents"));
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadAgents({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadAgents]);

  useEffect(() => {
    let mounted = true;
    const loadStats = async () => {
      try {
        const data = await apiFetch("/api/showinfohost/stats");
        if (mounted) setHostStats(data);
      } catch {
        if (mounted) setHostStats(null);
      }
    };
    loadStats();
    const interval = setInterval(loadStats, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const loadWidgets = async () => {
      try {
        const afterAgents = await apiFetch("/api/plugins/ui/dashboard:after-agents");
        setAfterAgentsWidgets(afterAgents.components || []);
      } catch {
        setAfterAgentsWidgets([]);
      }
    };
    loadWidgets();
  }, []);

  const renderWidget = (widget, idx) => {
    if (widget.type === "host-info" && widget.variant === "topbar") {
      return <HostInfoTopbar key={`${widget.plugin}-${idx}`} stats={hostStats} />;
    }
    if (widget.type === "host-info" && widget.variant === "panel") {
      return <HostInfoPanel key={`${widget.plugin}-${idx}`} stats={hostStats} />;
    }
    return null;
  };

  useEffect(() => {
    const handleClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (!target.closest("[data-menu-root]")) {
        setOpenMenuId(null);
        setColumnMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const runCommand = async (path, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }
    await apiFetch(path, { method: "POST" });
    await loadAgents();
  };

  const openSchedule = (agent) => {
    setScheduleAgent(agent);
    setScheduleEnabled(agent.schedule?.enabled ?? true);
    setScheduleTime(agent.schedule?.dailyTime || "03:00");
  };

  const submitSchedule = async () => {
    if (!scheduleAgent) {
      return;
    }
    await apiFetch(`/api/agents/${scheduleAgent.id}/commands/schedule`, {
      method: "POST",
      body: JSON.stringify({ enabled: scheduleEnabled, dailyTime: scheduleTime })
    });
    setScheduleAgent(null);
    await loadAgents();
  };

  const openInstallInfo = async (agent) => {
    setOpenMenuId(null);
    setInstallAgent(agent);
    setInstallInfo(null);
    setInstallError("");
    setInstallLoading(true);
    try {
      const data = await apiFetch(`/api/agents/${agent.id}/install`);
      setInstallInfo(data);
    } catch (err) {
      setInstallError(err.message || t("errors.loadInstallInfo"));
    } finally {
      setInstallLoading(false);
    }
  };

  const copyInstallCommand = async () => {
    if (!installInfo?.installCommand) {
      return;
    }
    await navigator.clipboard.writeText(installInfo.installCommand);
  };

  const deleteAgent = async (agent) => {
    const confirmText = agent.lastSeenAt
      ? t("dashboard.confirm.removeDevice", { name: agent.displayName })
      : t("dashboard.confirm.remove", { name: agent.displayName });
    if (!window.confirm(confirmText)) {
      return;
    }
    setOpenMenuId(null);
    await apiFetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    await loadAgents();
  };

  const confirmUninstall = async () => {
    if (!confirmAgent) {
      return;
    }
    await runCommand(`/api/agents/${confirmAgent.id}/commands/uninstall`);
    setConfirmAgent(null);
  };

  const getState = (lastSeenAt) => {
    if (!lastSeenAt) {
      return { label: t("state.offline"), className: "bg-red-500/20 text-red-300" };
    }
    const last = new Date(lastSeenAt).getTime();
    if (Number.isNaN(last)) {
      return { label: t("state.offline"), className: "bg-red-500/20 text-red-300" };
    }
    const online = Date.now() - last <= ONLINE_THRESHOLD_SECONDS * 1000;
    return online
      ? { label: t("state.online"), className: "bg-emerald-500/20 text-emerald-300" }
      : { label: t("state.offline"), className: "bg-red-500/20 text-red-300" };
  };

  const handleRowDoubleClick = (event, agentId) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-menu-root]")) {
      return;
    }
    navigate(`/agents/${agentId}`);
  };

  const formatNet = (stats) => {
    if (!stats?.net || stats.net.supported === false) {
      return "-- / -- KB/s";
    }
    const rx = stats.net.rxKbps ?? 0;
    const tx = stats.net.txKbps ?? 0;
    return `${rx} / ${tx} KB/s`;
  };

  const HostInfoPanel = ({ stats }) => (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
      <div className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
        HOST INFO
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-4">
          <div className="text-xs text-slate-400">OS</div>
          <div className="mt-2 text-xl font-semibold text-white">
            {stats?.osName || "--"}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {stats?.osVersion || ""}
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-4">
          <div className="text-xs text-slate-400">CPU</div>
          <div className="mt-2 text-xs text-slate-500">
            Cores: {stats?.cpuCores ?? "--"} / Threads: {stats?.cpuThreads ?? "--"}
          </div>
          <div className="mt-3">
            <DonutChart
              used={stats?.cpu ?? 0}
              total={100}
              usedLabel="Used"
              freeLabel="Available"
              usedValue={`${stats?.cpu ?? "--"}%`}
              freeValue={`${stats ? 100 - (stats.cpu ?? 0) : "--"}%`}
              size={88}
              thickness={10}
              layout="stacked"
            />
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-4">
          <div className="text-xs text-slate-400">RAM</div>
          <div className="mt-2 text-xs text-slate-500">
            {stats ? `${formatBytes(stats.memUsedBytes)} / ${formatBytes(stats.memTotalBytes)}` : "--"}
          </div>
          <div className="mt-3">
            <DonutChart
              used={stats?.memUsedBytes ?? 0}
              total={stats?.memTotalBytes ?? 0}
              usedLabel="Used"
              freeLabel="Available"
              usedValue={formatBytes(stats?.memUsedBytes)}
              freeValue={formatBytes((stats?.memTotalBytes || 0) - (stats?.memUsedBytes || 0))}
              size={88}
              thickness={10}
              layout="stacked"
            />
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-4">
          <div className="text-xs text-slate-400">IP Address</div>
          <div className="mt-2 text-xl font-semibold text-white">
            {stats?.ip || "--"}
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/70 p-4">
          <div className="text-xs text-slate-400">Disk Free</div>
          <div className="mt-2 text-xl font-semibold text-white">
            {stats?.diskFreeGb ?? "--"} GB
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {stats?.diskTotalGb ? `of ${stats.diskTotalGb} GB` : ""}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-white">{t("dashboard.title")}</h2>
            <p className="text-sm text-slate-400">{t("dashboard.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={loadAgents}>
              {t("dashboard.refresh")}
            </button>
            <div className="relative" data-menu-root>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setOpenMenuId(null);
                  setColumnMenuOpen(!columnMenuOpen);
                }}
              >
                {t("dashboard.columns")}
              </button>
              {columnMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-ink-600 bg-ink-800 p-3 shadow-soft">
                  <p className="mb-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                    {t("dashboard.columns")}
                  </p>
                  <div className="space-y-2">
                    {columns.map((column) => (
                      <label
                        key={column.id}
                        className="flex items-center gap-2 text-sm text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={isColumnVisible(column.id)}
                          onChange={() => toggleColumn(column.id)}
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-visible">
        {loading ? <p className="text-sm text-slate-400">{t("dashboard.loadingAgents")}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <table className="w-full table-auto break-words text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.2em] text-slate-400">
            <tr>
              {columns
                .filter((column) => isColumnVisible(column.id))
                .map((column) => (
                  <th key={column.id} className="px-4 py-3">
                    {column.label}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const state = getState(agent.lastSeenAt);
              return (
                <tr
                  key={agent.id}
                  className="table-row cursor-pointer transition hover:bg-ink-800/40"
                  onDoubleClick={(event) => handleRowDoubleClick(event, agent.id)}
                >
                  {isColumnVisible("name") ? (
                    <td className="px-4 py-4 align-top">
                      <div className="group relative inline-flex flex-col">
                        <div className="font-semibold text-white">
                          {agent.displayName}
                        </div>
                        <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden w-56 rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-slate-200 group-hover:block">
                          ID: <span className="font-mono break-all">{agent.id}</span>
                        </div>
                      </div>
                    </td>
                  ) : null}
                  {isColumnVisible("host") ? (
                    <td className="px-4 py-4 align-top">
                      <div>{agent.hostname || "-"}</div>
                      <div className="text-xs text-slate-400">{agent.ip || "-"}</div>
                    </td>
                  ) : null}
                  {isColumnVisible("lastSeen") ? (
                    <td className="px-4 py-4 align-top">
                      {formatDate(agent.lastSeenAt, lang)}
                    </td>
                  ) : null}
                  {isColumnVisible("lastRun") ? (
                    <td className="px-4 py-4 align-top">
                      {formatDate(agent.lastRunAt, lang)}
                    </td>
                  ) : null}
                  {isColumnVisible("status") ? (
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-2">
                        <StatusBadge label={agent.lastStatus} />
                        {agent.rebootRequired ? (
                          <span className="badge bg-red-500/20 text-red-300">
                            {t("status.rebootRequired")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  {isColumnVisible("state") ? (
                    <td className="px-4 py-4 align-top">
                      <span
                        className={`badge whitespace-nowrap text-[11px] ${state.className}`}
                      >
                        {state.label}
                      </span>
                    </td>
                  ) : null}
                  {isColumnVisible("exit") ? (
                    <td className="px-4 py-4 align-top">{agent.lastExitCode ?? "-"}</td>
                  ) : null}
                  {isColumnVisible("version") ? (
                    <td className="px-4 py-4 align-top">{agent.agentVersion || "-"}</td>
                  ) : null}
                  {isColumnVisible("schedule") ? (
                    <td className="px-4 py-4 align-top">
                      <div className="text-xs text-slate-300">
                        {agent.schedule?.enabled
                          ? t("dashboard.schedule.enabled")
                          : t("dashboard.schedule.disabled")}
                      </div>
                      <div className="text-xs text-slate-500">
                        {agent.schedule?.dailyTime || "--:--"}
                      </div>
                    </td>
                  ) : null}
                  {isColumnVisible("command") ? (
                    <td className="px-4 py-4 align-top">
                      {agent.pendingCommand ? (
                        <div className="space-y-2">
                          <StatusBadge label={agent.pendingCommand.status} />
                          <div className="text-xs text-slate-400">
                            {agent.pendingCommand.type}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {t("dashboard.command.none")}
                        </span>
                      )}
                    </td>
                  ) : null}
                  {isColumnVisible("actions") ? (
                    <td className="px-4 py-4 align-top">
                      <div className="relative inline-flex" data-menu-root>
                        <button
                          className="btn btn-secondary px-3 py-2 text-xs"
                          onClick={() => {
                            setColumnMenuOpen(false);
                            setOpenMenuId(openMenuId === agent.id ? null : agent.id);
                          }}
                        >
                          ...
                        </button>
                        {openMenuId === agent.id ? (
                          <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl border border-ink-600 bg-ink-800 p-2 shadow-soft">
                            {agent.lastSeenAt ? (
                              <>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
                                  onClick={() =>
                                    (() => {
                                      setOpenMenuId(null);
                                      return runCommand(
                                        `/api/agents/${agent.id}/commands/run-now`,
                                        t("dashboard.confirm.runNow")
                                      );
                                    })()
                                  }
                                >
                                  {t("dashboard.actions.runNow")}
                                </button>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    openSchedule(agent);
                                  }}
                                >
                                  {t("dashboard.actions.schedule")}
                                </button>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
                                  onClick={() =>
                                    (() => {
                                      setOpenMenuId(null);
                                      return runCommand(
                                        `/api/agents/${agent.id}/commands/update-agent`,
                                        t("dashboard.confirm.updateAgent")
                                      );
                                    })()
                                  }
                                >
                                  {t("dashboard.actions.updateAgent")}
                                </button>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setConfirmAgent(agent);
                                  }}
                                >
                                  {t("dashboard.actions.uninstall")}
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
                                  onClick={() => openInstallInfo(agent)}
                                >
                                  {t("dashboard.actions.installInfo")}
                                </button>
                                <button
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
                                  onClick={() => deleteAgent(agent)}
                                >
                                  {t("dashboard.actions.remove")}
                                </button>
                              </>
                            )}
                            {agent.pendingCommand?.type === "UNINSTALL" ? (
                              <>
                                {agent.pendingCommand?.status === "QUEUED" ? (
                                  <button
                                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-yellow-300 hover:bg-yellow-500/10"
                                    onClick={() =>
                                      (() => {
                                        setOpenMenuId(null);
                                        return runCommand(
                                          `/api/agents/${agent.id}/commands/cancel`,
                                          t("dashboard.confirm.cancelUninstall")
                                        );
                                      })()
                                    }
                                  >
                                    {t("dashboard.actions.cancelUninstall")}
                                  </button>
                                ) : null}
                                <button
                                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
                                  onClick={() => deleteAgent(agent)}
                                >
                                  {t("dashboard.actions.removeDevice")}
                                </button>
                              </>
                            ) : agent.pendingCommand?.status === "QUEUED" ? (
                              <button
                                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-yellow-300 hover:bg-yellow-500/10"
                                onClick={() =>
                                  (() => {
                                    setOpenMenuId(null);
                                    return runCommand(
                                      `/api/agents/${agent.id}/commands/cancel`,
                                      t("dashboard.confirm.cancelPending")
                                    );
                                  })()
                                }
                              >
                                {t("dashboard.actions.cancelPending")}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {afterAgentsWidgets.length > 0 ? (
        <div className="space-y-3">
          {afterAgentsWidgets.map((widget, idx) => renderWidget(widget, idx))}
        </div>
      ) : null}

      <Modal
        open={Boolean(scheduleAgent)}
        title={t("dashboard.scheduleModal.title", {
          name: scheduleAgent?.displayName || ""
        })}
        onClose={() => setScheduleAgent(null)}
      >
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(event) => setScheduleEnabled(event.target.checked)}
            />
            {t("dashboard.scheduleModal.enableDaily")}
          </label>
          <div>
            <label className="text-xs uppercase tracking-[0.3em] text-slate-400">
              {t("dashboard.scheduleModal.dailyTime")}
            </label>
            <input
              className="input mt-2"
              type="time"
              value={scheduleTime}
              onChange={(event) => setScheduleTime(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              className="btn btn-secondary"
              onClick={() => setScheduleAgent(null)}
            >
              {t("dashboard.scheduleModal.cancel")}
            </button>
            <button className="btn btn-primary" onClick={submitSchedule}>
              {t("dashboard.scheduleModal.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(installAgent)}
        title={t("dashboard.installModal.title", {
          name: installAgent?.displayName || ""
        })}
        onClose={() => setInstallAgent(null)}
      >
        <div className="space-y-4">
          {installLoading ? (
            <p className="text-sm text-slate-400">{t("dashboard.installModal.loading")}</p>
          ) : null}
          {installError ? <p className="text-sm text-red-400">{installError}</p> : null}
          {installInfo ? (
            <>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {t("dashboard.installModal.agentId")}
                </p>
                <p className="mt-2 text-xs font-mono text-slate-200 break-all">
                  {installInfo.agentId}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {t("dashboard.installModal.installCommand")}
                </p>
                <div className="mt-2 rounded-xl bg-ink-800 p-4 text-sm text-slate-100">
                  <code className="break-all font-mono">
                    {installInfo.installCommand}
                  </code>
                </div>
                <button className="btn btn-secondary mt-3" onClick={copyInstallCommand}>
                  {t("dashboard.installModal.copyCommand")}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmAgent)}
        title={t("dashboard.uninstallModal.title", {
          name: confirmAgent?.displayName || ""
        })}
        onClose={() => setConfirmAgent(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            {t("dashboard.uninstallModal.description")}
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn btn-secondary" onClick={() => setConfirmAgent(null)}>
              {t("dashboard.uninstallModal.cancel")}
            </button>
            <button className="btn btn-danger" onClick={confirmUninstall}>
              {t("dashboard.uninstallModal.confirm")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
