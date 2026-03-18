# Discord Channels — AI Dev Team

## 4 Channels

| Channel | Purpose | Who Posts | Who Reads |
|---------|---------|-----------|-----------|
| **#dev-tasks** | Task intake from project owner | Lead Agent | Project Owner |
| **#dev-work** | All coordination, progress, questions | All agents | All + Project Owner |
| **#dev-reviews** | MR reviews and approvals | Lead Agent | All + Project Owner |
| **#dev-alerts** | Deploy status + critical alerts | Lead Agent, DevOps Agent | All + Project Owner |

## Environment Variables

```bash
DISCORD_BOT_TOKEN=<bot_token>
DISCORD_GUILD_ID=<server_id>
DISCORD_DEV_TASKS_CHANNEL_ID=<channel_id>
DISCORD_DEV_WORK_CHANNEL_ID=<channel_id>
DISCORD_DEV_REVIEWS_CHANNEL_ID=<channel_id>
DISCORD_DEV_ALERTS_CHANNEL_ID=<channel_id>
```

## Agent Bindings

| Agent | Bound To |
|-------|----------|
| **lead-agent** | #dev-tasks, #dev-work, #dev-reviews, #dev-alerts |
| **engineer-agent** | #dev-work |
| **devops-agent** | #dev-work, #dev-alerts |
| **docs-agent** | #dev-work |

## Quick Setup

```bash
# 1. Create channels automatically
node identity/create-channels.js

# 2. Copy the output channel IDs to your .env

# 3. Set up webhooks (for agent posting)
node identity/setup-webhooks.js
```

## Posting Commands

```bash
exec /app/tools/safe-exec.sh post lead-agent dev-work "message"
exec /app/tools/safe-exec.sh post lead-agent dev-tasks "message"
exec /app/tools/safe-exec.sh post lead-agent dev-reviews "message"
exec /app/tools/safe-exec.sh post lead-agent dev-alerts "message"
exec /app/tools/safe-exec.sh post engineer-agent dev-work "message"
exec /app/tools/safe-exec.sh post devops-agent dev-work "message"
exec /app/tools/safe-exec.sh post devops-agent dev-alerts "message"
exec /app/tools/safe-exec.sh post docs-agent dev-work "message"
```
