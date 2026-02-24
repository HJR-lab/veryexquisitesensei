const axios = require('axios');

async function testStatsAPI() {
  try {
    console.log('Testing /api/admin/students/stats endpoint...\n');

    const response = await axios.get('http://localhost:3000/api/admin/students/stats');
    const students = response.data;

    console.log(`Total students returned: ${students.length}\n`);

    // Find Joey Lee (ID 2234)
    const joey = students.find(s => s.id === 2234);

    if (joey) {
      console.log('Joey Lee (ID 2234):');
      console.log(`  Name: ${joey.firstName} ${joey.lastName}`);
      console.log(`  Classes Allocated: ${joey.classesAllocated}`);
      console.log(`  Classes Remaining: ${joey.classesRemaining}`);
      console.log(`  Expected Remaining: 8 (10 allocated - 2 attended)`);
      console.log(`  ✓ ${joey.classesRemaining === 8 ? 'CORRECT' : 'INCORRECT'}\n`);
    } else {
      console.log('❌ Joey Lee not found in response\n');
    }

    // Show first 5 students to see the pattern
    console.log('First 5 students for comparison:');
    students.slice(0, 5).forEach(s => {
      console.log(`  ${s.firstName} ${s.lastName} - Allocated: ${s.classesAllocated}, Remaining: ${s.classesRemaining}`);
    });

  } catch (error) {
    console.error('❌ Error calling API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testStatsAPI();
