require('dotenv').config();
const fetch = require('node-fetch');

const SHOPIFY_STORE = 'pottery-gallery';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function fetchOrdersFrom2440() {
  try {
    console.log('\n🔍 Fetching Shopify orders from last 60 days...\n');

    // Fetch orders from last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const createdAtMin = sixtyDaysAgo.toISOString();

    const response = await fetch(
      `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${createdAtMin}`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('API Error:', response.status, response.statusText);
      console.error('Response:', data);
      return;
    }

    if (!data.orders || data.orders.length === 0) {
      console.log('No orders found');
      console.log('Response data:', JSON.stringify(data, null, 2));
      return;
    }

    // Filter for orders >= 2440
    const ordersFrom2440 = data.orders.filter(order => {
      const orderNumber = parseInt(order.name.replace('#', ''));
      return orderNumber >= 2440;
    });

    console.log(`Found ${ordersFrom2440.length} orders from #2440 onwards\n`);

    // Sort by order number ascending
    ordersFrom2440.sort((a, b) => {
      const numA = parseInt(a.name.replace('#', ''));
      const numB = parseInt(b.name.replace('#', ''));
      return numA - numB;
    });

    // Process each order
    for (const order of ordersFrom2440) {
      const orderNumber = order.name;
      const customer = order.customer;
      const createdAt = order.created_at;

      console.log(`\n${orderNumber} - ${customer.email}`);
      console.log(`Created: ${createdAt}`);

      // Check for course line items
      const courseItems = order.line_items.filter(item => {
        const title = item.title.toLowerCase();
        return title.includes('wheelthrowing') ||
               title.includes('handbuilding') ||
               title.includes('pottery');
      });

      if (courseItems.length > 0) {
        courseItems.forEach(item => {
          console.log(`  → ${item.title}`);
        });
      } else {
        console.log('  (No course items)');
      }
    }

    console.log(`\n\n📊 Total orders to process: ${ordersFrom2440.length}\n`);

  } catch (error) {
    console.error('Error:', error);
  }
}

fetchOrdersFrom2440();
