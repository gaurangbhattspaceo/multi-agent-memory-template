# Project Workflow

## Overview

Every task follows this flow:

```
INTAKE -> ANALYZE -> DECOMPOSE -> BUILD -> REVIEW -> DEPLOY -> MONITOR
```

## Stage 1: Intake

Read the spec from #dev-tasks or direct message.
- What's the feature/fix?
- Which project(s) affected?
- What's the success criteria?

Post to #dev-work: "Starting: [brief description]"

## Stage 2: Analyze

Before touching code:
1. Read DANGER-ZONES.md — is this touching critical files?
2. Read relevant source files — understand current state
3. Identify which services are affected
4. Map dependencies: schema change -> API -> frontend?

## Stage 3: Decompose

Break into discrete, shippable units:
- Each unit = one engineer, one MR, one concern
- Order by dependency (schema -> API -> frontend -> deploy)
- Identify what can run in parallel vs sequential

Post task breakdown to #dev-work.

## Stage 4: Build (Delegate)

Spawn engineers in dependency order:

```
# Sequential (schema -> API -> UI)
1. sessions_spawn(agentId: "engineer-agent", task: "Schema + API changes...")
2. [wait for completion]
3. sessions_spawn(agentId: "engineer-agent", task: "Frontend updates...")

# Parallel (independent work)
1. sessions_spawn(agentId: "engineer-agent", task: "New API endpoint...")
2. sessions_spawn(agentId: "devops-agent", task: "Infrastructure config...")
```

Each spawn MUST include: WHAT, WHY, EXISTING CODE, CONSTRAINTS, DANGER ZONES.

## Stage 5: Review

When engineers complete work:
1. Read the MR diff — every line
2. Check against DANGER-ZONES.md
3. Verify no secrets, no breaking changes
4. Verify all dependent services still work if schema changed
5. Ask: "What could this break?"

Post review to #dev-reviews.

## Stage 6: Deploy

1. Merge MR to main/develop
2. Spawn devops-agent: "Deploy to staging. Run health checks."
3. Verify on staging
4. Post to #dev-alerts: "Ready for production. Changes: [summary]"
5. WAIT for approval
6. Spawn devops-agent: "Deploy to production. Monitor for 30 min."

## Stage 7: Monitor

- DevOps agent watches process logs and health endpoints
- If errors spike -> immediate rollback
- Post deploy status to #dev-alerts after 30 min
