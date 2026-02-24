require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findMeghnaAccounts() {
  try {
    console.log('=== Finding All Meghna Accounts ===\n');

    // Search for all customers with "Meghna" in first name
    const { data: meghnaAccounts } = await supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%meghna%')
      .order('created_at', { ascending: true });

    console.log(`Found ${meghnaAccounts.length} accounts with "Meghna" in first name:`);

    meghnaAccounts.forEach((account, i) => {
      console.log(`\n${i + 1}. Customer ID: ${account.id}`);
      console.log(`   Name: ${account.first_name} ${account.last_name}`);
      console.log(`   Email: ${account.email}`);
      console.log(`   Shopify ID: ${account.shopify_customer_id || 'NULL'}`);
      console.log(`   Created: ${account.created_at}`);
      console.log(`   Course Purchase Count: ${account.course_purchase_count || 0}`);
    });

    // Check for recent orders to find the latest email
    console.log('\n=== Checking Recent Orders ===');

    for (const account of meghnaAccounts) {
      console.log(`\nChecking orders for ${account.email} (ID: ${account.id}):`);

      // Check course enrollments
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', account.id)
        .order('created_at', { ascending: false });

      console.log(`  Course Enrollments: ${enrollments.length}`);
      if (enrollments.length > 0) {
        enrollments.slice(0, 3).forEach(e => {
          console.log(`    - ${e.course_title} (${e.created_at.split('T')[0]})`);
        });
      }

      // Check bookings
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('student_id', account.id)
        .order('created_at', { ascending: false });

      console.log(`  Bookings: ${bookings.length}`);
      if (bookings.length > 0) {
        console.log(`    Most recent booking: ${bookings[0].created_at.split('T')[0]}`);
      }
    }

    // Recommendations
    console.log('\n=== RECOMMENDATIONS ===');
    if (meghnaAccounts.length > 1) {
      // Sort by most recent activity
      const accountsWithActivity = meghnaAccounts.map(account => {
        const enrollments = account.course_purchase_count || 0;
        return { ...account, activity_score: enrollments };
      }).sort((a, b) => b.activity_score - a.activity_score);

      console.log('💡 Suggested primary account (most activity):');
      console.log(`   ${accountsWithActivity[0].first_name} ${accountsWithActivity[0].last_name}`);
      console.log(`   Email: ${accountsWithActivity[0].email}`);
      console.log(`   ID: ${accountsWithActivity[0].id}`);

      console.log('\n💡 Accounts to merge into primary:');
      accountsWithActivity.slice(1).forEach(account => {
        console.log(`   - ${account.email} (ID: ${account.id})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

findMeghnaAccounts().then(() => process.exit());