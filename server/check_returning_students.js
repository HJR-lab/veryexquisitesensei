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

async function checkReturningStudents() {
  const client = getShopifyClient();

  const query = `
    query {
      customers(first: 100) {
        edges {
          node {
            id
            email
            firstName
            lastName
            orders(first: 50) {
              edges {
                node {
                  id
                  createdAt
                  lineItems(first: 10) {
                    edges {
                      node {
                        title
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

  const returningStudents = [];

  response.body.data.customers.edges.forEach(edge => {
    const customer = edge.node;

    // Count how many orders contain courses
    let courseOrderCount = 0;

    customer.orders.edges.forEach(orderEdge => {
      const order = orderEdge.node;

      const hasCourse = order.lineItems.edges.some(itemEdge => {
        const title = itemEdge.node.title.toLowerCase();
        return title.includes('course') ||
               title.includes('workshop') ||
               title.includes('class') ||
               title.includes('pottery') ||
               title.includes('wheel') ||
               title.includes('handbuilding');
      });

      if (hasCourse) {
        courseOrderCount++;
      }
    });

    if (courseOrderCount > 1) {
      returningStudents.push({
        email: customer.email,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        courseOrderCount
      });
    }
  });

  console.log(`\n📊 Returning Students Analysis (first 100 customers):\n`);
  console.log(`Total returning students: ${returningStudents.length}\n`);

  if (returningStudents.length > 0) {
    console.log('Top returning students:');
    returningStudents
      .sort((a, b) => b.courseOrderCount - a.courseOrderCount)
      .slice(0, 10)
      .forEach(s => {
        console.log(`  ${s.email} - ${s.courseOrderCount} courses purchased`);
      });
  }

  process.exit(0);
}

checkReturningStudents().catch(console.error);
