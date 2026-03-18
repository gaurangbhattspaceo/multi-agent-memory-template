# Available Tools

All tools run through: `exec /app/tools/safe-exec.sh <tool> <args>`

## Git Provider

```bash
# Create a merge request / pull request
exec /app/tools/safe-exec.sh git-api create-mr ${PROJECT_1_ID} <branch> main "<title>" "<body>"

# List open MRs
exec /app/tools/safe-exec.sh git-api list-mrs ${PROJECT_1_ID}
```

## Discord

```bash
exec /app/tools/safe-exec.sh post engineer-agent dev-work "message"
```

## Git (Your Worktree)

Your working directory: [FILL IN: path to your worktree]

```bash
# Start a new feature
exec /app/tools/safe-exec.sh git checkout [worktree-path] main
exec /app/tools/safe-exec.sh git pull [worktree-path] origin main
exec /app/tools/safe-exec.sh git checkout [worktree-path] -b feature/my-feature

# Stage, commit, push
exec /app/tools/safe-exec.sh git add [worktree-path] -A
exec /app/tools/safe-exec.sh git commit [worktree-path] -m "feat: description"
exec /app/tools/safe-exec.sh git push [worktree-path] origin feature/my-feature

# Then create MR
exec /app/tools/safe-exec.sh git-api create-mr [project-id] feature/my-feature main "Title" "Description"
```

## Task Registry

```bash
# List your assigned tasks
exec /app/tools/safe-exec.sh task list in-progress

# Get task details
exec /app/tools/safe-exec.sh task get <task-id>

# Update task status (open, in-progress, review, done, blocked)
exec /app/tools/safe-exec.sh task update <task-id> <status> "[note]"

# Link task to your MR or branch
exec /app/tools/safe-exec.sh task link <task-id> mr <project-id> <mr-iid>
exec /app/tools/safe-exec.sh task link <task-id> branch <branch-name>
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

## Knowledge Vault (read-only)

```bash
# Read patterns and failure lessons
exec /app/tools/safe-exec.sh knowledge read patterns
exec /app/tools/safe-exec.sh knowledge read failures
exec /app/tools/safe-exec.sh knowledge search patterns "<keyword>"
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

## Security Rules

- NEVER display API tokens, secrets, or credentials
- NEVER commit .env files or hardcoded secrets
- NEVER modify /app/credentials/ or /app/.openclaw/
- ALWAYS validate input before processing
