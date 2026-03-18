# Danger Zones

> This file maps every file and directory in the codebase by risk level.
> Before changing anything, check this file first. If the file you are about
> to edit is in the Red or Orange zone, proceed with extreme caution.

---

## Red Zone — Break Everything

These files, if changed incorrectly, will bring down the entire application or
corrupt data. **Never change these without a review from the tech lead agent.**

| File / Directory | Why It Is Dangerous | Safe Change Protocol |
|-----------------|--------------------|--------------------|
| [FILL IN: e.g. "prisma/schema.prisma"] | [FILL IN: e.g. "Database schema — a bad migration can corrupt or drop production data"] | [FILL IN: e.g. "Always create a migration, test on staging, back up DB first"] |
| [FILL IN: e.g. "src/middleware/auth.ts"] | [FILL IN: e.g. "Authentication — a bug here locks out all users or exposes private data"] | [FILL IN: e.g. "Full test suite must pass, manual verification of login flow"] |
| [FILL IN: e.g. "src/config/database.ts"] | [FILL IN: e.g. "Connection pool — wrong settings cause connection exhaustion or total outage"] | [FILL IN: e.g. "Test with connection limit stress test before deploying"] |
| [FILL IN: e.g. "docker-compose.yml"] | [FILL IN: e.g. "Service orchestration — a typo can prevent all containers from starting"] | [FILL IN: e.g. "Validate syntax, test locally with docker compose up"] |
| [FILL IN: e.g. ".env / .env.production"] | [FILL IN: e.g. "Secrets and config — wrong values break every external integration at once"] | [FILL IN: e.g. "Never commit, always double-check variable names match code"] |

### Red Zone Rules

1. **Always get a second opinion.** Ask the tech lead agent to review before merging.
2. **Back up first.** Database changes require a backup before running migrations.
3. **Test the rollback.** Know how to revert the change before applying it.
4. **Deploy during low traffic.** If possible, apply these changes during off-peak hours.

---

## Orange Zone — Affect Multiple Features

Changes here will not bring down the whole system, but they affect multiple features
or endpoints. Bugs in these files cause widespread, hard-to-trace issues.

| File / Directory | What It Affects | Precaution |
|-----------------|----------------|------------|
| [FILL IN: e.g. "src/middleware/validation.ts"] | [FILL IN: e.g. "Request validation on all routes — a loose schema lets bad data in everywhere"] | [FILL IN: e.g. "Run integration tests for all routes after changes"] |
| [FILL IN: e.g. "src/services/notification.ts"] | [FILL IN: e.g. "Email, push, and in-app notifications — a bug silently breaks all alerts"] | [FILL IN: e.g. "Test each notification channel individually"] |
| [FILL IN: e.g. "src/utils/permissions.ts"] | [FILL IN: e.g. "Role-based access control — wrong logic escalates or blocks user permissions"] | [FILL IN: e.g. "Test every role: admin, member, viewer, guest"] |
| [FILL IN: e.g. "src/routes/index.ts"] | [FILL IN: e.g. "Route registration — a bad import crashes the entire API on startup"] | [FILL IN: e.g. "Server must start cleanly after changes"] |
| [FILL IN: e.g. "src/lib/cache.ts"] | [FILL IN: e.g. "Cache layer — stale cache returns wrong data to multiple features"] | [FILL IN: e.g. "Flush cache after deploying changes to this file"] |

### Orange Zone Rules

1. **Run the full test suite.** Unit tests alone are not enough — run integration tests too.
2. **Check downstream effects.** Use grep to find every file that imports the module you changed.
3. **Test multiple user roles.** Permission and middleware changes affect users differently.

---

## Yellow Zone — Config Files That Need Care

These files rarely cause immediate outages, but wrong values lead to subtle
bugs, broken builds, or degraded performance.

| File / Directory | What Can Go Wrong | Precaution |
|-----------------|-------------------|------------|
| [FILL IN: e.g. "package.json"] | [FILL IN: e.g. "Wrong dependency version breaks build or introduces vulnerability"] | [FILL IN: e.g. "Run full test suite after dependency changes, pin exact versions"] |
| [FILL IN: e.g. "tsconfig.json"] | [FILL IN: e.g. "Compiler settings — wrong strictness level hides type errors"] | [FILL IN: e.g. "Run type check across entire project after changes"] |
| [FILL IN: e.g. ".eslintrc"] | [FILL IN: e.g. "Lint rules — disabling rules lets bad patterns into the codebase"] | [FILL IN: e.g. "Never disable rules globally; use inline overrides sparingly"] |
| [FILL IN: e.g. "nginx.conf / reverse proxy config"] | [FILL IN: e.g. "Routing rules — wrong config returns 502 or routes to wrong service"] | [FILL IN: e.g. "Test with curl after every change, check all routes"] |
| [FILL IN: e.g. "CI config (.github/workflows/ or .gitlab-ci.yml)"] | [FILL IN: e.g. "Pipeline changes can silently skip tests or break deploys"] | [FILL IN: e.g. "Verify pipeline runs end-to-end on a test branch first"] |
| [FILL IN: e.g. "process manager config (ecosystem.config.js)"] | [FILL IN: e.g. "Wrong restart policy or env vars cause services to crash-loop"] | [FILL IN: e.g. "Test process start/stop/restart locally before deploying"] |

### Yellow Zone Rules

1. **Validate syntax.** Config files with a single typo can break silently.
2. **Check the docs.** Config options change between versions — verify against the correct version.
3. **Test the build pipeline.** After changing any config, run the full build and deploy cycle.

---

## Green Zone — Safe to Change

Everything not listed above is in the Green zone. These files can be changed with
normal development practices:

- Individual feature modules and route handlers
- Component files (frontend)
- Test files
- Documentation files
- Static assets

Green zone files still require tests, but they do not need special review protocols.

---

## How to Use This File

**Before every change**, agents should:

1. Check which zone the target file is in.
2. Follow the precautions listed for that zone.
3. If the file is Red or Orange, request a review before merging.
4. If you are unsure, treat the file as Orange zone until confirmed otherwise.

**Updating this file**: When you discover a new danger zone (e.g., a file caused
an outage or a subtle cross-cutting bug), add it to the appropriate zone immediately.
