require('dotenv').config();
const https = require('https');
const http = require('http');

async function testMeghnaDashboard() {
  try {
    console.log('=== Testing Meghna Dashboard Fix ===\n');

    // Use Meghna's login token (you might need to generate a fresh one)
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcklkIjoiODQ2MjMyNzUxMzI0NiIsImRiQ3VzdG9tZXJJZCI6MTIyNiwiZW1haWwiOiJtZWdobmFAbmV3Y2FtcHVzLmNvbSIsImZpcnN0TmFtZSI6Ik1lZ2huYSIsImxhc3ROYW1lIjoiTiIsImlhdCI6MTczOTI2Mjc1OCwiZXhwIjoxNzM5ODY3NTU4fQ.example'; // This might need to be updated with a fresh token

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/students/me/dashboard',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testToken}`,
        'Content-Type': 'application/json'
      }
    };

    // Test the API call
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const dashboardData = JSON.parse(data);

          console.log('✅ Dashboard API Response:');
          console.log(`Status Code: ${res.statusCode}\n`);

          // Check the stats
          if (dashboardData.stats) {
            console.log('=== BOOKING STATS ===');
            console.log(`Total Classes Allocated: ${dashboardData.stats.totalClassesAllocated}`);
            console.log(`Total Booked: ${dashboardData.stats.totalBooked}`);
            console.log(`Available: ${dashboardData.stats.available}`);
            console.log(`Attended (Past): ${dashboardData.stats.attended}`);
            console.log(`Remaining: ${dashboardData.stats.remaining}`);

            console.log('\n=== EXPECTED vs ACTUAL ===');
            console.log(`Expected Total Classes: 12 (2 active courses × 6 weeks)`);
            console.log(`Actual Total Classes: ${dashboardData.stats.totalClassesAllocated}`);
            console.log(`Expected Booked (Future): 8`);
            console.log(`Actual Booked: ${dashboardData.stats.totalBooked}`);
            console.log(`Expected Available: 4`);
            console.log(`Actual Available: ${dashboardData.stats.available}`);

            if (dashboardData.stats.totalClassesAllocated === 12 &&
                dashboardData.stats.totalBooked === 8 &&
                dashboardData.stats.available === 4) {
              console.log('\n✅ DASHBOARD STATS FIXED! 🎉');
            } else {
              console.log('\n❌ Dashboard stats still need adjustment');
            }
          }

          // Check enrollments
          if (dashboardData.enrollments) {
            console.log('\n=== ENROLLMENTS ===');
            console.log(`Active: ${(dashboardData.enrollments.active || []).length}`);
            console.log(`Upcoming: ${(dashboardData.enrollments.upcoming || []).length}`);
            console.log(`Completed: ${(dashboardData.enrollments.completed || []).length}`);
            console.log(`Pending: ${(dashboardData.enrollments.pending || []).length}`);
          }

        } else {
          console.log(`❌ API Error: ${res.statusCode}`);
          console.log('Response:', data);

          // If token is expired, show instructions to get a new one
          if (res.statusCode === 401) {
            console.log('\n💡 Token might be expired. Run this to get fresh login code:');
            console.log('node fix-meghna-login-simple.js');
          }
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request failed:', err.message);
      console.log('\n💡 Make sure the server is running on port 3000');
    });

    req.end();

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Wait 2 seconds then exit
testMeghnaDashboard();
setTimeout(() => process.exit(), 3000);