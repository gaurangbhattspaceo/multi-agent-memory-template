---
name: systematic-debugging
description: Find root cause before attempting fixes — 4-phase investigation, never guess-fix
---

# Systematic Debugging — Root Cause First

## Iron Law

NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.

If you're about to change code to "try something," STOP. Investigate first.

## The 4 Phases

### Phase 1: Root Cause Investigation

1. **Read the error** — Read the FULL error message, stack trace, and logs
   ```
   exec /app/tools/safe-exec.sh retry analyze "[error output]"
   ```

2. **Reproduce** — Can you make the error happen consistently?

3. **Check recent changes** — What changed since it last worked?
   ```
   exec /app/tools/safe-exec.sh git log [worktree] -10
   exec /app/tools/safe-exec.sh git diff [worktree]
   ```

4. **Gather evidence** — Don't theorize without data

### Phase 2: Pattern Analysis

1. **Find working examples** — Is there similar code that works?
   ```
   exec /app/tools/safe-exec.sh knowledge search patterns "[keyword]"
   exec /app/tools/safe-exec.sh knowledge search failures "[keyword]"
   ```

2. **Compare** — What's different between working and broken code?

3. **Check dependencies** — Is the issue in your code or something upstream?

### Phase 3: Hypothesis and Testing

1. **Form ONE hypothesis** — "The error occurs because X"
2. **Test minimally** — Change ONE thing to verify
3. **If wrong** — Return to Phase 1, don't stack guesses

### Phase 4: Implementation

1. **Write a failing test** that reproduces the bug
2. **Fix the root cause** (not the symptom)
3. **Verify the test passes**
4. **Run full test suite** — no regressions
5. **Log the failure** for future reference:
   ```
   exec /app/tools/safe-exec.sh retry log [task-id] "[what failed and why]"
   exec /app/tools/safe-exec.sh knowledge add failure "[task-id]" "[error-type]" "[root-cause]" "[lesson-learned]"
   ```

## Rationalizations That Mean STOP

| Thought | Reality |
|---------|---------|
| "Let me just try this quick fix" | That's guessing. Investigate first. |
| "It's probably X" | Probably is not certainly. Verify. |
| "I'll fix it and see if it helps" | You're changing code without understanding. |
| "Multiple things might be wrong" | Fix one thing at a time. |
| "I've seen this before" | Check knowledge vault, but verify in THIS codebase. |

## When You're Stuck (3+ Failed Fixes)

Don't keep guessing. Escalate:

```
exec /app/tools/safe-exec.sh retry log [task-id] "[what you tried]"
sessions_send(agentId: "lead-agent", message: "BLOCKED on [task-id]: Tried [N] fixes. Root cause unclear.
Symptoms: [description]
Investigated: [what you checked]
Hypotheses tried: [list]
Need: [what would help]")
```
