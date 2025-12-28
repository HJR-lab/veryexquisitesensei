/**
 * CLEAN DATABASE AND REBUILD FROM 2025 ORDERS ONLY
 */

require('dotenv').config();
const { processCoursePurchase } = require('./utils/courseEnrollmentManager');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
const { supabase } = require('./utils/supabaseDb');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false
});

async function cleanAndRebuild() {
  console.log('\n🧹 CLEANING DATABASE\n');
  console.log('==========================================\n');

  // Delete all bookings
  const { error: bookingsError } = await supabase
    .from('bookings')
    .delete()
    .neq('id', 0); // Delete all

  if (bookingsError) {
    console.error('Error deleting bookings:', bookingsError);
  } else {
    console.log('✅ Deleted all bookings');
  }

  // Delete all class instances
  const { error: classesError } = await supabase
    .from('class_instances')
    .delete()
    .neq('id', 0);

  if (classesError) {
    console.error('Error deleting classes:', classesError);
  } else {
    console.log('✅ Deleted all class instances');
  }

  // Delete all course enrollments
  const { error: enrollmentsError } = await supabase
    .from('course_enrollments')
    .delete()
    .neq('id', 0);

  if (enrollmentsError) {
    console.error('Error deleting enrollments:', enrollmentsError);
  } else {
    console.log('✅ Deleted all course enrollments');
  }

  console.log('\n🔄 FETCHING SHOPIFY ORDERS (2025+ ONLY)\n');
  console.log('==========================================\n');

  const client = new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN
    }
  });

  let allOrders = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        orders(first: 250, after: $cursor, query: "created_at:>=2025-01-01") {
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
        }
      }
    `;

    const response = await client.query({
      data: {
        query,
        variables: cursor ? { cursor } : {}
      }
    });

    const data = response.body.data.orders;
    const orders = data.edges.map(e => e.node);

    allOrders = allOrders.concat(orders);

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;

    console.log(`   Fetched ${orders.length} orders... (total: ${allOrders.length})`);
  }

  console.log(`\n   ✅ Found ${allOrders.length} total orders from 2025+\n`);
  console.log('🎓 Processing courses...\n');

  let processed = 0;
  let skipped = 0;
  let classesCreated = 0;
  let bookingsCreated = 0;

  for (const order of allOrders) {
    if (!order.customer) continue;

    for (const lineItemEdge of order.lineItems.edges) {
      const item = lineItemEdge.node;

      const isPotteryCourse =
        item.title.toLowerCase().includes('wheelthrowing') ||
        item.title.toLowerCase().includes('handbuilding');

      if (!isPotteryCourse) continue;
      if (!item.variantTitle || item.variantTitle === 'Default Title') continue;

      const orderData = {
        id: order.id.split('/').pop(),
        customer: {
          email: order.customer.email,
          first_name: order.customer.firstName,
          last_name: order.customer.lastName
        }
      };

      // Process each quantity as a separate enrollment
      const quantity = item.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        const lineItemData = {
          id: quantity > 1 ? `${item.id.split('/').pop()}-${i + 1}` : item.id.split('/').pop(),
          title: item.title,
          variantTitle: item.variantTitle
        };

        try {
          const result = await processCoursePurchase(orderData, lineItemData);

          if (result.success) {
            processed++;

            if (result.thresholdMet) {
              classesCreated += result.classInstancesCreated || 0;
              bookingsCreated += result.bookingsCreated || 0;
            } else if (result.addedToExistingCohort) {
              bookingsCreated += result.bookingsCreated || 0;
            }
          }
        } catch (error) {
          if (error.message.includes('duplicate') || error.message.includes('unique constraint')) {
            skipped++;
          } else {
            console.error(`   ❌ Error: ${error.message}`);
          }
        }
      }
    }
  }

  console.log('\n\n✅ REBUILD COMPLETE!\n');
  console.log('==========================================\n');
  console.log(`📊 Summary:`);
  console.log(`   Total Shopify orders (2025+): ${allOrders.length}`);
  console.log(`   New enrollments: ${processed}`);
  console.log(`   Skipped (already exist): ${skipped}`);
  console.log(`   Classes created: ${classesCreated}`);
  console.log(`   Bookings created: ${bookingsCreated}\n`);

  process.exit(0);
}

cleanAndRebuild().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
