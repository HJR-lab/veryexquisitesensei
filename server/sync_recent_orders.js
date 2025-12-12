require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { syncCustomer } = require('./utils/supabaseDb');

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

async function syncRecentOrders() {
  const client = getShopifyClient();

  // Get recent orders from the last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const dateFilter = threeMonthsAgo.toISOString().split('T')[0];

  console.log(`🔄 Syncing course orders from ${dateFilter} onwards...\n`);

  const query = `
    query {
      orders(first: 100, reverse: true, query: "created_at:>=${dateFilter}") {
        edges {
          node {
            id
            name
            email
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
                  title
                  variantTitle
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await client.query({ data: query });

  let syncedCount = 0;
  let skippedCount = 0;

  // Group orders by customer to count total courses per customer
  const customerOrders = {};

  for (const orderEdge of response.body.data.orders.edges) {
    const order = orderEdge.node;

    if (!order.customer) {
      console.log(`⏭️  Skipping order ${order.name} - no customer`);
      skippedCount++;
      continue;
    }

    const customerId = order.customer.id.split('/').pop();
    if (!customerOrders[customerId]) {
      customerOrders[customerId] = {
        customer: order.customer,
        orders: []
      };
    }
    customerOrders[customerId].orders.push(order);
  }

  // Now process each customer with all their orders
  for (const customerId in customerOrders) {
    const { customer, orders } = customerOrders[customerId];

    //Track dates and course count across all orders
    let earliestClassStart = null;
    let latestClassEnd = null;
    let coursePurchaseCount = 0;
    let hasPurchasedCourse = false;

    // Process all orders for this customer
    orders.forEach(order => {
      // Parse order date
      const orderCreatedAt = new Date(order.createdAt);
      const orderYear = orderCreatedAt.getFullYear();
      const orderMonth = orderCreatedAt.getMonth();

      // Track if this order contains a course
      let orderHasCourse = false;

      order.lineItems.edges.forEach(itemEdge => {
      const item = itemEdge.node;
      const title = item.title.toLowerCase();

      const isCourse = title.includes('course') ||
             title.includes('workshop') ||
             title.includes('class') ||
             title.includes('pottery') ||
             title.includes('wheel') ||
             title.includes('handbuilding');

      if (isCourse) {
        hasPurchasedCourse = true;
        orderHasCourse = true;

        if (item.variantTitle) {
          const monthMap = {
            'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
            'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5,
            'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
            'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
          };

          const dateMatch = item.variantTitle.match(/(\d{1,2})\s+(\w+)(?:\s*[–-]\s*(\d{1,2})\s+(\w+))?/);

          if (dateMatch) {
            const startDay = parseInt(dateMatch[1]);
            const startMonthStr = dateMatch[2].toLowerCase();
            const startMonth = monthMap[startMonthStr];

            if (startMonth !== undefined) {
              let classYear = orderYear;
              if (startMonth < orderMonth - 1) {
                classYear = orderYear + 1;
              }

              const startDate = new Date(classYear, startMonth, startDay);

              if (!earliestClassStart || startDate < earliestClassStart) {
                earliestClassStart = startDate;
              }

              // Check for end date
              if (dateMatch[3] && dateMatch[4]) {
                const endDay = parseInt(dateMatch[3]);
                const endMonthStr = dateMatch[4].toLowerCase();
                const endMonth = monthMap[endMonthStr];

                if (endMonth !== undefined) {
                  let endDate = new Date(classYear, endMonth, endDay);

                  if (endDate < startDate) {
                    endDate.setFullYear(classYear + 1);
                  }

                  if (!latestClassEnd || endDate > latestClassEnd) {
                    latestClassEnd = endDate;
                  }
                }
              } else {
                if (!latestClassEnd || startDate > latestClassEnd) {
                  latestClassEnd = startDate;
                }
              }
            }
          }
        }
      }
    });

      // Count this order as a course purchase if it contains a course
      if (orderHasCourse) {
        coursePurchaseCount++;
      }
    });

    if (!hasPurchasedCourse) {
      skippedCount++;
      continue;
    }

    try {
      if (earliestClassStart || latestClassEnd) {
        console.log(`✅ ${customer.email}: ${earliestClassStart?.toISOString().split('T')[0]} to ${latestClassEnd?.toISOString().split('T')[0]} (${coursePurchaseCount} courses)`);
      } else {
        console.log(`⚠️  ${customer.email}: Course found but no dates parsed`);
      }

      await syncCustomer(customer, customerId, earliestClassStart, latestClassEnd, coursePurchaseCount);
      syncedCount++;
    } catch (error) {
      console.error(`❌ Failed to sync ${customer.email}:`, error.message);
    }
  }

  console.log(`\n📊 Sync complete:`);
  console.log(`   ✅ Synced: ${syncedCount} students with course dates`);
  console.log(`   ⏭️  Skipped: ${skippedCount} orders without courses`);

  process.exit(0);
}

syncRecentOrders().catch(console.error);
