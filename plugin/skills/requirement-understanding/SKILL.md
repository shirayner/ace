---
name: requirement-understanding
description: Requirement Understanding V1 已弃用，仅用于识别旧格式入口。命中时不执行历史 frontier、Ask/Assume、假设清单或范围三态流程，只返回 LegacyRequirementInput，交由调用方决定后续处理。
---

# Requirement Understanding V1（已弃用）

本目录保留历史 references 供追溯，不再是一条可执行的需求理解流程。

## 唯一允许的输出

```ts
interface LegacyRequirementInput {
  output_type: "legacy_requirement_input";
  detected_artifacts: string[];
  reason: "deprecated_contract";
}
```

## 禁止行为

- 不执行 V1 的 frontier、Ask/Assume 双通道或四样产出；
- 不生成新的“已定决策 / 假设清单 / 术语表 / 范围三态”；
- 不把历史清单转换为其他模型；
- 不加载本目录 references 作为当前运行规则；
- 不选择、调用或编排其他 Skill；
- 不决定调用方收到 `LegacyRequirementInput` 后的下一步。
