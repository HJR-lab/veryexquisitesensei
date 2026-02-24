require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMeghnaLogin() {
  try {
    console.log('=== Checking Meghna Login Status ===\n');

    // Find Meghna's current account
    const { data: meghna } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'meghna@newcampus.com')
      .single();

    if (!meghna) {
      console.log('❌ Meghna account not found');
      return;
    }

    console.log('✅ Found Meghna account:');
    console.log(`   ID: ${meghna.id}`);
    console.log(`   Name: ${meghna.first_name} ${meghna.last_name}`);
    console.log(`   Email: ${meghna.email}`);
    console.log(`   Shopify Customer ID: ${meghna.shopify_customer_id}`);
    console.log(`   Has Password: ${meghna.password_hash ? 'YES' : 'NO'}`);

    // Check if she has verification codes
    const { data: verificationCodes } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('customer_id', meghna.id)
      .order('created_at', { ascending: false });

    console.log(`\n=== VERIFICATION CODES ===`);
    console.log(`Found ${verificationCodes.length} verification codes`);

    if (verificationCodes.length > 0) {
      verificationCodes.slice(0, 3).forEach((code, i) => {
        console.log(`${i + 1}. Code: ${code.code}`);
        console.log(`   Email: ${code.email}`);
        console.log(`   Used: ${code.used ? 'YES' : 'NO'}`);
        console.log(`   Expires: ${code.expires_at}`);
        console.log(`   Created: ${code.created_at}`);
        console.log('');
      });
    }

    // Check active enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghna.id)
      .eq('status', 'active');

    console.log(`=== ACTIVE ENROLLMENTS ===`);
    console.log(`Found ${enrollments.length} active enrollments`);
    enrollments.forEach(e => {
      console.log(`   - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    // Create fresh verification code for login
    console.log(`\n=== CREATING FRESH LOGIN CODE ===`);

    // Delete old codes first
    const { error: deleteError } = await supabase
      .from('verification_codes')
      .delete()
      .eq('customer_id', meghna.id);

    if (deleteError) {
      console.error('Error deleting old codes:', deleteError);
    }

    // Generate new 6-digit code
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    const { data: newVerificationCode, error: codeError } = await supabase
      .from('verification_codes')
      .insert({
        customer_id: meghna.id,
        email: meghna.email,
        code: newCode,
        expires_at: expiresAt.toISOString(),
        used: false
      })
      .select()
      .single();

    if (codeError) {
      console.error('❌ Error creating verification code:', codeError);
    } else {
      console.log('✅ Created fresh verification code for Meghna');
      console.log(`   Code: ${newCode}`);
      console.log(`   Email: ${meghna.email}`);
      console.log(`   Expires: ${expiresAt.toLocaleString()}`);

      console.log('\n💡 INSTRUCTIONS FOR MEGHNA:');
      console.log('1. Go to the login page');
      console.log(`2. Enter email: ${meghna.email}`);
      console.log(`3. Enter verification code: ${newCode}`);
      console.log('4. This code expires in 15 minutes');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkMeghnaLogin().then(() => process.exit());