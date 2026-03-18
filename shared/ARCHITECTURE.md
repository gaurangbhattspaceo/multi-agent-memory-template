# System Architecture

> Fill in this file so every agent understands how the system is composed, how data
> flows through it, and where the boundaries are. Replace all `[FILL IN: ...]` placeholders.

---

## System Overview

Replace this ASCII diagram with one that matches your architecture. Keep it simple
enough that a new team member can understand it in 30 seconds.

```
┌─────────────┐       ┌─────────────────┐       ┌──────────────┐
│   Client     │──────>│   [FILL IN:     │──────>│  [FILL IN:   │
│  (Browser /  │       │   API Server]   │       │  Database]   │
│   Mobile)    │<──────│                 │<──────│              │
└─────────────┘       └────────┬────────┘       └──────────────┘
                               │
                               v
                      ┌─────────────────┐       ┌──────────────┐
                      │  [FILL IN:      │──────>│  [FILL IN:   │
                      │  Job Queue /    │       │  External    │
                      │  Worker]        │       │  Service]    │
                      └─────────────────┘       └──────────────┘
```

[FILL IN: One paragraph describing what this diagram shows. Example: "The client
sends requests to the API server, which reads/writes the PostgreSQL database.
Long-running tasks are offloaded to the worker via a Redis-backed queue. The worker
calls external services for payment processing and email delivery."]

## Data Flows

Describe the most important data flows in the system. These are the paths agents
will interact with most often.

### Flow 1: [FILL IN: e.g. "User Registration"]

```
[FILL IN: Step-by-step data flow]

1. Client POST /api/auth/register with { email, password }
2. Auth middleware: skip (public route)
3. UserService.register() — hash password, create user row
4. EmailService.sendVerification() — queue job to send email
5. Return 201 { user, token }
```

### Flow 2: [FILL IN: e.g. "Create Resource"]

```
[FILL IN: Step-by-step data flow]

1. Client POST /api/[resource] with { ... }
2. Auth middleware: verify JWT, attach user to request
3. Validation middleware: check request body schema
4. [Resource]Service.create() — business logic, DB insert
5. Emit event: [resource].created
6. Return 201 { [resource] }
```

### Flow 3: [FILL IN: e.g. "Background Job Processing"]

```
[FILL IN: Step-by-step data flow]

1. API handler adds job to queue: queue.add('job-type', payload)
2. Worker picks up job from Redis queue
3. Worker calls external API / processes data
4. Worker updates DB with result
5. Worker marks job as complete
```

### Flow 4: [FILL IN: e.g. "Webhook Inbound"]

```
[FILL IN: Step-by-step data flow]

1. External service POST /api/webhooks/[provider]
2. Verify webhook signature
3. Parse event type
4. Route to handler: handlePaymentSuccess / handlePaymentFailed / etc.
5. Update local DB records
6. Return 200 OK
```

Add or remove flows as needed. Focus on the ones agents will encounter most.

## Service Boundaries

Define what each service or module owns. This prevents agents from making changes
that cross boundaries without coordination.

| Service / Module | Owns | Does NOT Own |
|-----------------|------|-------------|
| [FILL IN: e.g. "Auth"] | [FILL IN: e.g. "Login, registration, JWT, password reset"] | [FILL IN: e.g. "User profile, permissions"] |
| [FILL IN: e.g. "User"] | [FILL IN: e.g. "Profile, settings, avatar"] | [FILL IN: e.g. "Authentication, billing"] |
| [FILL IN: e.g. "Billing"] | [FILL IN: e.g. "Plans, subscriptions, invoices"] | [FILL IN: e.g. "User accounts, features"] |
| [FILL IN: e.g. "Notifications"] | [FILL IN: e.g. "Email, push, in-app alerts"] | [FILL IN: e.g. "Message content, user prefs"] |
| [FILL IN: e.g. "Worker"] | [FILL IN: e.g. "Job processing, retries, dead-letter queue"] | [FILL IN: e.g. "API routes, user-facing responses"] |

## Database Relationships

Describe the key relationships between your database models. This helps agents
write correct JOINs and avoid orphaned records.

```
[FILL IN: Replace with your actual relationships]

Organization (1) ──── (*) User
     │
     └── (1) ──── (*) Project
                        │
                        └── (1) ──── (*) Task
                                       │
                                       └── (*) ──── (1) User (assignee)
```

### Key Constraints

- [FILL IN: e.g. "Every User belongs to exactly one Organization (orgId FK, NOT NULL)"]
- [FILL IN: e.g. "Deleting an Organization cascades to all Projects and Tasks"]
- [FILL IN: e.g. "Task.assigneeId is nullable (unassigned tasks allowed)"]
- [FILL IN: e.g. "Unique constraint on (orgId, email) — email unique per org"]

### Multi-Tenancy Scope

[FILL IN: Describe how tenant isolation works in your database. Example:
"Every query must include a WHERE orgId = ? clause. The auth middleware injects
the user's orgId into the request context. Models without orgId are global
(e.g., plan definitions, feature flags)."]

## External API Integrations

| Integration | Direction | Endpoints Used | Rate Limits | Error Handling |
|------------|-----------|---------------|-------------|----------------|
| [FILL IN: e.g. "Payment Provider"] | Outbound | [FILL IN: e.g. "Create charge, refund, list invoices"] | [FILL IN: e.g. "100 req/sec"] | [FILL IN: e.g. "Retry 3x with backoff, then dead-letter"] |
| [FILL IN: e.g. "Email Service"] | Outbound | [FILL IN: e.g. "Send transactional, send batch"] | [FILL IN: e.g. "50 req/sec"] | [FILL IN: e.g. "Queue and retry, log failures"] |
| [FILL IN: e.g. "Payment Provider Webhooks"] | Inbound | [FILL IN: e.g. "POST /api/webhooks/payment"] | N/A | [FILL IN: e.g. "Verify signature, idempotent processing"] |
| [FILL IN: e.g. "OAuth Provider"] | Both | [FILL IN: e.g. "Token exchange, user info"] | [FILL IN] | [FILL IN] |

### API Key Locations

All API keys and secrets live in environment variables. See `PRODUCT.md > Environment Variables`
for the full list. Never hard-code secrets in source files.

## Deployment Architecture

```
[FILL IN: Replace with your deployment topology]

┌──────────────────────────────────────────────────┐
│                  [FILL IN: Host]                 │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ API      │  │ Worker   │  │ [FILL IN:    │  │
│  │ Server   │  │ Process  │  │ Other Svc]   │  │
│  │ :3000    │  │          │  │              │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │        Process Manager (PM2 / systemd)   │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────┐  ┌──────────┐                     │
│  │ Database │  │ Cache    │                     │
│  │ :5432    │  │ :6379    │                     │
│  └──────────┘  └──────────┘                     │
└──────────────────────────────────────────────────┘
```

### Deployment Process

1. [FILL IN: e.g. "Push to main branch triggers CI pipeline"]
2. [FILL IN: e.g. "CI runs tests, lint, type check"]
3. [FILL IN: e.g. "On pass, build artifact and deploy to server"]
4. [FILL IN: e.g. "Process manager restarts services with zero downtime"]
5. [FILL IN: e.g. "Health check confirms all services are running"]
