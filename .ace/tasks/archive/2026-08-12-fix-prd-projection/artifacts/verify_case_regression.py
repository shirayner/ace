from pathlib import Path

root = Path(r"D:\Users\r.shi\work-space\incubator-mess\requirement-agent-skill\ace")
output = root / ".ace/tasks/fix-prd-projection/artifacts/regression-output.md"

if not output.exists():
    print("regression_output_exists: FAIL")
    raise SystemExit(1)

text = output.read_text(encoding="utf-8")
checks = {
    "scale_remains_normal": "| 需求规模 | Normal |" in text and "| 需求规模 | Large |" not in text,
    "mermaid_flow_exists": "```mermaid" in text and "flowchart" in text,
    "thirty_day_filter_covered": "30天" in text or "30 天" in text,
    "order_type_filter_covered": all(term in text for term in ["机票", "酒店", "火车", "跟团游"]),
    "per_trip_entitlement_check_covered": "逐行程" in text and "四" in text and "权益" in text,
    "entry_display_condition_covered": "至少" in text and "可用权益" in text and "展示" in text,
    "aggregation_covered": "按权益类型聚合" in text,
    "get_jump_covered": "Get" in text and "跳转" in text,
}

for name, passed in checks.items():
    print(f"{name}: {'PASS' if passed else 'FAIL'}")

print(f"Case assertions: {sum(checks.values())}/{len(checks)}")
raise SystemExit(0 if all(checks.values()) else 1)
