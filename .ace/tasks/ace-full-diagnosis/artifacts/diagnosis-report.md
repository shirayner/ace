# ACE 全面诊断报告

> 生成日期：2026-06-15
> 目标：识别 ACE 当前能力缺口，确定扩展方向，为 Roadmap 提供决策输入

---

## Executive Summary

ACE v1.0 已在**开发 + 测试**阶段达到生产级水准（85% 覆盖度），但距离"软件交付全生命周期 + 团队级 AI 工程化"的愿景，存在系统性缺口。

**核心发现**：
1. ACE 的真正护城河是**认知协议层**（对齐/验证/经验积累），而非具体 skill——这个优势可以复用到所有新方向
2. 当前呈现"开发深井"现象：编码阶段极深，前后阶段断崖
3. 最高 ROI 的扩展不是"加更多 skill"，而是打通**跨阶段闭环**（需求变更 → 影响分析 → 自动补测）
4. 架构瓶颈的第一解是 **MCP Server 化**，兼顾执行能力和多 Host 接入

**战略定位**：

> ACE 不是 AI 编码工具，是 **AI 工程协议**。它不比谁写得快，它保证写得对。

---

## 一、能力覆盖现状

### SDLC 全景覆盖度

```
需求  ████░░░░░░  40%   requirement-analysis, alignment protocol
设计  ████▌░░░░░  45%   spec-coding Phase 2-3, init
开发  ████████▌░  85%   spec-coding, auto-goal, 6 playbooks  ← 核心优势
测试  ████▌░░░░░  45%   ut, verify, code-review
部署  █░░░░░░░░░  10%   (几乎空白)
运维  ▌░░░░░░░░░   5%   (空白)
运营  █▌░░░░░░░░  15%   report skill
```

### 各阶段缺口详表

#### 需求阶段（40% → 目标 70%）

| 缺口 | 价值 | 建议 Skill |
|------|------|-----------|
| 无法从外部系统拉取需求 | 避免手动复制 | `requirement-intake`（对接 Jira/飞书/TAPD） |
| 无需求变更影响分析 | 评估变更代价 | `impact-analysis`（需求→代码依赖图） |
| 无工作量估算 | 排期辅助 | 可嵌入 requirement-analysis |
| 无验收标准自动生成 | 对齐交付标准 | 扩展 spec-coding G1 |

#### 设计阶段（45% → 目标 75%）

| 缺口 | 价值 | 建议 Skill |
|------|------|-----------|
| 无可视化设计输出 | 沟通效率 | `design-doc`（Mermaid 类图/序列图/架构图） |
| 无 API 设计专项 | 接口一致性 | `api-design`（OpenAPI spec + 兼容性 diff） |
| 无数据库设计 | 避免建模错误 | `schema-design`（DDL + 迁移 + 索引建议） |
| 无架构决策记录 | 知识沉淀 | ADR 生成嵌入 design-doc |

#### 开发阶段（85% → 目标 95%）

| 缺口 | 价值 | 建议 Skill |
|------|------|-----------|
| 无重构专项 | 代码质量治理 | `refactor`（坏味道→重构手法→验证） |
| 无依赖管理 | 安全合规 | `dependency-audit`（CVE/过期/冲突） |
| Playbook 仅内部中间件 | 通用性 | 扩展通用 Playbook（Kafka/Redis/gRPC） |
| 无调试辅助 | 效率（占 30-50% 时间） | `debug-assistant`（结构化调试流程） |

#### 测试阶段（45% → 目标 75%）

| 缺口 | 价值 | 建议 Skill |
|------|------|-----------|
| 无集成测试 | 补全测试金字塔 | `integration-test`（多模块联调 + mock 策略） |
| 无测试数据构造 | 边界覆盖 | `test-data-gen`（等价类 + 边界值 + fixture） |
| 无覆盖率分析 | 精准补测 | `coverage-advisor`（分析 + 建议 + 生成） |
| 无性能测试 | 性能保障 | `perf-test`（k6/Gatling 脚本生成） |

#### 部署阶段（10% → 目标 50%）

| 缺口 | 价值 | 建议 Skill |
|------|------|-----------|
| 无 CI/CD 生成 | DevOps 基础 | `deploy-gen`（Jenkinsfile/GH Actions/GitLab CI） |
| 无容器化配置 | 标准化部署 | 嵌入 deploy-gen（Dockerfile + K8s manifest） |
| 无发布检查清单 | 防止遗漏 | `release-checklist`（配置差异/环境变量/breaking change） |

#### 运维阶段（5% → 目标 35%）

| 缺口 | 价值 | 建议 Skill |
|------|------|-----------|
| 无日志分析 | 根因定位 | `log-analyzer`（模式识别 + 根因推理） |
| 无监控配置生成 | 可观测性 | `observability-gen`（Prometheus/Grafana） |
| 无故障排查 | 恢复速度 | `incident-assistant`（排查树 + 操作建议） |

#### 运营阶段（15% → 目标 40%）

| 缺口 | 价值 | 建议 Skill |
|------|------|-----------|
| 无技术债看板 | 持续治理 | `tech-debt-radar`（识别 + 量化 + 路线图） |
| 无代码健康度 | 趋势监控 | `codebase-health`（定期扫描报告） |

---

## 二、跨阶段高价值能力

### 开发者日常工作流

| 能力 | 现状 | 建议 | 优先级 |
|------|------|------|--------|
| 调试 | 无 | `debug-assistant` | P0 |
| 文档同步 | llm-wiki 仅生成 | `doc-sync`（代码变更→文档更新） | P1 |
| 环境管理 | 无 | `env-setup`（一键初始化） | P2 |
| 性能分析 | 无 | `perf-advisor`（N+1/锁竞争/GC 分析） | P2 |

### 团队协作

| 能力 | 现状 | 建议 | 优先级 |
|------|------|------|--------|
| Onboarding | init 画像 | `onboarding-guide`（渐进式上手） | P1 |
| 代码导览 | 无 | `code-walkthrough`（入口→核心流程→设计决策） | P1 |
| 知识图谱 | 无 | `knowledge-map`（谁懂什么模块） | P2 |
| 规范执行 | rules（静态） | `convention-enforcer`（实时架构级检查） | P2 |

### AI 工程化（元能力）

| 能力 | 现状 | 建议 | 优先级 |
|------|------|------|--------|
| Skill 效果评估 | 无 | `skill-benchmark`（AB 对比 + 质量度量） | P2 |
| Token 优化 | context-discipline 协议 | `context-optimizer`（自动检测膨胀） | P2 |
| 记忆管理 | experience 协议 | `memory-consolidator`（定期合并/清理） | P3 |

---

## 三、竞品对标：ACE 的独特象限

### 竞争格局

```
                    自主性高
                      |
              Devin * |
                      |
                      |     * Copilot Workspace
                      |
         Bolt/v0 *    |
                      |         * ACE
                      |     * Windsurf
              * aider | * Cursor
                      |
         Claude Code *|
                      |
                    自主性低
     ─────────────────┼──────────────────
     质量保障弱                质量保障强
```

ACE 独占 **"中等自主 + 最强质量保障"** 象限——目前无竞品覆盖。

### 差异化优势（护城河）

| 层次 | ACE 独有 | 竞品状态 |
|------|---------|---------|
| 认知对齐 | G1-G4 硬门禁 | 竞品全部可选/可跳过 |
| 验证闭环 | verify 先验证再声称 | 竞品依赖人工 |
| 经验积累 | experience.md 结构化 | 竞品最多有 .cursorrules |
| 企业内嵌 | 中间件 Playbook | 竞品全部通用型 |
| 断点恢复 | state.json + context.md | 竞品会话断则丢 |

### 应强化的

- 认知协议的**可配置性**（轻量/标准/严格三档）
- 企业 Playbook 市场化（让更多团队贡献）
- experience 智能化（从"记录"到"预测"）

### 应放弃的

- 前端/原型场景（交给 Bolt/v0/Cursor）
- 全自主执行（"人在回路"是灵魂）
- 多 LLM 兼容（短期内不值得，深耕 Claude）
- IDE 集成（ACE 的力量在协议层）

---

## 四、架构演进路径

### 当前架构本质

**"Prompt Engineering as a Framework"** — 纯 Markdown 定义 + Claude Code Runtime。

优势：零基础设施、极低维护。
限制：无执行能力、绑定单一 Provider、本地隔离。

### 三阶段演进

```
Phase 1 (3-6月)          Phase 2 (6-12月)         Phase 3 (12-18月)
━━━━━━━━━━━━━━━━        ━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━
MCP Server 化            ACE Daemon               ACE Platform
├─ 可执行 Skill          ├─ Team Server           ├─ Web UI (可选)
├─ 多 Host 接入          ├─ CRDT 同步             ├─ DevOps Integration
└─ Skill 间通信          └─ Event Bus             └─ Plugin Marketplace
                                                    
Git-based 知识同步        Multi-host Adapter       社区 Skill 生态
├─ ace sync 命令          ├─ Cursor adapter        ├─ 评分/认证
├─ Team Rules 分发        ├─ Continue adapter      ├─ Bounty Board
└─ Experience 共享        └─ Local LLM adapter     └─ 知识网络

Skill IR 定义             可执行 Hybrid Skill      
├─ YAML frontmatter       ├─ Code Phase            
├─ Provider-agnostic      ├─ LLM Phase             
└─ 向后兼容               └─ Composition           
```

### 核心架构决策：双轨策略

```
┌─────────────────────────────────────────────────────┐
│                  ACE Core (Provider-Agnostic)         │
│  Skill IR | Knowledge Graph | State Machine | MCP    │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────────┐
         ▼                               ▼
┌──────────────────┐          ┌──────────────────────┐
│ Claude Code Track│          │   Universal Track    │
│ (深耕，零配置)    │          │ (MCP Server, 多 Host)│
└──────────────────┘          └──────────────────────┘
```

Claude Code plugin 模式作为 **"zero-config fast path"** 永久保留。

---

## 五、生态建设蓝图

### Skill Marketplace

| 机制 | 设计 |
|------|------|
| 分发模型 | Git-Native Registry（Homebrew tap 模式） |
| 安装方式 | `ace registry add <source>` + `ace install <skill>` |
| 质量分层 | Community → Verified → Curated（三级认证） |
| 兼容性 | manifest.yaml 声明 ace-core 版本 + protocol 依赖 |

### Team Pack

| 机制 | 设计 |
|------|------|
| 组成 | skills/ + rules/ + playbooks/ + experience/ + onboarding/ |
| 分发 | `ace team join <pack-name>` 一条命令配齐 |
| 更新 | `ace team sync` 增量同步 |
| 优先级 | team > user > default |

### 知识网络

```
Layer 3: Community Knowledge（众包，全球）
Layer 2: Team Knowledge（审核，内部）
Layer 1: Personal Knowledge（自动，本地）

上浮路径：ace knowledge promote --to team/community
```

### 贡献者激励

- 积分体系（发布/认证/修 bug/写教程）
- 等级解锁（Reviewer → Maintainer → Core）
- Bounty Board（悬赏未满足的 skill 需求）

---

## 六、优先级总排序

### P0 — 立即做（1-3 月内）

| # | 方向 | 具体行动 | 理由 |
|---|------|---------|------|
| 1 | `debug-assistant` | 新 Skill | 日常高频，30-50% 时间花在调试 |
| 2 | `refactor` | 新 Skill | 代码质量核心动作，与 code-review 闭环 |
| 3 | `integration-test` | 新 Skill | ut 自然延伸，补全测试金字塔 |
| 4 | 认知协议分档 | 改进现有 | 简单任务轻量/复杂任务严格，降低摩擦 |
| 5 | Skill IR 规范 | 架构基础 | manifest.yaml + frontmatter，为生态打基础 |

### P1 — 尽快做（3-6 月内）

| # | 方向 | 具体行动 | 理由 |
|---|------|---------|------|
| 6 | `design-doc` | 新 Skill | 设计产物标准化 |
| 7 | `coverage-advisor` | 新 Skill | ut 从"能生成"到"生成对的" |
| 8 | `deploy-gen` | 新 Skill | 补齐部署短板 |
| 9 | `doc-sync` | 新 Skill | 解决文档腐化 |
| 10 | MCP Server 原型 | 架构演进 | 获得执行能力 + 多 Host |
| 11 | `ace sync` 命令 | 团队功能 | Git-based 知识同步 |
| 12 | `onboarding-guide` | 新 Skill | 团队价值闭环 |

### P2 — 规划中（6-12 月内）

| # | 方向 | 具体行动 | 理由 |
|---|------|---------|------|
| 13 | Team Pack 机制 | 团队分发 | 企业级采用的关键 |
| 14 | `tech-debt-radar` | 新 Skill | 长期治理 |
| 15 | `observability-gen` | 新 Skill | 运维入门 |
| 16 | Skill Marketplace | 生态建设 | 社区飞轮启动 |
| 17 | `dependency-audit` | 新 Skill | 安全合规 |
| 18 | 通用 Playbook 扩展 | 内容扩充 | Kafka/Redis/gRPC |

### P3 — 远期探索（12+ 月）

| # | 方向 | 具体行动 | 理由 |
|---|------|---------|------|
| 19 | Multi-host adapter | 架构演进 | Cursor/Continue 兼容 |
| 20 | Web UI | 可视化 | 按需，非必须 |
| 21 | DevOps Integration | 事件驱动 | 需要独立进程 |
| 22 | 知识图谱 | 智能检索 | 依赖数据量积累 |
| 23 | `incident-assistant` | 新 Skill | 依赖运维数据接入 |

---

## 七、战略建议总结

### ACE 的三层价值金字塔

```
           /\
          /  \     Layer 3: 生态平台
         / P3 \    (Marketplace + Team + Community)
        /──────\
       /        \  Layer 2: 全生命周期 Skills
      /   P1-P2  \ (需求→设计→开发→测试→部署→运维)
     /────────────\
    /              \ Layer 1: 认知协议层（护城河）
   /      P0       \ (alignment + verification + experience)
  /──────────────────\
```

- **Layer 1 是根基**：持续精进，不可被上层功能稀释
- **Layer 2 是增长**：逐阶段补全 SDLC 覆盖度
- **Layer 3 是飞轮**：靠 Layer 2 的丰富度才能启动

### 一句话 Roadmap

> **先在 Layer 1 上做分档降低摩擦，再向 Layer 2 横向扩展高 ROI 阶段（测试→设计→部署），最后通过 MCP Server 化解锁 Layer 3 的生态可能性。**

### 关键成功指标（KPI）

| 阶段 | 指标 | 目标值 |
|------|------|--------|
| 3 月后 | 新增 P0 Skill 上线 | ≥3 个 |
| 6 月后 | SDLC 平均覆盖度 | 从 35% → 55% |
| 6 月后 | MCP Server 原型运行 | 可执行 ≥2 个 Skill |
| 12 月后 | 团队采用 | ≥1 个团队全量使用 |
| 12 月后 | 第三方 Skill | ≥5 个来自非作者 |

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Claude Code 原生吸收 ACE 设计 | 中 | 高 | 保持协议层领先 + 企业定制化是护城河 |
| 架构演进分散精力 | 高 | 中 | 严格 Phase 边界，P0 不完不做 P1 |
| Playbook 过于 Trip.com 特化 | 低 | 中 | 分层：core playbook (通用) + enterprise (定制) |
| 社区生态冷启动困难 | 高 | 中 | 先 Team Pack 做内部飞轮，再外溢到社区 |
| 简单任务流程过重导致用户流失 | 高 | 高 | P0 优先做协议分档（轻量模式 0 门禁） |

---

*报告结束。本报告可直接用于 ACE v2.0 Roadmap 规划讨论。*
