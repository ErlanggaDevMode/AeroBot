// /web/scripts/set-webhook.js
// Utility script to register your Next.js Telegram API webhook with Telegram.
// Usage: node set-webhook.js <your-vercel-domain>
// Example: node set-webhook.js https://my-solar-monitoring.vercel.app

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
let token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/TELEGRAM_BOT_TOKEN\s*=\s*(.+)/);
    if (match) {
      token = match[1].trim();
    }
  }
}

if (!token || token.includes('your-') || token.startsWith('8920961595:AAEfc')) {
  // Use the default/actual token if none found
  token = '8920961595:AAEfcCzxBdbFRdxLu2sCD4TbxH5siQN7NqM';
}

const domain = process.argv[2];

if (!domain) {
  console.error('\n❌ Error: Please specify your public Vercel domain or tunnel URL.');
  console.log('Usage: node set-webhook.js <your-domain>');
  console.log('Example: node set-webhook.js https://aerobot-monitoring.vercel.app\n');
  process.exit(1);
}

// Clean domain input
const baseUrl = domain.endsWith('/') ? domain.slice(0, -1) : domain;
const webhookUrl = `${baseUrl}/api/telegram/webhook`;

console.log(`📡 Registering Telegram Webhook URL: ${webhookUrl}...`);

const url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

fetch(url)
  .then((res) => res.json())
  .then((data) => {
    if (data.ok) {
      console.log('\n✅ Success: Telegram Webhook registered successfully!');
      console.log(JSON.stringify(data, null, 2));
      console.log('\nYou can now send messages to your bot and they will route to your Next.js app.\n');
    } else {
      console.error('\n❌ Failed to register webhook:');
      console.error(JSON.stringify(data, null, 2));
      console.log('\nPlease verify your BOT_TOKEN inside .env.local\n');
    }
  })
  .catch((err) => {
    console.error('\n❌ Error connecting to Telegram API:', err.message);
  });
