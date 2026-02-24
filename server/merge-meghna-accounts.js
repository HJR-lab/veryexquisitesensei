require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function mergeMeghnaAccounts() {
  try {
    console.log('=== Merging Meghna Accounts ===\n');

    // Use meghna@newcampus.com (ID: 1226) as primary since it has the latest order activity
    const primaryAccountId = 1226; // meghna@newcampus.com
    const secondaryAccountId = 1198; // meghna.n30@gmail.com

    console.log(`Primary Account: ID ${primaryAccountId} (meghna@newcampus.com)`);
    console.log(`Secondary Account: ID ${secondaryAccountId} (meghna.n30@gmail.com)`);

    // Step 1: Get details of both accounts
    const { data: primaryAccount } = await supabase
      .from('customers')
      .select('*')
      .eq('id', primaryAccountId)
      .single();

    const { data: secondaryAccount } = await supabase
      .from('customers')
      .select('*')
      .eq('id', secondaryAccountId)
      .single();

    console.log(`\nPrimary: ${primaryAccount.first_name} ${primaryAccount.last_name} (${primaryAccount.email})`);
    console.log(`Secondary: ${secondaryAccount.first_name} ${secondaryAccount.last_name} (${secondaryAccount.email})`);

    // Step 2: Move enrollments from secondary to primary
    const { data: secondaryEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', secondaryAccountId);

    console.log(`\n=== MOVING ENROLLMENTS ===`);
    console.log(`Found ${secondaryEnrollments.length} enrollments to move from secondary account`);

    if (secondaryEnrollments.length > 0) {
      const { error: enrollmentMoveError } = await supabase
        .from('course_enrollments')
        .update({ student_id: primaryAccountId })
        .eq('student_id', secondaryAccountId);

      if (enrollmentMoveError) {
        console.error('❌ Error moving enrollments:', enrollmentMoveError);
      } else {
        console.log('✅ Moved all enrollments to primary account');
      }
    }

    // Step 3: Move bookings from secondary to primary
    const { data: secondaryBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('student_id', secondaryAccountId);

    console.log(`\n=== MOVING BOOKINGS ===`);
    console.log(`Found ${secondaryBookings.length} bookings to move from secondary account`);

    if (secondaryBookings.length > 0) {
      const { error: bookingMoveError } = await supabase
        .from('bookings')
        .update({ student_id: primaryAccountId })
        .eq('student_id', secondaryAccountId);

      if (bookingMoveError) {
        console.error('❌ Error moving bookings:', bookingMoveError);
      } else {
        console.log('✅ Moved all bookings to primary account');
      }
    }

    // Step 4: Update primary account with combined information
    const combinedPurchaseCount = (primaryAccount.course_purchase_count || 0) + (secondaryAccount.course_purchase_count || 0);

    console.log(`\n=== UPDATING PRIMARY ACCOUNT ===`);
    console.log(`Combined course purchase count: ${combinedPurchaseCount}`);

    // Update primary account with complete name and combined purchase count
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        first_name: 'Meghna', // Use complete first name
        last_name: 'N', // Use last name from the original account
        course_purchase_count: combinedPurchaseCount
      })
      .eq('id', primaryAccountId);

    if (updateError) {
      console.error('❌ Error updating primary account:', updateError);
    } else {
      console.log('✅ Updated primary account with combined information');
    }

    // Step 5: Delete secondary account
    console.log(`\n=== DELETING SECONDARY ACCOUNT ===`);

    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', secondaryAccountId);

    if (deleteError) {
      console.error('❌ Error deleting secondary account:', deleteError);
    } else {
      console.log('✅ Deleted secondary account');
    }

    // Step 6: Verify final state
    console.log(`\n=== FINAL VERIFICATION ===`);

    const { data: finalAccount } = await supabase
      .from('customers')
      .select('*')
      .eq('id', primaryAccountId)
      .single();

    const { data: finalEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', primaryAccountId);

    const { data: finalBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('student_id', primaryAccountId);

    console.log(`Final Account: ${finalAccount.first_name} ${finalAccount.last_name}`);
    console.log(`Email: ${finalAccount.email}`);
    console.log(`Total Course Purchase Count: ${finalAccount.course_purchase_count}`);
    console.log(`Total Enrollments: ${finalEnrollments.length}`);
    console.log(`Total Bookings: ${finalBookings.length}`);

    console.log(`\n✅ Successfully merged Meghna accounts!`);
    console.log(`💡 Primary account is now meghna@newcampus.com with all orders combined`);

  } catch (error) {
    console.error('Error:', error);
  }
}

mergeMeghnaAccounts().then(() => process.exit());