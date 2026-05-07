---
name: agentctx
description: Save and restore cross-client task handoffs. Use when you need to hand off work to another AI coding agent, continue work started in a different tool, or capture current session state.
user-invocable: true
allowed-tools: Bash
---

# agentctx — Cross-AI-Client Task Handoff

## When to use
- Finishing a session and want to save context for the next AI client
- Continuing work that was started in a different AI coding tool
- Need to switch between Claude Code, Codex CLI, Cursor, etc.
- Working with multiple agent sessions that need to see the whole picture

## Commands

### Save current context
```bash
agentctx save -m "what I've done and what remains"
```

With agent tree discovery (for sessions that used sub-agents):
```bash
agentctx save -m "reviewed repo security" --tree
```

### Load a handoff
```bash
agentctx load --last                          # most recent handoff
agentctx load --last --format context-prompt   # paste into any AI client
agentctx load --id <uuid-prefix>              # specific handoff
```

### Browse handoffs
```bash
agentctx list
agentctx list --status blocked
agentctx list --label bug
```

### Update status
```bash
agentctx status --id <uuid> --set done
agentctx status --last --set blocked
```

## Backends
- `fs` (default): local `.agentctx/handoffs/` directory
- `github`: GitHub Issues via `gh` CLI
- `obsidian`: Obsidian vault (REST/CLI/fs three-tier fallback)

## Configuration
```bash
agentctx init                          # set up project
agentctx config set defaultBackend github  # persistent default
```
