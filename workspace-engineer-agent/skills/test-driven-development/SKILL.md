---
name: test-driven-development
description: Write failing test first, then implement minimal code to pass, then refactor — no production code without a failing test
---

# Test-Driven Development — Red, Green, Refactor

## Iron Law

NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.

If you're about to write implementation code, STOP. Write the test first.

## The Cycle

### 1. RED — Write a Failing Test

Write a test that describes the behavior you want.

### 2. RUN — Verify It Fails

Run the test and confirm it fails for the RIGHT reason:

```
exec /app/tools/safe-exec.sh e2e run [test-name]
```

Expected: FAIL with a clear error (function not found, endpoint 404, etc.)

If it passes before you've written code -> your test isn't testing the right thing.

### 3. GREEN — Write Minimal Code

Write the MINIMUM code to make the test pass. No extra features, no "while I'm here" additions.

### 4. RUN — Verify It Passes

```
exec /app/tools/safe-exec.sh e2e run [test-name]
```

Expected: PASS

### 5. REFACTOR — Clean Up (If Needed)

Only if the code is messy. Don't refactor for the sake of it.

### 6. COMMIT

```
exec /app/tools/safe-exec.sh git add [worktree] -A
exec /app/tools/safe-exec.sh git commit [worktree] -m "feat: [what the test proves works]"
```

## Anti-Patterns

- **"Too simple to test"** — Simple code breaks too. Write the test.
- **"I'll write tests after"** — You won't. And if you do, they'll test implementation, not behavior.
- **"Tests slow me down"** — Tests prevent 3-hour debugging sessions. They speed you up.
- **"I'll just manually test it"** — Manual tests don't run in CI. Write automated tests.
- **"Mocking everything"** — Only mock external services. Integration tests use real connections.

## What Makes a Good Test

- **Tests behavior, not implementation** — "returns filtered results" not "calls findMany with where clause"
- **One assertion per concept** — Each test proves one thing
- **Clear name** — `it('returns 401 when no auth token')` not `it('works')`
- **No test-only code in production** — Never add methods just for testing
