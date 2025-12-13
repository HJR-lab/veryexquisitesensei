const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdminUser() {
  try {
    // Check if admin user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'admin@pottery.com')
      .single();

    if (existing) {
      console.log('✅ Admin user already exists');
      console.log('Email: admin@pottery.com');
      console.log('Password: admin123');
      return;
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const { data, error } = await supabase
      .from('users')
      .insert({
        email: 'admin@pottery.com',
        password_hash: hashedPassword,
        role: 'admin',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating admin user:', error);
      console.log('\nNote: You may need to use the Supabase service_role key instead of anon key');
      console.log('Or create the user directly through the Supabase dashboard');
      return;
    }

    console.log('✅ Admin user created successfully!');
    console.log('Email: admin@pottery.com');
    console.log('Password: admin123');
    console.log('');
    console.log('You can now login at: https://frontend-b0z6r6j6m-hjr-labs-projects.vercel.app');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createAdminUser();
