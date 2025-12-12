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

async function checkAllProducts() {
  try {
    console.log('Checking all product names in orders\n');

    const session = {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN
    };

    const client = new shopify.clients.Graphql({ session });

    let hasNextPage = true;
    let cursor = null;
    let allOrders = [];

    while (hasNextPage) {
      const query = `
        query GetOrders($cursor: String) {
          orders(first: 250, after: $cursor, query: "created_at:>=2025-01-01") {
            edges {
              cursor
              node {
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
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const response = await client.query({
        data: {
          query,
          variables: cursor ? { cursor } : {}
        }
      });

      const ordersData = response.body.data.orders;
      allOrders = allOrders.concat(ordersData.edges.map(e => e.node));

      hasNextPage = ordersData.pageInfo.hasNextPage;
      if (hasNextPage && ordersData.edges.length > 0) {
        cursor = ordersData.edges[ordersData.edges.length - 1].cursor;
      }
    }

    const uniqueProducts = new Set();

    allOrders.forEach(order => {
      order.lineItems.edges.forEach(edge => {
        const title = edge.node.title;
        const variant = edge.node.variantTitle || '(no variant)';
        uniqueProducts.add(title + ' | ' + variant);
      });
    });

    console.log('Unique products found:\n');
    Array.from(uniqueProducts).sort().forEach(product => {
      console.log('  ' + product);
    });

    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllProducts();
