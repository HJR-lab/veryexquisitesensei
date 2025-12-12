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

async function checkVariantTitles() {
  try {
    const client = getShopifyClient();
    
    // Get recent orders with variantTitle - no need for variant object with read_products
    const query = `
      query {
        orders(first: 10, reverse: true) {
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
    
    console.log('Recent orders with variant titles:\n');
    
    const orders = response.body.data.orders.edges;
    
    orders.forEach(orderEdge => {
      const order = orderEdge.node;
      
      order.lineItems.edges.forEach(lineItemEdge => {
        const item = lineItemEdge.node;
        const titleLower = item.title.toLowerCase();
        
        const isCourse = titleLower.includes('course') ||
               titleLower.includes('workshop') ||
               titleLower.includes('class') ||
               titleLower.includes('pottery') ||
               titleLower.includes('wheel') ||
               titleLower.includes('handbuilding');
        
        if (isCourse) {
          console.log('\n━'.repeat(50));
          console.log('Order:', order.name);
          console.log('Email:', order.email);
          console.log('Order Date:', order.createdAt);
          console.log('Product:', item.title);
          console.log('Variant/Schedule:', item.variantTitle || 'No variant');
        }
      });
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVariantTitles();
