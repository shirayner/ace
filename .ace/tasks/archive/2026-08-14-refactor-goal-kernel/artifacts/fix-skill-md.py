"""一次性修补 SKILL.md：恢复标题前空行，并压缩到 6 KiB 预算内。

手工逐字节 Edit 反复挤掉了段落间的空行，把 markdown 结构弄坏了。
这里用脚本做，因为它能在一次原子写里同时保证「格式正确」和「字节达标」——
两个约束互相拉扯时，逐个 Edit 很容易修好一个又碰坏另一个。
"""

import io
import os

PATH = "plugin/skills/general/auto-goal-v3/SKILL.md"
BUDGET = 6 * 1024

REPLACEMENTS = [
    # 标题必须与正文有空行分隔，否则渲染成正文的一部分。
    ("Read `references/discover-align.md`。\n## 2",
     "Read `references/discover-align.md`。\n\n## 2"),
    # 细节已在对应 reference 中，SKILL 只保留判据。
    ("**写入面无交集只排除了文本冲突**，不能排除读到对方将改的 API、抢同一端口或外部环境。\n"
     "补一道语义检查：**A 的结果完全不同，B 的执行方式会变吗？**",
     "**写入面无交集只排除文本冲突**，不排除读到对方将改的 API、抢端口或外部环境。\n"
     "补语义检查：**A 的结果完全不同，B 的执行方式会变吗？**"),
    ("**永不空手而归**——任意时刻中断都应有可用产出。三次同向失败 → 停下质疑前提。",
     "**永不空手而归**——任意时刻中断都应有可用产出。三次同向失败 → 质疑前提。"),
    ("关闭是必要结束步骤，TaskUpdate completed ≠ 关闭。未关闭 = state.json 永远 in_progress，\n"
     "对话结束后无法补救。Terminal state = 此命令成功：",
     "关闭是必要结束步骤，TaskUpdate completed ≠ 关闭。未关闭 = state.json 永远 in_progress。\n"
     "Terminal state = 此命令成功："),
]

text = io.open(PATH, encoding="utf-8").read()
for old, new in REPLACEMENTS:
    if old not in text:
        raise SystemExit(f"pattern not found, file drifted:\n{old[:60]}...")
    text = text.replace(old, new)

encoded = text.encode("utf-8")
size = len(encoded)
if size > BUDGET:
    raise SystemExit(f"refusing write: {size} bytes exceeds {BUDGET}")

with io.open(PATH + ".tmp", "wb") as target:
    target.write(encoded)
os.replace(PATH + ".tmp", PATH)
print(f"bytes: {size} / {BUDGET}  (OK)")
