# SpecHub SOA 接口契约

本文件定义 spechub-coding skill 与 SpecHub 平台的接口契约。

---

## 共享类型

namespace java 'com.ctrip.ibu.spec.portal.soa.handoff'

enum HandoffArchiveStatusEnum { COMPLETED }

class HandoffArtifactContent {
    string content;
    long lastUpdatedAt;
}

class HandoffOptionalArtifact {
    bool exists;
    string content;
    long lastUpdatedAt;
}

class HandoffDdlChange {
    bool exists;
    string markdown;
    string sqlContent;
    long lastUpdatedAt;
}

class HandoffContract {
    string filename;
    string content;
    string mavenCoordinate;
    long lastUpdatedAt;
}

class HandoffManifest {
    long requirementId;
    long workspaceProjectId;
    string requirementTitle;
    RequirementStatusEnum requirementStatus;
    list<string> gitRemoteUrls;
    long generatedAt;
}

---

## getHandoffBundle — 拉取全套产物

Request:  { requirementId: long, gitRemoteUrl: string }
Response: { manifest, prd, architecture, proposal, contracts[], qmqDesign?, ddlChange? }

错误码:
| 错误码 | 含义 | Skill 处理 |
|--------|------|-----------|
| REQUIREMENT_NOT_FOUND | requirementId 无效 | 报错终止 |
| NO_PROJECT_MATCH | gitRemoteUrl 无法匹配 | 提示检查 git remote |
| ARTIFACTS_INCOMPLETE | 必需产物未就绪 | 列出缺失项，等待平台补全 |

---

## getHandoffInbox — 获取待处理需求列表

Request:  { gitRemoteUrl: string }
Response: { items[]: { requirementId, title, status, updatedAt } }

错误码:
| 错误码 | 含义 | Skill 处理 |
|--------|------|-----------|
| NO_WORKSPACE_FOR_GIT_REMOTE | 仓库未在 SpecHub 创建工作空间 | 提示先在 SpecHub 创建 |

---

## archiveHandoff — 归档上报

Request:  { requirementId, gitRemoteUrl, archiveStatus, branchName, commitHash, decisionsMarkdown, operator }
Response: { archiveRecordId, requirementProjectStatus, requirementStatus }

错误码:
| 错误码 | 含义 | Skill 处理 |
|--------|------|-----------|
| REQUIREMENT_NOT_FOUND | requirementId 无效 | 报错 |
| NO_PROJECT_MATCH | gitRemoteUrl 无法匹配 | 报错 |
| ARCHIVE_RECORD_PERSIST_FAILED | 服务端持久化失败 | 重试一次 |
| STATUS_TRANSITION_INVALID | 需求状态不允许归档 | 提示当前状态 |

---

## SOA 服务地址

- 环境变量：SPECHUB_BASE_URL
- 默认值：http://spec-portal-service.ibu.ctripcorp.com
- FAT：http://spec-portal-service.fat.ibu.ctripcorp.com
