#!/usr/bin/env python3
"""
spechub-workflow.py — SpecHub Coding 工作流统一 CLI

子命令:
  start   前置检查 + 获取需求 + 拉取产物 + 初始化状态
  inbox   仅列出 inbox（供 AI 让用户选择）
  archive 构建 decisions + 上报 SpecHub + 清理状态

用法:
  python3 spechub-workflow.py start [reqId] --repo-root <path>
  python3 spechub-workflow.py inbox --repo-root <path>
  python3 spechub-workflow.py archive <reqId> --repo-root <path> --branch <name> --commit <hash>

环境变量:
  SPECHUB_BASE_URL  覆盖 config.json 中的 baseUrl（最高优先级）

配置文件:
  scripts/config.json  多环境配置（activeEnv 指针 + environments 字典）

退出码:
  0 = 成功（JSON 输出到 stdout）
  1 = HTTP/网络错误
  2 = 响应解析失败
  3 = 业务错误
  10 = 前置检查失败（openspec/ 或 profile 不存在）
  11 = git remote 获取失败
"""

import argparse
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Force UTF-8 on stdout/stderr
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# ─── Configuration ─────────────────────────────────────────────────────────

def _load_base_url() -> str:
    """Resolve base URL: env var > config.json > fallback."""
    env_url = os.environ.get("SPECHUB_BASE_URL")
    if env_url:
        return env_url.rstrip("/")

    config_path = Path(__file__).parent / "config.json"
    if config_path.is_file():
        try:
            with open(config_path, encoding="utf-8") as f:
                config = json.load(f)
            active_env = config.get("activeEnv", "prod")
            environments = config.get("environments", {})
            env_config = environments.get(active_env, {})
            url = env_config.get("baseUrl", "")
            if url:
                return url.rstrip("/")
        except (json.JSONDecodeError, KeyError):
            pass

    return "http://spechub.ctripcorp.com/api"


BASE_URL = _load_base_url()


# ─── HTTP Helpers ───────────────────────────────────────────────────────────

def post_json(endpoint: str, payload: dict) -> dict:
    """POST JSON to SOA endpoint, return parsed response."""
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        print(f"HTTP {e.code}: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Network error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def check_response_status(resp: dict) -> None:
    """Check SOA gateway response status."""
    rs = resp.get("ResponseStatus", resp.get("responseStatus", {}))
    if rs.get("Ack", rs.get("ack")) == "Failure":
        msg = rs.get("Message", rs.get("message", "Unknown"))
        print(f"Response error: {msg}", file=sys.stderr)
        sys.exit(1)


def check_business_status(resp: dict) -> None:
    """Check businessResponsesStatus, exit 3 on business error."""
    brs = resp.get("businessResponsesStatus", {})
    status_code = brs.get("statusCode", "")
    if status_code and status_code != "OK":
        error_msg = brs.get("errorMessage", "Unknown error")
        print(f"Business error [{status_code}]: {error_msg}", file=sys.stderr)
        sys.exit(3)


# ─── File Helpers ───────────────────────────────────────────────────────────

def write_file(filepath: Path, content: str) -> None:
    """Write content to file, creating parent dirs."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")


def now_iso() -> str:
    """Return current UTC time in ISO format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── Precondition Checks ───────────────────────────────────────────────────

def check_preconditions(repo_root: Path) -> dict:
    """Check openspec/ and project-profile.md exist. Return status dict."""
    issues = []

    openspec_dir = repo_root / "openspec"
    if not openspec_dir.is_dir():
        issues.append("openspec/ 目录不存在，请先运行: npx @fission-ai/openspec init")

    profile_path = repo_root / ".claude" / "project-profile.md"
    if not profile_path.is_file():
        issues.append(".claude/project-profile.md 不存在，请先运行: /ace:init")

    if issues:
        return {"ok": False, "issues": issues}
    return {"ok": True, "issues": []}


def get_git_remote_url(repo_root: Path) -> str:
    """Get origin fetch URL from git remote."""
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, cwd=str(repo_root)
        )
        if result.returncode != 0:
            print(f"git remote failed: {result.stderr.strip()}", file=sys.stderr)
            sys.exit(11)
        return result.stdout.strip()
    except FileNotFoundError:
        print("git command not found", file=sys.stderr)
        sys.exit(11)


# ─── Command: inbox ─────────────────────────────────────────────────────────

def cmd_inbox(repo_root: Path) -> None:
    """List inbox items for user selection."""
    # Precondition check
    pre = check_preconditions(repo_root)
    if not pre["ok"]:
        print(json.dumps({"status": "precondition_failed", "issues": pre["issues"]},
                         ensure_ascii=False, indent=2))
        sys.exit(10)

    git_url = get_git_remote_url(repo_root)

    resp = post_json("/getHandoffInbox", {"gitRemoteUrl": git_url})
    check_response_status(resp)
    check_business_status(resp)

    items = resp.get("items", [])
    output = {
        "status": "ok",
        "gitRemoteUrl": git_url,
        "items": items
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


# ─── Command: start ─────────────────────────────────────────────────────────

def cmd_start(repo_root: Path, req_id: int) -> None:
    """Pull artifacts and initialize state."""
    # Precondition check
    pre = check_preconditions(repo_root)
    if not pre["ok"]:
        print(json.dumps({"status": "precondition_failed", "issues": pre["issues"]},
                         ensure_ascii=False, indent=2))
        sys.exit(10)

    git_url = get_git_remote_url(repo_root)

    # Pull bundle
    resp = post_json("/getHandoffBundle", {
        "requirementId": str(req_id),
        "gitRemoteUrl": git_url
    })
    check_response_status(resp)
    check_business_status(resp)

    # Write artifacts
    req_id_str = str(req_id)
    base_dir = repo_root / "spechub" / req_id_str
    artifacts_dir = base_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    # Also create analysis dir for agent outputs
    (base_dir / "analysis").mkdir(parents=True, exist_ok=True)

    written_files = []

    for field, filename in [("prd", "prd.md"), ("architecture", "architecture.md"), ("proposal", "proposal.md")]:
        artifact = resp.get(field, {})
        content = artifact.get("content", "")
        if content:
            write_file(artifacts_dir / filename, content)
            written_files.append(filename)

    # Contracts
    contracts = resp.get("contracts", [])
    for contract in contracts:
        fname = contract.get("filename", "unknown.md")
        content = contract.get("content", "")
        if content:
            write_file(artifacts_dir / "contracts" / fname, content)
            written_files.append(f"contracts/{fname}")

    # Optional artifacts
    qmq_design = resp.get("qmqDesign", {})
    if qmq_design.get("exists") and qmq_design.get("content"):
        write_file(artifacts_dir / "qmq-message-design.md", qmq_design["content"])
        written_files.append("qmq-message-design.md")

    database_design = resp.get("databaseDesign", {})
    if database_design.get("exists") and database_design.get("content"):
        write_file(artifacts_dir / "database-design.md", database_design["content"])
        written_files.append("database-design.md")

    # Write manifest
    manifest = resp.get("manifest", {})
    write_file(base_dir / "manifest.json",
               json.dumps(manifest, ensure_ascii=False, indent=2))

    # Initialize state.json
    title = manifest.get("title", f"Requirement {req_id}")
    state = {
        "reqId": req_id,
        "title": title,
        "currentPhase": "comprehend",
        "openspecChange": "",
        "phases": {
            "pull": {"status": "done", "ts": now_iso(), "outputs": ["manifest.json", "artifacts/"]},
            "comprehend": {"status": "pending"},
            "readiness": {"status": "pending"},
            "design": {"status": "pending"},
            "implement": {"status": "pending"},
            "verify": {"status": "pending"},
            "archive": {"status": "pending"}
        },
        "gates": {},
        "divergences": []
    }
    write_file(base_dir / "state.json", json.dumps(state, ensure_ascii=False, indent=2))

    # Write .active
    write_file(repo_root / "spechub" / ".active", req_id_str)

    # Output summary
    output = {
        "status": "ok",
        "reqId": req_id,
        "title": title,
        "gitRemoteUrl": git_url,
        "outputDir": str(base_dir),
        "writtenFiles": written_files,
        "nextPhase": "comprehend"
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


# ─── Command: archive ───────────────────────────────────────────────────────

def cmd_archive(repo_root: Path, req_id: int, branch: str, commit: str) -> None:
    """Report to SpecHub API. Local state cleanup is handled by AI before commit."""
    git_url = get_git_remote_url(repo_root)
    base_dir = repo_root / "spechub" / str(req_id)
    state_path = base_dir / "state.json"

    if not state_path.is_file():
        print(f"state.json not found at {state_path}", file=sys.stderr)
        sys.exit(2)

    # Read state to get divergences
    with open(state_path, encoding="utf-8") as f:
        state = json.load(f)

    divergences = state.get("divergences", [])

    # Build decisions markdown from divergences
    decisions_md = _divergences_to_markdown(divergences)

    # Write decisions.md locally (idempotent — may already exist from AI pre-commit step)
    write_file(base_dir / "decisions.md", decisions_md)

    # Report to SpecHub
    payload = {
        "requirementId": str(req_id),
        "gitRemoteUrl": git_url,
        "status": "COMPLETED",
        "branchName": branch,
        "commitHash": commit,
        "decisions": decisions_md
    }

    resp = post_json("/archiveHandoff", payload)
    check_response_status(resp)
    check_business_status(resp)

    # Output result (no local file modifications after commit)
    output = {
        "status": "ok",
        "archiveRecordId": resp.get("archiveRecordId"),
        "workspaceProjectId": resp.get("workspaceProjectId"),
        "requirementStatus": resp.get("requirementStatus"),
        "decisionsFile": str(base_dir / "decisions.md"),
        "divergenceCount": len([d for d in divergences if d.get("severity") != "minor"])
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def _divergences_to_markdown(divergences: list) -> str:
    """Convert divergences array to decisions markdown."""
    if not divergences:
        return "无偏离，完全按平台产物实现"

    significant = [d for d in divergences if d.get("severity") != "minor"]
    if not significant:
        return "无重要偏离，完全按平台产物实现（仅有细微差异）"

    # Group by category
    groups = {}
    for d in significant:
        category = d.get("category", "其他")
        groups.setdefault(category, []).append(d)

    lines = []
    for category, items in groups.items():
        lines.append(f"## {category}")
        lines.append("")
        for item in items:
            lines.append(f"- 平台方案: {item.get('expected', 'N/A')}")
            lines.append(f"- 本地实现: {item.get('actual', 'N/A')}")
            lines.append(f"- 理由: {item.get('reason', 'N/A')}")
            if item.get("type") == "infra_override":
                lines.append("- 备注: 用户确认跳过，由用户负责后续补全")
            if item.get("type") == "implementation_drift":
                decision = item.get("decision", "")
                if decision:
                    lines.append(f"- 关联设计决策: {decision}")
            lines.append("")

    return "\n".join(lines).strip()


# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SpecHub Coding 工作流统一 CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # inbox
    p_inbox = subparsers.add_parser("inbox", help="列出 inbox 需求列表")
    p_inbox.add_argument("--repo-root", required=True, help="项目根目录")

    # start
    p_start = subparsers.add_parser("start", help="前置检查 + 拉取产物 + 初始化状态")
    p_start.add_argument("req_id", type=int, help="需求 ID")
    p_start.add_argument("--repo-root", required=True, help="项目根目录")

    # archive
    p_archive = subparsers.add_parser("archive", help="构建 decisions + 上报 + 清理")
    p_archive.add_argument("req_id", type=int, help="需求 ID")
    p_archive.add_argument("--repo-root", required=True, help="项目根目录")
    p_archive.add_argument("--branch", required=True, help="分支名")
    p_archive.add_argument("--commit", required=True, help="提交哈希")

    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()

    if args.command == "inbox":
        cmd_inbox(repo_root)
    elif args.command == "start":
        cmd_start(repo_root, args.req_id)
    elif args.command == "archive":
        cmd_archive(repo_root, args.req_id, args.branch, args.commit)


if __name__ == "__main__":
    main()
