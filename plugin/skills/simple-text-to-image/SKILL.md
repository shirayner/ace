---
name: simple-text-to-image
description: "基础文生图。当用户想根据一段文字描述直接生成图片时使用。触发词：'生成一张...图片'、'画一张...'、'文生图'、'text to image'、'generate an image of...'、'draw/create a picture of...'。直接把用户给的文本当 prompt 出图，不做需求澄清、不提问、不分流。不适用于：编辑已有图片、图片格式转换、截图。"
---
# 基础文生图 Skill

把用户给的文本当 prompt，调用 `text_to_image.py` 直接出图。**不提问、不澄清、不组装模板。**

## 前置条件

鉴权方式由 `scripts/config.yaml` 的 `mode` 字段切换，两种后端互相隔离：

| mode | 说明 | 依赖 |
| --- | --- | --- |
| `peta`（默认） | 公司 peta AI 网关，用 `peta_key_id` + `appid` 换取临时密钥再请求 | `peta_ai_client` |
| `direct` | 固定密钥直连 OpenAI 兼容网关，用 `base_url` + `api_key` 直接请求 | 无（纯标准库 urllib） |

**无法安装 `peta_ai_client` 的机器**：把 `config.yaml` 里 `mode` 改成 `direct`，填好 `direct` 段即可，不会 import 任何第三方依赖。

配置来源优先级（高→低）：环境变量 `TEXT_TO_IMAGE_*` > `config.yaml` > 内置默认。

| 变量 | 用于 | 说明 |
| --- | --- | --- |
| `TEXT_TO_IMAGE_MODE` | 通用 | `peta` / `direct`，覆盖 config.yaml 的 mode |
| `TEXT_TO_IMAGE_PETA_KEY_ID` | peta | peta 密钥 ID |
| `TEXT_TO_IMAGE_APPID` | peta | PaaS 应用 appid |
| `TEXT_TO_IMAGE_BASE_URL` | direct | 网关 base_url（不含 `/v1/...`） |
| `TEXT_TO_IMAGE_API_KEY` | direct | 固定 api_key |
| `TEXT_TO_IMAGE_MODEL` | 通用 | 模型名（默认 `gpt-image-2`） |

## 流程

1. **取 prompt** —— 用户描述即 prompt，原样使用，不改写、不追问。
2. **定输出路径** —— 用户没指定就自动生成 `./images/{intent}-{timestamp}.png`：
   - `{intent}`：从描述提炼 2-4 个英文单词，kebab-case
   - `{timestamp}`：`date +%Y%m%d-%H%M%S`
   - 禁止用 `output.png`（会覆盖）；用户显式给了路径则原样用。
3. **生成** —— prompt 可能含 shell 特殊字符，**必须走 `--prompt-file`**，禁止把 prompt 作命令行位置参数：

   ```bash
   mkdir -p ./images/
   cat > /tmp/prompt.txt << 'PROMPT_EOF'
   [用户的文本描述，原样]
   PROMPT_EOF
   python "<skill_path>/scripts/text_to_image.py" --prompt-file /tmp/prompt.txt -o "./images/{intent}-{timestamp}.png" -s "<size>" -q "<quality>"
   ```

4. **报告** —— 成功告知保存路径；失败报错误。

## 参数默认

| 参数 | 默认 | 可选值 |
| --- | --- | --- |
| `-s` size | `1024x1024` | `1024x1024` / `1536x1024`(横) / `1024x1536`(竖) |
| `-q` quality | `auto` | `auto` / `low` / `medium` / `high` |

尺寸/质量用户没提就用默认；提了就传对应值。

## 错误处理

- 配置缺失 → 按当前 mode 提示：peta 缺 `TEXT_TO_IMAGE_PETA_KEY_ID` / `TEXT_TO_IMAGE_APPID`；direct 缺 `TEXT_TO_IMAGE_BASE_URL` / `TEXT_TO_IMAGE_API_KEY`。
- peta 依赖装不上 → 改用 direct 模式（config.yaml `mode: direct`）。
- 脚本内置 3 次指数退避重试；仍失败则报错，建议检查网络/配置。

## 依赖

- `peta` 模式：`peta_ai_client`（`uv pip install peta-ai-client --native-tls`）+ `PyYAML`。
- `direct` 模式：仅 `PyYAML`（`pip install pyyaml`），无其他第三方依赖。
