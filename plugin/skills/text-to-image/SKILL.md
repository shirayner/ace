---
name: text-to-image
description: "当用户想根据文字描述生成图片时使用此 skill。触发词包括：'generate an image of...'、'draw/paint/create a picture of...'、'make me an image...'、'生成一张...图片'、'画一张...'、'文生图'、'text to image'，或任何从文字描述创建图像/插画的请求。不适用于：编辑已有图片、图片格式转换、截图相关任务。"
---
# 文生图 Skill

通过苏格拉底式需求理解 + 然后文生图脚本 `text_to_image.py` 生成图片。

**核心原则**：不假设用户想要什么。通过结构化提问逼近真实意图，组装精确 prompt 后再生成。

## ⛔ 执行约束（HARD RULE — 不可违反）

<HARD-GATE name="exclusive-generation-tool">
**本 skill 生成图片的唯一手段是调用 `text_to_image.py` 脚本。**

以下行为**严格禁止**：

- ❌ 使用 `mcp__feishu2md__html_to_image` 或任何 HTML 渲染工具生图
- ❌ 使用任何其他 MCP 工具生图
- ❌ 自行编写 HTML/SVG/Canvas 代码来"画图"
- ❌ 以"技术图用 HTML 更精确"为由绕过本约束

**无论图片类型是什么（技术图、架构图、流程图、全景地图、插画……），全部必须通过本 skill 的 `text_to_image.py` 脚本生成。**

如果你认为某类图不适合当前模型能力，应当告知用户局限性并询问是否继续，而非私自换工具。
如果 python 脚本不可用/执行失败，报告错误并停止，不得用其他工具兜底。

违反此约束 = skill 执行失败。
`</HARD-GATE>`

---

## 前置条件

以下环境变量必须在 Claude Code settings.json 的 `env` 中或系统环境变量中配置：

| 变量                       | 必填 | 说明                                                        |
| -------------------------- | ---- | ----------------------------------------------------------- |
| `TEXT_TO_IMAGE_BASE_URL` | 是   | API 地址（如 `http://proxy.llm.azure.sys.ctripcorp.com`） |
| `TEXT_TO_IMAGE_API_KEY`  | 是   | API 认证密钥                                                |
| `TEXT_TO_IMAGE_MODEL`    | 否   | 模型名（默认 `gpt-image-2`）                              |

---

## 工作流程

### Phase 1: 需求理解（苏格拉底提问）

#### Step 1: 场景判断

从用户请求中判断图片类型，分流到对应路径：

| 类型             | 判断依据                                                       | 路径          |
| ---------------- | -------------------------------------------------------------- | ------------- |
| **技术图** | 架构图、流程图、全景地图、拓扑图、数据流图、时序图、领域模型图 | → 技术图路径 |
| **通用图** | 插画、海报、图标、头像、壁纸、艺术创作、Banner                 | → 通用图路径 |

#### Step 2: 必选维度确认

使用 **AskUserQuestion** 工具，一次性收集必选维度。

##### 技术图路径 — 5 必选维度

| # | 维度                     | 问什么                                       | 选项示例                                                                           |
| - | ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1 | **图的类型与目的** | 什么类型的图？用来做什么？                   | 系统架构图/流程图/功能全景/部署拓扑/数据流/时序图 + 方案评审/文档配图/技术分享/PPT |
| 2 | **核心内容**       | 需要包含哪些组件/步骤/模块？它们之间的关系？ | 开放式文本（用户描述具体内容）                                                     |
| 3 | **视觉风格** ⚡    | 什么视觉风格？**支持多选（批量模式）** | 极简线框/科技感渐变/品牌化精致/手绘白板风                                          |
| 4 | **标注语言**       | 图中标注用什么语言？                         | 中文/英文/中英混合                                                                 |
| 5 | **配色方案**       | 色彩偏好？                                   | 经典蓝灰科技风/按语义分色(计算=蓝,存储=绿,中间件=橙)/品牌色指定/无偏好由AI决定     |

##### 通用图路径 — 4 必选维度

| # | 维度                  | 问什么                                       | 选项示例                                |
| - | --------------------- | -------------------------------------------- | --------------------------------------- |
| 1 | **用途/场景**   | 这张图用在哪里？                             | 社交媒体/PPT配图/产品内/印刷/壁纸/头像  |
| 2 | **视觉风格** ⚡ | 什么视觉风格？**支持多选（批量模式）** | 扁平插画/3D渲染/水彩/写实摄影/像素/卡通 |
| 3 | **配色方案**    | 色彩偏好？                                   | 暖色调/冷色调/品牌色指定/单色系/无偏好  |
| 4 | **图中文字**    | 需要包含什么文字？什么语言？                 | 无文字/有文字(用户提供内容+语言)        |

**提问规范**：

- 使用 AskUserQuestion 工具（结构化选项 + "Other" 开放输入）
- 每个维度的选项不超过 4 个，保持简洁
- 用户可对任何维度回答"你来决定"/"无偏好"（显式委托）
- **视觉风格维度使用 `multiSelect: true`**，允许用户一次选多种风格

**批量模式**：当用户选择 ≥2 种风格时，自动进入批量模式——同一内容生成多张不同风格的图片（Phase 2 并行执行）。

#### Step 3: 智能追问（条件触发，最多 2 轮）

根据 Step 2 的回答，AI 判断是否需要追加提问。

**触发规则：**

| 条件                       | 追问方向                                            |
| -------------------------- | --------------------------------------------------- |
| 架构图但未说明分层逻辑     | 需要体现几层？(网关/服务/数据？) 外部依赖画不画？   |
| 流程图但未说明分支/异常    | 有分支条件吗？异常路径需要画吗？有几个参与角色？    |
| 全景地图但未说明分组策略   | 按什么维度分组？(按层/按域/按功能模块？) 层级深度？ |
| 组件较多(>5个)但未说明布局 | 布局方向？(从上到下/从左到右/辐射状？)              |
| 用户描述模糊或过于简短     | 受众是谁？信息密度偏高还是偏低？                    |
| 用户提到"类似xxx"          | 具体哪方面像？风格/布局/配色？                      |
| 通用图有文字但未说明层级   | 哪个文字最突出？信息层级？                          |

**跳过条件（满足任一即跳过）：**

- 所有必选维度都有明确、充分的答案
- 用户明确说"够了直接画"/"不用再问了"
- 信息已足够组装精确 prompt

**追问形式**：使用 AskUserQuestion 工具，或在文本中提出 1-2 个针对性问题。

#### Step 4: Prompt 组装与确认

根据收集到的所有信息，组装最终 prompt。

##### 技术图 Prompt 组装模板

```
Create a [type] diagram showing [purpose].

Components: [enumerated list of components/modules]
Relationships: [how components connect - calls/data flow/dependencies]
Layout: [direction (top-down/left-right/radial) + grouping logic]
Grouping: [how to cluster - by layer/by domain/by function]
Style: [visual style description]
Colors: [color scheme + semantic meaning if any]
Labels: [language + key label text]
Additional: [density/audience/emphasis notes]
```

##### 通用图 Prompt 组装模板

```
Create a [style] image for [use case].

Subject: [main subject description]
Composition: [layout/framing/perspective]
Color palette: [color scheme]
Mood/Atmosphere: [feeling/tone]
Text content: [text to include + language]
Additional: [size hints/brand requirements]
```

##### Prompt 组装后：直接生成

提问阶段已充分收集需求，组装 prompt 后**不再额外确认**，直接进入 Phase 2 生成。

在进入 Phase 2 前，用 markdown 展示**生成摘要**（仅信息性，不阻塞）：

```markdown
📝 **生成摘要：**
- 风格：[视觉风格]
- 尺寸：[推荐尺寸]
- 质量：[质量级别]
- 配色：[配色方案]
- 布局：[布局/构图方向]
```

然后立即执行 Phase 2。

---

### Phase 2: 生成执行

#### 2.1 确定尺寸

根据内容推荐：

- `1024x1024` — 正方形，适合图标、头像、对称布局
- `1536x1024` — 横版，适合架构图、横幅、全景地图、流程图(横向)
- `1024x1536` — 竖版，适合人物、海报、流程图(纵向)

#### 2.2 构造输出文件名

**命名规则：`{intent}-{style}-{YYYYMMDD-HHmmss}.png`**

- `{intent}`：从用户需求意图中提炼 2-4 个英文单词，kebab-case 格式
  - 示例：`microservice-arch`、`login-flow`、`feature-landscape`
  - 提炼原则：核心主体 + 图类型，简洁可识别
- `{style}`：风格缩写，1-2 个英文单词，kebab-case
  - 示例：`minimal-line`、`tech-gradient`、`brand-polished`、`whiteboard`
- `{YYYYMMDD-HHmmss}`：生成时刻的时间戳，精确到秒
  - 时间戳通过 Bash `date +%Y%m%d-%H%M%S` 获取
- 完整示例：`microservice-arch-minimal-line-20260618-143022.png`

**输出目录：`./images/`**（相对于当前工作目录）

- 若 `./images/` 不存在，先创建：`mkdir -p ./images/`

**覆盖规则：**

- 用户显式指定了路径 → 原样使用（尊重用户意图）
- 用户未指定 → **必须使用上述规则自动生成**
- **禁止使用 `output.png`**（会造成覆盖）
- **禁止自行拼接绝对路径**

#### 2.3 执行生成

> **重要**：Prompt 可能含 `||`、`&&`、`;` 等 shell 特殊字符。
> **禁止**将 prompt 作为命令行位置参数传递。
> **必须**使用 `--prompt-file` 或 `--batch` 模式。

##### 单风格模式（选了 1 种风格）

1. 将 prompt 写入临时文件
2. 用 `--prompt-file` 调用脚本

```bash
mkdir -p ./images/
cat > /tmp/prompt.txt << 'PROMPT_EOF'
[组装后的完整 prompt 内容，任意特殊字符都安全]
PROMPT_EOF
python "<skill_path>/scripts/text_to_image.py" --prompt-file /tmp/prompt.txt -o "./images/{intent}-{style}-{timestamp}.png" -s "<size>" -q "<quality>"
```

##### 批量模式（选了 ≥2 种风格）

1. 构造 batch JSON 文件（每种风格一个条目，prompt 各自不同）
2. 单次调用，脚本内部并行执行

```bash
mkdir -p ./images/
cat > /tmp/batch.json << 'BATCH_EOF'
[
  {"prompt": "...(风格A的完整prompt)...", "output": "./images/{intent}-{styleA}-{timestamp}.png", "size": "1536x1024", "quality": "high"},
  {"prompt": "...(风格B的完整prompt)...", "output": "./images/{intent}-{styleB}-{timestamp}.png", "size": "1536x1024", "quality": "high"},
  {"prompt": "...(风格C的完整prompt)...", "output": "./images/{intent}-{styleC}-{timestamp}.png", "size": "1536x1024", "quality": "high"}
]
BATCH_EOF
python "<skill_path>/scripts/text_to_image.py" --batch /tmp/batch.json
```

**batch 模式优势：**
- Prompt 不经过 shell 解析，任何特殊字符都安全
- 脚本内部 ThreadPoolExecutor 并行（最多 8 线程）
- 共享连接池，减少网络开销
- 单次调用，统一汇总结果

**摘要展示（批量模式）：**

```markdown
📝 **批量生成摘要：**
- 内容：[核心内容描述]
- 风格：[风格1] / [风格2] / [风格3]
- 尺寸：[尺寸]
- 质量：[质量]
- 预计生成：[N] 张图片
```

#### 2.4 报告结果

- 单张成功 → 告知文件保存路径
- 批量成功 → 列出所有生成的文件路径
- 部分失败 → 报告成功/失败各几张，失败原因
- 全部失败 → 报告错误，建议检查配置

#### 2.5 风格汇报（生成成功后必须输出）

以 markdown 格式输出本次生成的风格信息，供用户下次复用：

##### 单风格汇报：

```markdown
🎨 **本次风格档案：**
- 风格：[具体风格名称]
- 配色：[配色方案描述]
- 关键词（下次可直接复用）：`keyword1`, `keyword2`, `keyword3`, ...
```

##### 批量风格汇报：

```markdown
🎨 **本次风格档案（共 N 张）：**

| # | 风格 | 文件 | 关键词 |
|---|------|------|--------|
| 1 | [风格名] | [文件名] | `kw1`, `kw2`, ... |
| 2 | [风格名] | [文件名] | `kw1`, `kw2`, ... |
| 3 | [风格名] | [文件名] | `kw1`, `kw2`, ... |

💡 下次可直接说"用第 N 张的风格"或引用关键词复用。
```

**关键词提取规则：**

- 从本次 prompt 中提取决定视觉效果的核心描述词
- 包括：风格词、配色词、布局词、氛围词
- 格式：英文、逗号分隔、用行内代码标记
- 示例：`minimal line-art`, `blue-gray tech`, `top-down layered`, `gradient nodes`

---

## 尺寸选择指南

| 场景                   | 推荐尺寸      | 理由                 |
| ---------------------- | ------------- | -------------------- |
| 系统架构图（横向分层） | `1536x1024` | 组件多，需要横向空间 |
| 流程图（纵向）         | `1024x1536` | 步骤从上到下         |
| 功能全景地图           | `1536x1024` | 信息量大，横向展开   |
| 图标/Logo              | `1024x1024` | 对称正方形           |
| 海报/封面              | `1024x1536` | 竖版阅读             |
| 社交媒体配图           | `1024x1024` | 通用方形             |

---

## 错误处理

- 环境变量缺失 → 提示用户配置 `TEXT_TO_IMAGE_BASE_URL` 和 `TEXT_TO_IMAGE_API_KEY`
- 重试后仍失败 → 报告错误并建议检查网络/配置
- 脚本内置重试逻辑（3 次，指数退避）

---

## 依赖

脚本需要 `requests` 包，如未安装：

```bash
pip install requests
```

---

## 快速参考：AI 行为清单

- [ ] 从用户请求判断图片类型（技术图 vs 通用图）
- [ ] 使用 AskUserQuestion 收集必选维度
- [ ] 判断是否需要智能追问（最多 2 轮）
- [ ] 组装结构化 prompt
- [ ] 展示最终 prompt 给用户确认
- [ ] 用户确认后执行生成
- [ ] 报告结果
