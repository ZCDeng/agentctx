# agentctx — Cross-AI-Client Task Handoff CLI

## Context

用户使用多个 AI 编码客户端（Claude Code、Codex CLI、Cursor、Windsurf），
需要在这些客户端之间转移任务上下文、跟踪进度。目前没有任何工具解决
"在 Claude Code 做了半截，换到 Codex 继续"这个痛点。
设计目标：通用、可开源、用 gh CLI 或 Obsidian CLI 作为存储桥梁。

## Handoff File Format

统一格式：Markdown + YAML frontmatter（`.handoff.md`）

```yaml
---
id: "uuid-v4"
title: "Add dark mode to dashboard"
status: "pending | in-progress | blocked | done | abandoned"
agent: "claude-code"          # 来源客户端
project: "myapp-frontend"
labels: [frontend, css]
created_at: "ISO8601"
updated_at: "ISO8601"
session_id: "原会话ID"
git_branch: "feat/dark-mode"
git_commit: "3fa2c1b"
files_modified: [src/styles/theme.css, ...]
---
# 自由格式 markdown body
## What was done / What remains / Key decisions / Gotchas / Test commands
```

所有 backend 存储同一格式，切换 backend 对上层透明。

## CLI Commands

```
agentctx save    -m "描述"    # 捕捉当前状态，保存 handoff
agentctx load    --id <uuid>  # 恢复 handoff（可交互选择）
agentctx list                 # 浏览所有 handoff
agentctx status  --id <uuid> --set done  # 更新状态
agentctx config               # 管理默认配置
agentctx init                 # 项目初始化
```

## Three Backends

| Backend | 桥接方式 | 零依赖？ |
|---------|---------|---------|
| **fs** (默认) | Node.js fs 模块读写 `.agentctx/` 目录 | 是 |
| **github-issues** | `gh issue create/list/view/edit` + labels | 需 gh CLI |
| **obsidian** | REST API (127.0.0.1:27124) + obsidian CLI | 需 Obsidian 运行 |

所有 backend 实现同一 `HandoffBackend` 接口，不可用时自动降级到 fs。

## Tech Stack

- **TypeScript** + Node.js 18+（受众机器都有 Node.js）
- **commander**（CLI 解析）+ **gray-matter**（frontmatter）+ **zod**（schema 校验）
- 可选 `bun build --compile` 输出单二进制文件
- 发布到 npm：`npm install -g agentctx`

## Project Structure (~25 files)

```
agentctx/
  src/
    cli.ts                     # 入口
    commands/ {save,load,list,status,config,init}.ts
    core/ {handoff-service, context-gatherer, schema, formatter}.ts
    backends/ {backend, resolver, fs-backend, github-backend, obsidian-backend}.ts
    output/formatter.ts        # table / json / context-prompt 输出
    utils/ {exec, config, uuid}.ts
  skills/agentctx/SKILL.md     # Claude Code skill wrapper
```

## Implementation Phases

### Phase 1: MVP — Filesystem Backend
- 项目脚手架 + schema + formatter
- `fs-backend`: save/load/list
- `context-gatherer`: git branch、commit、modified files
- CLI: save、load、list 三命令可用
- 交付：`npm install -g agentctx && agentctx save` 跑通

### Phase 2: GitHub Issues Backend
- `github-backend`: 通过 `gh issue` 命令实现 CRUD
- `resolver`: backend 选择 + 自动降级
- 状态 → label 映射（handoff:in-progress 等）

### Phase 3: Obsidian Backend
- `obsidian-backend`: REST API → CLI → 直接文件写入三层降级
- vault 路径自动检测

### Phase 4: Polish
- Claude Code skill + hooks 模板
- `--format context-prompt` 输出模式
- Homebrew formula + 单二进制构建
- CI/CD 发布流水线

## Verification

1. `agentctx save -m "test handoff"` → 生成 `.agentctx/handoffs/{project}-test-handoff.{id}.handoff.md`
2. `agentctx list` → 表格列出该 handoff，status=pending
3. 修改 handoff 文件内容，`agentctx load --last` → 输出 markdown body
4. `agentctx status --last --set done` → status 更新
5. 切换到 `--backend gh`：handoff 作为 GitHub Issue 创建/读取
6. Claude Code 内 `/agentctx save` → skill 触发正常
