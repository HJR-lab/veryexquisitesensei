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

async function syncAllCoursePurchaseCounts() {
  try {
    console.log('🔍 Fetching all Shopify orders...\n');

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

    console.log(`✅ Found ${allOrders.length} total orders\n`);

    // Group orders by customer email
    const ordersByCustomer = {};

    allOrders.forEach(order => {
      if (!order.customer || !order.customer.email) return;

      // Check if order has pottery courses
      const hasPotteryCourse = order.lineItems.edges.some(edge => {
        const title = edge.node.title.toLowerCase();
        return title.includes('wheelthrowing') || title.includes('handbuilding');
      });

      if (!hasPotteryCourse) return;

      const email = order.customer.email.toLowerCase();
      if (!ordersByCustomer[email]) {
        ordersByCustomer[email] = {
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          orders: []
        };
      }

      ordersByCustomer[email].orders.push({
        orderNumber: order.name,
        date: order.createdAt,
        lineItems: order.lineItems.edges.map(e => ({
          title: e.node.title,
          variant: e.node.variantTitle
        }))
      });
    });

    console.log(`📊 Found ${Object.keys(ordersByCustomer).length} customers with pottery course orders\n`);

    // Update each customer's course_purchase_count
    let updatedCount = 0;
    let notFoundCount = 0;

    for (const [email, customerData] of Object.entries(ordersByCustomer)) {
      const orderCount = customerData.orders.length;

      // Get customer from database
      const { data: dbCustomer, error: fetchError } = await supabase
        .from('customers')
        .select('id, first_name, last_name, course_purchase_count')
        .eq('email', email)
        .single();

      if (fetchError || !dbCustomer) {
        console.log(`⚠️  ${customerData.firstName} ${customerData.lastName} (${email}) - Not found in database`);
        notFoundCount++;
        continue;
      }

      // Update if different
      if (dbCustomer.course_purchase_count !== orderCount) {
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            course_purchase_count: orderCount,
            updated_at: new Date().toISOString()
          })
          .eq('id', dbCustomer.id);

        if (updateError) {
          console.error(`❌ Error updating ${dbCustomer.first_name} ${dbCustomer.last_name}:`, updateError.message);
        } else {
          console.log(`✅ Updated ${dbCustomer.first_name} ${dbCustomer.last_name}: ${dbCustomer.course_purchase_count} → ${orderCount} courses`);
          updatedCount++;
        }
      }
    }

    console.log(`\n\n📈 Summary:`);
    console.log(`   Customers updated: ${updatedCount}`);
    console.log(`   Customers not found in DB: ${notFoundCount}`);
    console.log(`   Total customers processed: ${Object.keys(ordersByCustomer).length}`);

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

syncAllCoursePurchaseCounts();
