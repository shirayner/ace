from pathlib import Path

root = Path(r"D:\Users\r.shi\work-space\incubator-mess\requirement-agent-skill\ace")
flow = (root / "plugin/skills/requirement-understanding/references/flow.md").read_text(encoding="utf-8")
core = (root / "plugin/skills/requirement-writing/templates/core.md").read_text(encoding="utf-8")
combined = flow + core

checks = {
    "flow_delivery_type": "**研发交付类型**" in flow,
    "core_delivery_type": "| 研发交付类型 |" in core,
    "old_product_type_removed": "产品类型" not in combined,
    "domain_basis": all(term in flow for term in ["核心目标", "主要业务规则", "成功指标"]),
    "domain_examples": all(term in combined for term in ["会员", "活动", "支付", "旅游", "酒店"]),
    "delivery_classes": all(
        term in combined
        for term in ["Web 前端", "客户端", "服务端", "数据", "AI/算法", "其他专项"]
    ),
    "multiple_types_do_not_force_split": (
        "涉及多个研发交付类型" in flow and "本身都不是拆分理由" in flow
    ),
    "readiness_uses_new_dimensions": "主/关联业务域、主/次研发交付类型" in flow,
}

for name, passed in checks.items():
    print(f"{name}: {'PASS' if passed else 'FAIL'}")

print(f"Profile assertions: {sum(checks.values())}/{len(checks)}")
raise SystemExit(0 if all(checks.values()) else 1)
