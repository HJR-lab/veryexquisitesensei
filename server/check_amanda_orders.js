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

(async () => {
  try {
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
                id
                name
                createdAt
                customer {
                  id
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

    // Filter for Amanda Ang
    const amandaOrders = allOrders.filter(order => {
      const customer = order.customer;
      if (!customer) return false;

      const email = customer.email?.toLowerCase() || '';

      return email.includes('amandaangyanling');
    });

    console.log('Total orders for Amanda Ang:', amandaOrders.length);
    console.log('');

    amandaOrders.forEach((order, idx) => {
      console.log(`Order ${idx + 1}: ${order.name}`);
      console.log('  Date:', order.createdAt);
      console.log('  Email:', order.customer.email);
      console.log('  Line Items:');
      order.lineItems.edges.forEach(edge => {
        const item = edge.node;
        console.log(`    - ${item.title} (qty: ${item.quantity})`);
        if (item.variantTitle) {
          console.log(`      Variant: ${item.variantTitle}`);
        }
      });
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  }

  process.exit(0);
})();
