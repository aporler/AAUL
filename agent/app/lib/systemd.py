import subprocess
from pathlib import Path


def systemctl(args):
    subprocess.run(["systemctl", *args], check=False)


def set_schedule(enabled, daily_time):
    override_dir = Path("/etc/systemd/system/agentautoupdate-run.timer.d")
    override_dir.mkdir(parents=True, exist_ok=True)
    override_path = override_dir / "override.conf"
    override_path.write_text(
        f"[Timer]\nOnCalendar=*-*-* {daily_time}:00\n",
        encoding="utf-8"
    )
    systemctl(["daemon-reload"])
    if enabled:
        systemctl(["enable", "--now", "agentautoupdate-run.timer"])
        systemctl(["restart", "agentautoupdate-run.timer"])
    else:
        systemctl(["disable", "--now", "agentautoupdate-run.timer"])


def restart_poller():
    systemctl(["restart", "agentautoupdate.service"])


def stop_services():
    systemctl(["stop", "agentautoupdate.service"])
    systemctl(["stop", "agentautoupdate-run.timer"])
    systemctl(["disable", "agentautoupdate.service"])
    systemctl(["disable", "agentautoupdate-run.timer"])


def remove_units():
    paths = [
        "/etc/systemd/system/agentautoupdate.service",
        "/etc/systemd/system/agentautoupdate-run.service",
        "/etc/systemd/system/agentautoupdate-run.timer"
    ]
    for path in paths:
        Path(path).unlink(missing_ok=True)
    override_dir = Path("/etc/systemd/system/agentautoupdate-run.timer.d")
    if override_dir.exists():
        for child in override_dir.iterdir():
            child.unlink(missing_ok=True)
        override_dir.rmdir()
    systemctl(["daemon-reload"])