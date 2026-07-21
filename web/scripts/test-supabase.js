// /web/scripts/test-supabase.js
// Diagnostic script to verify the connection to your real Supabase database.
// Usage: node test-supabase.js

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
let supabaseUrl = process.env.SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  const urlMatch = envContent.match(/SUPABASE_URL\s*=\s*(.+)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();

  const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)/);
  if (keyMatch) supabaseKey = keyMatch[1].trim();
}

console.log('\n🧪 Testing connection to your live Supabase Database...');
console.log(`URL: ${supabaseUrl || 'Not Configured'}`);

if (!supabaseUrl || supabaseUrl.includes('your-project-id') || !supabaseKey || supabaseKey.includes('your-supabase-service-role-key')) {
  console.error('\n❌ Configuration Error: Please configure your real Supabase credentials in web/.env.local first.');
  console.log('Ensure you replace the placeholders with your actual project URL and service role key.\n');
  process.exit(1);
}

async function verifyConnection() {
  const url = `${supabaseUrl}/rest/v1/devices?select=*`;
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
  };

  try {
    const res = await fetch(url, { headers });
    
    if (res.ok) {
      const data = await res.json();
      console.log('\n✅ Success: Successfully connected to Supabase PostgreSQL!');
      console.log(`Detected devices in DB: ${data.length}`);
      console.log(JSON.stringify(data, null, 2));
      console.log('\nYour backend is now fully ready for real device uploads.\n');
    } else {
      const errText = await res.text();
      console.error(`\n❌ Connection Failed (Status ${res.status}):`);
      console.error(errText);
      console.log('\nTips:');
      console.log('1. Verify your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      console.log('2. Ensure you have run schema.sql in the Supabase SQL Editor to create the tables.\n');
    }
  } catch (error) {
    console.error('\n❌ Network error connecting to Supabase:', error.message);
  }
}

verifyConnection();
