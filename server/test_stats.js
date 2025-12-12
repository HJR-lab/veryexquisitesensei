require('dotenv').config();
const axios = require('axios');

async function testStats() {
  try {
    // Need to login first to get token
    const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'adobe@hjgher.com',
      password: 'pottery123'
    });
    
    const token = loginRes.data.token;
    console.log('✓ Logged in');
    
    // Get stats
    const statsRes = await axios.get('http://localhost:3000/api/admin/students/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('\n📊 Student Stats:');
    console.log(JSON.stringify(statsRes.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
  process.exit(0);
}

testStats();
