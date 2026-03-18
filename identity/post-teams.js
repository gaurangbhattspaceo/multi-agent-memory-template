#!/usr/bin/env node
// Microsoft Teams webhook poster — sends rich Adaptive Card
// Usage: node /app/identity/post-teams.js "title" "summary" "tasks" "health"
//
// Each argument is a text block. Empty strings are omitted from the card.
// Webhook URL comes from TEAMS_WEBHOOK_URL env var.

const https = require('https');
const http = require('http');

const [,, title, summary, tasks, health] = process.argv;

if (!title) {
  console.error('Usage: node post-teams.js "title" "summary" "tasks" "health"');
  process.exit(1);
}

const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
if (!webhookUrl) {
  console.error('ERROR: TEAMS_WEBHOOK_URL environment variable not set');
  process.exit(1);
}

function splitLines(text) {
  if (!text) return [];
  return text.replace(/\\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
}

function statusIcon(line) {
  const lower = line.toLowerCase();
  if (lower.includes('[done]') || lower.includes('[completed]') || lower.includes('completed'))
    return { icon: '\u2705', color: 'good' };
  if (lower.includes('[review]') || lower.includes('review'))
    return { icon: '\uD83D\uDD0D', color: 'warning' };
  if (lower.includes('[blocked]') || lower.includes('blocked'))
    return { icon: '\uD83D\uDED1', color: 'attention' };
  if (lower.includes('[in-progress]') || lower.includes('in-progress'))
    return { icon: '\u23F3', color: 'accent' };
  if (lower.includes('[open]') || lower.includes('open'))
    return { icon: '\uD83D\uDCCB', color: 'default' };
  return { icon: '\u2022', color: 'default' };
}

const timestamp = new Date().toLocaleString('en-US', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
});

const body = [];

// Header
body.push({
  type: 'Container', style: 'accent', bleed: true,
  items: [
    { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: title, wrap: true },
    { type: 'TextBlock', text: timestamp, isSubtle: true, spacing: 'None', size: 'Small' }
  ]
});

// Work Summary
if (summary && summary.trim()) {
  body.push({
    type: 'Container', spacing: 'Medium',
    items: [
      {
        type: 'ColumnSet', columns: [
          { type: 'Column', width: 'auto', items: [{ type: 'TextBlock', text: '\uD83D\uDCCA', size: 'Medium' }] },
          { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: 'Work Summary', weight: 'Bolder', size: 'Medium' }] }
        ]
      },
      ...splitLines(summary).map((line, i) => ({
        type: 'TextBlock', text: '\u2022 ' + line.replace(/^[-\u2022]\s*/, ''), wrap: true, spacing: i === 0 ? 'Small' : 'None'
      }))
    ]
  });
}

// Pending Tasks
if (tasks && tasks.trim()) {
  const taskLines = splitLines(tasks);
  const taskItems = [{
    type: 'ColumnSet', columns: [
      { type: 'Column', width: 'auto', items: [{ type: 'TextBlock', text: '\uD83D\uDCCB', size: 'Medium' }] },
      { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: 'Pending Tasks', weight: 'Bolder', size: 'Medium' }] }
    ]
  }];
  for (const line of taskLines) {
    if (line.endsWith(':') && !line.includes('\u2014') && !line.includes('TASK-')) {
      taskItems.push({ type: 'TextBlock', text: '**' + line + '**', spacing: 'Small', wrap: true, size: 'Small', isSubtle: true });
      continue;
    }
    const { icon } = statusIcon(line);
    const cleanLine = line.replace(/^[-\u2022]\s*/, '').replace(/\[(done|completed|review|blocked|in-progress|open)\]\s*/i, '');
    taskItems.push({
      type: 'ColumnSet', spacing: 'Small', columns: [
        { type: 'Column', width: '24px', items: [{ type: 'TextBlock', text: icon, horizontalAlignment: 'Center' }] },
        { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: cleanLine, wrap: true, size: 'Small' }] }
      ]
    });
  }
  body.push({ type: 'Container', spacing: 'Medium', separator: true, items: taskItems });
}

// System Health
if (health && health.trim()) {
  const healthLower = health.toLowerCase();
  let healthIcon = '\u2705';
  if (healthLower.includes('issue') || healthLower.includes('error') || healthLower.includes('down'))
    healthIcon = '\u26A0\uFE0F';
  if (healthLower.includes('critical') || healthLower.includes('offline'))
    healthIcon = '\uD83D\uDED1';
  body.push({
    type: 'Container', spacing: 'Medium', separator: true,
    items: [{
      type: 'ColumnSet', columns: [
        { type: 'Column', width: 'auto', items: [{ type: 'TextBlock', text: healthIcon, size: 'Medium' }] },
        { type: 'Column', width: 'stretch', items: [
          { type: 'TextBlock', text: 'System Health', weight: 'Bolder', size: 'Medium' },
          { type: 'TextBlock', text: health.replace(/\\n/g, '\n'), wrap: true, spacing: 'None', size: 'Small' }
        ]}
      ]
    }]
  });
}

// Footer
body.push({
  type: 'Container', spacing: 'Medium', separator: true,
  items: [{ type: 'TextBlock', text: 'AI Dev Team', isSubtle: true, size: 'Small', horizontalAlignment: 'Right' }]
});

const payload = JSON.stringify({
  type: 'message',
  attachments: [{
    contentType: 'application/vnd.microsoft.card.adaptive',
    contentUrl: null,
    content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body }
  }]
});

const url = new URL(webhookUrl);
const transport = url.protocol === 'https:' ? https : http;

const req = transport.request({
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname + url.search,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
}, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 400) { console.error('Teams API error ' + res.statusCode + ': ' + data.slice(0, 500)); process.exit(1); }
    console.log('Posted to Microsoft Teams (status ' + res.statusCode + ')');
  });
});

req.on('error', err => { console.error('Request error: ' + err.message); process.exit(1); });
req.write(payload);
req.end();
