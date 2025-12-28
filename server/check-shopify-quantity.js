/**
 * CHECK SHOPIFY LINE ITEM QUANTITY
 */

require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false
});

async function checkQuantity() {
  console.log('\n🔍 CHECKING SHOPIFY LINE ITEM QUANTITIES\n');

  const client = new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN
    }
  });

  const query = `
    query {
      orders(first: 50, query: "created_at:>=2025-01-01") {
        edges {
          node {
            id
            name
            customer {
              email
            }
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

  const response = await client.query({
    data: { query }
  });

  const orders = response.body.data.orders.edges.map(e => e.node);

  console.log('Sample orders with quantities:\n');

  let foundMultiple = false;
  for (const order of orders) {
    for (const lineItemEdge of order.lineItems.edges) {
      const item = lineItemEdge.node;
      
      const isPotteryCourse =
        item.title.toLowerCase().includes('wheelthrowing') ||
        item.title.toLowerCase().includes('handbuilding');

      if (isPotteryCourse && item.quantity > 1) {
        console.log(`Order ${order.name} - ${order.customer?.email}`);
        console.log(`   ${item.title} - ${item.variantTitle}`);
        console.log(`   Quantity: ${item.quantity}\n`);
        foundMultiple = true;
      }
    }
  }

  if (!foundMultiple) {
    console.log('No orders with quantity > 1 found in first 50 orders.');
  }

  process.exit(0);
}

checkQuantity().catch(console.error);
