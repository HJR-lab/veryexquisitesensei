require('dotenv').config();
const fetch = require('node-fetch');

async function findRyanLing() {
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  console.log('\n🔍 Searching for Ryan Ling in Shopify orders...\n');

  // Fetch orders since Nov 17, 2025
  const createdAtMin = new Date('2025-11-17').toISOString();
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
  console.log(`Checking ${orders.length} orders...\n`);

  // Search for Ryan Ling
  for (const order of orders) {
    const customer = order.customer;
    if (!customer) continue;

    const fullName = `${customer.first_name} ${customer.last_name}`.toLowerCase();
    
    if (fullName.includes('ryan') && fullName.includes('ling')) {
      console.log('✅ Found Ryan Ling!\n');
      console.log(`Order: #${order.order_number} (${order.name})`);
      console.log(`Date: ${new Date(order.created_at).toLocaleDateString()}`);
      console.log(`Customer: ${customer.first_name} ${customer.last_name}`);
      console.log(`Email: ${customer.email}`);
      console.log(`Shopify Customer ID: ${customer.id}\n`);
      
      console.log('Line Items:');
      order.line_items.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.title}`);
        console.log(`   Variant: ${item.variant_title || 'N/A'}`);
        console.log(`   Quantity: ${item.quantity}`);
        console.log(`   SKU: ${item.sku || 'N/A'}\n`);
      });

      // Save order data for processing
      const fs = require('fs');
      fs.writeFileSync('./ryan-ling-order.json', JSON.stringify(order, null, 2));
      console.log('Order saved to ryan-ling-order.json');

      return order;
    }
  }

  console.log('❌ Ryan Ling not found in orders since Nov 17, 2025');
  return null;
}

findRyanLing().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
