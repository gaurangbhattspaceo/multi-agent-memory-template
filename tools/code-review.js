#!/usr/bin/env node
// Code Review — MR/PR review tracking tool
// Tracks which merge/pull requests have been reviewed, fetches diffs, posts comments
//
// Usage:
//   node code-review.js check-mrs <project-id>                    # list unreviewed open MRs/PRs
//   node code-review.js get-diff <project-id> <mr-iid>            # fetch MR/PR details + diff
//   node code-review.js post <project-id> <mr-iid> "<comment>"    # post review, mark as reviewed
//
// No npm dependencies required. Uses only Node.js built-in modules.
//
// CUSTOMIZATION:
//   This tool uses stubbed API calls. You must fill in the TODO sections
//   with your git provider's API (GitHub, GitLab, Bitbucket, etc.).
//   Set GIT_API_URL and GIT_API_TOKEN environment variables.

const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// --- Configuration ---
// Set these environment variables for your git provider
const GIT_API_TOKEN = process.env.GIT_API_TOKEN;
const GIT_API_URL = process.env.GIT_API_URL || 'https://api.github.com';

const REVIEWED_FILE = '/data/reviewed-mrs.json';

// --- Parse arguments ---
const [,, command, ...args] = process.argv;

const VALID_COMMANDS = ['check-mrs', 'get-diff', 'post'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node code-review.js <command> [args]');
  console.error('');
  console.error('Commands:');
  console.error('  check-mrs <project-id>                  List unreviewed open MRs/PRs');
  console.error('  get-diff <project-id> <mr-iid>          Fetch MR/PR details and diff');
  console.error('  post <project-id> <mr-iid> "<comment>"  Post review comment, mark reviewed');
  process.exit(1);
}

if (!GIT_API_TOKEN) {
  console.error('ERROR: GIT_API_TOKEN environment variable must be set.');
  console.error('Set it to your GitHub personal access token, GitLab private token, etc.');
  process.exit(1);
}

// --- HTTP helper ---
/**
 * Generic HTTP/HTTPS request helper.
 *
 * TODO: Adjust the headers for your git provider:
 *   - GitHub:    Authorization: token <TOKEN>
 *   - GitLab:    PRIVATE-TOKEN: <TOKEN>
 *   - Bitbucket: Authorization: Bearer <TOKEN>
 */
function request(method, apiPath, body) {
  const url = new URL(apiPath, GIT_API_URL);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        // TODO: Adjust auth header for your provider
        // GitHub:    'Authorization': 'token ' + GIT_API_TOKEN,
        // GitLab:    'PRIVATE-TOKEN': GIT_API_TOKEN,
        // Bitbucket: 'Authorization': 'Bearer ' + GIT_API_TOKEN,
        'Authorization': 'token ' + GIT_API_TOKEN,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'OpenClaw-CodeReview'
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

// --- Reviewed MR/PR tracking ---

function loadReviewed() {
  try {
    if (!fs.existsSync(REVIEWED_FILE)) return {};
    return JSON.parse(fs.readFileSync(REVIEWED_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveReviewed(data) {
  const dir = require('path').dirname(REVIEWED_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = REVIEWED_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, REVIEWED_FILE);
}

function markReviewed(projectId, mrIid) {
  const reviewed = loadReviewed();
  const key = projectId + ':' + mrIid;
  reviewed[key] = {
    reviewedAt: new Date().toISOString(),
    projectId: projectId,
    mrIid: mrIid
  };
  saveReviewed(reviewed);
}

function isReviewed(projectId, mrIid) {
  const reviewed = loadReviewed();
  return !!(reviewed[projectId + ':' + mrIid]);
}

// --- Input validation ---

function validateProjectId(id) {
  if (!id || String(id).trim() === '') {
    console.error('ERROR: Project ID is required.');
    process.exit(1);
  }
  return String(id).trim();
}

function validateMRNumber(num) {
  const mrNum = parseInt(num, 10);
  if (isNaN(mrNum) || mrNum < 1) {
    console.error('ERROR: Invalid MR/PR number. Expected a positive integer.');
    process.exit(1);
  }
  return mrNum;
}

// --- Main ---
(async () => {
  try {
    switch (command) {

      case 'check-mrs': {
        const projectId = validateProjectId(args[0]);

        // TODO: Replace with your git provider's API endpoint
        // GitHub:    /repos/{owner}/{repo}/pulls?state=open
        // GitLab:    /api/v4/projects/{id}/merge_requests?state=opened
        // Bitbucket: /2.0/repositories/{workspace}/{repo}/pullrequests?state=OPEN
        const mrs = await request('GET',
          '/repos/' + projectId + '/pulls?state=open&per_page=20');

        const mrList = Array.isArray(mrs) ? mrs : [];
        const unreviewed = mrList.filter(mr => {
          // GitHub uses 'number', GitLab uses 'iid'
          const mrId = mr.iid || mr.number || mr.id;
          return !isReviewed(projectId, mrId);
        });

        if (unreviewed.length === 0) {
          console.log('=== CODE REVIEW: No unreviewed MRs/PRs for ' + projectId + ' ===');
          break;
        }

        console.log('=== UNREVIEWED MRs/PRs (' + unreviewed.length + ' found, project: ' + projectId + ') ===');
        for (const mr of unreviewed) {
          const mrId = mr.iid || mr.number || mr.id;
          const author = mr.author ? (mr.author.username || mr.author.login) : 'unknown';
          const sourceBranch = mr.source_branch || mr.head && mr.head.ref || '';
          const targetBranch = mr.target_branch || mr.base && mr.base.ref || '';
          console.log('  #' + mrId + ' "' + mr.title + '" by ' + author +
            ' (' + sourceBranch + ' -> ' + targetBranch + ')');
        }
        console.log('=== END ===');
        break;
      }

      case 'get-diff': {
        const projectId = validateProjectId(args[0]);
        const mrIid = validateMRNumber(args[1]);

        // TODO: Replace with your git provider's API endpoint
        // GitHub:    GET /repos/{owner}/{repo}/pulls/{number}
        // GitLab:    GET /api/v4/projects/{id}/merge_requests/{iid}
        //            GET /api/v4/projects/{id}/merge_requests/{iid}/changes
        const mr = await request('GET',
          '/repos/' + projectId + '/pulls/' + mrIid);

        console.log('=== MR/PR DIFF: #' + mrIid + ' -- ' + mr.title + ' ===');

        const author = mr.author ? (mr.author.username || mr.author.login) : 'unknown';
        const sourceBranch = mr.source_branch || (mr.head && mr.head.ref) || '';
        const targetBranch = mr.target_branch || (mr.base && mr.base.ref) || '';
        const state = mr.state || 'unknown';
        const hasConflicts = mr.has_conflicts || mr.mergeable === false || false;

        console.log('Author: ' + author);
        console.log('Branch: ' + sourceBranch + ' -> ' + targetBranch);
        console.log('Status: ' + state + ', Conflicts: ' + (hasConflicts ? 'YES' : 'no'));
        console.log('Description: ' + ((mr.description || mr.body || '(none)').slice(0, 500)));
        console.log('');

        // TODO: Fetch the diff/changes
        // GitHub:    GET /repos/{owner}/{repo}/pulls/{number}/files
        // GitLab:    already included in /changes endpoint above
        // For now, output a placeholder:
        console.log('--- DIFF ---');
        console.log('TODO: Implement diff fetching for your git provider.');
        console.log('  GitHub: GET /repos/{owner}/{repo}/pulls/{number}/files');
        console.log('  GitLab: GET /api/v4/projects/{id}/merge_requests/{iid}/changes');
        console.log('--- END DIFF ---');

        console.log('=== END MR/PR DIFF ===');
        break;
      }

      case 'post': {
        const projectId = validateProjectId(args[0]);
        const mrIid = validateMRNumber(args[1]);
        const comment = args.slice(2).join(' ');

        if (!comment) {
          console.error('Usage: node code-review.js post <project-id> <mr-iid> "<comment>"');
          process.exit(1);
        }

        // TODO: Replace with your git provider's API endpoint
        // GitHub:    POST /repos/{owner}/{repo}/issues/{number}/comments  { body: comment }
        // GitLab:    POST /api/v4/projects/{id}/merge_requests/{iid}/notes  { body: comment }
        // Bitbucket: POST /2.0/repositories/{workspace}/{repo}/pullrequests/{id}/comments
        await request('POST',
          '/repos/' + projectId + '/issues/' + mrIid + '/comments',
          { body: comment });

        // Mark as reviewed in local state
        markReviewed(projectId, mrIid);

        console.log('=== CODE REVIEW POSTED ===');
        console.log('MR/PR: #' + mrIid + ' (project: ' + projectId + ')');
        console.log('Comment length: ' + comment.length + ' chars');
        console.log('Marked as reviewed');
        console.log('=== END ===');
        break;
      }
    }
  } catch (err) {
    console.error('=== CODE REVIEW ERROR: ' + err.message + ' ===');
    process.exit(1);
  }
})();
