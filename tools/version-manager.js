#!/usr/bin/env node
/**
 * Version Manager — release gating with semver tracking
 *
 * Tracks software versions, validates release readiness against a set
 * of quality gates (tests passing, no critical tasks, health OK), and
 * generates changelogs from completed tasks.
 *
 * Data file: /data/releases/versions.json
 * Structure: { current: "1.0.0", releases: [{ version, type, taggedAt, tasksCompleted[], changelog }] }
 *
 * Usage:
 *   node version-manager.js status                        # current version + tasks since last release
 *   node version-manager.js check-ready                   # validates release criteria
 *   node version-manager.js release <patch|minor|major>   # tag a new version
 *   node version-manager.js changelog                     # generate changelog from completed tasks
 *   node version-manager.js history                       # list past releases
 *
 * Environment:
 *   TASKS_FILE           — path to tasks JSON (default: /data/tasks.json)
 *   VERSIONS_FILE        — path to versions JSON (default: /data/releases/versions.json)
 *   TEST_RESULTS_FILE    — path to test results (default: /data/releases/last-test-results.json)
 *   HEALTH_FILE          — path to health status (default: /data/releases/last-health.json)
 *   AGENT_ID             — current agent identifier for audit trail
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────

const RELEASES_DIR = process.env.RELEASES_DIR || '/data/releases';
const VERSIONS_FILE = process.env.VERSIONS_FILE || path.join(RELEASES_DIR, 'versions.json');
const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';
const TEST_RESULTS_FILE = process.env.TEST_RESULTS_FILE || path.join(RELEASES_DIR, 'last-test-results.json');
const HEALTH_FILE = process.env.HEALTH_FILE || path.join(RELEASES_DIR, 'last-health.json');

const VALID_COMMANDS = ['status', 'check-ready', 'release', 'changelog', 'history'];

// ─── Argument Parsing ───────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

if (!command) {
  console.error('Usage: node version-manager.js <command> [args]');
  console.error('Commands: ' + VALID_COMMANDS.join(', '));
  process.exit(1);
}

if (!VALID_COMMANDS.includes(command)) {
  console.error('ERROR: Unknown command "' + command + '". Valid: ' + VALID_COMMANDS.join(', '));
  process.exit(1);
}

// ─── File I/O ───────────────────────────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(RELEASES_DIR)) {
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
  }
}

/**
 * Load version tracking data. Creates initial file if missing.
 */
function loadVersions() {
  ensureDir();
  try {
    if (!fs.existsSync(VERSIONS_FILE)) {
      var initial = { current: '1.0.0', releases: [] };
      fs.writeFileSync(VERSIONS_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'));
  } catch (err) {
    console.error('ERROR: Failed to load versions: ' + err.message);
    process.exit(1);
  }
}

/**
 * Atomically save version data.
 */
function saveVersions(data) {
  ensureDir();
  try {
    var tmp = VERSIONS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, VERSIONS_FILE);
  } catch (err) {
    console.error('ERROR: Failed to save versions: ' + err.message);
    process.exit(1);
  }
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

// ─── Semver Helpers ─────────────────────────────────────────────────────

/**
 * Bump a semver version string by type.
 */
function bumpVersion(version, type) {
  var parts = version.split('.').map(function(p) { return parseInt(p, 10); });
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error('ERROR: Invalid version format "' + version + '". Expected X.Y.Z');
    process.exit(1);
  }

  switch (type) {
    case 'major':
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case 'minor':
      parts[1]++;
      parts[2] = 0;
      break;
    case 'patch':
      parts[2]++;
      break;
    default:
      console.error('ERROR: Invalid release type "' + type + '". Valid: patch, minor, major');
      process.exit(1);
  }

  return parts.join('.');
}

// ─── Task Helpers ───────────────────────────────────────────────────────

/**
 * Get the timestamp of the most recent release, or null if none.
 */
function getLastReleaseDate(versionData) {
  if (versionData.releases.length === 0) return null;
  return versionData.releases[versionData.releases.length - 1].taggedAt;
}

/**
 * Return all tasks completed (status: done) since the last release.
 * If no releases exist, returns all done tasks.
 */
function getCompletedTasksSinceRelease(tasksData, lastReleaseDate) {
  var completed = [];

  for (var i = 0; i < tasksData.tasks.length; i++) {
    var task = tasksData.tasks[i];
    if (task.status !== 'done') continue;

    if (!lastReleaseDate) {
      // No previous release — all done tasks count
      completed.push(task);
      continue;
    }

    // Check history for a "done" entry after the last release date
    var history = task.history || [];
    for (var j = 0; j < history.length; j++) {
      var entry = history[j];
      if (entry.status === 'done' && entry.at > lastReleaseDate) {
        completed.push(task);
        break;
      }
    }
  }

  return completed;
}

// ─── Release Readiness Checks ───────────────────────────────────────────

/**
 * Check if test results file shows all tests passing.
 * Supports two formats:
 *   1. { totalTests, passed, failed, failures: [] } — simple summary
 *   2. { suites: [...] } — nested suite format
 */
function checkTestResults() {
  if (!fs.existsSync(TEST_RESULTS_FILE)) {
    return { passed: false, detail: 'No test results file found at ' + TEST_RESULTS_FILE };
  }

  try {
    var results = JSON.parse(fs.readFileSync(TEST_RESULTS_FILE, 'utf8'));

    // Simple format: { failed: N, failures: [] }
    if (typeof results.failed === 'number') {
      if (results.failed > 0) {
        return { passed: false, detail: results.failed + '/' + results.totalTests + ' tests failed' };
      }
      return { passed: true, detail: (results.totalTests || results.passed || 0) + ' tests all passing' };
    }

    // Nested suite format: { suites: [...] }
    if (results.suites) {
      var failures = 0;
      var total = 0;

      function walkSuites(suites) {
        for (var i = 0; i < suites.length; i++) {
          var suite = suites[i];
          var specs = suite.specs || [];
          for (var j = 0; j < specs.length; j++) {
            var tests = specs[j].tests || [];
            for (var k = 0; k < tests.length; k++) {
              total++;
              var status = tests[k].status || tests[k].expectedStatus;
              if (status === 'failed' || status === 'unexpected') failures++;
            }
          }
          if (suite.suites) walkSuites(suite.suites);
        }
      }

      walkSuites(results.suites);

      if (failures > 0) {
        return { passed: false, detail: failures + '/' + total + ' tests failed' };
      }
      return { passed: true, detail: total + ' tests all passing' };
    }

    return { passed: false, detail: 'Unrecognized test results format' };
  } catch (err) {
    return { passed: false, detail: 'Failed to read test results: ' + err.message };
  }
}

/**
 * Check that no open tasks have critical or high priority.
 */
function checkNoCriticalTasks(tasksData) {
  var blocking = [];

  for (var i = 0; i < tasksData.tasks.length; i++) {
    var task = tasksData.tasks[i];
    if (task.status === 'done') continue;
    var priority = (task.priority || '').toLowerCase();
    if (priority === 'critical' || priority === 'high') {
      blocking.push(task.id + ' [' + priority + '] ' + task.title);
    }
  }

  if (blocking.length > 0) {
    return { passed: false, detail: blocking.length + ' open critical/high tasks: ' + blocking.join(', ') };
  }
  return { passed: true, detail: 'No open critical/high tasks' };
}

/**
 * Check the health status file reports a healthy system.
 */
function checkHealthStatus() {
  if (!fs.existsSync(HEALTH_FILE)) {
    return { passed: true, detail: 'No health file found (skipping check)' };
  }

  try {
    var health = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
    var status = (health.status || '').toLowerCase();
    if (status === 'healthy' || status === 'ok') {
      return { passed: true, detail: 'Health status: ' + health.status };
    }
    return { passed: false, detail: 'Health status: ' + (health.status || 'unknown') };
  } catch (err) {
    return { passed: false, detail: 'Failed to read health file: ' + err.message };
  }
}

// ─── Commands ───────────────────────────────────────────────────────────

var versionData = loadVersions();

switch (command) {

  // ── status ────────────────────────────────────────────────────────
  case 'status': {
    var tasksData = loadTasks();
    var lastReleaseDate = getLastReleaseDate(versionData);
    var completedTasks = getCompletedTasksSinceRelease(tasksData, lastReleaseDate);

    console.log('=== VERSION STATUS ===');
    console.log('Current version: ' + versionData.current);
    console.log('Total releases: ' + versionData.releases.length);

    if (lastReleaseDate) {
      var lastRelease = versionData.releases[versionData.releases.length - 1];
      console.log('Last release: ' + lastRelease.version + ' (' + lastReleaseDate + ')');
    } else {
      console.log('Last release: none');
    }

    console.log('');
    console.log('Tasks completed since last release: ' + completedTasks.length);
    for (var i = 0; i < completedTasks.length; i++) {
      console.log('  ' + completedTasks[i].id + ': ' + completedTasks[i].title);
    }
    console.log('=== END VERSION STATUS ===');
    break;
  }

  // ── check-ready ───────────────────────────────────────────────────
  case 'check-ready': {
    var tasksData = loadTasks();
    var lastReleaseDate = getLastReleaseDate(versionData);
    var completedTasks = getCompletedTasksSinceRelease(tasksData, lastReleaseDate);

    var checks = [];

    // Check 1: Tests passing
    var testCheck = checkTestResults();
    checks.push({ label: 'All tests passing', passed: testCheck.passed, detail: testCheck.detail });

    // Check 2: No critical/high open tasks
    var taskCheck = checkNoCriticalTasks(tasksData);
    checks.push({ label: 'No open critical/high tasks', passed: taskCheck.passed, detail: taskCheck.detail });

    // Check 3: At least 1 completed task since last release
    var hasWork = completedTasks.length > 0;
    checks.push({ label: 'At least 1 completed task', passed: hasWork, detail: completedTasks.length + ' task(s) completed since last release' });

    // Check 4: Health check
    var healthCheck = checkHealthStatus();
    checks.push({ label: 'Health check passing', passed: healthCheck.passed, detail: healthCheck.detail });

    var passed = checks.filter(function(c) { return c.passed; }).length;
    var total = checks.length;
    var allPassed = passed === total;

    console.log('=== RELEASE READINESS CHECK ===');
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      console.log('[' + (c.passed ? 'PASS' : 'FAIL') + '] ' + c.label + ': ' + c.detail);
    }
    console.log('');
    console.log('Result: ' + passed + '/' + total + ' checks passed — ' + (allPassed ? 'READY' : 'NOT READY'));
    console.log('=== END RELEASE READINESS CHECK ===');
    break;
  }

  // ── release ───────────────────────────────────────────────────────
  case 'release': {
    var releaseType = args[0];
    if (!releaseType || !['patch', 'minor', 'major'].includes(releaseType)) {
      console.error('Usage: node version-manager.js release <patch|minor|major>');
      process.exit(1);
    }

    // Run readiness checks before allowing release
    var tasksData = loadTasks();
    var lastReleaseDate = getLastReleaseDate(versionData);
    var completedTasks = getCompletedTasksSinceRelease(tasksData, lastReleaseDate);

    var testCheck = checkTestResults();
    var taskCheck = checkNoCriticalTasks(tasksData);
    var hasWork = completedTasks.length > 0;
    var healthCheck = checkHealthStatus();

    var blockers = [];
    if (!testCheck.passed) blockers.push('Tests: ' + testCheck.detail);
    if (!taskCheck.passed) blockers.push('Tasks: ' + taskCheck.detail);
    if (!hasWork) blockers.push('No completed tasks since last release');
    if (!healthCheck.passed) blockers.push('Health: ' + healthCheck.detail);

    if (blockers.length > 0) {
      console.log('=== RELEASE BLOCKED ===');
      console.log('Cannot release — readiness checks failed:');
      for (var i = 0; i < blockers.length; i++) {
        console.log('  - ' + blockers[i]);
      }
      console.log('');
      console.log('Run "version-manager.js check-ready" for full details.');
      console.log('=== END ===');
      process.exit(1);
    }

    // Bump version
    var newVersion = bumpVersion(versionData.current, releaseType);
    var now = new Date().toISOString();
    var agentId = process.env.AGENT_ID || 'unknown';

    // Build task ID list and changelog
    var taskIds = [];
    var changelogLines = [];
    for (var i = 0; i < completedTasks.length; i++) {
      taskIds.push(completedTasks[i].id);
      changelogLines.push('- ' + completedTasks[i].id + ': ' + completedTasks[i].title);
    }
    var changelogText = changelogLines.join('\n');

    // Create release record
    var release = {
      version: newVersion,
      type: releaseType,
      taggedAt: now,
      taggedBy: agentId,
      tasksCompleted: taskIds,
      changelog: changelogText
    };

    versionData.current = newVersion;
    versionData.releases.push(release);
    saveVersions(versionData);

    console.log('=== RELEASE TAGGED ===');
    console.log('Version: ' + newVersion + ' (' + releaseType + ')');
    console.log('Tagged at: ' + now);
    console.log('Tagged by: ' + agentId);
    console.log('Tasks completed: ' + taskIds.length);
    for (var i = 0; i < taskIds.length; i++) {
      console.log('  ' + taskIds[i]);
    }
    console.log('');
    console.log('Changelog:');
    console.log(changelogText);
    console.log('=== END RELEASE ===');
    break;
  }

  // ── changelog ─────────────────────────────────────────────────────
  case 'changelog': {
    var tasksData = loadTasks();
    var lastReleaseDate = getLastReleaseDate(versionData);
    var completedTasks = getCompletedTasksSinceRelease(tasksData, lastReleaseDate);

    console.log('=== CHANGELOG (since ' + (lastReleaseDate || 'beginning') + ') ===');

    if (completedTasks.length === 0) {
      console.log('No completed tasks since last release.');
    } else {
      for (var i = 0; i < completedTasks.length; i++) {
        console.log('- ' + completedTasks[i].id + ': ' + completedTasks[i].title);
      }
    }

    console.log('=== END CHANGELOG ===');
    break;
  }

  // ── history ───────────────────────────────────────────────────────
  case 'history': {
    var releases = versionData.releases;

    console.log('=== RELEASE HISTORY ===');

    if (releases.length === 0) {
      console.log('No releases yet. Current version: ' + versionData.current);
    } else {
      for (var i = 0; i < releases.length; i++) {
        var r = releases[i];
        var taskCount = (r.tasksCompleted || []).length;
        console.log('v' + r.version + ' (' + r.type + ')  ' + r.taggedAt + '  ' + taskCount + ' task(s)  by ' + (r.taggedBy || 'unknown'));
      }
      console.log('');
      console.log('Current version: ' + versionData.current);
      console.log('Total releases: ' + releases.length);
    }

    console.log('=== END RELEASE HISTORY ===');
    break;
  }
}
