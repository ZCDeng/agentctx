# agentctx

Cross-AI-client task handoff CLI. Save and restore task context between
Claude Code, Codex CLI, Cursor, Windsurf, Gemini CLI, and other AI coding agents.

## Install

```bash
npm install -g agentctx
```

Or from source:

```bash
git clone https://github.com/ZCDeng/agentctx
cd agentctx && npm install && npm run build && npm link
```

## Quick Start

```bash
agentctx init                           # one-time project setup
agentctx save -m "added auth, WIP on dashboard"  # save current context
agentctx load --last --format context-prompt      # restore in any AI client
```

## Backends

| Backend | Storage | Use case |
|---------|---------|----------|
| `fs` (default) | `.agentctx/handoffs/*.handoff.md` | Single machine, zero deps |
| `github` | GitHub Issues via `gh` CLI | Cross-machine, team collaboration |
| `obsidian` | Obsidian vault (REST → CLI → fs tiers) | Obsidian knowledge base |

Backends auto-detect availability and fall back to `fs` silently.

## Commands

| Command | Description |
|---------|-------------|
| `agentctx save -m "msg"` | Capture current state as handoff |
| `agentctx save --tree` | Include sub-agent cluster tree |
| `agentctx load --last` | Restore most recent handoff |
| `agentctx load --last --chain` | Restore full handoff chain |
| `agentctx load --format context-prompt` | Output optimized for AI paste |
| `agentctx list` | Browse all handoffs (table) |
| `agentctx status --id <id> --set done` | Update handoff status |
| `agentctx config set <key> <value>` | Persistent settings |
| `agentctx init` | Initialize project |

## Handoff Format

Standard Markdown + YAML frontmatter. Human-readable, machine-parseable.
Same format across all backends and all AI clients.

## License

MIT
