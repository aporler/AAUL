import argparse
import os
import sys
from urllib.parse import urlparse

from lib.api import api_post
from lib.config import load_config, read_state, get_agent_version, save_config
from lib.uninstall import uninstall_agent
from lib.util import get_hostname, get_primary_ip, utc_now_iso
from lib.system_info import get_reboot_required, get_uptime_seconds
from lib.systemd import restart_poller
from lib.updater import update_agent
from agent_runner import run_update


def build_payload(config):
    state = read_state()
    return {
        "agentId": config.get("agentId"),
        "displayName": config.get("displayName"),
        "hostname": get_hostname(),
        "ip": get_primary_ip(),
        "agentVersion": get_agent_version(),
        "lastSeenAt": utc_now_iso(),
        "lastRunAt": state.get("lastRunAt"),
        "lastStatus": state.get("lastStatus"),
        "lastExitCode": state.get("lastExitCode"),
        "lastDurationSeconds": state.get("lastDurationSeconds"),
        "schedule": config.get("schedule"),
        "uptimeSeconds": get_uptime_seconds(),
        "rebootRequired": get_reboot_required()
    }


def normalize_dashboard_url(current_url, new_addr):
    cleaned = (new_addr or "").strip()
    if not cleaned:
        raise ValueError("Missing address")
    if "://" in cleaned:
        return cleaned.rstrip("/")

    scheme = "http"
    port = ""
    try:
        parsed = urlparse(current_url or "")
        if parsed.scheme:
            scheme = parsed.scheme
        if parsed.port:
            port = f":{parsed.port}"
    except Exception:
        pass

    if ":" in cleaned:
        return f"{scheme}://{cleaned}".rstrip("/")
    if port:
        return f"{scheme}://{cleaned}{port}".rstrip("/")
    return f"{scheme}://{cleaned}".rstrip("/")


def send_check_in(config):
    try:
        api_post(
            config,
            "/api/agent/poll",
            build_payload(config),
            extra_headers={"X-Skip-Command": "true"}
        )
    except Exception:
        pass


def show_latest_log():
    log_dir = "/opt/agentautoupdate/logs"
    if not os.path.isdir(log_dir):
        print("No logs found.")
        return
    files = [
        os.path.join(log_dir, name)
        for name in os.listdir(log_dir)
        if name.endswith(".log")
    ]
    if not files:
        print("No logs found.")
        return
    latest = max(files, key=os.path.getmtime)
    with open(latest, "r", encoding="utf-8", errors="ignore") as handle:
        print(handle.read())


def main():
    parser = argparse.ArgumentParser(description="Agent Auto Update CLI")
    parser.add_argument("-version", action="store_true", help="Show agent version")
    parser.add_argument("--version", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument(
        "-config",
        action="store_true",
        help="Update dashboard address"
    )
    parser.add_argument(
        "-newaddr",
        help="New dashboard address or host"
    )
    parser.add_argument(
        "-action",
        choices=["update", "updateagent", "showlog", "uninstall"],
        help="Run an action"
    )
    parser.add_argument("--yes", action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    if args.version:
        print(get_agent_version())
        return

    if args.config:
        if hasattr(os, "geteuid") and os.geteuid() != 0:
            print("This action requires root privileges. Re-run with sudo.")
            raise SystemExit(1)
        if not args.newaddr:
            print("Missing -newaddr for config update.")
            raise SystemExit(1)
        config = load_config()
        current = config.get("dashboardUrl") or ""
        try:
            next_url = normalize_dashboard_url(current, args.newaddr)
        except ValueError as exc:
            print(str(exc))
            raise SystemExit(1)
        if not args.yes and sys.stdin.isatty():
            confirm = input(
                f"Change dashboard URL from {current} to {next_url}? [y/N]: "
            ).strip().lower()
            if confirm not in {"y", "yes"}:
                print("Change cancelled.")
                return
        config["dashboardUrl"] = next_url
        save_config(config)
        print(f"Dashboard URL updated to {next_url}.")
        return

    if not args.action:
        parser.print_help()
        raise SystemExit(1)

    if args.action == "showlog":
        show_latest_log()
        return

    if args.action in {"update", "updateagent", "uninstall"}:
        if hasattr(os, "geteuid") and os.geteuid() != 0:
            print("This action requires root privileges. Re-run with sudo.")
            raise SystemExit(1)

    config = load_config()

    if args.action == "update":
        print("Running update. Output will stream below.\n")
        result = run_update(stream_output=True)
        send_check_in(config)
        if result["status"] != "OK":
            print(result.get("message", "Update failed"))
            raise SystemExit(result["exit_code"])
        print("Update completed.")
        return

    if args.action == "updateagent":
        print("Updating agent. Output will stream below.\n")
        new_version = update_agent(config, verbose=True)
        send_check_in(config)
        restart_poller()
        print(f"Updated agent to {new_version}.")
        return

    if args.action == "uninstall":
        if not args.yes and sys.stdin.isatty():
            confirm = input("Uninstall agent and remove files? [y/N]: ").strip().lower()
            if confirm not in {"y", "yes"}:
                print("Uninstall cancelled.")
                return
        uninstall_agent(stop_running=True)
        send_check_in(config)
        print("Agent uninstalled.")


if __name__ == "__main__":
    main()
