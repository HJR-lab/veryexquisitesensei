const https = require('https');
const http = require('http');

async function testActualDashboardAPI() {
  try {
    console.log('=== Testing Actual Dashboard API Endpoint ===\n');

    // Use a test token (you might need to get a real token for Mitchell)
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcklkIjoiMTE0NjI3NDA0Nzc2OCIsImRiQ3VzdG9tZXJJZCI6MTExNiwiZW1haWwiOiJNaXRjaGVsbC5jaGFuZHhAZ21haWwuY29tIiwiZmlyc3ROYW1lIjoiTWl0Y2hlbGwiLCJsYXN0TmFtZSI6IkNoYW4iLCJpYXQiOjE3MzY0ODk4MTYsImV4cCI6MTczNzA5NDYxNn0.T4PVW4LjGJoLdHZJjBwgV0-UM2kUrJnhfJcyBIlgR38';

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

          // Check enrollments
          if (dashboardData.enrollments) {
            console.log('=== ENROLLMENTS BY CATEGORY ===');
            console.log(`Active: ${(dashboardData.enrollments.active || []).length}`);
            (dashboardData.enrollments.active || []).forEach(e => {
              console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
            });

            console.log(`Upcoming: ${(dashboardData.enrollments.upcoming || []).length}`);
            (dashboardData.enrollments.upcoming || []).forEach(e => {
              console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
            });

            console.log(`Completed: ${(dashboardData.enrollments.completed || []).length}`);
            (dashboardData.enrollments.completed || []).forEach(e => {
              console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
            });

            console.log(`Pending: ${(dashboardData.enrollments.pending || []).length}`);
            (dashboardData.enrollments.pending || []).forEach(e => {
              console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
            });

            const totalEnrollments = [
              ...(dashboardData.enrollments.active || []),
              ...(dashboardData.enrollments.upcoming || []),
              ...(dashboardData.enrollments.completed || []),
              ...(dashboardData.enrollments.pending || [])
            ];

            console.log(`\n📊 TOTAL ENROLLMENTS IN RESPONSE: ${totalEnrollments.length}`);
            console.log('✅ This is what the dashboard will display!');

          } else {
            console.log('❌ No enrollments found in response');
          }

        } else {
          console.log(`❌ API Error: ${res.statusCode}`);
          console.log('Response:', data);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request failed:', err.message);
    });

    req.end();

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testActualDashboardAPI();
setTimeout(() => process.exit(), 2000); // Exit after 2 seconds