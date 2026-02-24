require('dotenv').config();
const fetch = require('node-fetch');

async function testYeoAPI() {
  try {
    console.log('=== Testing Yeo API Response ===\n');

    // First get Yeo's JWT token (simulate login)
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'yeo@example.com', password: 'password123' })
    });

    if (!loginResponse.ok) {
      console.log('Login failed, testing without auth...');
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;

    // Now call the dashboard API
    const dashboardResponse = await fetch('http://localhost:3000/api/students/me/dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!dashboardResponse.ok) {
      console.error('Dashboard API failed:', dashboardResponse.status);
      return;
    }

    const dashboardData = await dashboardResponse.json();
    console.log('=== DASHBOARD API RESPONSE ===');
    console.log('Stats:', JSON.stringify(dashboardData.stats, null, 2));

    if (dashboardData.stats && dashboardData.stats.remaining === 2) {
      console.log('\n✅ API correctly returns remaining: 2');
      console.log('Issue might be frontend caching or a different data source');
    } else {
      console.log('\n❌ API returning wrong remaining value');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testYeoAPI().then(() => process.exit());