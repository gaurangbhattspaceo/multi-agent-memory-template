# Available Tools

All tools run through: `exec /app/tools/safe-exec.sh <tool> <args>`

## Git Provider

```bash
# Create a merge request / pull request
exec /app/tools/safe-exec.sh git-api create-mr ${PROJECT_1_ID} <branch> main "<title>" "<body>"

# List open MRs
exec /app/tools/safe-exec.sh git-api list-mrs <project-id>
```

## Discord

```bash
exec /app/tools/safe-exec.sh post devops-agent dev-work "message"
exec /app/tools/safe-exec.sh post devops-agent dev-alerts "message"
```

## Git (Your Worktree)

Your working directory: [FILL IN: path to your worktree]

```bash
# Start a new fix
exec /app/tools/safe-exec.sh git checkout [worktree-path] main
exec /app/tools/safe-exec.sh git pull [worktree-path] origin main
exec /app/tools/safe-exec.sh git checkout [worktree-path] -b fix/my-fix

# Stage, commit, push
exec /app/tools/safe-exec.sh git add [worktree-path] -A
exec /app/tools/safe-exec.sh git commit [worktree-path] -m "fix: description"
exec /app/tools/safe-exec.sh git push [worktree-path] origin fix/my-fix
```

## Task Registry

```bash
exec /app/tools/safe-exec.sh task list in-progress
exec /app/tools/safe-exec.sh task get <task-id>
exec /app/tools/safe-exec.sh task update <task-id> <status> "[note]"
exec /app/tools/safe-exec.sh task link <task-id> mr <project-id> <mr-iid>
```

## Agent Monitoring

```bash
exec /app/tools/safe-exec.sh monitor dashboard
exec /app/tools/safe-exec.sh monitor agent <agent-id>
exec /app/tools/safe-exec.sh monitor tasks
```

## Smart Babysitter

```bash
exec /app/tools/safe-exec.sh babysit check
exec /app/tools/safe-exec.sh babysit check-stuck
exec /app/tools/safe-exec.sh babysit check-retries
exec /app/tools/safe-exec.sh babysit escalate <task-id> "<reason>"
```

## Knowledge Vault (read-only)

```bash
exec /app/tools/safe-exec.sh knowledge read decisions|patterns|failures
exec /app/tools/safe-exec.sh knowledge search patterns|failures "<keyword>"
```

## E2E Testing

```bash
exec /app/tools/safe-exec.sh e2e run-all
exec /app/tools/safe-exec.sh e2e run <test-name>
exec /app/tools/safe-exec.sh e2e results
```

## Security Rules

- NEVER display API tokens, secrets, or credentials
- NEVER commit .env files or credentials
- NEVER deploy to production without approval
- ALWAYS rollback if health checks fail
- ALWAYS monitor for 30+ minutes post-deploy
