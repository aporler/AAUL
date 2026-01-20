import os
import platform
import re
import shutil
import subprocess
from pathlib import Path

from .util import get_primary_ip, utc_now_iso
from .package_manager import detect_package_manager

SKIP_FS_TYPES = {
    "proc",
    "sysfs",
    "tmpfs",
    "devtmpfs",
    "devpts",
    "cgroup",
    "cgroup2",
    "overlay",
    "squashfs",
    "aufs",
    "rpc_pipefs",
    "nsfs",
    "fusectl",
    "securityfs",
    "pstore",
    "autofs",
    "mqueue",
    "hugetlbfs",
    "debugfs",
    "tracefs",
    "ramfs",
    "bpf"
}

MAX_REPO_LINES = 200


def _read_os_release():
    data = {}
    path = Path("/etc/os-release")
    if not path.exists():
        return data
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        data[key.strip()] = value
    return data


def get_os_info():
    data = _read_os_release()
    name = data.get("NAME") or platform.system()
    version = data.get("VERSION_ID") or platform.release()
    pretty = data.get("PRETTY_NAME") or f"{name} {version}".strip()
    return {"name": name, "version": version, "prettyName": pretty}

def get_uptime_seconds():
    path = Path("/proc/uptime")
    if path.exists():
        try:
            raw = path.read_text(encoding="utf-8", errors="ignore").split()[0]
            return int(float(raw))
        except (OSError, ValueError, IndexError):
            return None
    return None


def get_reboot_required():
    if Path("/var/run/reboot-required").exists() or Path("/run/reboot-required").exists():
        return True
    needs_restarting = shutil.which("needs-restarting")
    if needs_restarting:
        try:
            result = subprocess.run(
                [needs_restarting, "-r"],
                capture_output=True,
                text=True,
                timeout=5
            )
        except (OSError, subprocess.SubprocessError):
            return False
        if result.returncode == 1:
            return True
        if result.returncode == 0:
            return False
    return False


def get_cpu_info():
    model = ""
    cores = None
    cpuinfo = Path("/proc/cpuinfo")
    if cpuinfo.exists():
        for line in cpuinfo.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("model name") and not model:
                model = line.split(":", 1)[1].strip()
            if line.startswith("cpu cores") and cores is None:
                try:
                    cores = int(line.split(":", 1)[1].strip())
                except ValueError:
                    cores = None
    if not model:
        model = platform.processor() or "Unknown"
    threads = os.cpu_count() or 0
    if not cores:
        cores = threads
    
    # Get CPU usage percentage (average over 1 second)
    usage_percent = 0.0
    try:
        # Read /proc/stat for CPU usage
        stat_path = Path("/proc/stat")
        if stat_path.exists():
            import time
            # First reading
            lines1 = stat_path.read_text().splitlines()
            cpu_line1 = next((l for l in lines1 if l.startswith("cpu ")), None)
            if cpu_line1:
                values1 = [int(x) for x in cpu_line1.split()[1:]]
                total1 = sum(values1)
                idle1 = values1[3]  # idle time is 4th value
                
                time.sleep(0.1)  # Small delay
                
                # Second reading
                lines2 = stat_path.read_text().splitlines()
                cpu_line2 = next((l for l in lines2 if l.startswith("cpu ")), None)
                if cpu_line2:
                    values2 = [int(x) for x in cpu_line2.split()[1:]]
                    total2 = sum(values2)
                    idle2 = values2[3]
                    
                    # Calculate percentage
                    total_diff = total2 - total1
                    idle_diff = idle2 - idle1
                    if total_diff > 0:
                        usage_percent = 100.0 * (total_diff - idle_diff) / total_diff
    except Exception:
        pass
    
    return {
        "model": model, 
        "cores": cores or 0, 
        "threads": threads,
        "usagePercent": round(usage_percent, 1)
    }


def _read_meminfo():
    info = {}
    path = Path("/proc/meminfo")
    if not path.exists():
        return info
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        parts = value.strip().split()
        if not parts:
            continue
        try:
            info[key.strip()] = int(parts[0])
        except ValueError:
            continue
    return info


def get_memory_info():
    info = _read_meminfo()
    total_kb = info.get("MemTotal") or 0
    avail_kb = info.get("MemAvailable") or info.get("MemFree") or 0
    total = total_kb * 1024
    available = avail_kb * 1024
    used = total - available if total else 0
    return {
        "totalBytes": total,
        "availableBytes": available,
        "usedBytes": used
    }


def _parse_ip_output(text):
    ips = []
    for line in text.splitlines():
        match = re.search(r"\sinet6?\s+([0-9a-fA-F:.]+)/", line)
        if not match:
            continue
        ip = match.group(1)
        if ip.startswith("127.") or ip == "::1":
            continue
        ips.append(ip)
    return ips


def get_ip_addresses():
    ips = []
    ip_cmd = shutil.which("ip")
    if ip_cmd:
        for family in ("-4", "-6"):
            try:
                result = subprocess.run(
                    [ip_cmd, "-o", family, "addr", "show"],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
            except (OSError, subprocess.SubprocessError):
                continue
            if result.returncode == 0:
                ips.extend(_parse_ip_output(result.stdout))
    if not ips:
        primary = get_primary_ip()
        if primary and not primary.startswith("127."):
            ips.append(primary)
    return sorted(set(ips))


def get_disks():
    disks = []
    mounts = Path("/proc/mounts")
    if not mounts.exists():
        return disks
    seen = set()
    for line in mounts.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split()
        if len(parts) < 3:
            continue
        device, mount, fstype = parts[0], parts[1], parts[2]
        if fstype in SKIP_FS_TYPES:
            continue
        if mount.startswith("/snap"):
            continue
        if mount in seen:
            continue
        seen.add(mount)
        try:
            stats = os.statvfs(mount)
        except OSError:
            continue
        size = stats.f_blocks * stats.f_frsize
        avail = stats.f_bavail * stats.f_frsize
        used = (stats.f_blocks - stats.f_bfree) * stats.f_frsize
        disks.append(
            {
                "device": device,
                "mount": mount,
                "fsType": fstype,
                "sizeBytes": size,
                "usedBytes": used,
                "availBytes": avail
            }
        )
    return disks


def get_gpu_info():
    gpus = []
    lspci = shutil.which("lspci")
    if not lspci:
        return gpus
    try:
        result = subprocess.run(
            [lspci],
            capture_output=True,
            text=True,
            timeout=3
        )
    except (OSError, subprocess.SubprocessError):
        return gpus
    if result.returncode != 0:
        return gpus
    for line in result.stdout.splitlines():
        if "VGA compatible controller" in line or "3D controller" in line or "Display controller" in line:
            cleaned = re.sub(r"^[0-9a-fA-F:.]+\s+", "", line).strip()
            gpus.append(cleaned)
    return gpus


def _read_sources_list(path):
    entries = []
    if not path.exists():
        return entries
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        cleaned = line.split("#", 1)[0].strip()
        if not cleaned:
            continue
        entries.append(cleaned)
    return entries


def _dedupe_repos(entries):
    deduped = []
    seen = set()
    for entry in entries:
        if entry in seen:
            continue
        seen.add(entry)
        deduped.append(entry)
        if len(deduped) >= MAX_REPO_LINES:
            break
    return deduped


def _get_apt_repos():
    repos = []
    repos.extend(_read_sources_list(Path("/etc/apt/sources.list")))
    sources_dir = Path("/etc/apt/sources.list.d")
    if sources_dir.exists():
        for path in sorted(sources_dir.glob("*.list")):
            repos.extend(_read_sources_list(path))
    return _dedupe_repos(repos)


def _parse_repo_file(path):
    entries = []
    repo_id = None
    name = None
    baseurl = None
    mirrorlist = None

    def flush():
        if not repo_id:
            return
        detail = baseurl or mirrorlist or name
        if detail:
            entries.append(f"{repo_id} | {detail}")
        else:
            entries.append(repo_id)

    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        cleaned = line.split("#", 1)[0].strip()
        if not cleaned:
            continue
        if cleaned.startswith("[") and cleaned.endswith("]"):
            flush()
            repo_id = cleaned[1:-1].strip()
            name = None
            baseurl = None
            mirrorlist = None
            continue
        if "=" not in cleaned:
            continue
        key, value = cleaned.split("=", 1)
        key = key.strip().lower()
        value = value.strip()
        if key == "name":
            name = value
        elif key == "baseurl":
            baseurl = value
        elif key == "mirrorlist":
            mirrorlist = value
    flush()
    return entries


def _get_dnf_repos():
    repos = []
    sources_dir = Path("/etc/yum.repos.d")
    if sources_dir.exists():
        for path in sorted(sources_dir.glob("*.repo")):
            repos.extend(_parse_repo_file(path))
    return _dedupe_repos(repos)


def get_repositories():
    manager = detect_package_manager()
    if manager == "apt":
        return _get_apt_repos()
    if manager in ("dnf", "yum"):
        return _get_dnf_repos()
    return []


def _get_dpkg_count():
    dpkg_query = shutil.which("dpkg-query")
    if dpkg_query:
        try:
            result = subprocess.run(
                [dpkg_query, "-f", "${Package}\n", "-W"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return len([line for line in result.stdout.splitlines() if line.strip()])
        except (OSError, subprocess.SubprocessError):
            pass
    status_path = Path("/var/lib/dpkg/status")
    if status_path.exists():
        count = 0
        for line in status_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("Package:"):
                count += 1
        return count
    return 0


def _get_rpm_count():
    rpm = shutil.which("rpm")
    if rpm:
        try:
            result = subprocess.run(
                [rpm, "-qa"],
                capture_output=True,
                text=True,
                timeout=6
            )
            if result.returncode == 0:
                return len([line for line in result.stdout.splitlines() if line.strip()])
        except (OSError, subprocess.SubprocessError):
            pass
    return 0


def get_package_count():
    manager = detect_package_manager()
    if manager == "apt":
        return _get_dpkg_count()
    if manager in ("dnf", "yum"):
        return _get_rpm_count()
    count = _get_dpkg_count()
    if count:
        return count
    return _get_rpm_count()


def collect_system_info():
    manager = detect_package_manager()
    return {
        "collectedAt": utc_now_iso(),
        "os": get_os_info(),
        "packageManager": manager,
        "cpu": get_cpu_info(),
        "memory": get_memory_info(),
        "gpu": get_gpu_info(),
        "ips": get_ip_addresses(),
        "disks": get_disks(),
        "repositories": get_repositories(),
        "packagesInstalled": get_package_count(),
        "uptimeSeconds": get_uptime_seconds(),
        "rebootRequired": get_reboot_required()
    }
