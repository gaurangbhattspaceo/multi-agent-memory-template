# Multi-Agent Memory Template

A production-tested 5-layer memory architecture for multi-agent AI systems built with [OpenClaw](https://openclaw.ai).

> "My agents forget context and my token usage is through the roof."
>
> This template fixes both problems. Clone, configure, run.

## What's Inside

```
├── openclaw.json                      # Full config with all 5 memory layers
├── workspace-lead/
│   └── SOUL.md                        # Lead agent — delegates, reviews, curates knowledge
├── workspace-engineer/
│   └── SOUL.md                        # Engineer agent — builds, tests, ships code
├── tools/
│   ├── safe-exec.sh                   # Tool wrapper with auto-error capture
│   └── knowledge-vault.js             # Self-learning system (patterns, failures, promotions)
└── docs/
    └── five-layer-memory-guide.md     # Complete guide explaining the architecture
```

## The 5 Layers

| Layer | Problem | Solution | Setup Time |
|-------|---------|----------|------------|
| **1. Identity** | Agent forgets its role | SOUL.md per agent | 30 min |
| **2. Context Window** | Tokens pile up, context wiped | Compaction + pruning + flush | 15 min |
| **3. Persistent Memory** | Knowledge dies with session | Daily files + Knowledge Vault | 1 hour |
| **4. Self-Learning** | Same mistakes repeated | Error fingerprinting + promotion | 2 hours |
| **5. Structural Understanding** | Agent reads 50 files for one answer | Code graph (AST analysis) | 30 min |

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/gaurangbhattspaceo/multi-agent-memory-template.git
cd multi-agent-memory-template
```

Edit `openclaw.json`:
- Replace `${DISCORD_BOT_TOKEN}` with your Discord bot token
- Replace `${DISCORD_GUILD_ID}` with your server ID
- Replace `${GATEWAY_AUTH_TOKEN}` with a random string
- Update agent models if needed (default: Opus for lead, Sonnet for engineers)

### 2. Customize SOUL.md files

Edit `workspace-lead/SOUL.md` and `workspace-engineer/SOUL.md`:
- Replace "Your Project Name" with your actual project
- Add your specific tools and workflows
- Define what each agent owns and doesn't own

### 3. Set up the Knowledge Vault

```bash
mkdir -p /data/knowledge
echo '[]' > /data/knowledge/patterns.json
echo '[]' > /data/knowledge/failures.json
echo '[]' > /data/knowledge/decisions.json
echo '[]' > /data/knowledge/promotions.json
chmod +x tools/safe-exec.sh
```

### 4. Install code graph (optional — Layer 5)

```bash
curl -fsSL https://github.com/DeusData/codebase-memory-mcp/releases/download/v0.3.2/codebase-memory-mcp-linux-amd64.tar.gz -o /tmp/codebase-memory-mcp.tar.gz
tar xzf /tmp/codebase-memory-mcp.tar.gz -C /tmp/
sudo mv /tmp/codebase-memory-mcp /usr/local/bin/
sudo chmod +x /usr/local/bin/codebase-memory-mcp

# Index your repo
codebase-memory-mcp cli index_repository '{"repo_path": "/path/to/your/repo"}'
```

### 5. Start OpenClaw

```bash
openclaw start
```

## Read the Full Guide

For detailed explanations of each layer with config examples and before/after comparisons:

**[five-layer-memory-guide.md](docs/five-layer-memory-guide.md)**

## Credits

Built by [@gaurangbhattspaceo](https://github.com/gaurangbhattspaceo) — running a 5-agent autonomous dev team in production.

Powered by [OpenClaw](https://openclaw.ai).
