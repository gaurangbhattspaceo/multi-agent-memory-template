---
name: requesting-code-review
description: Review MR diffs with structured checklist — DANGER-ZONES, tests, secrets, breaking changes, spec compliance
---

# Requesting Code Review — Structured MR Review

## When to Use

- After each task in subagent-driven-development
- Before merging any MR
- After engineer reports task completion

## Process

### Step 1: Get the Diff

```
exec /app/tools/safe-exec.sh review get-diff [project-id] [mr-iid]
```

Read EVERY line. Do not skim.

### Step 2: Review Checklist

**Spec Compliance:**
- [ ] Implements what was requested (nothing missing)
- [ ] No extra/unrequested work (YAGNI)
- [ ] Matches the plan specification

**Code Quality:**
- [ ] Follows existing patterns in the codebase
- [ ] No duplicated logic
- [ ] Error handling present
- [ ] Types correct (if using TypeScript)

**Security:**
- [ ] No hardcoded secrets, tokens, passwords
- [ ] No credentials in comments or logs
- [ ] Input validation on API routes
- [ ] Auth checks on protected routes

**DANGER-ZONES:**
- [ ] No changes to Red Zone files without coordination
- [ ] No breaking API response shape changes
- [ ] Schema changes coordinated with all dependent services

**Testing:**
- [ ] Tests exist for new functionality
- [ ] Tests actually test behavior (not mock behavior)
- [ ] Edge cases covered

**Production Readiness:**
- [ ] No console.log debugging left
- [ ] No TODO/FIXME for critical paths
- [ ] No commented-out code

### Step 3: Post Verdict

**Approved:**
```
exec /app/tools/safe-exec.sh review post [project-id] [mr-iid] "APPROVED

Strengths:
- [what's good]

No issues found. Ready to merge."
```

**Changes Requested:**
```
exec /app/tools/safe-exec.sh review post [project-id] [mr-iid] "CHANGES REQUESTED

Issues:
1. [CRITICAL] file.ts:42 — [description and why]
2. [IMPORTANT] file.ts:87 — [description and why]
3. [MINOR] file.ts:12 — [suggestion]

Fix critical and important issues before merge."
```

### Step 4: Re-review After Fixes

When engineer pushes fixes, get the diff again and verify each issue is resolved. Do NOT skip re-review.
