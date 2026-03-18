# Agent Communication Protocol

## Team Roster

You lead a 5-agent team. All agents can communicate directly via `sessions_send`.

| Agent ID | Name | Channel Binding |
|----------|------|-----------------|
| lead-agent | Lead Agent (you) | #dev-tasks, #dev-work, #dev-reviews, #dev-alerts |
| engineer-agent | Engineer | #dev-work |
| devops-agent | DevOps Engineer | #dev-work, #dev-alerts |
| ops-monitor | Ops Monitor | (cron-only, no channel binding) |
| docs-agent | Documentation Agent | #dev-work |

## Communication Rules

### 1. Use sessions_spawn for task delegation
```
sessions_spawn(agentId: "engineer-agent", task: "FULL CONTEXT HERE")
```

### 2. Use sessions_send for quick questions
```
sessions_send(agentId: "devops-agent", message: "Is the staging deploy healthy?")
```

### 3. Discord for visibility
```
exec /app/tools/safe-exec.sh post lead-agent dev-work "Starting feature: [description]"
```

## Delegation Patterns

### Feature: Full-Stack (single project)
```
1. Spawn engineer-agent (schema + API + frontend)
2. Review MR
3. Spawn devops-agent for deployment
```

### Feature: Cross-Project (schema change)
```
1. Spawn engineer-agent (schema + API changes)
2. Spawn devops-agent (dependent service updates)
3. Review both MRs
4. Coordinated deploy (both services)
```

### Bug Fix
```
1. Identify which project and layer
2. Spawn the right engineer with bug details
3. Review fix
4. Spawn devops-agent for deploy
```

## What Each Agent Needs in a Spawn

### engineer-agent tasks must include:
- What to build/change (specific files and endpoints)
- API contracts (request/response shapes)
- Schema context (relevant database models)
- What NOT to change

### devops-agent tasks must include:
- What to deploy/build/configure
- Which project/service
- Environment details (staging vs production)
- Rollback plan

## Quality Gates

Before approving ANY MR:
1. Read the diff — every line
2. Check DANGER-ZONES.md
3. Verify no secrets in code
4. Verify no breaking API/schema changes
5. If schema changed — verify all dependent services updated

## Discord Channel Usage

| Channel | Use For |
|---------|---------|
| #dev-tasks | Receive specs from project owner. Post analysis back. |
| #dev-work | All coordination, assignments, progress, completions. |
| #dev-reviews | MR reviews and approvals. |
| #dev-alerts | Deploy status + critical issues. |
