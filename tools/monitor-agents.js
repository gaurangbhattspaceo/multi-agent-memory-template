#!/usr/bin/env node
/**
 * Agent Monitor — team dashboard combining task status and process info
 *
 * Provides a bird's-eye view of the multi-agent team: per-agent task
 * counts, overall open/blocked/in-progress totals, and process health.
 * Output is formatted text suitable for posting to a chat channel.
 *
 * Usage:
 *   node monitor-agents.js dashboard         # full team status
 *   node monitor-agents.js agent <agent-id>  # single agent activity
 *   node monitor-agents.js tasks             # task summary only
 *
 * Environment:
 *   TASKS_FILE     — path to tasks JSON file (default: /data/tasks.json)
 *   VALID_AGENTS   — comma-separated list of agent names
 *                    (default: lead-agent,engineer-agent,devops-agent)
 */

const fs = require('fs');
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────

const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';

// Teams can customize their agent roster via environment variable
const VALID_AGENTS = process.env.VALID_AGENTS
  ? process.env.VALID_AGENTS.split(',').map(a => a.trim())
  : ['lead-agent', 'engineer-agent', 'devops-agent'];

// ─── Argument Parsing ───────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

if (!command || !['dashboard', 'agent', 'tasks'].includes(command)) {
  console.error('Usage: node monitor-agents.js dashboard|agent|tasks [args]');
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Load the tasks data file. Returns empty structure if missing.
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
 * Compute status counts across all tasks.
 */
function getTaskStats(tasks) {
  const stats = { open: 0, 'in-progress': 0, review: 0, done: 0, blocked: 0 };
  for (const t of tasks) {
    if (stats[t.status] !== undefined) stats[t.status]++;
  }
  return stats;
}

/**
 * Return active (non-done) tasks for a specific agent.
 */
function getAgentTasks(tasks, agentId) {
  return tasks.filter(t => t.assignee === agentId && t.status !== 'done');
}

/**
 * Attempt to read PM2 process list for health overview.
 * Returns a summary object; gracefully handles PM2 being absent.
 */
function getProcessStatus() {
  try {
    const output = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
    const processes = JSON.parse(output);
    const online = processes.filter(p => p.pm2_env.status === 'online').length;
    const total = processes.length;
    const details = processes.map(p => p.name + ':' + p.pm2_env.status);
    return { online, total, details, error: null };
  } catch (err) {
    return { online: 0, total: 0, details: [], error: err.message };
  }
}

// ─── Commands ───────────────────────────────────────────────────────────

switch (command) {

  // ── dashboard ─────────────────────────────────────────────────────
  case 'dashboard': {
    const data = loadTasks();
    const stats = getTaskStats(data.tasks);
    const pm2 = getProcessStatus();

    console.log('=== TEAM DASHBOARD ===');
    console.log('');

    // Task summary
    console.log('Tasks: ' + stats.open + ' open, ' + stats['in-progress'] + ' in-progress, ' +
      stats.review + ' in-review, ' + stats.done + ' done' +
      (stats.blocked > 0 ? ', ' + stats.blocked + ' blocked' : ''));
    console.log('');

    // Per-agent status
    for (const agent of VALID_AGENTS) {
      const agentTasks = getAgentTasks(data.tasks, agent);
      if (agentTasks.length === 0) {
        console.log(agent + ': idle (no active tasks)');
      } else {
        const byStatus = {};
        for (const t of agentTasks) {
          if (!byStatus[t.status]) byStatus[t.status] = [];
          byStatus[t.status].push(t.id);
        }
        const parts = Object.entries(byStatus).map(
          ([s, ids]) => ids.length + ' ' + s + ' (' + ids.join(', ') + ')'
        );
        console.log(agent + ': ' + parts.join(', '));
      }
    }

    // Unassigned tasks
    const unassigned = data.tasks.filter(t => t.assignee === 'unassigned' && t.status !== 'done');
    if (unassigned.length > 0) {
      console.log('');
      console.log('Unassigned: ' + unassigned.length + ' task(s) awaiting assignment');
      for (const t of unassigned) {
        console.log('  ' + t.id + ' [' + t.priority + '] ' + t.title);
      }
    }

    console.log('');

    // Process manager status (PM2 or similar)
    if (pm2.error) {
      console.log('Processes: unavailable (PM2 not running or not installed)');
    } else {
      console.log('Processes: ' + pm2.online + '/' + pm2.total + ' online');
      if (pm2.online < pm2.total) {
        console.log('  WARNING: ' + pm2.details.filter(d => !d.endsWith(':online')).join(', '));
      }
    }

    console.log('');
    console.log('Generated: ' + new Date().toISOString());
    console.log('=== END DASHBOARD ===');
    break;
  }

  // ── agent ─────────────────────────────────────────────────────────
  case 'agent': {
    const agentId = args[0];
    if (!agentId || !VALID_AGENTS.includes(agentId)) {
      console.error('ERROR: Provide a valid agent ID. Valid: ' + VALID_AGENTS.join(', '));
      process.exit(1);
    }

    const data = loadTasks();
    const agentTasks = data.tasks.filter(t => t.assignee === agentId);
    const active = agentTasks.filter(t => t.status !== 'done');
    const completed = agentTasks.filter(t => t.status === 'done');

    console.log('=== AGENT: ' + agentId + ' ===');
    console.log('Active tasks: ' + active.length);
    console.log('Completed tasks: ' + completed.length);
    console.log('');

    if (active.length > 0) {
      console.log('Active:');
      for (const t of active) {
        console.log('  ' + t.id + ' [' + t.status + '] [' + t.priority + '] ' + t.title);
      }
    }

    if (completed.length > 0) {
      console.log('Completed (most recent 5):');
      const recent = completed.slice(-5);
      for (const t of recent) {
        console.log('  ' + t.id + ' ' + t.title);
      }
    }

    console.log('=== END AGENT ===');
    break;
  }

  // ── tasks ─────────────────────────────────────────────────────────
  case 'tasks': {
    const data = loadTasks();
    const stats = getTaskStats(data.tasks);

    console.log('=== TASK SUMMARY ===');
    console.log('Total: ' + data.tasks.length);
    console.log('Open: ' + stats.open);
    console.log('In Progress: ' + stats['in-progress']);
    console.log('In Review: ' + stats.review);
    console.log('Done: ' + stats.done);
    console.log('Blocked: ' + stats.blocked);
    console.log('');

    const active = data.tasks.filter(t => t.status !== 'done');
    if (active.length > 0) {
      console.log('Active tasks:');
      for (const t of active) {
        console.log('  ' + t.id + ' [' + t.status + '] [' + t.priority + '] ' + t.title + ' (' + t.assignee + ')');
      }
    }

    console.log('=== END TASK SUMMARY ===');
    break;
  }
}
