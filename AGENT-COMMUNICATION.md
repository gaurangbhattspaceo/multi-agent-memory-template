# Agent Communication — Peer-to-Peer Model

## How This Team Communicates

This team uses **peer-to-peer communication**, not hub-and-spoke. Agents talk directly to each other using `sessions_send`, not just through the Lead Agent.

### Communication Flow
```
Project Owner -> Lead Agent -> decomposes task -> spawns engineers with full context
                                                  <-> engineers talk to each other via sessions_send
                                                  <-> engineers post progress to #dev-work
                                Lead Agent reviews -> approves -> DevOps deploys
```

## Communication Tools

### sessions_spawn — Delegate a task
Lead Agent uses this to assign work:
```
sessions_spawn(agentId: "engineer-agent", task: "FULL CONTEXT + DELIVERABLES + CONSTRAINTS")
```

### sessions_send — Quick coordination
Any agent uses this for questions, updates, contract sharing:
```
sessions_send(agentId: "engineer-agent", message: "API schema changed: endpoint now requires dateFrom parameter")
```

### Discord — Visibility for project owner
All agents post to #dev-work for transparency:
```
exec /app/tools/safe-exec.sh post <agent-id> dev-work "message"
```

## Communication Patterns

### Pattern 1: Engineer builds feature, DevOps deploys
```
1. Lead Agent spawns engineer-agent: "Build new feature"
2. Engineer completes -> posts to #dev-work
3. Lead Agent reviews MR in #dev-reviews
4. Lead Agent spawns devops-agent: "Deploy to staging"
5. DevOps deploys -> runs health check -> posts to #dev-alerts
```

### Pattern 2: Schema change affects multiple services
```
1. Lead Agent spawns engineer-agent: "Add field to model"
2. Engineer updates schema + API
3. Engineer sends to devops-agent: "Schema updated — dependent services need migration"
4. Lead Agent spawns devops-agent: "Update dependent service schemas"
5. Both complete -> coordinated deploy
```

## Rules

1. **Always post to #dev-work** — Project owner needs to see progress
2. **Use sessions_send for quick questions** — don't spawn a new task for a question
3. **Share schema changes proactively** — dependent services need to know
4. **Flag blockers immediately** — tell lead-agent if you're stuck
5. **Don't duplicate work** — check what other agents are building before starting

## Agent-to-Agent Config

Enabled in openclaw.json:
```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true,
      "allow": ["lead-agent", "engineer-agent", "devops-agent", "ops-monitor", "docs-agent"]
    }
  }
}
```

All 5 agents can message any other agent directly.
