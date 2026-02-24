require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkVerificationCodes() {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('verification_codes')
      .select('*')
      .eq('email', 'test.student@example.com')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error querying database:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('No verification codes found for test.student@example.com');
      return;
    }

    console.log('Verification codes for test.student@example.com:\n');

    const now = new Date();

    data.forEach((row, i) => {
      const expiresAt = new Date(row.expires_at);
      const createdAt = new Date(row.created_at);
      const isExpired = expiresAt < now;

      console.log(`Code #${i + 1}:`);
      console.log(`  Code: ${row.code}`);
      console.log(`  Created: ${createdAt.toISOString()}`);
      console.log(`  Expires: ${expiresAt.toISOString()}`);
      console.log(`  Current: ${now.toISOString()}`);
      console.log(`  Verified: ${row.verified}`);
      console.log(`  Status: ${isExpired ? 'EXPIRED' : 'VALID'}`);

      if (!isExpired) {
        const minutesLeft = Math.floor((expiresAt - now) / 1000 / 60);
        console.log(`  Time left: ${minutesLeft} minutes`);
      } else {
        const minutesAgo = Math.floor((now - expiresAt) / 1000 / 60);
        console.log(`  Expired: ${minutesAgo} minutes ago`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkVerificationCodes();
