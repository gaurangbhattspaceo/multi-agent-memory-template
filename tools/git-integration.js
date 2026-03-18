#!/usr/bin/env node
// Git Integration — generic git provider API wrapper
// Works with GitHub, GitLab, Bitbucket, or any git provider with a REST API
//
// Usage:
//   node git-integration.js create-mr <project-id> <source> <target> "<title>" "<desc>"
//   node git-integration.js list-mrs <project-id> [state]
//   node git-integration.js get-mr <project-id> <mr-iid>
//   node git-integration.js merge-mr <project-id> <mr-iid>
//   node git-integration.js comment-mr <project-id> <mr-iid> "<comment>"
//   node git-integration.js list-issues <project-id> [state]
//
// No npm dependencies required. Uses only Node.js built-in modules.
//
// CUSTOMIZATION:
//   Set the following environment variables:
//     GIT_API_URL   — Your git provider's API base URL
//     GIT_API_TOKEN — Your authentication token
//     GIT_PROVIDER  — "github", "gitlab", or "bitbucket" (default: "github")
//
//   Each command has TODO sections showing where to adjust API paths
//   and response parsing for your provider.

const http = require('http');
const https = require('https');
const { URL } = require('url');

// --- Configuration ---
const GIT_API_TOKEN = process.env.GIT_API_TOKEN;
const GIT_API_URL = process.env.GIT_API_URL || 'https://api.github.com';
const GIT_PROVIDER = (process.env.GIT_PROVIDER || 'github').toLowerCase();

if (!GIT_API_TOKEN) {
  console.error('ERROR: GIT_API_TOKEN environment variable must be set.');
  console.error('');
  console.error('Examples:');
  console.error('  GitHub:    export GIT_API_TOKEN="ghp_..."');
  console.error('  GitLab:    export GIT_API_TOKEN="glpat-..."');
  console.error('  Bitbucket: export GIT_API_TOKEN="..."');
  process.exit(1);
}

// --- Parse arguments ---
const [,, command, ...args] = process.argv;

const VALID_COMMANDS = [
  'create-mr', 'list-mrs', 'get-mr', 'merge-mr', 'comment-mr', 'list-issues'
];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node git-integration.js <command> [args]');
  console.error('');
  console.error('Commands:');
  console.error('  create-mr <project> <source> <target> "<title>" "<desc>"');
  console.error('  list-mrs <project> [state]        List open MRs/PRs');
  console.error('  get-mr <project> <mr-number>      Get MR/PR details');
  console.error('  merge-mr <project> <mr-number>    Merge an MR/PR');
  console.error('  comment-mr <project> <mr-number> "<comment>"');
  console.error('  list-issues <project> [state]     List issues');
  process.exit(1);
}

// --- Input validation ---
const BRANCH_NAME_RE = /^[a-zA-Z0-9_.\/-]+$/;

function validateProjectId(id) {
  if (!id || String(id).trim() === '') {
    console.error('ERROR: Project/repo identifier is required.');
    console.error('  GitHub:    owner/repo (e.g., "myorg/myapp")');
    console.error('  GitLab:    numeric project ID (e.g., "42")');
    console.error('  Bitbucket: workspace/repo (e.g., "myteam/myapp")');
    process.exit(1);
  }
  return String(id).trim();
}

function validateBranchName(branch) {
  if (!branch || !BRANCH_NAME_RE.test(branch)) {
    console.error('ERROR: Invalid branch name. Use alphanumeric, _, ., /, -');
    process.exit(1);
  }
}

function validateMRNumber(num) {
  const mrNum = parseInt(num, 10);
  if (isNaN(mrNum) || mrNum < 1) {
    console.error('ERROR: Invalid MR/PR number. Expected a positive integer.');
    process.exit(1);
  }
  return mrNum;
}

// --- HTTP helper ---

/**
 * Build the auth header for the configured git provider.
 */
function getAuthHeaders() {
  switch (GIT_PROVIDER) {
    case 'gitlab':
      return { 'PRIVATE-TOKEN': GIT_API_TOKEN };
    case 'bitbucket':
      return { 'Authorization': 'Bearer ' + GIT_API_TOKEN };
    case 'github':
    default:
      return { 'Authorization': 'token ' + GIT_API_TOKEN };
  }
}

/**
 * Make an HTTP/HTTPS request to the git provider API.
 */
function request(method, apiPath, body) {
  const fullPath = GIT_PROVIDER === 'gitlab'
    ? '/api/v4' + apiPath
    : apiPath;

  const url = new URL(fullPath, GIT_API_URL);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'OpenClaw-GitIntegration'
      },
      timeout: 15000
    };

    const req = transport.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          let errorMsg = 'API error ' + res.statusCode;
          try {
            const parsed = JSON.parse(data);
            if (parsed.message) errorMsg += ': ' + JSON.stringify(parsed.message);
            else if (parsed.error) errorMsg += ': ' + parsed.error;
            else errorMsg += ': ' + data.slice(0, 500);
          } catch {
            errorMsg += ': ' + data.slice(0, 500);
          }
          reject(new Error(errorMsg));
        } else {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

/**
 * Build the API path for a given operation based on the git provider.
 * Returns the appropriate path for GitHub, GitLab, or Bitbucket.
 */
function buildPath(operation, projectId, extra) {
  extra = extra || {};

  switch (GIT_PROVIDER) {
    case 'gitlab':
      // GitLab uses numeric project IDs
      switch (operation) {
        case 'list-mrs':
          return '/projects/' + projectId + '/merge_requests?state=' + (extra.state || 'opened') + '&per_page=20';
        case 'create-mr':
          return '/projects/' + projectId + '/merge_requests';
        case 'get-mr':
          return '/projects/' + projectId + '/merge_requests/' + extra.mrIid;
        case 'merge-mr':
          return '/projects/' + projectId + '/merge_requests/' + extra.mrIid + '/merge';
        case 'comment-mr':
          return '/projects/' + projectId + '/merge_requests/' + extra.mrIid + '/notes';
        case 'list-issues':
          return '/projects/' + projectId + '/issues?state=' + (extra.state || 'opened') + '&per_page=20&order_by=created_at&sort=desc';
      }
      break;

    case 'bitbucket':
      // Bitbucket uses workspace/repo-slug
      switch (operation) {
        case 'list-mrs':
          return '/2.0/repositories/' + projectId + '/pullrequests?state=' + (extra.state || 'OPEN');
        case 'create-mr':
          return '/2.0/repositories/' + projectId + '/pullrequests';
        case 'get-mr':
          return '/2.0/repositories/' + projectId + '/pullrequests/' + extra.mrIid;
        case 'merge-mr':
          return '/2.0/repositories/' + projectId + '/pullrequests/' + extra.mrIid + '/merge';
        case 'comment-mr':
          return '/2.0/repositories/' + projectId + '/pullrequests/' + extra.mrIid + '/comments';
        case 'list-issues':
          return '/2.0/repositories/' + projectId + '/issues?state=' + (extra.state || 'open');
      }
      break;

    case 'github':
    default:
      // GitHub uses owner/repo
      switch (operation) {
        case 'list-mrs':
          return '/repos/' + projectId + '/pulls?state=' + (extra.state || 'open') + '&per_page=20';
        case 'create-mr':
          return '/repos/' + projectId + '/pulls';
        case 'get-mr':
          return '/repos/' + projectId + '/pulls/' + extra.mrIid;
        case 'merge-mr':
          return '/repos/' + projectId + '/pulls/' + extra.mrIid + '/merge';
        case 'comment-mr':
          return '/repos/' + projectId + '/issues/' + extra.mrIid + '/comments';
        case 'list-issues':
          return '/repos/' + projectId + '/issues?state=' + (extra.state || 'open') + '&per_page=20&sort=created&direction=desc';
      }
      break;
  }

  return '';
}

function printResult(data, label) {
  const output = JSON.stringify(data, null, 2);
  const truncated = output.length > 50000
    ? output.slice(0, 50000) + '\n... [TRUNCATED]'
    : output;

  console.log('=== GIT ' + label + ' ===');
  console.log(truncated);
  console.log('=== END GIT ' + label + ' ===');
}

/**
 * Normalize MR/PR data from different providers into a common format.
 */
function normalizeMR(mr) {
  switch (GIT_PROVIDER) {
    case 'gitlab':
      return {
        id: mr.iid,
        title: mr.title,
        state: mr.state,
        author: mr.author ? mr.author.username : 'unknown',
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        createdAt: mr.created_at,
        url: mr.web_url
      };
    case 'bitbucket':
      return {
        id: mr.id,
        title: mr.title,
        state: mr.state,
        author: mr.author ? mr.author.display_name : 'unknown',
        sourceBranch: mr.source && mr.source.branch ? mr.source.branch.name : '',
        targetBranch: mr.destination && mr.destination.branch ? mr.destination.branch.name : '',
        createdAt: mr.created_on,
        url: mr.links && mr.links.html ? mr.links.html.href : ''
      };
    case 'github':
    default:
      return {
        id: mr.number,
        title: mr.title,
        state: mr.state,
        author: mr.user ? mr.user.login : 'unknown',
        sourceBranch: mr.head ? mr.head.ref : '',
        targetBranch: mr.base ? mr.base.ref : '',
        createdAt: mr.created_at,
        url: mr.html_url
      };
  }
}

/**
 * Normalize issue data from different providers into a common format.
 */
function normalizeIssue(issue) {
  switch (GIT_PROVIDER) {
    case 'gitlab':
      return {
        id: issue.iid,
        title: issue.title,
        description: issue.description ? issue.description.slice(0, 500) : '',
        state: issue.state,
        labels: issue.labels || [],
        assignee: issue.assignee ? issue.assignee.username : null,
        createdAt: issue.created_at,
        url: issue.web_url
      };
    case 'bitbucket':
      return {
        id: issue.id,
        title: issue.title,
        description: issue.content ? (issue.content.raw || '').slice(0, 500) : '',
        state: issue.state,
        labels: [],
        assignee: issue.assignee ? issue.assignee.display_name : null,
        createdAt: issue.created_on,
        url: issue.links && issue.links.html ? issue.links.html.href : ''
      };
    case 'github':
    default:
      return {
        id: issue.number,
        title: issue.title,
        description: issue.body ? issue.body.slice(0, 500) : '',
        state: issue.state,
        labels: (issue.labels || []).map(l => typeof l === 'string' ? l : l.name),
        assignee: issue.assignee ? issue.assignee.login : null,
        createdAt: issue.created_at,
        url: issue.html_url
      };
  }
}

// --- Main ---
(async () => {
  try {
    switch (command) {

      case 'create-mr': {
        const projectId = validateProjectId(args[0]);
        const sourceBranch = args[1];
        const targetBranch = args[2];
        const title = args[3];
        const description = args[4] || '';

        if (!sourceBranch || !targetBranch || !title) {
          console.error('Usage: node git-integration.js create-mr <project> <source-branch> <target-branch> "<title>" "<desc>"');
          process.exit(1);
        }

        validateBranchName(sourceBranch);
        validateBranchName(targetBranch);

        // Build body based on provider
        let body;
        switch (GIT_PROVIDER) {
          case 'gitlab':
            body = {
              source_branch: sourceBranch,
              target_branch: targetBranch,
              title: title,
              description: description
            };
            break;
          case 'bitbucket':
            body = {
              title: title,
              description: description,
              source: { branch: { name: sourceBranch } },
              destination: { branch: { name: targetBranch } }
            };
            break;
          case 'github':
          default:
            body = {
              head: sourceBranch,
              base: targetBranch,
              title: title,
              body: description
            };
            break;
        }

        const apiPath = buildPath('create-mr', projectId);
        const result = await request('POST', apiPath, body);

        const mrId = result.iid || result.number || result.id;
        const mrUrl = result.web_url || result.html_url || '';
        console.log('=== GIT CREATE MR/PR OK -- #' + mrId + ', url: ' + mrUrl + ' ===');
        break;
      }

      case 'list-mrs': {
        const projectId = validateProjectId(args[0]);
        const state = args[1] || 'open';

        const apiPath = buildPath('list-mrs', projectId, { state });
        const result = await request('GET', apiPath);

        // Bitbucket wraps results in .values
        const rawList = Array.isArray(result) ? result : (result.values || []);
        const mrs = rawList.map(normalizeMR);

        printResult(mrs, 'MRs/PRs (' + mrs.length + ' found)');
        break;
      }

      case 'get-mr': {
        const projectId = validateProjectId(args[0]);
        const mrIid = validateMRNumber(args[1]);

        const apiPath = buildPath('get-mr', projectId, { mrIid });
        const result = await request('GET', apiPath);

        printResult(normalizeMR(result), 'MR/PR #' + mrIid);
        break;
      }

      case 'merge-mr': {
        const projectId = validateProjectId(args[0]);
        const mrIid = validateMRNumber(args[1]);

        const apiPath = buildPath('merge-mr', projectId, { mrIid });

        // Build merge body based on provider
        let body;
        switch (GIT_PROVIDER) {
          case 'gitlab':
            body = { should_remove_source_branch: true };
            break;
          case 'github':
            body = { merge_method: 'merge' };
            break;
          default:
            body = {};
        }

        const method = GIT_PROVIDER === 'gitlab' ? 'PUT' : 'PUT';
        const result = await request(method, apiPath, body);

        console.log('=== GIT MERGE OK -- #' + mrIid + ', state: ' + (result.state || result.merged || 'merged') + ' ===');
        break;
      }

      case 'comment-mr': {
        const projectId = validateProjectId(args[0]);
        const mrIid = validateMRNumber(args[1]);
        const comment = args.slice(2).join(' ');

        if (!comment) {
          console.error('Usage: node git-integration.js comment-mr <project> <mr-number> "<comment>"');
          process.exit(1);
        }

        const apiPath = buildPath('comment-mr', projectId, { mrIid });

        // Build comment body based on provider
        let body;
        switch (GIT_PROVIDER) {
          case 'bitbucket':
            body = { content: { raw: comment } };
            break;
          case 'gitlab':
          case 'github':
          default:
            body = { body: comment };
            break;
        }

        const result = await request('POST', apiPath, body);

        const noteId = result.id || '';
        console.log('=== GIT COMMENT OK -- note_id: ' + noteId + ', MR/PR: #' + mrIid + ' ===');
        break;
      }

      case 'list-issues': {
        const projectId = validateProjectId(args[0]);
        const state = args[1] || 'open';

        const apiPath = buildPath('list-issues', projectId, { state });
        const result = await request('GET', apiPath);

        // Bitbucket wraps results in .values; GitHub returns PRs in issues endpoint too
        let rawList = Array.isArray(result) ? result : (result.values || []);

        // GitHub: filter out pull requests from the issues endpoint
        if (GIT_PROVIDER === 'github') {
          rawList = rawList.filter(i => !i.pull_request);
        }

        const issues = rawList.map(normalizeIssue);

        printResult(issues, 'ISSUES (' + issues.length + ' found)');
        break;
      }
    }
  } catch (err) {
    console.error('=== GIT ERROR: ' + err.message + ' ===');
    process.exit(1);
  }
})();
