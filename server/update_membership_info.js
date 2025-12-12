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

async function updateMembershipInfo() {
  try {
    console.log('Finding subscription orders from Shopify\n');

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
                createdAt
                customer {
                  id
                  email
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

    console.log('Found ' + allOrders.length + ' total orders\n');

    const customerMemberships = {};

    allOrders.forEach(order => {
      if (!order.customer || !order.customer.email) return;

      const email = order.customer.email;
      const orderDate = new Date(order.createdAt);

      order.lineItems.edges.forEach(edge => {
        const title = edge.node.title.toLowerCase();
        const variant = edge.node.variantTitle ? edge.node.variantTitle.toLowerCase() : '';

        let membershipMonths = null;

        // Check for Clay Club or Open User Scheme memberships
        const isMembership = title.includes('clay club') ||
                            title.includes('open user scheme') ||
                            title.includes('studio access');

        if (isMembership) {
          if (variant.includes('1 month')) {
            membershipMonths = 1;
          } else if (variant.includes('3 month')) {
            membershipMonths = 3;
          } else if (variant.includes('6 month')) {
            membershipMonths = 6;
          } else if (variant.includes('7 month')) {
            membershipMonths = 7;
          } else if (variant.includes('12 month')) {
            membershipMonths = 12;
          }
        }

        if (membershipMonths) {
          const startDate = orderDate;
          const endDate = new Date(orderDate);
          endDate.setMonth(endDate.getMonth() + membershipMonths);

          if (!customerMemberships[email] || customerMemberships[email].startDate < startDate) {
            customerMemberships[email] = {
              tier: membershipMonths + 'month',
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              months: membershipMonths
            };
          }
        }
      });
    });

    const memberCount = Object.keys(customerMemberships).length;
    console.log('Found ' + memberCount + ' customers with subscriptions\n');

    if (memberCount === 0) {
      console.log('No subscription purchases found\n');
      console.log('Please check Shopify product names for subscriptions');
      process.exit(0);
    }

    let updated = 0;
    for (const email in customerMemberships) {
      const membership = customerMemberships[email];
      const result = await supabase
        .from('customers')
        .update({
          customer_type: 'member',
          membership_tier: membership.tier,
          membership_start_date: membership.startDate,
          membership_end_date: membership.endDate
        })
        .eq('email', email);

      if (!result.error) {
        console.log(email + ': ' + membership.months + ' month membership');
        updated++;
      } else {
        console.log(email + ': Error - ' + result.error.message);
      }
    }

    console.log('\nUpdated ' + updated + ' customer memberships');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateMembershipInfo();
