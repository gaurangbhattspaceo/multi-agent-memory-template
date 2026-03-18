#!/usr/bin/env node
/**
 * Retry Analyzer — error classification and remediation suggestions
 *
 * Classifies build, test, deployment, and infrastructure errors into
 * known categories. Logs failures to task history for tracking, and
 * provides fix suggestions. Escalation warnings trigger after 3+
 * consecutive failures on the same task.
 *
 * Usage:
 *   node retry-analyzer.js analyze "<error-output>"         # classify error type + suggest fix
 *   node retry-analyzer.js log <task-id> "<error-output>"   # log failure to task history
 *   node retry-analyzer.js history <task-id>                # view past failures for a task
 *
 * Environment:
 *   TASKS_FILE   — path to tasks JSON (default: /data/tasks.json)
 *   AGENT_ID     — current agent identifier for audit trail
 *
 * Error types:
 *   build-error, test-failure, deploy-error, merge-conflict,
 *   pipeline-failure, permission-error, network-error, unknown
 */

const fs = require('fs');

// ─── Configuration ──────────────────────────────────────────────────────

const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';

// ─── Argument Parsing ───────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

if (!command || !['analyze', 'log', 'history'].includes(command)) {
  console.error('Usage: node retry-analyzer.js analyze|log|history [args]');
  console.error('');
  console.error('Commands:');
  console.error('  analyze "<error>"         Classify error and suggest a fix');
  console.error('  log <task-id> "<error>"   Log failure to a task\'s history');
  console.error('  history <task-id>         View failure history for a task');
  process.exit(1);
}

// ─── Error Classification Patterns ──────────────────────────────────────
// Each entry has a type label, a list of regex patterns to match against
// the raw error output, and a human-readable suggestion for remediation.

const ERROR_PATTERNS = [
  {
    type: 'build-error',
    patterns: [
      /cannot find module/i,
      /module not found/i,
      /compilation error/i,
      /syntax error/i,
      /ts\(\d+\)/i,
      /error ts\d+/i,
      /npm err!/i,
      /npm error/i,
      /eresolve/i,
      /cannot find name/i,
      /unexpected token/i,
      /type error/i,
      /missing import/i,
      /is not assignable to/i,
      /tsc.*error/i
    ],
    suggestion: 'Check imports, dependencies, and types. Run `npm install` if modules are missing. Verify build configuration (tsconfig, webpack, etc.).'
  },
  {
    type: 'test-failure',
    patterns: [
      /test failed/i,
      /tests? failing/i,
      /assertion error/i,
      /expect\(.*\)\.(to|not)/i,
      /jest.*fail/i,
      /vitest.*fail/i,
      /test suite failed/i,
      /expected.*received/i,
      /toequal/i,
      /tobe\(/i,
      /playwright.*fail/i
    ],
    suggestion: 'Review failing test expectations vs actual output. Check if the implementation changed or test assumptions are stale.'
  },
  {
    type: 'deploy-error',
    patterns: [
      /pm2.*error/i,
      /econnrefused/i,
      /health.?check.*fail/i,
      /port.*already in use/i,
      /eaddrinuse/i,
      /process.*crash/i,
      /restart limit reached/i,
      /out of memory/i,
      /oom/i,
      /killed/i,
      /docker.*error/i
    ],
    suggestion: 'Check process manager logs. Verify ports are free. Check memory usage. Consider rolling back the deployment.'
  },
  {
    type: 'merge-conflict',
    patterns: [
      /merge conflict/i,
      /conflict.*merge/i,
      /automatic merge failed/i,
      /fix conflicts/i,
      /both modified/i,
      /unmerged/i
    ],
    suggestion: 'Pull latest from the target branch, resolve conflicts manually, then re-push. Run: git pull origin <branch> && resolve conflicts && git add . && git commit'
  },
  {
    type: 'pipeline-failure',
    patterns: [
      /pipeline.*fail/i,
      /ci.*fail/i,
      /job.*fail/i,
      /stage.*fail/i,
      /runner.*error/i,
      /actions.*fail/i,
      /workflow.*fail/i
    ],
    suggestion: 'Check CI/CD pipeline logs. Common causes: missing environment variables, failed tests, linting errors. Re-trigger the pipeline after fixing.'
  },
  {
    type: 'permission-error',
    patterns: [
      /permission denied/i,
      /eacces/i,
      /access denied/i,
      /unauthorized/i,
      /403 forbidden/i,
      /401 unauthorized/i
    ],
    suggestion: 'Check file permissions, API tokens, and SSH keys. Verify credentials and access tokens are valid and not expired.'
  },
  {
    type: 'network-error',
    patterns: [
      /enotfound/i,
      /etimedout/i,
      /econnreset/i,
      /socket hang up/i,
      /network error/i,
      /dns.*fail/i,
      /fetch.*fail/i
    ],
    suggestion: 'Check network connectivity. Verify API endpoints are reachable. DNS or firewall rules may be blocking the connection.'
  }
];

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Match error text against known patterns and return classification.
 */
function classifyError(errorText) {
  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorText)) {
        return {
          type: pattern.type,
          suggestion: pattern.suggestion,
          matchedPattern: regex.source
        };
      }
    }
  }
  return {
    type: 'unknown',
    suggestion: 'Could not classify this error. Log it for human review. Check the full error output for context.',
    matchedPattern: null
  };
}

/**
 * Load the tasks data file.
 */
function loadTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return { tasks: [], nextId: 1 };
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch (err) {
    console.error('ERROR: Failed to load tasks: ' + err.message);
    process.exit(1);
  }
}

/**
 * Atomically save the tasks data file.
 */
function saveTasks(data) {
  const tmp = TASKS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, TASKS_FILE);
}

// ─── Commands ───────────────────────────────────────────────────────────

switch (command) {

  // ── analyze ───────────────────────────────────────────────────────
  case 'analyze': {
    const errorText = args.join(' ');
    if (!errorText) {
      console.error('Usage: node retry-analyzer.js analyze "<error-output>"');
      process.exit(1);
    }

    const result = classifyError(errorText);

    console.log('=== ERROR ANALYSIS ===');
    console.log('Type: ' + result.type);
    console.log('Suggestion: ' + result.suggestion);
    if (result.matchedPattern) {
      console.log('Matched: ' + result.matchedPattern);
    }
    console.log('');
    console.log('Error excerpt: ' + errorText.slice(0, 500));
    console.log('=== END ANALYSIS ===');
    break;
  }

  // ── log ───────────────────────────────────────────────────────────
  case 'log': {
    const taskId = args[0];
    const errorText = args.slice(1).join(' ');

    if (!taskId || !errorText) {
      console.error('Usage: node retry-analyzer.js log <task-id> "<error-output>"');
      process.exit(1);
    }

    const data = loadTasks();
    const task = data.tasks.find(t => t.id === taskId.toUpperCase());

    if (!task) {
      console.error('ERROR: Task "' + taskId.toUpperCase() + '" not found.');
      process.exit(1);
    }

    const result = classifyError(errorText);

    // Count existing retries for this task
    const retryCount = task.history.filter(h => h.note && h.note.startsWith('RETRY:')).length + 1;

    const now = new Date().toISOString();
    var agentId = process.env.AGENT_ID || 'unknown';

    task.history.push({
      status: task.status,
      at: now,
      by: agentId,
      note: 'RETRY: ' + result.type + ' — ' + errorText.slice(0, 200),
      errorType: result.type,
      retryCount: retryCount
    });
    task.updatedAt = now;

    saveTasks(data);

    console.log('=== FAILURE LOGGED ===');
    console.log('Task: ' + task.id);
    console.log('Error type: ' + result.type);
    console.log('Retry count: ' + retryCount);
    console.log('Suggestion: ' + result.suggestion);

    if (retryCount >= 3) {
      console.log('');
      console.log('WARNING: Task has failed ' + retryCount + ' times. Consider:');
      console.log('  1. Escalating to the lead agent for manual review');
      console.log('  2. Breaking the task into smaller pieces');
      console.log('  3. Checking if the approach needs to change');
    }

    console.log('=== END ===');
    break;
  }

  // ── history ───────────────────────────────────────────────────────
  case 'history': {
    const taskId = args[0];
    if (!taskId) {
      console.error('Usage: node retry-analyzer.js history <task-id>');
      process.exit(1);
    }

    const data = loadTasks();
    const task = data.tasks.find(t => t.id === taskId.toUpperCase());

    if (!task) {
      console.error('ERROR: Task "' + taskId.toUpperCase() + '" not found.');
      process.exit(1);
    }

    const failures = task.history.filter(h => h.errorType);

    console.log('=== FAILURE HISTORY: ' + task.id + ' ===');
    console.log('Title: ' + task.title);
    console.log('Status: ' + task.status);
    console.log('Total failures: ' + failures.length);
    console.log('');

    if (failures.length === 0) {
      console.log('No failures recorded.');
    } else {
      for (const f of failures) {
        console.log('#' + f.retryCount + ' [' + f.errorType + '] ' + f.at);
        console.log('  ' + f.note);
        console.log('');
      }
    }

    console.log('=== END FAILURE HISTORY ===');
    break;
  }
}
