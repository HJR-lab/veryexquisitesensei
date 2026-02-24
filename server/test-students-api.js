require('dotenv').config();

async function testStudentsApi() {
  try {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcklkIjoiODk1NTkwMTUwOTc5MCIsImRiQ3VzdG9tZXJJZCI6MTA5OCwiZW1haWwiOiJhZG1pbkBwb3R0ZXJ5LmNvbSIsImZpcnN0TmFtZSI6IkFkbWluIiwibGFzdE5hbWUiOiJVc2VyIiwiaWF0IjoxNzY1NjE3NjgzLCJleHAiOjE3NjYyMjI0ODN9.PU3WAys2h6PdRHSdtbRI0R2gWFo1v36NarSSJc8iSC8';

    const response = await fetch('http://localhost:3000/api/admin/students/stats', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    console.log('Response status:', response.status);
    console.log('Response keys:', Object.keys(data));
    console.log('\nActive Students List:\n');
    const activeStudents = data.activeStudentsList || [];

    // Find Mitchell accounts
    const mitchellStudents = activeStudents.filter(s =>
      s.email && (s.email.includes('Mitchell.chandx'))
    );

    console.log(`Total active students: ${activeStudents.length}`);
    console.log(`Mitchell.chandx accounts in list: ${mitchellStudents.length}\n`);

    mitchellStudents.forEach(s => {
      console.log(`  ${s.name} - ${s.email}`);
      console.log(`    Course: ${s.courseIdentifier}`);
      console.log(`    Weeks Remaining: ${s.weeksRemaining}`);
      console.log(`    Has Upcoming Course: ${s.hasUpcomingCourse}`);
      console.log();
    });

    // Also check if both IDs (1116 and 2228) are present
    const karyn = activeStudents.find(s => s.email === 'Mitchell.chandx@gmail.com');
    const sarah = activeStudents.find(s => s.email === 'Mitchell.chandx+dup@gmail.com');

    console.log('=== Account Check ===');
    console.log(`Karyn Chan (Mitchell.chandx@gmail.com): ${karyn ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`Sarah (Mitchell.chandx+dup@gmail.com): ${sarah ? '✅ FOUND' : '❌ NOT FOUND'}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

testStudentsApi();
