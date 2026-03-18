#!/bin/bash
# Safe execution wrapper for multi-agent dev team
# ONLY allows pre-approved commands. Everything else is blocked.
# Agents should use: exec /app/tools/safe-exec.sh <command> [args...]
#
# Auto-learning: On tool failures (non-zero exit), errors are automatically
# logged to the Knowledge Vault for recurrence tracking and promotion.

set -uo pipefail

COMMAND="${1:-}"
shift 2>/dev/null || true

# --- Auto-learning wrapper ---
# Runs a command and logs failures to the Knowledge Vault.
# Preserves the original exit code so callers see the real error.
run_and_learn() {
  local TOOL_NAME="$1"
  shift

  # Run the command, capturing exit code (disable errexit temporarily)
  set +e
  "$@"
  local EXIT_CODE=$?
  set -e

  # On failure, auto-log to Knowledge Vault (skip if it's the knowledge tool itself)
  if [ $EXIT_CODE -ne 0 ]; then
    local AGENT_ID="${OPENCLAW_AGENT_ID:-unknown}"
    local ERROR_CTX="$TOOL_NAME failed (exit $EXIT_CODE)"
    node /app/tools/knowledge-vault.js log-error \
      "$AGENT_ID" \
      "tool-error" \
      "$TOOL_NAME" \
      "$ERROR_CTX" 2>/dev/null || true
  fi

  exit $EXIT_CODE
}

case "$COMMAND" in
  # --- Commands WITHOUT auto-learning (messaging, knowledge, fetch) ---

  # Discord channel posting
  post)
    exec node /app/identity/post.js "$@"
    ;;

  # Discord file upload (screenshots)
  post-file)
    exec node /app/identity/post-file.js "$@"
    ;;

  # Microsoft Teams posting (Adaptive Card)
  post-teams)
    exec node /app/identity/post-teams.js "$@"
    ;;

  # Knowledge vault (skip to avoid recursion)
  knowledge)
    exec node /app/tools/knowledge-vault.js "$@"
    ;;

  # Web fetch (read-only, HTTPS only — errors are expected)
  fetch)
    URL="${1:-}"
    if [[ -z "$URL" ]]; then
      echo "ERROR: URL required"
      exit 1
    fi
    if [[ ! "$URL" =~ ^https:// ]]; then
      echo "ERROR: Only HTTPS URLs allowed"
      exit 1
    fi
    if [[ "$URL" =~ (localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.) ]]; then
      echo "ERROR: Internal URLs blocked"
      exit 1
    fi
    exec node -e "
      const https = require('https');
      const url = process.argv[1];
      https.get(url, {headers: {'User-Agent': 'OpenClaw-Agent/1.0'}}, res => {
        let d = '';
        res.on('data', c => { d += c; if (d.length > 100000) { res.destroy(); } });
        res.on('end', () => console.log(d.slice(0, 100000)));
      }).on('error', e => { console.error('Fetch error: ' + e.message); process.exit(1); });
    " "$URL"
    ;;

  # --- Commands WITH auto-learning ---

  # Git API operations (MR creation, reviews, issues)
  git-api)
    run_and_learn "git-api" node /app/tools/git-integration.js "$@"
    ;;

  # Git operations (branch, commit, push — scoped to project dirs only)
  git)
    SUBCOMMAND="${1:-}"
    PROJECT_DIR="${2:-}"

    # Validate project directory (customize these for your repos)
    # [FILL IN: Add your allowed project directories here]
    case "$PROJECT_DIR" in
      ${REPO_1_PATH:-/app/project}|\
      ${REPO_1_PATH:-/app/project}-worktree-*|\
      ${REPO_2_PATH:-/app/project2}|\
      ${REPO_2_PATH:-/app/project2}-worktree-*)
        ;; # allowed
      *)
        echo "ERROR: Git operations only allowed in approved project directories"
        echo "Set REPO_1_PATH and REPO_2_PATH in your .env file"
        exit 1
        ;;
    esac

    # Allowed git subcommands
    case "$SUBCOMMAND" in
      status|log|diff|branch|checkout|add|commit|push|pull|fetch|stash|merge|rebase)
        shift 2  # remove subcommand and project dir
        run_and_learn "git-$SUBCOMMAND" git -C "$PROJECT_DIR" "$SUBCOMMAND" "$@"
        ;;
      *)
        echo "ERROR: Git subcommand '$SUBCOMMAND' not allowed."
        echo "Allowed: status, log, diff, branch, checkout, add, commit, push, pull, fetch, stash, merge, rebase"
        exit 1
        ;;
    esac
    ;;

  # Task registry
  task)
    run_and_learn "task" node /app/tools/task-registry.js "$@"
    ;;

  # Code review
  review)
    run_and_learn "review" node /app/tools/code-review.js "$@"
    ;;

  # Definition of done validation
  done)
    run_and_learn "done" node /app/tools/validate-done.js "$@"
    ;;

  # Agent monitoring
  monitor)
    run_and_learn "monitor" node /app/tools/monitor-agents.js "$@"
    ;;

  # Smart retry
  retry)
    run_and_learn "retry" node /app/tools/retry-analyzer.js "$@"
    ;;

  # Smart babysitter
  babysit)
    run_and_learn "babysit" node /app/tools/babysitter.js "$@"
    ;;

  # Proactive scanner
  scan)
    run_and_learn "scan" node /app/tools/proactive-scan.js "$@"
    ;;

  # E2E testing (Playwright)
  e2e)
    run_and_learn "e2e" node /app/tools/e2e-runner.js "$@"
    ;;

  # Intake triage (auto-create tasks from E2E failures and health alerts)
  intake)
    run_and_learn "intake" node /app/tools/intake-triage.js "$@"
    ;;

  # Version management (release tracking, readiness checks)
  version)
    run_and_learn "version" node /app/tools/version-manager.js "$@"
    ;;

  # Git issue intake (poll git provider for open issues, create tasks)
  git-intake)
    run_and_learn "git-intake" node /app/tools/git-intake.js "$@"
    ;;

  # Documentation generator (scan codebase, screenshots, docs repo git)
  docs-gen)
    run_and_learn "docs-gen" node /app/tools/docs-gen.js "$@"
    ;;

  # Test execution (npm test, jest, vitest)
  test)
    run_and_learn "test" npm test "$@"
    ;;

  # Code graph (codebase-memory-mcp — AST-based code analysis)
  graph)
    GRAPH_CMD="${1:-}"
    shift 2>/dev/null || true
    case "$GRAPH_CMD" in
      search_graph|trace_call_path|detect_changes|get_architecture|get_code_snippet|query_graph|get_graph_schema|search_code|list_projects|index_repository|manage_adr)
        run_and_learn "graph-$GRAPH_CMD" /usr/local/bin/codebase-memory-mcp cli "$GRAPH_CMD" "$@"
        ;;
      *)
        echo "ERROR: Graph command '$GRAPH_CMD' not recognized."
        echo "Allowed: search_graph, trace_call_path, detect_changes, get_architecture, get_code_snippet, query_graph, get_graph_schema, search_code, list_projects, index_repository"
        exit 1
        ;;
    esac
    ;;

  *)
    echo "ERROR: Command '$COMMAND' not allowed."
    echo "Allowed commands: post, post-teams, post-file, git-api, git, test, fetch, task, review, done, monitor, retry, knowledge, babysit, scan, e2e, intake, version, git-intake, docs-gen, graph"
    exit 1
    ;;
esac
