#!/usr/bin/env node
// Git Issue Intake — polls git provider for open issues and creates tasks
// Supports label-based routing and priority, deduplication, and rate limiting
//
// Usage:
//   node git-intake.js intake-all            # poll all configured projects
//   node git-intake.js intake <project-id>   # poll a single project
//   node git-intake.js status                # show last run stats
//
// No npm dependencies required. Uses only Node.js built-in modules.
//
// CUSTOMIZATION:
//   1. Update the PROJECTS array below with your project IDs and names.
//   2. Set GIT_API_URL and GIT_API_TOKEN environment variables.
//   3. Set GIT_PROVIDER to "github", "gitlab", or "bitbucket".
//   4. Adjust label-to-agent routing in classifyIssue().
//   5. Ensure task-registry.js is available at TASK_REGISTRY path.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Configuration ---
// Adjust these paths to match your deployment layout
const TASKS_FILE = '/data/tasks.json';
const TASK_REGISTRY = path.join(__dirname, 'task-registry.js');
const GIT_INTEGRATION = path.join(__dirname, 'git-integration.js');
const INTAKE_STATE_FILE = '/data/releases/git-intake-state.json';
const MAX_TASKS_PER_RUN = 10;

// TODO: Configure your projects here
// For GitHub: use "owner/repo" format
// For GitLab: use numeric project ID
// For Bitbucket: use "workspace/repo" format
const PROJECTS = [
  { id: process.env.PROJECT_1_ID || 'myorg/myapp', name: process.env.PROJECT_1_NAME || 'My App' },
  // Add more projects as needed:
  // { id: process.env.PROJECT_2_ID || 'myorg/mylib', name: process.env.PROJECT_2_NAME || 'My Library' },
];

// --- Parse arguments ---
const [,, command, ...cliArgs] = process.argv;

const VALID_COMMANDS = ['intake-all', 'intake', 'status'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node git-intake.js intake-all|intake|status');
  console.error('');
  console.error('Commands:');
  console.error('  intake-all          Poll all configured projects for open issues');
  console.error('  intake <project-id> Poll a single project by ID');
  console.error('  status              Show last intake run stats');
  process.exit(1);
}

// --- Helpers ---

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
 * Check if a task with the given sourceRef already exists (open or in-progress).
 */
function isDuplicate(tasksData, sourceRef) {
  return tasksData.tasks.some(function(t) {
    return t.sourceRef === sourceRef && (t.status === 'open' || t.status === 'in-progress');
  });
}

/**
 * Classify an issue by its labels to determine assignee, priority, and tags.
 *
 * TODO: Customize the label patterns and agent names for your team.
 * Current routing:
 *   - infra/deploy/devops/ci/cd/docker/server labels -> devops-agent
 *   - Everything else -> engineer-agent
 * Priority:
 *   - critical/urgent labels -> critical
 *   - bug/hotfix labels -> high
 *   - Everything else -> medium
 */
function classifyIssue(labels) {
  var lowerLabels = (labels || []).map(function(l) { return l.toLowerCase(); });

  // Determine assignee based on labels
  var assignee = 'engineer-agent';  // TODO: Replace with your default agent name
  var infraPatterns = ['infra', 'deploy', 'devops', 'ci', 'cd', 'docker', 'server', 'ops'];
  for (var i = 0; i < infraPatterns.length; i++) {
    for (var j = 0; j < lowerLabels.length; j++) {
      if (lowerLabels[j].indexOf(infraPatterns[i]) >= 0) {
        assignee = 'devops-agent';  // TODO: Replace with your devops agent name
        break;
      }
    }
    if (assignee === 'devops-agent') break;
  }

  // Determine priority based on labels
  var priority = 'medium';
  for (var k = 0; k < lowerLabels.length; k++) {
    if (lowerLabels[k] === 'critical' || lowerLabels[k] === 'urgent') {
      priority = 'critical';
      break;
    }
    if (lowerLabels[k] === 'bug' || lowerLabels[k] === 'hotfix') {
      priority = 'high';
    }
  }

  // Build tags (include source + first few labels)
  var tags = ['git-issue'];
  for (var m = 0; m < lowerLabels.length; m++) {
    if (tags.length < 5) {
      tags.push(lowerLabels[m]);
    }
  }

  return { assignee: assignee, priority: priority, tags: tags.join(',') };
}

/**
 * Fetch open issues from a project using git-integration.js.
 * Parses the JSON output from the tool's structured output format.
 */
function fetchIssues(projectId) {
  try {
    var output = execSync('node ' + GIT_INTEGRATION + ' list-issues ' + projectId + ' open', {
      encoding: 'utf8',
      timeout: 30000,
      env: process.env
    });

    // Extract JSON from between === markers
    var startMarker = '=== GIT';
    var endMarker = '=== END GIT';
    var startIdx = output.indexOf(startMarker);
    var endIdx = output.indexOf(endMarker);

    if (startIdx < 0 || endIdx < 0) {
      console.error('  WARNING: Could not parse git-integration output for project ' + projectId);
      return [];
    }

    // Find the JSON array between the markers
    var section = output.slice(startIdx, endIdx);
    var jsonStart = section.indexOf('[');
    if (jsonStart < 0) {
      jsonStart = section.indexOf('{');
    }
    if (jsonStart < 0) return [];

    var jsonStr = section.slice(jsonStart);
    return JSON.parse(jsonStr);
  } catch (err) {
    var errMsg = err.stderr || err.stdout || err.message;
    console.error('  ERROR: Failed to fetch issues for project ' + projectId + ': ' + (errMsg || '').slice(0, 200));
    return [];
  }
}

/**
 * Create a task using task-registry.js.
 */
function createTask(title, description, assignee, priority, source, sourceRef, tags) {
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
 * Save intake state for tracking runs over time.
 */
function saveState(state) {
  try {
    var dir = path.dirname(INTAKE_STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(INTAKE_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('WARNING: Could not save intake state: ' + err.message);
  }
}

function loadState() {
  try {
    if (fs.existsSync(INTAKE_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(INTAKE_STATE_FILE, 'utf8'));
    }
  } catch (err) {
    // ignore
  }
  return { lastRun: null, totalCreated: 0, totalSkipped: 0, runs: [] };
}

// --- Intake for a single project ---

/**
 * Poll a single project for open issues and create tasks for new ones.
 * Deduplicates by sourceRef ("git:issue:<project>:<number>").
 * Caps at remainingCap tasks per run.
 */
function intakeProject(projectId, projectName, tasksData, remainingCap) {
  var created = 0;
  var skipped = 0;
  var errors = 0;

  console.log('  Fetching open issues from ' + projectName + ' (' + projectId + ')...');

  var issues = fetchIssues(projectId);

  if (!issues || issues.length === 0) {
    console.log('  No open issues found in ' + projectName + '.');
    return { created: 0, skipped: 0, errors: 0 };
  }

  console.log('  Found ' + issues.length + ' open issue(s) to check');
  console.log('');

  for (var i = 0; i < issues.length; i++) {
    if (created >= remainingCap) {
      console.log('  CAP REACHED: Skipping remaining issues (max ' + MAX_TASKS_PER_RUN + ' tasks per run)');
      break;
    }

    var issue = issues[i];
    // Unique sourceRef for deduplication
    var issueId = issue.iid || issue.id || issue.number;
    var sourceRef = 'git:issue:' + projectId + ':' + issueId;

    // Check deduplication
    if (isDuplicate(tasksData, sourceRef)) {
      console.log('  [SKIP] #' + issueId + ' ' + (issue.title || '').slice(0, 60) + ' -- already tracked');
      skipped++;
      continue;
    }

    var classification = classifyIssue(issue.labels);
    var title = '[' + projectName + '] #' + issueId + ': ' + (issue.title || 'Untitled issue');
    var description = 'Issue #' + issueId + ' from ' + projectName + '. ' +
      (issue.description || 'No description.').slice(0, 400) +
      (issue.url ? ' URL: ' + issue.url : '');

    var result = createTask(
      title,
      description,
      classification.assignee,
      classification.priority,
      'git-issue',
      sourceRef,
      classification.tags
    );

    if (result.success) {
      var idMatch = result.output.match(/ID:\s*(TASK-\d+)/);
      var taskId = idMatch ? idMatch[1] : '?';
      console.log('  [CREATE] ' + taskId + ' -- #' + issueId + ' ' +
        (issue.title || '').slice(0, 50) + ' -> ' + classification.assignee +
        ' [' + classification.priority + ']');
      created++;
      // Reload tasks to catch newly created ones for dedup
      tasksData = loadTasks();
    } else {
      if (result.output.indexOf('DUPLICATE') >= 0) {
        console.log('  [SKIP] #' + issueId + ' -- duplicate (caught by task-registry)');
        skipped++;
      } else {
        console.error('  [ERROR] #' + issueId + ' -- ' + result.output.slice(0, 200));
        errors++;
      }
    }
  }

  return { created: created, skipped: skipped, errors: errors };
}

// --- Main ---

switch (command) {

  case 'intake': {
    var projectId = cliArgs[0];
    if (!projectId) {
      console.error('Usage: node git-intake.js intake <project-id>');
      process.exit(1);
    }

    // Find project name from config
    var projectName = 'Project ' + projectId;
    for (var p = 0; p < PROJECTS.length; p++) {
      if (PROJECTS[p].id === projectId) {
        projectName = PROJECTS[p].name;
        break;
      }
    }

    console.log('=== GIT ISSUE INTAKE ===');
    console.log('Project: ' + projectName + ' (' + projectId + ')');
    console.log('Task cap: ' + MAX_TASKS_PER_RUN + ' per run');
    console.log('');

    var tasksData = loadTasks();
    var result = intakeProject(projectId, projectName, tasksData, MAX_TASKS_PER_RUN);

    console.log('');
    console.log('Summary:');
    console.log('  Tasks created: ' + result.created);
    console.log('  Duplicates skipped: ' + result.skipped);
    if (result.errors > 0) console.log('  Errors: ' + result.errors);
    console.log('=== END GIT ISSUE INTAKE ===');

    // Save state
    var state = loadState();
    state.lastRun = new Date().toISOString();
    state.totalCreated += result.created;
    state.totalSkipped += result.skipped;
    state.runs.push({
      timestamp: state.lastRun,
      projects: [projectId],
      created: result.created,
      skipped: result.skipped,
      errors: result.errors
    });
    if (state.runs.length > 50) state.runs = state.runs.slice(-50);
    saveState(state);

    if (result.errors > 0) process.exit(1);
    break;
  }

  case 'intake-all': {
    console.log('=== GIT ISSUE INTAKE ===');
    console.log('Source: All projects (' + PROJECTS.map(function(p) { return p.name; }).join(', ') + ')');
    console.log('Task cap: ' + MAX_TASKS_PER_RUN + ' per run');
    console.log('');

    var tasksData = loadTasks();
    var totalCreated = 0;
    var totalSkipped = 0;
    var totalErrors = 0;
    var projectResults = [];

    for (var i = 0; i < PROJECTS.length; i++) {
      var proj = PROJECTS[i];
      console.log('--- ' + proj.name + ' (' + proj.id + ') ---');

      var remaining = MAX_TASKS_PER_RUN - totalCreated;
      if (remaining <= 0) {
        console.log('  Skipped: task cap already reached');
        projectResults.push({ name: proj.name, created: 0, skipped: 0, errors: 0 });
        continue;
      }

      var result = intakeProject(proj.id, proj.name, tasksData, remaining);
      totalCreated += result.created;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      projectResults.push({
        name: proj.name,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors
      });

      // Reload tasks after each project
      if (result.created > 0) {
        tasksData = loadTasks();
      }

      console.log('');
    }

    console.log('Combined Summary:');
    for (var j = 0; j < projectResults.length; j++) {
      var pr = projectResults[j];
      console.log('  ' + pr.name + ': created ' + pr.created +
        ' | skipped ' + pr.skipped +
        (pr.errors > 0 ? ' | errors ' + pr.errors : ''));
    }
    console.log('  Total tasks created: ' + totalCreated + '/' + MAX_TASKS_PER_RUN + ' cap');
    console.log('=== END GIT ISSUE INTAKE ===');

    // Save state
    var state = loadState();
    state.lastRun = new Date().toISOString();
    state.totalCreated += totalCreated;
    state.totalSkipped += totalSkipped;
    state.runs.push({
      timestamp: state.lastRun,
      projects: PROJECTS.map(function(p) { return p.id; }),
      created: totalCreated,
      skipped: totalSkipped,
      errors: totalErrors
    });
    if (state.runs.length > 50) state.runs = state.runs.slice(-50);
    saveState(state);

    if (totalErrors > 0) process.exit(1);
    break;
  }

  case 'status': {
    var state = loadState();
    console.log('=== GIT INTAKE STATUS ===');
    console.log('Last run: ' + (state.lastRun || 'never'));
    console.log('Total created (all time): ' + (state.totalCreated || 0));
    console.log('Total skipped (all time): ' + (state.totalSkipped || 0));

    if (state.runs && state.runs.length > 0) {
      console.log('');
      console.log('Recent runs (last 5):');
      var recent = state.runs.slice(-5);
      for (var r = 0; r < recent.length; r++) {
        var run = recent[r];
        console.log('  ' + run.timestamp + ' -- created: ' + run.created +
          ', skipped: ' + run.skipped +
          (run.errors > 0 ? ', errors: ' + run.errors : ''));
      }
    }

    console.log('');
    console.log('Configured projects:');
    for (var p = 0; p < PROJECTS.length; p++) {
      console.log('  ' + PROJECTS[p].name + ' (' + PROJECTS[p].id + ')');
    }
    console.log('=== END GIT INTAKE STATUS ===');
    break;
  }
}
