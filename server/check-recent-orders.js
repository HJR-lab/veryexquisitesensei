require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false
});

async function checkRecentOrders() {
  console.log('\n📦 CHECKING RECENT ORDERS SINCE NOV 25, 2025\n');
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
        orders(first: 250, after: $cursor, query: "created_at:>=2025-11-25") {
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
      data: { query, variables: cursor ? { cursor } : {} }
    });

    const data = response.body.data.orders;
    const orders = data.edges.map(e => e.node);
    allOrders = allOrders.concat(orders);

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;

    console.log(`   Fetched ${orders.length} orders... (total: ${allOrders.length})`);
  }

  console.log(`\n✅ Found ${allOrders.length} orders since Nov 25, 2025\n`);

  let courseOrders = [];
  allOrders.forEach(order => {
    if (!order.customer) return;
    
    order.lineItems.edges.forEach(edge => {
      const item = edge.node;
      const isPotteryCourse = 
        item.title.toLowerCase().includes('wheelthrowing') ||
        item.title.toLowerCase().includes('handbuilding');
      
      if (isPotteryCourse && item.variantTitle && item.variantTitle !== 'Default Title') {
        const quantity = item.quantity || 1;
        courseOrders.push({
          orderName: order.name,
          orderDate: order.createdAt,
          customer: `${order.customer.firstName} ${order.customer.lastName}`,
          email: order.customer.email,
          course: item.title,
          variant: item.variantTitle,
          quantity: quantity
        });
      }
    });
  });

  console.log(`Found ${courseOrders.length} course line items\n`);
  console.log('Course Orders:\n');

  courseOrders.forEach((order, i) => {
    console.log(`${i + 1}. ${order.customer} (${order.email})`);
    console.log(`   Order: ${order.orderName} - ${order.orderDate.split('T')[0]}`);
    console.log(`   Course: ${order.course}`);
    console.log(`   Variant: ${order.variant}`);
    console.log(`   Quantity: ${order.quantity}${order.quantity > 1 ? ' ⚠️  MULTIPLE' : ''}\n`);
  });

  const courseTypes = {};
  courseOrders.forEach(order => {
    const key = `${order.course} - ${order.variant}`;
    if (!courseTypes[key]) {
      courseTypes[key] = { count: 0, students: [] };
    }
    courseTypes[key].count += order.quantity;
    for (let i = 0; i < order.quantity; i++) {
      courseTypes[key].students.push(order.customer);
    }
  });

  console.log('Summary by Course:\n');
  Object.entries(courseTypes).forEach(([course, data]) => {
    console.log(`${course}`);
    console.log(`   Students: ${data.count}`);
    console.log(`   Names: ${data.students.join(', ')}\n`);
  });

  process.exit(0);
}

checkRecentOrders().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
