require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkCarolineKarynOrders() {
  try {
    // Get Mitchell and Sarah's customer records
    const { data: mitchell } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    const { data: sarah } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx+dup@gmail.com')
      .single();

    console.log('Mitchell Chan:', mitchell.shopify_customer_id);
    console.log('Sarah Chan:', sarah.shopify_customer_id);
    console.log('');

    // Get all orders with Mitchell's Shopify customer ID (Sarah's is fake -dup)
    const { data: orders, error } = await supabaseDb.supabase
      .from('inventory_orders')
      .select('*')
      .eq('shopify_customer_id', mitchell.shopify_customer_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      return;
    }

    if (!orders || orders.length === 0) {
      console.log('No orders found\n');
      return;
    }

    console.log(`Found ${orders.length} orders:\n`);

    orders.forEach(order => {
      console.log(`Order ${order.shopify_order_number} (${order.created_at})`);
      console.log(`  Shopify Customer ID: ${order.shopify_customer_id}`);
      console.log(`  Customer: ${order.customer_first_name || ''} ${order.customer_last_name || ''}`);
      console.log(`  Email: ${order.customer_email}`);
      console.log(`  Total: $${order.total_price_set ? JSON.parse(order.total_price_set).shop_money?.amount : 'N/A'}`);

      // Parse line items
      if (order.line_items) {
        const lineItems = JSON.parse(order.line_items);
        console.log(`  Line Items:`);
        lineItems.forEach(item => {
          console.log(`    - ${item.title || item.name} (Qty: ${item.quantity})`);
        });
      }
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkCarolineKarynOrders();
