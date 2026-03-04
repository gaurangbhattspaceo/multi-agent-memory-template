#!/bin/bash
# safe-exec.sh — Tool wrapper with auto-learning
#
# All agent tool calls go through this wrapper. It provides:
# 1. Command allowlisting (agents can only run approved commands)
# 2. Auto-error capture (failed tools get logged to Knowledge Vault)
# 3. Consistent interface for all operations
#
# Usage: safe-exec.sh <command> [args...]

set -euo pipefail

COMMAND="${1:-}"
shift 2>/dev/null || true

# Detect which agent is running (from workspace path)
AGENT_ID="${OPENCLAW_AGENT_ID:-unknown}"

# ─── Auto-Learning Wrapper ───────────────────────────────────────────
# When a tool fails, automatically log the error to the Knowledge Vault.
# This is the foundation of Layer 4 (Self-Learning).
run_and_learn() {
  local TOOL_NAME="$1"
  shift

  # Capture output
  local OUTPUT_FILE="/tmp/safe-exec-$$-output"
  local EXIT_CODE=0

  "$@" > "$OUTPUT_FILE" 2>&1 || EXIT_CODE=$?
  cat "$OUTPUT_FILE"

  # If it failed, log to knowledge vault (skip recursion for knowledge commands)
  if [ $EXIT_CODE -ne 0 ] && [ "$COMMAND" != "knowledge" ] && [ "$COMMAND" != "post" ]; then
    local ERROR_CONTEXT
    ERROR_CONTEXT=$(tail -5 "$OUTPUT_FILE" 2>/dev/null || echo "no output")
    node /app/tools/knowledge-vault.js log-error \
      "$AGENT_ID" "$TOOL_NAME" "$EXIT_CODE" "$ERROR_CONTEXT" 2>/dev/null || true
  fi

  rm -f "$OUTPUT_FILE"
  return $EXIT_CODE
}

# ─── Command Router ──────────────────────────────────────────────────
case "$COMMAND" in

  # Task management
  task)
    run_and_learn "task-$1" node /app/tools/task-registry.js "$@"
    ;;

  # Knowledge vault (Layer 3 + 4)
  knowledge)
    node /app/tools/knowledge-vault.js "$@"
    ;;

  # Git operations
  git)
    GIT_CMD="${1:-}"
    shift 2>/dev/null || true
    case "$GIT_CMD" in
      status|log|diff|branch|checkout|pull|add|commit|push|merge)
        run_and_learn "git-$GIT_CMD" git "$GIT_CMD" "$@"
        ;;
      *)
        echo "ERROR: Git command '$GIT_CMD' not allowed."
        exit 1
        ;;
    esac
    ;;

  # Post messages (customize for your messaging platform)
  post)
    # Example: post <agent-id> <channel> "message"
    echo "TODO: Implement messaging for your platform (Discord, Slack, etc.)"
    echo "Agent: $1, Channel: $2, Message: $3"
    ;;

  # Code graph (Layer 5 — codebase-memory-mcp)
  graph)
    GRAPH_CMD="${1:-}"
    shift 2>/dev/null || true
    case "$GRAPH_CMD" in
      search_graph|trace_call_path|detect_changes|get_architecture|get_code_snippet|query_graph|get_graph_schema|search_code|list_projects|index_repository)
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
    echo "Allowed commands: task, knowledge, git, post, graph"
    exit 1
    ;;
esac
