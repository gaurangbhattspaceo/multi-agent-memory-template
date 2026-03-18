#!/usr/bin/env node
// Proactive Orchestrator — scans processes, git provider, tasks, and knowledge vault for actionable work
// Lead agent runs this to find and act on issues before they're reported
//
// Usage:
//   node proactive-scan.js scan-all       # all 4 scans
//   node proactive-scan.js scan-errors    # PM2 error logs
//   node proactive-scan.js scan-git       # Git issues + stale MRs
//   node proactive-scan.js scan-tasks     # stuck/idle tasks
//   node proactive-scan.js scan-patterns  # check knowledge vault for applicable patterns

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { execSync } = require('child_process');

const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';
const PATTERNS_FILE = process.env.PATTERNS_FILE || '/data/knowledge/patterns.json';
const GIT_API_TOKEN = process.env.GIT_API_TOKEN;
const GIT_API_URL = process.env.GIT_API_URL || 'https://api.github.com';

// [CUSTOMIZE: Add your project IDs here]
// For GitHub: 'owner/repo' format. For GitLab: numeric project ID.
const PROJECT_1_ID = process.env.PROJECT_1_ID || '';
const PROJECT_2_ID = process.env.PROJECT_2_ID || '';
const PROJECT_1_NAME = process.env.PROJECT_1_NAME || 'Project 1';
const PROJECT_2_NAME = process.env.PROJECT_2_NAME || 'Project 2';

const STUCK_HOURS = 2;
const STALE_MR_HOURS = 24;
const UNASSIGNED_HOURS = 4;
const PM2_RESTART_THRESHOLD = 5;

// --- Parse arguments ---
const [,, command] = process.argv;

const VALID_COMMANDS = ['scan-all', 'scan-errors', 'scan-git', 'scan-tasks', 'scan-patterns'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node proactive-scan.js scan-all|scan-errors|scan-git|scan-tasks|scan-patterns');
  process.exit(1);
}

// --- Helpers ---
function loadTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) return { tasks: [], nextId: 1 };
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch {
    return { tasks: [], nextId: 1 };
  }
}

function loadPatterns() {
  try {
    if (!fs.existsSync(PATTERNS_FILE)) return { items: [], nextId: 1 };
    return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8'));
  } catch {
    return { items: [], nextId: 1 };
  }
}

function hoursSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60);
}

function getRetryCount(task) {
  return (task.history || []).filter(h => h.note && h.note.startsWith('RETRY:')).length;
}

function request(method, apiPath) {
  var isGitHub = GIT_API_URL.indexOf('github.com') >= 0;
  var basePath = isGitHub ? '' : '/api/v4';
  var url = new URL(basePath + apiPath, GIT_API_URL);
  var transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    var headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OpenClaw-ProactiveScan'
    };

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
      headers: headers,
      timeout: 10000
    };

    var req = transport.request(options, res => {
      var data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error('Git API error ' + res.statusCode));
        } else {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// --- Scan Functions ---
function scanPM2Errors() {
  const errors = [];

  try {
    const output = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
    const processes = JSON.parse(output);

    for (const proc of processes) {
      const status = proc.pm2_env.status;
      const restarts = proc.pm2_env.restart_time || 0;
      const name = proc.name;

      if (status !== 'online') {
        errors.push({
          severity: 'CRITICAL',
          source: 'pm2',
          process: name,
          message: name + ': status is ' + status,
          action: 'SPAWN devops-agent: restart ' + name
        });
      } else if (restarts > PM2_RESTART_THRESHOLD) {
        errors.push({
          severity: 'WARNING',
          source: 'pm2',
          process: name,
          message: name + ': ' + restarts + ' restarts (threshold: ' + PM2_RESTART_THRESHOLD + ')',
          action: 'SPAWN devops-agent: investigate ' + name + ' instability'
        });
      }
    }
  } catch (err) {
    errors.push({
      severity: 'WARNING',
      source: 'pm2',
      process: 'pm2',
      message: 'Could not read PM2 status: ' + err.message.slice(0, 100),
      action: 'Check if PM2 is running'
    });
  }

  return errors;
}

async function scanGit() {
  const items = [];

  if (!GIT_API_TOKEN) {
    items.push({ type: 'warning', message: 'GIT_API_TOKEN not set — skipping Git scan' });
    return items;
  }

  const projects = [];
  if (PROJECT_1_ID) projects.push({ id: PROJECT_1_ID, name: PROJECT_1_NAME });
  if (PROJECT_2_ID) projects.push({ id: PROJECT_2_ID, name: PROJECT_2_NAME });

  if (projects.length === 0) {
    items.push({ type: 'warning', message: 'No PROJECT_*_ID configured — skipping Git scan' });
    return items;
  }

  var isGitHub = GIT_API_URL.indexOf('github.com') >= 0;

  for (const project of projects) {
    try {
      // Check open issues (unassigned)
      var issuesPath = isGitHub
        ? '/repos/' + project.id + '/issues?state=open&per_page=20'
        : '/projects/' + project.id + '/issues?state=opened&per_page=20';

      const issues = await request('GET', issuesPath);

      if (Array.isArray(issues)) {
        for (const issue of issues) {
          // GitHub includes PRs in issues endpoint — skip those
          if (isGitHub && issue.pull_request) continue;

          const assignees = issue.assignees || [];
          const daysSinceCreated = hoursSince(issue.created_at) / 24;

          if (assignees.length === 0 && daysSinceCreated > 1) {
            items.push({
              type: 'issue',
              project: project.name,
              projectId: project.id,
              iid: isGitHub ? issue.number : issue.iid,
              title: issue.title,
              daysOpen: Math.round(daysSinceCreated * 10) / 10,
              action: 'CREATE TASK from issue #' + (isGitHub ? issue.number : issue.iid) + ', assign to appropriate agent'
            });
          }
        }
      }

      // Check stale MRs/PRs (opened, no activity in 24h)
      var mrsPath = isGitHub
        ? '/repos/' + project.id + '/pulls?state=open&per_page=20'
        : '/projects/' + project.id + '/merge_requests?state=opened&per_page=20';

      const mrs = await request('GET', mrsPath);

      if (Array.isArray(mrs)) {
        for (const mr of mrs) {
          const hoursSinceUpdate = hoursSince(mr.updated_at);

          if (hoursSinceUpdate > STALE_MR_HOURS) {
            var mrNum = isGitHub ? mr.number : mr.iid;
            items.push({
              type: 'stale-mr',
              project: project.name,
              projectId: project.id,
              mrIid: mrNum,
              title: mr.title,
              hoursStale: Math.round(hoursSinceUpdate),
              author: mr.author ? (mr.author.username || mr.author.login) : 'unknown',
              action: 'Review or close MR/PR #' + mrNum
            });
          }
        }

        // Check failing pipelines/checks on open MRs
        for (const mr of mrs) {
          if (!isGitHub && mr.head_pipeline && mr.head_pipeline.status === 'failed') {
            items.push({
              type: 'pipeline-fail',
              project: project.name,
              projectId: project.id,
              mrIid: mr.iid,
              title: mr.title,
              action: 'Notify author to fix pipeline on MR !' + mr.iid
            });
          }
        }
      }
    } catch (err) {
      items.push({
        type: 'error',
        project: project.name,
        message: 'Failed to scan: ' + err.message.slice(0, 100)
      });
    }
  }

  return items;
}

function scanTasks(tasks) {
  const issues = [];

  for (const task of tasks) {
    if (task.status === 'done') continue;

    const hours = hoursSince(task.updatedAt);
    const retries = getRetryCount(task);

    // Stuck in-progress
    if (task.status === 'in-progress' && hours >= STUCK_HOURS) {
      issues.push({
        type: 'stuck',
        task: task,
        hours: Math.round(hours * 10) / 10,
        retries: retries,
        action: retries >= 3
          ? 'ESCALATE: ' + task.id + ' has ' + retries + ' retries'
          : 'RETRY: Re-spawn ' + task.assignee + ' with context'
      });
    }

    // Unassigned too long
    if (task.assignee === 'unassigned' && hours >= UNASSIGNED_HOURS) {
      issues.push({
        type: 'unassigned',
        task: task,
        hours: Math.round(hours * 10) / 10,
        action: 'ASSIGN: ' + task.id + ' has been unassigned for ' + Math.round(hours) + 'h'
      });
    }
  }

  return issues;
}

function scanPatterns(tasks, patterns) {
  const suggestions = [];

  if (patterns.length === 0) return suggestions;

  // Find stuck tasks and try to match patterns
  const stuckTasks = tasks.filter(t =>
    t.status === 'in-progress' &&
    hoursSince(t.updatedAt) >= STUCK_HOURS
  );

  for (const task of stuckTasks) {
    const taskText = (task.title + ' ' + task.description + ' ' +
      (task.history || []).map(h => h.note || '').join(' ')).toLowerCase();

    for (const pattern of patterns) {
      if (pattern.successRate < 0.5) continue; // Only suggest patterns with decent success rate

      const patternText = (pattern.name + ' ' + pattern.category + ' ' +
        pattern.description).toLowerCase();

      // Simple keyword matching
      const keywords = patternText.split(/\s+/).filter(w => w.length > 3);
      const matches = keywords.filter(k => taskText.includes(k));

      if (matches.length >= 2) {
        suggestions.push({
          taskId: task.id,
          taskTitle: task.title,
          patternId: pattern.id,
          patternName: pattern.name,
          successRate: Math.round(pattern.successRate * 100),
          matchedKeywords: matches.slice(0, 5)
        });
      }
    }
  }

  return suggestions;
}

// --- Main ---
(async () => {
  try {
    const taskData = loadTasks();
    const patternData = loadPatterns();
    const recommendations = [];

    switch (command) {

      case 'scan-all': {
        const errors = scanPM2Errors();
        const gitItems = await scanGit();
        const taskIssues = scanTasks(taskData.tasks);
        const patternSuggestions = scanPatterns(taskData.tasks, patternData.items);

        console.log('=== PROACTIVE SCAN ===');
        console.log('');

        // PM2 Errors
        console.log('ERRORS FOUND: ' + errors.length);
        if (errors.length > 0) {
          for (const e of errors) {
            console.log('  [' + e.severity + '] ' + e.message);
            recommendations.push(e.action);
          }
        }
        console.log('');

        // Git Items
        const gitActionable = gitItems.filter(i => i.type !== 'error' && i.type !== 'warning');
        console.log('GIT ITEMS: ' + gitActionable.length);
        if (gitActionable.length > 0) {
          for (const g of gitActionable) {
            if (g.type === 'issue') {
              console.log('  [ISSUE] ' + g.project + ' #' + g.iid + ' "' + g.title +
                '" (open ' + g.daysOpen + ' days, unassigned)');
              recommendations.push(g.action);
            } else if (g.type === 'stale-mr') {
              console.log('  [STALE MR] ' + g.project + ' #' + g.mrIid + ' "' + g.title +
                '" (no activity ' + g.hoursStale + 'h)');
              recommendations.push(g.action);
            } else if (g.type === 'pipeline-fail') {
              console.log('  [PIPELINE] ' + g.project + ' #' + g.mrIid + ' "' + g.title + '" -- failed');
              recommendations.push(g.action);
            }
          }
        }
        console.log('');

        // Task Issues
        console.log('TASK ISSUES: ' + taskIssues.length);
        if (taskIssues.length > 0) {
          for (const t of taskIssues) {
            if (t.type === 'stuck') {
              console.log('  [STUCK] ' + t.task.id + ' "' + t.task.title +
                '" (' + t.task.assignee + ', ' + t.hours + 'h, ' + t.retries + ' retries)');
            } else if (t.type === 'unassigned') {
              console.log('  [UNASSIGNED] ' + t.task.id + ' "' + t.task.title +
                '" (open ' + t.hours + 'h)');
            }
            recommendations.push(t.action);
          }
        }
        console.log('');

        // Recommendations
        if (recommendations.length > 0) {
          console.log('RECOMMENDED ACTIONS:');
          for (let i = 0; i < recommendations.length; i++) {
            console.log('  ' + (i + 1) + '. ' + recommendations[i]);
          }
          console.log('');
        }

        // Pattern suggestions
        console.log('PATTERNS APPLIED: ' + patternSuggestions.length);
        if (patternSuggestions.length > 0) {
          for (const p of patternSuggestions) {
            console.log('  Pattern "' + p.patternName + '" (' + p.successRate +
              '% success) suggested for ' + p.taskId);
          }
        }
        console.log('');

        const totalFindings = errors.length + gitActionable.length + taskIssues.length;
        if (totalFindings === 0) {
          console.log('All clear -- no actionable items found.');
        }

        console.log('');
        console.log('Scanned: ' + new Date().toISOString());
        console.log('=== END PROACTIVE SCAN ===');
        break;
      }

      case 'scan-errors': {
        const errors = scanPM2Errors();

        console.log('=== PM2 ERROR SCAN: ' + errors.length + ' issues ===');
        if (errors.length === 0) {
          console.log('All PM2 processes healthy.');
        } else {
          for (const e of errors) {
            console.log('[' + e.severity + '] ' + e.message);
            console.log('  -> ' + e.action);
          }
        }
        console.log('=== END ===');
        break;
      }

      case 'scan-git': {
        const items = await scanGit();

        console.log('=== GIT SCAN: ' + items.length + ' items ===');
        if (items.length === 0) {
          console.log('No Git issues or stale MRs found.');
        } else {
          for (const g of items) {
            if (g.type === 'issue') {
              console.log('[ISSUE] ' + g.project + ' #' + g.iid + ' "' + g.title +
                '" (open ' + g.daysOpen + ' days)');
            } else if (g.type === 'stale-mr') {
              console.log('[STALE] ' + g.project + ' #' + g.mrIid + ' "' + g.title +
                '" (' + g.hoursStale + 'h stale)');
            } else if (g.type === 'pipeline-fail') {
              console.log('[FAIL] ' + g.project + ' #' + g.mrIid + ' "' + g.title + '"');
            } else if (g.type === 'error') {
              console.log('[ERROR] ' + g.project + ': ' + g.message);
            } else if (g.type === 'warning') {
              console.log('[WARN] ' + g.message);
            }
          }
        }
        console.log('=== END ===');
        break;
      }

      case 'scan-tasks': {
        const issues = scanTasks(taskData.tasks);

        console.log('=== TASK SCAN: ' + issues.length + ' issues ===');
        if (issues.length === 0) {
          console.log('No stuck or unassigned tasks.');
        } else {
          for (const t of issues) {
            console.log('[' + t.type.toUpperCase() + '] ' + t.task.id + ' "' + t.task.title +
              '" (' + t.hours + 'h)');
            console.log('  -> ' + t.action);
          }
        }
        console.log('=== END ===');
        break;
      }

      case 'scan-patterns': {
        const suggestions = scanPatterns(taskData.tasks, patternData.items);

        console.log('=== PATTERN SCAN: ' + suggestions.length + ' matches ===');
        if (suggestions.length === 0) {
          console.log('No pattern matches for current tasks.');
        } else {
          for (const p of suggestions) {
            console.log('[MATCH] ' + p.taskId + ' <-> ' + p.patternId + ' "' + p.patternName +
              '" (' + p.successRate + '% success)');
            console.log('  Keywords: ' + p.matchedKeywords.join(', '));
          }
        }
        console.log('=== END ===');
        break;
      }
    }
  } catch (err) {
    console.error('=== PROACTIVE SCAN ERROR: ' + err.message + ' ===');
    process.exit(1);
  }
})();
