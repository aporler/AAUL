import shutil
import tarfile
import tempfile
import subprocess
from pathlib import Path

from .api import api_get
from .config import APP_DIR


class UpdateError(RuntimeError):
    pass


def update_agent(config, verbose=False):
    def log(message):
        if verbose:
            print(message)

    log("Downloading agent bundle...")
    bundle_response = api_get(config, "/agent/latest.tar.gz", timeout=30, stream=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="agentautoupdate-", dir="/opt/agentautoupdate"))
    bundle_path = temp_dir / "latest.tar.gz"

    with bundle_path.open("wb") as handle:
        for chunk in bundle_response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                handle.write(chunk)

    new_app_dir = temp_dir / "app"
    new_app_dir.mkdir(parents=True, exist_ok=True)

    log("Extracting bundle...")
    with tarfile.open(bundle_path, "r:gz") as archive:
        archive.extractall(path=new_app_dir)

    version_path = new_app_dir / "VERSION"
    if not version_path.exists():
        raise UpdateError("Bundle missing VERSION file")
    new_version = version_path.read_text().strip()

    current_dir = APP_DIR
    backup_dir = Path(str(APP_DIR) + ".bak")

    log("Swapping application directory...")
    if backup_dir.exists():
        shutil.rmtree(backup_dir)
    if current_dir.exists():
        current_dir.rename(backup_dir)

    new_app_dir.rename(current_dir)

    if backup_dir.exists():
        shutil.rmtree(backup_dir)

    # Ensure dependencies are installed/updated
    try:
        venv_pip = Path("/opt/agentautoupdate/venv/bin/pip")
        requirements = current_dir / "requirements.txt"
        if venv_pip.exists() and requirements.exists():
            log("Installing Python dependencies...")
            subprocess.run(
                [str(venv_pip), "install", "-r", str(requirements)],
                check=False
            )
    except Exception as exc:
        log(f"Dependency install skipped: {exc}")

    log("Cleaning up...")
    shutil.rmtree(temp_dir)

    log(f"Update complete. Version {new_version}.")
    return new_version
