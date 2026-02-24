require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMeghnaLogin() {
  try {
    console.log('=== Creating Simple Login for Meghna ===\n');

    // Check verification_codes table structure
    const { data: tableInfo, error: tableError } = await supabase
      .from('verification_codes')
      .select('*')
      .limit(1);

    console.log('Verification codes table structure check...');
    if (tableError) {
      console.error('Table error:', tableError);
    }

    // Find Meghna's account
    const { data: meghna } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'meghna@newcampus.com')
      .single();

    console.log(`Found Meghna: ID ${meghna.id}, Email: ${meghna.email}`);

    // Clear any existing codes
    console.log('\nClearing existing verification codes...');
    const { error: deleteError } = await supabase
      .from('verification_codes')
      .delete()
      .eq('customer_id', meghna.id);

    if (deleteError) {
      console.log('Delete error (might be expected):', deleteError.message);
    }

    // Create simple verification code without 'used' field
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    console.log(`\nCreating verification code: ${newCode}`);

    const { data: newVerificationCode, error: codeError } = await supabase
      .from('verification_codes')
      .insert({
        customer_id: meghna.id,
        email: meghna.email,
        code: newCode,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (codeError) {
      console.error('❌ Error creating verification code:', codeError);

      // Alternative: Set a temporary password
      console.log('\n=== ALTERNATIVE: Setting temporary password ===');
      const bcrypt = require('bcrypt');
      const tempPassword = 'temp123';
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const { error: passwordError } = await supabase
        .from('customers')
        .update({ password_hash: hashedPassword })
        .eq('id', meghna.id);

      if (passwordError) {
        console.error('❌ Error setting password:', passwordError);
      } else {
        console.log('✅ Set temporary password for Meghna');
        console.log(`   Email: ${meghna.email}`);
        console.log(`   Temp Password: ${tempPassword}`);
        console.log('\n💡 Meghna can now login with email and password');
      }

    } else {
      console.log('✅ Created verification code successfully');
      console.log(`   Code: ${newCode}`);
      console.log(`   Expires: ${expiresAt.toLocaleString()}`);

      console.log('\n💡 LOGIN INSTRUCTIONS FOR MEGHNA:');
      console.log(`1. Go to: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`);
      console.log(`2. Enter email: ${meghna.email}`);
      console.log(`3. Enter code: ${newCode}`);
      console.log('4. Code expires in 30 minutes');
    }

    // Also fix her course identifiers that are showing NULL
    console.log(`\n=== FIXING MEGHNA'S COURSE IDENTIFIERS ===`);

    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghna.id)
      .eq('status', 'active');

    console.log(`Found ${enrollments.length} active enrollments with NULL identifiers`);

    for (const enrollment of enrollments) {
      if (!enrollment.course_identifier) {
        // Check bookings for this enrollment to determine identifier
        const { data: bookings } = await supabase
          .from('bookings')
          .select(`
            *,
            class_instances!bookings_class_instance_id_fkey (
              class_type
            )
          `)
          .eq('course_enrollment_id', enrollment.id)
          .limit(1);

        if (bookings.length > 0 && bookings[0].class_instances?.class_type) {
          const classType = bookings[0].class_instances.class_type;
          const baseCourse = classType.split('.')[0]; // e.g., WT1701PM_DL6.1 -> WT1701PM_DL6

          const { error: updateError } = await supabase
            .from('course_enrollments')
            .update({ course_identifier: baseCourse })
            .eq('id', enrollment.id);

          if (updateError) {
            console.error(`❌ Error updating enrollment ${enrollment.id}:`, updateError);
          } else {
            console.log(`✅ Updated enrollment ${enrollment.id} with identifier: ${baseCourse}`);
          }
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMeghnaLogin().then(() => process.exit());