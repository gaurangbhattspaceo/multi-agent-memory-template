// Discord webhook poster with agent identity and message chunking
// Usage: node /app/identity/post.js <agent> <channel> "message"
const fs = require('fs');
const https = require('https');

const [,, agent, channel, ...msgParts] = process.argv;
const message = msgParts.join(' ');

if (!agent || !channel || !message) {
  console.error('Usage: node /app/identity/post.js <agent> <channel> "message"');
  process.exit(1);
}

const configPath = '/app/identity/webhooks.json';
if (!fs.existsSync(configPath)) {
  console.error('Webhook config not found at ' + configPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const webhookUrl = config.webhooks[channel];
const identity = config.identities[agent] || { username: agent, avatar_url: '' };

if (!webhookUrl) {
  console.error('No webhook configured for channel: ' + channel);
  process.exit(1);
}

// Split messages at 2000 char Discord limit
const chunks = [];
for (let i = 0; i < message.length; i += 1990) {
  chunks.push(message.slice(i, i + 1990));
}

function post(content) {
  const body = JSON.stringify({
    username: identity.username,
    avatar_url: identity.avatar_url || undefined,
    content: content
  });
  const url = new URL(webhookUrl);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error('Discord API error ' + res.statusCode + ': ' + data));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  for (let i = 0; i < chunks.length; i++) {
    await post(chunks[i]);
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  console.log('Posted to #' + channel + ' as ' + identity.username);
})();
