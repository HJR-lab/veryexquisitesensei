require('dotenv').config();
const fetch = require('node-fetch');

async function checkOrders() {
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  // Fetch orders from Nov 1, 2025 onwards
  const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=2025-11-01T00:00:00Z`;

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  const { orders } = await response.json();

  console.log('Checking all orders from Nov 1, 2025...\n');

  let wheelthrowingOrders = [];

  for (const order of orders) {
    for (const item of order.line_items) {
      if (item.title.toLowerCase().includes('wheelthrowing') && 
          item.variant_title && 
          item.variant_title.includes('2026')) {
        
        wheelthrowingOrders.push({
          orderNumber: order.order_number,
          orderId: order.id,
          createdAt: order.created_at.substring(0, 10),
          customer: `${order.customer.first_name} ${order.customer.last_name}`,
          email: order.customer.email,
          title: item.title,
          variant: item.variant_title,
          quantity: item.quantity
        });
      }
    }
  }

  console.log('Found', wheelthrowingOrders.length, 'wheelthrowing orders for 2026:\n');
  
  wheelthrowingOrders.sort((a, b) => a.orderNumber - b.orderNumber).forEach(o => {
    console.log(`#${o.orderNumber} (${o.createdAt}): ${o.customer}`);
    console.log(`  ${o.title}`);
    console.log(`  ${o.variant}`);
    console.log(`  Quantity: ${o.quantity}`);
    console.log();
  });

  process.exit(0);
}

checkOrders();
