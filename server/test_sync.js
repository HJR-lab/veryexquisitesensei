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

async function testSync() {
  try {
    console.log('🔄 Starting test Shopify customer sync...\n');
    const client = getShopifyClient();

    let syncedCount = 0;
    let skippedCount = 0;
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;

    while (hasNextPage && pageCount < 1) { // Only process first page for testing
      pageCount++;
      let query, variables;

      if (cursor) {
        query = `
          query getCustomers($cursor: String!) {
            customers(first: 10, after: $cursor) {
              edges {
                node {
                  id
                  email
                  firstName
                  lastName
                  createdAt
                  tags
                  orders(first: 10) {
                    edges {
                      node {
                        id
                        createdAt
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
                cursor
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        `;
        variables = { cursor };
      } else {
        query = `
          query {
            customers(first: 10) {
              edges {
                node {
                  id
                  email
                  firstName
                  lastName
                  createdAt
                  tags
                  orders(first: 10) {
                    edges {
                      node {
                        id
                        createdAt
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
                cursor
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        `;
        variables = {};
      }

      const response = await client.query({
        data: { query, variables }
      });

      const customers = response.body.data.customers.edges;
      console.log(`📦 Processing page ${pageCount} with ${customers.length} customers\n`);

      for (const edge of customers) {
        const customer = edge.node;
        const customerId = customer.id.split('/').pop();

        // Filter: Only sync customers who have purchased courses/workshops/classes
        // Also extract class dates from variantTitle
        let earliestClassStart = null;
        let latestClassEnd = null;
        let hasPurchasedCourse = false;

        // Process all orders to find courses and extract dates
        customer.orders.edges.forEach(orderEdge => {
          orderEdge.node.lineItems.edges.forEach(lineItemEdge => {
            const title = lineItemEdge.node.title.toLowerCase();
            const variantTitle = lineItemEdge.node.variantTitle;

            const isCourse = title.includes('course') ||
                   title.includes('workshop') ||
                   title.includes('class') ||
                   title.includes('pottery') ||
                   title.includes('wheel') ||
                   title.includes('handbuilding');

            if (isCourse) {
              hasPurchasedCourse = true;

              if (variantTitle) {
                console.log(`  📋 Found course: ${lineItemEdge.node.title}`);
                console.log(`     Variant: ${variantTitle}`);

                // Parse dates from variantTitle like "TUESDAYS 21 October –25 November (7:00pm-9:30pm)"
                const dateMatch = variantTitle.match(/(\d{1,2})\s+(\w+)(?:\s*[–-]\s*(\d{1,2})\s+(\w+))?/);

                if (dateMatch) {
                  const monthMap = {
                    'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
                    'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5,
                    'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
                    'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
                  };

                  const currentYear = new Date().getFullYear();
                  const startDay = parseInt(dateMatch[1]);
                  const startMonthStr = dateMatch[2].toLowerCase();
                  const startMonth = monthMap[startMonthStr];

                  if (startMonth !== undefined) {
                    const startDate = new Date(currentYear, startMonth, startDay);

                    if (!earliestClassStart || startDate < earliestClassStart) {
                      earliestClassStart = startDate;
                    }

                    // Check for end date
                    if (dateMatch[3] && dateMatch[4]) {
                      const endDay = parseInt(dateMatch[3]);
                      const endMonthStr = dateMatch[4].toLowerCase();
                      const endMonth = monthMap[endMonthStr];

                      if (endMonth !== undefined) {
                        let endDate = new Date(currentYear, endMonth, endDay);

                        // Handle year wrap
                        if (endDate < startDate) {
                          endDate.setFullYear(currentYear + 1);
                        }

                        if (!latestClassEnd || endDate > latestClassEnd) {
                          latestClassEnd = endDate;
                        }
                      }
                    } else {
                      // If no end date, assume same as start
                      if (!latestClassEnd || startDate > latestClassEnd) {
                        latestClassEnd = startDate;
                      }
                    }

                    console.log(`     ✅ Parsed dates: ${startDate.toISOString().split('T')[0]} to ${latestClassEnd?.toISOString().split('T')[0]}`);
                  }
                } else {
                  console.log(`     ⚠️  Could not parse dates from variant title`);
                }
              }
            }
          });
        });

        // Skip customers who haven't purchased courses
        if (!hasPurchasedCourse) {
          skippedCount++;
          continue;
        }

        try {
          // Pass class dates from Shopify orders
          if (earliestClassStart || latestClassEnd) {
            console.log(`\n📅 ${customer.email}: ${earliestClassStart?.toISOString().split('T')[0]} to ${latestClassEnd?.toISOString().split('T')[0]}`);
          } else {
            console.log(`\n👤 ${customer.email}: No dates found in variant titles`);
          }

          await syncCustomer(customer, customerId, earliestClassStart, latestClassEnd);
          syncedCount++;
        } catch (error) {
          console.error(`❌ Failed to sync customer ${customer.email}:`, error);
        }
      }

      // Update pagination
      hasNextPage = response.body.data.customers.pageInfo.hasNextPage;
      if (hasNextPage && customers.length > 0) {
        cursor = customers[customers.length - 1].cursor;
      }
    }

    console.log(`\n✅ Sync complete!`);
    console.log(`   Synced: ${syncedCount} course purchasers`);
    console.log(`   Skipped: ${skippedCount} non-course customers`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

testSync();
