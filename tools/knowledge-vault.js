#!/usr/bin/env node
/**
 * Knowledge Vault — Self-Learning System for Multi-Agent Teams
 *
 * Stores patterns, failures, decisions, and promotion candidates.
 * Provides fingerprinting, recurrence tracking, and auto-promotion.
 *
 * Usage:
 *   node knowledge-vault.js <command> [args...]
 *
 * Commands:
 *   read <store>                           Read entire store (patterns|failures|decisions|promotions)
 *   search <store> <keyword>              Search store by keyword
 *   add pattern <name> <cat> <desc> <tpl> Add a successful pattern
 *   add failure <taskId> <type> <cause> <lesson>  Log a failure with lesson
 *   add decision <title> <ctx> <decision> Record an architecture decision
 *   log-error <agentId> <tool> <code> <ctx>  Auto-log from safe-exec.sh wrapper
 *   check-promotions                       Detect promotion candidates (3+ recurrences)
 *   list-promotions <status>               List promotions by status
 *   approve-promotion <id>                 Approve a promotion candidate
 *   reject-promotion <id>                  Reject a promotion candidate
 *   apply-promotions                       Write approved rules to SOUL.md files
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || '/data/knowledge';
const STORES = {
  patterns: path.join(KNOWLEDGE_DIR, 'patterns.json'),
  failures: path.join(KNOWLEDGE_DIR, 'failures.json'),
  decisions: path.join(KNOWLEDGE_DIR, 'decisions.json'),
  promotions: path.join(KNOWLEDGE_DIR, 'promotions.json'),
};

// ─── Helpers ────────────────────────────────────────────────────────

function readStore(name) {
  const file = STORES[name];
  if (!file) { console.error(`Unknown store: ${name}`); process.exit(1); }
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeStore(name, data) {
  const file = STORES[name];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nextId(store, prefix) {
  const items = readStore(store);
  const maxNum = items.reduce((max, item) => {
    const num = parseInt(item.id.replace(`${prefix}-`, ''), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}

function generateFingerprint(errorType, context) {
  // Extract significant keywords from context (skip common words)
  const stopWords = new Set(['the', 'a', 'is', 'in', 'at', 'of', 'to', 'for', 'on', 'error', 'failed']);
  const words = context.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 3)
    .join('-');
  return `${errorType}:${words || 'unknown'}`;
}

// ─── Commands ───────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'read': {
    const [store] = args;
    const data = readStore(store);
    console.log(JSON.stringify(data, null, 2));
    break;
  }

  case 'search': {
    const [store, ...keywords] = args;
    const keyword = keywords.join(' ').toLowerCase();
    const data = readStore(store);
    const results = data.filter(item =>
      JSON.stringify(item).toLowerCase().includes(keyword)
    );
    console.log(JSON.stringify(results, null, 2));
    console.log(`\n${results.length} result(s) found.`);
    break;
  }

  case 'add': {
    const [type, ...addArgs] = args;
    switch (type) {
      case 'pattern': {
        const [name, category, description, promptTemplate] = addArgs;
        const patterns = readStore('patterns');
        const id = nextId('patterns', 'PAT');
        patterns.push({
          id, name, category, description, promptTemplate,
          usedCount: 0, successCount: 0, successRate: 0,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        });
        writeStore('patterns', patterns);
        console.log(`Pattern ${id} added: ${name}`);
        break;
      }
      case 'failure': {
        const [taskId, errorType, rootCause, lesson] = addArgs;
        const failures = readStore('failures');
        const fingerprint = generateFingerprint(errorType, rootCause);

        // Check for existing fingerprint (recurrence tracking)
        const existing = failures.find(f => f.fingerprint === fingerprint);
        if (existing) {
          existing.recurrenceCount = (existing.recurrenceCount || 1) + 1;
          existing.tasks = existing.tasks || [existing.taskId];
          if (!existing.tasks.includes(taskId)) existing.tasks.push(taskId);
          existing.lastSeenAt = new Date().toISOString();
          writeStore('failures', failures);
          console.log(`Failure ${existing.id} recurrence #${existing.recurrenceCount}: ${fingerprint}`);
        } else {
          const id = nextId('failures', 'FAIL');
          failures.push({
            id, taskId, errorType, fingerprint,
            recurrenceCount: 1,
            rootCause, lesson,
            tasks: [taskId],
            status: 'open',
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
          writeStore('failures', failures);
          console.log(`Failure ${id} logged: ${fingerprint}`);
        }
        break;
      }
      case 'decision': {
        const [title, context, decision] = addArgs;
        const decisions = readStore('decisions');
        const id = nextId('decisions', 'DEC');
        decisions.push({
          id, title, context, decision,
          createdAt: new Date().toISOString(),
        });
        writeStore('decisions', decisions);
        console.log(`Decision ${id} recorded: ${title}`);
        break;
      }
      default:
        console.error(`Unknown add type: ${type}. Use: pattern, failure, decision`);
        process.exit(1);
    }
    break;
  }

  case 'log-error': {
    // Called automatically by safe-exec.sh run_and_learn wrapper
    const [agentId, toolName, exitCode, errorContext] = args;
    const failures = readStore('failures');
    const errorType = `tool-${toolName}`;
    const fingerprint = generateFingerprint(errorType, errorContext || '');

    const existing = failures.find(f => f.fingerprint === fingerprint);
    if (existing) {
      existing.recurrenceCount = (existing.recurrenceCount || 1) + 1;
      existing.lastSeenAt = new Date().toISOString();
      existing.lastAgent = agentId;
      writeStore('failures', failures);
    } else {
      const id = nextId('failures', 'FAIL');
      failures.push({
        id,
        taskId: 'auto',
        errorType,
        fingerprint,
        recurrenceCount: 1,
        rootCause: `Tool ${toolName} exited with code ${exitCode}`,
        lesson: `Auto-captured: ${(errorContext || '').substring(0, 200)}`,
        tasks: ['auto'],
        status: 'open',
        agent: agentId,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      });
      writeStore('failures', failures);
    }
    break;
  }

  case 'check-promotions': {
    const failures = readStore('failures');
    const promotions = readStore('promotions');
    const existingFails = new Set(promotions.map(p => p.failureId));

    const candidates = failures.filter(f =>
      f.recurrenceCount >= 3 &&
      (f.tasks || []).length >= 2 &&
      !existingFails.has(f.id) &&
      f.status === 'open' &&
      // Must be at least 24h old
      (Date.now() - new Date(f.createdAt).getTime()) > 24 * 60 * 60 * 1000
    );

    if (candidates.length === 0) {
      console.log('No new promotion candidates found.');
    } else {
      for (const c of candidates) {
        const id = nextId('promotions', 'PROMO');
        promotions.push({
          id,
          failureId: c.id,
          status: 'pending',
          suggestedRule: c.lesson,
          recurrences: c.recurrenceCount,
          tasks: c.tasks,
          firstSeenAt: c.createdAt,
          detectedAt: new Date().toISOString(),
        });
        console.log(`Promotion candidate ${id}: "${c.lesson}" (${c.recurrenceCount} recurrences)`);
      }
      writeStore('promotions', promotions);
    }
    break;
  }

  case 'list-promotions': {
    const [status] = args;
    const promotions = readStore('promotions');
    const filtered = status ? promotions.filter(p => p.status === status) : promotions;
    console.log(JSON.stringify(filtered, null, 2));
    console.log(`\n${filtered.length} promotion(s) ${status ? `with status '${status}'` : 'total'}.`);
    break;
  }

  case 'approve-promotion': {
    const [promoId] = args;
    const promotions = readStore('promotions');
    const promo = promotions.find(p => p.id === promoId);
    if (!promo) { console.error(`Promotion ${promoId} not found`); process.exit(1); }
    promo.status = 'approved';
    promo.evaluatedAt = new Date().toISOString();
    writeStore('promotions', promotions);
    console.log(`Promotion ${promoId} approved. Run 'apply-promotions' to write to SOUL.md.`);
    break;
  }

  case 'reject-promotion': {
    const [promoId] = args;
    const promotions = readStore('promotions');
    const promo = promotions.find(p => p.id === promoId);
    if (!promo) { console.error(`Promotion ${promoId} not found`); process.exit(1); }
    promo.status = 'rejected';
    promo.evaluatedAt = new Date().toISOString();
    writeStore('promotions', promotions);
    console.log(`Promotion ${promoId} rejected.`);
    break;
  }

  case 'apply-promotions': {
    const promotions = readStore('promotions');
    const approved = promotions.filter(p => p.status === 'approved');

    if (approved.length === 0) {
      console.log('No approved promotions to apply.');
      break;
    }

    // Find all agent SOUL.md files
    const workspaceDir = '/app';
    const agentDirs = fs.readdirSync(workspaceDir)
      .filter(d => d.startsWith('workspace-'))
      .map(d => path.join(workspaceDir, d, 'SOUL.md'))
      .filter(f => fs.existsSync(f));

    for (const soulFile of agentDirs) {
      let content = fs.readFileSync(soulFile, 'utf8');
      const sectionHeader = '## Learned Rules (Auto-Promoted)';

      // Ensure section exists
      if (!content.includes(sectionHeader)) {
        content += `\n\n${sectionHeader}\n`;
      }

      // Append approved rules
      for (const promo of approved) {
        const date = new Date().toISOString().split('T')[0];
        const rule = `\n- **[${date}]** ${promo.suggestedRule} (Source: ${promo.failureId}, ${promo.recurrences} occurrences)`;

        if (!content.includes(promo.suggestedRule)) {
          content = content.replace(sectionHeader, `${sectionHeader}${rule}`);
        }

        promo.status = 'applied';
        promo.appliedAt = new Date().toISOString();
      }

      fs.writeFileSync(soulFile, content);
    }

    writeStore('promotions', promotions);
    console.log(`Applied ${approved.length} rule(s) to ${agentDirs.length} agent SOUL.md files.`);
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    console.error('Commands: read, search, add, log-error, check-promotions, list-promotions, approve-promotion, reject-promotion, apply-promotions');
    process.exit(1);
}
