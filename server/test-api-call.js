const axios = require('axios');

// Use the admin token from your earlier session
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcklkIjoiODk1NTkwMTUwOTc5MCIsImRiQ3VzdG9tZXJJZCI6MTA5OCwiZW1haWwiOiJhZG1pbkBwb3R0ZXJ5LmNvbSIsImZpcnN0TmFtZSI6IkFkbWluIiwibGFzdE5hbWUiOiJVc2VyIiwiaWF0IjoxNzY1NjE3NjgzLCJleHAiOjE3NjYyMjI0ODN9.PU3WAys2h6PdRHSdtbRI0R2gWFo1v36NarSSJc8iSC8';

async function testAPI() {
  try {
    console.log('Calling /api/admin/students/stats...\n');

    const response = await axios.get('http://localhost:3000/api/admin/students/stats', {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    });

    const { activeStudentsList } = response.data;

    // Find Joey Lee
    const joey = activeStudentsList.find(s =>
      s.name?.toLowerCase().includes('joey') &&
      s.name?.toLowerCase().includes('lee')
    );

    console.log('='.repeat(60));
    if (joey) {
      console.log('✅ JOEY LEE FOUND IN API RESPONSE:');
      console.log('='.repeat(60));
      console.log(`  Name: ${joey.name}`);
      console.log(`  Email: ${joey.email}`);
      console.log(`  Course Identifier: ${joey.courseIdentifier}`);
      console.log(`  Enrollment Status: ${joey.enrollmentStatus}`);
      console.log(`  Classes Remaining: ${joey.weeksRemaining}`);
      console.log('='.repeat(60));
      console.log('');
      console.log(`Expected: 8 classes remaining (10 allocated - 2 attended)`);
      console.log(`Actual: ${joey.weeksRemaining} classes remaining`);
      console.log('');
      if (joey.weeksRemaining === 8) {
        console.log('✅ CORRECT!');
      } else {
        console.log('❌ INCORRECT!');
      }
    } else {
      console.log('❌ Joey Lee NOT FOUND in response');
      console.log(`   Total active students: ${activeStudentsList.length}`);
    }
    console.log('='.repeat(60));
    console.log('');

    // Show first 3 students for comparison
    console.log('First 3 students in response:');
    activeStudentsList.slice(0, 3).forEach(s => {
      console.log(`  ${s.name}: ${s.weeksRemaining} remaining`);
    });

  } catch (error) {
    console.error('Error:', error.response?.status, error.response?.data || error.message);
  }
}

testAPI();
