require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const supabaseDb = require('./utils/supabaseDb');

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

async function checkDoubleOrders() {
  try {
    console.log('\n🔍 Checking for orders with quantity 2 (2 students)...\n');

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

    // Find orders with wheelthrowing quantity 2
    const doubleOrders = [];

    allOrders.forEach(order => {
      order.lineItems.edges.forEach(item => {
        const title = item.node.title;
        const variant = item.node.variantTitle;
        const quantity = item.node.quantity;

        if ((title.toLowerCase().includes('wheelthrowing') || title.toLowerCase().includes('wheel throwing')) && quantity === 2) {
          doubleOrders.push({
            orderName: order.name,
            orderDate: order.createdAt,
            customer: order.customer,
            courseTitle: title,
            courseVariant: variant,
            quantity: quantity
          });
        }
      });
    });

    console.log(`📦 Found ${doubleOrders.length} orders with quantity 2:\n`);

    for (const order of doubleOrders) {
      const date = new Date(order.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      console.log(`Order ${order.orderName} - ${date}`);
      console.log(`   Customer: ${order.customer?.firstName} ${order.customer?.lastName} (${order.customer?.email})`);
      console.log(`   Course: ${order.courseVariant}`);
      console.log(`   Quantity: ${order.quantity} (2 students attending)\n`);

      // Check how many enrollments exist
      const { data: existingEnrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id')
        .eq('shopify_order_id', order.orderName.replace('#', ''));

      console.log(`   Current enrollments in DB: ${existingEnrollments?.length || 0}`);

      if (existingEnrollments && existingEnrollments.length < 2) {
        console.log(`   ⚠️  MISSING ${2 - existingEnrollments.length} enrollment(s)!\n`);
      } else {
        console.log(`   ✅ Correct number of enrollments\n`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Orders with quantity 2: ${doubleOrders.length}`);
    console.log(`   Expected total enrollments: ${doubleOrders.length * 2}`);

  } catch (error) {
    console.error('❌ Error:', error);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }
  }
}

checkDoubleOrders();
