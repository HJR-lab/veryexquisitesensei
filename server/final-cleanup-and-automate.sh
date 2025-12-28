#!/bin/bash
echo "🧹 VES Pottery Gallery - Cleanup & Automate Setup"
echo "=================================================="
echo ""
echo "This will:"
echo "  1. Delete all course_enrollments"
echo "  2. Delete all class_instances (2025+)"
echo "  3. Delete all bookings  "
echo "  4. Re-import using AUTOMATED webhook logic"
echo ""
echo "Press Enter to continue or Ctrl+C to cancel..."
read

node -e "
const {supabase} = require('./utils/supabaseDb');
const {processCoursePurchase} = require('./utils/courseEnrollmentManager');
const {shopifyApi, LATEST_API_VERSION} = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false
});

(async () => {
  console.log('\n🗑️  Cleaning up...\n');
  
  await supabase.from('course_enrollments').delete().neq('id', 0);
  await supabase.from('class_instances').delete().gte('class_date', '2025-01-01');
  await supabase.from('bookings').delete().neq('id', 0);
  
  console.log('✅ Cleanup complete\n');
  console.log('📦 Fetching Shopify orders...\n');
  
  const client = new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN
    }
  });
  
  const query = \`query { orders(first: 250, query: \"created_at:>=2025-01-01\") { edges { node { id name customer { id email firstName lastName } lineItems(first: 10) { edges { node { id title variantTitle } } } } } } }\`;
  
  const response = await client.query({data: query});
  const orders = response.body.data.orders.edges.map(e => e.node);
  
  console.log(\`✅ Found \${orders.length} orders\n\`);
  console.log('🎓 Processing courses...\n');
  
  let processed = 0;
  for (const order of orders) {
    if (!order.customer) continue;
    
    for (const li of order.lineItems.edges) {
      const item = li.node;
      if (!item.title.toLowerCase().includes('wheelthrowing') && 
          !item.title.toLowerCase().includes('handbuilding')) continue;
      if (!item.variantTitle || item.variantTitle === 'Default Title') continue;
      
      const orderData = {
        id: order.id.split('/').pop(),
        customer: {
          email: order.customer.email,
          first_name: order.customer.firstName,
          last_name: order.customer.lastName
        }
      };
      
      const lineItemData = {
        id: item.id.split('/').pop(),
        title: item.title,
        variantTitle: item.variantTitle
      };
      
      try {
        const result = await processCoursePurchase(orderData, lineItemData);
        if (result.success) {
          processed++;
          console.log(\`  ✅ \${order.customer.email}: \${item.title}\`);
        }
      } catch (e) {
        console.log(\`  ❌ Error: \${e.message}\`);
      }
    }
  }
  
  console.log(\`\n🎉 Setup complete! Processed \${processed} course purchases\n\`);
  process.exit(0);
})();
"
