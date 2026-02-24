require('dotenv').config();
const fetch = require('node-fetch');

async function showOrders() {
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  // Fetch orders 2439, 2440, 2441
  for (const orderNum of [2439, 2440, 2441]) {
    const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?name=%23${orderNum}&status=any`;

    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    const { orders } = await response.json();

    if (orders && orders.length > 0) {
      const order = orders[0];

      console.log(`\nORDER #${orderNum}:`);
      console.log('Customer:', order.customer.first_name, order.customer.last_name);
      console.log('Email:', order.customer.email);

      order.line_items.forEach(item => {
        if (item.title.toLowerCase().includes('wheelthrowing')) {
          console.log('  → Course:', item.variant_title);
          console.log('     Qty:', item.quantity);
        }
      });
    }
  }

  process.exit(0);
}

showOrders();
