// /web/scripts/test-auth.js
// Automated test script to validate authentication middleware and endpoints.
// Usage: node test-auth.js [server-url] (default: http://127.0.0.1:3000)

const serverUrl = process.argv[2] || 'http://127.0.0.1:3000';
const loginEndpoint = `${serverUrl}/api/auth/login`;
const logoutEndpoint = `${serverUrl}/api/auth/logout`;
const dashboardUrl = `${serverUrl}/`;
const loginPageUrl = `${serverUrl}/login`;

const correctPassword = 'aero_secret_upload_key_123!'; // Default fallback matching environment

console.log(`\n🧪 Starting Dashboard Authentication Tests against: ${serverUrl}\n`);

async function runTests() {
  try {
    // Test 1: Access protected dashboard without session cookie (Should redirect to /login)
    console.log('1. Testing dashboard access without session cookie...');
    const res1 = await fetch(dashboardUrl, { redirect: 'manual' });
    
    // In Next.js, redirect returns 307 Temporary Redirect (or 302/303)
    if (res1.status === 307 || res1.status === 302 || res1.status === 303) {
      const location = res1.headers.get('location');
      console.log(`   ✅ Correctly intercepted! Status: ${res1.status}, Redirect Target: ${location}`);
    } else {
      console.error(`   ❌ Failed: Expected redirect, but server returned status ${res1.status}`);
    }

    // Test 2: Login with incorrect password (Should fail with 401)
    console.log('\n2. Testing login with incorrect password...');
    const res2 = await fetch(loginEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong_password_123' }),
    });
    
    const data2 = await res2.json();
    if (res2.status === 401) {
      console.log('   ✅ Correctly rejected with 401 Unauthorized:', data2.error);
    } else {
      console.error(`   ❌ Failed: Server returned status ${res2.status} (expected 401).`);
    }

    // Test 3: Login with correct password (Should succeed and set __Host- cookie)
    console.log('\n3. Testing login with correct password...');
    const res3 = await fetch(loginEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: correctPassword }),
    });
    
    const data3 = await res3.json();
    const setCookieHeader = res3.headers.get('set-cookie');
    
    if (res3.status === 200 && data3.success && setCookieHeader) {
      console.log('   ✅ Success: Authenticated successfully!');
      console.log(`   Set-Cookie Header: ${setCookieHeader}`);
      
      // Verify cookie attributes
      if (setCookieHeader.includes('__Host-aerobot-session') && setCookieHeader.includes('HttpOnly') && setCookieHeader.includes('Secure') && setCookieHeader.includes('SameSite=Lax')) {
        console.log('   ✅ Cookie security flags confirmed (HttpOnly, Secure, SameSite=Lax, __Host- prefix).');
      } else {
        console.warn('   ⚠️ Cookie flags might be missing attributes.');
      }
    } else {
      console.error(`   ❌ Failed: Server returned status ${res3.status}`, data3);
      process.exit(1);
    }

    // Extract cookie value
    const sessionCookie = setCookieHeader.split(';')[0];

    // Test 4: Access protected dashboard with valid session cookie (Should return 200)
    console.log('\n4. Testing dashboard access WITH valid session cookie...');
    const res4 = await fetch(dashboardUrl, {
      headers: { 'Cookie': sessionCookie },
      redirect: 'manual'
    });
    
    if (res4.status === 200) {
      console.log('   ✅ Success: Dashboard loaded successfully with session cookie!');
    } else {
      console.error(`   ❌ Failed: Expected status 200, got status ${res4.status}`);
    }

    // Test 5: Logout (Should clear the cookie)
    console.log('\n5. Testing logout action...');
    const res5 = await fetch(logoutEndpoint, {
      method: 'POST',
      headers: { 'Cookie': sessionCookie },
    });
    
    const data5 = await res5.json();
    const clearCookieHeader = res5.headers.get('set-cookie');
    
    if (res5.status === 200 && data5.success && clearCookieHeader) {
      console.log('   ✅ Success: Logout request succeeded.');
      console.log(`   Clear-Cookie Header: ${clearCookieHeader}`);
    } else {
      console.error(`   ❌ Failed: Logout returned status ${res5.status}`);
    }

  } catch (error) {
    console.error('\n❌ Connection error during testing:', error.message);
  }
}

runTests();
