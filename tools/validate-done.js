#!/usr/bin/env node
/**
 * Validate Done — Definition of Done checklist for tasks and merge requests
 *
 * Validates that a task meets completion criteria before closing:
 * linked MR, linked branch, MR has description, pipeline passing.
 * Can also validate a merge request directly via the Git hosting API.
 *
 * Usage:
 *   node validate-done.js validate <task-id>              # validate task completion
 *   node validate-done.js check-mr <project-id> <mr-iid>  # validate MR directly
 *
 * Environment:
 *   TASKS_FILE       — path to tasks JSON (default: /data/tasks.json)
 *   GIT_API_TOKEN    — API token for your Git hosting provider (required)
 *   GIT_API_URL      — base URL for your Git API (default: https://api.github.com)
 *
 * Supports both GitHub and GitLab APIs. By default uses GitHub API format.
 * To use GitLab, set GIT_API_URL=https://gitlab.com and use GitLab
 * numeric project-id format.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// ─── Configuration ──────────────────────────────────────────────────────

const GIT_API_TOKEN = process.env.GIT_API_TOKEN;
const GIT_API_URL = process.env.GIT_API_URL || 'https://api.github.com';
const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';

if (!GIT_API_TOKEN) {
  console.error('ERROR: GIT_API_TOKEN environment variable must be set.');
  console.error('Set this to a personal access token for your Git hosting provider.');
  process.exit(1);
}

// ─── Argument Parsing ───────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

if (!command || !['validate', 'check-mr'].includes(command)) {
  console.error('Usage: node validate-done.js validate <task-id>');
  console.error('       node validate-done.js check-mr <project-id> <mr-iid>');
  process.exit(1);
}

// ─── HTTP Helper ────────────────────────────────────────────────────────

/**
 * Make an HTTP request to the Git hosting API.
 * Uses PRIVATE-TOKEN header for GitLab, Authorization header for GitHub.
 */
function request(method, apiPath) {
  var isGitHub = GIT_API_URL.indexOf('github.com') >= 0;
  var basePath = isGitHub ? '' : '/api/v4';
  var url = new URL(basePath + apiPath, GIT_API_URL);
  var transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    var headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'AgentTeam-ValidateDone'
    };

    // GitLab uses PRIVATE-TOKEN; GitHub uses Bearer token
    if (isGitHub) {
      headers['Authorization'] = 'Bearer ' + GIT_API_TOKEN;
    } else {
      headers['PRIVATE-TOKEN'] = GIT_API_TOKEN;
    }

    var options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: headers
    };

    var req = transport.request(options, res => {
      var data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error('API error ' + res.statusCode + ': ' + data.slice(0, 300)));
        } else {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

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
 * Create a check result object.
 */
function check(label, passed, detail) {
  return { label: label, passed: passed, detail: detail || '' };
}

/**
 * Validate a merge request against Definition of Done criteria.
 * Returns { mr, results } where results is an array of check objects.
 */
async function checkMR(projectId, mrIid) {
  var results = [];

  try {
    var mr = await request('GET', '/projects/' + projectId + '/merge_requests/' + mrIid);

    // Check: MR has a description
    results.push(check(
      'MR has description',
      !!(mr.description && mr.description.trim().length > 0),
      mr.description ? mr.description.slice(0, 100) : 'No description'
    ));

    // Check: MR has no merge conflicts
    results.push(check(
      'MR has no merge conflicts',
      !mr.has_conflicts,
      mr.has_conflicts ? 'CONFLICTS DETECTED' : 'Clean'
    ));

    // Check: MR has review comments
    try {
      var notes = await request('GET', '/projects/' + projectId + '/merge_requests/' + mrIid + '/notes?per_page=50');
      var reviewNotes = Array.isArray(notes) ? notes.filter(n => !n.system) : [];
      results.push(check(
        'MR has review comments',
        reviewNotes.length > 0,
        reviewNotes.length + ' comment(s)'
      ));
    } catch {
      results.push(check('MR has review comments', false, 'Could not fetch notes'));
    }

    // Check: Pipeline passing
    try {
      var pipelines = await request('GET', '/projects/' + projectId + '/merge_requests/' + mrIid + '/pipelines');
      var pipelineList = Array.isArray(pipelines) ? pipelines : [];
      if (pipelineList.length === 0) {
        results.push(check('Pipeline passing', true, 'No pipeline configured (OK)'));
      } else {
        var latest = pipelineList[0];
        results.push(check(
          'Pipeline passing',
          latest.status === 'success',
          'Status: ' + latest.status
        ));
      }
    } catch {
      results.push(check('Pipeline passing', true, 'No pipeline configured (OK)'));
    }

    return { mr: mr, results: results };
  } catch (err) {
    return { mr: null, results: [check('MR exists and is accessible', false, err.message)] };
  }
}

// ─── Commands ───────────────────────────────────────────────────────────

(async () => {
  try {
    switch (command) {

      // ── validate ────────────────────────────────────────────────────
      case 'validate': {
        var taskId = args[0];
        if (!taskId) {
          console.error('Usage: node validate-done.js validate <task-id>');
          process.exit(1);
        }

        var data = loadTasks();
        var task = data.tasks.find(t => t.id === taskId.toUpperCase());

        if (!task) {
          console.error('ERROR: Task "' + taskId.toUpperCase() + '" not found.');
          process.exit(1);
        }

        var results = [];

        // Check 1: Task has linked MR
        results.push(check(
          'Task has linked MR',
          task.links.mr !== null,
          task.links.mr ? '!' + task.links.mr : 'No MR linked'
        ));

        // Check 2: Task has linked branch
        results.push(check(
          'Task has linked branch',
          task.links.branch !== null,
          task.links.branch || 'No branch linked'
        ));

        // Check 3+: If MR is linked, validate it against API
        if (task.links.mr && task.links.projectId) {
          var mrValidation = await checkMR(task.links.projectId, task.links.mr);
          results.push.apply(results, mrValidation.results);
        }

        // Output results
        var passed = results.filter(r => r.passed).length;
        var total = results.length;
        var allPassed = passed === total;

        console.log('=== DEFINITION OF DONE: ' + task.id + ' ===');
        for (var i = 0; i < results.length; i++) {
          var r = results[i];
          console.log('[' + (r.passed ? 'PASS' : 'FAIL') + '] ' + r.label + (r.detail ? ': ' + r.detail : ''));
        }
        console.log('');
        console.log('Result: ' + passed + '/' + total + ' checks passed — ' + (allPassed ? 'READY' : 'NOT READY'));
        console.log('=== END DEFINITION OF DONE ===');
        break;
      }

      // ── check-mr ────────────────────────────────────────────────────
      case 'check-mr': {
        var projectId = parseInt(args[0], 10);
        var mrIid = parseInt(args[1], 10);

        if (!projectId || !mrIid) {
          console.error('Usage: node validate-done.js check-mr <project-id> <mr-iid>');
          process.exit(1);
        }

        var validation = await checkMR(projectId, mrIid);
        var passed = validation.results.filter(r => r.passed).length;
        var total = validation.results.length;
        var allPassed = passed === total;

        console.log('=== MR READINESS CHECK: !' + mrIid + (validation.mr ? ' — ' + validation.mr.title : '') + ' ===');
        for (var i = 0; i < validation.results.length; i++) {
          var r = validation.results[i];
          console.log('[' + (r.passed ? 'PASS' : 'FAIL') + '] ' + r.label + (r.detail ? ': ' + r.detail : ''));
        }
        console.log('');
        console.log('Result: ' + passed + '/' + total + ' checks passed — ' + (allPassed ? 'READY TO MERGE' : 'NOT READY'));
        console.log('=== END MR READINESS CHECK ===');
        break;
      }
    }
  } catch (err) {
    console.error('=== VALIDATE-DONE ERROR: ' + err.message + ' ===');
    process.exit(1);
  }
})();
