#!/usr/bin/env node
// E2E Test Runner — wraps Playwright for AI agent test execution
// Manages test runs, screenshots, and Discord posting
//
// Usage:
//   node e2e-runner.js run-all                    # run all E2E tests
//   node e2e-runner.js run <test-name>            # run specific test
//   node e2e-runner.js screenshot <page-path>     # quick screenshot of a page
//   node e2e-runner.js post-screenshots <channel> # post screenshots to Discord
//   node e2e-runner.js inspect <page-path>         # read page text + screenshot
//   node e2e-runner.js results                    # view last test results

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCREENSHOTS_DIR = '/data/screenshots';
const RESULTS_FILE = path.join(SCREENSHOTS_DIR, 'results.json');
const RELEASES_DIR = '/data/releases';
const LAST_E2E_FILE = path.join(RELEASES_DIR, 'last-e2e.json');
const TESTS_DIR = process.env.E2E_TESTS_DIR || '/app/tests/e2e';
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

// --- Parse arguments ---
const [,, command, ...args] = process.argv;

const VALID_COMMANDS = ['run-all', 'run', 'screenshot', 'post-screenshots', 'results', 'inspect'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node e2e-runner.js run-all|run|screenshot|inspect|post-screenshots|results [args]');
  process.exit(1);
}

// --- Helpers ---
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestamp() {
  const d = new Date();
  return d.toISOString().slice(0, 16).replace(/[T:]/g, '-');
}

function runPlaywright(testFile) {
  ensureDir(SCREENSHOTS_DIR);

  const configPath = path.join(TESTS_DIR, 'playwright.config.js');
  const testArg = testFile ? path.join(TESTS_DIR, testFile) : TESTS_DIR;

  const cmd = 'npx playwright test ' + testArg +
    ' --config=' + configPath +
    ' --reporter=json 2>&1';

  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      timeout: 120000,
      cwd: '/app',
      env: {
        ...process.env,
        E2E_BASE_URL: BASE_URL,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || ''
      }
    });

    // Try to parse JSON output
    try {
      const jsonStart = output.indexOf('{');
      if (jsonStart >= 0) {
        const jsonStr = output.slice(jsonStart);
        const results = JSON.parse(jsonStr);
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        return { success: true, results: results, raw: output };
      }
    } catch { /* JSON parse failed, use raw output */ }

    return { success: true, results: null, raw: output };
  } catch (err) {
    // Playwright exits with non-zero on test failures — that's expected
    const output = err.stdout || err.stderr || err.message;

    // Try to parse JSON from output even on failure
    try {
      const jsonStart = output.indexOf('{');
      if (jsonStart >= 0) {
        const jsonStr = output.slice(jsonStart);
        const results = JSON.parse(jsonStr);
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        return { success: false, results: results, raw: output };
      }
    } catch { /* JSON parse failed */ }

    return { success: false, results: null, raw: output };
  }
}

function formatResults(results) {
  if (!results || !results.suites) {
    return 'No structured results available.';
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const lines = [];

  function walkSuites(suites) {
    for (const suite of suites) {
      for (const spec of (suite.specs || [])) {
        for (const test of (spec.tests || [])) {
          const status = test.status || test.expectedStatus;
          const duration = test.results && test.results[0]
            ? (test.results[0].duration / 1000).toFixed(1) + 's'
            : '';

          if (status === 'passed' || status === 'expected') {
            passed++;
            lines.push('  [PASS] ' + spec.title + ' (' + duration + ')');
          } else if (status === 'failed' || status === 'unexpected') {
            failed++;
            const error = test.results && test.results[0] && test.results[0].error
              ? test.results[0].error.message || ''
              : '';
            lines.push('  [FAIL] ' + spec.title + ' -- ' + error.slice(0, 100));
          } else {
            skipped++;
            lines.push('  [SKIP] ' + spec.title);
          }
        }
      }
      if (suite.suites) walkSuites(suite.suites);
    }
  }

  walkSuites(results.suites || []);

  const total = passed + failed + skipped;
  return 'Total: ' + total + ' | Passed: ' + passed + ' | Failed: ' + failed +
    (skipped > 0 ? ' | Skipped: ' + skipped : '') + '\n\n' + lines.join('\n');
}

function getScreenshots() {
  ensureDir(SCREENSHOTS_DIR);
  try {
    return fs.readdirSync(SCREENSHOTS_DIR)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .map(f => path.join(SCREENSHOTS_DIR, f))
      .sort();
  } catch {
    return [];
  }
}

function exportResultsSummary() {
  let summary;

  // Try to read and parse the Playwright results file
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
      let passed = 0;
      let failed = 0;
      const failures = [];

      function walkSuitesForExport(suites, parentFile) {
        for (const suite of suites) {
          const suiteFile = suite.file || parentFile || '';
          for (const spec of (suite.specs || [])) {
            for (const test of (spec.tests || [])) {
              const status = test.status || test.expectedStatus;
              if (status === 'passed' || status === 'expected') {
                passed++;
              } else if (status === 'failed' || status === 'unexpected') {
                failed++;
                let errorMsg = '';
                let screenshotPath = '';
                if (test.results && test.results[0]) {
                  if (test.results[0].error && test.results[0].error.message) {
                    errorMsg = test.results[0].error.message.slice(0, 500);
                  }
                  // Look for screenshot attachments
                  const attachments = test.results[0].attachments || [];
                  for (const att of attachments) {
                    if (att.contentType && att.contentType.indexOf('image/') === 0) {
                      screenshotPath = att.path || '';
                      break;
                    }
                  }
                }
                failures.push({
                  testName: suiteFile,
                  title: spec.title,
                  error: errorMsg,
                  screenshotPath: screenshotPath
                });
              }
            }
          }
          if (suite.suites) walkSuitesForExport(suite.suites, suiteFile);
        }
      }

      walkSuitesForExport(results.suites || [], '');

      summary = {
        timestamp: new Date().toISOString(),
        totalTests: passed + failed,
        passed: passed,
        failed: failed,
        failures: failures
      };
    } catch (parseErr) {
      summary = {
        timestamp: new Date().toISOString(),
        totalTests: 0,
        passed: 0,
        failed: 0,
        failures: [],
        error: 'Failed to parse results.json: ' + parseErr.message
      };
    }
  } else {
    summary = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passed: 0,
      failed: 0,
      failures: [],
      error: 'No results.json found — Playwright execution may have crashed before producing output'
    };
  }

  // Write atomically: write to .tmp then rename
  ensureDir(RELEASES_DIR);
  const tmpFile = LAST_E2E_FILE + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(summary, null, 2));
    fs.renameSync(tmpFile, LAST_E2E_FILE);
    console.log('Results summary exported to ' + LAST_E2E_FILE);
  } catch (writeErr) {
    console.error('WARNING: Failed to export results summary: ' + writeErr.message);
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// --- Main ---
switch (command) {

  case 'run-all': {
    console.log('=== E2E TESTS: Running all tests ===');
    console.log('Base URL: ' + BASE_URL);
    console.log('Tests dir: ' + TESTS_DIR);
    console.log('');

    if (!fs.existsSync(TESTS_DIR)) {
      console.error('ERROR: Tests directory not found: ' + TESTS_DIR);
      console.error('Create your Playwright tests at ' + TESTS_DIR + ' or set E2E_TESTS_DIR.');
      process.exit(1);
    }

    const result = runPlaywright();

    if (result.results) {
      console.log(formatResults(result.results));
    } else {
      console.log('Raw output:');
      console.log(result.raw.slice(0, 3000));
    }

    const screenshots = getScreenshots();
    console.log('');
    console.log('Screenshots: ' + screenshots.length + ' files in ' + SCREENSHOTS_DIR);

    // Export structured results summary for downstream consumers
    exportResultsSummary();

    console.log('');
    console.log('Overall: ' + (result.success ? 'ALL PASSED' : 'SOME FAILED'));
    console.log('=== END E2E TESTS ===');

    if (!result.success) process.exit(1);
    break;
  }

  case 'run': {
    const testName = args[0];
    if (!testName) {
      console.error('Usage: node e2e-runner.js run <test-name>');
      console.error('Example: node e2e-runner.js run dashboard');
      process.exit(1);
    }

    const testFile = testName.endsWith('.spec.js') ? testName : testName + '.spec.js';
    const testPath = path.join(TESTS_DIR, testFile);

    if (!fs.existsSync(testPath)) {
      console.error('ERROR: Test file not found: ' + testPath);
      try {
        const available = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.spec.js'));
        console.error('Available: ' + available.join(', '));
      } catch { /* tests dir may not exist */ }
      process.exit(1);
    }

    console.log('=== E2E TEST: ' + testFile + ' ===');

    const result = runPlaywright(testFile);

    if (result.results) {
      console.log(formatResults(result.results));
    } else {
      console.log(result.raw.slice(0, 2000));
    }

    console.log('=== END ===');

    if (!result.success) process.exit(1);
    break;
  }

  case 'screenshot': {
    const pagePath = args[0];
    if (!pagePath) {
      console.error('Usage: node e2e-runner.js screenshot <page-path>');
      console.error('Example: node e2e-runner.js screenshot /dashboard');
      process.exit(1);
    }

    ensureDir(SCREENSHOTS_DIR);

    const safeName = pagePath.replace(/^\//, '').replace(/\//g, '-') || 'home';
    const fileName = timestamp() + '-' + safeName + '.png';
    const outputPath = path.join(SCREENSHOTS_DIR, fileName);
    const fullUrl = BASE_URL + (pagePath.startsWith('/') ? pagePath : '/' + pagePath);

    console.log('=== SCREENSHOT: ' + fullUrl + ' ===');

    const script = [
      "const { chromium } = require('@playwright/test');",
      "const fs = require('fs');",
      "(async () => {",
      "  const browser = await chromium.launch({ headless: true });",
      "  try {",
      "    const authState = '/data/screenshots/auth-state.json';",
      "    let page;",
      "    if (fs.existsSync(authState)) {",
      "      const context = await browser.newContext({",
      "        storageState: authState,",
      "        viewport: { width: 1280, height: 720 }",
      "      });",
      "      page = await context.newPage();",
      "    } else {",
      "      page = await browser.newPage({ viewport: { width: 1280, height: 720 } });",
      "    }",
      "    await page.goto(" + JSON.stringify(fullUrl) + ", { waitUntil: 'networkidle', timeout: 20000 });",
      "    await page.waitForTimeout(2000);",
      "    await page.screenshot({ path: " + JSON.stringify(outputPath) + ", fullPage: true });",
      "    console.log('Screenshot saved: " + outputPath + "');",
      "  } catch (err) {",
      "    console.error('Screenshot failed: ' + err.message);",
      "    process.exit(1);",
      "  } finally {",
      "    await browser.close();",
      "  }",
      "})();"
    ].join('\n');

    const tmpScript = '/app/e2e-screenshot-' + Date.now() + '.js';
    fs.writeFileSync(tmpScript, script);

    try {
      execSync('node ' + tmpScript, {
        encoding: 'utf8',
        timeout: 30000,
        cwd: '/app',
        env: process.env
      });
      console.log('Saved: ' + outputPath);
    } catch (err) {
      console.error('Screenshot failed: ' + (err.stderr || err.message).slice(0, 500));
      process.exit(1);
    } finally {
      try { fs.unlinkSync(tmpScript); } catch {}
    }

    console.log('=== END ===');
    break;
  }

  case 'inspect': {
    const inspectPath = args[0];
    if (!inspectPath) {
      console.error('Usage: node e2e-runner.js inspect <page-path>');
      console.error('Example: node e2e-runner.js inspect /dashboard/calendar');
      console.error('');
      console.error('Navigates to a page, extracts visible text, takes a screenshot.');
      console.error('Use this to "read" what is on a page and verify UI content.');
      process.exit(1);
    }

    ensureDir(SCREENSHOTS_DIR);

    const inspectName = inspectPath.replace(/^\//, '').replace(/\//g, '-') || 'home';
    const inspectScreenshot = path.join(SCREENSHOTS_DIR, inspectName + '.png');
    const inspectUrl = BASE_URL + (inspectPath.startsWith('/') ? inspectPath : '/' + inspectPath);

    const inspectScript = [
      "const { chromium } = require('@playwright/test');",
      "const fs = require('fs');",
      "(async () => {",
      "  const browser = await chromium.launch({ headless: true });",
      "  try {",
      "    const authState = '/data/screenshots/auth-state.json';",
      "    let context;",
      "    if (fs.existsSync(authState)) {",
      "      context = await browser.newContext({",
      "        storageState: authState,",
      "        viewport: { width: 1280, height: 720 }",
      "      });",
      "    } else {",
      "      context = await browser.newContext({ viewport: { width: 1280, height: 720 } });",
      "    }",
      "    const page = await context.newPage();",
      "    await page.goto(" + JSON.stringify(inspectUrl) + ", { waitUntil: 'domcontentloaded', timeout: 30000 });",
      "    await page.waitForTimeout(5000);",
      "",
      "    // Wait for spinners to disappear",
      "    const spinner = page.locator('[class*=\"spinner\"], [class*=\"loading\"], [class*=\"animate-spin\"]');",
      "    await spinner.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});",
      "",
      "    // Extract visible text",
      "    const visibleText = await page.locator('body').innerText();",
      "",
      "    // Extract page title",
      "    const title = await page.title();",
      "",
      "    // Extract current URL (may have redirected)",
      "    const currentUrl = page.url();",
      "",
      "    // Count key UI elements",
      "    const links = await page.locator('a').count();",
      "    const buttons = await page.locator('button').count();",
      "    const inputs = await page.locator('input, textarea, select').count();",
      "    const tables = await page.locator('table').count();",
      "",
      "    // Check for error states",
      "    const hasError = visibleText.includes('Internal Server Error') ||",
      "      visibleText.includes('Application error') ||",
      "      visibleText.includes('404') ||",
      "      visibleText.includes('Something went wrong');",
      "",
      "    // Take screenshot",
      "    await page.screenshot({ path: " + JSON.stringify(inspectScreenshot) + ", fullPage: true });",
      "",
      "    // Output structured result",
      "    const result = {",
      "      url: currentUrl,",
      "      title: title,",
      "      screenshot: " + JSON.stringify(inspectScreenshot) + ",",
      "      hasError: hasError,",
      "      elements: { links: links, buttons: buttons, inputs: inputs, tables: tables },",
      "      text: visibleText",
      "    };",
      "    console.log(JSON.stringify(result));",
      "  } catch (err) {",
      "    console.error('Inspect failed: ' + err.message);",
      "    process.exit(1);",
      "  } finally {",
      "    await browser.close();",
      "  }",
      "})();"
    ].join('\n');

    const inspectTmpScript = '/app/e2e-inspect-' + Date.now() + '.js';
    fs.writeFileSync(inspectTmpScript, inspectScript);

    try {
      const rawOutput = execSync('node ' + inspectTmpScript, {
        encoding: 'utf8',
        timeout: 60000,
        cwd: '/app',
        env: process.env
      });

      let result;
      try {
        const jsonLine = rawOutput.trim().split('\n').pop();
        result = JSON.parse(jsonLine);
      } catch {
        console.log('=== PAGE INSPECT: ' + inspectUrl + ' ===');
        console.log(rawOutput);
        console.log('=== END ===');
        break;
      }

      console.log('=== PAGE INSPECT: ' + result.url + ' ===');
      console.log('Title: ' + result.title);
      console.log('Screenshot: ' + result.screenshot);
      console.log('Error detected: ' + (result.hasError ? 'YES' : 'No'));
      console.log('Elements: ' + result.elements.links + ' links, ' +
        result.elements.buttons + ' buttons, ' +
        result.elements.inputs + ' inputs, ' +
        result.elements.tables + ' tables');
      console.log('');
      console.log('--- PAGE CONTENT ---');
      const text = result.text || '';
      if (text.length > 5000) {
        console.log(text.slice(0, 5000));
        console.log('... (truncated, ' + text.length + ' total characters)');
      } else {
        console.log(text);
      }
      console.log('--- END CONTENT ---');
      console.log('=== END PAGE INSPECT ===');

      if (result.hasError) process.exit(1);
    } catch (err) {
      console.error('Inspect failed: ' + (err.stderr || err.message).slice(0, 500));
      process.exit(1);
    } finally {
      try { fs.unlinkSync(inspectTmpScript); } catch {}
    }
    break;
  }

  case 'post-screenshots': {
    const targetChannel = args[0];
    if (!targetChannel) {
      console.error('Usage: node e2e-runner.js post-screenshots <channel>');
      console.error('Example: node e2e-runner.js post-screenshots dev-alerts');
      process.exit(1);
    }

    const screenshots = getScreenshots();

    if (screenshots.length === 0) {
      console.log('=== NO SCREENSHOTS: No screenshots found in ' + SCREENSHOTS_DIR + ' ===');
      break;
    }

    console.log('=== POSTING SCREENSHOTS: ' + screenshots.length + ' files to #' + targetChannel + ' ===');

    // Read results for summary
    let summary = 'E2E Screenshots';
    if (fs.existsSync(RESULTS_FILE)) {
      try {
        const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        summary = 'E2E Results: ' + formatResults(results).split('\n')[0];
      } catch { /* use default summary */ }
    }

    // Post each screenshot
    let posted = 0;
    for (const screenshot of screenshots) {
      const fileName = path.basename(screenshot);
      try {
        execSync(
          'node /app/identity/post-file.js devops-agent ' + targetChannel +
          ' "' + fileName + '" ' + screenshot,
          { encoding: 'utf8', timeout: 15000 }
        );
        posted++;
        console.log('  Posted: ' + fileName);

        // Rate limit: Discord webhooks allow ~30 requests per minute
        if (posted < screenshots.length) {
          execSync('sleep 2');
        }
      } catch (err) {
        console.error('  Failed: ' + fileName + ' -- ' + (err.message || '').slice(0, 100));
      }
    }

    console.log('');
    console.log('Posted ' + posted + '/' + screenshots.length + ' screenshots to #' + targetChannel);
    console.log('=== END ===');
    break;
  }

  case 'results': {
    if (!fs.existsSync(RESULTS_FILE)) {
      console.log('=== E2E RESULTS: No results found ===');
      console.log('Run "e2e run-all" first.');
      console.log('=== END ===');
      break;
    }

    try {
      const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
      console.log('=== E2E TEST RESULTS ===');
      console.log(formatResults(results));

      const screenshots = getScreenshots();
      console.log('');
      console.log('Screenshots: ' + screenshots.length + ' files in ' + SCREENSHOTS_DIR);
      if (screenshots.length > 0) {
        for (const s of screenshots.slice(-10)) {
          console.log('  ' + path.basename(s));
        }
      }
      console.log('=== END E2E RESULTS ===');
    } catch (err) {
      console.error('ERROR: Failed to read results: ' + err.message);
      process.exit(1);
    }
    break;
  }
}
