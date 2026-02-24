require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function syncEdithOrders() {
  console.log('\n=== SYNCING EDITH\'S SHOPIFY ORDERS ===\n');

  // Find Edith's customer ID
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'edithlmq@gmail.com')
    .single();

  if (!customer) {
    console.log('❌ Edith not found');
    return;
  }

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('Customer ID:', customer.id);
  console.log('Email:', customer.email);

  // Check Shopify orders
  const { data: shopifyOrders } = await supabase
    .from('shopify_order_sync')
    .select('*')
    .eq('customer_email', 'edithlmq@gmail.com')
    .order('order_date', { ascending: false });

  console.log('\n📦 Shopify Orders:', shopifyOrders?.length || 0);

  if (!shopifyOrders || shopifyOrders.length === 0) {
    console.log('❌ No Shopify orders found for Edith!');
    console.log('\nThis means Edith\'s orders need to be fetched from Shopify first.');
    console.log('Use the "Sync Shopify" button in the Admin Students page.');
    return;
  }

  shopifyOrders.forEach(order => {
    console.log(`\n  Order #${order.shopify_order_id}`);
    console.log(`   Date: ${order.order_date}`);
    console.log(`   Product: ${order.product_title}`);
    console.log(`   Synced: ${order.synced ? '✅' : '❌'}`);
    console.log(`   Enrollment Created: ${order.enrollment_created ? '✅' : '❌'}`);
  });

  // Check for unprocessed orders
  const unprocessedOrders = shopifyOrders.filter(o => !o.enrollment_created);

  if (unprocessedOrders.length > 0) {
    console.log(`\n\n🔄 Found ${unprocessedOrders.length} orders that need enrollment creation`);
    console.log('These orders need to be processed by the order sync endpoint.');
  } else {
    console.log('\n\n✅ All orders have been processed!');
  }
}

syncEdithOrders().then(() => process.exit());
