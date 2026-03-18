#!/usr/bin/env node
// Knowledge Vault — structured knowledge base for team learning
// Stores decisions, patterns, failures, metrics, and promotions at /data/knowledge/
//
// Usage:
//   node knowledge-vault.js read decisions|patterns|failures|metrics|promotions
//   node knowledge-vault.js search patterns|failures|decisions "<keyword>"
//   node knowledge-vault.js get pattern|decision|failure|promotion <id>
//   node knowledge-vault.js add decision "<title>" "<context>" "<decision>"
//   node knowledge-vault.js add pattern "<name>" "<category>" "<description>" "<promptTemplate>"
//   node knowledge-vault.js add failure "<taskId>" "<errorType>" "<rootCause>" "<lesson>"
//   node knowledge-vault.js update pattern <id> success|failure
//   node knowledge-vault.js update metrics
//   node knowledge-vault.js log-error "<agentId>" "<errorType>" "<context>" "<lesson>"
//   node knowledge-vault.js check-promotions
//   node knowledge-vault.js list-promotions [pending|approved|rejected|applied]
//   node knowledge-vault.js approve-promotion <id>
//   node knowledge-vault.js reject-promotion <id>
//   node knowledge-vault.js apply-promotions

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || '/data/knowledge';
const FILES = {
  decisions: path.join(KNOWLEDGE_DIR, 'decisions.json'),
  patterns: path.join(KNOWLEDGE_DIR, 'patterns.json'),
  failures: path.join(KNOWLEDGE_DIR, 'failures.json'),
  metrics: path.join(KNOWLEDGE_DIR, 'metrics.json'),
  promotions: path.join(KNOWLEDGE_DIR, 'promotions.json')
};
const TASKS_FILE = process.env.TASKS_FILE || '/data/tasks.json';

// Workspace paths for SOUL.md promotion
// [CUSTOMIZE: Update these to match your agent workspace directory names]
const WORKSPACE_DIR = '/app';
const AGENT_WORKSPACES = {
  'lead-agent': path.join(WORKSPACE_DIR, 'workspace-lead-agent'),
  'engineer-agent': path.join(WORKSPACE_DIR, 'workspace-engineer-agent'),
  'devops-agent': path.join(WORKSPACE_DIR, 'workspace-devops-agent'),
  'docs-agent': path.join(WORKSPACE_DIR, 'workspace-docs-agent')
};

// Stop words for fingerprint generation
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'not', 'no', 'nor', 'so', 'yet', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just',
  'that', 'this', 'these', 'those', 'it', 'its', 'if', 'then', 'else',
  'when', 'where', 'why', 'how', 'all', 'any', 'every', 'about'
]);

// Error type to area mapping
const ERROR_AREA_MAP = {
  'build-error': 'build',
  'test-failure': 'testing',
  'deploy-error': 'infra',
  'merge-conflict': 'git',
  'pipeline-failure': 'ci',
  'permission-error': 'auth',
  'network-error': 'network',
  'timeout-error': 'network',
  'tool-error': 'tools',
  'api-error': 'api',
  'db-error': 'database',
  'git-error': 'git',
  'syntax-error': 'code',
  'type-error': 'code',
  'runtime-error': 'code'
};

// --- Parse arguments ---
const [,, command, ...args] = process.argv;

const VALID_COMMANDS = [
  'read', 'search', 'get', 'add', 'update',
  'log-error', 'check-promotions', 'list-promotions',
  'approve-promotion', 'reject-promotion', 'apply-promotions'
];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('Usage: node knowledge-vault.js <command> [args]');
  console.error('Commands: ' + VALID_COMMANDS.join(', '));
  process.exit(1);
}

// --- File I/O ---
function ensureDir() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
}

function loadFile(type) {
  ensureDir();
  const filePath = FILES[type];
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) {
      const initial = { items: [], nextId: 1 };
      fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('ERROR: Failed to load ' + type + ': ' + err.message);
    return { items: [], nextId: 1 };
  }
}

function saveFile(type, data) {
  ensureDir();
  const filePath = FILES[type];
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function formatId(prefix, num) {
  return prefix + '-' + String(num).padStart(3, '0');
}

// --- Fingerprint Generation ---
function generateFingerprint(errorType, text) {
  const normalized = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const significant = words.slice(0, 3).join('-');
  return (errorType || 'unknown') + ':' + (significant || 'general');
}

// --- Recurrence Detection ---
function findMatchingFailure(data, fingerprint) {
  return data.items.find(item =>
    item.fingerprint === fingerprint && item.status !== 'promoted' && item.status !== 'dismissed'
  );
}

// --- Main ---
switch (command) {

  case 'read': {
    const type = args[0];
    if (!type || !FILES[type]) {
      console.error('Usage: node knowledge-vault.js read decisions|patterns|failures|metrics|promotions');
      process.exit(1);
    }

    const data = loadFile(type);

    console.log('=== KNOWLEDGE: ' + type.toUpperCase() + ' (' + data.items.length + ' entries) ===');
    if (data.items.length === 0) {
      console.log('No entries yet.');
    } else {
      for (const item of data.items) {
        if (type === 'patterns') {
          console.log(item.id + ' [' + item.category + '] ' + item.name +
            ' (used:' + item.usedCount + ', success:' + Math.round(item.successRate * 100) + '%)');
        } else if (type === 'decisions') {
          console.log(item.id + ' ' + item.title + ' (' + item.createdAt.slice(0, 10) + ')');
        } else if (type === 'failures') {
          const recur = item.recurrenceCount ? ' (x' + item.recurrenceCount + ')' : '';
          const status = item.status ? ' [' + item.status + ']' : '';
          console.log(item.id + ' [' + item.errorType + ']' + recur + status + ' ' +
            item.taskId + ': ' + item.lesson.slice(0, 80));
        } else if (type === 'metrics') {
          console.log(JSON.stringify(item));
        } else if (type === 'promotions') {
          console.log(item.id + ' [' + item.status + '] -> ' + item.promotionTarget +
            ': ' + (item.suggestedRule || '').slice(0, 80));
        }
      }
    }
    console.log('=== END KNOWLEDGE ===');
    break;
  }

  case 'search': {
    const type = args[0];
    const keyword = args.slice(1).join(' ').toLowerCase();

    if (!type || !['patterns', 'failures', 'decisions', 'promotions'].includes(type) || !keyword) {
      console.error('Usage: node knowledge-vault.js search patterns|failures|decisions|promotions "<keyword>"');
      process.exit(1);
    }

    const data = loadFile(type);
    const results = data.items.filter(item => {
      const searchable = JSON.stringify(item).toLowerCase();
      return searchable.includes(keyword);
    });

    console.log('=== SEARCH: "' + keyword + '" in ' + type + ' (' + results.length + ' matches) ===');
    for (const item of results) {
      console.log(item.id + ' ' + (item.name || item.title || item.lesson || item.suggestedRule || '').slice(0, 100));
    }
    if (results.length === 0) {
      console.log('No matches found.');
    }
    console.log('=== END SEARCH ===');
    break;
  }

  case 'get': {
    const type = args[0];
    const id = args[1];

    if (!type || !['pattern', 'decision', 'failure', 'promotion'].includes(type) || !id) {
      console.error('Usage: node knowledge-vault.js get pattern|decision|failure|promotion <id>');
      process.exit(1);
    }

    const pluralType = type + 's';
    const data = loadFile(pluralType);
    const item = data.items.find(i => i.id === id.toUpperCase());

    if (!item) {
      console.error('ERROR: ' + type + ' "' + id.toUpperCase() + '" not found.');
      process.exit(1);
    }

    console.log('=== ' + type.toUpperCase() + ': ' + item.id + ' ===');
    console.log(JSON.stringify(item, null, 2));
    console.log('=== END ===');
    break;
  }

  case 'add': {
    const subType = args[0];

    if (!subType || !['decision', 'pattern', 'failure'].includes(subType)) {
      console.error('Usage: node knowledge-vault.js add decision|pattern|failure [args]');
      process.exit(1);
    }

    const now = new Date().toISOString();

    if (subType === 'decision') {
      const title = args[1];
      const context = args[2];
      const decision = args[3];

      if (!title || !context || !decision) {
        console.error('Usage: node knowledge-vault.js add decision "<title>" "<context>" "<decision>"');
        process.exit(1);
      }

      const data = loadFile('decisions');
      const id = formatId('DEC', data.nextId);

      data.items.push({
        id: id,
        title: title,
        context: context,
        decision: decision,
        createdAt: now,
        createdBy: process.env.OPENCLAW_AGENT_ID || 'unknown'
      });
      data.nextId++;
      saveFile('decisions', data);

      console.log('=== DECISION RECORDED ===');
      console.log('ID: ' + id);
      console.log('Title: ' + title);
      console.log('=== END ===');
    }

    else if (subType === 'pattern') {
      const name = args[1];
      const category = args[2];
      const description = args[3];
      const promptTemplate = args[4];

      if (!name || !category || !description) {
        console.error('Usage: node knowledge-vault.js add pattern "<name>" "<category>" "<description>" "<promptTemplate>"');
        process.exit(1);
      }

      const data = loadFile('patterns');
      const id = formatId('PAT', data.nextId);

      data.items.push({
        id: id,
        name: name,
        category: category,
        description: description,
        promptTemplate: promptTemplate || '',
        usedCount: 0,
        successCount: 0,
        successRate: 0,
        createdAt: now,
        createdBy: process.env.OPENCLAW_AGENT_ID || 'unknown'
      });
      data.nextId++;
      saveFile('patterns', data);

      console.log('=== PATTERN RECORDED ===');
      console.log('ID: ' + id);
      console.log('Name: ' + name);
      console.log('Category: ' + category);
      console.log('=== END ===');
    }

    else if (subType === 'failure') {
      const taskId = args[1];
      const errorType = args[2];
      const rootCause = args[3];
      const lesson = args[4];

      if (!taskId || !errorType || !rootCause || !lesson) {
        console.error('Usage: node knowledge-vault.js add failure "<taskId>" "<errorType>" "<rootCause>" "<lesson>"');
        process.exit(1);
      }

      const data = loadFile('failures');
      const fingerprint = generateFingerprint(errorType, rootCause);
      const existing = findMatchingFailure(data, fingerprint);

      if (existing) {
        // Recurrence — increment existing entry
        existing.recurrenceCount = (existing.recurrenceCount || 1) + 1;
        if (!existing.recurrenceTasks) existing.recurrenceTasks = [existing.taskId];
        if (!existing.recurrenceTasks.includes(taskId)) {
          existing.recurrenceTasks.push(taskId);
        }
        existing.lastSeen = now;
        // Append lesson if different
        if (existing.lesson !== lesson) {
          existing.lesson = existing.lesson + ' | ' + lesson;
        }
        saveFile('failures', data);

        console.log('=== RECURRING FAILURE DETECTED ===');
        console.log('ID: ' + existing.id);
        console.log('Fingerprint: ' + fingerprint);
        console.log('Recurrence: ' + existing.recurrenceCount + ' times across ' + existing.recurrenceTasks.length + ' tasks');
        console.log('=== END ===');
      } else {
        // New failure entry with recurrence tracking fields
        const id = formatId('FAIL', data.nextId);
        const agentId = process.env.OPENCLAW_AGENT_ID || 'unknown';

        data.items.push({
          id: id,
          taskId: taskId,
          errorType: errorType,
          rootCause: rootCause,
          lesson: lesson,
          prevention: '',
          fingerprint: fingerprint,
          recurrenceCount: 1,
          recurrenceTasks: [taskId],
          firstSeen: now,
          lastSeen: now,
          status: 'active',
          promotionTarget: agentId,
          area: ERROR_AREA_MAP[errorType] || 'general',
          createdAt: now,
          createdBy: agentId
        });
        data.nextId++;
        saveFile('failures', data);

        console.log('=== FAILURE LESSON RECORDED ===');
        console.log('ID: ' + id);
        console.log('Task: ' + taskId);
        console.log('Error: ' + errorType);
        console.log('Fingerprint: ' + fingerprint);
        console.log('Lesson: ' + lesson);
        console.log('=== END ===');
      }
    }
    break;
  }

  case 'log-error': {
    // Simplified API for safe-exec.sh auto-logging
    const agentId = args[0];
    const errorType = args[1];
    const context = args[2];
    const lesson = args[3];

    if (!agentId || !errorType || !context) {
      console.error('Usage: node knowledge-vault.js log-error "<agentId>" "<errorType>" "<context>" "<lesson>"');
      process.exit(1);
    }

    const now = new Date().toISOString();
    const taskId = process.env.OPENCLAW_SESSION_ID || 'auto-' + Date.now();
    const fingerprint = generateFingerprint(errorType, context);
    const data = loadFile('failures');
    const existing = findMatchingFailure(data, fingerprint);

    if (existing) {
      existing.recurrenceCount = (existing.recurrenceCount || 1) + 1;
      if (!existing.recurrenceTasks) existing.recurrenceTasks = [existing.taskId];
      if (!existing.recurrenceTasks.includes(taskId)) {
        existing.recurrenceTasks.push(taskId);
      }
      existing.lastSeen = now;
      saveFile('failures', data);

      console.log('LEARN: Recurring error (' + existing.id + ', x' + existing.recurrenceCount + '): ' + errorType);
    } else {
      const id = formatId('FAIL', data.nextId);
      data.items.push({
        id: id,
        taskId: taskId,
        errorType: errorType,
        rootCause: context,
        lesson: lesson || 'Auto-captured: ' + errorType + ' in ' + context,
        prevention: '',
        fingerprint: fingerprint,
        recurrenceCount: 1,
        recurrenceTasks: [taskId],
        firstSeen: now,
        lastSeen: now,
        status: 'active',
        promotionTarget: agentId,
        area: ERROR_AREA_MAP[errorType] || 'general',
        createdAt: now,
        createdBy: agentId
      });
      data.nextId++;
      saveFile('failures', data);

      console.log('LEARN: New error logged (' + id + '): ' + errorType + ' — ' + (context || '').slice(0, 60));
    }
    break;
  }

  case 'check-promotions': {
    const failures = loadFile('failures');
    const promotions = loadFile('promotions');
    const now = new Date();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    let newCount = 0;

    for (const failure of failures.items) {
      // Skip entries without recurrence tracking (legacy entries)
      if (!failure.recurrenceCount) continue;

      // Check threshold: 3+ recurrences, 2+ different tasks, active status, >24h old
      if (
        failure.recurrenceCount >= 3 &&
        (failure.recurrenceTasks || []).length >= 2 &&
        failure.status === 'active' &&
        failure.firstSeen &&
        (now - new Date(failure.firstSeen)) >= ONE_DAY_MS
      ) {
        // Check if promotion already exists for this fingerprint
        const existingPromo = promotions.items.find(p => p.fingerprint === failure.fingerprint);
        if (existingPromo) continue;

        // Create promotion candidate
        const id = formatId('PROMO', promotions.nextId);
        promotions.items.push({
          id: id,
          sourceId: failure.id,
          sourceType: 'failure',
          fingerprint: failure.fingerprint,
          recurrenceCount: failure.recurrenceCount,
          recurrenceTasks: failure.recurrenceTasks || [],
          promotionTarget: failure.promotionTarget || 'unknown',
          suggestedRule: failure.lesson,
          status: 'pending',
          createdAt: now.toISOString(),
          reviewedAt: null,
          reviewedBy: null,
          appliedAt: null
        });
        promotions.nextId++;
        newCount++;
      }
    }

    saveFile('promotions', promotions);

    const pending = promotions.items.filter(p => p.status === 'pending');
    console.log('=== PROMOTION CHECK ===');
    console.log('New candidates: ' + newCount);
    console.log('Total pending: ' + pending.length);
    if (pending.length > 0) {
      for (const p of pending) {
        console.log(p.id + ' -> ' + p.promotionTarget + ' (x' + p.recurrenceCount +
          ', ' + p.recurrenceTasks.length + ' tasks): ' + (p.suggestedRule || '').slice(0, 80));
      }
    }
    console.log('=== END ===');
    break;
  }

  case 'list-promotions': {
    const statusFilter = args[0]; // optional: pending, approved, rejected, applied
    const promotions = loadFile('promotions');

    const filtered = statusFilter
      ? promotions.items.filter(p => p.status === statusFilter)
      : promotions.items;

    const label = statusFilter ? statusFilter.toUpperCase() : 'ALL';
    console.log('=== PROMOTIONS: ' + label + ' (' + filtered.length + ' entries) ===');
    if (filtered.length === 0) {
      console.log('No promotions found.');
    } else {
      for (const p of filtered) {
        console.log(p.id + ' [' + p.status + '] -> ' + p.promotionTarget +
          ' (x' + p.recurrenceCount + ', source: ' + p.sourceId + ')');
        console.log('  Rule: ' + (p.suggestedRule || '').slice(0, 100));
      }
    }
    console.log('=== END ===');
    break;
  }

  case 'approve-promotion': {
    const promoId = args[0];
    if (!promoId) {
      console.error('Usage: node knowledge-vault.js approve-promotion <id>');
      process.exit(1);
    }

    const promotions = loadFile('promotions');
    const promo = promotions.items.find(p => p.id === promoId.toUpperCase());

    if (!promo) {
      console.error('ERROR: Promotion "' + promoId.toUpperCase() + '" not found.');
      process.exit(1);
    }
    if (promo.status !== 'pending') {
      console.error('ERROR: Promotion is already ' + promo.status + ' (not pending).');
      process.exit(1);
    }

    promo.status = 'approved';
    promo.reviewedAt = new Date().toISOString();
    promo.reviewedBy = process.env.OPENCLAW_AGENT_ID || 'lead-agent';
    saveFile('promotions', promotions);

    console.log('=== PROMOTION APPROVED ===');
    console.log('ID: ' + promo.id);
    console.log('Target: ' + promo.promotionTarget);
    console.log('Rule: ' + (promo.suggestedRule || '').slice(0, 100));
    console.log('Run "apply-promotions" to write to SOUL.md files.');
    console.log('=== END ===');
    break;
  }

  case 'reject-promotion': {
    const promoId = args[0];
    if (!promoId) {
      console.error('Usage: node knowledge-vault.js reject-promotion <id>');
      process.exit(1);
    }

    const promotions = loadFile('promotions');
    const promo = promotions.items.find(p => p.id === promoId.toUpperCase());

    if (!promo) {
      console.error('ERROR: Promotion "' + promoId.toUpperCase() + '" not found.');
      process.exit(1);
    }
    if (promo.status !== 'pending') {
      console.error('ERROR: Promotion is already ' + promo.status + ' (not pending).');
      process.exit(1);
    }

    promo.status = 'rejected';
    promo.reviewedAt = new Date().toISOString();
    promo.reviewedBy = process.env.OPENCLAW_AGENT_ID || 'lead-agent';
    saveFile('promotions', promotions);

    // Mark source failure as dismissed
    const failures = loadFile('failures');
    const sourceFailure = failures.items.find(f => f.id === promo.sourceId);
    if (sourceFailure) {
      sourceFailure.status = 'dismissed';
      saveFile('failures', failures);
    }

    console.log('=== PROMOTION REJECTED ===');
    console.log('ID: ' + promo.id);
    console.log('Source failure ' + promo.sourceId + ' marked as dismissed.');
    console.log('=== END ===');
    break;
  }

  case 'apply-promotions': {
    const promotions = loadFile('promotions');
    const approved = promotions.items.filter(p => p.status === 'approved');

    if (approved.length === 0) {
      console.log('=== APPLY PROMOTIONS ===');
      console.log('No approved promotions to apply.');
      console.log('=== END ===');
      break;
    }

    const now = new Date().toISOString();
    const applied = [];

    for (const promo of approved) {
      const targetAgent = promo.promotionTarget;
      const workspace = AGENT_WORKSPACES[targetAgent];

      if (!workspace) {
        console.error('WARNING: No workspace found for agent "' + targetAgent + '". Skipping ' + promo.id);
        continue;
      }

      const soulPath = path.join(workspace, 'SOUL.md');
      if (!fs.existsSync(soulPath)) {
        console.error('WARNING: SOUL.md not found at ' + soulPath + '. Skipping ' + promo.id);
        continue;
      }

      let content = fs.readFileSync(soulPath, 'utf8');

      // Find or create the Learned Rules section
      const SECTION_HEADER = '## Learned Rules (Auto-Promoted)';
      let sectionIndex = content.indexOf(SECTION_HEADER);

      const ruleEntry = '\n- **[' + now.slice(0, 10) + ']** ' +
        (promo.suggestedRule || 'No rule text').replace(/\n/g, ' ').slice(0, 200) +
        ' _(source: ' + promo.sourceId + ', ' + promo.recurrenceCount + 'x across ' +
        promo.recurrenceTasks.length + ' tasks)_';

      if (sectionIndex === -1) {
        // Create section at end of file
        content = content.trimEnd() + '\n\n' + SECTION_HEADER + '\n' + ruleEntry + '\n';
      } else {
        // Append to existing section
        const insertPos = content.indexOf('\n## ', sectionIndex + SECTION_HEADER.length);
        if (insertPos === -1) {
          // No section after — append to end
          content = content.trimEnd() + ruleEntry + '\n';
        } else {
          // Insert before next section
          content = content.slice(0, insertPos) + ruleEntry + '\n' + content.slice(insertPos);
        }
      }

      fs.writeFileSync(soulPath, content);

      // Update promotion status
      promo.status = 'applied';
      promo.appliedAt = now;
      applied.push({ id: promo.id, target: targetAgent, rule: (promo.suggestedRule || '').slice(0, 60) });

      // Mark source failure as promoted
      const failures = loadFile('failures');
      const sourceFailure = failures.items.find(f => f.id === promo.sourceId);
      if (sourceFailure) {
        sourceFailure.status = 'promoted';
        saveFile('failures', failures);
      }
    }

    saveFile('promotions', promotions);

    console.log('=== PROMOTIONS APPLIED ===');
    console.log('Applied: ' + applied.length + ' rules');
    for (const a of applied) {
      console.log(a.id + ' -> ' + a.target + '/SOUL.md: ' + a.rule);
    }
    console.log('=== END ===');
    break;
  }

  case 'update': {
    const subType = args[0];

    if (!subType || !['pattern', 'metrics'].includes(subType)) {
      console.error('Usage: node knowledge-vault.js update pattern <id> success|failure');
      console.error('       node knowledge-vault.js update metrics');
      process.exit(1);
    }

    if (subType === 'pattern') {
      const patternId = args[1];
      const outcome = args[2];

      if (!patternId || !outcome || !['success', 'failure'].includes(outcome)) {
        console.error('Usage: node knowledge-vault.js update pattern <id> success|failure');
        process.exit(1);
      }

      const data = loadFile('patterns');
      const pattern = data.items.find(p => p.id === patternId.toUpperCase());

      if (!pattern) {
        console.error('ERROR: Pattern "' + patternId.toUpperCase() + '" not found.');
        process.exit(1);
      }

      pattern.usedCount++;
      if (outcome === 'success') pattern.successCount++;
      pattern.successRate = pattern.usedCount > 0
        ? pattern.successCount / pattern.usedCount
        : 0;

      saveFile('patterns', data);

      console.log('=== PATTERN UPDATED ===');
      console.log('ID: ' + pattern.id);
      console.log('Name: ' + pattern.name);
      console.log('Used: ' + pattern.usedCount + ', Success: ' + pattern.successCount +
        ', Rate: ' + Math.round(pattern.successRate * 100) + '%');
      console.log('=== END ===');
    }

    else if (subType === 'metrics') {
      // Recalculate metrics from tasks.json
      let tasks = [];
      try {
        if (fs.existsSync(TASKS_FILE)) {
          const taskData = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
          tasks = taskData.tasks || [];
        }
      } catch (err) {
        console.error('WARNING: Could not read tasks: ' + err.message);
      }

      const agentStats = {};
      for (const task of tasks) {
        const agent = task.assignee || 'unassigned';
        if (!agentStats[agent]) {
          agentStats[agent] = { total: 0, done: 0, open: 0, inProgress: 0, blocked: 0, retries: 0 };
        }
        agentStats[agent].total++;
        if (task.status === 'done') agentStats[agent].done++;
        else if (task.status === 'open') agentStats[agent].open++;
        else if (task.status === 'in-progress') agentStats[agent].inProgress++;
        else if (task.status === 'blocked') agentStats[agent].blocked++;

        // Count retries from history
        const retries = (task.history || []).filter(h => h.note && h.note.startsWith('RETRY:')).length;
        agentStats[agent].retries += retries;
      }

      const metricsData = {
        items: Object.entries(agentStats).map(([agent, stats]) => ({
          agent: agent,
          totalTasks: stats.total,
          completedTasks: stats.done,
          openTasks: stats.open,
          inProgressTasks: stats.inProgress,
          blockedTasks: stats.blocked,
          totalRetries: stats.retries,
          completionRate: stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
        })),
        nextId: 1,
        lastUpdated: new Date().toISOString()
      };

      saveFile('metrics', metricsData);

      console.log('=== METRICS UPDATED ===');
      for (const m of metricsData.items) {
        console.log(m.agent + ': ' + m.completedTasks + '/' + m.totalTasks + ' done (' +
          m.completionRate + '%), ' + m.totalRetries + ' retries');
      }
      console.log('Last updated: ' + metricsData.lastUpdated);
      console.log('=== END METRICS ===');
    }
    break;
  }
}
