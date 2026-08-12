---
name: feishu-doc
description: |
  飞书复杂文档与跨资源任务的协调入口。用于同时涉及 Docx/Wiki 正文、原生表格、嵌入 Sheet/Base、图片/附件、画板，或需要在 lark-cli 不可用时受限降级到 feishu2md MCP 的场景。单一文档正文读取、创建或编辑直接使用 lark-doc；单一资源任务直接使用对应 lark-* skill。Use for complex Feishu/Lark document workflows, capability fallback, high-fidelity round trips, large documents, or routing embedded resources across document, whiteboard, sheets, base, and drive tools.
---

# 飞书复杂文档协调入口

本 Skill 只负责能力选择、跨资源路由和安全契约，不复制下游 Skill 的命令细节。

## 核心原则

1. 面向用户的解释、授权提示、进度和降级说明使用中文。
2. 优先使用用户身份；执行 `lark-cli` 文档操作时通常显式带 `--as user`。
3. **高保真任务优先 `lark-cli`，`feishu2md` MCP 只作受限兜底。**
4. 不在每次操作前强制运行认证预检。先按下游 Skill 乐观执行；仅遇认证、身份或 scope 错误时读取 `lark-shared` 修复并重试。
5. 不凭本文件猜参数。进入具体场景后读取对应 Skill 及 reference：
   - 文档正文、原生表格、图片/附件块：`lark-doc`
   - 已有画板查询、导出、编辑：`lark-whiteboard`
   - 认证、权限、安全确认、错误契约：`lark-shared`
   - 嵌入电子表格：`lark-sheets`
   - 嵌入多维表格：`lark-base`
   - Wiki 节点/子树：`lark-wiki`
   - 云盘文件、评论、权限：`lark-drive`
6. 缺权限、token、目标 block 或能力时不得编造成功；明确说明缺什么、已保留什么、如何继续。

## 能力选择

### 首选：lark-cli

以下场景必须优先走 `lark-cli`：

- 大文档按目录、章节、范围或关键词局部读取。
- 需要 block ID、样式、引用元数据或高保真往返。
- 局部替换、插入、删除、移动、复制或 revision 乐观锁。
- 保留或复制图片、附件、画板、sheet、bitable 等 token 化资源。
- 创建、查询、导出或编辑可用的画板。

若需要探测 CLI，只检查命令是否存在和版本；不要把认证状态预检设成每次读写的硬门禁。真实操作返回认证错误后再处理认证。

### 兜底：feishu2md MCP

仅在 `lark-cli` 不存在、无法使用，或 MCP 具有明确独有能力时使用：

- `get_document_info`：轻量元数据、Wiki 对象信息、Bitable 字段 schema。
- `get_child_nodes`：Wiki 子节点遍历。
- `feishu2md`：简单文档全文转 Markdown。
- `md2feishu` / `md2feishu_append`：简单 Markdown 新建或文末追加。
- `html_to_image`：把 HTML/图表渲染为静态图片；它不是可编辑画板。
- Bitable 批量写入使用对应 MCP 或 `lark-base`，按实际可用能力选择。

降级到 MCP 前必须告知用户限制（以下为同一文档双栈对读实测结果）：

- 没有文档 scope 分页和 block ID，可能无法读取超大文档或精确编辑。
- 只能新建或尾部追加，不能可靠地替换、删除或移动已有 block。
- 图片的持久 `src` token 变成带 authcode 的**临时下载 URL**（同一图片多次读取 code 不同，有时效），不能当稳定引用保存或回放。
- 文档原生表格丢失 `<colgroup>`、`<thead>` 与对齐信息，降级为无表头的普通行。
- 画板变成纯文本坐标描述，不可回写；不支持可编辑画板的查询与更新，HTML 渲染只能得到位图。
- 只返回 `revisionId`，无法作为精确写入的乐观锁基准。
- `md2feishu_append` 没有幂等保护。超时或结果不明时先回读确认，禁止直接重试造成重复追加。

若任务要求的保真度超过 MCP 能力，不得静默降级；停止写入并说明需要安装/授权 `lark-cli`。

## 认证与权限恢复

### 错误驱动恢复

1. 先执行目标操作。
2. 仅当返回未认证、身份不可用或缺 scope 时读取 `lark-shared`。
3. 需要查看状态时使用 JSON，并读取 `identities.user.available`；不要读取不存在的顶层 `user.available`。
4. `identities.user.available=true` 时，即使 `tokenStatus=needs_refresh` 也可继续，让 CLI 自动刷新。
5. 缺 scope 时按错误给出的 scope 做增量授权，不预先申请无关权限。

### split-flow 授权

需要用户授权时按 `lark-shared` 执行 split-flow：生成授权 URL 和二维码，结束当前轮等待用户完成；不要同轮轮询。二维码和所有本地输入/输出路径使用当前工作目录下的相对路径，如 `./auth.png` 或 `@./content.xml`。

## 读取工作流

### 1. 选择最小读取范围

进入 `lark-doc` 并读取 `references/lark-doc-fetch.md`：

- 结构未知或文档较大：先 `scope=outline`，再按标题 ID 使用 `section`。
- 有关键词：使用 `keyword`，必要时带少量前后文。
- 已知起止 block：使用 `range`。
- 只有确需整篇时才读取全文。
- 仅浏览/总结用 `detail=simple`；定位用 `with-ids`；编辑或高保真往返用 `full`。

局部返回的 `<excerpt>` 只是切片，不得当成完整顶层 block。表格命中默认可能只返回表头和命中行；需要整表时按 fetch reference 用表格 block ID 读取完整范围。

内容格式由 `--doc-format`（`xml` | `markdown` | `im-markdown`）决定；`--format` 只控制输出包装（`json` | `pretty`）。把格式写错位置不会报错：`--format xml` 会在 **stdout 首行**打印 `warning: unknown format "xml", falling back to json` 并回退 JSON，重定向到文件后这一行会破坏 JSON 解析。`docs +fetch` 没有 `--output`，需要落盘时用 shell 重定向，并在解析前跳过可能的 warning 行。

### 2. 保留高保真数据

高保真读取使用 XML，并把 `document.content` 与 `document.reference_map` 视为同一份数据：

- 回放或复制时必须配套传递 `reference_map`。
- 不把 `<img>`、`<source>`、`<whiteboard>`、`<sheet>`、`<bitable>`、`<synced_reference>` 改成纯文本占位符。
- 编辑前获取最新 block ID；任何结构写入后重新 fetch，禁止沿用旧 block ID。

### 3. Wiki

纯读取时 `lark-doc +fetch` 可直接接受 `/wiki/` URL。只有写入或需要 canonical object token 时才按 `lark-wiki` / `lark-shared` 的路由规则解析；不要假设 Wiki URL 中的 node token 就是可写 doc token。

## 写入工作流

进入 `lark-doc` 并按场景读取：

- 创建：`lark-doc-create-workflow.md` 与 `lark-doc-create.md`。
- 精确编辑：`lark-doc-update.md`。
- XML：`lark-doc-xml.md`；使用扩展块时再读 `lark-doc-xml-extended-blocks.md`。
- 用户明确要求 Markdown 时才读 `lark-doc-md.md`。

执行顺序：

1. Observe：按最小范围 fetch，获取最新 revision、block ID、资源 token 和 `reference_map`。
2. Plan：选择最小安全操作；避免为局部修改 overwrite 全文。
3. Dry-run：下游命令支持 `--dry-run` 时先检查请求。
4. Patch：必要时带基准 `--revision-id`，保护 token 化资源。
5. Verify：检查响应 `ok == true`、`result`、`warnings` 和 `tips`，再按影响范围重新 fetch。

成功响应没有顶层 `code` 时，不得用 `code == 0` 判断失败。revision 冲突等写入失败可能返回 `ok=false` + `result=failed` + 非空 `warnings`（如 `degrade_code=1011`），而进程退出码正常；必须读 `ok`、`result`、`warnings`，不能只看退出码或有无输出。遇到高风险写入返回退出码 10 / `error.type=confirmation` 时，先向用户展示动作并获得确认；确认后在**原参数末尾**追加 `--yes`，不得自行绕过。支持 `--idempotent-token` 的写操作在重试时必须复用同一 token。

## 表格路由

先区分两种完全不同的表格：

| 内容 | 路由 |
| --- | --- |
| 文档原生 `<table><thead>...` | 留在 `lark-doc`，按 XML 表格语法读写；不需要 spreadsheet token |
| `<sheet>` / sheets cite / spreadsheet token | 提取 token 与 sheet ID，转 `lark-sheets` |
| `<bitable>` / Base cite / app-table token | 提取 app、table、view 信息，转 `lark-base` |

不得把“看文档里的表格”一律路由到 Sheets/Base；先读取文档确认块类型。

## 图片与大文件

### 读取

- 高保真读取保留 `<img>` 的 token、alt、尺寸和 `reference_map`。
- 只查看图片优先 `docs +media-preview`；下载原始素材使用 `docs +media-download`。
- 画板不是普通图片：缩略图使用 `docs +media-download --type whiteboard`，不要使用不支持画板的 media preview。
- 遇到 URL 时只下载可信公开 HTTP(S) 地址，并遵守 `lark-doc-fetch` 的 SSRF 与重定向校验规则。

### 写入

- 遵从用户指定来源：剪切板、本地文件或 URL，不擅自改换来源。
- 本地图片优先 `docs +media-insert`；该命令对超过 20MB 的本地文件自动分片上传（实测 25.75MB PNG 自动分 7 片，约 22 秒完成），无需人工切片，也不要为了绕过大小限制而压缩原图。
- XML/Markdown 直接引用网络图片时存在单图 20MiB 限制；超过限制先落为本地文件，再走 `media-insert`。
- 不默认压缩、缩放或转码原图。确需压缩时先说明画质、格式、透明度和元数据影响，并保留原文件。
- WebP/BMP 等无法自动推导显示尺寸的格式，按下游 reference 同时提供 width 与 height。
- 插入后回读，核对 block ID、file token、caption、对齐和显示尺寸。

所有 `--file`、`--output`、`@path` 使用 CWD 内相对路径；绝对路径会被 CLI 以 `unsafe file path`（`error.type=validation`）直接拒绝，不会自动降级。需要引用 CWD 之外的文件时，改用支持 stdin 的参数传 `-`。

## 画板路由

### 读取与导出

1. 用 `lark-doc` fetch 提取 `<whiteboard token="...">`。
2. 缩略图下载走 `docs +media-download --type whiteboard`。
3. 内容查询和导出走 `lark-whiteboard`；按其当前 reference 使用 `whiteboard +export --output-type preview|svg|source|raw`，不要混用旧 `query` 命令的参数名。

### 创建与编辑

- 简单图：按 `lark-doc-whiteboard.md` 使用 `<whiteboard type="mermaid|plantuml|svg">` 创建。
- 空白画板：使用 `<whiteboard type="blank">`，但不得把空白占位当完成。
- 创建后从响应 `document.new_blocks[].block_token` 获取 token，再交给 `lark-whiteboard` 更新复杂内容。
- 已有画板必须复用原 token；复杂图或已有画板更新按 `lark-whiteboard` 工作流执行。
- `whiteboard +update` 复用同一 token 即可改写内容，`+export --output-type source` 可取回 mermaid/plantuml 源码，形成可编辑往返。判断画板是否真的被更新时对比导出源码或 preview 体积，不要只看 `ok=true`。
- `html_to_image` 只生成静态图，不能替代用户要求的可编辑画板。

## 嵌入资源路由

| 资源 | 路由 |
| --- | --- |
| 原生 table | `lark-doc` |
| sheet / spreadsheet | `lark-sheets` |
| bitable / Base | `lark-base` |
| whiteboard | `lark-doc` 提取 token，再 `lark-whiteboard` |
| 图片、附件 | `lark-doc` media shortcuts |
| Wiki 子树 | `lark-wiki` |
| 评论、权限、文件移动/复制/搜索 | `lark-drive` |

## 错误与重试

- CLI：以顶层 `ok` 判断成功；记录结构化 `error.type`、`error.code`、`message`、`hint` 和 `log_id`。
- MCP：业务错误可能被包装为 `code=500` 且 `result` 以 `An error occurred:` 开头；不能只判断外层 code。
- 限流：停止立即重试，按下游规则指数退避。
- revision 冲突：重新 fetch、重新诊断并基于最新 revision 生成补丁，不强行覆盖。
- 结果不明：先回读确认是否生效，再决定是否重试。
- `partial_success` 或非空 `warnings`：不得报告完全成功；列出未完成项并继续修复或明确降级。

## 完成检查

向用户报告前确认：

- 已读取所需最小范围，未把切片误报为全文。
- 文本、层级、原生表格和 token 化资源未静默丢失。
- 写入响应 `ok == true`，并检查 `result`、`warnings`、`tips`。
- 写入后已重新 fetch；结构变化后没有复用旧 block ID。
- MCP 降级限制已明确告知。
- 图片、大文件和画板按各自链路处理，没有用静态位图冒充可编辑画板。
