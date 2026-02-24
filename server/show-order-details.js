require('dotenv').config();
const fetch = require('node-fetch');

async function showOrderDetails() {
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  // Fetch order #2440
  const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?name=%232440&status=any`;

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  const { orders } = await response.json();

  if (orders && orders.length > 0) {
    const order = orders[0];

    console.log('ORDER #2440:\n');
    console.log('Customer:', order.customer.first_name, order.customer.last_name);
    console.log('Email:', order.customer.email);
    console.log('Phone:', order.customer.phone);
    console.log('\nLine Items:\n');

    order.line_items.forEach(item => {
      console.log('Title:', item.title);
      console.log('Variant Title:', item.variant_title);
      console.log('SKU:', item.sku);
      console.log('Quantity:', item.quantity);
      console.log('Product ID:', item.product_id);
      console.log();
    });
  }

  process.exit(0);
}

showOrderDetails();
