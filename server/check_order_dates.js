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

async function checkOrderDates() {
  const client = getShopifyClient();

  const query = `
    query {
      customers(first: 5, query: "email:daesiree@gmail.com OR email:francineliew@gmail.com") {
        edges {
          node {
            email
            orders(first: 10) {
              edges {
                node {
                  createdAt
                  lineItems(first: 10) {
                    edges {
                      node {
                        title
                        variantTitle
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await client.query({ data: query });

  console.log('Customer orders with creation dates:\n');

  response.body.data.customers.edges.forEach(edge => {
    const customer = edge.node;
    console.log(`\n${customer.email}:`);

    customer.orders.edges.forEach(orderEdge => {
      const order = orderEdge.node;
      console.log(`\n  Order created: ${order.createdAt}`);

      order.lineItems.edges.forEach(itemEdge => {
        const item = itemEdge.node;
        const title = item.title.toLowerCase();

        if (title.includes('course') || title.includes('workshop') || title.includes('class')) {
          console.log(`    - ${item.title}`);
          console.log(`      Variant: ${item.variantTitle || 'No variant'}`);
        }
      });
    });
  });

  process.exit(0);
}

checkOrderDates().catch(console.error);
