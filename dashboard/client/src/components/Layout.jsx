import React, { useMemo, useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider.jsx";
import { useI18n } from "../lib/i18n.js";
import { apiFetch } from "../lib/api.js";
import LanguageToggle from "./LanguageToggle.jsx";
import Footer from "./Footer.jsx";

export default function Layout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pluginNavItems, setPluginNavItems] = useState([]);
  const [topbarWidgets, setTopbarWidgets] = useState([]);
  const [hostStats, setHostStats] = useState(null);

  // Fetch plugin-registered nav items
  useEffect(() => {
    apiFetch("/api/plugins/ui/nav:item")
      .then((data) => {
        if (data.ok && Array.isArray(data.components)) {
          // Filter by adminOnly if needed
          const items = data.components.filter(
            (item) => !item.adminOnly || user?.isAdmin
          );
          setPluginNavItems(items);
        }
      })
      .catch(() => {});
  }, [user?.isAdmin]);

  useEffect(() => {
    apiFetch("/api/plugins/ui/layout:topbar")
      .then((data) => {
        if (data.ok && Array.isArray(data.components)) {
          setTopbarWidgets(data.components);
        }
      })
      .catch(() => setTopbarWidgets([]));
  }, []);

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

  const formatNet = (stats) => {
    if (!stats?.net || stats.net.supported === false) {
      return "-- / -- KB/s";
    }
    const rx = stats.net.rxKbps ?? 0;
    const tx = stats.net.txKbps ?? 0;
    return `${rx} / ${tx} KB/s`;
  };

  const renderWidget = (widget, idx) => {
    if (widget.type === "host-info" && widget.variant === "topbar") {
      return (
        <div key={`${widget.plugin}-${idx}`} className="rounded-2xl border border-ink-700 bg-ink-900/60 px-4 py-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div />
            <div className="text-center text-lg font-semibold text-white">
              {hostStats?.time || "--:--:--"}
            </div>
            <div className="flex items-center justify-end gap-4 text-xs text-slate-300">
              <span>CPU {hostStats?.cpu ?? "--"}%</span>
              <span>RAM {hostStats?.memPercent ?? "--"}%</span>
              <span>NET {formatNet(hostStats)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const navItems = useMemo(() => {
    const items = [
      { label: t("nav.dashboard"), to: "/dashboard", icon: "📊" },
      { label: t("nav.addAgent"), to: "/agents/new", icon: "➕" },
      { label: t("nav.logs"), to: "/logs", icon: "📋" },
      { label: t("nav.users"), to: "/users", icon: "👥" },
      { label: t("nav.plugins"), to: "/plugins", icon: "🔌" },
      { label: t("nav.admin"), to: "/admin", icon: "⚙️" }
    ];
    // Add plugin-registered nav items
    for (const p of pluginNavItems) {
      items.push({ label: p.label, href: p.href, icon: p.icon || "🔗" });
    }
    return items;
  }, [t, pluginNavItems]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row">
        {sidebarOpen ? (
          <aside className="glass flex w-full flex-col gap-6 rounded-2xl p-6 lg:w-64">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-ocean-300">
                  {t("nav.control")}
                </p>
                <h1 className="text-2xl font-semibold text-white">
                  {t("app.name")}
                </h1>
                <p className="mt-2 text-xs text-slate-400">
                  {t("nav.signedIn", { name: user?.username || "-" })}
                </p>
              </div>
              <button
                className="btn btn-secondary px-3 py-2 text-xs"
                onClick={() => setSidebarOpen(false)}
              >
                {t("nav.hide")}
              </button>
            </div>
            <nav className="flex flex-col gap-2">
              {navItems.map((item) =>
                item.href ? (
                  <a
                    key={item.href}
                    href={item.href}
                    className="nav-pill rounded-xl px-4 py-3 text-sm font-medium transition flex items-center gap-3 text-slate-300 hover:bg-ink-700"
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `nav-pill rounded-xl px-4 py-3 text-sm font-medium transition flex items-center gap-3 ${
                        isActive
                          ? "bg-ink-700 text-white shadow-glow"
                          : "text-slate-300 hover:bg-ink-700"
                      }`
                    }
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                )
              )}
            </nav>
            <button onClick={logout} className="btn btn-secondary">
              {t("nav.logout")}
            </button>
          </aside>
        ) : null}
        <main className="flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            {!sidebarOpen ? (
              <button
                className="btn btn-secondary"
                onClick={() => setSidebarOpen(true)}
              >
                {t("nav.showMenu")}
              </button>
            ) : (
              <span />
            )}
            <LanguageToggle />
          </div>
          {topbarWidgets.length > 0 ? (
            <div className="sticky top-4 z-30 mb-4">
              {topbarWidgets.map((widget, idx) => renderWidget(widget, idx))}
            </div>
          ) : null}
          <Outlet />
          <Footer />
        </main>
      </div>
    </div>
  );
}
