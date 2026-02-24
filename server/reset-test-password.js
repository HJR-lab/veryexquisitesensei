require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function resetPassword() {
  try {
    console.log('\n🔄 Resetting password for test.student@example.com...\n');

    // Clear password hash
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({
        password_hash: null,
        updated_at: new Date().toISOString()
      })
      .eq('email', 'test.student@example.com');

    if (updateError) {
      console.error('❌ Error clearing password:', updateError);
      return;
    }

    // Clear all verification codes (old and new)
    const { error: deleteError } = await supabaseDb.supabase
      .from('verification_codes')
      .delete()
      .eq('email', 'test.student@example.com');

    if (deleteError) {
      console.error('❌ Error clearing verification codes:', deleteError);
      return;
    }

    console.log('✅ Password reset successfully!\n');
    console.log('🔗 Next steps:');
    console.log('1. Visit http://localhost:5173/verify-email');
    console.log('2. Enter email: test.student@example.com');
    console.log('3. Check server console for 6-digit verification code');
    console.log('4. Complete verification and set a new password\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

resetPassword();
