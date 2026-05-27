#!/usr/bin/env python3
"""
archive-report.py — 归档上报到 SpecHub 平台

用法:
  python3 archive-report.py <requirementId> <gitRemoteUrl> \
    --branch <branchName> --commit <commitHash> \
    --decisions <decisions_content_or_filepath> --operator <operator>

环境变量:
  SPECHUB_BASE_URL  SOA 服务地址（默认: http://spec-portal-service.ibu.ctripcorp.com）

退出码:
  0 = 成功
  1 = HTTP/网络错误
  2 = 业务错误
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


def resolve_decisions_content(decisions_arg: str) -> str:
    path = Path(decisions_arg)
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return decisions_arg


def main():
    parser = argparse.ArgumentParser(description="Archive and report to SpecHub platform")
    parser.add_argument("requirement_id", type=int, help="Requirement ID")
    parser.add_argument("git_remote_url", help="Git remote URL")
    parser.add_argument("--branch", required=True, help="Feature branch name")
    parser.add_argument("--commit", required=True, help="Commit hash")
    parser.add_argument("--decisions", required=True, help="Decisions markdown content or file path")
    parser.add_argument("--operator", required=True, help="Operator identifier")
    args = parser.parse_args()

    decisions_markdown = resolve_decisions_content(args.decisions)

    payload = {
        "requirementId": args.requirement_id,
        "gitRemoteUrl": args.git_remote_url,
        "archiveStatus": "COMPLETED",
        "branchName": args.branch,
        "commitHash": args.commit,
        "decisionsMarkdown": decisions_markdown,
        "operator": args.operator
    }

    resp = post_json("/api/handoff/archive", payload)

    rs = resp.get("responseStatus", {})
    if rs.get("ack") == "Failure":
        print(f"Response error: {rs.get('message', 'Unknown')}", file=sys.stderr)
        sys.exit(1)

    brs = resp.get("businessResponsesStatus", {})
    if brs.get("errorCode"):
        error_code = brs["errorCode"]
        error_msg = brs.get("errorMessage", "Unknown error")
        print(f"Business error [{error_code}]: {error_msg}", file=sys.stderr)
        sys.exit(2)

    result = {
        "archiveRecordId": resp.get("archiveRecordId"),
        "requirementProjectStatus": resp.get("requirementProjectStatus"),
        "requirementStatus": resp.get("requirementStatus")
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
