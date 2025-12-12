require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

function getShopifyClient() {
  return new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });
}

async function checkRecentOrders() {
  const client = getShopifyClient();

  // Get recent orders from the last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const dateFilter = threeMonthsAgo.toISOString().split('T')[0];

  const query = `
    query {
      orders(first: 50, reverse: true, query: "created_at:>=${dateFilter}") {
        edges {
          node {
            id
            name
            email
            createdAt
            lineItems(first: 10) {
              edges {
                node {
                  id
                  title
                  variantTitle
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await client.query({ data: query });

  console.log(`Orders created since ${dateFilter}:\n`);
  console.log('='.repeat(80));

  let courseOrderCount = 0;

  response.body.data.orders.edges.forEach(orderEdge => {
    const order = orderEdge.node;

    // Check if order contains courses
    const courseItems = [];

    order.lineItems.edges.forEach(itemEdge => {
      const item = itemEdge.node;
      const title = item.title.toLowerCase();

      if (title.includes('course') ||
          title.includes('workshop') ||
          title.includes('class') ||
          title.includes('pottery') ||
          title.includes('wheel') ||
          title.includes('handbuilding')) {
        courseItems.push(item);
      }
    });

    if (courseItems.length > 0) {
      courseOrderCount++;
      console.log(`\nOrder ${order.name} - ${order.email}`);
      console.log(`Created: ${order.createdAt}`);
      console.log('Courses purchased:');

      courseItems.forEach(item => {
        console.log(`  - ${item.title}`);
        console.log(`    Schedule: ${item.variantTitle || 'No schedule specified'}`);
      });
      console.log('-'.repeat(80));
    }
  });

  console.log(`\nTotal course orders found: ${courseOrderCount}`);
  process.exit(0);
}

checkRecentOrders().catch(console.error);
