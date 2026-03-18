# Product Context

> Fill in this file so every agent on your team understands what the product does,
> who it serves, and how it fits together. Replace all `[FILL IN: ...]` placeholders
> with your own details.

---

## Product Name

**[FILL IN: Your product name]**

## Description

[FILL IN: One-paragraph summary of what the product does. Write it so someone with
zero context can understand. Example: "A project management platform that helps
remote teams track work across sprints, assign tasks, and generate progress reports."]

## Target Users

| User Type | Description |
|-----------|-------------|
| [FILL IN: Primary user role, e.g. "Admin"] | [FILL IN: What this user does in the product] |
| [FILL IN: Secondary user role] | [FILL IN: What this user does] |
| [FILL IN: Third user role] | [FILL IN: What this user does] |

Add or remove rows as needed.

## Key Features

1. **[FILL IN: Feature name]** — [FILL IN: One-sentence description of what it does]
2. **[FILL IN: Feature name]** — [FILL IN: One-sentence description]
3. **[FILL IN: Feature name]** — [FILL IN: One-sentence description]
4. **[FILL IN: Feature name]** — [FILL IN: One-sentence description]
5. **[FILL IN: Feature name]** — [FILL IN: One-sentence description]

Add more as needed. Prioritize the features agents will touch most often.

## Services & Apps

List every running service, its purpose, and where it lives.

| Service | Purpose | Port / URL | Process Manager |
|---------|---------|------------|-----------------|
| [FILL IN: e.g. "API Server"] | [FILL IN: e.g. "Handles REST endpoints"] | [FILL IN: e.g. ":3000"] | [FILL IN: e.g. "PM2"] |
| [FILL IN: e.g. "Worker"] | [FILL IN: e.g. "Processes background jobs"] | [FILL IN: e.g. "N/A"] | [FILL IN] |
| [FILL IN: e.g. "Frontend"] | [FILL IN: e.g. "React SPA"] | [FILL IN: e.g. ":5173"] | [FILL IN] |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | [FILL IN: e.g. "TypeScript 5.x"] |
| Runtime | [FILL IN: e.g. "Node.js 22"] |
| Framework | [FILL IN: e.g. "Express / Fastify / Next.js"] |
| Database | [FILL IN: e.g. "PostgreSQL 16"] |
| ORM | [FILL IN: e.g. "Prisma 6 / Drizzle / TypeORM"] |
| Cache | [FILL IN: e.g. "Redis 7 / None"] |
| Queue | [FILL IN: e.g. "BullMQ / RabbitMQ / None"] |
| Frontend | [FILL IN: e.g. "React 19 + Tailwind"] |
| Testing | [FILL IN: e.g. "Vitest + Playwright"] |
| CI/CD | [FILL IN: e.g. "GitHub Actions / GitLab CI"] |
| Hosting | [FILL IN: e.g. "AWS EC2 / Vercel / Railway"] |

## Database Schema — Key Models

List the most important database tables or collections. Agents need to know these
to write correct queries and avoid breaking relationships.

### [FILL IN: Model name, e.g. "User"]

| Field | Type | Notes |
|-------|------|-------|
| [FILL IN: e.g. "id"] | [FILL IN: e.g. "UUID / PK"] | [FILL IN: e.g. "Auto-generated"] |
| [FILL IN: e.g. "email"] | [FILL IN: e.g. "String, unique"] | [FILL IN] |
| [FILL IN: e.g. "orgId"] | [FILL IN: e.g. "FK -> Organization"] | [FILL IN: e.g. "Multi-tenant scoping"] |

### [FILL IN: Model name, e.g. "Organization"]

| Field | Type | Notes |
|-------|------|-------|
| [FILL IN] | [FILL IN] | [FILL IN] |

### [FILL IN: Model name, e.g. "Task"]

| Field | Type | Notes |
|-------|------|-------|
| [FILL IN] | [FILL IN] | [FILL IN] |

Repeat for each important model. Focus on models that agents will query or mutate.

## External Integrations

| Integration | Purpose | Auth Method | Notes |
|------------|---------|-------------|-------|
| [FILL IN: e.g. "Stripe"] | [FILL IN: e.g. "Payments"] | [FILL IN: e.g. "API key in .env"] | [FILL IN: e.g. "Webhook at /api/stripe/webhook"] |
| [FILL IN: e.g. "SendGrid"] | [FILL IN: e.g. "Transactional email"] | [FILL IN] | [FILL IN] |
| [FILL IN: e.g. "S3"] | [FILL IN: e.g. "File storage"] | [FILL IN] | [FILL IN] |

## Environment Variables

List the critical env vars agents need to know about (do NOT put actual secrets here).

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| [FILL IN: e.g. "DATABASE_URL"] | [FILL IN: e.g. "Primary DB connection"] | [FILL IN: e.g. "postgresql://user:pass@host:5432/db"] |
| [FILL IN: e.g. "REDIS_URL"] | [FILL IN] | [FILL IN] |
| [FILL IN: e.g. "API_SECRET"] | [FILL IN] | [FILL IN] |
