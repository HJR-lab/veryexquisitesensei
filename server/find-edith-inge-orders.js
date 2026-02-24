require('dotenv').config();
const fetch = require('node-fetch');

async function findOrders() {
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  // Fetch recent orders
  const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=2025-11-01T00:00:00Z`;

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  const { orders } = await response.json();

  console.log('Searching for Edith or Inge orders...\n');

  for (const order of orders) {
    const email = order.customer?.email || '';
    const name = `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.toLowerCase();

    if (email.includes('edith') || name.includes('edith') || email.includes('inge') || name.includes('inge')) {
      console.log(`Order #${order.order_number}:`);
      console.log('Customer:', order.customer.first_name, order.customer.last_name);
      console.log('Email:', order.customer.email);
      console.log('Created:', order.created_at.substring(0, 10));

      order.line_items.forEach(item => {
        if (item.title.toLowerCase().includes('wheelthrowing')) {
          console.log('  → ', item.title);
          console.log('      Variant:', item.variant_title);
        }
      });

      console.log();
    }
  }

  process.exit(0);
}

findOrders();
