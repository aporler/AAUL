import shutil


def detect_package_manager():
    if shutil.which("apt-get"):
        return "apt"
    if shutil.which("dnf"):
        return "dnf"
    if shutil.which("yum"):
        return "yum"
    return "unknown"


def get_update_commands():
    manager = detect_package_manager()
    if manager == "apt":
        return [
            ["apt-get", "update"],
            ["apt-get", "full-upgrade", "-y"],
            ["apt-get", "autoremove", "-y"],
            ["apt-get", "autoclean", "-y"]
        ]
    if manager in ("dnf", "yum"):
        cmd = "dnf" if manager == "dnf" else "yum"
        return [
            [cmd, "-y", "makecache"],
            [cmd, "-y", "upgrade"],
            [cmd, "-y", "autoremove"],
            [cmd, "-y", "clean", "all"]
        ]
    return []
