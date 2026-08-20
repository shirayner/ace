#!/usr/bin/env python3
"""goal.py — auto-goal-v3 的记账与契约 CLI。

**边界**：模型做语义判断，脚本守契约完整性。这是两件事。

脚本不判断"证据是否真的证明了标准"——那需要理解领域，是模型的工作。
但脚本必须机械保证验收对象本身不丢失、不重复、不漂移：criterion 集合非空、
ID 稳定唯一、verdict 与 criterion 双射、冻结后的标准文本未被改写。

上一版把"语义判断不进脚本"误读成了"契约完整性也不进脚本"，结果 accept-report
只数数组长度：0 条标准可以初始化，重复的 `id=999` 可以聚合成全 PASS。
门禁证明的是"存在若干条长得像 verdict 的 JSON"，不是"每条标准都被验过"。

零第三方依赖，仅标准库。
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

VERDICTS = ("PASS", "FAIL", "UNVERIFIABLE")

# 委派生命周期。顺序即状态机：每一步只能从前一步来。
#
# 一个布尔 `done` 无法区分"Controller 自己顺手改完了"和"派了 fresh subagent、
# 收了返回、Controller 复核过、又经独立审查"。这五档把那条阶梯拆成可机械检查的
# 相邻迁移，于是"每个实现任务必须委派"从一句自觉遵守的话变成了状态不可跳跃。
LIFECYCLE = ("planned", "dispatched", "returned", "verified", "reviewed")

# 依赖只需推进到"Controller 已验证"就能解锁下游：独立审查是关闭条件，不是产出条件。
# 等审查完再派下游只会拉长关键路径，而下游要的是产出，产出在 verified 时已在盘上。
DEPENDENCY_READY_STAGE = "verified"

# work item 的生命周期投影到 `ace` CLI 认识的扁平 status（真相源是 lifecycle）。
STATUS_OF_STAGE = {
    "planned": "pending",
    "dispatched": "in-progress",
    "returned": "in-progress",
    "verified": "in-progress",
    "reviewed": "done",
}

# subagent 的自评。它是声明不是证据，所以三值都不改变 lifecycle 的推进规则。
SELF_REPORTS = ("DONE", "PARTIAL", "BLOCKED")

REVIEW_VERDICTS = ("PASS", "FAIL")

# 资源面四类必须齐全：漏写一类等于声明"这里没有冲突"，而并行判据就建立在它上面。
RESOURCE_KINDS = ("reads", "writes", "external", "exclusive")

# 交付结论，与生命周期 status 正交：
#   status  = in_progress / completed —— 任务流程走到哪了（`ace task archive` 认这个）
#   outcome = completed / partial     —— 交付到什么程度（UNVERIFIABLE 存在时只能是 partial）
# 合并这两者就必须二选一：要么把 partial 谎报成 completed，要么为了诚实而放弃归档。
OUTCOMES = ("completed", "partial")

# Windows 控制台默认 GBK：'✓' 与中文会抛 UnicodeEncodeError，让每条命令都非零退出。
# 强制 UTF-8 输出，让脚本的行为不依赖宿主 code page。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # 被替换成非 TextIOWrapper 的流
        pass


# ─── 基础设施 ──────────────────────────────────────────────────────────────────

def now_iso():
    """与 src/core/task-utils.js 的 isoNow() 同格式（秒级精度 + Z）。"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def die(msg, code=1):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(code)


def task_dir(root, name):
    return os.path.join(root, ".ace", "tasks", name)


def state_path(root, name):
    return os.path.join(task_dir(root, name), "state.json")


def read_state(root, name):
    path = state_path(root, name)
    if not os.path.isfile(path):
        die(f"state.json not found: {path}\n  hint: run `goal.py init` first")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def write_state(root, name, state):
    """原子写：先写 .tmp 再 replace，避免中断留下半个 JSON。"""
    state["updated_at"] = now_iso()
    path = state_path(root, name)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, path)


def require_dir(root):
    if not os.path.isdir(root):
        die(f"--root is not a directory: {root}")
    return os.path.abspath(root)


# ─── criterion identity ───────────────────────────────────────────────────────

def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def freeze_criteria(texts):
    """把标准原文冻结成带稳定身份的条目。

    ID 由序号生成而非内容派生：措辞修正不应让一条标准变成"另一条标准"，
    而集合 hash 会照样变化并被 accept-report 拒绝——漂移可见，身份不变。
    """
    return [
        {"id": f"C{idx:03d}", "text": text, "text_sha256": sha256_text(text)}
        for idx, text in enumerate(texts, start=1)
    ]


def criteria_set_hash(criteria):
    """冻结集合的指纹。

    对 (id, text) 序列做规范化 JSON 后取 sha256。任何一条标准被改写、增删、
    重排都会改变它，于是 verifier 拿到的标准与 state 里的标准不再可能悄悄分家。
    """
    canonical = json.dumps(
        [{"id": c["id"], "text": c["text"]} for c in criteria],
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    )
    return sha256_text(canonical)


def load_criteria(state):
    """读出冻结的 criteria，并顺手校验它没被手改坏。"""
    criteria = state.get("criteria")
    if not isinstance(criteria, list) or not criteria:
        die("state.json 里没有冻结的 criteria\n"
            "  这个任务是旧格式（completion_criteria 无 ID）或初始化时丢了标准。\n"
            "  新目标 = 新目录：用 `goal.py init` 重新建，标准逐字来自 ALIGN 确认过的文本。")

    for item in criteria:
        if not isinstance(item, dict) or not item.get("id") or not str(item.get("text", "")).strip():
            die(f"criterion 结构损坏：{item!r}\n  每条必须有非空 id 与 text")
        if sha256_text(item["text"]) != item.get("text_sha256"):
            die(f"criterion {item['id']} 的文本与 text_sha256 不符\n"
                f"  标准被手改过。验收对象一旦漂移，之前的判定就不再指向同一件事。")

    recorded = state.get("criteria_sha256")
    actual = criteria_set_hash(criteria)
    if recorded != actual:
        die(f"criteria_sha256 与 criteria 内容不符\n"
            f"  state: {recorded}\n  实际:  {actual}\n"
            f"  标准集合被手改过——不要手写 state.json。")

    # completion_criteria 是 criteria 的投影，也是 `ace` CLI 与人类实际看到的那一份。
    # 只给冻结的一侧上 hash，投影就能被改写成谁也没验过的标准：所有门禁照常通过，
    # 而屏幕上显示的验收对象已经是另一套。这里拒绝而不静默重写——静默重写会把
    # 「有人动过验收对象」这件事抹掉，而那正是需要被看见的事。
    projection = [c["text"] for c in criteria]
    recorded_projection = state.get("completion_criteria")
    if recorded_projection != projection:
        die(f"completion_criteria 与冻结的 criteria 不符\n"
            f"  state: {recorded_projection!r}\n  应为:  {projection!r}\n"
            f"  投影只由 goal.py 派生，不手写。要改标准就是新目标 = 新目录。")
    return criteria


# ─── init ─────────────────────────────────────────────────────────────────────

def cmd_init(args):
    root = require_dir(args.root)
    tdir = task_dir(root, args.name)
    if os.path.exists(state_path(root, args.name)):
        die(f"task '{args.name}' already exists at {tdir}\n"
            f"  新目标 = 新目录，不要复用上一个")

    texts = [t.strip() for t in args.criteria if t and t.strip()]
    if not texts:
        # 零标准不是"稍后再补"，是把 VERIFY 阶段变成无对象的空转：
        # 没有标准，verifier 无从取证，而全 PASS 的空集合会满足任何门禁。
        die("至少需要一条 --criteria\n"
            "  没有完成标准 = 没有验收对象 = 门禁恒真。\n"
            "  标准逐字取自 ALIGN 里用户确认过的文本。")

    duplicates = sorted({t for t in texts if texts.count(t) > 1})
    if duplicates:
        die(f"完成标准重复：{duplicates}\n"
            f"  同一条标准出现两次，验收时无法区分是哪一条被验过")

    criteria = freeze_criteria(texts)
    os.makedirs(os.path.join(tdir, "artifacts"), exist_ok=True)

    stamp = now_iso()
    state = {
        "changeName": args.name,
        "type": "simple",
        "skillName": "auto-goal-v3",
        "status": "in_progress",
        "outcome": None,
        "created_at": stamp,
        "updated_at": stamp,
        "completed_at": None,
        "archived_at": None,
        "goal": args.goal,
        "criteria": criteria,
        "criteria_sha256": criteria_set_hash(criteria),
        # 兼容 `ace` CLI 与既有 state 消费者：它们读扁平的字符串数组。
        # 规范真相源是 criteria；这里是它的投影，永远由脚本派生，不手写。
        "completion_criteria": [c["text"] for c in criteria],
        "tasks": [],
        "simple": {"phase": "discover", "decisions": []},
    }
    write_state(root, args.name, state)

    context = os.path.join(tdir, "context.md")
    if not os.path.exists(context):
        lines = [f"# {args.name}", "", "## 目标", "", args.goal, "", "## 完成标准", ""]
        lines += [f"- [ ] {c['id']} {c['text']}" for c in criteria]
        lines += ["", "## 决策", "", "（见 state.json 的 simple.decisions）", "",
                  "## 中间结论", ""]
        with open(context, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")

    print(f"✓ initialized {os.path.relpath(tdir, root)}")
    for crit in criteria:
        print(f"  {crit['id']}  {crit['text']}")
    print(f"  criteria_sha256: {state['criteria_sha256']}")


# ─── criteria ─────────────────────────────────────────────────────────────────

def cmd_criteria(args):
    """打印冻结的标准。verifier prompt 直接引用它，避免手抄改写措辞。"""
    root = require_dir(args.root)
    state = read_state(root, args.name)
    criteria = load_criteria(state)

    if args.json:
        json.dump({"criteria_sha256": state["criteria_sha256"],
                   "criteria": [{"id": c["id"], "text": c["text"]} for c in criteria]},
                  sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return

    print(f"criteria_sha256: {state['criteria_sha256']}")
    for crit in criteria:
        print(f"{crit['id']}  {crit['text']}")


# ─── status ───────────────────────────────────────────────────────────────────

def cmd_status(args):
    root = require_dir(args.root)

    if args.name:
        names = [args.name]
    else:
        tasks_root = os.path.join(root, ".ace", "tasks")
        if not os.path.isdir(tasks_root):
            print("no .ace/tasks/ directory")
            return
        names = sorted(
            e for e in os.listdir(tasks_root)
            if e != "archive" and not e.startswith(".")
            and os.path.isfile(os.path.join(tasks_root, e, "state.json"))
        )
        if not names:
            print("no active tasks")
            return

    for name in names:
        state = read_state(root, name)
        phase = (state.get("simple") or {}).get("phase", "unknown")
        outcome = state.get("outcome")
        head = f"{name}  status={state.get('status')}  phase={phase}"
        if outcome:
            head += f"  outcome={outcome}"
        print(head)

        for crit in state.get("criteria") or []:
            print(f"  {crit.get('id')}  {crit.get('text')}")
        for task in state.get("tasks", []):
            dep = task.get("depends_on") or []
            suffix = f"  (depends: {', '.join(dep)})" if dep else ""
            # 显示 lifecycle 而非扁平 status：pending/done 分不出"没派"和"派了没审"。
            stage = task.get("lifecycle") or task.get("status") or "unknown"
            print(f"  [{stage}] {task.get('id')} {task.get('title')}{suffix}")

        verdicts = (state.get("accept") or {}).get("verdicts") or []
        if verdicts:
            tally = tally_of(verdicts)
            print("  accept: " + "  ".join(f"{k}={tally[k]}" for k in VERDICTS))


# ─── work graph：结构校验 ──────────────────────────────────────────────────────

def graph_items(state):
    return state.setdefault("tasks", [])


def find_item(state, item_id):
    item = next((t for t in graph_items(state) if t.get("id") == item_id), None)
    if item is None:
        known = ", ".join(t.get("id", "?") for t in graph_items(state)) or "(空图)"
        die(f"work item {item_id!r} 不在 Work Graph 里\n  已有 item：{known}\n"
            f"  hint: 用 `goal.py plan --from <plan.json>` 建图")
    return item


def require_text(item, field, where):
    value = item.get(field)
    if not isinstance(value, str) or not value.strip():
        die(f"{where}: 字段 '{field}' 必须是非空字符串，收到 {value!r}\n"
            f"  work item 的每个要件都是验收面的一部分，缺一个就少一处可判定的东西")
    return value.strip()


def require_str_list(item, field, where, allow_empty=True):
    value = item.get(field)
    if not isinstance(value, list):
        die(f"{where}: 字段 '{field}' 必须是数组，收到 {value!r}")
    for entry in value:
        if not isinstance(entry, str) or not entry.strip():
            die(f"{where}: '{field}' 的元素必须是非空字符串，收到 {entry!r}")
    if not allow_empty and not value:
        die(f"{where}: '{field}' 不能为空")
    return [entry.strip() for entry in value]


def normalize_resources(item, where):
    """校验资源面四类齐全。

    并行判据（无依赖边 且 资源不冲突）整个建立在这四个集合上，所以拼错一个键名
    不是笔误——它等于宣布"这一类资源我没有"，让两个真冲突的 item 看起来可并行。
    宁可在建图时报错，也不要在两个 agent 同时写一个文件时才发现。
    """
    resources = item.get("resources")
    if not isinstance(resources, dict):
        die(f"{where}: 字段 'resources' 必须是对象，收到 {resources!r}\n"
            f"  需要 {', '.join(RESOURCE_KINDS)} 四类")

    missing = [kind for kind in RESOURCE_KINDS if kind not in resources]
    unknown = [key for key in resources if key not in RESOURCE_KINDS]
    if missing or unknown:
        parts = []
        if missing:
            parts.append(f"缺少 {', '.join(missing)}")
        if unknown:
            parts.append(f"不认识 {', '.join(sorted(unknown))}")
        die(f"{where}: 'resources' 的键不对——{'；'.join(parts)}\n"
            f"  必须恰好是 {', '.join(RESOURCE_KINDS)}（可以为空数组，但不能省略）")

    return {kind: require_str_list(resources, kind, f"{where}.resources")
            for kind in RESOURCE_KINDS}


def detect_cycle(items):
    """返回一条依赖环（id 列表），无环则返回 None。

    迭代 DFS 而非递归：图由模型生成，深度不设上限，不想因为链太长而栈溢出。
    """
    edges = {item["id"]: list(item.get("depends_on") or []) for item in items}
    state = {}  # id → "open" 正在栈上 / "closed" 已完成

    for start in edges:
        if state.get(start):
            continue
        stack = [(start, iter(edges[start]))]
        path = [start]
        state[start] = "open"
        while stack:
            node, children = stack[-1]
            found = next((c for c in children if c in edges), None)
            if found is None:
                state[node] = "closed"
                stack.pop()
                path.pop()
                continue
            if state.get(found) == "open":
                return path[path.index(found):] + [found]
            if state.get(found) == "closed":
                continue
            state[found] = "open"
            path.append(found)
            stack.append((found, iter(edges[found])))
    return None


def validate_graph_structure(items, criteria, where):
    """校验图本身，返回未被任何 item 覆盖的 criterion id。

    plan 与 done 都调用它：plan 时是建图门禁，done 时是**重新推导**——
    否则手改 state.json 就能把环、悬空依赖、未知 criterion 带进已通过的图。
    """
    if not isinstance(items, list) or not items:
        die(f"{where}: 'items' 至少需要一个 work item\n"
            f"  空 Work Graph = 没有工作单元 = 没有委派对象。\n"
            f"  没有数量下限，但不能是零：一个原子任务的图是合法的。")

    known_criteria = {c["id"] for c in criteria}
    seen_ids = {}
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            die(f"{where}: item #{index} 必须是对象，收到 {item!r}")
        item_id = require_text(item, "id", f"{where}: item #{index}")
        if item_id in seen_ids:
            die(f"{where}: work item id {item_id!r} 出现多次\n"
                f"  id 必须唯一标识一个 item，否则派发与验证记在谁头上是不确定的")
        seen_ids[item_id] = item

        scope = f"{where}: item {item_id}"
        require_text(item, "title", scope)
        require_text(item, "output", scope)
        require_text(item, "acceptance", scope)
        normalize_resources(item, scope)
        require_str_list(item, "depends_on", scope)

        criterion_ids = require_str_list(item, "criterion_ids", scope, allow_empty=False)
        if not criterion_ids:
            die(f"{scope}: 'criterion_ids' 不能为空\n"
                f"  不推进任何冻结标准的 item，要么是漏了标准，要么是范围外的工作。\n"
                f"  两种都该在建图时发现，而不是等验收时发现没人验它。")
        unknown = [cid for cid in criterion_ids if cid not in known_criteria]
        if unknown:
            die(f"{scope}: 未知 criterion_id {', '.join(unknown)}\n"
                f"  已冻结的 ID：{', '.join(sorted(known_criteria))}")

    for item_id, item in seen_ids.items():
        for dep in item.get("depends_on") or []:
            if dep == item_id:
                die(f"{where}: item {item_id} 依赖自己\n  自环不是依赖，是打字错误")
            if dep not in seen_ids:
                die(f"{where}: item {item_id} 依赖不存在的 {dep}\n"
                    f"  已有 item：{', '.join(sorted(seen_ids))}")

    cycle = detect_cycle(list(seen_ids.values()))
    if cycle:
        die(f"{where}: 依赖成环：{' → '.join(cycle)}\n"
            f"  环上没有一个 item 能先开始，整个环永远 not ready")

    covered = {cid for item in items for cid in item["criterion_ids"]}
    return sorted(known_criteria - covered)


# ─── work graph：生命周期 ──────────────────────────────────────────────────────

def stage_of(item):
    stage = item.get("lifecycle")
    if stage not in LIFECYCLE:
        die(f"work item {item.get('id')!r} 的 lifecycle 为 {stage!r}，不是合法状态\n"
            f"  只能是 {' → '.join(LIFECYCLE)}\n"
            f"  自造状态名多半是手改 state.json 的结果——规范状态只由 goal.py 写")
    return stage


def require_stage(item, expected, action):
    """状态机的全部严格性所在：一步只能从它的前一步来。"""
    stage = stage_of(item)
    if stage != expected:
        die(f"work item {item['id']} 当前 lifecycle={stage}，"
            f"`{action}` 只能作用于 {expected}\n"
            f"  合法顺序：{' → '.join(LIFECYCLE)}\n"
            f"  不能跳级：跳过的那一步就是没人做过的那一步")


def stage_index(stage):
    return LIFECYCLE.index(stage)


def identity_field(record, field):
    """身份字段的规范形：可比较、可哈希。

    手改的 state.json 能把任何 JSON 类型塞进 agent/invocation，所以先归一再比较。
    字符串顺手 strip——空白不该成为洗掉身份的办法（" inv-1" 与 "inv-1" 是同一次调用）。
    """
    value = record.get(field)
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def identity_records(item):
    """item 上每一条带身份的记录，形如 (role, record)，同一条不重复出现。

    `independent_review` 是 `review_history` 末条的镜像——同一次审查被存了两处，
    不是两次运行，所以按 (role, agent, invocation) 去重让镜像收敛为一条。
    而被手改过的镜像与它的历史条目不再一致，于是它会以"多出来的一条记录"现形，
    这正是需要被看见的形态。
    """
    candidates = [("implementer", record) for record in
                  list(item.get("delegation_history") or []) + [item.get("delegation")]]
    candidates += [("reviewer", record) for record in
                   list(item.get("review_history") or []) + [item.get("independent_review")]]

    seen, records = set(), []
    for role, record in candidates:
        if not isinstance(record, dict) or not record:
            continue
        key = (role, identity_field(record, "agent"), identity_field(record, "invocation"))
        if key in seen:
            continue
        seen.add(key)
        records.append((role, record))
    return records


def identity_pool(items):
    """图中已用过的身份：(实现者 agent 集合, 审查者 agent 集合, 全部 invocation 集合)。

    包含历史记录：被 FAIL 烧掉的那次调用已经发生过，它的身份不能被第二次使用。
    """
    impl_agents, review_agents, invocations = set(), set(), set()
    for item in items:
        for role, record in identity_records(item):
            agents = impl_agents if role == "implementer" else review_agents
            agents.add(identity_field(record, "agent"))
            invocations.add(identity_field(record, "invocation"))
    return impl_agents, review_agents, invocations


def burnt_implementers(item):
    """在这个 item 上已经交过活、又被 FAIL 掉的实现者身份。

    FAIL 的处理注释说"修复不交给已声称过 DONE 的原 agent"，但只写在注释里的规则
    不会拦住任何东西。它归到这里，于是"换个 fresh subagent"是被检查的，不是被自觉的。
    这是 per-item 的：同一个 agent 实现图上别的 item 完全合法。
    """
    return {identity_field(record, "agent")
            for record in item.get("delegation_history") or []
            if isinstance(record, dict) and record}


def item_is_untouched(item):
    """这个 item 是否还没发生过任何事——整图重建的唯一合法前提。

    只看 lifecycle 不够：review FAIL 把 item 打回 planned，于是"没人推进过"这个判据
    恰好在图里带着 FAIL 时为真，而重建会连 FAIL、连被烧掉的身份一起洗掉。
    """
    return (item.get("lifecycle") == "planned"
            and not identity_records(item)
            and not item.get("controller_verification"))


def require_identity(args, role):
    agent = (args.agent or "").strip()
    invocation = (args.invocation or "").strip()
    if not agent:
        die(f"--agent 不能为空（{role} 的 agent 身份）\n"
            f"  没有身份的委派记录无法证明它派给了谁")
    if not invocation:
        die(f"--invocation 不能为空（{role} 的调用身份）\n"
            f"  invocation 标识一次具体调用，是「fresh subagent」这句话唯一可记账的部分")
    return agent, invocation


def new_item(payload):
    """把 plan 里的一条声明变成带生命周期的 work item 记录。"""
    return {
        "id": payload["id"].strip(),
        "title": payload["title"].strip(),
        "output": payload["output"].strip(),
        "acceptance": payload["acceptance"].strip(),
        "criterion_ids": [cid.strip() for cid in payload["criterion_ids"]],
        "depends_on": [dep.strip() for dep in payload["depends_on"]],
        "resources": {kind: [entry.strip() for entry in payload["resources"][kind]]
                      for kind in RESOURCE_KINDS},
        "lifecycle": "planned",
        "status": STATUS_OF_STAGE["planned"],
        "delegation": None,
        "controller_verification": None,
        "independent_review": None,
        "delegation_history": [],
        "review_history": [],
    }


def set_stage(item, stage):
    item["lifecycle"] = stage
    item["status"] = STATUS_OF_STAGE[stage]


# ─── plan ─────────────────────────────────────────────────────────────────────

def cmd_plan(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    criteria = load_criteria(state)

    payload = load_report(args.getattr_from)
    if not isinstance(payload, dict):
        die(f"{args.getattr_from}: 顶层必须是对象 {{\"items\": [...]}}")
    items = payload.get("items")
    uncovered = validate_graph_structure(items, criteria, args.getattr_from)

    # 整图重建只在处女图上合法。判据不能是 lifecycle=="planned"：review FAIL 会把
    # item 打回 planned，于是这道门恰好在图里带着 FAIL 时敞开，而重建会用空历史
    # 重发这个 item——FAIL 与被烧掉的身份一起消失，修复可以再派给声称过 DONE 的人。
    touched = [t.get("id") for t in graph_items(state) if not item_is_untouched(t)]
    if touched:
        die(f"已有 item 发生过委派或审查，不能整图重建：{', '.join(touched)}\n"
            f"  重建会连带丢掉它们的委派与审查记录（含 FAIL 与已烧掉的调用身份），\n"
            f"  那些是已经发生过的事实。\n"
            f"  要改图先把在途 item 走完，或换新目标 = 新目录。")

    state["tasks"] = [new_item(item) for item in items]
    write_state(root, args.name, state)

    print(f"✓ work graph: {len(items)} item(s)")
    for item in state["tasks"]:
        dep = f"  (depends: {', '.join(item['depends_on'])})" if item["depends_on"] else ""
        print(f"  [{item['lifecycle']}] {item['id']} {item['title']}"
              f"  →{','.join(item['criterion_ids'])}{dep}")
    if uncovered:
        # 不拦——建图可以分批。但必须现在说出来，因为 done 会因为它而拒绝关闭。
        print(f"⚠ 以下标准还没有任何 item 覆盖：{', '.join(uncovered)}\n"
              f"  要么补 item，要么它本来就不该是标准。done 会拒绝覆盖不全的图。",
              file=sys.stderr)


# ─── dispatch / collect / verify / review ─────────────────────────────────────

def cmd_dispatch(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    criteria = load_criteria(state)
    item = find_item(state, args.id)
    require_stage(item, "planned", "dispatch")
    agent, invocation = require_identity(args, "implementer")

    # 依赖门禁要按 id 索引整张图，所以先重新推导图本身：手改进来的悬空依赖
    # 在索引时会变成 KeyError，而 Traceback 既不是诊断，也不告诉人该怎么修。
    items = graph_items(state)
    validate_graph_structure(items, criteria, f"{state_path(root, args.name)} → tasks")

    by_id = {t["id"]: t for t in items}
    not_ready = [dep for dep in item["depends_on"]
                 if stage_index(stage_of(by_id[dep])) < stage_index(DEPENDENCY_READY_STAGE)]
    if not_ready:
        detail = ", ".join(f"{dep}={stage_of(by_id[dep])}" for dep in not_ready)
        die(f"{item['id']} 的依赖还没到 {DEPENDENCY_READY_STAGE}：{detail}\n"
            f"  依赖是信息依赖：产出没落盘也没被 Controller 复核过，"
            f"下游只能拿到猜测。")

    _, review_agents, invocations = identity_pool(items)
    if invocation in invocations:
        die(f"invocation {invocation!r} 已被用过\n"
            f"  每个 item 派一个 fresh subagent，就意味着每个 item 一个新的调用身份。\n"
            f"  复用它等于声明这两个 item 是同一次运行。")
    if agent in review_agents:
        die(f"agent {agent!r} 已在本图中充当过审查者\n"
            f"  实现者与审查者必须是不同身份，否则复审面就是自己看自己。")
    if agent in burnt_implementers(item):
        die(f"agent {agent!r} 在本 item 上已经交过一轮并被审查 FAIL\n"
            f"  修复要派 fresh subagent：原 agent 已经声称过 DONE，"
            f"它会倾向于论证 reviewer 判错了，而不是重看证据。")

    item["delegation"] = {
        "agent": agent,
        "invocation": invocation,
        "dispatched_at": now_iso(),
        "self_report": None,
        "summary": None,
        "returned_at": None,
    }
    set_stage(item, "dispatched")
    write_state(root, args.name, state)
    print(f"✓ {item['id']} dispatched → agent={agent} invocation={invocation}")


def cmd_collect(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    load_criteria(state)
    item = find_item(state, args.id)
    require_stage(item, "dispatched", "collect")

    summary = args.summary.strip()
    if not summary:
        die("--summary 不能为空\n  没有返回摘要 = 没有可核对的声明")

    item["delegation"].update({
        "self_report": args.self_report,
        "summary": summary,
        "returned_at": now_iso(),
    })
    set_stage(item, "returned")
    write_state(root, args.name, state)
    print(f"✓ {item['id']} returned  self_report={args.self_report}")
    # 自评是声明不是证据，所以它不改变状态机——三值都停在 returned 等 Controller 复核。
    if args.self_report != "DONE":
        print(f"  {args.self_report}：先判是卡在环境还是卡在语义，"
              f"语义类回 DISCOVER 补问，不要让 agent 再试一次", file=sys.stderr)


def cmd_verify(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    load_criteria(state)
    item = find_item(state, args.id)
    require_stage(item, "returned", "verify")

    evidence = args.evidence.strip()
    if not evidence:
        die("--evidence 不能为空\n  无证据的复核只是把 subagent 的声明重说一遍")

    item["controller_verification"] = {"evidence": evidence, "verified_at": now_iso()}
    set_stage(item, "verified")
    write_state(root, args.name, state)
    print(f"✓ {item['id']} verified by controller")


def cmd_review(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    load_criteria(state)
    item = find_item(state, args.id)
    require_stage(item, "verified", "review")
    agent, invocation = require_identity(args, "reviewer")

    evidence = args.evidence.strip()
    if not evidence:
        die("--evidence 不能为空\n  无证据的审查不是审查")

    items = graph_items(state)
    impl_agents, _, invocations = identity_pool(items)
    delegation = item.get("delegation") or {}
    # 两道检查，后者涵盖前者。先报本 item 的自审，因为"你在审自己刚写的东西"
    # 比"你在本图里实现过 item"更接近人当下做错的那件事。
    if agent == delegation.get("agent"):
        die(f"agent {agent!r} 是本 item 的实现者，不能同时充当审查者\n"
            f"  修复者即审查者会失去独立复审面：它知道自己的意图，"
            f"会不自觉地用意图补全证据的缺口。")
    if agent in impl_agents:
        die(f"agent {agent!r} 在本图中实现过 item，不能充当审查者\n"
            f"  实现者与审查者的身份集合必须不相交")
    if invocation in invocations:
        die(f"invocation {invocation!r} 已被用过\n"
            f"  独立审查是一次独立调用；复用调用身份等于把审查记在别人的运行上。")

    record = {
        "agent": agent,
        "invocation": invocation,
        "verdict": args.verdict,
        "evidence": evidence,
        "reviewed_at": now_iso(),
    }
    item.setdefault("review_history", []).append(record)

    if args.verdict == "PASS":
        item["independent_review"] = record
        set_stage(item, "reviewed")
        write_state(root, args.name, state)
        print(f"✓ {item['id']} reviewed  agent={agent} verdict=PASS")
        return

    # FAIL 不是"记个问题继续走"：这个 item 回到 planned，要重新派 fresh subagent。
    # 修复不交给已声称过 DONE 的原 agent —— 它会倾向于论证 verifier 判错了。
    item["delegation_history"] = list(item.get("delegation_history") or [])
    if item.get("delegation"):
        item["delegation_history"].append(item["delegation"])
    item["delegation"] = None
    item["controller_verification"] = None
    item["independent_review"] = None
    set_stage(item, "planned")
    write_state(root, args.name, state)
    print(f"✗ {item['id']} review FAIL —— 已回退到 planned，需重新派 fresh subagent\n"
          f"  {evidence}", file=sys.stderr)
    sys.exit(2)


# ─── graph ────────────────────────────────────────────────────────────────────

def cmd_graph(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    criteria = load_criteria(state)
    items = graph_items(state)

    known = {c["id"] for c in criteria}
    covered = {cid for item in items for cid in item.get("criterion_ids") or []}
    uncovered = sorted(known - covered)

    if args.json:
        json.dump({"items": items, "uncovered_criterion_ids": uncovered},
                  sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return

    if not items:
        print("work graph 为空——用 `goal.py plan --from <plan.json>` 建图")
    for item in items:
        print(f"[{item.get('lifecycle')}] {item.get('id')} {item.get('title')}")
        print(f"    output: {item.get('output')}")
        print(f"    criteria: {', '.join(item.get('criterion_ids') or [])}"
              f"    depends_on: {', '.join(item.get('depends_on') or []) or '-'}")
        delegation = item.get("delegation") or {}
        if delegation:
            print(f"    delegation: agent={delegation.get('agent')} "
                  f"invocation={delegation.get('invocation')} "
                  f"self_report={delegation.get('self_report')}")
        review = item.get("independent_review") or {}
        if review:
            print(f"    review: agent={review.get('agent')} verdict={review.get('verdict')}")
    if uncovered:
        print(f"⚠ 未覆盖的标准：{', '.join(uncovered)}", file=sys.stderr)


# ─── accept-report ────────────────────────────────────────────────────────────

def tally_of(verdicts):
    """始终从 verdicts 现算。存下来的 tally 只是展示用的缓存，不是判定依据。"""
    return {v: sum(1 for item in verdicts if item.get("verdict") == v) for v in VERDICTS}


def load_report(path):
    if not os.path.isfile(path):
        die(f"--from file not found: {path}")
    with open(path, encoding="utf-8") as fh:
        try:
            return json.load(fh)
        except json.JSONDecodeError as exc:
            die(f"{path} is not valid JSON: {exc}\n"
                f"  verifier 必须返回严格 JSON，见 references/verify-close.md")


def validate_bijection(payload, criteria, recorded_hash, path):
    """校验 verdicts 与冻结 criteria 一一对应。

    这是本脚本唯一的"严格"所在，也是全部价值所在。检查顺序按诊断精度排：
    先确认验的是同一套标准（hash），再确认每条标准恰好被验一次（双射）。
    """
    reported_hash = payload.get("criteria_sha256")
    if not reported_hash:
        die(f"{path}: 缺少 criteria_sha256\n"
            f"  verifier 必须回显它拿到的标准集合指纹，否则无法确认它验的是当前这套标准。\n"
            f"  用 `goal.py criteria --json` 取，见 references/verify-close.md")
    if reported_hash != recorded_hash:
        die(f"{path}: criteria_sha256 不符——verifier 验的不是当前冻结的标准\n"
            f"  报告: {reported_hash}\n  state: {recorded_hash}\n"
            f"  要么 verifier 拿到的是旧标准，要么标准在验收后被改过。两种都不能接受。")

    verdicts = payload.get("verdicts")
    if not isinstance(verdicts, list) or not verdicts:
        die(f"{path}: 'verdicts' must be a non-empty array")

    known = {c["id"] for c in criteria}
    seen = {}
    for item in verdicts:
        if not isinstance(item, dict):
            die(f"{path}: verdict 必须是对象，收到 {item!r}")

        cid = item.get("criterion_id")
        if not cid:
            die(f"{path}: verdict 缺少 criterion_id：{item!r}\n"
                f"  按数组位置对齐标准的旧格式已废弃——错位和重复都无法被发现。\n"
                f"  每条判定必须写明它判的是哪个 criterion。")
        if cid not in known:
            die(f"{path}: 未知 criterion_id {cid!r}\n"
                f"  已冻结的 ID：{', '.join(sorted(known))}")
        if cid in seen:
            die(f"{path}: criterion_id {cid!r} 出现多次\n"
                f"  一条标准只能有一条判定。重复意味着某条标准没人验，"
                f"而它的位置被另一条的判定占了。")
        seen[cid] = item

        verdict = item.get("verdict")
        if verdict not in VERDICTS:
            die(f"{path}: {cid} 的 verdict 为 {verdict!r}；"
                f"只能是 {', '.join(VERDICTS)} 之一")
        if not str(item.get("evidence", "")).strip():
            die(f"{path}: {cid} 没有 evidence\n  无证据的判定不是判定")

    missing = sorted(known - set(seen))
    if missing:
        die(f"{path}: 以下标准没有判定：{', '.join(missing)}\n"
            f"  逐条判定，不合并、不增删、不跳过")

    # 按冻结顺序返回，让报告顺序与 ALIGN 时展示给用户的顺序一致。
    return [seen[c["id"]] for c in criteria]


def cmd_accept_report(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    criteria = load_criteria(state)
    payload = load_report(args.getattr_from)
    verdicts = validate_bijection(payload, criteria, state["criteria_sha256"], args.getattr_from)

    tally = tally_of(verdicts)
    state["accept"] = {
        "reported_at": now_iso(),
        "criteria_sha256": state["criteria_sha256"],
        "verdicts": verdicts,
        "tally": tally,
        "notes": payload.get("notes", ""),
    }
    write_state(root, args.name, state)

    text_of = {c["id"]: c["text"] for c in criteria}
    report = os.path.join(task_dir(root, args.name), "artifacts", "accept-report.md")
    os.makedirs(os.path.dirname(report), exist_ok=True)
    lines = [f"# 验收报告 — {args.name}", "",
             f"生成时间：{state['accept']['reported_at']}",
             f"标准集合指纹：`{state['criteria_sha256']}`", "",
             "| 标准 | 判定 | 内容 | 证据 |", "|---|---|---|---|"]
    for item in verdicts:
        cid = item["criterion_id"]
        crit = text_of[cid].replace("|", "\\|")
        evidence = str(item.get("evidence", "")).replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {cid} | {item['verdict']} | {crit} | {evidence} |")
    lines += ["", "## 汇总", "", "  ".join(f"{k}={tally[k]}" for k in VERDICTS)]
    if payload.get("notes"):
        lines += ["", "## verifier 附注", "", str(payload["notes"])]
    with open(report, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(f"✓ report → {os.path.relpath(report, root)}")
    print("  " + "  ".join(f"{k}={tally[k]}" for k in VERDICTS))

    # 机械门禁：字符串比较，不是判断。
    if tally["FAIL"]:
        print(f"✗ {tally['FAIL']} FAIL —— 修复后重新完整验收，不得声称完成", file=sys.stderr)
        sys.exit(2)
    if tally["UNVERIFIABLE"]:
        print(f"⚠ {tally['UNVERIFIABLE']} UNVERIFIABLE —— 能补证据就补；"
              f"补不出则以 `done --accept-partial` 如实交付为 partial")


# ─── done ─────────────────────────────────────────────────────────────────────

def find_ace():
    for candidate in ("ace", "ace.cmd", "ace.exe"):
        found = shutil.which(candidate)
        if found:
            return found
    return None


def require_record(item, field, label, fields):
    """校验一条委派/验证/审查记录存在，且每个必要字段是非空字符串。

    `done` 不接受"字段在那儿"作为证据——空字符串的 agent 和缺失的 agent 是同一件事。
    """
    record = item.get(field)
    if not isinstance(record, dict) or not record:
        die(f"work item {item['id']} 的 lifecycle=reviewed，却没有{label}记录（{field}=None）\n"
            f"  状态说这件事发生过，记录说它没有。两者矛盾时相信记录。\n"
            f"  这是手改 state.json 的典型痕迹——规范状态只由 goal.py 写。")
    for name in fields:
        value = record.get(name)
        if not isinstance(value, str) or not value.strip():
            die(f"work item {item['id']} 的{label}记录里 '{name}' 为空（{value!r}）\n"
                f"  lifecycle 断言这一步走完过，而这个字段是那一步唯一的产物。\n"
                f"  空字段不是记录：它无法证明这件事发生过、由谁做的。")
    return record


def validate_identity_disjointness(items):
    """重新推导图级身份约束：角色集合不相交 + invocation 全局唯一。

    per-item 的一对比较看不见跨 item 的洗白：W1 的审查者可以是 W2 的实现者，两个 item
    可以共用一个 invocation——每个 item 自己那一对都还是不同的，而"每个 item 一个 fresh
    subagent"与"审查独立于实现"两句话都已经不成立。
    dispatch/review 在写入时本来就是按全图检查的，所以这里是同一条判据的重新推导。

    两条约束的强度不同，因为它们说的不是一件事：agent 要的是角色不相交（一个身份不能
    既实现又审查），invocation 要的是全局唯一（一次调用只能是一件工作）。所以同一个
    独立审查者审多个 item 合法——独立性是角色关系，不是人头数。
    """
    impl_agents, review_agents, _ = identity_pool(items)
    both_roles = sorted(impl_agents & review_agents)
    if both_roles:
        die(f"以下 agent 在本图中既实现又审查：{', '.join(both_roles)}\n"
            f"  实现者与审查者的身份集合必须不相交，否则复审面就是自己看自己——\n"
            f"  执行者知道自己的意图，会用意图补全证据的缺口。\n"
            f"  跨 item 也算：审查自己参与建的图不是独立审查。")

    users = {}  # invocation → 用过它的 item id（同一 item 用两次会出现两次）
    for item in items:
        for _role, record in identity_records(item):
            users.setdefault(identity_field(record, "invocation"), []).append(item["id"])
    shared = sorted(inv for inv, ids in users.items() if len(ids) > 1)
    if shared:
        detail = "；".join(f"{inv} ← {', '.join(users[inv])}" for inv in shared)
        die(f"以下 invocation 被用过多次：{detail}\n"
            f"  invocation 标识一次具体调用。复用它就是声明那些工作是同一次运行，\n"
            f"  而「每个 item 一个 fresh subagent、审查是独立一次调用」都因此不成立。")


def validate_item_lifecycle_records(item):
    """重新推导一个 reviewed item 的记录完整性：每一步都留下了它自己的产物。

    lifecycle=reviewed 是对五步都走过的断言，所以五步各自的产物都要在盘上。
    """
    # dispatch 写 agent/invocation，collect 写 summary/returned_at/self_report。
    # 只校验前一半，一个手改出来的 reviewed item 就能声称"派出去过、复核过"，
    # 而没有任何记录说 subagent 回来过——被跳过的恰好是产出落盘的那一步。
    delegation = require_record(item, "delegation", "委派",
                               ("agent", "invocation", "summary", "returned_at"))
    report = delegation.get("self_report")
    if report not in SELF_REPORTS:
        die(f"work item {item['id']} 的委派记录里 self_report={report!r}，"
            f"不是 {', '.join(SELF_REPORTS)} 之一\n"
            f"  lifecycle=reviewed 断言它经过了 returned，而 returned 的内容就是这份自评。\n"
            f"  没有自评说明 subagent 没回来过，或者这一步是手写进去的。")

    require_record(item, "controller_verification", "Controller 验证", ("evidence",))
    review = require_record(item, "independent_review", "独立审查",
                            ("agent", "invocation", "evidence"))
    if review.get("verdict") != "PASS":
        die(f"work item {item['id']} 的独立审查 verdict={review.get('verdict')!r}，不是 PASS\n"
            f"  非 PASS 的审查不能关闭 item：修好后重新走一遍派发与审查")


def validate_graph_closable(state, criteria):
    """done 的图门禁：重新推导，不信任任何已存结论。

    plan 时校验过的东西这里全部再校验一遍——因为 state.json 是一个文件，
    而文件可以被改。已通过的门禁不构成"现在仍然通过"的证据。
    """
    items = graph_items(state)
    where = "state.json → tasks"
    uncovered = validate_graph_structure(items, criteria, where)
    if uncovered:
        die(f"以下冻结标准没有任何 work item 覆盖：{', '.join(uncovered)}\n"
            f"  没有 item 推进它 = 没人做过它 = 它不可能达成。\n"
            f"  要么补 item 并走完生命周期，要么它本来就不该是标准（那要重新对齐）。")

    unfinished = [f"{item['id']}={stage_of(item)}" for item in items
                  if stage_of(item) != "reviewed"]
    if unfinished:
        die(f"以下 work item 还没走到 reviewed：{', '.join(unfinished)}\n"
            f"  完整生命周期：{' → '.join(LIFECYCLE)}\n"
            f"  未走完的 item 意味着它的产出没有经过独立审查，不能计入交付。")

    for item in items:
        validate_item_lifecycle_records(item)
    validate_identity_disjointness(items)
    return items


def cmd_done(args):
    root = require_dir(args.root)
    state = read_state(root, args.name)
    criteria = load_criteria(state)

    # 图门禁在验收报告之前：报告全 PASS 也不能替代"工作真的被委派并审查过"。
    # 顺序按诊断精度排——"没人做过 C002" 比 "C002 的证据不足" 更接近根因。
    items = validate_graph_closable(state, criteria)

    accept = state.get("accept")
    if not accept:
        die("no accept report on record\n"
            "  先派独立 verifier 取证并跑 `goal.py accept-report`，见 references/verify-close.md")

    # 重新校验，不信任 state 里存着的结论：手改 tally 或事后改标准都必须在这里被抓住。
    verdicts = validate_bijection(
        {"criteria_sha256": accept.get("criteria_sha256"), "verdicts": accept.get("verdicts")},
        criteria, state["criteria_sha256"], f"{state_path(root, args.name)} → accept",
    )
    tally = tally_of(verdicts)
    if tally != accept.get("tally"):
        print(f"⚠ state 里的 tally 与 verdicts 不符，按 verdicts 重算："
              f"{'  '.join(f'{k}={tally[k]}' for k in VERDICTS)}", file=sys.stderr)

    if tally["FAIL"]:
        die(f"{tally['FAIL']} criterion(s) FAIL —— 修复并重新验收后才能归档")

    if tally["UNVERIFIABLE"]:
        if not args.accept_partial:
            die(f"{tally['UNVERIFIABLE']} criterion(s) UNVERIFIABLE —— 不能作为完整交付归档\n"
                f"  能补证据就补完重验；确实补不出，用 --accept-partial 归档为 partial，\n"
                f"  并在向用户报告时说清哪条无法验证、为什么。")
        outcome = "partial"
    else:
        outcome = "completed"

    state["outcome"] = outcome
    state["accept"]["tally"] = tally
    write_state(root, args.name, state)

    ace = find_ace()
    if ace is None:
        die("`ace` CLI not found on PATH\n"
            "  归档必须走 `ace task done`（它维护 archive 目录布局与 archived_at）。\n"
            "  不做降级：手工挪目录会让 state.json 与磁盘失配。")

    # ace task 用 process.cwd() 作项目根，所以必须在 root 下执行。
    result = subprocess.run([ace, "task", "done", args.name], cwd=root)
    if result.returncode != 0:
        die(f"`ace task done {args.name}` exited {result.returncode} —— 归档门禁未通过")

    print(f"✓ archived '{args.name}'  outcome={outcome}")
    if outcome == "partial":
        print("  以 PARTIAL 交付：向用户报告时必须点明哪条标准未能验证及原因")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def build_parser():
    parser = argparse.ArgumentParser(
        prog="goal.py",
        description="auto-goal-v3 记账 CLI（模型做语义判断，脚本守契约完整性）")
    subs = parser.add_subparsers(dest="cmd", required=True)

    def with_root(sub, name_required=True):
        sub.add_argument("--root", required=True, help="项目根绝对路径")
        sub.add_argument("--name", required=name_required, help="changeName（kebab-case）")
        return sub

    init = with_root(subs.add_parser("init", help="建任务目录与 state.json，冻结完成标准"))
    init.add_argument("--goal", required=True, help="一句话目标")
    init.add_argument("--criteria", action="append", default=[],
                      help="完成标准，至少一条、可重复；与 ALIGN 展示给用户的逐字一致")
    init.set_defaults(func=cmd_init)

    criteria = with_root(subs.add_parser("criteria", help="打印冻结的标准与集合指纹"))
    criteria.add_argument("--json", action="store_true", help="输出 JSON，供 verifier prompt 引用")
    criteria.set_defaults(func=cmd_criteria)

    status = with_root(subs.add_parser("status", help="读任务状态"), name_required=False)
    status.set_defaults(func=cmd_status)

    # Work Graph 一次成图：单条命令逐个 `--depends` 追加的旧形态无法在建图时
    # 校验覆盖与成环——那些是整图属性，看一个 item 看不出来。
    plan = with_root(subs.add_parser("plan", help="从 JSON 建 Work Graph 并校验整图"))
    plan.add_argument("--from", dest="getattr_from", required=True,
                      help='{"items": [{id, title, output, acceptance, criterion_ids, '
                           'depends_on, resources:{reads,writes,external,exclusive}}]}')
    plan.set_defaults(func=cmd_plan)

    graph = with_root(subs.add_parser("graph", help="打印 Work Graph 与各 item 生命周期"))
    graph.add_argument("--json", action="store_true", help="输出 JSON")
    graph.set_defaults(func=cmd_graph)

    # 生命周期四步各自一个子命令，而非 `--status <任意值>`：
    # 一个能接受终态的开关等于一条绕过所有中间门禁的捷径。
    dispatch = with_root(subs.add_parser("dispatch", help="派 fresh subagent：planned → dispatched"))
    dispatch.add_argument("id", help="work item id")
    dispatch.add_argument("--agent", required=True, help="subagent 类型/名称")
    dispatch.add_argument("--invocation", required=True,
                          help="本次调用的唯一身份（每个 item 一个 fresh subagent = 一个新 invocation）")
    dispatch.set_defaults(func=cmd_dispatch)

    collect = with_root(subs.add_parser("collect", help="收 subagent 返回：dispatched → returned"))
    collect.add_argument("id", help="work item id")
    collect.add_argument("--self-report", required=True, choices=list(SELF_REPORTS),
                         help="subagent 自评（是声明，不是证据）")
    collect.add_argument("--summary", required=True, help="返回摘要")
    collect.set_defaults(func=cmd_collect)

    verify = with_root(subs.add_parser("verify", help="Controller 复核：returned → verified"))
    verify.add_argument("id", help="work item id")
    verify.add_argument("--evidence", required=True, help="Controller 亲自看到的证据")
    verify.set_defaults(func=cmd_verify)

    review = with_root(subs.add_parser("review", help="独立审查：verified → reviewed（FAIL 回退 planned）"))
    review.add_argument("id", help="work item id")
    review.add_argument("--agent", required=True, help="审查者身份（不得与实现者相同）")
    review.add_argument("--invocation", required=True, help="审查调用的唯一身份")
    review.add_argument("--verdict", required=True, choices=list(REVIEW_VERDICTS))
    review.add_argument("--evidence", required=True, help="审查取到的证据")
    review.set_defaults(func=cmd_review)

    accept = with_root(subs.add_parser(
        "accept-report", help="校验 verdict 与标准双射并聚合"))
    accept.add_argument("--from", dest="getattr_from", required=True,
                        help="verifier 返回的 JSON 文件")
    accept.set_defaults(func=cmd_accept_report)

    done = with_root(subs.add_parser("done", help="重算判定、定交付结论并归档"))
    done.add_argument("--accept-partial", action="store_true",
                      help="承认存在 UNVERIFIABLE，以 outcome=partial 归档")
    done.set_defaults(func=cmd_done)

    return parser


def main():
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
