---
name: writing-plans
description: Create detailed implementation plans with exact file paths, code, test commands, and commit messages before spawning engineers
---

# Writing Plans — Detailed Implementation Plans

## When to Use

Use AFTER brainstorming is approved and BEFORE spawning engineers. Every non-trivial task needs a plan.

## Plan Structure

Every plan must include for each task:
- **Exact file paths** — which files to create, modify, or test
- **Complete code** — not "add validation" but the actual code
- **Test commands** — exact commands with expected output
- **Commit message** — what to commit after each task

## Process

### Step 1: Create Tasks in Registry

Break the approved design into discrete tasks:

```
exec /app/tools/safe-exec.sh task create "Task title" "Detailed description with:
- Files to touch
- What to implement
- How to test
- What to commit" "assignee"
```

### Step 2: Order by Dependencies

Tasks should follow dependency order:
1. Schema/database changes first
2. API routes second
3. Frontend components third
4. Infrastructure/config fourth
5. Deployment last

### Step 3: Write Plan Details

For each task, specify:

**Files:**
- Create: `src/app/api/new-route/route.ts`
- Modify: `prisma/schema.prisma` (add field X to model Y)
- Test: Run `exec /app/tools/safe-exec.sh e2e run [test-name]`

**Implementation:**
```
// Complete code, not pseudocode
```

**Verification:**
```
exec /app/tools/safe-exec.sh e2e run-all
```

**Commit:**
```
exec /app/tools/safe-exec.sh git commit [repo-path] -m "feat: description"
```

### Step 4: Post Plan to Discord

```
exec /app/tools/safe-exec.sh post lead-agent dev-work "PLAN: [Feature Name]

Tasks:
1. [Task] -> engineer-agent
2. [Task] -> engineer-agent
3. [Task] -> devops-agent (deploy)

Starting execution now."
```

### Step 5: Transition to Execution

Use the subagent-driven-development skill to execute tasks one by one with review between each.

## Key Principles

- Bite-sized tasks (one action per step)
- Complete code in plan (engineers should not need to guess)
- TDD: test command before implementation
- Frequent commits (one per task)
- DRY and YAGNI
