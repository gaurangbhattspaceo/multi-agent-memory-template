#!/bin/bash
set -e

# ============================================================
# Multi-Agent Team — Startup Script
#
# This script initializes the persistent volume, sets up
# authentication, starts the OpenClaw gateway, and registers
# all cron jobs.
#
# Customize: Replace agent names, repo paths, and cron
# schedules for your project.
# ============================================================

# Load environment variables
if [ -f /app/.env ]; then
  set -a
  source /app/.env
  set +a
fi

echo "Starting Multi-Agent Team (5 agents: lead, engineer, devops, ops-monitor, docs-agent)..."

# ============================================================
# PERSISTENT VOLUME SETUP
# ============================================================

VOLUME_DIR="/data"
AGENTS="lead-agent engineer-agent devops-agent ops-monitor docs-agent"

if [ -d "$VOLUME_DIR" ]; then
  echo "Persistent volume detected at $VOLUME_DIR"

  # Create shared directories
  mkdir -p "$VOLUME_DIR/credentials"
  mkdir -p "$VOLUME_DIR/identity"
  mkdir -p "$VOLUME_DIR/shared"
  mkdir -p "$VOLUME_DIR/screenshots"
  mkdir -p "$VOLUME_DIR/releases"

  # Initialize task registry
  if [ ! -f "$VOLUME_DIR/tasks.json" ]; then
    echo '{"tasks":[],"nextId":1}' > "$VOLUME_DIR/tasks.json"
    echo "  Task registry initialized"
  fi

  # Initialize version tracker
  if [ ! -f "$VOLUME_DIR/releases/versions.json" ]; then
    echo '{"current":"1.0.0","releases":[]}' > "$VOLUME_DIR/releases/versions.json"
    echo "  Version tracker initialized"
  fi

  # Initialize knowledge vault (Layer 3 + 4)
  mkdir -p "$VOLUME_DIR/knowledge"
  for KV_FILE in decisions patterns failures metrics promotions; do
    if [ ! -f "$VOLUME_DIR/knowledge/$KV_FILE.json" ]; then
      echo '{"items":[],"nextId":1}' > "$VOLUME_DIR/knowledge/$KV_FILE.json"
    fi
  done
  echo "  Knowledge vault initialized (with promotion tracking)"

  # ── Layer 5: Code Graph (codebase-memory-mcp) ──
  CODEBASE_MCP_BIN="/usr/local/bin/codebase-memory-mcp"
  if [ ! -f "$CODEBASE_MCP_BIN" ]; then
    echo "Installing codebase-memory-mcp..."
    curl -fsSL https://github.com/DeusData/codebase-memory-mcp/releases/download/v0.3.2/codebase-memory-mcp-linux-amd64.tar.gz -o /tmp/codebase-memory-mcp.tar.gz
    tar xzf /tmp/codebase-memory-mcp.tar.gz -C /tmp/
    mv /tmp/codebase-memory-mcp "$CODEBASE_MCP_BIN" 2>/dev/null || sudo mv /tmp/codebase-memory-mcp "$CODEBASE_MCP_BIN"
    chmod +x "$CODEBASE_MCP_BIN"
    rm -f /tmp/codebase-memory-mcp.tar.gz
    echo "  codebase-memory-mcp v0.3.2 installed"
  else
    echo "  codebase-memory-mcp already installed"
  fi

  # Pre-index repos (customize these paths for your project)
  if [ -n "$REPO_1_PATH" ] && [ -d "$REPO_1_PATH" ]; then
    echo "  Indexing repo 1..."
    "$CODEBASE_MCP_BIN" cli index_repository "{\"repo_path\": \"$REPO_1_PATH\"}" 2>/dev/null || echo "  (will index on first query)"
  fi
  if [ -n "$REPO_2_PATH" ] && [ -d "$REPO_2_PATH" ]; then
    echo "  Indexing repo 2..."
    "$CODEBASE_MCP_BIN" cli index_repository "{\"repo_path\": \"$REPO_2_PATH\"}" 2>/dev/null || echo "  (will index on first query)"
  fi

  # Copy shared knowledge files to volume
  if [ -d "/app/shared" ]; then
    cp /app/shared/*.md "$VOLUME_DIR/shared/" 2>/dev/null || true
    echo "  Shared knowledge files updated"
  fi

  # ── Per-Agent Volume Setup ──
  for AGENT in $AGENTS; do
    AGENT_VOLUME="$VOLUME_DIR/$AGENT"
    AGENT_WORKSPACE="/app/workspace-${AGENT}"
    mkdir -p "$AGENT_VOLUME/memory"
    mkdir -p "$AGENT_VOLUME/sessions"

    # Symlink memory and sessions to persistent volume
    rm -rf "$AGENT_WORKSPACE/memory"
    ln -sf "$AGENT_VOLUME/memory" "$AGENT_WORKSPACE/memory"

    AGENT_DIR="/app/agents/$AGENT"
    mkdir -p "$AGENT_DIR"
    rm -rf "$AGENT_DIR/sessions"
    ln -sf "$AGENT_VOLUME/sessions" "$AGENT_DIR/sessions"

    # Symlink shared knowledge into workspace
    ln -sf "$VOLUME_DIR/shared" "$AGENT_WORKSPACE/shared" 2>/dev/null || true

    echo "  $AGENT: memory + sessions linked to volume"
  done

  # ── Credentials Setup ──
  if [ -z "$(ls -A $VOLUME_DIR/credentials 2>/dev/null)" ] && [ -d "/app/credentials" ]; then
    cp -r /app/credentials/* "$VOLUME_DIR/credentials/" 2>/dev/null || true
  fi
  rm -rf /app/credentials
  ln -sf "$VOLUME_DIR/credentials" /app/credentials
  echo "  credentials linked to volume"

  # ── Tools Setup ──
  mkdir -p "$VOLUME_DIR/tools"
  for TOOL_FILE in safe-exec.sh task-registry.js knowledge-vault.js monitor-agents.js \
    retry-analyzer.js babysitter.js proactive-scan.js e2e-runner.js intake-triage.js \
    version-manager.js git-integration.js git-intake.js code-review.js validate-done.js \
    docs-gen.js; do
    cp "/app/tools/$TOOL_FILE" "$VOLUME_DIR/tools/$TOOL_FILE" 2>/dev/null || true
  done
  chmod +x "$VOLUME_DIR/tools/safe-exec.sh" 2>/dev/null || true
  rm -rf /app/tools
  ln -sf "$VOLUME_DIR/tools" /app/tools
  echo "  tools linked to volume"

  # ── Identity Setup ──
  if [ -z "$(ls -A $VOLUME_DIR/identity 2>/dev/null)" ] && [ -d "/app/identity" ]; then
    cp -r /app/identity/* "$VOLUME_DIR/identity/" 2>/dev/null || true
  fi
  cp /app/identity/setup-webhooks.js "$VOLUME_DIR/identity/setup-webhooks.js" 2>/dev/null || true
  cp /app/identity/post-file.js "$VOLUME_DIR/identity/post-file.js" 2>/dev/null || true
  cp /app/identity/post-teams.js "$VOLUME_DIR/identity/post-teams.js" 2>/dev/null || true
  if [ ! -f "$VOLUME_DIR/identity/webhooks.json" ]; then
    cp /app/identity/webhooks.json "$VOLUME_DIR/identity/webhooks.json" 2>/dev/null || true
  fi
  rm -rf /app/identity
  ln -sf "$VOLUME_DIR/identity" /app/identity
  echo "  identity linked to volume"

  # ── Docs Repo Setup (for docs-agent) ──
  if [ -n "$DOCS_REPO_URL" ]; then
    if [ -d "$VOLUME_DIR/docs-repo/.git" ]; then
      echo "  Pulling latest docs repo..."
      cd "$VOLUME_DIR/docs-repo" && git pull origin main 2>/dev/null || true && cd /app
    else
      echo "  Cloning docs repo..."
      git clone "$DOCS_REPO_URL" "$VOLUME_DIR/docs-repo" 2>/dev/null || true
      if [ -d "$VOLUME_DIR/docs-repo/.git" ]; then
        cd "$VOLUME_DIR/docs-repo"
        git config user.email "docs-agent@your-team.dev"
        git config user.name "Docs Agent"
        cd /app
      fi
    fi
    echo "  Docs repo ready at $VOLUME_DIR/docs-repo"
  fi

  echo "Persistent volume configured for 5-agent team."
else
  echo "WARNING: No persistent volume at $VOLUME_DIR — files will not survive restarts!"
  echo "Create /data directory to enable persistence."
fi

# ============================================================
# AUTHENTICATION
# ============================================================

echo ""
echo "Setting up authentication..."

mkdir -p ~/.openclaw/credentials
chmod 700 ~/.openclaw

export OPENCLAW_GATEWAY_TOKEN="${GATEWAY_AUTH_TOKEN}"

# Anthropic authentication (for lead, engineer, devops, docs-agent)
if [ -n "$ANTHROPIC_TOKEN" ]; then
  echo "Setting up Anthropic authentication..."
  node -e "
    const fs = require('fs');
    const home = process.env.HOME;
    const token = process.env.ANTHROPIC_TOKEN;
    const agents = ['lead-agent', 'engineer-agent', 'devops-agent', 'docs-agent', 'main'];

    const auth = {
      version: 1,
      profiles: {
        'anthropic:default': {
          type: 'token',
          provider: 'anthropic',
          token: token
        }
      },
      lastGood: { anthropic: 'anthropic:default' },
      usageStats: {
        'anthropic:default': { lastUsed: Date.now(), errorCount: 0 }
      }
    };

    const json = JSON.stringify(auth, null, 2);

    for (const agent of agents) {
      const dirs = [
        'agents/' + agent + '/agent',
        home + '/.openclaw/agents/' + agent + '/agent'
      ];
      fs.mkdirSync(home + '/.openclaw/agents/' + agent + '/sessions', { recursive: true });

      for (const dir of dirs) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dir + '/auth-profiles.json', json);
        fs.chmodSync(dir + '/auth-profiles.json', 0o600);
      }
    }
    console.log('Auth written for ' + agents.length + ' agents');
  "
  echo "  Anthropic auth configured for 4 agents + main"
else
  echo "  No ANTHROPIC_TOKEN set — using existing openclaw auth"
  echo "  If not authenticated, run: openclaw auth login"
fi

# Budget model for ops-monitor (optional — saves cost on routine crons)
# [CUSTOMIZE: Replace with your preferred budget model provider]
if [ -n "$BUDGET_MODEL_API_KEY" ]; then
  echo "Setting up budget model authentication for ops-monitor..."
  node -e "
    const fs = require('fs');
    const home = process.env.HOME;
    const key = process.env.BUDGET_MODEL_API_KEY;
    const provider = process.env.BUDGET_MODEL_PROVIDER || 'openai';

    const auth = {
      version: 1,
      profiles: {},
      lastGood: {},
      usageStats: {}
    };

    const profileName = provider + ':default';
    auth.profiles[profileName] = { type: 'token', provider: provider, token: key };
    auth.lastGood[provider] = profileName;
    auth.usageStats[profileName] = { lastUsed: Date.now(), errorCount: 0 };

    const json = JSON.stringify(auth, null, 2);
    const dirs = [
      'agents/ops-monitor/agent',
      home + '/.openclaw/agents/ops-monitor/agent'
    ];
    fs.mkdirSync(home + '/.openclaw/agents/ops-monitor/sessions', { recursive: true });

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dir + '/auth-profiles.json', json);
      fs.chmodSync(dir + '/auth-profiles.json', 0o600);
    }
    console.log('Budget model auth written for ops-monitor');
  "
  echo "  Budget model auth configured for ops-monitor"
else
  echo "  No BUDGET_MODEL_API_KEY set — ops-monitor will use Anthropic (Haiku)"
fi

# ============================================================
# GATEWAY STARTUP
# ============================================================

echo ""
echo "Configuring gateway..."

openclaw doctor --fix 2>/dev/null || true
openclaw config set gateway.mode local 2>/dev/null || true
openclaw config set gateway.auth.mode token 2>/dev/null || true
openclaw config set gateway.auth.token "$GATEWAY_AUTH_TOKEN" 2>/dev/null || true

# Clear stale device pairing state for clean start
rm -f ~/.openclaw/devices/paired.json ~/.openclaw/devices/pending.json 2>/dev/null || true
mkdir -p ~/.openclaw/devices

# Disable device auth — gateway binds to loopback only
openclaw config set gateway.controlUi.allowInsecureAuth true 2>/dev/null || true
openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true 2>/dev/null || true
echo "  Device auth bypassed (loopback-only gateway)"

# Add Discord channel
if [ -n "$DISCORD_BOT_TOKEN" ]; then
  echo "Configuring Discord..."
  openclaw channels add --channel discord --token "$DISCORD_BOT_TOKEN" 2>/dev/null || true
fi

# Discord webhooks for agent identities
if [ -n "$DISCORD_BOT_TOKEN" ] && [ ! -f "$VOLUME_DIR/identity/webhooks.json" ]; then
  echo "Setting up Discord webhooks..."
  node /app/identity/setup-webhooks.js 2>/dev/null || echo "  (run manually: node identity/setup-webhooks.js)"
fi

# Merge config
echo "Merging agent config..."
envsubst < /app/openclaw.json > /tmp/openclaw-ours.json

node -e "
const fs = require('fs');
const base = JSON.parse(fs.readFileSync(process.env.HOME + '/.openclaw/openclaw.json', 'utf8'));
const ours = JSON.parse(fs.readFileSync('/tmp/openclaw-ours.json', 'utf8'));

['agents', 'bindings', 'tools', 'messages', 'commands', 'channels', 'plugins', 'models'].forEach(key => {
  if (ours[key]) base[key] = ours[key];
});

if (!base.channels) base.channels = {};
if (!base.channels.discord) base.channels.discord = {};
if (!base.channels.discord.token && process.env.DISCORD_BOT_TOKEN) {
  base.channels.discord.token = process.env.DISCORD_BOT_TOKEN;
}
base.channels.discord.enabled = true;
base.channels.discord.groupPolicy = 'open';
if (!base.channels.discord.dm) base.channels.discord.dm = {};
base.channels.discord.dm.policy = 'open';
base.channels.discord.dm.allowFrom = ['*'];

const guildId = process.env.DISCORD_GUILD_ID;
if (guildId) {
  if (!base.channels.discord.guilds) base.channels.discord.guilds = {};
  if (!base.channels.discord.guilds[guildId]) base.channels.discord.guilds[guildId] = {};
  base.channels.discord.guilds[guildId].requireMention = false;
}

const out = JSON.stringify(base, null, 2);
fs.writeFileSync(process.env.HOME + '/.openclaw/openclaw.json', out);
fs.writeFileSync('./openclaw.json', out);
const agents = (base.agents && base.agents.list) ? base.agents.list.length : 0;
const bindings = base.bindings ? base.bindings.length : 0;
console.log('Config merged: agents=' + agents + ', bindings=' + bindings);
"

# Launch gateway
echo "Launching OpenClaw Gateway..."

# Kill any existing gateway before starting
openclaw gateway stop 2>/dev/null || true
pkill -f "openclaw-gateway" 2>/dev/null || true
sleep 2

openclaw gateway --allow-unconfigured &
GATEWAY_PID=$!

echo "Waiting for gateway..."
sleep 10

# Auto-approve pending device pairing requests
sleep 3
openclaw devices approve --latest --token "$GATEWAY_AUTH_TOKEN" 2>/dev/null || true
echo "  Gateway ready"

# ============================================================
# CRON JOBS (13 total)
# Customize schedules and prompts for your project
# ============================================================

echo ""
echo "Registering cron jobs..."

# IMPORTANT: Remove ALL existing crons to prevent duplicates on restart
echo "Clearing existing cron jobs..."
EXISTING_IDS=$(openclaw cron list --json 2>/dev/null | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
if [ -n "$EXISTING_IDS" ]; then
  for CRON_ID in $EXISTING_IDS; do
    openclaw cron rm "$CRON_ID" 2>/dev/null || true
  done
  echo "  Removed existing cron jobs"
else
  echo "  No existing crons to remove"
fi

# ── Lead Agent Crons ──

# 1. Morning Standup (9 AM EST / 14:00 UTC)
openclaw cron add --agent lead-agent --schedule "0 14 * * 1-5" --name "morning-standup" --session isolated --message "
MORNING STANDUP: Review overnight activity and plan the day.
1. Check team dashboard: exec /app/tools/safe-exec.sh monitor dashboard
2. Check for stuck tasks: exec /app/tools/safe-exec.sh babysit check
3. Review open tasks and set priorities for today
4. Post a brief standup summary to #dev-work
" 2>/dev/null && echo "  1/13: morning-standup" || echo "  1/13: morning-standup (skipped)"

# 2. MR Review Check (every 15 min)
openclaw cron add --agent lead-agent --schedule "*/15 * * * *" --name "mr-review-check" --session isolated --message "
Check for unreviewed merge requests. If any found, review the diff and post feedback.
exec /app/tools/safe-exec.sh review check-mrs \$PROJECT_1_ID
" 2>/dev/null && echo "  2/13: mr-review-check" || echo "  2/13: mr-review-check (skipped)"

# 3. Proactive Scan (every 20 min)
openclaw cron add --agent lead-agent --schedule "*/20 * * * *" --name "proactive-scan" --session isolated --message "
Scan for actionable work. If anything found, create tasks or assign agents.
exec /app/tools/safe-exec.sh scan scan-all
" 2>/dev/null && echo "  3/13: proactive-scan" || echo "  3/13: proactive-scan (skipped)"

# 4. Intake Triage (every 30 min)
openclaw cron add --agent lead-agent --schedule "*/30 * * * *" --name "intake-triage" --session isolated --message "
Triage test failures and health alerts into tasks.
exec /app/tools/safe-exec.sh intake triage-all
" 2>/dev/null && echo "  4/13: intake-triage" || echo "  4/13: intake-triage (skipped)"

# 5. Git Issue Intake (every 30 min)
openclaw cron add --agent lead-agent --schedule "*/30 * * * *" --name "git-intake" --session isolated --message "
Poll git provider for new issues and create tasks.
exec /app/tools/safe-exec.sh git-intake intake-all
" 2>/dev/null && echo "  5/13: git-intake" || echo "  5/13: git-intake (skipped)"

# 6. Release Check (11 AM EST / 16:00 UTC)
openclaw cron add --agent lead-agent --schedule "0 16 * * 1-5" --name "release-check" --session isolated --message "
Check if a new release can be tagged.
exec /app/tools/safe-exec.sh version check-ready
If READY: exec /app/tools/safe-exec.sh version release minor
" 2>/dev/null && echo "  6/13: release-check" || echo "  6/13: release-check (skipped)"

# 7. Promotion Review (4 AM EST / 09:00 UTC)
openclaw cron add --agent lead-agent --schedule "0 9 * * *" --name "promotion-review" --session isolated --message "
Review self-learning promotion candidates.
1. exec /app/tools/safe-exec.sh knowledge check-promotions
2. exec /app/tools/safe-exec.sh knowledge list-promotions pending
3. For each candidate: approve if clear and actionable, reject if vague or one-off
4. exec /app/tools/safe-exec.sh knowledge apply-promotions
" 2>/dev/null && echo "  7/13: promotion-review" || echo "  7/13: promotion-review (skipped)"

# 8. Weekly Summary (Friday 5 PM EST / 22:00 UTC)
openclaw cron add --agent lead-agent --schedule "0 22 * * 5" --name "weekly-summary" --session isolated --message "
WEEKLY SUMMARY: Compile the week's accomplishments, blockers, and next week's priorities.
exec /app/tools/safe-exec.sh monitor dashboard
exec /app/tools/safe-exec.sh version status
Post a comprehensive summary to #dev-work.
" 2>/dev/null && echo "  8/13: weekly-summary" || echo "  8/13: weekly-summary (skipped)"

# ── DevOps Agent Crons ──

# 9. E2E Tests (6 AM EST / 11:00 UTC)
openclaw cron add --agent devops-agent --schedule "0 11 * * *" --name "e2e-tests" --session isolated --message "
Run full E2E test suite and export results.
exec /app/tools/safe-exec.sh e2e run-all
" 2>/dev/null && echo "  9/13: e2e-tests" || echo "  9/13: e2e-tests (skipped)"

# ── Ops Monitor Crons (runs on budget model) ──

# 10. Health Check (every 30 min)
openclaw cron add --agent ops-monitor --schedule "*/30 * * * *" --name "health-check" --session isolated --message "
Check system health. Report any issues to #dev-alerts.
Check process status, database connectivity, and API response times.
If anything is down, post an alert immediately.
Stay completely silent if all processes are online and stable.
" 2>/dev/null && echo "  10/13: health-check" || echo "  10/13: health-check (skipped)"

# 11. Smart Babysitter (every 10 min)
openclaw cron add --agent ops-monitor --schedule "*/10 * * * *" --name "smart-babysitter" --session isolated --message "
Check for stuck or failing tasks.
exec /app/tools/safe-exec.sh babysit check
If any tasks are stuck > 4 hours or at max retries, escalate to #dev-alerts.
" 2>/dev/null && echo "  11/13: smart-babysitter" || echo "  11/13: smart-babysitter (skipped)"

# 12. Daily Summary (8:30 PM local / adjust UTC offset)
openclaw cron add --agent ops-monitor --schedule "30 1 * * *" --name "daily-summary" --session isolated --message "
DAILY SUMMARY: Compile team dashboard and post to chat.
exec /app/tools/safe-exec.sh monitor dashboard
exec /app/tools/safe-exec.sh monitor tasks
Post a concise daily summary with: what was completed, what's in progress, system health.
" 2>/dev/null && echo "  12/13: daily-summary" || echo "  12/13: daily-summary (skipped)"

# ── Docs Agent Crons ──

# 13. Docs Update (3 AM EST / 08:00 UTC)
openclaw cron add --agent docs-agent --schedule "0 8 * * *" --name "docs-update" --session isolated --message "
Scan the codebase for changes and update documentation.
1. Scan the codebase for new/changed routes, APIs, and components
2. Compare with existing docs
3. Update any outdated pages
4. Take fresh screenshots if UI changed
5. Push updates to docs repo
" 2>/dev/null && echo "  13/13: docs-update" || echo "  13/13: docs-update (skipped)"

echo ""
echo "============================================================"
echo "Multi-Agent Team is running!"
echo ""
echo "  Agents: 5 (lead, engineer, devops, ops-monitor, docs)"
echo "  Crons:  13 (8 lead, 1 devops, 3 ops-monitor, 1 docs)"
echo "  Tools:  15"
echo ""
echo "  Dashboard: openclaw cron list"
echo "  Logs:      openclaw logs"
echo "============================================================"

# Wait for gateway
wait $GATEWAY_PID
