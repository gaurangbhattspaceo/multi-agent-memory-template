#!/usr/bin/env node
// Discord webhook poster with file attachment support
// Uses multipart/form-data to upload images/files to Discord
// Usage: node /app/identity/post-file.js <agent> <channel> "message" <filepath>

const fs = require('fs');
const https = require('https');
const path = require('path');

const [,, agent, channel, message, filePath] = process.argv;

if (!agent || !channel || !message || !filePath) {
  console.error('Usage: node post-file.js <agent> <channel> "message" <filepath>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error('ERROR: File not found: ' + filePath);
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

// Determine content type from extension
const ext = path.extname(filePath).toLowerCase();
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.log': 'text/plain'
};
const contentType = MIME_TYPES[ext] || 'application/octet-stream';
const fileName = path.basename(filePath);

// Build multipart/form-data manually (no external deps)
const boundary = '----FormBoundary' + Date.now().toString(36) + Math.random().toString(36).slice(2);

const payloadJson = JSON.stringify({
  username: identity.username,
  avatar_url: identity.avatar_url || undefined,
  content: message.slice(0, 2000)
});

const fileData = fs.readFileSync(filePath);

// Construct multipart body
const parts = [];

// Part 1: payload_json
parts.push(
  '--' + boundary + '\r\n' +
  'Content-Disposition: form-data; name="payload_json"\r\n' +
  'Content-Type: application/json\r\n\r\n' +
  payloadJson + '\r\n'
);

// Part 2: file
const fileHeader =
  '--' + boundary + '\r\n' +
  'Content-Disposition: form-data; name="file"; filename="' + fileName + '"\r\n' +
  'Content-Type: ' + contentType + '\r\n\r\n';

const fileFooter = '\r\n--' + boundary + '--\r\n';

// Combine into single buffer
const headerBuf = Buffer.from(parts.join('') + fileHeader, 'utf8');
const footerBuf = Buffer.from(fileFooter, 'utf8');
const body = Buffer.concat([headerBuf, fileData, footerBuf]);

const url = new URL(webhookUrl);

const req = https.request({
  hostname: url.hostname,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': body.length
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 400) {
      console.error('Discord API error ' + res.statusCode + ': ' + data.slice(0, 500));
      process.exit(1);
    }
    console.log('Posted to #' + channel + ' as ' + identity.username + ' with file: ' + fileName);
  });
});

req.on('error', err => {
  console.error('Request error: ' + err.message);
  process.exit(1);
});

req.write(body);
req.end();
