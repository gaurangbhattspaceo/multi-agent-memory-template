---
name: brainstorming
description: Design features before coding — explore, propose approaches, get approval before spawning engineers
---

# Brainstorming — Design Before Code

## When to Use

Use BEFORE spawning any engineer for a new feature, architecture change, or non-trivial task. If you're about to `sessions_spawn` for implementation, STOP and brainstorm first.

## Hard Gate

Do NOT spawn engineers or write code until you have:
1. Explored the codebase to understand current state
2. Posted 2-3 approaches with trade-offs to #dev-work
3. Received project owner approval

## Process

### Step 1: Explore Context

Before proposing anything:

```
exec /app/tools/safe-exec.sh scan scan-all
exec /app/tools/safe-exec.sh git log [repo-path] -10
exec /app/tools/safe-exec.sh knowledge read decisions
```

Read DANGER-ZONES.md. Understand what exists before proposing changes.

### Step 2: Post Approaches to Discord

Post 2-3 approaches to #dev-work with trade-offs and your recommendation:

```
exec /app/tools/safe-exec.sh post lead-agent dev-work "DESIGN: [Feature Name]

Approach 1 (Recommended): [description]
- Pro: [benefit]
- Con: [cost]

Approach 2: [description]
- Pro: [benefit]
- Con: [cost]

My recommendation: Approach 1 because [reason].

Waiting for approval before proceeding."
```

### Step 3: Wait for Approval

Do NOT proceed until the project owner responds in #dev-tasks or #dev-work. If no response within the current session, note the pending design and move on to other work.

### Step 4: Transition to Planning

Once approved, invoke the writing-plans skill to create a detailed implementation plan before spawning engineers.

## Anti-Patterns

- "This is too simple to need a design" — Simple tasks cause the most wasted work from unexamined assumptions.
- "I'll just have the engineer figure it out" — Engineers need clear direction, not vague tasks.
- "We already know how to do this" — Search knowledge vault first: `exec /app/tools/safe-exec.sh knowledge search decisions "[keyword]"`

## Key Principles

- YAGNI ruthlessly — remove unnecessary features from all designs
- Lead with your recommendation — don't present options without opinion
- Scale to complexity — a few sentences for simple tasks, detailed analysis for complex ones
