# auto-goal 状态文件参考

auto-goal 使用统一的 `.ace/tasks/{changeName}/` 目录结构。

详细模板见 `../../shared/state-template.md`。

---

## auto-goal 的 state.json 示例

```jsonc
{
  "name": "perf-optimize-api",
  "type": "goal",
  "status": "in-progress",
  "created_at": "2026-06-12T10:00:00",
  "updated_at": "2026-06-12T14:30:00",

  "completion_criteria": [
    "API P99 延迟 < 200ms",
    "无新增内存泄漏"
  ],

  "tasks": [
    {"id": "T1", "title": "性能基线测量", "status": "done", "parallel": true},
    {"id": "T2", "title": "瓶颈定位", "status": "done", "parallel": true},
    {"id": "T3", "title": "缓存层优化", "status": "in-progress", "depends": ["T1", "T2"]},
    {"id": "T4", "title": "SQL 查询优化", "status": "pending", "depends": ["T2"]},
    {"id": "T5", "title": "集成验证", "status": "pending", "depends": ["T3", "T4"]}
  ],

  "goal": {
    "phase": "executing",
    "decisions": [
      {"decision": "使用 Caffeine 本地缓存", "reason": "延迟敏感，Redis 网络开销大", "alternatives": ["Redis", "Guava Cache"]}
    ]
  }
}
```

---

## context.md 示例

```markdown
# API 性能优化

## 目标
将核心 API 的 P99 延迟从 500ms 降至 200ms 以内。

## 过程记录

### 决策
- **D1**: 使用 Caffeine 本地缓存 — 理由: 延迟敏感场景，Redis 网络开销 ~5ms，备选: Redis, Guava Cache
- **D2**: 分批优化而非全量重构 — 理由: 降低风险，可逐步验证，备选: 一次性重构

### 中间结论
- 瓶颈在 DB 查询（占 70% 耗时），缓存命中率提升空间大
- 热点数据量 < 500MB，本地缓存可承载

### 风险
- 缓存一致性: 使用 TTL 30s + 事件驱动失效双保险

## 已修改文件
- src/main/java/com/xxx/cache/LocalCacheConfig.java: 新增 Caffeine 配置
- src/main/java/com/xxx/service/UserService.java: 加缓存注解
```

---

## 目录结构

```
.ace/tasks/{changeName}/
├── state.json       # 状态 (必需)
├── context.md       # 决策 + 过程 (必需)
└── artifacts/       # 产物 (按需)
    ├── perf-baseline.md
    └── optimization-report.md
```
