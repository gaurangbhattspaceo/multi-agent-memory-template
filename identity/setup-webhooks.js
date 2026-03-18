// Auto-create Discord webhooks for your team channels
// Stores webhook URLs in /app/identity/webhooks.json

const https = require('https');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!BOT_TOKEN) { console.error('DISCORD_BOT_TOKEN not set, skipping webhook setup'); process.exit(0); }

const CHANNEL_MAP = {
  'dev-tasks': 'DISCORD_DEV_TASKS_CHANNEL_ID',
  'dev-work': 'DISCORD_DEV_WORK_CHANNEL_ID',
  'dev-reviews': 'DISCORD_DEV_REVIEWS_CHANNEL_ID',
  'dev-alerts': 'DISCORD_DEV_ALERTS_CHANNEL_ID'
};

const CONFIG_PATH = path.join(__dirname, 'webhooks.json');

function discordApi(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: '/api/v10' + apiPath,
      method: method,
      headers: {
        'Authorization': 'Bot ' + BOT_TOKEN,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Discord API ${method} ${apiPath}: ${res.statusCode} ${data}`));
        else resolve(data ? JSON.parse(data) : null);
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getOrCreateWebhook(channelId) {
  const existing = await discordApi('GET', `/channels/${channelId}/webhooks`);
  const ours = existing.find(w => w.name === 'AI Dev Agent');
  if (ours) return `https://discord.com/api/webhooks/${ours.id}/${ours.token}`;
  const created = await discordApi('POST', `/channels/${channelId}/webhooks`, { name: 'AI Dev Agent' });
  return `https://discord.com/api/webhooks/${created.id}/${created.token}`;
}

async function main() {
  let config;
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { config = { webhooks: {}, identities: {} }; }

  config.webhooks = {};

  // Customize these identities for your team
  config.identities = {
    'lead-agent': {
      username: 'Lead Agent',
      avatar_url: 'https://api.dicebear.com/9.x/big-smile/svg?seed=lead-agent&backgroundColor=b6e3f4&radius=50'
    },
    'engineer-agent': {
      username: 'Engineer Agent',
      avatar_url: 'https://api.dicebear.com/9.x/big-smile/svg?seed=engineer-agent&backgroundColor=ffd5b4&radius=50'
    },
    'devops-agent': {
      username: 'DevOps Agent',
      avatar_url: 'https://api.dicebear.com/9.x/big-smile/svg?seed=devops-agent&backgroundColor=d1f4e0&radius=50'
    },
    'docs-agent': {
      username: 'Docs Agent',
      avatar_url: 'https://api.dicebear.com/9.x/big-smile/svg?seed=docs-agent&backgroundColor=e8d5f5&radius=50'
    },
    'ops-monitor': {
      username: 'Ops Monitor',
      avatar_url: 'https://api.dicebear.com/9.x/big-smile/svg?seed=ops-monitor&backgroundColor=f5e6d5&radius=50'
    }
  };

  let created = 0, skipped = 0, failed = 0;

  for (const [channelName, envVar] of Object.entries(CHANNEL_MAP)) {
    const channelId = process.env[envVar];
    if (!channelId) { console.log(`  skip ${channelName}: ${envVar} not set`); skipped++; continue; }

    try {
      const url = await getOrCreateWebhook(channelId);
      config.webhooks[channelName] = url;
      console.log(`  webhook ${channelName}: ready`);
      created++;
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`  webhook ${channelName}: FAILED - ${err.message}`);
      failed++;
    }
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Webhooks: ${created} ready, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => { console.error('Webhook setup error:', err.message); process.exit(0); });
