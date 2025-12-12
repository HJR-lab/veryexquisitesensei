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

async function checkVariants() {
  try {
    const client = getShopifyClient();
    
    // Get recent orders with full line item details including variant info
    const query = `
      query {
        orders(first: 5, reverse: true) {
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
                    customAttributes {
                      key
                      value
                    }
                    variant {
                      id
                      title
                      selectedOptions {
                        name
                        value
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
    
    console.log('Recent orders with variant details:\n');
    console.log(JSON.stringify(response.body.data.orders.edges, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVariants();
