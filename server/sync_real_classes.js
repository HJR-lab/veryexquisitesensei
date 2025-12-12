require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
const { parseCourseInfo, createClassInstances } = require('./utils/courseScheduler');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_products', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false
});

// Instructor mapping
const INSTRUCTOR_MAP = {
  'Joyce Lim': 'JL',
  'Dillon Lin': 'DL',
  'Lynette Ting': 'LT'
};

async function syncRealClassesFromShopify() {
  try {
    console.log('🗑️  Step 1: Deleting all fake seed classes...\n');

    // Delete all existing classes
    const { error: deleteError } = await supabase
      .from('class_instances')
      .delete()
      .neq('id', 0);  // Delete all records

    if (deleteError) {
      console.error('❌ Error deleting classes:', deleteError);
      throw deleteError;
    }

    console.log('✅ All fake classes deleted\n');

    console.log('🔍 Step 2: Fetching pottery course products from Shopify...\n');

    const session = {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN
    };

    const client = new shopify.clients.Graphql({ session });

    let hasNextPage = true;
    let cursor = null;
    let allProducts = [];

    // Fetch all products
    while (hasNextPage) {
      const query = `
        query GetProducts($cursor: String) {
          products(first: 250, after: $cursor, query: "title:*wheelthrowing* OR title:*handbuilding*") {
            edges {
              cursor
              node {
                id
                title
                status
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      price
                      inventoryQuantity
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

      const productsData = response.body.data.products;
      allProducts = allProducts.concat(productsData.edges.map(e => e.node));

      hasNextPage = productsData.pageInfo.hasNextPage;
      if (hasNextPage && productsData.edges.length > 0) {
        cursor = productsData.edges[productsData.edges.length - 1].cursor;
      }
    }

    console.log(`✅ Found ${allProducts.length} pottery course products\n`);

    console.log('📅 Step 3: Creating class instances from course products...\n');

    let totalClassesCreated = 0;
    const createdClasses = [];

    for (const product of allProducts) {
      // Skip if product is not active
      if (product.status !== 'ACTIVE') {
        continue;
      }

      const productTitle = product.title;
      console.log(`\n📦 Product: ${productTitle}`);

      // Process each variant (represents a specific course schedule)
      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const variantTitle = variant.title;

        if (variantTitle === 'Default Title') {
          continue;
        }

        console.log(`  📝 Variant: ${variantTitle}`);

        // Parse course info from product and variant title
        const courseInfo = parseCourseInfo(productTitle, variantTitle);

        if (!courseInfo.startDate || !courseInfo.schedulePattern) {
          console.log(`  ⚠️  Could not parse course info`);
          continue;
        }

        // Determine instructor based on day of week and time
        let instructorName = 'Joyce Lim';  // Default
        let instructorCode = 'JL';
        let room = 'Studio A';
        let maxCapacity = 8;

        const dayOfWeek = courseInfo.schedulePattern;
        const classTime = courseInfo.classTime || '';

        // Handbuilding is always Lynette on Wednesday
        if (courseInfo.courseType && courseInfo.courseType.toLowerCase().includes('handbuilding')) {
          instructorName = 'Lynette Ting';
          instructorCode = 'LT';
          maxCapacity = 10;
        }
        // Dillon Lin teaches weekends
        else if (dayOfWeek === 'SATURDAY' || dayOfWeek === 'SUNDAY') {
          instructorName = 'Dillon Lin';
          instructorCode = 'DL';
        }
        // Joyce Lim teaches weekdays (Tuesday, Thursday, Friday)
        else if (dayOfWeek === 'TUESDAY' || dayOfWeek === 'THURSDAY' || dayOfWeek === 'FRIDAY') {
          instructorName = 'Joyce Lim';
          instructorCode = 'JL';
        }

        // Create class instances
        const classInstances = createClassInstances(courseInfo, {
          instructorName,
          instructorCode,
          room,
          maxCapacity,
          startTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[0] : '7:00 PM',
          endTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[1] : '9:30 PM'
        });

        if (classInstances.length === 0) {
          console.log(`  ⚠️  No class instances generated`);
          continue;
        }

        console.log(`  ✅ Generated ${classInstances.length} class instances`);

        // Insert into database
        for (const classInstance of classInstances) {
          const { error: insertError } = await supabase
            .from('class_instances')
            .insert(classInstance);

          if (insertError) {
            console.error(`  ❌ Error inserting class:`, insertError.message);
          } else {
            totalClassesCreated++;
            createdClasses.push(classInstance);
          }
        }
      }
    }

    console.log(`\n\n🎉 Successfully created ${totalClassesCreated} real class instances from Shopify!`);
    console.log(`\nSample classes created:`);
    createdClasses.slice(0, 5).forEach(cls => {
      console.log(`  - ${cls.class_date} ${cls.start_time} | ${cls.class_type} | ${cls.instructor}`);
    });

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

syncRealClassesFromShopify();
