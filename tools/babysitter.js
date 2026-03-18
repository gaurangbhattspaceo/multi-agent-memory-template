#!/usr/bin/env node
// Smart Babysitter — proactive task monitoring and escalation
// Detects stuck tasks, retry limits, and escalates when intervention is needed
//
// Usage:
//   node babysitter.js check                        # full check (stuck + retries)
//   node babysitter.js check-stuck                  # tasks in-progress > 2 hours
//   node babysitter.js check-retries                # tasks at/over 3-retry limit
//   node babysitter.js escalate <task-id> "reason"  # log escalation
//
// No npm dependencies required. Uses only Node.js built-in modules.

const fs = require('fs');

// --- Configuration ---
// Adjust these paths to match your deployment layout
const TASKS_FILE = '/data/tasks.json';
const ESCALATION_FILE = '/data/knowledge/escalations.json';

// Thresholds
const STUCK_WARNING_HOURS = 2;   // Warning after 2 hours in-progress
const STUCK_CRITICAL_HOURS = 4;  // Critical after 4 hours in-progress
const MAX_RETRIES = 3;           // Escalate after 3 retries

// --- Parse arguments ---
const [,, command, ...args] = process.argv;

const VALID_COMMANDS = ['check', 'check-stuck', 'check-retries', 'escalate'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node babysitter.js check|check-stuck|check-retries|escalate [args]');
  console.error('');
  console.error('Commands:');
  console.error('  check              Full check (stuck tasks + retry limits)');
  console.error('  check-stuck        Tasks in-progress longer than ' + STUCK_WARNING_HOURS + ' hours');
  console.error('  check-retries      Tasks at or over ' + MAX_RETRIES + '-retry limit');
  console.error('  escalate <id> "r"  Log escalation for a task with a reason');
  process.exit(1);
}

// --- Helpers ---

/**
 * Load the task registry from disk.
 * Expected format: { tasks: [...], nextId: N }
 */
function loadTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return { tasks: [], nextId: 1 };
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch {
    return { tasks: [], nextId: 1 };
  }
}

/**
 * Calculate hours elapsed since an ISO date string.
 */
function hoursSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);
}

/**
 * Count retry attempts from task history.
 * Looks for history entries with notes starting with "RETRY:".
 */
function getRetryCount(task) {
  return (task.history || []).filter(h => h.note && h.note.startsWith('RETRY:')).length;
}

// --- Check Functions ---

/**
 * Find tasks that have been in-progress longer than the warning threshold.
 * Returns structured recommendations: RETRY or ESCALATE.
 */
function checkStuckTasks(tasks) {
  const stuck = [];

  for (const task of tasks) {
    if (task.status !== 'in-progress') continue;

    const hours = hoursSince(task.updatedAt);
    const retries = getRetryCount(task);

    if (hours >= STUCK_WARNING_HOURS) {
      stuck.push({
        task: task,
        hours: Math.round(hours * 10) / 10,
        retries: retries,
        critical: hours >= STUCK_CRITICAL_HOURS,
        action: retries >= MAX_RETRIES
          ? 'ESCALATE'
          : 'RETRY'
      });
    }
  }

  return stuck;
}

/**
 * Find tasks that have reached or exceeded the retry limit.
 */
function checkRetryLimits(tasks) {
  const atLimit = [];

  for (const task of tasks) {
    if (task.status === 'done') continue;

    const retries = getRetryCount(task);
    if (retries >= MAX_RETRIES) {
      atLimit.push({
        task: task,
        retries: retries,
        lastError: (task.history || [])
          .filter(h => h.errorType)
          .slice(-1)[0] || null
      });
    }
  }

  return atLimit;
}

/**
 * Log an escalation event to the escalation file.
 * Creates the directory if it does not exist.
 */
function logEscalation(taskId, reason) {
  const escalationDir = '/data/knowledge';
  if (!fs.existsSync(escalationDir)) {
    fs.mkdirSync(escalationDir, { recursive: true });
  }

  let escalations = { items: [] };
  try {
    if (fs.existsSync(ESCALATION_FILE)) {
      escalations = JSON.parse(fs.readFileSync(ESCALATION_FILE, 'utf8'));
    }
  } catch { /* start fresh */ }

  escalations.items.push({
    taskId: taskId,
    reason: reason,
    escalatedAt: new Date().toISOString(),
    escalatedBy: process.env.OPENCLAW_AGENT_ID || 'babysitter'
  });

  // Atomic write: write to temp file, then rename
  const tmp = ESCALATION_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(escalations, null, 2));
  fs.renameSync(tmp, ESCALATION_FILE);
}

// --- Main ---
(async () => {
  try {
    const data = loadTasks();

    switch (command) {

      case 'check': {
        const stuck = checkStuckTasks(data.tasks);
        const retryLimits = checkRetryLimits(data.tasks);

        console.log('=== BABYSITTER CHECK ===');
        console.log('');

        // Stuck tasks
        console.log('STUCK TASKS: ' + stuck.length);
        if (stuck.length > 0) {
          for (const s of stuck) {
            const severity = s.critical ? 'CRITICAL' : 'WARNING';
            console.log('  [' + severity + ' ' + s.hours + 'h] ' + s.task.id + ' "' +
              s.task.title + '" (' + (s.task.assignee || 'unassigned') + ', ' + s.retries + ' retries)');
            console.log('    -> ' + s.action + ': ' + (s.action === 'ESCALATE'
              ? 'Too many retries. Escalate for human review.'
              : 'Re-spawn agent with retry context.'));
          }
        }
        console.log('');

        // Retry limits
        console.log('RETRY LIMIT REACHED: ' + retryLimits.length);
        if (retryLimits.length > 0) {
          for (const r of retryLimits) {
            const lastErr = r.lastError ? r.lastError.errorType : 'unknown';
            console.log('  [LIMIT] ' + r.task.id + ' "' + r.task.title + '" (' +
              r.retries + ' retries, last error: ' + lastErr + ')');
            console.log('    -> ESCALATE: Needs human review.');
          }
        }
        console.log('');

        const totalIssues = stuck.length + retryLimits.length;
        console.log('SUMMARY: ' + stuck.length + ' stuck, ' +
          retryLimits.length + ' at-retry-limit');
        if (totalIssues === 0) {
          console.log('All clear -- no issues detected.');
        }
        console.log('');
        console.log('Checked: ' + new Date().toISOString());
        console.log('=== END BABYSITTER CHECK ===');
        break;
      }

      case 'check-stuck': {
        const stuck = checkStuckTasks(data.tasks);

        console.log('=== STUCK TASKS: ' + stuck.length + ' ===');
        if (stuck.length === 0) {
          console.log('No stuck tasks.');
        } else {
          for (const s of stuck) {
            const severity = s.critical ? 'CRITICAL' : 'WARNING';
            console.log('[' + severity + '] ' + s.task.id + ' "' + s.task.title +
              '" stuck ' + s.hours + 'h (' + (s.task.assignee || 'unassigned') +
              ', ' + s.retries + ' retries)');
            console.log('  -> ' + s.action);
          }
        }
        console.log('=== END ===');
        break;
      }

      case 'check-retries': {
        const retryLimits = checkRetryLimits(data.tasks);

        console.log('=== RETRY LIMITS: ' + retryLimits.length + ' at limit ===');
        if (retryLimits.length === 0) {
          console.log('No tasks at retry limit.');
        } else {
          for (const r of retryLimits) {
            console.log('[LIMIT] ' + r.task.id + ' "' + r.task.title +
              '" (' + r.retries + ' retries, assignee: ' + (r.task.assignee || 'unassigned') + ')');
            if (r.lastError) {
              console.log('  Last error: ' + r.lastError.errorType);
            }
          }
        }
        console.log('=== END ===');
        break;
      }

      case 'escalate': {
        const taskId = args[0];
        const reason = args.slice(1).join(' ');

        if (!taskId || !reason) {
          console.error('Usage: node babysitter.js escalate <task-id> "<reason>"');
          process.exit(1);
        }

        const normalizedId = taskId.toUpperCase();
        const task = data.tasks.find(t => t.id === normalizedId);
        if (!task) {
          console.error('ERROR: Task "' + normalizedId + '" not found.');
          process.exit(1);
        }

        // Log the escalation
        logEscalation(normalizedId, reason);

        // Update task status to blocked
        const now = new Date().toISOString();
        task.status = 'blocked';
        task.updatedAt = now;
        if (!task.history) task.history = [];
        task.history.push({
          status: 'blocked',
          at: now,
          by: process.env.OPENCLAW_AGENT_ID || 'babysitter',
          note: 'ESCALATED: ' + reason
        });

        // Atomic write
        const tmp = TASKS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, TASKS_FILE);

        console.log('=== TASK ESCALATED ===');
        console.log('Task: ' + task.id + ' "' + task.title + '"');
        console.log('Status: blocked');
        console.log('Reason: ' + reason);
        console.log('Action: Post to alerts channel for human attention.');
        console.log('=== END ===');
        break;
      }
    }
  } catch (err) {
    console.error('=== BABYSITTER ERROR: ' + err.message + ' ===');
    process.exit(1);
  }
})();
