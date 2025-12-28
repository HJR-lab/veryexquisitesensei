/**
 * CHECK HANDBUILDING ORDERS FROM SHOPIFY
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

async function checkHBOrders() {
  console.log('\n🔍 CHECKING HANDBUILDING ORDERS FROM NOV/DEC 2024\n');

  const client = new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN
    }
  });

  const query = `
    query {
      orders(first: 250, query: "created_at:>=2024-11-01 AND created_at:<=2024-12-31") {
        edges {
          node {
            id
            name
            createdAt
            customer {
              email
              firstName
              lastName
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

  console.log(`Total orders from Nov/Dec 2024: ${orders.length}\n`);

  let hbOrders = [];
  
  for (const order of orders) {
    for (const lineItemEdge of order.lineItems.edges) {
      const item = lineItemEdge.node;
      
      if (item.title.toLowerCase().includes('handbuilding')) {
        hbOrders.push({
          orderName: order.name,
          date: order.createdAt,
          customer: order.customer?.email,
          title: item.title,
          variant: item.variantTitle,
          quantity: item.quantity
        });
      }
    }
  }

  console.log(`Handbuilding orders: ${hbOrders.length}\n`);

  hbOrders.forEach(o => {
    console.log(`Order ${o.orderName} - ${o.date.split('T')[0]}`);
    console.log(`   ${o.customer}`);
    console.log(`   ${o.title}`);
    console.log(`   Variant: ${o.variant}`);
    console.log(`   Quantity: ${o.quantity}\n`);
  });

  process.exit(0);
}

checkHBOrders().catch(console.error);
