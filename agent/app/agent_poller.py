"""
Agent Auto Update Poller

Main polling service that communicates with the dashboard server.
Handles command execution and state synchronization.

This module runs as a systemd service and:
- Polls the dashboard at configurable intervals
- Receives and executes commands (update, schedule, uninstall, etc.)
- Reports command results back to the dashboard
- Optionally starts a local web management interface

Usage:
    python agent_poller.py          # Run continuous polling
    python agent_poller.py --once   # Single poll (for testing)
"""

import argparse
import time

from lib.api import api_post
from lib.config import load_config, read_state, save_config, get_agent_version
from lib.uninstall import uninstall_agent
from lib.util import append_log, get_hostname, get_primary_ip, utc_now_iso
from lib.system_info import collect_system_info, get_reboot_required, get_uptime_seconds
from lib.systemd import set_schedule, restart_poller
from lib.logs import list_logs, read_log
from lib.updater import update_agent, UpdateError
from lib.local_web import get_local_web_manager, start_local_server, stop_local_server, is_server_running
from agent_runner import run_update


# Global local web manager instance
_local_web_manager = None


def get_local_web():
    """Get the local web manager singleton."""
    global _local_web_manager
    if _local_web_manager is None:
        _local_web_manager = get_local_web_manager()
    return _local_web_manager


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


def handle_command(config, command):
    cmd_type = command.get("type")
    result_payload = {}
    error_message = None
    status = "DONE"
    restart = False
    exit_after = False

    try:
        if cmd_type == "RUN_NOW":
            result = run_update()
            result_payload = {
                "lastStatus": result["status"],
                "lastExitCode": result["exit_code"],
                "lastDurationSeconds": result["duration"]
            }
            if result["status"] != "OK":
                status = "ERROR"
                error_message = result.get("message")
        elif cmd_type == "SET_SCHEDULE":
            payload = command.get("payload") or {}
            enabled = bool(payload.get("enabled"))
            daily_time = payload.get("dailyTime") or "03:00"
            config["schedule"] = {"enabled": enabled, "dailyTime": daily_time}
            save_config(config)
            set_schedule(enabled, daily_time)
            result_payload = {"schedule": config["schedule"]}
        elif cmd_type == "UPDATE_AGENT":
            new_version = update_agent(config)
            result_payload = {"version": new_version}
            restart = True
        elif cmd_type == "SET_POLL_INTERVAL":
            payload = command.get("payload") or {}
            poll_value = int(payload.get("pollIntervalSeconds") or 0)
            if poll_value <= 0:
                raise ValueError("Invalid poll interval")
            config["pollIntervalSeconds"] = poll_value
            save_config(config)
            result_payload = {"pollIntervalSeconds": poll_value}
            restart = True
        elif cmd_type == "UNINSTALL":
            uninstall_agent(stop_running=False)
            result_payload = {"uninstalled": True}
            exit_after = True
        elif cmd_type == "LIST_LOGS":
            result_payload = {"logs": list_logs()}
        elif cmd_type == "FETCH_LOG":
            payload = command.get("payload") or {}
            log_name = payload.get("logName")
            if not log_name:
                raise ValueError("Missing logName")
            result_payload = read_log(log_name)
        elif cmd_type == "FETCH_INFO":
            result_payload = collect_system_info()
        else:
            status = "ERROR"
            error_message = f"Unknown command {cmd_type}"
    except UpdateError as exc:
        status = "ERROR"
        error_message = str(exc)
    except Exception as exc:
        status = "ERROR"
        error_message = str(exc)

    return status, result_payload, error_message, restart, exit_after


def send_command_result(config, command_id, status, result, error_message):
    payload = {
        "agentId": config.get("agentId"),
        "commandId": command_id,
        "status": status,
        "result": result,
        "errorMessage": error_message
    }
    api_post(config, "/api/agent/command-result", payload)


def apply_local_web_config(response):
    """
    Apply local web configuration received from dashboard.
    
    Args:
        response: Poll response containing localWeb config
    """
    local_web_config = response.get("localWeb")
    if local_web_config is None:
        return
    
    try:
        manager = get_local_web()
        # Create a config dict that matches what apply_config expects
        config_for_manager = {"localWeb": local_web_config}
        manager.apply_config(config_for_manager)
    except Exception as exc:
        append_log(f"Failed to apply local web config: {exc}")


def poll_once():
    config = load_config()
    payload = build_payload(config)
    response = api_post(config, "/api/agent/poll", payload)
    
    # Update state with poll timestamp
    state = read_state()
    state["lastPoll"] = utc_now_iso()
    from lib.config import write_state
    write_state(state)
    
    # Apply local web configuration from dashboard
    apply_local_web_config(response)
    
    command = response.get("command")
    if not command:
        return

    status, result, error_message, restart, exit_after = handle_command(config, command)
    send_command_result(config, command.get("id"), status, result, error_message)

    if restart:
        restart_poller()
        raise SystemExit(0)
    if exit_after:
        raise SystemExit(0)


def main():
    """
    Main entry point for the agent poller.
    
    Supports two modes:
    - --once: Single poll for testing/debugging
    - Continuous: Polls at configured interval until stopped
    """
    parser = argparse.ArgumentParser(description="Agent Auto Update poller")
    parser.add_argument("--once", action="store_true", help="Send a single poll")
    args = parser.parse_args()

    if args.once:
        try:
            poll_once()
        except Exception as exc:
            append_log(f"poll_once error: {exc}")
        return

    config = load_config()
    interval = int(config.get("pollIntervalSeconds", 60))
    
    # Initialize local web manager (will restore previous state if any)
    try:
        manager = get_local_web()
        append_log(f"Local web manager initialized: running={manager.is_running()}")
    except Exception as exc:
        append_log(f"Failed to initialize local web manager: {exc}")

    try:
        while True:
            try:
                poll_once()
            except Exception as exc:
                append_log(f"poll error: {exc}")
            time.sleep(interval)
    finally:
        # Cleanup on exit
        try:
            manager = get_local_web()
            if manager.is_running():
                manager.stop()
        except:
            pass


if __name__ == "__main__":
    main()
