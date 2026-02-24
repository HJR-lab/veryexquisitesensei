require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const supabaseDb = require('./utils/supabaseDb');

// Initialize Shopify API
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

async function syncJan2026Orders() {
  try {
    console.log('\n🔄 Syncing orders from January 1, 2026 onwards...\n');

    const client = getShopifyClient();
    let allOrders = [];
    let hasNextPage = true;
    let cursor = null;

    // Fetch all orders from Jan 1, 2026
    while (hasNextPage) {
      const query = cursor
        ? `query getOrders($cursor: String!) {
            orders(first: 250, after: $cursor, query: "created_at:>=2026-01-01") {
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
                  lineItems(first: 50) {
                    edges {
                      node {
                        title
                        variantTitle
                        quantity
                      }
                    }
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
              }
            }
          }`
        : `query getOrders {
            orders(first: 250, query: "created_at:>=2026-01-01") {
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
                  lineItems(first: 50) {
                    edges {
                      node {
                        title
                        variantTitle
                        quantity
                      }
                    }
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
              }
            }
          }`;

      const variables = cursor ? { cursor } : {};

      const response = await client.query({
        data: {
          query,
          variables
        }
      });

      const ordersData = response.body.data.orders;
      allOrders = allOrders.concat(ordersData.edges.map(edge => edge.node));
      hasNextPage = ordersData.pageInfo.hasNextPage;
      cursor = ordersData.edges.length > 0
        ? ordersData.edges[ordersData.edges.length - 1].cursor
        : null;

      console.log(`Fetched ${ordersData.edges.length} orders... (Total: ${allOrders.length})`);
    }

    console.log(`\n✅ Fetched ${allOrders.length} orders from Jan 1, 2026\n`);

    // Filter for orders >= #2440
    const filteredOrders = allOrders.filter(order => {
      const orderNumber = parseInt(order.name.replace('#', ''));
      return orderNumber >= 2440;
    });

    console.log(`📊 Found ${filteredOrders.length} orders from #2440 onwards\n`);

    // Sort by order number
    filteredOrders.sort((a, b) => {
      const numA = parseInt(a.name.replace('#', ''));
      const numB = parseInt(b.name.replace('#', ''));
      return numA - numB;
    });

    // Process each order
    let processedCustomers = 0;
    let skippedOrders = 0;

    for (const order of filteredOrders) {
      const orderNumber = order.name;
      const customer = order.customer;

      if (!customer || !customer.email) {
        console.log(`⏭️  ${orderNumber} - No customer email, skipping`);
        skippedOrders++;
        continue;
      }

      // Check for course line items
      const courseItems = order.lineItems.edges
        .map(edge => edge.node)
        .filter(item => {
          const title = item.title.toLowerCase();
          return title.includes('wheelthrowing') ||
                 title.includes('handbuilding') ||
                 title.includes('pottery');
        });

      if (courseItems.length === 0) {
        console.log(`⏭️  ${orderNumber} - ${customer.email} - No course items`);
        skippedOrders++;
        continue;
      }

      console.log(`\n${orderNumber} - ${customer.email}`);
      console.log(`   Created: ${order.createdAt}`);
      courseItems.forEach(item => {
        console.log(`   → ${item.title}`);
      });

      // Check if customer exists
      const { data: existingCustomer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', customer.email)
        .single();

      if (existingCustomer) {
        console.log(`   ✓ Customer already exists (ID: ${existingCustomer.id})`);
        continue;
      }

      // Determine course details from line items
      const courseItem = courseItems[0];
      const title = courseItem.title.toLowerCase();

      let classesAllocated = 6; // Default for WT Beginner
      let courseType = 'wheelthrowing';

      if (title.includes('handbuilding')) {
        classesAllocated = 4;
        courseType = 'handbuilding';
      }

      // Generate unique Shopify ID
      const shopifyId = customer.id.split('/').pop();

      // Create customer
      const { data: newCustomer, error: createError } = await supabaseDb.supabase
        .from('customers')
        .insert({
          shopify_customer_id: shopifyId,
          email: customer.email,
          first_name: customer.firstName || 'Unknown',
          last_name: customer.lastName || 'Student',
          customer_type: 'student',
          course_purchase_date: new Date(order.createdAt).toISOString(),
          course_expiry_date: null, // NO EXPIRY
          classes_allocated: classesAllocated,
          classes_used: 0,
          classes_forfeited: 0,
          course_purchase_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_synced_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error(`   ❌ Error creating customer:`, createError.message);
        continue;
      }

      console.log(`   ✅ Created customer (DB ID: ${newCustomer.id})`);
      console.log(`      Type: ${courseType}`);
      console.log(`      Classes: ${classesAllocated}`);
      processedCustomers++;
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   Total orders found: ${filteredOrders.length}`);
    console.log(`   New customers created: ${processedCustomers}`);
    console.log(`   Orders skipped: ${skippedOrders}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

syncJan2026Orders();
