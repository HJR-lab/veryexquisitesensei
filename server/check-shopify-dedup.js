require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkShopifyDedup() {
  try {
    // Get all customers
    const { data: allCustomers } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('customer_type', 'student');

    // Group by shopify_customer_id
    const shopifyGroups = {};
    allCustomers.forEach(c => {
      const shopifyId = c.shopify_customer_id;
      if (!shopifyGroups[shopifyId]) {
        shopifyGroups[shopifyId] = [];
      }
      shopifyGroups[shopifyId].push(c);
    });

    // Find duplicates
    const duplicates = Object.entries(shopifyGroups).filter(([_, customers]) => customers.length > 1);

    console.log(`Total students: ${allCustomers.length}`);
    console.log(`Duplicate Shopify IDs: ${duplicates.length}\n`);

    // Check Mitchell's Shopify ID
    const mitchellShopifyId = '8964639555742';
    const group = shopifyGroups[mitchellShopifyId];

    if (group) {
      console.log(`Shopify ID ${mitchellShopifyId} has ${group.length} accounts:\n`);
      group.forEach(c => {
        console.log(`  ${c.first_name} ${c.last_name} (DB ID: ${c.id})`);
        console.log(`    Email: ${c.email}`);
        console.log(`    Shopify ID: ${c.shopify_customer_id}`);
        console.log(`    Course Purchase Count: ${c.course_purchase_count}`);
        console.log('');
      });

      console.log('❓ If backend deduplicates by Shopify ID, only ONE would appear in the list');
      console.log('   The system might be choosing based on course_purchase_count or another criteria\n');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkShopifyDedup();
