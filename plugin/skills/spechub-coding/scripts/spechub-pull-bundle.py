#!/usr/bin/env python3
"""
pull-bundle.py — 拉取 SpecHub 产物到本地目录

用法:
  python3 pull-bundle.py <requirementId> <gitRemoteUrl> <repoRoot>
  python3 pull-bundle.py --inbox <gitRemoteUrl>

环境变量:
  SPECHUB_BASE_URL  SOA 服务地址（默认: http://spec-portal-service.ibu.ctripcorp.com）

退出码:
  0 = 成功
  1 = HTTP/网络错误
  2 = 响应解析失败
  3 = 业务错误
"""

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


BASE_URL = os.environ.get(
    "SPECHUB_BASE_URL",
    "http://spec-portal-service.ibu.ctripcorp.com"
)


def post_json(endpoint: str, payload: dict) -> dict:
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


def check_business_status(resp: dict) -> None:
    brs = resp.get("businessResponsesStatus", {})
    if brs.get("errorCode"):
        error_code = brs["errorCode"]
        error_msg = brs.get("errorMessage", "Unknown error")
        print(f"Business error [{error_code}]: {error_msg}", file=sys.stderr)
        sys.exit(3)


def write_artifact(base_dir: Path, filename: str, content: str) -> None:
    filepath = base_dir / filename
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")


def pull_inbox(git_remote_url: str) -> None:
    resp = post_json("/api/handoff/inbox", {"gitRemoteUrl": git_remote_url})
    rs = resp.get("responseStatus", {})
    if rs.get("ack") == "Failure":
        print(f"Response error: {rs.get('message', 'Unknown')}", file=sys.stderr)
        sys.exit(1)
    items = resp.get("items", [])
    print(json.dumps({"items": items}, ensure_ascii=False, indent=2))


def pull_bundle(requirement_id: int, git_remote_url: str, repo_root: str) -> None:
    resp = post_json("/api/handoff/bundle", {
        "requirementId": requirement_id,
        "gitRemoteUrl": git_remote_url
    })
    rs = resp.get("responseStatus", {})
    if rs.get("ack") == "Failure":
        print(f"Response error: {rs.get('message', 'Unknown')}", file=sys.stderr)
        sys.exit(1)
    check_business_status(resp)

    req_id_str = str(requirement_id)
    base_dir = Path(repo_root) / "spechub" / req_id_str
    artifacts_dir = base_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    written_files = []
    for field, filename in [("prd", "prd.md"), ("architecture", "architecture.md"), ("proposal", "proposal.md")]:
        artifact = resp.get(field, {})
        content = artifact.get("content", "")
        if content:
            write_artifact(artifacts_dir, filename, content)
            written_files.append(filename)

    contracts = resp.get("contracts", [])
    for contract in contracts:
        fname = contract.get("filename", "unknown.md")
        content = contract.get("content", "")
        if content:
            write_artifact(artifacts_dir / "contracts", fname, content)
            written_files.append(f"contracts/{fname}")

    qmq_design = resp.get("qmqDesign", {})
    if qmq_design.get("exists"):
        write_artifact(artifacts_dir, "qmq-message-design.md", qmq_design.get("content", ""))
        written_files.append("qmq-message-design.md")

    ddl_change = resp.get("ddlChange", {})
    if ddl_change.get("exists"):
        if ddl_change.get("markdown"):
            write_artifact(artifacts_dir, "ddl-change.md", ddl_change["markdown"])
            written_files.append("ddl-change.md")
        if ddl_change.get("sqlContent"):
            write_artifact(artifacts_dir, "ddl-change.sql", ddl_change["sqlContent"])
            written_files.append("ddl-change.sql")

    manifest = resp.get("manifest", {})
    manifest_path = base_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = {
        "requirementId": requirement_id,
        "outputDir": str(base_dir),
        "writtenFiles": written_files,
        "manifest": manifest
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Pull SpecHub artifacts to local directory")
    parser.add_argument("--inbox", metavar="GIT_REMOTE_URL", help="List inbox items for given git remote URL")
    parser.add_argument("requirement_id", nargs="?", type=int, help="Requirement ID to pull")
    parser.add_argument("git_remote_url", nargs="?", help="Git remote URL")
    parser.add_argument("repo_root", nargs="?", help="Repository root path")
    args = parser.parse_args()

    if args.inbox:
        pull_inbox(args.inbox)
    elif args.requirement_id and args.git_remote_url and args.repo_root:
        pull_bundle(args.requirement_id, args.git_remote_url, args.repo_root)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
