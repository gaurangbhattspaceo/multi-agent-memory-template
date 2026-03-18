#!/usr/bin/env node
/**
 * Intake Triage — auto-create tasks from test failures and health alerts
 *
 * Reads structured result files (test results and health alerts), creates
 * tasks in the task registry for each failure/alert. Deduplicates by
 * sourceRef to avoid creating duplicate tasks for known issues.
 *
 * Input files:
 *   /data/releases/last-test-results.json — test runner output
 *   /data/releases/last-health-alert.json — health check alerts
 *
 * Usage:
 *   node intake-triage.js triage-tests   # parse test results, create tasks for failures
 *   node intake-triage.js triage-health  # parse health alerts, create tasks
 *   node intake-triage.js triage-all     # both (shared 10-task cap per run)
 *
 * Environment:
 *   TASKS_FILE               — path to tasks JSON (default: /data/tasks.json)
 *   TEST_RESULTS_FILE        — path to test results (default: /data/releases/last-test-results.json)
 *   HEALTH_ALERT_FILE        — path to health alerts (default: /data/releases/last-health-alert.json)
 *   TASK_REGISTRY_PATH       — path to task-registry.js (default: ./task-registry.js)
 *   MAX_TASKS_PER_RUN        — cap on tasks created per invocation (default: 10)
 *
 * Expected file formats:
 *
 *   last-test-results.json:
 *   {
 *     "timestamp": "...",
 *     "totalTests": 42,
 *     "passed": 40,
 *     "failed": 2,
 *     "failures": [
 *       { "testName": "login-flow", "title": "Login fails with invalid token", "error": "Expected 200 got 401" }
 *     ]
 *   }
 *
 *   last-health-alert.json:
 *   {
 *     "timestamp": "...",
 *     "alerts": [
 *       { "type": "process-down", "process": "your-api", "details": "Process exited with code 1" }
 *     ]
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────

const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';
const TEST_RESULTS_FILE = process.env.TEST_RESULTS_FILE || '/data/releases/last-test-results.json';
const HEALTH_ALERT_FILE = process.env.HEALTH_ALERT_FILE || '/data/releases/last-health-alert.json';
const RELEASES_DIR = path.dirname(TEST_RESULTS_FILE);
const TASK_REGISTRY = process.env.TASK_REGISTRY_PATH || path.join(__dirname, 'task-registry.js');
const MAX_TASKS_PER_RUN = parseInt(process.env.MAX_TASKS_PER_RUN, 10) || 10;

// ─── Argument Parsing ───────────────────────────────────────────────────

var command = process.argv[2];
var VALID_COMMANDS = ['triage-tests', 'triage-health', 'triage-all'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node intake-triage.js triage-tests|triage-health|triage-all');
  console.error('');
  console.error('Commands:');
  console.error('  triage-tests    Parse test results and create tasks for failures');
  console.error('  triage-health   Parse health alerts and create tasks');
  console.error('  triage-all      Run both (max ' + MAX_TASKS_PER_RUN + ' tasks per run)');
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load the tasks data file for deduplication checks.
 */
function loadTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return { tasks: [], nextId: 1 };
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch (err) {
    console.error('WARNING: Could not read tasks file: ' + err.message);
    return { tasks: [], nextId: 1 };
  }
}

/**
 * Check if a task with the given sourceRef already exists in open/in-progress state.
 */
function isDuplicate(tasksData, sourceRef) {
  return tasksData.tasks.some(function(t) {
    return t.sourceRef === sourceRef && (t.status === 'open' || t.status === 'in-progress');
  });
}

/**
 * Shell out to task-registry.js to create a task.
 * Returns { success, output }.
 */
function createTask(title, description, assignee, priority, source, sourceRef, tags) {
  // Escape double quotes in title and description for shell safety
  var safeTitle = title.replace(/"/g, '\\"');
  var safeDesc = description.replace(/"/g, '\\"');

  var cmd = 'node ' + TASK_REGISTRY + ' create ' +
    '"' + safeTitle + '" ' +
    '"' + safeDesc + '" ' +
    '"' + assignee + '" ' +
    '--priority ' + priority + ' ' +
    '--source ' + source + ' ' +
    '--sourceRef "' + sourceRef + '" ' +
    '--tags "' + tags + '"';

  try {
    var result = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
    return { success: true, output: result };
  } catch (err) {
    var errMsg = err.stderr || err.stdout || err.message;
    return { success: false, output: errMsg };
  }
}

/**
 * Classify a test by name to determine the assignee and tags.
 * Customize these patterns for your project.
 */
function classifyTestType(testName) {
  var infraPatterns = ['api', 'health', 'infra', 'server', 'deploy', 'docker', 'process', 'nginx'];
  var lowerName = testName.toLowerCase();

  for (var i = 0; i < infraPatterns.length; i++) {
    if (lowerName.indexOf(infraPatterns[i]) >= 0) {
      return { tags: 'regression,infra', assignee: 'devops-agent' };
    }
  }

  // Default: assign to engineer agent
  return { tags: 'regression,app', assignee: 'engineer-agent' };
}

/**
 * Determine priority based on health alert type.
 * Process-down and crash-related alerts are critical; others are high.
 */
function classifyHealthPriority(alertType) {
  var criticalPatterns = ['process-down', 'crash', 'oom', 'restart-loop', 'out-of-memory'];
  var lowerType = alertType.toLowerCase();

  for (var i = 0; i < criticalPatterns.length; i++) {
    if (lowerType.indexOf(criticalPatterns[i]) >= 0) {
      return 'critical';
    }
  }
  return 'high';
}

// ─── Triage: Test Failures ──────────────────────────────────────────────

function triageTests(tasksData, remainingCap) {
  var created = 0;
  var skipped = 0;
  var errors = 0;

  if (!fs.existsSync(TEST_RESULTS_FILE)) {
    console.log('  No test results file found: ' + TEST_RESULTS_FILE);
    console.log('  Run your test suite first to generate results.');
    return { created: 0, skipped: 0, errors: 0 };
  }

  var testData;
  try {
    testData = JSON.parse(fs.readFileSync(TEST_RESULTS_FILE, 'utf8'));
  } catch (err) {
    console.error('  ERROR: Failed to parse test results: ' + err.message);
    return { created: 0, skipped: 0, errors: 1 };
  }

  if (!testData.failures || testData.failures.length === 0) {
    console.log('  No failures found in test results. All ' + (testData.totalTests || 0) + ' tests passed.');
    return { created: 0, skipped: 0, errors: 0 };
  }

  console.log('  Found ' + testData.failures.length + ' test failure(s) to triage');
  console.log('  Results timestamp: ' + (testData.timestamp || 'unknown'));
  console.log('  Total tests: ' + testData.totalTests + ' | Passed: ' + testData.passed + ' | Failed: ' + testData.failed);
  console.log('');

  for (var i = 0; i < testData.failures.length; i++) {
    if (created >= remainingCap) {
      console.log('  CAP REACHED: Skipping remaining failures (max ' + MAX_TASKS_PER_RUN + ' tasks per run)');
      break;
    }

    var failure = testData.failures[i];
    var testName = failure.testName || 'unknown-test';
    var sourceRef = 'test:' + testName;

    // Check deduplication
    if (isDuplicate(tasksData, sourceRef)) {
      console.log('  [SKIP] ' + testName + ' -- duplicate (existing open/in-progress task)');
      skipped++;
      continue;
    }

    var classification = classifyTestType(testName);
    var title = 'Test failure: ' + (failure.title || testName);
    var errorMsg = failure.error || 'No error details';
    var description = 'Test "' + testName + '" failed: ' + errorMsg;

    var result = createTask(
      title,
      description,
      classification.assignee,
      'high',
      'test-failure',
      sourceRef,
      classification.tags
    );

    if (result.success) {
      var idMatch = result.output.match(/ID:\s*(TASK-\d+)/);
      var taskId = idMatch ? idMatch[1] : '?';
      console.log('  [CREATE] ' + taskId + ' -- ' + testName + ' -> ' + classification.assignee);
      created++;

      // Reload tasks data so subsequent dedup checks are accurate
      tasksData = loadTasks();
    } else {
      if (result.output.indexOf('DUPLICATE DETECTED') >= 0) {
        console.log('  [SKIP] ' + testName + ' -- duplicate (caught by task-registry)');
        skipped++;
      } else {
        console.error('  [ERROR] ' + testName + ' -- ' + result.output.slice(0, 200));
        errors++;
      }
    }
  }

  return { created: created, skipped: skipped, errors: errors };
}

// ─── Triage: Health Alerts ──────────────────────────────────────────────

function triageHealth(tasksData, remainingCap) {
  var created = 0;
  var skipped = 0;
  var errors = 0;

  if (!fs.existsSync(HEALTH_ALERT_FILE)) {
    console.log('  No health alert file found: ' + HEALTH_ALERT_FILE);
    console.log('  No health alerts to triage.');
    return { created: 0, skipped: 0, errors: 0 };
  }

  var healthData;
  try {
    healthData = JSON.parse(fs.readFileSync(HEALTH_ALERT_FILE, 'utf8'));
  } catch (err) {
    console.error('  ERROR: Failed to parse health alerts: ' + err.message);
    return { created: 0, skipped: 0, errors: 1 };
  }

  if (!healthData.alerts || healthData.alerts.length === 0) {
    console.log('  No alerts found in health data. System healthy.');
    return { created: 0, skipped: 0, errors: 0 };
  }

  console.log('  Found ' + healthData.alerts.length + ' health alert(s) to triage');
  console.log('  Alert timestamp: ' + (healthData.timestamp || 'unknown'));
  console.log('');

  for (var i = 0; i < healthData.alerts.length; i++) {
    if (created >= remainingCap) {
      console.log('  CAP REACHED: Skipping remaining alerts (max ' + MAX_TASKS_PER_RUN + ' tasks per run)');
      break;
    }

    var alert = healthData.alerts[i];
    var alertType = alert.type || 'unknown';
    var processName = alert.process || '';
    var sourceRef = 'health:' + alertType + (processName ? ':' + processName : '');

    // Check deduplication
    if (isDuplicate(tasksData, sourceRef)) {
      console.log('  [SKIP] ' + sourceRef + ' -- duplicate (existing open/in-progress task)');
      skipped++;
      continue;
    }

    var priority = classifyHealthPriority(alertType);
    var title = 'Health alert: ' + alertType + (processName ? ' (' + processName + ')' : '');
    var details = alert.details || 'No details provided';
    var description = 'Health check alert: ' + alertType + (processName ? ' for process ' + processName : '') + '. Details: ' + details;

    var result = createTask(
      title,
      description,
      'devops-agent',
      priority,
      'health-alert',
      sourceRef,
      'infra,health'
    );

    if (result.success) {
      var idMatch = result.output.match(/ID:\s*(TASK-\d+)/);
      var taskId = idMatch ? idMatch[1] : '?';
      console.log('  [CREATE] ' + taskId + ' -- ' + sourceRef + ' [' + priority + '] -> devops-agent');
      created++;

      // Reload tasks data so subsequent dedup checks are accurate
      tasksData = loadTasks();
    } else {
      if (result.output.indexOf('DUPLICATE DETECTED') >= 0) {
        console.log('  [SKIP] ' + sourceRef + ' -- duplicate (caught by task-registry)');
        skipped++;
      } else {
        console.error('  [ERROR] ' + sourceRef + ' -- ' + result.output.slice(0, 200));
        errors++;
      }
    }
  }

  return { created: created, skipped: skipped, errors: errors };
}

// ─── Main ───────────────────────────────────────────────────────────────

ensureDir(RELEASES_DIR);

switch (command) {

  case 'triage-tests': {
    console.log('=== TRIAGE RESULTS ===');
    console.log('Source: Test failures');
    console.log('Input: ' + TEST_RESULTS_FILE);
    console.log('');

    var tasksData = loadTasks();
    var result = triageTests(tasksData, MAX_TASKS_PER_RUN);

    console.log('');
    console.log('Summary:');
    console.log('  Tasks created: ' + result.created);
    console.log('  Duplicates skipped: ' + result.skipped);
    if (result.errors > 0) console.log('  Errors: ' + result.errors);
    console.log('=== END TRIAGE RESULTS ===');

    if (result.errors > 0) process.exit(1);
    break;
  }

  case 'triage-health': {
    console.log('=== TRIAGE RESULTS ===');
    console.log('Source: Health alerts');
    console.log('Input: ' + HEALTH_ALERT_FILE);
    console.log('');

    var tasksData = loadTasks();
    var result = triageHealth(tasksData, MAX_TASKS_PER_RUN);

    console.log('');
    console.log('Summary:');
    console.log('  Tasks created: ' + result.created);
    console.log('  Duplicates skipped: ' + result.skipped);
    if (result.errors > 0) console.log('  Errors: ' + result.errors);
    console.log('=== END TRIAGE RESULTS ===');

    if (result.errors > 0) process.exit(1);
    break;
  }

  case 'triage-all': {
    console.log('=== TRIAGE RESULTS ===');
    console.log('Source: Tests + Health (combined)');
    console.log('Task cap: ' + MAX_TASKS_PER_RUN + ' per run');
    console.log('');

    var tasksData = loadTasks();
    var totalCreated = 0;

    // --- Test triage ---
    console.log('--- Test Failures ---');
    var testResult = triageTests(tasksData, MAX_TASKS_PER_RUN);
    totalCreated += testResult.created;

    console.log('');

    // --- Health triage ---
    var healthCap = MAX_TASKS_PER_RUN - totalCreated;
    console.log('--- Health Alerts ---');
    if (healthCap <= 0) {
      console.log('  Skipped: task cap already reached from test triage');
      var healthResult = { created: 0, skipped: 0, errors: 0 };
    } else {
      // Reload tasks after test triage may have added new ones
      tasksData = loadTasks();
      var healthResult = triageHealth(tasksData, healthCap);
      totalCreated += healthResult.created;
    }

    console.log('');
    console.log('Combined Summary:');
    console.log('  Test tasks created: ' + testResult.created + ' | skipped: ' + testResult.skipped);
    console.log('  Health tasks created: ' + healthResult.created + ' | skipped: ' + healthResult.skipped);
    console.log('  Total tasks created: ' + totalCreated + '/' + MAX_TASKS_PER_RUN + ' cap');
    var totalErrors = testResult.errors + healthResult.errors;
    if (totalErrors > 0) console.log('  Total errors: ' + totalErrors);
    console.log('=== END TRIAGE RESULTS ===');

    if (totalErrors > 0) process.exit(1);
    break;
  }
}
