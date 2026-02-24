require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function createTestStudent() {
  try {
    console.log('\n🎨 Creating test student for email verification...\n');

    const testStudent = {
      shopify_customer_id: `TEST${Date.now()}`,
      email: 'test.student@example.com',
      first_name: 'Test',
      last_name: 'Student',
      customer_type: 'student',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
      // Note: NO password_hash - this student needs to verify email first
    };

    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .insert(testStudent)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating test student:', error);
      return;
    }

    console.log('✅ Test student created successfully!\n');
    console.log('📧 Email:', data.email);
    console.log('👤 Name:', data.first_name, data.last_name);
    console.log('🔑 Password:', 'Not set (needs verification)');
    console.log('\n🔗 Next steps:');
    console.log('1. Visit http://localhost:5173/verify-email');
    console.log('2. Enter email: test.student@example.com');
    console.log('3. Check server console for 6-digit PIN');
    console.log('4. Complete verification and set password\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createTestStudent();
