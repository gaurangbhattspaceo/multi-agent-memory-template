# Multi-Agent AI Team Template

A production-tested, fully autonomous multi-agent development team built with [OpenClaw](https://openclaw.ai). 5 agents, 13 cron jobs, 15 tools, and a 5-layer memory architecture that prevents context loss and reduces token usage.

> "My agents forget context and my token usage is through the roof."
>
> This template fixes both. Clone it, configure it, run it.

## What You Get

A complete autonomous AI development team:

| Agent | Model | Role |
|-------|-------|------|
| **Lead Agent** | Claude Opus | Delegates tasks, reviews code, curates knowledge, runs promotion reviews |
| **Engineer Agent** | Claude Sonnet | Writes code, runs tests, creates MRs (TDD workflow) |
| **DevOps Agent** | Claude Sonnet | Deploys, monitors infrastructure, manages CI/CD |
| **Ops Monitor** | Haiku (or budget model) | Health checks, stuck task detection, daily summaries |
| **Docs Agent** | Claude Sonnet | Scans codebase, generates documentation, takes screenshots |

### 13 Cron Jobs (fully autonomous)

| Job | Agent | Schedule | What it Does |
|-----|-------|----------|--------------|
| Morning Standup | Lead | 9 AM weekdays | Reviews overnight activity, plans the day |
| MR Review Check | Lead | Every 15 min | Finds and reviews unreviewed MRs |
| Proactive Scan | Lead | Every 20 min | Scans for stuck tasks, process errors |
| Intake Triage | Lead | Every 30 min | Creates tasks from test failures + health alerts |
| Git Issue Intake | Lead | Every 30 min | Polls git provider for new issues |
| Release Check | Lead | 11 AM weekdays | Tags new version if quality criteria met |
| Promotion Review | Lead | 4 AM daily | Reviews self-learning candidates, writes rules to SOUL.md |
| Weekly Summary | Lead | Friday 5 PM | Compiles weekly accomplishments and priorities |
| E2E Tests | DevOps | 6 AM daily | Runs full test suite, exports results |
| Health Check | Ops Monitor | Every 30 min | Checks processes, DB, API health |
| Smart Babysitter | Ops Monitor | Every 10 min | Detects stuck tasks, escalates failures |
| Daily Summary | Ops Monitor | 8:30 PM daily | Posts team status to chat |
| Docs Update | Docs Agent | 3 AM daily | Scans codebase, updates documentation |

### 15 Tools

| Tool | Purpose |
|------|---------|
| `safe-exec.sh` | Command wrapper with auto-error capture (Layer 4) |
| `task-registry.js` | Task management with dedup, priority, linking |
| `knowledge-vault.js` | Self-learning: patterns, failures, promotions |
| `monitor-agents.js` | Team dashboard and per-agent status |
| `babysitter.js` | Stuck task detection and escalation |
| `proactive-scan.js` | Find actionable work across systems |
| `intake-triage.js` | Auto-create tasks from test/health failures |
| `version-manager.js` | Release gating with semver tracking |
| `code-review.js` | MR review tracking and diff fetching |
| `validate-done.js` | Definition of Done checklist |
| `retry-analyzer.js` | Error classification and fix suggestions |
| `e2e-runner.js` | Test execution and result export |
| `git-integration.js` | Multi-provider git API (GitHub/GitLab/Bitbucket) |
| `git-intake.js` | Poll git issues into task registry |
| `docs-gen.js` | Codebase scanning, screenshots, docs repo management |

### 5-Layer Memory Architecture

| Layer | Problem | Solution | Setup Time |
|-------|---------|----------|------------|
| **1. Identity** | Agent forgets its role | SOUL.md + AGENTS.md + TOOLS.md + skills/ per agent | 30 min |
| **2. Context Window** | Tokens pile up, context wiped | Compaction + pruning + flush | 15 min |
| **3. Persistent Memory** | Knowledge dies with session | Daily files + Knowledge Vault | 1 hour |
| **4. Self-Learning** | Same mistakes repeated | Error fingerprinting + promotion | 2 hours |
| **5. Structural Understanding** | Agent reads 50 files for one answer | Code graph (AST analysis) | 30 min |

## Repository Structure

```
.
├── .env.example                       # All environment variables
├── .gitignore                         # Excludes .env, /data/, credentials
├── package.json                       # Node.js config (openclaw dependency)
├── openclaw.json                      # Full config (5 agents, bindings, channels)
├── start.sh                           # Startup script (volume setup, auth, 13 crons)
├── AGENT-COMMUNICATION.md             # Peer-to-peer communication protocol
├── DISCORD-CHANNELS.md                # Channel structure and setup guide
│
├── workspace-lead-agent/
│   ├── SOUL.md                        # Lead agent identity + knowledge-first delegation
│   ├── AGENTS.md                      # Team roster and communication protocol
│   ├── TOOLS.md                       # All available tool commands
│   ├── SECURITY.md                    # Non-negotiable security rules
│   ├── USER.md                        # Project owner preferences and approval gates
│   ├── WORKFLOW.md                    # 7-stage project workflow
│   └── skills/                        # 6 mandatory workflow skills
│       ├── brainstorming/SKILL.md
│       ├── writing-plans/SKILL.md
│       ├── subagent-driven-development/SKILL.md
│       ├── dispatching-parallel-agents/SKILL.md
│       ├── requesting-code-review/SKILL.md
│       └── verification-before-completion/SKILL.md
│
├── workspace-engineer-agent/
│   ├── SOUL.md                        # Engineer identity + TDD verification protocol
│   ├── AGENTS.md                      # Team communication
│   ├── TOOLS.md                       # Available tools
│   └── skills/                        # 4 mandatory workflow skills
│       ├── test-driven-development/SKILL.md
│       ├── systematic-debugging/SKILL.md
│       ├── receiving-code-review/SKILL.md
│       └── verification-before-completion/SKILL.md
│
├── workspace-devops-agent/
│   ├── SOUL.md                        # DevOps identity + 7-step deploy verification
│   ├── AGENTS.md                      # Team communication
│   ├── TOOLS.md                       # Available tools
│   └── skills/                        # 4 mandatory workflow skills (same as engineer)
│
├── workspace-ops-monitor/
│   └── SOUL.md                        # Ops monitor identity (lightweight, budget model)
│
├── workspace-docs-agent/
│   ├── SOUL.md                        # Docs agent identity + writing style guide
│   └── TOOLS.md                       # Documentation tools
│
├── shared/
│   ├── PRODUCT.md                     # Product context template [FILL IN]
│   ├── CODEBASE.md                    # Directory map template [FILL IN]
│   ├── ARCHITECTURE.md                # System design template [FILL IN]
│   └── DANGER-ZONES.md                # Critical files template [FILL IN]
│
├── identity/
│   ├── setup-webhooks.js              # Auto-create Discord webhooks
│   ├── create-channels.js             # Auto-create Discord channels
│   ├── post.js                        # Discord message poster (with chunking)
│   ├── post-file.js                   # Discord file/image poster
│   └── post-teams.js                  # Microsoft Teams Adaptive Card poster
│
├── tools/
│   ├── safe-exec.sh                   # Command wrapper + auto-learning
│   ├── task-registry.js               # Task management
│   ├── knowledge-vault.js             # Self-learning system
│   ├── monitor-agents.js              # Team dashboard
│   ├── babysitter.js                  # Stuck task detection
│   ├── proactive-scan.js              # Actionable work scanner
│   ├── intake-triage.js               # Auto task creation
│   ├── version-manager.js             # Release gating
│   ├── code-review.js                 # MR review tracking
│   ├── validate-done.js               # Definition of Done
│   ├── retry-analyzer.js              # Error classification
│   ├── e2e-runner.js                  # Test runner
│   ├── git-integration.js             # Git API (GitHub/GitLab/Bitbucket)
│   ├── git-intake.js                  # Git issue intake
│   └── docs-gen.js                    # Codebase scanner + screenshot tool
│
└── docs/
    └── five-layer-memory-guide.md     # Complete architecture guide
```

## Quick Start

### 1. Clone

```bash
git clone https://github.com/gaurangbhattspaceo/multi-agent-memory-template.git
cd multi-agent-memory-template
```

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Edit .env with your values
```

Required:
- `ANTHROPIC_TOKEN` — your Anthropic API key or Max/Pro subscription token (both `sk-ant-api03-` and `sk-ant-oat01-` prefixes work)
- `DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID` — for chat integration
- `GATEWAY_AUTH_TOKEN` — any random string

### 4. Set up Discord channels

```bash
# Auto-create 4 channels in your Discord server
npm run setup-channels
# Copy the output channel IDs to your .env file

# Set up webhooks for agent posting
npm run setup-webhooks
```

### 5. Customize SOUL.md files

Edit each `workspace-*/SOUL.md` to match your project:
- Replace `[Your Project Name]` with your product name
- Replace `[FILL IN: ...]` placeholders with your tech stack
- Add your specific tools and workflows
- Define what each agent owns

### 6. Fill in shared knowledge

Edit `shared/*.md` templates:
- `PRODUCT.md` — what your product does
- `CODEBASE.md` — your directory structure
- `ARCHITECTURE.md` — your system design
- `DANGER-ZONES.md` — critical files to be careful with

### 7. Set up persistent storage

```bash
mkdir -p /data/knowledge
echo '[]' > /data/knowledge/patterns.json
echo '[]' > /data/knowledge/failures.json
echo '[]' > /data/knowledge/decisions.json
echo '[]' > /data/knowledge/promotions.json
chmod +x tools/safe-exec.sh start.sh
```

### 8. Install code graph (optional — Layer 5)

```bash
curl -fsSL https://github.com/DeusData/codebase-memory-mcp/releases/download/v0.3.2/codebase-memory-mcp-linux-amd64.tar.gz | tar xz -C /tmp/
sudo mv /tmp/codebase-memory-mcp /usr/local/bin/
codebase-memory-mcp cli index_repository '{"repo_path": "/path/to/your/repo"}'
```

### 9. Start

```bash
./start.sh
```

## How It Works

```
Discord message -> OpenClaw gateway -> routes to agent based on channel bindings
                                     -> agent reads SOUL.md (Layer 1)
                                     -> searches knowledge vault (Layer 3)
                                     -> uses code graph for code questions (Layer 5)
                                     -> executes tools via safe-exec.sh
                                     -> context pruning keeps tokens lean (Layer 2)
                                     -> errors auto-captured for self-learning (Layer 4)
                                     -> responds in Discord

Cron fires -> agent executes autonomously -> creates tasks, reviews MRs, deploys, monitors
```

## Prerequisites

- **Node.js 22+**
- **PM2** (`npm install -g pm2`) — for process management
- **OpenClaw** (`npm install -g openclaw`) — multi-agent framework
- **Playwright** (optional, for E2E tests and screenshots): `npx playwright install chromium`

## Read the Full Guide

For detailed explanations of each memory layer:

**[docs/five-layer-memory-guide.md](docs/five-layer-memory-guide.md)**

## Credits

Built by [@gaurangbhattspaceo](https://github.com/gaurangbhattspaceo).

Powered by [OpenClaw](https://openclaw.ai).
