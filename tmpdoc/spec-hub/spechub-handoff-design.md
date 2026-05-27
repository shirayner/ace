# SpecHub Handoff Skill — ACE 技术设计方案

> 产出日期：2026-05-25（修订：2026-05-25 v2 — 集成 /ace:init 画像能力）
> 基于：SpecHub 产物接力编码 Skill 飞书设计文档 + 平台侧契约接口设计文档
> 定位：ACE Claude Code plugin 原生 skill，面向本地开发场景

---

## 1. 设计目标

SpecHub 平台产出需求文档（PRD）、架构设计、API 契约、proposal 等产物后，开发者需要在本地仓库基于这些产物完成编码。本 skill 的职责是：

1. **拉取 SpecHub 产物** → 本地 `spechub/{reqId}/` 目录
2. **深度理解** → 结合目标仓库代码分析改动范围和复用点
3. **需求/方案澄清** → 发现产物与代码现状的冲突、遗漏，与用户对齐
4. **任务规划** → 生成拓扑有序的实施任务列表
5. **逐任务实施** → 按 playbook 规范编写代码
6. **交付自检** → 对照 proposal 验证完整性
7. **归档上报** → 创建分支、push、上报 SpecHub 完成状态

### 核心坐标

**需求坐标仅需 `requirementId`**。服务端通过 Skill 传入的 `gitRemoteUrl` 自动归一化匹配 workspace project，无需客户端传 `projectId`。

### 非目标

- 不替代 SpecHub 平台侧的 Agent（QMQ Agent / DB Agent 等平台侧能力由独立方案实施）
- 不做独立 CLI 工具，所有能力封装在 skill 内
- 不自动 push 到 main/master（仅创建 feature 分支）

---

## 2. 三大核心模块

```
┌────────────────────────────────────────────────────────────────┐
│  spechub-handoff skill                                         │
│                                                                │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Workflow    │  │  Scripts         │  │  Knowledge Base  │  │
│  │  (SKILL.md) │  │  (scripts/)      │  │  (references/)   │  │
│  │             │  │                  │  │                  │  │
│  │ 7阶段状态机 │  │ pull-bundle.py   │  │ playbooks/       │  │
│  │ 对齐协议    │  │ archive-report.py│  │ schemas/         │  │
│  │ 卡点/恢复   │  │                  │  │                  │  │
│  │ 子任务派发  │  │                  │  │                  │  │
│  └─────────────┘  └──────────────────┘  └──────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                         │
                         ▼ SOA (HTTP/JSON)
┌────────────────────────────────────────────────────────────────┐
│  spec-portal-service (SpecHubHandoffEntity)                    │
│  getHandoffBundle(requirementId, gitRemoteUrl)                 │
│  getHandoffInbox(gitRemoteUrl)                                 │
│  archiveHandoff(requirementId, gitRemoteUrl, ...)              │
└────────────────────────────────────────────────────────────────┘
```

---

## 2.5 与 /ace:init 项目画像的集成

### 前置依赖

spechub-handoff **依赖** `.claude/project-profile.md`（由 `/ace:init` 生成）。进入 understand 阶段前检测：
- 存在 → 直接读取，跳过大部分"从零发现"工作
- 不存在 → 提示用户先运行 `/ace:init`，或自动触发 init 后再继续

### 画像提供的关键信息

| profile 章节 | spechub-handoff 中的使用方式 |
|---|---|
| **架构分层** | plan 阶段 repo-analysis 直接定位目标层/包路径，无需全局 glob |
| **中间件使用** | understand 阶段 infrastructureFootprint 基线来源；implement 阶段 playbook 引用"本项目用法摘要 + 关键类/配置"作为骨架基线 |
| **编码约定** | implement 子任务 prompt 注入项目约定；handoff-check 对照约定检查生成代码 |
| **构建与运行** | handoff-check 编译验证命令直接引用 |
| **依赖与上下游** | understand 阶段识别需求涉及的已有上下游，避免重复 grep |

### 核心收益

1. **token 消耗降低**：plan 阶段 repo-analysis 从"5 步全量扫描"缩减为"2 步增量定位"
2. **代码一致性提升**：playbook 骨架 + profile 项目特定模式 = 生成代码风格与现有代码一致
3. **减少发散**：profile 已是"经用户确认的项目事实"，implement 阶段减少子 Agent 自主推断

---

## 3. Skill 文件结构

```
plugin/skills/spechub-handoff/
├── SKILL.md                                 主流程定义（7 阶段状态机 + 调度逻辑）
│
├── scripts/                                 与 SpecHub 平台对接的脚本
│   ├── pull-bundle.py                       拉取产物（Python3 stdlib）
│   └── archive-report.py                    归档上报（Python3 stdlib）
│
└── references/                              知识库
    ├── schemas/                             数据结构与接口定义
    │   ├── state-schema.md                  state.json schema + 状态机转换规则
    │   └── api-contract.md                  SOA 接口契约（请求/响应/错误码）
    │
    └── playbooks/                           编码规范与决策树
        ├── repo-analysis.md                 现有代码分析标准动作
        ├── contract-jar.md                  契约 JAR 校验 / 暂停 / 恢复协议
        ├── dal.md                           DAL 编码决策树 + 骨架
        ├── soa.md                           SOA Mapper/Service 编码决策树 + 骨架
        ├── qmq.md                           QMQ 生产者/消费者编码决策树 + 骨架
        ├── qconfig.md                       QConfig 读写/监听决策树 + 骨架
        ├── qschedule.md                     QSchedule 任务注解决策树 + 骨架
        └── credis.md                        CRedis 接入/键规范决策树 + 骨架
```

---

## 4. 本地产物目录结构

拉取产物后在目标仓库内的目录布局，按职责分文件夹组织：

```
{repoRoot}/spechub/{reqId}/
│
├── state.json                               skill 状态机文件
├── manifest.json                            需求元信息快照
│
├── artifacts/                               SpecHub 平台产物（只读，clone 阶段写入）
│   ├── prd.md                               需求文档
│   ├── architecture.md                      架构设计
│   ├── proposal.md                          仓库提案
│   ├── contracts/                           API 契约
│   │   └── {filename}.md                    每份契约独立文件
│   ├── qmq-message-design.md               (可选) QMQ 消息设计
│   ├── ddl-change.md                        (可选) DDL 变更说明
│   └── ddl-change.sql                       (可选) DDL SQL
│
├── analysis/                                skill 分析产出（understand + plan 阶段写入）
│   ├── comprehension.md                     理解摘要 + infrastructureFootprint
│   ├── repo-analysis.md                     现有代码分析结果
│   ├── tasks.md                             拓扑有序的任务列表
│   └── release-checklist.md                 上线 checklist
│
└── delivery/                                交付阶段产出（handoff-check + archive 阶段写入）
    ├── handoff-check.md                     交付自检报告
    └── decisions.md                         决策纪要（LLM 聚合润色）
```

**设计理由**：
- `artifacts/`：SpecHub 平台产物的本地镜像，clone 阶段一次性写入后只读
- `analysis/`：skill 分析与规划的中间产物，plan 阶段可能多次更新
- `delivery/`：交付验证与归档产出，最后阶段才生成

**多需求并存**：
- `spechub/.active`：内容为当前活跃的 reqId 字符串
- 每个 reqId 独立目录，互不干扰

---

## 5. 工作流（7 阶段状态机）

### 5.0 设计原则

- **默认全自动**：7 阶段顺序执行，仅硬性卡点暂停
- **需求坐标仅需 requirementId**：projectId 由服务端通过 gitRemoteUrl 自动匹配
- **对齐门禁**：understand 阶段末尾执行简化版对齐（展示理解 + 确认方向）
- **状态可恢复**：每阶段完成写入 state.json，中断后可从任意阶段恢复
- **playbook 按需注入**：子任务 prompt 只注入命中的 playbook 场景章节

### 5.1 select — 需求选择

**触发**：用户未提供 `requirementId` 时进入

**动作**：
1. 从当前仓库 `git remote -v` 获取 remote URL
2. 调 `getHandoffInbox(gitRemoteUrl)` 列出关联的已就绪需求
3. AskUserQuestion 让用户选择

**输出**：确定的 `requirementId`

**卡点**：`NO_WORKSPACE_FOR_GIT_REMOTE` → 提示用户先在 SpecHub 创建工作空间项目

---

### 5.2 clone — 拉取产物

**动作**：
1. `Bash: python3 scripts/pull-bundle.py <reqId> <gitRemoteUrl> <repoRoot>`
2. 脚本调用 `getHandoffBundle(requirementId, gitRemoteUrl)`
3. 按响应字段拆文件到 `spechub/{reqId}/artifacts/`
4. 写 `manifest.json`（从响应 `manifest` 字段提取）+ 初始 `state.json`

**卡点**：
- `REQUIREMENT_NOT_FOUND` → `clone_failed`
- `NO_PROJECT_MATCH` → `clone_failed`，提示检查 git remote 与 SpecHub 配置
- `ARTIFACTS_INCOMPLETE` → `clone_failed`，列出缺失产物
- HTTP 错误 → `clone_failed`

---

### 5.3 understand — 理解产物 + 对齐

**这是 skill 与用户唯一的强制对齐点。**

**前置检查**：
- Read `.claude/project-profile.md`（若不存在 → 提示先运行 `/ace:init` 或自动触发）
- 提取 profile 中"中间件使用"表作为 **已有中间件基线**

**动作**：
1. Agent 读取 `artifacts/` 全部产物，**对照 profile 差分**生成 `analysis/comprehension.md`：
   - 业务目标一句话
   - 改动范围（涉及模块，引用 profile 架构分层定位目标层）
   - 关键非功能需求
   - 风险点
   - `infrastructureFootprint`（yaml 格式）：
     - `existing`：profile 中已有的中间件（自动填充，无需推断）
     - `newlyRequired`：本需求新引入的中间件（从产物推断）
     - 合并为最终 footprint（existing ∪ newlyRequired 中与本需求相关的子集）

2. **对齐确认**：向用户展示理解摘要 + infrastructureFootprint（区分"已有"与"新增"），通过 AskUserQuestion 确认
   - 用户可修改 infrastructureFootprint
   - 用户可补充产物未覆盖的上下文

**输出**：`spechub/{reqId}/analysis/comprehension.md`

**卡点**：无（对齐是流程门禁不是卡点）

---

### 5.4 plan — 代码分析 + 任务生成

分 5 个子动作（全部自动顺序执行）：

| # | 子动作 | 做什么 |
|---|--------|--------|
| 5.4.1 | **repo-analysis（增量版）** | 基于 profile 架构分层直接定位目标层，仅做 2 步增量：① grep 同领域类定位复用点；② 检查命名冲突。**不再**重复分析包结构/中间件/编码约定（已由 profile 覆盖） |
| 5.4.2 | **contract-jar 校验** | 从 `artifacts/contracts/` 提取 Maven 坐标 → `mvn dependency:get` 校验版本已发布 |
| 5.4.3 | **hard-conflict 检测** | 产物提议的命名与现有冲突且语义不同 |
| 5.4.4 | **release-checklist** | 根据 infrastructureFootprint 生成上线 checklist |
| 5.4.5 | **tasks 生成** | 按拓扑顺序生成 `tasks.md`（DDL → DAO → 契约/SOA → QMQ → QConfig → QSchedule → CRedis → Service 编排） |

**profile 加速策略**：
- 5.4.1 从 profile"架构分层"表直接获取 `包路径`，定位 grep 范围（如：`com.xxx.service` → 只在此包下搜索同领域 Service）
- 5.4.5 从 profile"中间件使用"表获取现有基类/工具类位置，tasks 中直接引用（如："继承 `AbstractBaseDao`，位于 `com.xxx.dao.base`"）

**输出**：
- `spechub/{reqId}/analysis/repo-analysis.md`
- `spechub/{reqId}/analysis/tasks.md`
- `spechub/{reqId}/analysis/release-checklist.md`

**卡点**：
- `contract_jar_pending`（Maven 坐标未发布）
- `hard_conflict`（命名冲突）

---

### 5.5 implement — 逐任务实施

**动作**：
1. 按 `analysis/tasks.md` 顺序遍历每个未完成任务
2. 每个任务派发子 Agent，prompt 包含：
   - 任务描述 + `artifacts/proposal.md` 相关段落
   - **对应 playbook 命中场景章节**（由 task 注释 `<!-- playbook: xxx.md#section -->` 决定）
   - **profile 项目特定上下文**（从 `.claude/project-profile.md` 精准提取）：
     - 该中间件的"本项目用法摘要 + 关键类/配置"
     - 编码约定中与当前任务相关的规则（命名、异常处理、日志模式）
   - `analysis/comprehension.md` + `analysis/repo-analysis.md` 相关段落
3. 子 Agent 完成后标记 `[x]` 并更新 state.json

**profile 注入策略**：
```
playbook 通用骨架（how to do X in general）
        +
profile 项目特定模式（how X is done in THIS repo）
        =
子 Agent prompt（生成代码与现有代码风格一致）
```

示例：任务"新增 DAO 类"的子 Agent prompt 注入：
- playbook `dal.md#加新表` → 通用骨架（DDL → Entity → DAO 继承 AbstractBaseDao）
- profile 中间件使用表 DAL 行 → "AbstractBaseDao 位于 com.xxx.dao.base，命名规则 XxxDao"
- profile 编码约定 → "异常由 Service 包装为 BusinessException，DAO 层只抛 DalException"

**卡点**：`subagent_blocked`（子 Agent 报错 / 声明 cannot_decide）

---

### 5.6 handoff-check — 交付自检

**动作**：
1. `git diff <baseCommit>..HEAD --stat` 对照 proposal "涉及文件" 清单
2. 对 `analysis/release-checklist.md` 做对账
3. **编码约定对照**：读取 profile"编码约定"章节，检查生成代码是否符合：
   - 命名风格（类名/方法名/变量名是否遵循项目约定）
   - 异常处理模式（是否使用项目标准异常类）
   - 日志模式（是否使用项目标准日志框架和格式）
4. 输出 `delivery/handoff-check.md`：
   - 已实现 vs proposal 对照
   - 未在 proposal 的额外改动
   - proposal 提到但未实现的部分
   - release-checklist 对账（已完成 / 待用户操作）
   - **编码约定偏离项**（对照 profile 发现的不一致）
   - 软提示（中文字符串、方法 >30 行、缺测试等）

**输出**：`spechub/{reqId}/delivery/handoff-check.md` + 终端摘要

**卡点**：无（软提示不阻塞）

---

### 5.7 archive — 归档上报

5 个子动作一气呵成：

| # | 子动作 | 做什么 | 卡点 |
|---|--------|--------|------|
| 5.7.1 | 健康检查 | git fetch、校验无漂移 | `archive_blocked` |
| 5.7.2 | 创建分支 | `feature/spechub-{reqId}-<slug>` | — |
| 5.7.3 | 聚合 commit | squash commit（src/ + spechub/ + resources/） | — |
| 5.7.4 | 生成 decisions.md | LLM 聚合决策信息到 `delivery/decisions.md`，固定 5 章节 | — |
| 5.7.5 | push + 上报 | `git push -u` + 调 `archiveHandoff(reqId, gitRemoteUrl, ...)` | `archive_push_failed` / `archive_report_failed` |

**输出**：远端 feature 分支 + `delivery/decisions.md` + SpecHub 状态推进

---

## 6. 状态管理

### 6.1 state.json 核心字段

```json
{
  "requirementId": 12345,
  "gitRemoteUrl": "git@github.com:trip/spec-portal-service.git",
  "workspaceProjectId": 67890,
  "currentPhase": "implement",
  "phaseStatus": "in_progress",
  "pauseReason": null,
  "infrastructureFootprint": {
    "soa": true, "dal": true, "qmq": false,
    "qconfig": true, "qschedule": false, "credis": true
  },
  "phases": {
    "select": { "status": "done" },
    "clone": { "status": "done" },
    "understand": { "status": "done" },
    "plan": { "status": "done" },
    "implement": { "status": "in_progress", "completedTasks": 3, "totalTasks": 7 },
    "handoff-check": { "status": "pending" },
    "archive": { "status": "pending" }
  },
  "contractJar": {
    "coordinate": "com.ctrip.xxx:xxx-api:1.2.0",
    "verified": true
  },
  "archive": {
    "branchName": null,
    "commitHash": null,
    "pushed": false,
    "reported": false
  },
  "pauseHistory": []
}
```

**说明**：
- `workspaceProjectId`：由 `getHandoffBundle` 响应的 `manifest.workspaceProjectId` 回填，Skill 端缓存用于排查
- 不再有 `projectId` 入参——服务端通过 `(requirementId, gitRemoteUrl)` 唯一定位

### 6.2 恢复时的双重校验

恢复时 skill 不仅读 state.json，还校验中间产物文件存在性：
- `currentPhase=plan` 但 `analysis/comprehension.md` 不存在 → 回退到 understand
- `currentPhase=implement` 但 `analysis/tasks.md` 不存在 → 回退到 plan

---

## 7. Scripts 接口设计

### 7.1 pull-bundle.py

**职责**：调用 `getHandoffBundle` SOA 接口，拆文件落盘

**接口**：
```bash
python3 pull-bundle.py <requirementId> <gitRemoteUrl> <repoRoot>

# 环境变量
SPECHUB_BASE_URL  # SOA 服务地址（默认：spec-portal-service 内网域名）

# 退出码
0 = 成功
1 = HTTP/网络错误
2 = 响应解析失败
3 = 业务错误（REQUIREMENT_NOT_FOUND / NO_PROJECT_MATCH / ARTIFACTS_INCOMPLETE）
```

**依赖**：仅 Python3 stdlib（urllib.request / json / os / pathlib / argparse）

**行为**：
1. 构建 `GetHandoffBundleRequestType` JSON：`{ requirementId, gitRemoteUrl }`
2. POST 到 SOA endpoint
3. 检查 `responseStatus` + `businessResponsesStatus`
4. 必需产物（prd / architecture / contracts / proposal）从响应提取写入 `artifacts/`
5. 可选产物（qmqDesign / ddlChange）`exists: false` → 跳过落盘
6. 写 `manifest.json`（从 `manifest` 字段提取）+ 初始 `state.json`
7. stdout 输出 JSON 摘要（供 SKILL.md 读取）

**出错时**：stderr 输出具体错误码 + errorMessage，供 skill 转为对应卡点

### 7.2 archive-report.py

**职责**：调用 `archiveHandoff` SOA 接口上报归档

**接口**：
```bash
python3 archive-report.py <requirementId> <gitRemoteUrl> \
  --branch <branchName> \
  --commit <commitHash> \
  --decisions <decisions.md 文件路径> \
  --operator <operator>

# 环境变量
SPECHUB_BASE_URL

# 退出码
0 = 成功（stdout 输出 archiveRecordId + requirementStatus）
1 = HTTP/网络错误
2 = 业务错误（REQUIREMENT_NOT_FOUND / NO_PROJECT_MATCH / ARCHIVE_RECORD_PERSIST_FAILED / STATUS_TRANSITION_INVALID）
```

**行为**：
1. 读 decisions.md 文件内容
2. 构建 `ArchiveHandoffRequestType` JSON
3. POST 到 SOA endpoint
4. 检查响应，成功时输出 `{ archiveRecordId, requirementProjectStatus, requirementStatus }`

---

## 8. SOA 接口契约（完整定义）

以下契约来源于 SpecHub 平台侧契约接口设计文档，skill 端作为消费方。

### 8.1 共享类型

```bjsc
namespace java 'com.ctrip.ibu.spec.portal.soa.handoff'

enum HandoffArchiveStatusEnum {
    COMPLETED
}

class HandoffArtifactContent {
    string content;          // Markdown 全文
    long lastUpdatedAt;      // 毫秒时间戳
}

class HandoffOptionalArtifact {
    bool exists;             // false 时 Skill 跳过落盘
    string content;          // exists=false 时为空字符串
    long lastUpdatedAt;
}

class HandoffDdlChange {
    bool exists;
    string markdown;         // ddl-change.md
    string sqlContent;       // ddl-change.sql
    long lastUpdatedAt;
}

class HandoffContract {
    string filename;         // 落盘文件名
    string content;          // 文件全文
    string mavenCoordinate;  // groupId:artifactId:version（服务端正则提取，可为空）
    long lastUpdatedAt;
}

class HandoffManifest {
    long requirementId;
    long workspaceProjectId;     // 服务端解析后回吐
    string requirementTitle;     // 用于 archive 分支名 slug
    RequirementStatusEnum requirementStatus;
    list<string> gitRemoteUrls;  // 用于 Skill 二次校验
    long generatedAt;
}
```

### 8.2 getHandoffBundle — 拉取全套产物

**请求**：
```bjsc
class GetHandoffBundleRequestType {
    required long requirementId;
    required string gitRemoteUrl;  // 服务端归一化后匹配 workspace project
}
```

**响应**：
```bjsc
class GetHandoffBundleResponseType {
    ResponseStatusType responseStatus;
    BusinessResponseHeader businessResponsesStatus;
    HandoffManifest manifest;
    HandoffArtifactContent prd;           // 必需
    HandoffArtifactContent architecture;  // 必需
    list<HandoffContract> contracts;      // 必需（≥1）
    HandoffArtifactContent proposal;      // 必需
    HandoffOptionalArtifact qmqDesign;    // 可选
    HandoffDdlChange ddlChange;           // 可选
}
```

**错误码**：

| errorCode | 触发场景 | Skill 端处理 |
|-----------|----------|-------------|
| `REQUIREMENT_NOT_FOUND` | 需求不存在 | `clone_failed` |
| `NO_PROJECT_MATCH` | gitRemoteUrl 无匹配 project | `clone_failed` + 提示检查 git remote |
| `ARTIFACTS_INCOMPLETE` | 必需产物缺失 | `clone_failed` + 列出缺失项 |
| `INTERNAL_ERROR` | 兜底 | `clone_failed` + 透传 message |

### 8.3 getHandoffInbox — 列出可接力需求

**请求**：
```bjsc
class GetHandoffInboxRequestType {
    required string gitRemoteUrl;
    CommonHeader commonHeader;
}
```

**响应**：
```bjsc
class HandoffInboxItem {
    long workspaceId;
    string workspaceName;
    long requirementId;
    string requirementTitle;
    RequirementStatusEnum requirementStatus;
    long workspaceProjectId;
    string projectName;
    string gitRepoUrl;
    bool hasQmqDesign;
    bool hasDdlChange;
    long lastUpdatedAt;
}

class GetHandoffInboxResponseType {
    ResponseStatusType responseStatus;
    BusinessResponseHeader businessResponsesStatus;
    list<HandoffInboxItem> items;  // 按 lastUpdatedAt 倒序
}
```

**错误码**：

| errorCode | 触发场景 | Skill 端处理 |
|-----------|----------|-------------|
| `NO_WORKSPACE_FOR_GIT_REMOTE` | 无匹配 workspace project | 提示先创建工作空间项目 |
| `INTERNAL_ERROR` | 兜底 | 透传 message |

**注意**：空列表是正常响应（当前仓库无可接力需求）。

### 8.4 archiveHandoff — 归档上报

**请求**：
```bjsc
class ArchiveHandoffRequestType {
    required long requirementId;
    required string gitRemoteUrl;
    required HandoffArchiveStatusEnum status;  // v1 仅 COMPLETED
    required string branchName;
    required string commitHash;
    string remoteUrl;           // 为空时服务端按 gitRemoteUrl 兜底
    required string decisions;  // decisions.md 全文
    CommonHeader commonHeader;
}
```

**响应**：
```bjsc
class ArchiveHandoffResponseType {
    ResponseStatusType responseStatus;
    BusinessResponseHeader businessResponsesStatus;
    long workspaceProjectId;
    RequirementStatusEnum requirementProjectStatus;  // 项目维度状态
    RequirementStatusEnum requirementStatus;          // 需求维度状态（全部项目归档后推进）
    long archiveRecordId;
}
```

**错误码**：

| errorCode | 触发场景 | Skill 端处理 |
|-----------|----------|-------------|
| `REQUIREMENT_NOT_FOUND` | 需求不存在 | `archive_report_failed` |
| `NO_PROJECT_MATCH` | gitRemoteUrl 无匹配 | `archive_report_failed` |
| `ARCHIVE_RECORD_PERSIST_FAILED` | 持久化失败 | `archive_report_failed` + 重试 |
| `STATUS_TRANSITION_INVALID` | 状态不可归档 | `archive_report_failed` + 提示 |
| `INTERNAL_ERROR` | 兜底 | 透传 message |

**幂等性**：同一 `(requirementId, gitRemoteUrl)` 多次上报采用"最新覆盖"语义，支持失败重试。

---

## 9. Knowledge Base（Playbook 体系）

### 9.1 设计原则

每份 playbook 遵循统一结构：

```markdown
# {中间件} Playbook

## 决策根
"本任务要改/加 {中间件} 的什么？" →

## 场景 1: {场景名}
### 判断条件
### 标准做法
### 代码骨架（30-50 行）
### 硬性 Checklist

## 场景 2: {场景名}
...

## 反模式
| 反模式 | 为什么错 | 正确做法 |
```

- 每份 100-200 行
- 代码骨架基于目标仓库实际风格（初版手动提取，后续迭代更新）
- playbook 不引用特定 IDE 路径，保持 runtime-agnostic

### 9.2 六份中间件 Playbook 大纲

#### playbooks/dal.md

| 场景 | 描述 |
|------|------|
| 加字段到现有表 | DDL → Entity 加字段 → DAO 无需动 → Service 影响面 |
| 加新表 | DDL → Entity → DAO 继承 AbstractBaseDao → Service |
| 加查询方法 | 优先 queryBy(sample)，必要时 freeSql |
| 跨表批量操作 | 引用 CascadeDeleter 模式，业务层零 SQL |

硬性 checklist：`@DalTransactional` / `OperatorUtils.validateAndNormalize` / DAO 抛 SQLException 由 Service 包装

#### playbooks/soa.md

| 场景 | 描述 |
|------|------|
| 加新 endpoint | .bjsc → contract-jar → JAR 升级 → SOAServiceImpl → Service → Mapper |
| 改请求/响应字段 | 必须改 .bjsc，禁建 BaseRequest 基类 |
| 加 Mapper 转换 | 参考工厂模式骨架 |

#### playbooks/qmq.md

| 场景 | 描述 |
|------|------|
| 新增生产者 | XxxEventPublisher 封装模式，Topic 进 Constants |
| 新增消费者 | 注解 + 幂等校验 + 重投递不手写重试 |
| 消息体变更 | 兼容性规则：只加不删 |

#### playbooks/qconfig.md

| 场景 | 描述 |
|------|------|
| 新增配置文件 | 本地 META-INF 路径 + Portal 申请 |
| 读配置 | SDK 标准接口 + ConfigKeys 集中 |
| 动态监听 | listener 无阻塞 |

#### playbooks/qschedule.md

| 场景 | 描述 |
|------|------|
| 新增任务 | SDK 注解 + 幂等 + 超时 + 日志 |
| 运行追踪 | 起止时间 + 记录数 + 异常堆栈 |

#### playbooks/credis.md

| 场景 | 描述 |
|------|------|
| 新增缓存键 | key 规范 `spec:<domain>:<purpose>:<id>` + TTL 必设 |
| 集群依赖 | 集群名走配置不硬编码 |
| 一致性策略 | 写穿 / 旁路二选一模板 |

### 9.3 两份基础设施 Playbook 大纲

#### playbooks/repo-analysis.md

**增量版**（依赖 project-profile.md 已存在）：

2 步定位动作（profile 提供基线，只做增量）：
1. **同领域定位**：从 profile"架构分层"获取目标包路径 → grep 同领域类名/关键词 → 列出复用点
2. **命名冲突检测**：proposal 中提议的新类名 → 在目标包路径内 grep → 冲突则标记 hard_conflict

**不再执行**（已由 profile 覆盖）：
- ~~全局 glob 列包结构~~ → profile"架构分层"
- ~~识别 base class/utility~~ → profile"中间件使用"表已列出关键类
- ~~推荐实现位置~~ → 从 profile 架构分层表直接得出

**降级模式**（profile 不存在时）：回退到原 5 步全量扫描（兼容未运行 init 的场景）。

grep 关键词集根据 infrastructureFootprint 动态扩展。

#### playbooks/contract-jar.md

- 提取 Maven 坐标方法（优先从 `HandoffContract.mavenCoordinate` 字段读取，为空时正则 fallback）
- `mvn dependency:get` 命令模板
- 暂停/恢复输出文本模板
- 模式 1（.bjsc 在 MOM）vs 模式 2（.bjsc 进仓库）的分支处理

---

## 10. 卡点体系

### 10.1 硬性卡点（暂停等用户）

| 卡点 | 触发条件 | 恢复方式 |
|------|----------|----------|
| `clone_failed` | SOA 错误 / 产物缺失 / git remote 不匹配 | 排查后重新触发 skill |
| `contract_jar_pending` | Maven 坐标为空 / 版本未发布 | 用户去 MOM 生成 JAR，然后说"继续" |
| `hard_conflict` | 命名冲突且语义不同 | 用户决定改名策略，然后说"继续" |
| `subagent_blocked` | 子 Agent error / cannot_decide | 用户介入指引后说"继续" |
| `archive_blocked` | git fetch 失败 / 远端漂移 | 修复 git 状态后说"继续" |
| `archive_push_failed` | git push 失败 | 配置凭据后说"继续"（仅重试 push + 上报） |
| `archive_report_failed` | archiveHandoff 接口失败 | 排查后说"继续"（仅重试上报） |

### 10.2 软提示（记录在 delivery/handoff-check.md，不阻塞）

**通用**：
- 实施与 proposal 偏差
- 方法 >30 行
- 中文字符串字面量

**按中间件**：
- DAL: 未带 @DalTransactional / 未走标准 DDL 目录
- QMQ: Topic 未集中 / 消费者手写重试
- QConfig: key 未集中 / 默认值缺失
- QSchedule: 任务非幂等 / 无超时
- CRedis: TTL 缺失 / key 命名不规范

---

## 11. 与 ACE 共享协议及 Skill 的集成

| ACE 组件 | 在 spechub-handoff 中的使用方式 |
|---|---|
| **`/ace:init` (project-profile.md)** | **前置依赖**：understand 前读取；plan 阶段 repo-analysis 基线；implement 阶段 playbook + profile 联合注入；handoff-check 编码约定对照 |
| `alignment-protocol.md` | understand 阶段末尾执行简化版对齐（展示理解 + AskUserQuestion 确认） |
| `state-template.md` | state.json 设计参考其 schema 思路，但使用 JSON 格式（非 markdown） |
| `verification-protocol.md` | handoff-check 阶段的自检逻辑参考此协议的 Gate Function |
| `context-discipline.md` | implement 阶段子任务使用 Agent 隔离，主上下文只保留结论 |
| `parallel-protocol.md` | plan 阶段 repo-analysis 可与 contract-jar 校验并行 |

---

## 12. SKILL.md 骨架设计

```markdown
---
name: spechub-handoff
description: |
  SpecHub 产物接力编码。拉取 SpecHub 平台产物，基于本地仓库进行深度分析、
  需求对齐、任务规划、代码实施、自检归档的全流程 skill。

  触发场景：
  - "接力 SpecHub 需求 12345"
  - "拉取 SpecHub 产物开始编码"
  - "SpecHub 需求开发"
  - 用户提到 spechub / handoff / 接力编码

  DO NOT TRIGGER: 纯代码 review（→ code-review）；写测试（→ ut）；
  非 SpecHub 来源的开发任务（→ auto-goal）。
---

# SpecHub Handoff — 产物接力编码

## 前置依赖

本 skill 依赖 `.claude/project-profile.md`（由 `/ace:init` 生成）。
进入 understand 阶段前检查：存在 → 读取作为项目基线；不存在 → 提示先运行 `/ace:init`。

## 硬规则

<HARD-GATE>
进入 implement 阶段前，understand 阶段的对齐确认必须通过。
证据 = AskUserQuestion 已调用且用户回复了确认。
无证据 = 禁止进入 implement。
</HARD-GATE>

## 主流程

### Phase 1: select
{仅在用户未给 requirementId 时进入；调 getHandoffInbox；让用户选}

### Phase 2: clone
{调 scripts/pull-bundle.py；落盘到 artifacts/；写 state.json}

### Phase 3: understand
{读 profile → 读 artifacts/ → 对照差分生成 analysis/comprehension.md → 对齐确认}

### Phase 4: plan
{基于 profile 增量 repo-analysis + 4 个子动作；产出 analysis/*.md}

### Phase 5: implement
{按 analysis/tasks.md 逐任务派发子 Agent；playbook + profile 联合注入}

### Phase 6: handoff-check
{对照 proposal + profile 编码约定检查；产出 delivery/handoff-check.md}

### Phase 7: archive
{git 操作 + 调 scripts/archive-report.py；产出 delivery/decisions.md}

## 恢复协议
{用户说"继续"：读 state.json → 校验 artifacts/ + analysis/ 文件存在性 → 从卡点处继续}

## 状态文件
Read `references/schemas/state-schema.md`

## 子任务 Prompt 模板
{playbook 注入策略：从 task 注释 <!-- playbook: xxx.md#section --> 决定注入哪段}
```

---

## 13. 触发与恢复

### 13.1 触发方式

skill 通过 Claude Code 的意图匹配触发，支持：
- 自然语言："接力 SpecHub 需求 12345 到当前仓库"
- 带参数："spechub handoff 12345"（仅需 requirementId）
- 无参数："SpecHub 接力" → 进入 select 阶段

### 13.2 恢复方式

- 用户说"继续"/"恢复"/"resume" → skill 读 `.active` 定位需求 → 读 state.json → 从卡点处继续
- 用户说"切换到需求 xxx" → 更新 `.active`
- 用户说"列出 SpecHub 需求" → 列出所有 `spechub/*/state.json` 快照

### 13.3 与 auto-goal 的关系

spechub-handoff 是**独立 skill**，不是 auto-goal 的子流程。区别：
- auto-goal：开放式目标编排，需要完整的苏格拉底追问对齐
- spechub-handoff：产物驱动的确定性流程，对齐简化为"理解确认"

---

## 14. infrastructureFootprint 识别策略

understand 阶段采用 **profile 基线 + 产物差分** 双层策略：

### 14.1 已有中间件基线（来自 project-profile.md）

直接从 profile"中间件使用"表提取项目已接入的中间件列表，**无需 LLM 推断**。
例如 profile 中间件表有 DAL / SOA / QConfig → 自动标记为 `existing`。

### 14.2 需求新增中间件（从产物推断）

| 中间件 | 判断依据（仅判断本需求是否**新增**使用） |
|--------|----------|
| soa | `artifacts/contracts/` 有文件 OR architecture.md 有"对外接口"章节 |
| dal | `artifacts/ddl-change.*` 存在 OR architecture.md 有"数据模型"章节 |
| qmq | `artifacts/qmq-message-design.md` 存在 OR architecture.md 有"异步消息"章节 |
| qconfig | architecture.md "配置项设计（QConfig）"章节非 N/A |
| qschedule | architecture.md "定时任务设计（QSchedule）"章节非 N/A |
| credis | architecture.md "缓存设计（CRedis）"章节非 N/A |

### 14.3 合并逻辑

```yaml
infrastructureFootprint:
  # 项目已有且本需求涉及 → 按现有模式实施（profile 提供骨架基线）
  existing_and_involved: [soa, dal, qconfig]
  # 项目未有但本需求新引入 → 需要从零建立（playbook 提供完整引导）
  newly_required: [qmq]
  # 项目已有但本需求不涉及 → 不注入 playbook
  existing_not_involved: [credis]
```

**设计价值**：
- `existing_and_involved`：implement 时注入 playbook 场景章节 + **profile 中该中间件的项目特定用法**（省去发现成本）
- `newly_required`：implement 时注入 playbook **完整引导**（从接入到配置全覆盖）+ 提醒用户 release-checklist 有新平台操作

输出到 `analysis/comprehension.md` 中，用户可在对齐环节修改。

### 14.4 降级模式

若 profile 不存在，回退到原策略：全部从产物启发式推断，不区分 existing/newly_required。

---

## 15. release-checklist 模板

plan 阶段 5.4.4 根据 infrastructureFootprint 生成到 `analysis/release-checklist.md`：

```markdown
## 上线 checklist

### SOA / 契约 (if soa=true)
- [ ] 契约 JAR 已发布，pom.xml 已升级版本

### DAL / DB (if dal=true)
- [ ] DB 平台变更单已创建，导入 ddl-change.sql
- [ ] 测试环境发布通过

### QMQ (if qmq=true)
- [ ] QMQ Portal 申请 Topic: <topic-name>
- [ ] Topic 字符串与 MessageTopicConstants 一致

### QConfig (if qconfig=true)
- [ ] QConfig Portal 创建文件: <file-name>
- [ ] 默认值与本地 properties 一致

### QSchedule (if qschedule=true)
- [ ] QSchedule Portal 配置任务调度策略

### CRedis (if credis=true)
- [ ] CRedis 平台申请集群: <cluster-name>
- [ ] 集群名配置到 QConfig

### 验证
- [ ] mvn clean package 编译通过
- [ ] mvn test 单测通过
```

---

## 16. 实施路线

| 里程碑 | 交付 | 预估 |
|--------|------|------|
| **M1** | SKILL.md 骨架 + schemas/ | 1 天 |
| **M2** | pull-bundle.py + clone 阶段 e2e | 1 天 |
| **M3** | understand + plan 阶段（含 repo-analysis / contract-jar playbook） | 2 天 |
| **M4** | dal + soa playbook + implement 子任务派发 | 2-3 天 |
| **M5** | qmq / qconfig / qschedule / credis 四份 playbook | 2-3 天 |
| **M6** | handoff-check + archive（含 archive-report.py） | 2 天 |
| **M7** | 真实需求试点（3-5 个需求跑全流程） | 1-2 周 |

---

## 17. 设计决策记录

| 决策 | 选择 | 理由 | 备选 |
|------|------|------|------|
| 需求坐标 | 仅 requirementId | 服务端通过 gitRemoteUrl 自动匹配 project，减少用户输入 | requirementId + projectId |
| 产物目录结构 | artifacts/ + analysis/ + delivery/ 三级 | 职责清晰、只读与可变分离、便于 .gitignore 精细控制 | 扁平目录 |
| 接口协议 | SOA（Baiji） | 与 spec-portal-service 现有架构一致 | REST |
| 状态文件格式 | JSON | 机器可读性强，script 直接解析 | YAML / Markdown |
| 对齐深度 | 简化版（展示+确认） | 产物已经是对齐后的结果 | 全量 alignment-protocol |
| 6 中间件 playbook 分离 | 独立文件 | 按需注入控制 token 消耗 | 合并为一份大 playbook |
| archive 不加确认闸门 | 直接 push + 上报 | 新分支无破坏性 | push 前 AskUserQuestion |
| 脚本语言 | Python3 stdlib | 公司开发机普遍有，无需安装依赖 | Node.js / curl |
| skill 独立性 | 独立 skill | 流程确定性强，不适合开放式编排 | auto-goal 子流程 |
| references 子目录 | schemas/ + playbooks/ | 关注点分离：数据定义 vs 编码知识 | 平铺 |
| **profile 集成方式** | **前置依赖 + 精准注入** | profile 已是用户确认的项目事实，消除重复分析、提升一致性；降级模式保证无 profile 时仍可运行 | 每次全量重新分析 |
| **repo-analysis 策略** | **增量版（2 步）** | profile 已覆盖包结构/基类/位置推荐，仅做需求特定的同领域定位和冲突检测 | 始终 5 步全量 |
| **footprint 双层识别** | **profile 基线 + 产物差分** | 区分 existing/newly_required 可精准控制 playbook 注入粒度（已有模式 vs 全新接入） | 不区分一律全量推断 |

---

## 18. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Python3 不存在 | clone 阶段失败 | 脚本头检测 + 明确错误提示 |
| mvn settings.xml 未配 | contract-jar 校验失败 | 卡点提示配置方法 |
| 子 Agent 偏离 playbook | 生成代码不规范 | handoff-check 对照 profile 编码约定 + playbook 迭代 |
| infrastructureFootprint 漏识别 | 缺 playbook 注入 | profile 基线兜底 + 用户可手改 + handoff-check 二次校验 |
| SpecHub 接口不可用 | archive 卡住 | 幂等重试 + push 已成功不回滚 |
| 上下文溢出 | 6 中间件全命中时 token 爆 | 精准注入场景章节 + 子任务细颗粒拆分 |
| gitRemoteUrl 归一化失败 | clone/archive 匹配不到 project | 提示用户检查 git remote -v 与 SpecHub 配置 |
| **project-profile.md 不存在** | 回退到全量分析模式，token 消耗增加 | understand 阶段前置检查 → 提示运行 `/ace:init`；降级模式保证功能不受阻 |
| **profile 过期** | 生成代码基于过期信息 | understand 阶段做 lightweight 漂移检测（对比 pom.xml 依赖 vs profile 中间件列表） |

---

## 19. 后续演进方向

1. **Playbook 持续迭代**：基于真实需求 bad case 不断补充场景和骨架
2. **SpecHub QMQ/DB Agent 上线**：产物字段从 `exists: false` 变为有内容，skill 无需改动
3. **多仓库协同**：一个需求关联多个仓库时的编排（通过不同 gitRemoteUrl 区分）
4. **Cadet 迁移**：scripts/ + references/ 完全 runtime-agnostic，可直接复用

---

## 附录 A：与飞书原始设计的关键差异

| 维度 | 飞书原始设计 | ACE 最终方案 |
|------|-------------|-------------|
| 需求坐标 | `(reqId, projectId)` 双参数 | 仅 `requirementId`，projectId 由服务端匹配 |
| 产物目录 | 扁平结构（所有文件平铺） | `artifacts/` + `analysis/` + `delivery/` 三级组织 |
| 接口协议 | REST | SOA（Baiji），与现有 spec-portal-service 一致 |
| 运行环境 | Cursor + .cursor/rules | Claude Code + plugin/skills/ |
| 触发方式 | /spechub-handoff slash command | 自然语言意图匹配 |
| 恢复方式 | /spechub-resume 命令 | "继续" 自然语言 + state.json 恢复 |
| 对齐协议 | 无（默认全自动） | 继承 ACE alignment-protocol（简化版） |
| 子任务派发 | Cursor Task 工具 | Claude Code Agent 工具 |
| 上下文管理 | 未明确 | ACE context-discipline（隔离/压缩策略） |
| references 组织 | 全部平铺 | schemas/ + playbooks/ 分目录 |
| **项目知识来源** | 每次全量 repo 扫描（rules 中硬编码） | 依赖 `/ace:init` 生成的 project-profile.md（用户确认的项目事实，增量更新） |
