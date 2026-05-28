#!/usr/bin/env python3
"""
archive-report.py — 归档上报到 SpecHub 平台

用法:
  python3 archive-report.py <requirementId> <gitRemoteUrl> \
    --branch <branchName> --commit <commitHash> \
    --decisions <decisions_content_or_filepath>

环境变量:
  SPECHUB_BASE_URL  SOA 服务地址（默认: http://webapi.soa.fws.qa.nt.ctripcorp.com/api/37639）

退出码:
  0 = 成功
  1 = HTTP/网络错误
  2 = 业务错误
"""

import argparse
import io
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Force UTF-8 on stdout/stderr to prevent garbled Chinese on Windows (default codepage is GBK)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


BASE_URL = os.environ.get(
    "SPECHUB_BASE_URL",
    "http://webapi.soa.fws.qa.nt.ctripcorp.com/api/37639"
)


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


def resolve_decisions_content(decisions_arg: str) -> str:
    """Resolve decisions: if it's a file path, read it; otherwise use as-is."""
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
    parser.add_argument("--decisions", required=True,
                        help="Decisions markdown content or file path")

    args = parser.parse_args()

    # Resolve decisions content
    decisions_markdown = resolve_decisions_content(args.decisions)

    # Build request (field names match SOA contract)
    payload = {
        "requirementId": str(args.requirement_id),
        "gitRemoteUrl": args.git_remote_url,
        "status": "COMPLETED",
        "branchName": args.branch,
        "commitHash": args.commit,
        "decisions": decisions_markdown
    }

    # Call archive endpoint
    resp = post_json("/json/archiveHandoff", payload)

    # Check response status (uppercase field names from SOA gateway)
    rs = resp.get("ResponseStatus", resp.get("responseStatus", {}))
    if rs.get("Ack", rs.get("ack")) == "Failure":
        msg = rs.get("Message", rs.get("message", "Unknown"))
        print(f"Response error: {msg}", file=sys.stderr)
        sys.exit(1)

    # Check business status
    brs = resp.get("businessResponsesStatus", {})
    status_code = brs.get("statusCode", "")
    if status_code and status_code != "OK":
        error_msg = brs.get("errorMessage", "Unknown error")
        print(f"Business error [{status_code}]: {error_msg}", file=sys.stderr)
        sys.exit(2)

    # Output success result
    result = {
        "archiveRecordId": resp.get("archiveRecordId"),
        "workspaceProjectId": resp.get("workspaceProjectId"),
        "requirementProjectStatus": resp.get("requirementProjectStatus"),
        "requirementStatus": resp.get("requirementStatus")
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
