require('dotenv').config();
const fetch = require('node-fetch');

async function testStudentSections() {
  try {
    // Get JWT token (you'll need to replace with actual token or generate one)
    const response = await fetch('http://localhost:3000/api/admin/students/stats');
    const data = await response.json();

    console.log('Response:', JSON.stringify(data, null, 2));

    if (!data.activeStudentsList) {
      console.error('Error: activeStudentsList is undefined');
      console.log('Full response:', data);
      return;
    }

    console.log('\n=== ACTIVE STUDENTS ===');
    console.log(`Total: ${data.activeStudentsList.length}\n`);

    // Look for Mitchell, Sarah, Meghna, Clarissa
    const names = ['Mitchell', 'Sarah', 'Meghna', 'Clarissa'];
    names.forEach(name => {
      const found = data.activeStudentsList.filter(s => s.name.includes(name));
      if (found.length > 0) {
        found.forEach(student => {
          console.log(`✅ ${student.name} (${student.email})`);
          console.log(`   Course: ${student.courseIdentifier}`);
          console.log(`   Classes Remaining: ${student.weeksRemaining}`);
        });
      } else {
        console.log(`❌ ${name} NOT FOUND`);
      }
    });

    console.log('\n=== UPCOMING ENROLLMENTS ===');
    console.log(`Total: ${data.upcomingEnrollmentsList.length}\n`);

    names.forEach(name => {
      const found = data.upcomingEnrollmentsList.filter(s => s.name.includes(name));
      if (found.length > 0) {
        found.forEach(student => {
          console.log(`✅ ${student.name} (${student.email})`);
          console.log(`   Course: ${student.courseIdentifier}`);
          console.log(`   Start Date: ${student.startDate}`);
        });
      } else {
        console.log(`❌ ${name} NOT FOUND`);
      }
    });

    console.log('\n=== SUMMARY ===');
    console.log('Expected results:');
    console.log('  Active Students: Mitchell (WT1701PM_DL6), Sarah (WT1701PM_DL6)');
    console.log('  Upcoming Enrollments: Mitchell (WT2802PM_JL6), Sarah (WT2802PM_JL6), Meghna (WT0103AM_JL6), Clarissa (WT1003NT_JL6)');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

testStudentSections();
