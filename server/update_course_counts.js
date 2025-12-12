require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
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

async function updateCourseCounts() {
  try {
    console.log('🔍 Fetching all orders from Shopify...\n');

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
                customer {
                  email
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      title
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

    console.log(`✅ Found ${allOrders.length} total orders\n`);

    // Count course purchases per customer email
    const customerCourseCounts = {};

    allOrders.forEach(order => {
      if (!order.customer || !order.customer.email) return;

      const email = order.customer.email;

      // Count if this order has a pottery course
      const hasCourse = order.lineItems.edges.some(edge => {
        const title = edge.node.title.toLowerCase();
        return title.includes('wheelthrowing') ||
               title.includes('handbuilding') ||
               title.includes('pottery course');
      });

      if (hasCourse) {
        customerCourseCounts[email] = (customerCourseCounts[email] || 0) + 1;
      }
    });

    console.log(`📊 Found ${Object.keys(customerCourseCounts).length} customers with course purchases\n`);

    // Update database
    let updated = 0;
    for (const [email, count] of Object.entries(customerCourseCounts)) {
      const { error } = await supabase
        .from('customers')
        .update({ course_purchase_count: count })
        .eq('email', email);

      if (!error) {
        console.log(`✅ ${email}: ${count} courses`);
        updated++;
      }
    }

    console.log(`\n🎉 Updated ${updated} customer course counts`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateCourseCounts();
