// Auto-create Discord channels for your AI dev team
// Usage: DISCORD_BOT_TOKEN=xxx DISCORD_GUILD_ID=xxx node identity/create-channels.js

const https = require('https');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!BOT_TOKEN) { console.error('DISCORD_BOT_TOKEN not set'); process.exit(1); }
if (!GUILD_ID) { console.error('DISCORD_GUILD_ID not set'); process.exit(1); }

const CHANNELS_TO_CREATE = [
  { name: 'dev-tasks', envVar: 'DISCORD_DEV_TASKS_CHANNEL_ID', description: 'Task intake from project owner' },
  { name: 'dev-work', envVar: 'DISCORD_DEV_WORK_CHANNEL_ID', description: 'All coordination, progress, questions' },
  { name: 'dev-reviews', envVar: 'DISCORD_DEV_REVIEWS_CHANNEL_ID', description: 'MR reviews and approvals' },
  { name: 'dev-alerts', envVar: 'DISCORD_DEV_ALERTS_CHANNEL_ID', description: 'Deploy status + critical alerts' }
];

function discordApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'discord.com',
      path: '/api/v10' + path,
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
        if (res.statusCode >= 400) reject(new Error(`Discord API ${method} ${path}: ${res.statusCode} ${data}`));
        else resolve(data ? JSON.parse(data) : null);
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('Creating Discord channels for AI dev team...\n');

  const existing = await discordApi('GET', `/guilds/${GUILD_ID}/channels`);
  const existingMap = new Map(existing.map(c => [c.name, c.id]));
  const results = [];

  for (const channel of CHANNELS_TO_CREATE) {
    try {
      let channelId;
      if (existingMap.has(channel.name)) {
        channelId = existingMap.get(channel.name);
        console.log(`#${channel.name} already exists (${channelId})`);
      } else {
        const created = await discordApi('POST', `/guilds/${GUILD_ID}/channels`, {
          name: channel.name, type: 0, topic: channel.description
        });
        channelId = created.id;
        console.log(`Created #${channel.name} (${channelId})`);
        await new Promise(r => setTimeout(r, 500));
      }
      results.push({ name: channel.name, envVar: channel.envVar, channelId });
    } catch (err) {
      console.error(`Failed to create #${channel.name}: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Add these to your .env file:');
  console.log('='.repeat(60) + '\n');
  for (const r of results) console.log(`${r.envVar}=${r.channelId}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
