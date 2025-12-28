require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const { processCoursePurchase } = require('./utils/courseEnrollmentManager');
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

async function cleanupAndSetup() {
  console.log('🧹 CLEANUP AND AUTOMATED SETUP\n');
  console.log('This will:');
  console.log('1. Clear all course_enrollments');
  console.log('2. Clear all class_instances from 2025 onwards');
  console.log('3. Clear all bookings');
  console.log('4. Re-import from Shopify using automated webhook logic\n');
  
  console.log('⚠️  Starting in 3 seconds... (Ctrl+C to cancel)\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 1: Clear course_enrollments
  console.log('🗑️  Step 1: Clearing course_enrollments...');
  const { error: e1 } = await supabase
    .from('course_enrollments')
    .delete()
    .neq('id', 0);
  if (e1) console.error('Error:', e1.message);
  else console.log('✅ Cleared course_enrollments\n');
  
  // Step 2: Clear class_instances from 2025 onwards
  console.log('🗑️  Step 2: Clearing class_instances (2025+)...');
  const { error: e2 } = await supabase
    .from('class_instances')
    .delete()
    .gte('class_date', '2025-01-01');
  if (e2) console.error('Error:', e2.message);
  else console.log('✅ Cleared class_instances\n');
  
  // Step 3: Clear bookings
  console.log('🗑️  Step 3: Clearing all bookings...');
  const { error: e3 } = await supabase
    .from('bookings')
    .delete()
    .neq('id', 0);
  if (e3) console.error('Error:', e3.message);
  else console.log('✅ Cleared bookings\n');
  
  // Step 4: Import from Shopify
  console.log('📦 Step 4: Importing courses from Shopify orders...\n');
  
  const session = {
    shop: process.env.SHOPIFY_SHOP_DOMAIN,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN
  };
  
  const client = new shopify.clients.Graphql({ session });
  
  let hasNextPage = true;
  let cursor = null;
  let allOrders = [];
  
  console.log('   Fetching orders from Shopify...');
  
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
  
  console.log(`   ✅ Found ${allOrders.length} orders\n`);
  
  // Process each order using webhook logic
  console.log('🎓 Processing course purchases...\n');
  
  let coursesProcessed = 0;
  let classesCreated = 0;
  let bookingsCreated = 0;
  
  for (const order of allOrders) {
    const customer = order.customer;
    if (!customer || !customer.email) continue;
    
    for (const lineItemEdge of order.lineItems.edges) {
      const lineItem = lineItemEdge.node;
      const title = lineItem.title;
      const variant = lineItem.variantTitle;
      
      // Check if pottery course
      if (!title.toLowerCase().includes('wheelthrowing') &&
          !title.toLowerCase().includes('handbuilding')) {
        continue;
      }
      
      if (!variant || variant === 'Default Title') {
        continue;
      }
      
      // Prepare order data for webhook processor
      const orderData = {
        id: order.id.split('/').pop(),
        customer: {
          email: customer.email,
          first_name: customer.firstName,
          last_name: customer.lastName
        }
      };
      
      const lineItemData = {
        id: lineItem.id.split('/').pop(),
        title: title,
        variantTitle: variant
      };
      
      console.log(`   📝 ${customer.email}: ${title} - ${variant}`);
      
      try {
        const result = await processCoursePurchase(orderData, lineItemData);
        
        if (result.success) {
          coursesProcessed++;
          
          if (result.thresholdMet) {
            classesCreated += result.classInstancesCreated || 0;
            bookingsCreated += result.bookingsCreated || 0;
            console.log(`      ✅ Threshold met! Created ${result.classInstancesCreated} classes, ${result.bookingsCreated} bookings`);
          } else if (result.requiresThreshold) {
            console.log(`      ⏳ Waiting (${result.studentCount}/${result.studentCount + result.studentsNeeded})`);
          } else {
            classesCreated += result.classInstancesCreated || 0;
            bookingsCreated += result.bookingsCreated || 0;
            console.log(`      ✅ Created immediately (Handbuilding)`);
          }
        } else {
          console.log(`      ❌ Failed: ${result.error}`);
        }
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
    }
  }
  
  console.log('\n\n🎉 SETUP COMPLETE!\n');
  console.log(`📊 Summary:`);
  console.log(`   Course purchases processed: ${coursesProcessed}`);
  console.log(`   Class instances created: ${classesCreated}`);
  console.log(`   Bookings created: ${bookingsCreated}`);
  
  // Show final stats
  const { data: finalClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-01-01')
    .order('class_date');
  
  console.log(`\n   Total classes in system: ${finalClasses?.length || 0}`);
  
  const { count: enrollmentCount } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true });
  
  console.log(`   Total enrollments: ${enrollmentCount || 0}`);
  
  const { data: pending } = await supabase
    .from('course_enrollments')
    .select('course_type, schedule_pattern, class_time, course_start_date')
    .eq('status', 'pending');
  
  if (pending && pending.length > 0) {
    console.log(`\n⏳ Pending courses (waiting for more students):`);
    const grouped = {};
    pending.forEach(p => {
      const key = `${p.course_type} - ${p.schedule_pattern}s ${p.class_time} (${p.course_start_date})`;
      grouped[key] = (grouped[key] || 0) + 1;
    });
    for (const [course, count] of Object.entries(grouped)) {
      console.log(`   ${course}: ${count} students`);
    }
  }
  
  console.log('\n✅ System is now using AUTOMATED WEBHOOK mode!');
  console.log('   New Shopify orders will automatically create courses when 4+ students enroll.\n');
  
  process.exit(0);
}

cleanupAndSetup().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
