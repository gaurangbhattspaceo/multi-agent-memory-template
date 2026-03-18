# The 5-Layer Memory Architecture for Multi-Agent AI Systems

## A Practical Guide with OpenClaw

> "My agents forget context and my token usage is through the roof."
>
> Sound familiar? You're not alone. This is the #1 complaint from every team building multi-agent systems. Here's why it happens and exactly how to fix it.

---

## The Problem

Most multi-agent setups treat memory as one thing — a big context window that everything gets stuffed into. When the window fills up, the system either crashes, truncates, or does a "compaction" that wipes the slate clean. Your agent forgets everything it was working on. You burn tokens re-reading files. The same mistakes get repeated.

The fix isn't "more memory" or "bigger context windows." The fix is **layers**.

Think about how you remember things. You have:
- **Identity** — you know who you are without thinking about it
- **Working memory** — what you're actively thinking about right now
- **Long-term memory** — decisions, lessons, experiences you recall when needed
- **Learning** — you don't touch the stove twice
- **Tools** — you use a calculator instead of doing math in your head

Your agents need the same thing. Not one memory system — five.

```
┌─────────────────────────────────────────────────┐
│              Layer 5: Structural Understanding    │
│              (Code graph — AST-based tools)       │
├─────────────────────────────────────────────────┤
│              Layer 4: Self-Learning               │
│              (Error tracking → permanent rules)   │
├─────────────────────────────────────────────────┤
│              Layer 3: Persistent Memory           │
│              (Knowledge vault + daily files)       │
├─────────────────────────────────────────────────┤
│              Layer 2: Context Window Management   │
│              (Pruning + flush + reservation)       │
├─────────────────────────────────────────────────┤
│              Layer 1: Identity (SOUL.md)           │
│              (Who am I? What are my rules?)        │
└─────────────────────────────────────────────────┘
```

Let's build each layer.

---

## Layer 1: Identity — "Who Am I?"

### The Problem

Mid-session, your agent starts behaving differently. The lead agent writes code. The engineer agent makes architecture decisions. Nobody follows the rules you set. Why? Because identity lives in a system prompt that gets pushed out of context as the conversation grows.

### The Fix: SOUL.md

Give each agent a **persistent identity file** that gets loaded at the start of every session. This isn't a system prompt that fades — it's a permanent file on disk that the agent reads before doing anything.

```
your-project/
├── workspace-lead-agent/
│   └── SOUL.md          # Lead agent's identity
├── workspace-engineer-agent/
│   └── SOUL.md          # Engineer agent's identity
└── workspace-ops-monitor/
    └── SOUL.md           # Ops agent's identity
```

### What Goes in SOUL.md

A good SOUL.md has 5 sections:

```markdown
# Lead Agent — Your Project Name

## Your Identity
You are the lead agent on a 3-person AI engineering team.
You delegate work, review code, and make architecture decisions.
You do NOT write implementation code.

## Core Principles
1. Fix errors immediately. Don't ask. Don't wait.
2. Read before you write. Check what exists before creating new things.
3. Never force push, delete branches, or rewrite git history.

## What You Own
- Task prioritization and delegation
- Code review and MR approval
- Architecture decisions

## What You Don't Own
- Implementation code (that's the engineer's job)
- Deployment (that's the ops agent's job)

## Tool Usage Rules
| When... | Run this |
|---------|----------|
| You assign a task | `task update <id> in-progress "Starting work"` |
| You finish a review | `task update <id> review "Ready for review"` |
```

### OpenClaw Config

In `openclaw.json`, point each agent to its workspace:

```json
{
  "agents": {
    "list": [
      {
        "id": "lead-agent",
        "workspace": "/app/workspace-lead-agent",
        "model": "anthropic/claude-opus-4-6",
        "name": "Lead Agent"
      },
      {
        "id": "engineer-agent",
        "workspace": "/app/workspace-engineer-agent",
        "model": "anthropic/claude-sonnet-4-6",
        "name": "Engineer Agent"
      }
    ]
  }
}
```

### Before vs After

| Before | After |
|--------|-------|
| Agent drifts mid-session, starts doing things outside its role | Agent stays in character — lead delegates, engineer builds |
| Rules set in system prompt get pushed out of context | SOUL.md loads fresh every session, rules are always present |
| All agents behave the same (generic) | Each agent has clear ownership and boundaries |

---

## Layer 2: Context Window Management — "Don't Let It Overflow"

### The Problem

Your agent reads 10 files, runs 5 commands, gets a long error message. The context window fills up. The system does a "compaction" — summarizes everything and throws away the details. Your agent forgets what it was working on. Token usage spikes because the agent re-reads the same files.

This is the #1 cause of "my agents forget context."

### The Fix: Three Mechanisms

#### 2a. Memory Flush (Save Before Compaction)

When the context window is getting full — but BEFORE compaction — give the agent a warning: "You're about to lose context. Write down anything important."

```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "mode": "safeguard",
        "reserveTokensFloor": 20000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 40000,
          "systemPrompt": "Session nearing compaction. Store durable memories now.",
          "prompt": "Write any lasting notes to memory/YYYY-MM-DD.md. Focus on: key decisions made, current project status, tasks completed, lessons learned, and active blockers. Reply with NO_REPLY if nothing to store."
        }
      }
    }
  }
}
```

**How it works:**
1. Context reaches 40,000 tokens remaining → flush triggers
2. Agent writes important notes to `memory/YYYY-MM-DD.md`
3. Compaction happens — context gets summarized
4. Agent continues with summary + durable notes on disk

**Without this:** Compaction wipes everything. Agent starts from scratch.
**With this:** Agent saves key decisions and status before the wipe. Continuity preserved.

#### 2b. Context Pruning (Gradual Cleanup)

Instead of waiting for a catastrophic compaction, gradually remove stale context over time:

```json
{
  "agents": {
    "defaults": {
      "contextPruning": {
        "mode": "cache-ttl",
        "ttl": "6h",
        "keepLastAssistants": 3
      }
    }
  }
}
```

**How it works:**
- Tool outputs (file reads, search results, command output) older than 6 hours are automatically cleaned
- The last 3 agent responses are always preserved
- User messages are never pruned

**Why this matters for token cost:** Without pruning, your agent carries around every file it ever read. A 200k context window fills up fast. Pruning keeps only what's relevant, so you spend tokens on actual work — not on carrying stale grep results.

#### 2c. Token Reservation

Always keep a floor of tokens free so the agent can actually think and respond:

```json
"reserveTokensFloor": 20000
```

Without this, the context window can fill up completely, leaving the agent no room to reason or respond.

### Before vs After

| Before | After |
|--------|-------|
| Context fills up → catastrophic wipe → agent forgets everything | Memory flush saves key context before compaction |
| Stale file reads pile up → tokens wasted | 6-hour TTL prunes old tool outputs automatically |
| Agent re-reads same files every session | Pruning keeps recent context, drops stale reads |
| Token usage: unpredictable spikes | Token usage: steady, predictable |

---

## Layer 3: Persistent Memory — "Remember Across Sessions"

### The Problem

Session ends. Agent dies. Everything it learned — decisions, patterns, gotchas — dies with it. Next session starts fresh. The agent re-discovers the same things. You burn tokens on repeated exploration.

### The Fix: Three Storage Systems

#### 3a. Daily Memory Files

Agents write notes to disk. These survive across sessions:

```
/data/lead-agent/memory/
├── 2026-03-01.md    # Monday's notes
├── 2026-03-02.md    # Tuesday's notes
└── 2026-03-03.md    # Wednesday's notes
```

A typical daily note:

```markdown
# 2026-03-03 Daily Notes

## Key Decisions
- Decided to use Resend for email service (simplest setup, free tier sufficient)
- Approved refactoring auth flow to support magic links alongside SSO

## Tasks Completed
- TASK-045: Fixed dashboard timeout (root cause: staleTime=0 in TanStack Query)
- TASK-046: Added ETA column to jobs table

## Lessons Learned
- TanStack Query staleTime=0 causes re-fetch storm on large datasets — always set > 0
- Must run full E2E suite before creating MR, not just the specific test

## Active Blockers
- Email provider API key not yet provisioned
```

#### 3b. Knowledge Vault (Shared Across Agents)

A structured JSON store that all agents read and write to:

```
/data/knowledge/
├── patterns.json      # Successful, repeatable solutions
├── failures.json      # Error lessons with recurrence tracking
├── decisions.json     # Architecture and policy decisions
└── promotions.json    # Learned rules pending approval
```

**Pattern example:**
```json
{
  "id": "PAT-012",
  "name": "TanStack Query staleTime optimization",
  "category": "performance",
  "description": "Dashboard loads slowly → check staleTime config",
  "promptTemplate": "Check TanStack Query staleTime and cacheTime. staleTime=0 causes re-fetch storm.",
  "usedCount": 15,
  "successCount": 13,
  "successRate": 0.867
}
```

When the lead agent spawns an engineer for a task, it searches the knowledge vault first and includes relevant patterns in the context:

```bash
# Lead agent does this before every delegation
knowledge search patterns "dashboard performance"
knowledge search failures "TanStack"
```

#### 3c. Hybrid Memory Search

Configure search to use both vector (conceptual) and keyword (exact) matching:

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "query": {
          "hybrid": {
            "enabled": true,
            "vectorWeight": 0.7,
            "textWeight": 0.3
          }
        },
        "experimental": {
          "sessionMemory": true
        },
        "sources": ["memory", "sessions"]
      }
    }
  }
}
```

**Why hybrid?**
- Vector search (70%) finds conceptual matches: "dashboard is slow" matches "performance optimization"
- Text search (30%) finds exact matches: "TASK-045" matches "TASK-045"
- Session memory indexes past conversations — so "what did we discuss last Tuesday?" works

### Before vs After

| Before | After |
|--------|-------|
| Session ends, all knowledge lost | Daily files + Knowledge Vault persist across sessions |
| Agent re-discovers the same patterns | Lead agent searches vault before every delegation |
| "What did we decide about X?" → agent doesn't know | Hybrid search finds decisions across memory + sessions |
| Each agent has its own isolated memory | Knowledge Vault is shared — all agents learn from each other |

---

## Layer 4: Self-Learning — "Don't Touch the Stove Twice"

### The Problem

Your agent hits an error. It fumbles through a fix. Next week, it hits the exact same error. Fumbles again. And again. It never learns from its mistakes because errors aren't tracked or analyzed.

### The Fix: Error Fingerprinting + Promotion Pipeline

This is the most powerful layer. It turns your agents from stateless executors into a team that genuinely improves over time.

#### Step 1: Auto-Capture Errors

Wrap all tool calls in a learning wrapper. When any tool fails, automatically log the error:

```bash
# In your tool wrapper (safe-exec.sh):
run_and_learn() {
  local TOOL_NAME="$1"
  shift

  # Run the command
  "$@"
  local EXIT_CODE=$?

  # If it failed, log to knowledge vault
  if [ $EXIT_CODE -ne 0 ]; then
    knowledge log-error "$AGENT_ID" "$TOOL_NAME" "$EXIT_CODE" "$(tail -5 /tmp/last-output)"
  fi

  return $EXIT_CODE
}
```

Every tool failure gets captured — no manual logging needed.

#### Step 2: Fingerprint and Track Recurrence

Each error gets a fingerprint based on its type and key characteristics:

```json
{
  "id": "FAIL-089",
  "errorType": "timeout-error",
  "fingerprint": "timeout-error:dashboard-load",
  "recurrenceCount": 3,
  "rootCause": "TanStack Query staleTime=0 causes re-fetch storm",
  "lesson": "Always set staleTime > 0 for large datasets",
  "tasks": ["TASK-045", "TASK-052", "TASK-061"]
}
```

When the same fingerprint appears again, the recurrence counter increments. No duplicates — just a count.

#### Step 3: Promote to Permanent Rules

When an error recurs 3+ times across 2+ different tasks and is older than 24 hours, it becomes a **promotion candidate** — a rule that should be permanently written into the agent's SOUL.md:

```
Error occurs → Fingerprinted → Recurs 3+ times → Promotion candidate
     → Lead agent reviews daily → Approved → Written to SOUL.md
```

**The promotion review (daily cron):**
1. System detects candidates automatically
2. Lead agent reviews each one: Is it genuine? Clear? Actionable?
3. Approved rules get written to the target agent's SOUL.md under "Learned Rules"
4. That agent never makes that mistake again

**Example promotion:**
```markdown
## Learned Rules (Auto-Promoted)

- **[2026-03-01]** Always set TanStack Query staleTime > 0 for data fetching
  on pages with large datasets. staleTime=0 causes re-fetch storm.
  (Source: FAIL-089, 3 occurrences across TASK-045, TASK-052, TASK-061)
```

#### Quality Bar

Not every error deserves promotion. The lead agent rejects:
- Vague rules ("be careful with queries")
- Overly specific rules ("always check line 42 of build.js")
- One-off mistakes that won't recur

Only clear, actionable rules that prevent a CLASS of errors get promoted.

### Before vs After

| Before | After |
|--------|-------|
| Same error occurs 10 times | Error fingerprinted on first occurrence, tracked on repeats |
| No one knows about past mistakes | Knowledge Vault stores all errors with root cause + lesson |
| Agents start every session from zero | SOUL.md accumulates learned rules over time |
| "Why does this keep happening?" | Promotion pipeline catches recurring errors and fixes them permanently |

---

## Layer 5: Structural Understanding — "Stop Reading Every File"

### The Problem

Agent needs to understand how a function works. It greps for the function name. Finds 20 matches. Reads 10 files. Burns 50,000 tokens. Still doesn't know who calls the function or what breaks if it changes.

### The Fix: Code Graph (AST-Based Analysis)

Instead of text search, give agents access to a code knowledge graph that understands your codebase structurally — functions, classes, call chains, imports.

We use [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) — a single Go binary that:
1. Parses your code with tree-sitter (35 languages)
2. Builds a knowledge graph in SQLite
3. Answers structural queries in milliseconds
4. Auto-syncs when code changes

**Key queries:**
```bash
# "What functions are related to authentication?"
graph search_graph '{"name_pattern": ".*auth.*", "label": "Function"}'

# "What calls this function?" (find all callers before changing it)
graph trace_call_path '{"function_name": "createSession", "direction": "inbound", "depth": 3}'

# "What breaks if I change these files?" (blast radius for MRs)
graph detect_changes '{"scope": "staged", "depth": 3}'

# "Show me the architecture"
graph get_architecture '{"aspects": ["all"]}'
```

**The SOUL.md rule:** Make graph tools the FIRST step for ANY code question. Before grep, before reading files, before answering from memory — query the graph.

### Token Savings

| Approach | Tokens Used | Time |
|----------|------------|------|
| Grep + read 10 files | ~50,000 | 30+ seconds |
| Graph query | ~500 | < 1 second |

That's 99% fewer tokens for the same answer — but more accurate, because it's based on AST structure, not text matching.

### Before vs After

| Before | After |
|--------|-------|
| Agent greps, reads 10 files, still misses callers | Graph traces full call chain in one query |
| "What breaks if I change X?" → agent guesses | `detect_changes` shows exact blast radius with risk level |
| Understanding architecture requires reading dozens of files | `get_architecture` returns the full picture in 500 tokens |
| Token budget burned on file reading | 99% fewer tokens for structural queries |

---

## Putting It All Together

Here's how the 5 layers work together in a real workflow:

```
1. Agent session starts
   └── Layer 1: SOUL.md loads → agent knows its identity, rules, tools

2. User asks: "What would break if we add magic link auth?"
   └── Layer 5: Agent queries code graph → finds auth functions, call chains
   └── Layer 3: Agent searches knowledge vault → finds past auth-related patterns
   └── Agent answers with structural understanding + historical context

3. Agent starts implementing
   └── Layer 2: Context pruning keeps window clean as agent reads/writes files
   └── Layer 4: Auto-learning captures any tool errors during implementation

4. Agent hits an error it's seen before
   └── Layer 4: Recurrence counter increments → becomes promotion candidate
   └── Layer 1: Existing learned rules in SOUL.md prevent known mistakes

5. Session nearing context limit
   └── Layer 2: Memory flush triggers → agent writes key decisions to disk
   └── Layer 3: Daily memory file preserved for next session

6. Next day, lead agent runs promotion review
   └── Layer 4: Recurring error promoted → written to engineer's SOUL.md
   └── Layer 1: SOUL.md updated → agent never makes that mistake again
```

### Adoption Path

You don't need all 5 layers on day one. Start with Layer 1 and add layers as you grow:

1. **Day 1: Identity (SOUL.md)** — Takes 30 minutes. Immediate improvement in agent behavior.
2. **Week 1: Context Window** — Add compaction/pruning config. Reduces token waste.
3. **Week 2: Persistent Memory** — Set up knowledge vault. Agents remember across sessions.
4. **Month 1: Self-Learning** — Add error tracking and promotion pipeline. Agents improve over time.
5. **When ready: Structural Understanding** — Install code graph. Massive token savings.

---

## Template Repo

We've open-sourced our full configuration as a starter template:

**[github.com/gaurangbhattspaceo/multi-agent-memory-template](https://github.com/gaurangbhattspaceo/multi-agent-memory-template)**

```
multi-agent-memory-template/
├── README.md                          # Quick start guide
├── openclaw.json                      # Full config with all 5 layers
├── workspace-lead-agent/
│   └── SOUL.md                        # Lead agent template
├── workspace-engineer-agent/
│   └── SOUL.md                        # Engineer agent template
├── tools/
│   ├── knowledge-vault.js             # Self-learning system
│   └── safe-exec.sh                   # Tool wrapper with auto-learning
└── docs/
    └── five-layer-memory-guide.md     # This guide
```

Clone it, replace the generic placeholders with your project details, and you'll have a working 5-layer memory system in under an hour.

---

## Summary

| Layer | What it Does | Config Location | Setup Time |
|-------|-------------|-----------------|------------|
| **1. Identity** | Agent knows its role, rules, tools | `workspace-*/SOUL.md` | 30 min |
| **2. Context Window** | Prevents catastrophic context loss | `openclaw.json: agents.defaults` | 15 min |
| **3. Persistent Memory** | Knowledge survives across sessions | `openclaw.json + /data/knowledge/` | 1 hour |
| **4. Self-Learning** | Agents learn from mistakes permanently | `tools/knowledge-vault.js` | 2 hours |
| **5. Structural Understanding** | AST-based code analysis, 99% fewer tokens | `codebase-memory-mcp binary` | 30 min |

The difference between agents that "forget everything" and agents that improve over time isn't more compute or bigger context windows. It's architecture. Five layers, each solving a specific problem.

Build them in order. Start today.
