# simple-text-to-image skill

## 目标
从现有 text-to-image skill 派生一个极简版 skill,只保留"文本进 → 调模型出图"核心,砍掉全部对齐逻辑。

## 砍掉的
- 苏格拉底多维提问(必选维度/AskUserQuestion)
- 技术图 vs 通用图分流
- 智能追问(最多 2 轮)
- prompt 组装模板
- 批量多风格模式(--batch / run_batch)
- 风格档案汇报 / 关键词提取

## 保留的
- 单张生成 + 3 次指数退避重试
- --prompt-file(防 shell 特殊字符截断)
- -o / -s / -q(size/quality 可选,有默认)
- 环境变量 TEXT_TO_IMAGE_BASE_URL / API_KEY / MODEL(默认 gpt-image-2)
- 输出默认 ./images/,禁止 output.png 覆盖

## 完成标准
见 state.json completion_criteria。
