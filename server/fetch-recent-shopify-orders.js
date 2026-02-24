require('dotenv').config();
const fetch = require('node-fetch');
const { processCoursePurchase } = require('./utils/courseEnrollmentManager');

async function fetchRecentOrders() {
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopifyDomain || !accessToken) {
    console.log('Missing Shopify credentials');
    console.log('SHOPIFY_SHOP_DOMAIN:', shopifyDomain);
    console.log('SHOPIFY_ACCESS_TOKEN:', accessToken ? 'present' : 'missing');
    process.exit(1);
  }

  // Fetch orders created in the last 24 hours
  const createdAtMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const url = `https://${shopifyDomain}/admin/api/2024-01/orders.json?status=any&created_at_min=${createdAtMin}&limit=50`;

  console.log('Fetching recent Shopify orders...\n');

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.log('Error fetching orders:', response.status, response.statusText);
    process.exit(1);
  }

  const { orders } = await response.json();

  console.log(`Found ${orders.length} orders in last 24 hours\n`);

  let processed = 0;

  for (const order of orders) {
    console.log(`\nOrder #${order.order_number} - ${order.customer?.email}`);
    console.log(`Created: ${order.created_at}`);

    // Process each line item
    for (const lineItem of order.line_items) {
      const title = lineItem.title.toLowerCase();

      // Only process course products (wheelthrowing or handbuilding)
      if (title.includes('wheelthrowing') || title.includes('handbuilding') || title.includes('pottery')) {
        console.log(`  → ${lineItem.title}`);

        // Only process if variant contains 2026 dates
        const variant = lineItem.variant_title || '';
        if (variant.includes('2026') || variant.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)) {
          console.log(`     Processing...`);

          const result = await processCoursePurchase(order, lineItem);

          if (result.success) {
            processed++;
            console.log(`     ✅ Processed`);
          } else {
            console.log(`     ❌ Error:`, result.error);
          }
        } else {
          console.log(`     ⏭️  Skipped (not a 2026 course)`);
        }
      }
    }
  }

  console.log(`\n\n✅ Processed ${processed} course purchases`);
  process.exit(0);
}

fetchRecentOrders();
