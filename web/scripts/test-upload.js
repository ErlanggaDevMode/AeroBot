// /web/scripts/test-upload.js
// Automated test script to validate Next.js API Routes.
// Launches test requests representing the ESP32 upload and Telegram webhook.
// Usage: node test-upload.js [server-url] (default: http://127.0.0.1:3000)

const serverUrl = process.argv[2] || 'http://127.0.0.1:3000';
const uploadEndpoint = `${serverUrl}/api/device/upload`;
const webhookEndpoint = `${serverUrl}/api/telegram/webhook`;

const apiKey = 'aero_secret_upload_key_123!';
const testDeviceId = 'ESP32-001';

console.log(`\n🧪 Starting API Verification Tests against: ${serverUrl}\n`);

async function runTests() {
  try {
    // Test 1: Upload without API key (Should fail with 401)
    console.log('1. Testing upload without API Key...');
    const res1 = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: testDeviceId, temperature: 25.5 }),
    });
    
    if (res1.status === 401) {
      console.log('   ✅ Correctly rejected with 401 Unauthorized.');
    } else {
      console.error(`   ❌ Failed: Server returned status ${res1.status} (expected 401).`);
    }

    // Test 2: Upload with invalid API key (Should fail with 401)
    console.log('\n2. Testing upload with incorrect API Key...');
    const res2 = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': 'wrong_key_xyz'
      },
      body: JSON.stringify({ deviceId: testDeviceId, temperature: 25.5 }),
    });
    
    if (res2.status === 401) {
      console.log('   ✅ Correctly rejected with 401 Unauthorized.');
    } else {
      console.error(`   ❌ Failed: Server returned status ${res2.status} (expected 401).`);
    }

    // Test 3: Upload with valid API key (Should succeed with 200)
    console.log('\n3. Testing valid upload telemetry from device...');
    const telemetryPayload = {
      deviceId: testDeviceId,
      temperature: 28.4,
      humidity: 68.5,
      soil: 55,
      battery: 12.92,
      solar: 'charging',
      rssi: -58,
      uptime: 120,
      version: '1.1'
    };

    const res3 = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(telemetryPayload),
    });
    
    const data3 = await res3.json();
    if (res3.status === 200 && data3.success) {
      console.log('   ✅ Success: Telemetry successfully logged.');
      console.log('   Response payload:', JSON.stringify(data3));
    } else {
      console.error(`   ❌ Failed: Server returned status ${res3.status}`, data3);
    }

    // Test 4: Mock Telegram Webhook Command '/status' (Should return 200)
    console.log('\n4. Testing Mock Telegram Webhook command (/status)...');
    const webhookPayload = {
      update_id: 999999,
      message: {
        message_id: 1,
        chat: { id: 5984866212 }, // Authorized Chat ID
        from: { first_name: 'Tester' },
        text: '/status'
      }
    };

    const res4 = await fetch(webhookEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });
    
    if (res4.status === 200) {
      console.log('   ✅ Success: Telegram Webhook processed status query.');
    } else {
      console.error(`   ❌ Failed: Webhook returned status ${res4.status}`);
    }

    // Test 5: Mock Telegram Webhook Reboot Command '/reboot' (Queue command)
    console.log('\n5. Testing Webhook command (/reboot) to queue command...');
    const rebootPayload = {
      update_id: 999999,
      message: {
        message_id: 2,
        chat: { id: 5984866212 },
        from: { first_name: 'Tester' },
        text: '/reboot'
      }
    };

    const res5 = await fetch(webhookEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rebootPayload),
    });
    
    if (res5.status === 200) {
      console.log('   ✅ Success: Reboot command successfully queued in database.');
    } else {
      console.error(`   ❌ Failed: Webhook returned status ${res5.status}`);
    }

    // Test 6: Verify command is delivered to device on next upload
    console.log('\n6. Testing command extraction on next upload cycle...');
    const res6 = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(telemetryPayload),
    });
    
    const data6 = await res6.json();
    if (res6.status === 200 && data6.command === 'reboot') {
      console.log('   ✅ Success: Reboot command successfully delivered to client.');
      console.log('   Response payload:', JSON.stringify(data6));
    } else {
      console.error(`   ❌ Failed: Expected command "reboot", got:`, data6);
    }

  } catch (error) {
    console.error('\n❌ Connection error during testing:', error.message);
    console.log('Make sure your Next.js local server is running (npm run dev) before launching this test script.\n');
  }
}

runTests();
