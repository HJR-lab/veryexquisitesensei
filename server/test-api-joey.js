const axios = require('axios');

async function testJoeyInAPI() {
  try {
    const response = await axios.get('http://localhost:3000/api/admin/students/stats', {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcklkIjoiODk1NTkwMTUwOTc5MCIsImRiQ3VzdG9tZXJJZCI6MTA5OCwiZW1haWwiOiJhZG1pbkBwb3R0ZXJ5LmNvbSIsImZpcnN0TmFtZSI6IkFkbWluIiwibGFzdE5hbWUiOiJVc2VyIiwiaWF0IjoxNzY1NjE3NjgzLCJleHAiOjE3NjYyMjI0ODN9.PU3WAys2h6PdRHSdtbRI0R2gWFo1v36NarSSJc8iSC8'
      }
    });

    const data = response.data;

    // Search for Joey in active students
    const joeyInActive = data.activeStudents?.list?.find(s => s.email === 'joey.lee2302@gmail.com');

    if (joeyInActive) {
      console.log('\n✅ Joey Lee FOUND in active students:');
      console.log(JSON.stringify(joeyInActive, null, 2));
    } else {
      console.log('\n❌ Joey Lee NOT FOUND in active students');
      console.log('Total active students:', data.activeStudents?.list?.length || 0);
    }

    // Also check Denise Wong
    const deniseInActive = data.activeStudents?.list?.find(s => s.name.includes('Denise Wong'));

    if (deniseInActive) {
      console.log('\n✅ Denise Wong FOUND in active students:');
      console.log(JSON.stringify(deniseInActive, null, 2));
    } else {
      console.log('\n❌ Denise Wong NOT FOUND in active students');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testJoeyInAPI();
