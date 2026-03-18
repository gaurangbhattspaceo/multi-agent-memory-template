# Codebase Guide

> Fill in this file so every agent understands where code lives, what patterns
> are used, and how to navigate the repo. Replace all `[FILL IN: ...]` placeholders.

---

## Directory Structure

```
[FILL IN: your-project-name]/
├── src/                          # [FILL IN: e.g. "Application source code"]
│   ├── [FILL IN: e.g. "routes/"]      # [FILL IN: e.g. "API route handlers"]
│   ├── [FILL IN: e.g. "services/"]    # [FILL IN: e.g. "Business logic layer"]
│   ├── [FILL IN: e.g. "models/"]      # [FILL IN: e.g. "Database models / schema"]
│   ├── [FILL IN: e.g. "middleware/"]   # [FILL IN: e.g. "Auth, logging, error handling"]
│   ├── [FILL IN: e.g. "utils/"]       # [FILL IN: e.g. "Shared helpers"]
│   ├── [FILL IN: e.g. "jobs/"]        # [FILL IN: e.g. "Background workers / queues"]
│   └── [FILL IN: e.g. "config/"]      # [FILL IN: e.g. "App configuration"]
├── [FILL IN: e.g. "frontend/"]        # [FILL IN: e.g. "Client-side application"]
│   ├── [FILL IN: e.g. "src/"]
│   │   ├── [FILL IN: e.g. "components/"]
│   │   ├── [FILL IN: e.g. "pages/"]
│   │   ├── [FILL IN: e.g. "hooks/"]
│   │   └── [FILL IN: e.g. "stores/"]
│   └── [FILL IN: e.g. "public/"]
├── [FILL IN: e.g. "prisma/"]          # [FILL IN: e.g. "Database schema & migrations"]
├── [FILL IN: e.g. "scripts/"]         # [FILL IN: e.g. "Build, deploy, seed scripts"]
├── tests/                              # [FILL IN: e.g. "Test suites"]
│   ├── [FILL IN: e.g. "unit/"]
│   ├── [FILL IN: e.g. "integration/"]
│   └── [FILL IN: e.g. "e2e/"]
├── .env.example                        # Environment variable template
├── [FILL IN: e.g. "docker-compose.yml"]
└── [FILL IN: e.g. "package.json"]
```

Adjust this tree to match your actual project structure. Remove directories that
do not exist and add any that are missing.

## Key Patterns

Check each pattern that applies to your codebase. Add context where indicated.

- [ ] **Multi-tenancy** — [FILL IN: e.g. "Row-level via orgId on every table" or "Schema-per-tenant"]
- [ ] **Queue / Background Jobs** — [FILL IN: e.g. "BullMQ workers in src/jobs/, Redis-backed"]
- [ ] **Event-driven** — [FILL IN: e.g. "Domain events emitted via EventEmitter / message bus"]
- [ ] **CQRS / Read-Write Split** — [FILL IN: describe if applicable]
- [ ] **Repository Pattern** — [FILL IN: e.g. "All DB access through src/repositories/"]
- [ ] **Service Layer** — [FILL IN: e.g. "Business logic in src/services/, routes are thin"]
- [ ] **Middleware Pipeline** — [FILL IN: e.g. "Auth -> rate-limit -> validation -> handler"]
- [ ] **Feature Flags** — [FILL IN: e.g. "LaunchDarkly / env-var based / DB-backed"]
- [ ] **Soft Deletes** — [FILL IN: e.g. "deletedAt column on User, Org, Project"]
- [ ] **Audit Logging** — [FILL IN: e.g. "Every mutation writes to audit_log table"]
- [ ] **Webhooks (Inbound)** — [FILL IN: e.g. "Stripe, GitHub webhooks at /api/webhooks/"]
- [ ] **Webhooks (Outbound)** — [FILL IN: e.g. "Notify external systems on status change"]
- [ ] **File Uploads** — [FILL IN: e.g. "Multer -> S3, presigned URLs for download"]
- [ ] **Real-time** — [FILL IN: e.g. "WebSocket via Socket.io / SSE for live updates"]
- [ ] **Caching** — [FILL IN: e.g. "Redis cache for session and hot queries, TTL 5min"]
- [ ] **Rate Limiting** — [FILL IN: e.g. "express-rate-limit, 100 req/min per IP"]

## Important Files

Files that agents must understand before making changes.

| File | Purpose | Change Risk |
|------|---------|-------------|
| [FILL IN: e.g. "src/config/database.ts"] | [FILL IN: e.g. "DB connection pool setup"] | High |
| [FILL IN: e.g. "src/middleware/auth.ts"] | [FILL IN: e.g. "JWT verification, user context"] | High |
| [FILL IN: e.g. "src/routes/index.ts"] | [FILL IN: e.g. "Route registration, all endpoints"] | Medium |
| [FILL IN: e.g. "prisma/schema.prisma"] | [FILL IN: e.g. "Database schema, all models"] | High |
| [FILL IN: e.g. ".env.example"] | [FILL IN: e.g. "Required environment variables"] | Low |

## Testing Structure

### Test Runner

[FILL IN: e.g. "Vitest" / "Jest" / "Mocha"]

### Test Commands

```bash
# Run all tests
[FILL IN: e.g. "npm test"]

# Run unit tests only
[FILL IN: e.g. "npm run test:unit"]

# Run integration tests
[FILL IN: e.g. "npm run test:integration"]

# Run end-to-end tests
[FILL IN: e.g. "npx playwright test"]

# Run a single test file
[FILL IN: e.g. "npx vitest run src/services/user.test.ts"]
```

### Test Conventions

- Test files live at: [FILL IN: e.g. "next to source files as `*.test.ts`" or "in `tests/` directory"]
- Naming convention: [FILL IN: e.g. "`<module>.test.ts` for unit, `<feature>.e2e.ts` for E2E"]
- Fixtures / factories at: [FILL IN: e.g. "`tests/fixtures/`"]
- Test database: [FILL IN: e.g. "Separate test DB, migrated on each run" or "In-memory SQLite"]

### What Must Pass Before Merging

- [ ] All unit tests green
- [ ] All integration tests green
- [ ] All E2E tests green
- [ ] [FILL IN: Any additional gates, e.g. "Lint check", "Type check", "Coverage > 80%"]

## Code Style & Conventions

| Rule | Convention |
|------|-----------|
| Formatting | [FILL IN: e.g. "Prettier, config in .prettierrc"] |
| Linting | [FILL IN: e.g. "ESLint with strict TypeScript rules"] |
| Naming — files | [FILL IN: e.g. "kebab-case for files, PascalCase for components"] |
| Naming — variables | [FILL IN: e.g. "camelCase, no abbreviations"] |
| Naming — DB columns | [FILL IN: e.g. "snake_case"] |
| Imports | [FILL IN: e.g. "Absolute imports via @/ alias"] |
| Error handling | [FILL IN: e.g. "Custom AppError class, caught in global error middleware"] |
| Logging | [FILL IN: e.g. "Pino logger, structured JSON, correlation IDs"] |
