require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugIvyOrders() {
  try {
    console.log('=== Debug Ivy Orders ===');

    // Find Ivy
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%ivy%');

    const ivy = customers[0];
    console.log(`Found customer: ${ivy.first_name} ${ivy.last_name}`);
    console.log(`Email: ${ivy.email}`);
    console.log(`Shopify ID: ${ivy.shopify_customer_id}`);

    // Check orders with error handling
    const { data: orders, error } = await supabase
      .from('shopify_orders')
      .select('*')
      .eq('customer_id', ivy.shopify_customer_id);

    if (error) {
      console.log('Error fetching orders:', error);
      return;
    }

    if (!orders) {
      console.log('Orders returned null');
      return;
    }

    console.log(`\nFound ${orders.length} orders`);

    // Check if there are any orders at all for this customer
    const { data: allOrdersForCustomer } = await supabase
      .from('shopify_orders')
      .select('order_number, created_at, line_items, total_price, processed_at')
      .eq('customer_id', ivy.shopify_customer_id);

    console.log(`All orders for customer ${ivy.shopify_customer_id}:`, allOrdersForCustomer);

    // Also check recent orders regardless of customer
    const { data: recentOrders } = await supabase
      .from('shopify_orders')
      .select('customer_id, order_number, created_at, line_items')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\nRecent 5 orders in system:');
    recentOrders.forEach(o => {
      console.log(`  Customer ${o.customer_id}: Order ${o.order_number} - ${o.created_at}`);
      if (o.line_items && o.line_items.includes('course')) {
        console.log(`    Contains course: ${o.line_items}`);
      }
    });

    // Check for any orders containing "3 course" in the entire system
    const { data: packageOrders } = await supabase
      .from('shopify_orders')
      .select('*')
      .ilike('line_items', '%3 course%');

    console.log(`\n=== ALL 3-COURSE PACKAGE ORDERS (${packageOrders.length}) ===`);
    packageOrders.forEach(o => {
      console.log(`  Customer ${o.customer_id}: Order ${o.order_number}`);
      console.log(`    Date: ${o.created_at}`);
      console.log(`    Items: ${o.line_items}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

debugIvyOrders().then(() => process.exit());