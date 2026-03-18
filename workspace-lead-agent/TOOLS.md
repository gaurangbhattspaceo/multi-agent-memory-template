# Available Tools

All tools run through: `exec /app/tools/safe-exec.sh <tool> <args>`

## Git Provider

```bash
# Create a merge request / pull request
exec /app/tools/safe-exec.sh git-api create-mr <project-id> <source-branch> <target-branch> "<title>" "<description>"

# List open MRs/PRs
exec /app/tools/safe-exec.sh git-api list-mrs <project-id>

# Get MR/PR details
exec /app/tools/safe-exec.sh git-api get-mr <project-id> <mr-number>

# Merge an MR/PR
exec /app/tools/safe-exec.sh git-api merge-mr <project-id> <mr-number>

# Comment on MR/PR
exec /app/tools/safe-exec.sh git-api comment-mr <project-id> <mr-number> "<comment>"

# List issues
exec /app/tools/safe-exec.sh git-api list-issues <project-id>
```

### Project IDs
- Project 1: `${PROJECT_1_ID}`
- Project 2: `${PROJECT_2_ID}` (if applicable)

## Discord

```bash
exec /app/tools/safe-exec.sh post lead-agent dev-tasks "message"
exec /app/tools/safe-exec.sh post lead-agent dev-work "message"
exec /app/tools/safe-exec.sh post lead-agent dev-reviews "message"
exec /app/tools/safe-exec.sh post lead-agent dev-alerts "message"
```

## Git (Code Review)

Your working directory: [FILL IN: path to your repo]

```bash
# Check status / recent commits
exec /app/tools/safe-exec.sh git status [repo-path]
exec /app/tools/safe-exec.sh git log [repo-path] --oneline -20

# Fetch latest and review a feature branch
exec /app/tools/safe-exec.sh git fetch [repo-path] origin
exec /app/tools/safe-exec.sh git checkout [repo-path] feature/branch-name
exec /app/tools/safe-exec.sh git diff [repo-path] main..HEAD

# Switch back to main
exec /app/tools/safe-exec.sh git checkout [repo-path] main
```

## Task Registry

```bash
# Create a task and assign to an agent
exec /app/tools/safe-exec.sh task create "<title>" "<description>" "<assignee>"

# List tasks (filter by status: open, in-progress, review, done, blocked, all)
exec /app/tools/safe-exec.sh task list [status]

# Get task details
exec /app/tools/safe-exec.sh task get <task-id>

# Update task status
exec /app/tools/safe-exec.sh task update <task-id> <status> "[note]"

# Link task to MR or branch
exec /app/tools/safe-exec.sh task link <task-id> mr <project-id> <mr-iid>
exec /app/tools/safe-exec.sh task link <task-id> branch <branch-name>
```

## Code Review

```bash
# Scan for unreviewed MRs
exec /app/tools/safe-exec.sh review check-mrs <project-id>

# Fetch MR diff for review
exec /app/tools/safe-exec.sh review get-diff <project-id> <mr-iid>

# Post review comment on MR
exec /app/tools/safe-exec.sh review post <project-id> <mr-iid> "<comment>"
```

## Definition of Done

```bash
# Validate task completion (checks linked MR, conflicts, reviews, pipeline)
exec /app/tools/safe-exec.sh done validate <task-id>

# Check MR merge readiness
exec /app/tools/safe-exec.sh done check-mr <project-id> <mr-iid>
```

## Agent Monitoring

```bash
# Full team dashboard
exec /app/tools/safe-exec.sh monitor dashboard

# Single agent activity
exec /app/tools/safe-exec.sh monitor agent <agent-id>

# Task registry summary
exec /app/tools/safe-exec.sh monitor tasks
```

## Smart Retry

```bash
# Classify an error and get fix suggestions
exec /app/tools/safe-exec.sh retry analyze "<error-output>"

# Log a failure to task history
exec /app/tools/safe-exec.sh retry log <task-id> "<error-output>"

# View failure history for a task
exec /app/tools/safe-exec.sh retry history <task-id>
```

## Proactive Scanning

```bash
# Full scan (processes + tasks + patterns)
exec /app/tools/safe-exec.sh scan scan-all

# Individual scans
exec /app/tools/safe-exec.sh scan scan-errors     # Process issues
exec /app/tools/safe-exec.sh scan scan-tasks      # Stuck/idle tasks
exec /app/tools/safe-exec.sh scan scan-patterns   # Knowledge vault pattern matches
```

## Knowledge Vault

```bash
# Reading
exec /app/tools/safe-exec.sh knowledge read decisions|patterns|failures|metrics
exec /app/tools/safe-exec.sh knowledge search patterns|failures|decisions "<keyword>"

# Writing (you own this)
exec /app/tools/safe-exec.sh knowledge add decision "<title>" "<context>" "<decision>"
exec /app/tools/safe-exec.sh knowledge add pattern "<name>" "<category>" "<description>" "<promptTemplate>"
exec /app/tools/safe-exec.sh knowledge add failure "<taskId>" "<errorType>" "<rootCause>" "<lesson>"

# Updating
exec /app/tools/safe-exec.sh knowledge update pattern <id> success|failure
```

## E2E Testing

```bash
# Run all E2E tests
exec /app/tools/safe-exec.sh e2e run-all

# Run a specific test
exec /app/tools/safe-exec.sh e2e run <test-name>

# Check last results
exec /app/tools/safe-exec.sh e2e results
```

## Microsoft Teams (Optional)

```bash
# Post daily summary as Adaptive Card to Teams
exec /app/tools/safe-exec.sh post-teams "<title>" "<summary>" "<tasks>" "<health>"
```

## Important Rules

- NEVER display or log: API tokens, secrets, credentials
- NEVER commit credentials to git
- Always use safe-exec wrapper
