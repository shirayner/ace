#!/usr/bin/env python3
"""
spechub-workflow.py — SpecHub Coding 工作流统一 CLI

子命令:
  info    仅获取需求元信息（标题/状态），不拉取产物、不创建目录
  start   前置检查 + 获取需求 + 拉取产物 + 初始化状态
  inbox   仅列出 inbox（供 AI 让用户选择）
  archive 构建 decisions + 上报 SpecHub + 清理状态

用法:
  python3 spechub-workflow.py info <reqId> --repo-root <path>
  python3 spechub-workflow.py start <reqId> --change-name <name> --repo-root <path>
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
  11 = git remote 获取失败 / changeName 无效
  12 = 分支不匹配（start 必须在 feat/{changeName} 分支上执行）
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
        error_output = {"status": "http_error", "errorCode": e.code, "errorMessage": e.reason, "url": url}
        print(json.dumps(error_output, ensure_ascii=False, indent=2))
        sys.exit(1)
    except URLError as e:
        error_output = {"status": "network_error", "errorMessage": str(e.reason), "url": url}
        print(json.dumps(error_output, ensure_ascii=False, indent=2))
        sys.exit(1)


def check_response_status(resp: dict) -> None:
    """Check SOA gateway response status."""
    rs = resp.get("ResponseStatus", resp.get("responseStatus", {}))
    if rs.get("Ack", rs.get("ack")) == "Failure":
        msg = rs.get("Message", rs.get("message", "Unknown"))
        print(f"Response error: {msg}", file=sys.stderr)
        sys.exit(1)


def check_business_status(resp: dict, allow_incomplete: bool = False) -> str | None:
    """Check businessResponsesStatus.

    If allow_incomplete=True, ARTIFACTS_INCOMPLETE is treated as a warning
    (returns the status code) instead of a fatal error.
    Returns the statusCode if it's a non-fatal warning, None otherwise.
    On fatal business error, prints JSON error info to stdout and exits with code 3.
    """
    brs = resp.get("businessResponsesStatus", {})
    status_code = brs.get("statusCode", "")
    if status_code and status_code != "OK":
        if allow_incomplete and status_code == "ARTIFACTS_INCOMPLETE":
            return status_code
        error_msg = brs.get("errorMessage", "Unknown error")
        error_output = {
            "status": "business_error",
            "errorCode": status_code,
            "errorMessage": error_msg
        }
        print(json.dumps(error_output, ensure_ascii=False, indent=2))
        sys.exit(3)
    return None


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
    """Check openspec/ exists. Return status dict.

    NOTE: project-profile.md is optional and NOT checked here.
    Each phase handles its absence gracefully (falls back to code exploration).
    """
    issues = []

    openspec_dir = repo_root / "openspec"
    if not openspec_dir.is_dir():
        issues.append("openspec/ 目录不存在，需先由 AI 前置检查初始化")

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


def get_current_branch(repo_root: Path) -> str:
    """Get the current git branch name. Returns empty string on failure."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, cwd=str(repo_root)
        )
        if result.returncode != 0:
            return ""
        return result.stdout.strip()
    except FileNotFoundError:
        return ""


def enforce_branch_for_start(repo_root: Path, change_name: str, allow_mismatch: bool) -> None:
    """Enforce branch convention before pulling artifacts.

    Required branch: feat/{changeName}
    Rejects execution if current branch is master/main or any other branch,
    unless --allow-branch-mismatch is explicitly set (after user confirmation).

    Exit code 12 = branch_mismatch.
    """
    if allow_mismatch:
        return

    current_branch = get_current_branch(repo_root)
    expected_branch = f"feat/{change_name}"

    if current_branch == expected_branch:
        return

    print(json.dumps({
        "status": "branch_mismatch",
        "currentBranch": current_branch,
        "expectedBranch": expected_branch,
        "changeName": change_name,
        "error": (
            f"Refusing to pull artifacts: current branch is '{current_branch}' "
            f"but expected '{expected_branch}'. PULL phase requires branch "
            f"switching BEFORE artifact pull (see references/phases/pull.md Step 4)."
        ),
        "hint": (
            f"Run one of:\n"
            f"  git checkout {expected_branch}                # if branch exists\n"
            f"  git checkout -b {expected_branch}             # if creating new\n"
            f"Then re-run start. If user explicitly confirmed using a different "
            f"branch, pass --allow-branch-mismatch to override."
        )
    }, ensure_ascii=False, indent=2))
    sys.exit(12)


# ─── Command: info ─────────────────────────────────────────────────────────

def cmd_info(repo_root: Path, req_id: int) -> None:
    """Fetch requirement metadata only. No directory creation, no artifact download."""
    pre = check_preconditions(repo_root)
    if not pre["ok"]:
        print(json.dumps({"status": "precondition_failed", "issues": pre["issues"]},
                         ensure_ascii=False, indent=2))
        sys.exit(10)

    git_url = get_git_remote_url(repo_root)

    resp = post_json("/getHandoffBundle", {
        "requirementId": str(req_id),
        "gitRemoteUrl": git_url
    })
    check_response_status(resp)
    check_business_status(resp)

    manifest = resp.get("manifest", {})
    output = {
        "status": "ok",
        "reqId": req_id,
        "title": manifest.get("requirementTitle", f"Requirement {req_id}"),
        "requirementStatus": manifest.get("requirementStatus", ""),
        "gitRemoteUrl": git_url
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


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

def cmd_start(repo_root: Path, req_id: int, change_name: str = None, allow_branch_mismatch: bool = False) -> None:
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
    incomplete_warning = check_business_status(resp, allow_incomplete=True)

    # Write raw artifacts to .ace/tasks/{changeName}/input/
    # Use externally provided change_name if given, otherwise derive from title
    title = resp.get("manifest", {}).get("requirementTitle", f"Requirement {req_id}")
    effective_change_name = change_name if change_name else _title_to_slug(title, req_id)

    # Validate changeName against openspec CLI requirement.
    # Failure modes:
    #   1. Title is fully non-ASCII (e.g. Chinese) and no --change-name provided
    #      → _title_to_slug returns "" → reject with actionable error.
    #   2. Caller passed a malformed --change-name → reject early.
    if not _validate_change_name(effective_change_name):
        print(json.dumps({
            "status": "invalid_change_name",
            "reqId": req_id,
            "title": title,
            "derivedChangeName": effective_change_name,
            "providedChangeName": change_name,
            "error": (
                "changeName must match ^[a-z0-9]+(-[a-z0-9]+)*$ "
                "(openspec CLI requirement). "
                "Title appears to contain non-ASCII characters (e.g. CJK) — "
                "auto-derivation cannot produce a valid slug. "
                "Please re-invoke with --change-name <english-kebab-case>, "
                "e.g. --change-name black-diamond-retention-rules."
            ),
            "hint": "AI caller should translate the Chinese title to a 2-5 word English kebab-case slug and pass via --change-name."
        }, ensure_ascii=False, indent=2))
        sys.exit(11)

    # HARD GATE: branch must be feat/{changeName} before pulling artifacts.
    # AI tends to skip the documented branch-switch step; enforce it in the
    # script so artifacts cannot be pulled onto the wrong branch.
    enforce_branch_for_start(repo_root, effective_change_name, allow_branch_mismatch)

    task_dir = repo_root / ".ace" / "tasks" / effective_change_name
    input_dir = task_dir / "input"
    artifacts_dir = input_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

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

    # Write manifest to input/manifest.json
    manifest = resp.get("manifest", {})
    write_file(input_dir / "manifest.json",
               json.dumps(manifest, ensure_ascii=False, indent=2))

    # Initialize state.json at .ace/tasks/{changeName}/state.json
    task_dir.mkdir(parents=True, exist_ok=True)

    # Create artifacts/analysis dir for PREPARE phase outputs
    (task_dir / "artifacts" / "analysis").mkdir(parents=True, exist_ok=True)

    state = {
        "changeName": effective_change_name,
        "type": "spechub",
        "skillName": "spechub-coding",
        "status": "in_progress",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "completed_at": None,
        "archived_at": None,
        "completion_criteria": [],
        "tasks": [],
        "spechub": {
            "reqId": req_id,
            "title": title,
            "currentPhase": "prepare",
            "phases": {
                "pull": {"status": "done", "ts": now_iso(), "outputs": ["input/manifest.json", "input/artifacts/"]},
                "prepare": {"status": "pending"},
                "design": {"status": "pending"},
                "implement": {"status": "pending"},
                "verify": {"status": "pending"},
                "archive": {"status": "pending"}
            },
            "gates": {},
            "divergences": []
        }
    }
    write_file(task_dir / "state.json", json.dumps(state, ensure_ascii=False, indent=2))

    # Detect which optional artifacts are missing (for AI layer awareness)
    missing_artifacts = []
    if not resp.get("contracts"):
        missing_artifacts.append("contracts")
    if not (resp.get("databaseDesign", {}).get("exists")):
        missing_artifacts.append("database-design")
    if not (resp.get("qmqDesign", {}).get("exists")):
        missing_artifacts.append("qmq-design")

    # Output summary
    output = {
        "status": "ok",
        "reqId": req_id,
        "title": title,
        "changeName": effective_change_name,
        "gitRemoteUrl": git_url,
        "taskDir": str(task_dir),
        "inputDir": str(input_dir),
        "writtenFiles": written_files,
        "missingArtifacts": missing_artifacts,
        "artifactsIncomplete": incomplete_warning == "ARTIFACTS_INCOMPLETE",
        "nextPhase": "prepare"
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def _title_to_slug(title: str, req_id: int = 0) -> str:
    """Convert title to kebab-case slug.

    Only ASCII letters/digits/hyphens are preserved (openspec CLI requires
    [a-z0-9-] only). Non-ASCII characters (e.g. CJK) are stripped — if the
    title is fully non-ASCII the function returns an empty slug, which the
    caller must detect and reject (see cmd_start validation).
    """
    import re
    # Strip everything except ASCII letters, digits, whitespace, hyphens, underscores
    # (underscores are kept here so the next pass can normalize them to hyphens)
    slug = re.sub(r'[^a-z0-9\s\-_]', '', title.lower())
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    # Limit length
    if len(slug) > 50:
        slug = slug[:50].rstrip('-')
    return slug or ""


_SLUG_PATTERN = __import__('re').compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def _validate_change_name(name: str) -> bool:
    """Validate changeName matches openspec CLI requirement: lowercase letters,
    digits, and hyphens only (no leading/trailing/double hyphens)."""
    if not name:
        return False
    return bool(_SLUG_PATTERN.match(name))


# ─── Command: archive ───────────────────────────────────────────────────────

def _find_state_by_req_id(tasks_dir: Path, req_id: int):
    """Find state.json for a given reqId.

    Searches both active tasks (.ace/tasks/{changeName}/) and archived tasks
    (.ace/tasks/archive/*-{changeName}/) so that this script can be called
    AFTER ace-done.py has already moved the directory.

    Returns (state_path, task_dir) or (None, None) if not found.
    """
    candidates = []

    if not tasks_dir.is_dir():
        return None, None

    # Active tasks: .ace/tasks/{changeName}/
    for child in tasks_dir.iterdir():
        if child.name == 'archive' or not child.is_dir():
            continue
        candidates.append(child)

    # Archived tasks: .ace/tasks/archive/*-{changeName}/
    archive_dir = tasks_dir / "archive"
    if archive_dir.is_dir():
        for child in archive_dir.iterdir():
            if child.is_dir():
                candidates.append(child)

    for task_dir in candidates:
        candidate = task_dir / "state.json"
        if not candidate.is_file():
            continue
        try:
            with open(candidate, encoding="utf-8") as f:
                s = json.load(f)
            s_req_id = (
                s.get("spechub", {}).get("reqId")
                or s.get("reqId")
            )
            if s_req_id == req_id:
                return candidate, task_dir
        except (json.JSONDecodeError, KeyError):
            continue

    return None, None


def cmd_archive(repo_root: Path, req_id: int, branch: str, commit: str) -> None:
    """Report to SpecHub API.

    Can be called before OR after ace-done.py:
    - Before archive: task_dir is the active path (.ace/tasks/{changeName}/)
    - After archive:  task_dir is the archived path (.ace/tasks/archive/<date>-{changeName}/)

    The recommended order is:
      python3 ace-done.py {changeName} --repo-root ...   ← complete + archive
      python3 spechub-workflow.py archive ...             ← then report to SpecHub
    """
    git_url = get_git_remote_url(repo_root)

    tasks_dir = repo_root / ".ace" / "tasks"
    state_path, task_dir = _find_state_by_req_id(tasks_dir, req_id)

    if not state_path or not state_path.is_file():
        print(f"state.json not found for reqId {req_id} in .ace/tasks/ (active or archive)", file=sys.stderr)
        sys.exit(2)

    # Read state to get divergences
    with open(state_path, encoding="utf-8") as f:
        state = json.load(f)

    # Read divergences: prefer divergences.jsonl (new format), fall back to state.json
    task_dir = state_path.parent
    divergences_file = task_dir / "artifacts" / "divergences.jsonl"
    if divergences_file.is_file():
        divergences = []
        with open(divergences_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        divergences.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    else:
        # Legacy: read from state.json (nested or flat)
        divergences = (
            state.get("spechub", {}).get("divergences")
            or state.get("divergences")
            or []
        )

    # Read existing decisions.md (written by AI in Step 3), fallback to generating from divergences
    decisions_file = task_dir / "artifacts" / "decisions.md"
    if decisions_file.exists():
        decisions_md = decisions_file.read_text(encoding="utf-8")
    else:
        decisions_md = _divergences_to_markdown(divergences)

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
        "decisionsFile": str(task_dir / "artifacts" / "decisions.md"),
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

    # info
    p_info = subparsers.add_parser("info", help="获取需求元信息（不拉取产物）")
    p_info.add_argument("req_id", type=int, help="需求 ID")
    p_info.add_argument("--repo-root", required=True, help="项目根目录")

    # inbox
    p_inbox = subparsers.add_parser("inbox", help="列出 inbox 需求列表")
    p_inbox.add_argument("--repo-root", required=True, help="项目根目录")

    # start
    p_start = subparsers.add_parser("start", help="前置检查 + 拉取产物 + 初始化状态")
    p_start.add_argument("req_id", type=int, help="需求 ID")
    p_start.add_argument("--repo-root", required=True, help="项目根目录")
    p_start.add_argument("--change-name", dest="change_name", default=None,
                         help="指定 changeName（AI 从标题翻译生成）；为空则 fallback 到 _title_to_slug")
    p_start.add_argument("--allow-branch-mismatch", dest="allow_branch_mismatch",
                         action="store_true",
                         help="允许在非 feat/{changeName} 分支上执行（仅当用户已确认时）")

    # archive
    p_archive = subparsers.add_parser("archive", help="构建 decisions + 上报 + 清理")
    p_archive.add_argument("req_id", type=int, help="需求 ID")
    p_archive.add_argument("--repo-root", required=True, help="项目根目录")
    p_archive.add_argument("--branch", required=True, help="分支名")
    p_archive.add_argument("--commit", required=True, help="提交哈希")

    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()

    if args.command == "info":
        cmd_info(repo_root, args.req_id)
    elif args.command == "inbox":
        cmd_inbox(repo_root)
    elif args.command == "start":
        cmd_start(repo_root, args.req_id, args.change_name, args.allow_branch_mismatch)
    elif args.command == "archive":
        cmd_archive(repo_root, args.req_id, args.branch, args.commit)


if __name__ == "__main__":
    main()
