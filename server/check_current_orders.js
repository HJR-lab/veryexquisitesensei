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

async function checkOrders() {
  try {
    const client = getShopifyClient();
    
    // Get recent orders
    const query = `
      query {
        orders(first: 20, reverse: true) {
          edges {
            node {
              id
              name
              email
              createdAt
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await client.query({ data: query });
    
    console.log('Recent orders with course purchases:\n');
    
    const today = new Date();
    const orders = response.body.data.orders.edges;
    
    orders.forEach(orderEdge => {
      const order = orderEdge.node;
      
      order.lineItems.edges.forEach(lineItemEdge => {
        const title = lineItemEdge.node.title;
        const titleLower = title.toLowerCase();
        
        const isCourse = titleLower.includes('course') ||
               titleLower.includes('workshop') ||
               titleLower.includes('class') ||
               titleLower.includes('pottery') ||
               titleLower.includes('wheel') ||
               titleLower.includes('handbuilding');
        
        if (isCourse) {
          console.log('\n━'.repeat(50));
          console.log('Order:', order.name);
          console.log('Email:', order.email);
          console.log('Order Date:', order.createdAt);
          console.log('Course:', title);
          
          // Parse dates from title
          const dateRangeMatch = title.match(/(\d{1,2})\s+(\w{3})(?:\s*[–-]\s*(\d{1,2})\s+(\w{3}))?/);
          
          if (dateRangeMatch) {
            console.log('Found dates in title:', dateRangeMatch[0]);
            
            const monthMap = {
              'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
              'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
            };
            
            const startDay = parseInt(dateRangeMatch[1]);
            const startMonth = monthMap[dateRangeMatch[2].toLowerCase()];
            const currentYear = today.getFullYear();
            
            const startDate = new Date(currentYear, startMonth, startDay);
            
            let endDate = startDate;
            if (dateRangeMatch[3] && dateRangeMatch[4]) {
              const endDay = parseInt(dateRangeMatch[3]);
              const endMonth = monthMap[dateRangeMatch[4].toLowerCase()];
              endDate = new Date(currentYear, endMonth, endDay);
              
              if (endDate < startDate) {
                endDate.setFullYear(currentYear + 1);
              }
            }
            
            console.log('Start Date:', startDate.toDateString());
            console.log('End Date:', endDate.toDateString());
            
            // Check if ongoing
            if (today >= startDate && today <= endDate) {
              console.log('🔥 STATUS: ONGOING CLASS');
            } else if (today < startDate) {
              console.log('📅 STATUS: UPCOMING CLASS');
            } else {
              console.log('✅ STATUS: COMPLETED CLASS');
            }
          }
        }
      });
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOrders();
