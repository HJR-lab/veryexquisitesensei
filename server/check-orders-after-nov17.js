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

async function fetchOrdersAfterNov17() {
  try {
    console.log('\n🔍 Fetching Shopify orders after Nov 17, 2025...\n');

    const client = getShopifyClient();
    const cutoffDate = '2025-11-17T00:00:00Z';

    let allOrders = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const query = `
        query getOrders($cursor: String) {
          orders(first: 250, after: $cursor, query: "created_at:>='${cutoffDate}'", sortKey: CREATED_AT) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                name
                createdAt
                customer {
                  firstName
                  lastName
                  email
                }
                lineItems(first: 10) {
                  edges {
                    node {
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
        data: {
          query,
          variables: cursor ? { cursor } : {}
        }
      });

      const orders = response.body.data.orders.edges.map(edge => edge.node);
      allOrders = allOrders.concat(orders);

      hasNextPage = response.body.data.orders.pageInfo.hasNextPage;
      cursor = response.body.data.orders.pageInfo.endCursor;
    }

    console.log(`✅ Fetched ${allOrders.length} orders\n`);

    // Filter for wheelthrowing courses only
    const wtOrders = allOrders.filter(order =>
      order.lineItems.edges.some(item =>
        item.node.title.toLowerCase().includes('wheelthrowing') ||
        item.node.title.toLowerCase().includes('wheel throwing')
      )
    );

    console.log(`📚 Found ${wtOrders.length} wheelthrowing orders:\n`);

    // Group by course identifier from variant title
    const courseOrders = new Map();

    wtOrders.forEach(order => {
      const date = new Date(order.createdAt);
      const formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      console.log(`\nOrder ${order.name} - ${formattedDate}`);
      console.log(`Customer: ${order.customer?.firstName} ${order.customer?.lastName} (${order.customer?.email})`);

      order.lineItems.edges.forEach(item => {
        const title = item.node.title;
        const variant = item.node.variantTitle;

        if (title.toLowerCase().includes('wheelthrowing') || title.toLowerCase().includes('wheel throwing')) {
          console.log(`  - ${title} | ${variant || 'No variant'}`);

          // Extract course identifier from variant
          if (variant) {
            const courseKey = variant.trim();
            if (!courseOrders.has(courseKey)) {
              courseOrders.set(courseKey, []);
            }
            courseOrders.get(courseKey).push({
              orderName: order.name,
              customer: order.customer,
              createdAt: order.createdAt
            });
          }
        }
      });
    });

    console.log(`\n\n📊 COURSES PURCHASED (grouped by variant):\n`);

    const sortedCourses = Array.from(courseOrders.entries()).sort((a, b) => {
      // Sort by earliest order date
      const aDate = new Date(a[1][0].createdAt);
      const bDate = new Date(b[1][0].createdAt);
      return aDate - bDate;
    });

    sortedCourses.forEach(([courseId, orders], index) => {
      console.log(`${index + 1}. ${courseId} (${orders.length} students)`);
      orders.forEach(o => {
        const date = new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        console.log(`   - ${o.customer?.firstName} ${o.customer?.lastName} (Order ${o.orderName} on ${date})`);
      });
      console.log('');
    });

    console.log(`\n📊 Total unique courses: ${courseOrders.size}`);

  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }
  }
}

fetchOrdersAfterNov17();
