require('dotenv').config();
const fetch = require('node-fetch');
const supabaseDb = require('./utils/supabaseDb');

async function findGeraldine() {
  try {
    // Search for Geraldine in customers
    console.log('Searching for Geraldine Brogden in customers...');
    const { data: customers, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .or('first_name.ilike.%geraldine%,last_name.ilike.%brogden%,email.ilike.%geraldine%');

    if (customerError) throw customerError;

    console.log(`\nFound ${customers.length} matching customers:`);
    customers.forEach(c => {
      console.log(`  - ${c.first_name} ${c.last_name} (${c.email}) - ID: ${c.id}, Shopify: ${c.shopify_customer_id}`);
    });

    // Search Shopify for orders with "Geraldine" or "Brogden"
    console.log('\n\nSearching Shopify for Geraldine Brogden orders...');

    const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    // Fetch orders since Nov 1, 2025 to be comprehensive
    const createdAtMin = new Date('2025-11-01').toISOString();
    const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?status=any&created_at_min=${createdAtMin}&limit=250`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log('Error:', response.status, response.statusText);
      process.exit(1);
    }

    const { orders } = await response.json();
    console.log(`Checking ${orders.length} orders since Nov 1, 2025...\n`);

    const geraldineOrders = [];

    for (const order of orders) {
      const customer = order.customer;
      if (!customer) continue;

      const firstName = customer.first_name?.toLowerCase() || '';
      const lastName = customer.last_name?.toLowerCase() || '';
      const email = customer.email?.toLowerCase() || '';

      if (firstName.includes('geraldine') || lastName.includes('brogden') || email.includes('geraldine')) {
        geraldineOrders.push(order);
      }
    }

    console.log(`\nFound ${geraldineOrders.length} Shopify orders for Geraldine:`);

    geraldineOrders.forEach(order => {
      const customer = order.customer;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Order #${order.order_number} (ID: ${order.id})`);
      console.log(`  Customer: ${customer.first_name} ${customer.last_name}`);
      console.log(`  Email: ${customer.email}`);
      console.log(`  Shopify Customer ID: ${customer.id}`);
      console.log(`  Created: ${order.created_at}`);
      console.log(`  Total: $${order.total_price}`);
      console.log(`  Financial Status: ${order.financial_status}`);
      console.log(`  Fulfillment Status: ${order.fulfillment_status || 'null'}`);
      console.log(`  Line Items:`);
      order.line_items.forEach((item, idx) => {
        console.log(`    ${idx + 1}. ${item.title}`);
        console.log(`       Variant: ${item.variant_title || 'N/A'}`);
        console.log(`       Quantity: ${item.quantity}`);
        console.log(`       SKU: ${item.sku || 'N/A'}`);
        console.log(`       Price: $${item.price}`);
      });
    });

    if (geraldineOrders.length > 0) {
      // Save the most recent order
      const fs = require('fs');
      fs.writeFileSync('./geraldine-brogden-order.json', JSON.stringify(geraldineOrders[0], null, 2));
      console.log('\n✅ Most recent order saved to geraldine-brogden-order.json');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

findGeraldine();
