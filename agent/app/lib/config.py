import json
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path("/opt/agentautoupdate/config.json")
STATE_PATH = Path("/opt/agentautoupdate/state.json")
LOG_DIR = Path("/opt/agentautoupdate/logs")
LOCK_PATH = Path("/opt/agentautoupdate/run.lock")
VERSION_PATH = APP_DIR / "VERSION"


def load_config():
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Missing config: {CONFIG_PATH}")
    data = json.loads(CONFIG_PATH.read_text())
    schedule = data.get("schedule") or {}
    data["schedule"] = {
        "enabled": bool(schedule.get("enabled", False)),
        "dailyTime": schedule.get("dailyTime", "03:00")
    }
    return data


def save_config(data):
    schedule = data.get("schedule") or {}
    payload = {
        **data,
        "schedule": {
            "enabled": bool(schedule.get("enabled", False)),
            "dailyTime": schedule.get("dailyTime", "03:00")
        }
    }
    tmp_path = CONFIG_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload, indent=2))
    tmp_path.replace(CONFIG_PATH)


def read_state():
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text())
    except json.JSONDecodeError:
        return {}


def write_state(state):
    tmp_path = STATE_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(state, indent=2))
    tmp_path.replace(STATE_PATH)


def get_agent_version():
    if VERSION_PATH.exists():
        return VERSION_PATH.read_text().strip()
    return "0.0.0"