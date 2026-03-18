# Documentation Agent — Available Tools

All tools MUST be invoked through `exec /app/tools/safe-exec.sh <command> [args...]`.

## Documentation Tools

### Scan Codebase
```bash
exec /app/tools/safe-exec.sh docs-gen scan
```
Scans the codebase and outputs a JSON manifest of all routes, API endpoints, components (grouped by domain), and database models.

### Take Screenshot
```bash
exec /app/tools/safe-exec.sh docs-gen screenshot <page-path> <output-name>
```
Takes a Playwright screenshot of a page in the running app. Screenshots are saved to the docs repo images directory.

### Docs Repo Status
```bash
exec /app/tools/safe-exec.sh docs-gen git-status
```
Shows the git status of the docs repo and recent commits.

### Push Docs
```bash
exec /app/tools/safe-exec.sh docs-gen git-push '<commit-message>'
```
Stages all changes, commits, and pushes to the docs repo.

## Communication Tools

### Post to Discord
```bash
exec /app/tools/safe-exec.sh post docs-agent dev-work '<message>'
```

## Read-Only Access

You have read access to the application codebase. Key directories:
- [FILL IN: e.g. "src/app/" — Page routes and API endpoints]
- [FILL IN: e.g. "src/components/" — UI components]
- [FILL IN: e.g. "src/lib/" — Business logic]
- [FILL IN: e.g. "prisma/schema.prisma" — Database models]
