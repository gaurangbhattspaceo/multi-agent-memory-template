#!/usr/bin/env node
/**
 * Task Registry — JSON-based task management for multi-agent teams
 *
 * Provides task creation with deduplication, status tracking, priority
 * management, linking to merge requests and branches, and search.
 *
 * Data file: /data/tasks.json
 * Structure: { tasks: [...], nextId: 1 }
 *
 * Usage:
 *   node task-registry.js create "<title>" "<desc>" "<assignee>" [--priority X] [--source X] [--sourceRef X] [--tags X]
 *   node task-registry.js list [status]          # open|in-progress|review|done|blocked|all (default: all)
 *   node task-registry.js get <task-id>          # show full task details
 *   node task-registry.js update <task-id> <status> "[note]"
 *   node task-registry.js link <task-id> mr <project-id> <mr-iid>
 *   node task-registry.js link <task-id> branch <branch-name>
 *   node task-registry.js search --sourceRef "<ref>" | --source "<source>" | --priority "<priority>"
 *
 * Environment:
 *   TASKS_FILE          — path to tasks JSON file (default: /data/tasks.json)
 *   AGENT_ID            — current agent identifier for audit trail
 *   VALID_AGENTS        — comma-separated list of valid agent names (optional)
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────

const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';
const VALID_STATUSES = ['open', 'in-progress', 'review', 'done', 'blocked'];
const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const VALID_SOURCES = ['manual', 'test-failure', 'health-alert', 'issue-tracker', 'scan', 'other'];
const VALID_COMMANDS = ['create', 'list', 'get', 'update', 'link', 'search'];

// Allow teams to configure their own agent names via environment variable
const VALID_AGENTS = process.env.VALID_AGENTS
  ? process.env.VALID_AGENTS.split(',').map(a => a.trim())
  : null; // null means no validation — accept any assignee

// ─── Argument Parsing ───────────────────────────────────────────────────

const [,, command, ...rawArgs] = process.argv;

if (!command) {
  console.error('Usage: node task-registry.js <command> [args]');
  console.error('Commands: ' + VALID_COMMANDS.join(', '));
  process.exit(1);
}

if (!VALID_COMMANDS.includes(command)) {
  console.error('ERROR: Unknown command "' + command + '". Valid: ' + VALID_COMMANDS.join(', '));
  process.exit(1);
}

/**
 * Extract --key value pairs from an argument array.
 * Returns { positional: [...], flags: { key: value } }
 */
function parseFlags(argsArray) {
  var positional = [];
  var flags = {};
  var i = 0;
  while (i < argsArray.length) {
    if (argsArray[i] && argsArray[i].indexOf('--') === 0 && argsArray[i].length > 2) {
      var key = argsArray[i].slice(2);
      var val = (i + 1 < argsArray.length) ? argsArray[i + 1] : '';
      flags[key] = val;
      i += 2;
    } else {
      positional.push(argsArray[i]);
      i++;
    }
  }
  return { positional: positional, flags: flags };
}

// ─── File I/O ───────────────────────────────────────────────────────────

/**
 * Load the tasks data file. Creates the file with initial structure if missing.
 */
function loadTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) {
      var initial = { tasks: [], nextId: 1 };
      fs.mkdirSync(path.dirname(TASKS_FILE), { recursive: true });
      fs.writeFileSync(TASKS_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch (err) {
    console.error('ERROR: Failed to load tasks: ' + err.message);
    process.exit(1);
  }
}

/**
 * Atomically save the tasks data file (write to .tmp then rename).
 */
function saveTasks(data) {
  try {
    var tmp = TASKS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, TASKS_FILE);
  } catch (err) {
    console.error('ERROR: Failed to save tasks: ' + err.message);
    process.exit(1);
  }
}

/**
 * Format a numeric ID as TASK-001, TASK-002, etc.
 */
function formatTaskId(num) {
  return 'TASK-' + String(num).padStart(3, '0');
}

/**
 * Find a task by its ID (case-insensitive).
 */
function findTask(data, taskId) {
  var id = taskId.toUpperCase();
  return data.tasks.find(function(t) { return t.id === id; });
}

// ─── Commands ───────────────────────────────────────────────────────────

var data = loadTasks();

switch (command) {

  // ── create ──────────────────────────────────────────────────────────
  case 'create': {
    var parsed = parseFlags(rawArgs);
    var title = parsed.positional[0];
    var description = parsed.positional[1] || '';
    var assignee = parsed.positional[2] || '';

    var priority = parsed.flags.priority || 'medium';
    var source = parsed.flags.source || 'manual';
    var sourceRef = parsed.flags.sourceRef || null;
    var tagsRaw = parsed.flags.tags || '';
    var tags = tagsRaw
      ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t.length > 0; })
      : [];

    if (!title) {
      console.error('Usage: node task-registry.js create "<title>" "<desc>" "<assignee>" [--priority X] [--source X] [--sourceRef X] [--tags X]');
      process.exit(1);
    }

    // Validate assignee if VALID_AGENTS is configured
    if (assignee && VALID_AGENTS && !VALID_AGENTS.includes(assignee)) {
      console.error('ERROR: Invalid assignee "' + assignee + '". Valid: ' + VALID_AGENTS.join(', '));
      process.exit(1);
    }

    if (!VALID_PRIORITIES.includes(priority)) {
      console.error('ERROR: Invalid priority "' + priority + '". Valid: ' + VALID_PRIORITIES.join(', '));
      process.exit(1);
    }

    if (!VALID_SOURCES.includes(source)) {
      console.error('ERROR: Invalid source "' + source + '". Valid: ' + VALID_SOURCES.join(', '));
      process.exit(1);
    }

    // Deduplication: if sourceRef is provided, reject if an open/in-progress
    // task already exists with the same sourceRef
    if (sourceRef) {
      var duplicate = data.tasks.find(function(t) {
        return t.sourceRef === sourceRef && (t.status === 'open' || t.status === 'in-progress');
      });
      if (duplicate) {
        console.log('=== DUPLICATE DETECTED ===');
        console.log('Existing task ' + duplicate.id + ' already has sourceRef "' + sourceRef + '" (status: ' + duplicate.status + ')');
        console.log('Skipping creation. Use "get ' + duplicate.id + '" to view the existing task.');
        console.log('=== END ===');
        process.exit(0);
      }
    }

    var now = new Date().toISOString();
    var taskId = formatTaskId(data.nextId);
    var agentId = process.env.AGENT_ID || 'unknown';

    var task = {
      id: taskId,
      title: title,
      description: description,
      status: 'open',
      assignee: assignee || 'unassigned',
      priority: priority,
      source: source,
      sourceRef: sourceRef,
      tags: tags,
      createdBy: agentId,
      createdAt: now,
      updatedAt: now,
      links: { mr: null, branch: null, projectId: null },
      history: [
        { status: 'open', at: now, by: agentId, note: 'Created' }
      ]
    };

    data.tasks.push(task);
    data.nextId++;
    saveTasks(data);

    console.log('=== TASK CREATED ===');
    console.log('ID: ' + taskId);
    console.log('Title: ' + title);
    console.log('Assignee: ' + (assignee || 'unassigned'));
    console.log('Status: open');
    console.log('Priority: ' + priority);
    console.log('Source: ' + source);
    if (sourceRef) console.log('SourceRef: ' + sourceRef);
    if (tags.length > 0) console.log('Tags: ' + tags.join(', '));
    console.log('=== END ===');
    break;
  }

  // ── list ────────────────────────────────────────────────────────────
  case 'list': {
    var filterStatus = rawArgs[0] || 'all';

    if (filterStatus !== 'all' && !VALID_STATUSES.includes(filterStatus)) {
      console.error('ERROR: Invalid status filter. Valid: ' + VALID_STATUSES.join(', ') + ', all');
      process.exit(1);
    }

    var filtered = filterStatus === 'all'
      ? data.tasks
      : data.tasks.filter(function(t) { return t.status === filterStatus; });

    if (filtered.length === 0) {
      console.log('=== TASKS: No tasks found' + (filterStatus !== 'all' ? ' with status "' + filterStatus + '"' : '') + ' ===');
      break;
    }

    console.log('=== TASK LIST (' + filtered.length + ' tasks' + (filterStatus !== 'all' ? ', status: ' + filterStatus : '') + ') ===');
    for (var i = 0; i < filtered.length; i++) {
      var t = filtered[i];
      var mrInfo = t.links.mr ? ' MR:!' + t.links.mr : '';
      var branchInfo = t.links.branch ? ' branch:' + t.links.branch : '';
      var priorityInfo = t.priority ? ' [' + t.priority + ']' : '';
      console.log(t.id + ' [' + t.status + ']' + priorityInfo + ' ' + t.title + ' (' + t.assignee + ')' + mrInfo + branchInfo);
    }
    console.log('=== END TASK LIST ===');
    break;
  }

  // ── get ─────────────────────────────────────────────────────────────
  case 'get': {
    var taskId = rawArgs[0];
    if (!taskId) {
      console.error('Usage: node task-registry.js get <task-id>');
      process.exit(1);
    }

    var task = findTask(data, taskId);
    if (!task) {
      console.error('ERROR: Task "' + taskId.toUpperCase() + '" not found.');
      process.exit(1);
    }

    console.log('=== TASK ' + task.id + ' ===');
    console.log(JSON.stringify(task, null, 2));
    console.log('=== END TASK ===');
    break;
  }

  // ── update ──────────────────────────────────────────────────────────
  case 'update': {
    var taskId = rawArgs[0];
    var newStatus = rawArgs[1];
    var note = rawArgs.slice(2).join(' ') || '';

    if (!taskId || !newStatus) {
      console.error('Usage: node task-registry.js update <task-id> <status> "[note]"');
      console.error('Valid statuses: ' + VALID_STATUSES.join(', '));
      process.exit(1);
    }

    if (!VALID_STATUSES.includes(newStatus)) {
      console.error('ERROR: Invalid status "' + newStatus + '". Valid: ' + VALID_STATUSES.join(', '));
      process.exit(1);
    }

    var task = findTask(data, taskId);
    if (!task) {
      console.error('ERROR: Task "' + taskId.toUpperCase() + '" not found.');
      process.exit(1);
    }

    var now = new Date().toISOString();
    var oldStatus = task.status;
    var agentId = process.env.AGENT_ID || 'unknown';

    task.status = newStatus;
    task.updatedAt = now;
    task.history.push({
      status: newStatus,
      at: now,
      by: agentId,
      note: note || oldStatus + ' -> ' + newStatus
    });

    saveTasks(data);

    console.log('=== TASK UPDATED ===');
    console.log('ID: ' + task.id);
    console.log('Status: ' + oldStatus + ' -> ' + newStatus);
    if (note) console.log('Note: ' + note);
    console.log('=== END ===');
    break;
  }

  // ── link ────────────────────────────────────────────────────────────
  case 'link': {
    var taskId = rawArgs[0];
    var linkType = rawArgs[1];

    if (!taskId || !linkType) {
      console.error('Usage: node task-registry.js link <task-id> mr <project-id> <mr-iid>');
      console.error('       node task-registry.js link <task-id> branch <branch-name>');
      process.exit(1);
    }

    var task = findTask(data, taskId);
    if (!task) {
      console.error('ERROR: Task "' + taskId.toUpperCase() + '" not found.');
      process.exit(1);
    }

    var now = new Date().toISOString();
    var agentId = process.env.AGENT_ID || 'unknown';

    if (linkType === 'mr') {
      var projectId = rawArgs[2];
      var mrIid = rawArgs[3];
      if (!projectId || !mrIid) {
        console.error('Usage: node task-registry.js link <task-id> mr <project-id> <mr-iid>');
        process.exit(1);
      }
      task.links.mr = parseInt(mrIid, 10);
      task.links.projectId = parseInt(projectId, 10);
      task.updatedAt = now;
      task.history.push({
        status: task.status,
        at: now,
        by: agentId,
        note: 'Linked MR !' + mrIid + ' (project ' + projectId + ')'
      });
      saveTasks(data);
      console.log('=== TASK LINKED ===');
      console.log('ID: ' + task.id);
      console.log('Linked MR: !' + mrIid + ' (project ' + projectId + ')');
      console.log('=== END ===');

    } else if (linkType === 'branch') {
      var branchName = rawArgs[2];
      if (!branchName) {
        console.error('Usage: node task-registry.js link <task-id> branch <branch-name>');
        process.exit(1);
      }
      task.links.branch = branchName;
      task.updatedAt = now;
      task.history.push({
        status: task.status,
        at: now,
        by: agentId,
        note: 'Linked branch: ' + branchName
      });
      saveTasks(data);
      console.log('=== TASK LINKED ===');
      console.log('ID: ' + task.id);
      console.log('Linked branch: ' + branchName);
      console.log('=== END ===');

    } else {
      console.error('ERROR: Invalid link type "' + linkType + '". Valid: mr, branch');
      process.exit(1);
    }
    break;
  }

  // ── search ──────────────────────────────────────────────────────────
  case 'search': {
    var parsed = parseFlags(rawArgs);
    var searchSourceRef = parsed.flags.sourceRef || null;
    var searchSource = parsed.flags.source || null;
    var searchPriority = parsed.flags.priority || null;

    if (!searchSourceRef && !searchSource && !searchPriority) {
      console.error('Usage: node task-registry.js search --sourceRef "<ref>"');
      console.error('       node task-registry.js search --source "<source>"');
      console.error('       node task-registry.js search --priority "<priority>"');
      process.exit(1);
    }

    var results = data.tasks;

    if (searchSourceRef) {
      results = results.filter(function(t) { return t.sourceRef === searchSourceRef; });
    }
    if (searchSource) {
      results = results.filter(function(t) { return t.source === searchSource; });
    }
    if (searchPriority) {
      results = results.filter(function(t) { return t.priority === searchPriority; });
    }

    if (results.length === 0) {
      var criteria = [];
      if (searchSourceRef) criteria.push('sourceRef="' + searchSourceRef + '"');
      if (searchSource) criteria.push('source="' + searchSource + '"');
      if (searchPriority) criteria.push('priority="' + searchPriority + '"');
      console.log('=== SEARCH: No tasks found matching ' + criteria.join(', ') + ' ===');
      break;
    }

    console.log('=== SEARCH RESULTS (' + results.length + ' tasks) ===');
    for (var i = 0; i < results.length; i++) {
      var t = results[i];
      var priorityInfo = t.priority ? ' [' + t.priority + ']' : '';
      var sourceInfo = t.source ? ' src:' + t.source : '';
      var refInfo = t.sourceRef ? ' ref:' + t.sourceRef : '';
      console.log(t.id + ' [' + t.status + ']' + priorityInfo + ' ' + t.title + ' (' + t.assignee + ')' + sourceInfo + refInfo);
    }
    console.log('=== END SEARCH RESULTS ===');
    break;
  }
}
