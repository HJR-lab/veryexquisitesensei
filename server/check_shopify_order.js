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

async function checkOrders() {
  try {
    const client = getShopifyClient();
    
    // Get a few recent orders with more details
    const query = `
      query {
        orders(first: 3, reverse: true) {
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
                    quantity
                    customAttributes {
                      key
                      value
                    }
                  }
                }
              }
              customAttributes {
                key
                value
              }
            }
          }
        }
      }
    `;
    
    const response = await client.query({ data: query });
    
    console.log('Recent orders with course purchases:\n');
    console.log(JSON.stringify(response.body.data.orders.edges, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOrders();
