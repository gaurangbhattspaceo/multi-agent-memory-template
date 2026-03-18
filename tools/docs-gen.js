#!/usr/bin/env node
// Docs Generator — scans codebase, takes screenshots, manages docs repo
// Used by the docs-agent to autonomously generate documentation
//
// Usage:
//   node docs-gen.js scan                              # scan codebase for routes/APIs/models
//   node docs-gen.js screenshot <page-path> <name>     # take Playwright screenshot
//   node docs-gen.js git-status                        # show docs repo git status
//   node docs-gen.js git-push <commit-message>         # stage, commit, push to docs repo

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DOCS_REPO = process.env.DOCS_REPO_PATH || '/data/docs-repo';
const SCREENSHOTS_DIR = path.join(DOCS_REPO, 'images', 'screenshots');
const CODEBASE_DIR = process.env.CODEBASE_PATH || '/home/user/my-app';
const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

// --- Parse arguments ---
const [,, command, ...args] = process.argv;

const VALID_COMMANDS = ['scan', 'screenshot', 'git-status', 'git-push'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node docs-gen.js scan|screenshot|git-status|git-push [args]');
  console.error('');
  console.error('Commands:');
  console.error('  scan                          Scan codebase for routes, APIs, components, models');
  console.error('  screenshot <page-path> <name> Take screenshot of a page (e.g., /dashboard/jobs jobs-list)');
  console.error('  git-status                    Show docs repo git status');
  console.error('  git-push <commit-message>     Stage all, commit, push to docs repo');
  process.exit(1);
}

// --- Helpers ---
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function findFiles(dir, pattern, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      findFiles(fullPath, pattern, results);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function fileToRoute(filePath, baseDir) {
  const relative = path.relative(baseDir, path.dirname(filePath));
  let route = '/' + relative.replace(/\\/g, '/');
  if (route === '/.') route = '/';
  return route;
}

// --- Commands ---

function scan() {
  const appDir = path.join(CODEBASE_DIR, 'src', 'app');
  const componentsDir = path.join(CODEBASE_DIR, 'src', 'components');
  const schemaFile = path.join(CODEBASE_DIR, 'prisma', 'schema.prisma');

  const manifest = {
    scannedAt: new Date().toISOString(),
    codebasePath: CODEBASE_DIR,
    routes: [],
    apiEndpoints: [],
    components: [],
    models: []
  };

  // 1. Scan page routes (page.tsx files)
  const pageFiles = findFiles(appDir, /^page\.tsx$/);
  for (const file of pageFiles) {
    const route = fileToRoute(file, appDir);
    if (route.startsWith('/api')) continue;
    manifest.routes.push({ path: route, file: path.relative(CODEBASE_DIR, file) });
  }

  // 2. Scan API endpoints (route.ts files)
  const apiDir = path.join(appDir, 'api');
  const routeFiles = findFiles(apiDir, /^route\.ts$/);
  for (const file of routeFiles) {
    const route = '/api' + fileToRoute(file, apiDir).replace(/^\//, '/');
    const cleanRoute = route.replace(/\/\/$/, '/');

    let methods = [];
    try {
      const content = fs.readFileSync(file, 'utf8');
      const methodMatches = content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/g);
      if (methodMatches) {
        methods = methodMatches.map(m => m.match(/(GET|POST|PUT|DELETE|PATCH)/)[1]);
      }
    } catch (e) { /* ignore */ }

    manifest.apiEndpoints.push({
      path: cleanRoute,
      methods: methods.length > 0 ? methods : ['GET'],
      file: path.relative(CODEBASE_DIR, file)
    });
  }

  // 3. Scan components
  if (fs.existsSync(componentsDir)) {
    const domains = fs.readdirSync(componentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const domain of domains) {
      const domainDir = path.join(componentsDir, domain);
      const componentFiles = findFiles(domainDir, /\.(tsx|ts)$/);
      manifest.components.push({
        domain,
        count: componentFiles.length,
        files: componentFiles.map(f => path.relative(CODEBASE_DIR, f))
      });
    }
  }

  // 4. Parse Prisma models (if applicable)
  if (fs.existsSync(schemaFile)) {
    try {
      const schema = fs.readFileSync(schemaFile, 'utf8');
      const modelMatches = schema.match(/^model\s+(\w+)\s*\{/gm);
      if (modelMatches) {
        manifest.models = modelMatches.map(m => ({ name: m.match(/^model\s+(\w+)/)[1] }));
      }
    } catch (e) { /* ignore */ }
  }

  manifest.routes.sort((a, b) => a.path.localeCompare(b.path));
  manifest.apiEndpoints.sort((a, b) => a.path.localeCompare(b.path));
  manifest.components.sort((a, b) => a.domain.localeCompare(b.domain));

  console.log(JSON.stringify(manifest, null, 2));

  const manifestPath = path.join(DOCS_REPO, '.last-scan.json');
  try { fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); }
  catch (e) { /* docs repo might not exist yet */ }
}

function screenshot() {
  const pagePath = args[0];
  const outputName = args[1];

  if (!pagePath || !outputName) {
    console.error('Usage: node docs-gen.js screenshot <page-path> <output-name>');
    process.exit(1);
  }

  ensureDir(SCREENSHOTS_DIR);

  const url = `${BASE_URL}${pagePath}`;
  const outputPath = path.join(SCREENSHOTS_DIR, `${outputName}.png`);

  console.log(`Taking screenshot of ${url}...`);

  try {
    const script = `
      const { chromium } = require('playwright');
      (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto('${url}', { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '${outputPath}', fullPage: false });
        await browser.close();
        console.log('Screenshot saved: ${outputPath}');
      })().catch(e => { console.error('Screenshot failed:', e.message); process.exit(1); });
    `;

    execSync(`node -e "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      stdio: 'inherit', timeout: 60000
    });
  } catch (e) {
    console.error('Screenshot error:', e.message);
    console.error('Ensure Playwright is installed: npx playwright install chromium');
    process.exit(1);
  }
}

function gitStatus() {
  if (!fs.existsSync(DOCS_REPO)) {
    console.error('Docs repo not found at ' + DOCS_REPO);
    console.error('Clone it first: git clone <repo-url> ' + DOCS_REPO);
    process.exit(1);
  }

  try {
    const status = execSync('git status', { cwd: DOCS_REPO, encoding: 'utf8' });
    console.log(status);
    const log = execSync('git log --oneline -5', { cwd: DOCS_REPO, encoding: 'utf8' });
    console.log('Recent commits:');
    console.log(log);
  } catch (e) {
    console.error('Git status error:', e.message);
    process.exit(1);
  }
}

function gitPush() {
  const commitMessage = args.join(' ');

  if (!commitMessage) {
    console.error('Usage: node docs-gen.js git-push <commit-message>');
    process.exit(1);
  }

  if (!fs.existsSync(DOCS_REPO)) {
    console.error('Docs repo not found at ' + DOCS_REPO);
    process.exit(1);
  }

  try {
    const status = execSync('git status --porcelain', { cwd: DOCS_REPO, encoding: 'utf8' }).trim();
    if (!status) { console.log('No changes to commit.'); return; }

    console.log('Changes to commit:');
    console.log(status);

    execSync('git add -A', { cwd: DOCS_REPO, stdio: 'inherit' });
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: DOCS_REPO, stdio: 'inherit' });
    execSync('git push origin main', { cwd: DOCS_REPO, stdio: 'inherit' });

    console.log('Docs pushed successfully.');
  } catch (e) {
    console.error('Git push error:', e.message);
    process.exit(1);
  }
}

switch (command) {
  case 'scan': scan(); break;
  case 'screenshot': screenshot(); break;
  case 'git-status': gitStatus(); break;
  case 'git-push': gitPush(); break;
}
