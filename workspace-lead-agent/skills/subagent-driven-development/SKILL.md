---
name: subagent-driven-development
description: Execute implementation plans by spawning one engineer per task with structured review between each
---

# Subagent-Driven Development — Spawn, Review, Repeat

## When to Use

Use when you have a written plan (from writing-plans skill) and need to execute it task by task.

## Core Principle

One engineer per task + structured review after each = high quality, no context pollution.

## Process

### For Each Task in the Plan:

#### 1. Spawn Engineer with Full Context

```
sessions_spawn(agentId: "engineer-agent", message: "TASK: [Task title]

WHAT: [Exact description of what to build]

WHY: [Context — how this fits into the larger feature]

FILES:
- Create: [exact paths]
- Modify: [exact paths]

CODE:
[Complete code from the plan]

TESTING:
- Write failing test first
- Run: [exact test command]
- Expected: PASS

CONSTRAINTS:
- Check DANGER-ZONES.md before modifying [critical file]
- [Security requirements, e.g. input validation, auth checks]

WHEN DONE:
1. Create MR: exec /app/tools/safe-exec.sh git-api create-mr [project-id] [branch] main '[title]' '[description]'
2. Update task: exec /app/tools/safe-exec.sh task update [task-id] review
3. Post to #dev-work: exec /app/tools/safe-exec.sh post engineer-agent dev-work 'Completed: [description]. MR #[number]'
4. Send completion: sessions_send(agentId: 'lead-agent', message: 'DONE: [task-id] — MR #[number]')")
```

#### 2. Review the MR

After engineer reports completion:

```
exec /app/tools/safe-exec.sh review get-diff [project-id] [mr-iid]
```

Review checklist:
- [ ] Matches plan specification (nothing more, nothing less)
- [ ] Tests exist and cover the feature
- [ ] No DANGER-ZONES violations
- [ ] No hardcoded secrets
- [ ] No breaking changes to API response shapes
- [ ] Code is clean and follows existing patterns

#### 3. Approve or Request Fixes

**If approved:**
```
exec /app/tools/safe-exec.sh review post [project-id] [mr-iid] "APPROVED: Matches spec, tests pass, no issues."
exec /app/tools/safe-exec.sh git-api merge-mr [project-id] [mr-iid]
exec /app/tools/safe-exec.sh task update [task-id] done
```

**If issues found:**
```
exec /app/tools/safe-exec.sh review post [project-id] [mr-iid] "CHANGES REQUESTED:
1. [Issue with file:line reference]
2. [Issue with file:line reference]"
```

Then re-spawn engineer with fix instructions. Do NOT skip the re-review.

#### 4. Move to Next Task

Only after current task is merged and verified. Never skip ahead.

## Red Flags

- Never spawn multiple engineers on dependent tasks simultaneously
- Never skip review (even if engineer self-reviewed)
- Never proceed with unfixed issues
- Never merge without reading the diff
