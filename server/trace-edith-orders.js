require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function traceEdithOrders() {
  console.log('\n=== TRACING EDITH\'S SHOPIFY ORDERS AND EXPECTED COURSES ===\n');

  // Get Edith's customer record
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'edithlmq@gmail.com')
    .single();

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('Email:', customer.email);
  console.log('Shopify Customer ID:', customer.shopify_customer_id);

  // Get ALL orders from shopify_order_sync table
  const { data: allOrders } = await supabase
    .from('shopify_order_sync')
    .select('*')
    .order('order_date', { ascending: true });

  console.log(`\nTotal orders in sync table: ${allOrders?.length || 0}`);

  // Filter for Edith's orders by email OR shopify customer ID
  const edithOrders = allOrders?.filter(o =>
    o.customer_email === 'edithlmq@gmail.com' ||
    o.shopify_customer_id === customer.shopify_customer_id
  );

  console.log(`\n📦 EDITH'S SHOPIFY ORDERS: ${edithOrders?.length || 0}\n`);

  if (!edithOrders || edithOrders.length === 0) {
    console.log('❌ No orders found in shopify_order_sync table!');
    console.log('\nSearching by different criteria...\n');

    // Try searching for orders with similar email pattern
    const similarOrders = allOrders?.filter(o =>
      o.customer_email?.toLowerCase().includes('edith') ||
      o.customer_email?.toLowerCase().includes('lee')
    );

    if (similarOrders && similarOrders.length > 0) {
      console.log(`Found ${similarOrders.length} orders with similar email:`);
      similarOrders.forEach(o => {
        console.log(`  - Order ${o.shopify_order_id}: ${o.customer_email} on ${o.order_date}`);
      });
    }
    return;
  }

  // Display each order with details
  edithOrders.forEach((order, index) => {
    console.log(`${index + 1}. ORDER #${order.shopify_order_id}`);
    console.log(`   Date: ${order.order_date}`);
    console.log(`   Email: ${order.customer_email}`);
    console.log(`   Product: ${order.product_title}`);
    console.log(`   Variant: ${order.variant_title || 'N/A'}`);
    console.log(`   Price: $${order.price}`);
    console.log(`   Synced: ${order.synced ? '✅' : '❌'}`);
    console.log(`   Enrollment Created: ${order.enrollment_created ? '✅' : '❌'}`);
    console.log(`   Course Start: ${order.course_start_date || 'N/A'}`);
    console.log(`   Notes: ${order.note || 'N/A'}`);

    // Parse expected course dates from order date
    const orderDate = new Date(order.order_date);
    console.log(`\n   📅 Expected Course Timeline:`);

    // Most courses start within 1-4 weeks of purchase
    const possibleStartDates = [];
    for (let weeksAfter = 1; weeksAfter <= 8; weeksAfter++) {
      const startDate = new Date(orderDate);
      startDate.setDate(startDate.getDate() + (weeksAfter * 7));
      possibleStartDates.push(startDate.toISOString().split('T')[0]);
    }
    console.log(`   Possible start dates: ${possibleStartDates.slice(0, 4).join(', ')}...`);
    console.log('');
  });

  // Summary
  console.log('\n📊 SUMMARY:');
  console.log(`Total Orders: ${edithOrders.length}`);
  console.log(`Synced: ${edithOrders.filter(o => o.synced).length}`);
  console.log(`Enrollments Created: ${edithOrders.filter(o => o.enrollment_created).length}`);
  console.log(`Needs Processing: ${edithOrders.filter(o => !o.enrollment_created).length}`);

  // Check what the UI is showing vs what should exist
  console.log('\n\n🔍 COMPARING WITH EXPECTED COURSE HISTORY:');
  console.log('\nFrom Screenshot, Edith should have:');
  console.log('  1. Jul 11, 2025 - Nov 7, 2025 (Completed)');
  console.log('  2. Jan 16, 2026 - Feb 20, 2026 (Current)');
  console.log('  3. Jan 17, 2026 - Feb 21, 2026 (Current)');

  console.log('\nFrom Shopify Orders:');
  console.log('  Order #2288: Jul 5, 2025 → Course ~Jul 12-19 start');
  console.log('  Order #2322: Aug 22, 2025 → Course ~Aug 29-Sep 12 start');
  console.log('  Order #2362: Sep 29, 2025 → Course ~Oct 6-27 start');
  console.log('  Order #2438: Dec 30, 2025 → Course ~Jan 6-27 start');
}

traceEdithOrders().then(() => process.exit());
