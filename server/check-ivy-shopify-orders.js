require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkIvyShopifyOrders() {
  try {
    console.log('=== Checking Ivy Shopify Orders ===');

    // Find Ivy
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%ivy%');

    const ivy = customers[0];
    console.log(`Found customer: ${ivy.first_name} ${ivy.last_name}`);
    console.log(`Email: ${ivy.email}`);
    console.log(`Shopify ID: ${ivy.shopify_customer_id}`);

    // Check all Shopify orders for Ivy
    const { data: orders } = await supabase
      .from('shopify_orders')
      .select('*')
      .eq('customer_id', ivy.shopify_customer_id)
      .order('created_at', { ascending: false });

    console.log(`\n=== ALL SHOPIFY ORDERS (${orders.length}) ===`);
    orders.forEach(o => {
      console.log(`\nOrder ${o.order_number}:`);
      console.log(`  Date: ${o.created_at}`);
      console.log(`  Total: $${o.total_price}`);
      console.log(`  Line Items: ${o.line_items || 'null'}`);
      console.log(`  Processed: ${o.processed_at || 'Not processed'}`);

      // Parse line items if they exist
      if (o.line_items) {
        try {
          const items = JSON.parse(o.line_items);
          items.forEach(item => {
            console.log(`    - ${item.title} (Qty: ${item.quantity}) - $${item.price}`);
          });
        } catch (e) {
          console.log(`    - Raw: ${o.line_items}`);
        }
      }
    });

    // Check if any orders contain "3 course" or "package"
    const packageOrders = orders.filter(o => {
      if (!o.line_items) return false;
      const lineItems = o.line_items.toLowerCase();
      return lineItems.includes('3 course') || lineItems.includes('package');
    });

    console.log(`\n=== PACKAGE ORDERS FOUND (${packageOrders.length}) ===`);
    packageOrders.forEach(o => {
      console.log(`  Order ${o.order_number}: ${o.line_items}`);
    });

    // Check current enrollments for context
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', ivy.id)
      .order('created_at', { ascending: false });

    console.log(`\n=== CURRENT ENROLLMENTS (${enrollments.length}) ===`);
    enrollments.forEach(e => {
      console.log(`  - ${e.course_identifier || 'No ID'}: ${e.course_title}`);
      console.log(`    Status: ${e.status}, Created: ${e.created_at}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkIvyShopifyOrders().then(() => process.exit());