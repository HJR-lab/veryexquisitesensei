require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkPassword() {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .select('email, password_hash')
      .eq('email', 'test.student@example.com')
      .single();

    if (error) {
      console.error('Error querying database:', error);
      return;
    }

    console.log('Customer:', data.email);
    console.log('Has password:', !!data.password_hash);

    if (data.password_hash) {
      console.log('Password hash exists (first 20 chars):', data.password_hash.substring(0, 20) + '...');
      console.log('\n⚠️  Note: The actual password is not stored - only the bcrypt hash.');
      console.log('If you set a password, you should remember what you entered.');
    } else {
      console.log('No password set yet.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkPassword();
