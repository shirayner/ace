from pathlib import Path

root = Path(r"D:\Users\r.shi\work-space\incubator-mess\requirement-agent-skill\ace")
skill = (root / "plugin/skills/requirement-writing/SKILL.md").read_text(encoding="utf-8")
rules = (root / "plugin/skills/requirement-writing/projection-rules.md").read_text(encoding="utf-8")
chapters = (root / "plugin/skills/requirement-writing/chapter-tree.md").read_text(encoding="utf-8")
core = (root / "plugin/skills/requirement-writing/templates/core.md").read_text(encoding="utf-8")
combined = skill + rules + chapters + core

checks = {
    "scale_is_upstream_projection": all(
        term in combined for term in ["上游权威结论", "原样投影", "禁止重新推断"]
    ),
    "requirement_scale_excludes_large": "| 需求规模 | Micro / Normal / Large |" not in core,
    "execution_mode_separated_from_scale": "投影执行模式" in skill and "需求规模" in skill,
    "structured_flow_rule_exists": all(
        term in rules for term in ["结构化业务流程", "过滤", "跨角色 / 系统交接", "Mermaid"]
    ),
    "diagram_rule_is_checked": "流程图语义一致性" in rules,
    "template_requires_structured_diagram": "结构化流程必填" in core,
}

for name, passed in checks.items():
    print(f"{name}: {'PASS' if passed else 'FAIL'}")

print(f"Projection assertions: {sum(checks.values())}/{len(checks)}")
raise SystemExit(0 if all(checks.values()) else 1)
