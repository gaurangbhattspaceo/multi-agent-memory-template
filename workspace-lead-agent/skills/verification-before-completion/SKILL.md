---
name: verification-before-completion
description: Run verification commands and confirm output before claiming any work is complete — evidence before assertions
---

# Verification Before Completion — Evidence Before Claims

## Iron Law

NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

Never say "done", "fixed", "passing", "deployed", or "working" without running a verification command and reading its output in THIS session.

## Gate Function

Before ANY completion claim:

1. **IDENTIFY** — What command verifies this claim?
2. **RUN** — Execute it (fresh, complete, not from memory)
3. **READ** — Read the actual output
4. **VERIFY** — Does output match your claim?
5. **ONLY THEN** — Make the claim

## Verification Commands by Claim Type

**"Tests pass":**
```
exec /app/tools/safe-exec.sh e2e run-all
exec /app/tools/safe-exec.sh e2e results
```
Read the results. Count passed vs failed. Only claim "tests pass" if 0 failures.

**"Feature works":**
```
exec /app/tools/safe-exec.sh e2e inspect /[page-path]
```
Read PAGE CONTENT. Confirm the feature is visible and no errors.

**"Build succeeds":**
Check process status — 0 restarts, uptime > 1 minute.

**"Deployed successfully":**
```
exec /app/tools/safe-exec.sh monitor dashboard
exec /app/tools/safe-exec.sh e2e run-all
```

**"Bug is fixed":**
1. Reproduce the original bug (should fail)
2. Apply fix
3. Run the same reproduction (should pass)
4. Run full test suite (no regressions)

## Rationalizations That Mean STOP

| Thought | Reality |
|---------|---------|
| "It should work" | Run the command. |
| "I'm confident" | Confidence is not evidence. |
| "I just ran it" | Run it again. Fresh. |
| "It's a small change" | Small changes break things. Verify. |
| "Tests were passing before" | They might not be now. Run them. |

## Posting Evidence

When reporting completion to Discord or the team, include the actual output:

```
exec /app/tools/safe-exec.sh post [agent] dev-work "COMPLETED: [task]

Verification:
- E2E tests: [X]/[Y] passed
- Health check: healthy
- Page inspect: [page] renders correctly, no errors
- Processes: 0 restarts, uptime [X]m"
```
