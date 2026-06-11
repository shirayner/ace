# ACE 项目优化建议 - 详细实施方案

## 优化点 1: 统一结果对象工厂函数

### 具体步骤

**1. 修改 constants.js，添加工厂函数**

```javascript
// 在 constants.js 底部添加
export function createInstallerResults(options = {}) {
  const { includeMerged = true, includeDry = false } = options;
  const result = {
    installed: [],
    skipped: [],
    errors: [],
  };
  
  if (includeMerged) {
    result.merged = [];
  }
  
  if (includeDry) {
    result.dryRun = true;
  }
  
  return result;
}
```

**2. 修改 installer.js:21**

```javascript
// 之前
this.results = { installed: [], skipped: [], merged: [], errors: [] };

// 之后
this.results = createInstallerResults({ includeMerged: true });
```

**3. 修改 spec-installer.js:16**

```javascript
// 之前
this.results = { installed: [], skipped: [], merged: [], errors: [] };

// 之后
this.results = createInstallerResults({ includeMerged: true });
```

**4. 修改 team-installer.js:12**

```javascript
// 之前
this.results = { installed: [], skipped: [], errors: [] };

// 之后
this.results = createInstallerResults({ includeMerged: false });
```

### 验证

在每个类的单元测试中验证 results 结构：

```javascript
assert(installer.results.hasOwnProperty('installed'));
assert(installer.results.hasOwnProperty('skipped'));
assert(installer.results.hasOwnProperty('errors'));
assert(installer.results.hasOwnProperty('merged'));
```

---

## 优化点 2: 创建 BaseInstaller 基类

### 具体步骤

**1. 创建新文件 src/core/base-installer.js**

```javascript
import path from 'path';

export class BaseInstaller {
  constructor(options = {}) {
    this.targetDir = options.targetDir || '';
    this.templatesDir = options.templatesDir || '';
    this.dryRun = options.dryRun || false;
    this.force = options.force || false;
  }

  /**
   * Build source path from file spec
   * @param {Object} fileSpec - File specification with src property
   * @returns {string} Normalized source path
   */
  buildSourcePath(fileSpec) {
    return path.normalize(
      path.join(this.templatesDir, fileSpec.src)
    );
  }

  /**
   * Build destination path from file spec
   * @param {Object} fileSpec - File specification with dest property
   * @returns {string} Normalized destination path
   */
  buildDestPath(fileSpec) {
    return path.normalize(
      path.join(this.targetDir, fileSpec.dest)
    );
  }

  /**
   * Combine directory and filename safely
   * @param {string} dir - Directory path
   * @param {string} file - File name
   * @returns {string} Combined normalized path
   */
  joinPath(dir, file) {
    return path.normalize(path.join(dir, file));
  }
}
```

**2. 修改 installer.js 继承 BaseInstaller**

```javascript
import { BaseInstaller } from './base-installer.js';

export class Installer extends BaseInstaller {
  async installFile(fileSpec, componentName) {
    const srcPath = this.buildSourcePath(fileSpec);    // 使用新方法
    const destPath = this.buildDestPath(fileSpec);     // 使用新方法
    
    // 原有逻辑
  }
}
```

**3. 修改 spec-installer.js**

```javascript
import { BaseInstaller } from './base-installer.js';

export class SpecInstaller extends BaseInstaller {
  async installTemplates() {
    for (const file of SPEC_TEMPLATE_FILES) {
      const srcPath = this.joinPath(this.templatesDir, file);  // 使用新方法
      const destPath = this.joinPath(this.openspecDir, 'templates', file);
      // ... 原有逻辑
    }
  }
}
```

---

## 优化点 3: 统一错误处理

### 具体步骤

**1. 创建 src/core/errors.js**

```javascript
export const ErrorCodes = {
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  OPENSPEC_INSTALL_FAILED: 'OPENSPEC_INSTALL_FAILED',
  GIT_CLONE_FAILED: 'GIT_CLONE_FAILED',
  FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
};

export const ErrorMessages = {
  [ErrorCodes.TEMPLATE_NOT_FOUND]: 'Template file not found',
  [ErrorCodes.OPENSPEC_INSTALL_FAILED]: 'Failed to install @fission-ai/openspec',
  [ErrorCodes.GIT_CLONE_FAILED]: 'Failed to clone git repository',
  [ErrorCodes.FILE_WRITE_FAILED]: 'Failed to write file',
};

export class InstallerError extends Error {
  constructor(code, details = {}) {
    const message = ErrorMessages[code] || code;
    super(message);
    this.code = code;
    this.details = details;
    this.contextType = details.contextType || 'file';
    this.contextValue = details.contextValue || '';
  }

  toResult() {
    return {
      [this.contextType]: this.contextValue,
      error: this.message,
      code: this.code,
    };
  }
}
```

**2. 在 installer.js 中使用**

```javascript
import { InstallerError, ErrorCodes } from './errors.js';

async installFile(fileSpec, componentName) {
  const srcPath = this.buildSourcePath(fileSpec);
  
  if (!await fs.pathExists(srcPath)) {
    const err = new InstallerError(ErrorCodes.TEMPLATE_NOT_FOUND, {
      contextType: 'file',
      contextValue: fileSpec.src,
    });
    this.results.errors.push(err.toResult());
    return;
  }
  // ...
}
```

---

## 优化点 4: 分解 mergeClaudeMd 函数

### 具体步骤

**1. 创建 src/core/markdown-merger.js**

```javascript
import { isAceOwnedRef } from './constants.js';

const MARKERS = {
  START: '<!-- ace:managed:start -->',
  END: '<!-- ace:managed:end -->',
};

export class MarkdownMerger {
  /**
   * Extract section between markers
   */
  extractManagedSection(content) {
    const startIdx = content.indexOf(MARKERS.START);
    const endIdx = content.indexOf(MARKERS.END);
    
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return '';
    }
    
    return content.slice(startIdx, endIdx + MARKERS.END.length);
  }

  /**
   * Replace managed section in content
   */
  replaceManagedSection(existingContent, newManagedContent) {
    const startIdx = existingContent.indexOf(MARKERS.START);
    const endIdx = existingContent.indexOf(MARKERS.END);
    
    if (startIdx === -1 || endIdx === -1) {
      return existingContent;
    }
    
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + MARKERS.END.length);
    
    return before.trimEnd() + '\n' + newManagedContent + '\n' + after.trimStart();
  }

  /**
   * Extract @references from content
   */
  extractRefs(content) {
    const refPattern = /@~?\/?\.?claude\/[^\s)]+/g;
    return content.match(refPattern) || [];
  }

  /**
   * Remove obsolete ACE references
   */
  removeObsoleteRefs(lines, validRefs) {
    const removed = [];
    
    return lines.map(line => {
      const refs = this.extractRefs(line);
      
      for (const ref of refs) {
        if (isAceOwnedRef(ref)) {
          const refWithAt = `@${ref}`;
          if (!validRefs.includes(refWithAt)) {
            removed.push(ref);
            return null;  // 移除这一行
          }
        }
      }
      
      return line;
    }).filter(line => line !== null);
  }

  /**
   * Remove hookify references
   */
  removeHookifyRefs(lines) {
    return lines.filter(line => {
      const refs = this.extractRefs(line);
      return !refs.some(ref => /hookify\.ace\./.test(ref));
    });
  }

  /**
   * Normalize whitespace
   */
  normalizeWhitespace(content) {
    return content
      .replace(/\n## Added by ace\n*(?=\n|$)/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Merge markdown files with marker strategy
   */
  merge(existingContent, templateContent) {
    // 1. 提取模板的 managed 部分
    const templateManaged = this.extractManagedSection(templateContent);
    const validRefs = this.extractRefs(templateManaged);

    // 2. 替换现有内容中的 managed 部分
    let result = this.replaceManagedSection(existingContent, templateManaged);

    // 3. 清理过期引用
    const lines = result.split('\n');
    const cleanedLines = this.removeObsoleteRefs(lines, validRefs);
    const finalLines = this.removeHookifyRefs(cleanedLines);
    
    result = finalLines.join('\n'
