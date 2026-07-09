#!/usr/bin/env python3
"""
ace-done.py — ACE 本地归档（complete + archive 一步完成）

用法:
  python3 ace-done.py <changeName> --repo-root <path>

功能:
  1. 定位 .ace/tasks/{changeName}/state.json
  2. 更新 status/completed_at/archived_at
  3. mv 到 .ace/tasks/archive/{YYYYMMDD}-{changeName}/
  4. stdout 输出 JSON 确认

退出码:
  0 = 成功
  2 = state.json 不存在
  3 = 目标归档目录已存在
"""

import argparse
import io
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="ACE 本地归档")
    parser.add_argument("change_name", help="changeName (kebab-case)")
    parser.add_argument("--repo-root", required=True, help="项目根目录")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    change_name = args.change_name
    task_dir = repo_root / ".ace" / "tasks" / change_name
    state_path = task_dir / "state.json"

    if not state_path.is_file():
        print(f"state.json not found: {state_path}", file=sys.stderr)
        sys.exit(2)

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    date_prefix = datetime.now(timezone.utc).strftime("%Y%m%d")
    archive_dir = repo_root / ".ace" / "tasks" / "archive" / f"{date_prefix}-{change_name}"

    if archive_dir.exists():
        print(f"Archive target already exists: {archive_dir}", file=sys.stderr)
        sys.exit(3)

    # Update state.json
    with open(state_path, encoding="utf-8") as f:
        state = json.load(f)

    state["status"] = "completed"
    state["completed_at"] = now_iso
    state["archived_at"] = now_iso

    # Update nested spechub block if present
    if "spechub" in state and isinstance(state["spechub"], dict):
        state["spechub"]["currentPhase"] = "done"
        phases = state["spechub"].get("phases", {})
        if "archive" in phases:
            phases["archive"]["status"] = "done"
            phases["archive"]["ts"] = now_iso

    with open(state_path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    # Move to archive
    archive_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(task_dir), str(archive_dir))

    output = {
        "status": "ok",
        "changeName": change_name,
        "archivePath": str(archive_dir),
        "completed_at": now_iso,
        "archived_at": now_iso
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
