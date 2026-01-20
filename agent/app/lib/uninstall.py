import shutil
import subprocess
import tempfile
from pathlib import Path

from .systemd import systemctl, stop_services, remove_units


def _schedule_self_uninstall():
    script_content = """#!/bin/sh
set -e

systemctl stop agentautoupdate.service || true
systemctl stop agentautoupdate-run.timer || true
systemctl disable agentautoupdate.service || true
systemctl disable agentautoupdate-run.timer || true

rm -f /etc/systemd/system/agentautoupdate.service
rm -f /etc/systemd/system/agentautoupdate-run.service
rm -f /etc/systemd/system/agentautoupdate-run.timer
rm -rf /etc/systemd/system/agentautoupdate-run.timer.d

systemctl daemon-reload || true

rm -f /usr/local/bin/agentautoupdate
rm -rf /opt/agentautoupdate

rm -f "$0"
"""

    script_dir = Path(tempfile.gettempdir())
    script_path = script_dir / "agentautoupdate-uninstall.sh"
    script_path.write_text(script_content, encoding="utf-8")
    script_path.chmod(0o700)

    # Try systemd-run first (preferred on systemd systems)
    if shutil.which("systemd-run"):
        subprocess.run(
            [
                "systemd-run",
                "--no-block",
                "/bin/sh",
                "-c",
                f"sleep 2; {script_path}"
            ],
            check=False
        )
        return

    # Fallback: nohup background
    subprocess.Popen(
        ["/bin/sh", "-c", f"nohup sh -c 'sleep 2; {script_path}' >/dev/null 2>&1 &"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )


def uninstall_agent(stop_running=True):
    if stop_running:
        stop_services()
        remove_units()

        Path("/usr/local/bin/agentautoupdate").unlink(missing_ok=True)
        install_dir = Path("/opt/agentautoupdate")
        if install_dir.exists():
            shutil.rmtree(install_dir, ignore_errors=True)
        return

    # Running from the poller: schedule uninstall after exit
    systemctl(["disable", "agentautoupdate.service"])
    systemctl(["disable", "agentautoupdate-run.timer"])
    systemctl(["stop", "agentautoupdate-run.timer"])
    _schedule_self_uninstall()