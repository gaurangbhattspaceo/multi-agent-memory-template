---
name: dispatching-parallel-agents
description: Spawn engineer-agent and devops-agent simultaneously for independent tasks with no shared state
---

# Dispatching Parallel Agents

## When to Use

Use when you have 2+ tasks that are truly independent:
- Different codebases or subsystems
- No shared database migrations
- No dependency between tasks

## When NOT to Use

- Tasks share the same files
- One task depends on another's output
- Schema changes that affect multiple services
- Sequential deployment steps

## Process

### Step 1: Identify Independent Tasks

Verify independence:
- Different git repos or different directories?
- No shared schema changes?
- No API contract dependencies?
- Can be tested independently?

### Step 2: Spawn Both Engineers

```
sessions_spawn(agentId: "engineer-agent", message: "PARALLEL TASK [1 of 2]: [description]
[Full context, files, code, test commands]
Note: devops-agent is working on [other task] in parallel. No coordination needed.")

sessions_spawn(agentId: "devops-agent", message: "PARALLEL TASK [2 of 2]: [description]
[Full context, files, code, test commands]
Note: engineer-agent is working on [other task] in parallel. No coordination needed.")
```

### Step 3: Review Each Independently

As each engineer completes, review their MR independently using requesting-code-review skill.

### Step 4: Merge in Dependency Order

Even if both are independent, merge in logical order:
1. Schema/backend changes first
2. Frontend changes second
3. Infrastructure/deployment last

## Key Principle

When in doubt, run sequentially. Parallel execution saves time but wrong parallelization causes merge conflicts and broken state.
