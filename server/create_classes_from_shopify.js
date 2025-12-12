require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
const { parseCourseInfo, createClassInstances, generateCourseIdentifier } = require('./utils/courseScheduler');
require('@shopify/shopify-api/adapters/node');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false
});

async function createClassesFromShopify() {
  try {
    console.log('🗑️  Step 1: Deleting existing class instances...\n');

    const { error: deleteError } = await supabase
      .from('class_instances')
      .delete()
      .neq('id', 0);

    if (deleteError) {
      console.error('❌ Error deleting classes:', deleteError);
      throw deleteError;
    }

    console.log('✅ Deleted all existing classes\n');

    console.log('🔍 Step 2: Fetching all Shopify orders since 2025...\n');

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
                name
                createdAt
                customer {
                  id
                  email
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

    console.log(`✅ Found ${allOrders.length} orders\n`);

    console.log('📅 Step 3: Extracting unique pottery courses from orders...\n');

    const uniqueCourses = new Map(); // Key: "dayOfWeek_startTime_startDate", Value: courseInfo

    for (const order of allOrders) {
      // Use order date to filter out old courses (2024 and earlier)
      const orderDate = new Date(order.createdAt);
      const fourWeeksBefore = new Date(orderDate);
      fourWeeksBefore.setDate(fourWeeksBefore.getDate() - 28); // 4 weeks before
      const fourWeeksAfter = new Date(orderDate);
      fourWeeksAfter.setDate(fourWeeksAfter.getDate() + 28); // 4 weeks after

      for (const lineItemEdge of order.lineItems.edges) {
        const lineItem = lineItemEdge.node;
        const title = lineItem.title;
        const variant = lineItem.variantTitle;

        // Skip if not a pottery course
        if (!title.toLowerCase().includes('wheelthrowing') &&
            !title.toLowerCase().includes('handbuilding')) {
          continue;
        }

        // Skip if no variant or default variant
        if (!variant || variant === 'Default Title') {
          continue;
        }

        console.log(`  📝 Parsing: ${title} - ${variant}`);

        // Replace "nn" with "pm" for noon times in variant title
        const normalizedVariant = variant.replace(/(\d+):(\d+)nn/gi, '$1:$2pm');

        const courseInfo = parseCourseInfo(title, normalizedVariant);

        if (!courseInfo.startDate || !courseInfo.schedulePattern) {
          console.log(`     ⚠️  Could not parse course info`);
          continue;
        }

        // Skip courses outside 4 weeks before/after order date
        // This filters out 2024 courses from being created for 2025 orders
        if (courseInfo.startDate < fourWeeksBefore || courseInfo.startDate > fourWeeksAfter) {
          console.log(`     ⚠️  Course starts ${courseInfo.startDate.toDateString()}, outside 4-week window of order ${orderDate.toDateString()}. Skipping.`);
          continue;
        }

        // Determine instructor based on day and type per CLASS_SCHEDULE_RULES.md
        let instructorName;
        let instructorCode;
        let maxCapacity;
        let room;

        const dayOfWeek = courseInfo.schedulePattern;
        const isHandbuilding = courseInfo.courseType && courseInfo.courseType.toLowerCase().includes('handbuilding');

        // RULE: Lynette Ting teaches Handbuilding on WEDNESDAY ONLY
        if (isHandbuilding) {
          if (dayOfWeek !== 'WEDNESDAY') {
            console.log(`     ⚠️  Handbuilding must be on Wednesday, not ${dayOfWeek}. Skipping.`);
            continue;
          }
          instructorName = 'Lynette Ting';
          instructorCode = 'LT';
          maxCapacity = 10;
          room = 'Studio B';
        }
        // RULE: Dillon Lin teaches Wheelthrowing on WEEKENDS (Saturday, Sunday)
        else if (dayOfWeek === 'SATURDAY' || dayOfWeek === 'SUNDAY') {
          instructorName = 'Dillon Lin';
          instructorCode = 'DL';
          maxCapacity = 8;
          room = dayOfWeek === 'SATURDAY' ? 'Studio C' : 'Studio A';
        }
        // RULE: Joyce Lim teaches Wheelthrowing on WEEKDAYS (Tuesday, Thursday, Friday)
        else if (dayOfWeek === 'TUESDAY' || dayOfWeek === 'THURSDAY' || dayOfWeek === 'FRIDAY') {
          instructorName = 'Joyce Lim';
          instructorCode = 'JL';
          maxCapacity = 8;
          room = dayOfWeek === 'TUESDAY' ? 'Studio A' : 'Studio C';
        }
        // Invalid day of week for any instructor
        else {
          console.log(`     ⚠️  No instructor assigned for ${dayOfWeek}. Skipping.`);
          continue;
        }

        courseInfo.instructor = instructorName;
        courseInfo.instructorCode = instructorCode;
        courseInfo.maxCapacity = maxCapacity;
        courseInfo.room = room;

        // Create unique key for this course
        const courseKey = `${dayOfWeek}_${courseInfo.classTime}_${courseInfo.startDate.toISOString()}_${instructorName}`;

        if (!uniqueCourses.has(courseKey)) {
          uniqueCourses.set(courseKey, courseInfo);
          console.log(`     ✅ New course: ${dayOfWeek} ${courseInfo.classTime} starting ${courseInfo.startDate.toDateString()}`);
        }
      }
    }

    console.log(`\n📊 Found ${uniqueCourses.size} unique courses\n`);

    console.log('🏗️  Step 4: Creating class instances for each course...\n');

    let totalClassesCreated = 0;

    for (const [courseKey, courseInfo] of uniqueCourses) {
      console.log(`\n  📅 Creating classes for: ${courseInfo.schedulePattern} ${courseInfo.classTime}`);
      console.log(`      Instructor: ${courseInfo.instructor}`);
      console.log(`      Start Date: ${courseInfo.startDate.toDateString()}`);
      console.log(`      Duration: ${courseInfo.numberOfWeeks} weeks`);

      const classInstances = createClassInstances(courseInfo, {
        instructorName: courseInfo.instructor,
        instructorCode: courseInfo.instructorCode,
        room: courseInfo.room,
        maxCapacity: courseInfo.maxCapacity,
        startTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[0] : '7:00 PM',
        endTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[1] : '9:30 PM'
      });

      if (classInstances.length === 0) {
        console.log(`     ⚠️  No class instances generated`);
        continue;
      }

      console.log(`     Creating ${classInstances.length} class instances...`);

      for (const classInstance of classInstances) {
        const { error: insertError } = await supabase
          .from('class_instances')
          .insert(classInstance);

        if (insertError) {
          console.error(`     ❌ Error inserting class ${classInstance.class_date}:`, insertError.message);
        } else {
          totalClassesCreated++;
        }
      }

      console.log(`     ✅ Created ${classInstances.length} classes`);
    }

    console.log(`\n\n🎉 Successfully created ${totalClassesCreated} class instances from ${uniqueCourses.size} unique courses!`);

    // Show summary
    const { data: classesByInstructor } = await supabase
      .from('class_instances')
      .select('instructor, class_date')
      .order('class_date', { ascending: true });

    if (classesByInstructor) {
      const instructorCounts = {};
      for (const cls of classesByInstructor) {
        instructorCounts[cls.instructor] = (instructorCounts[cls.instructor] || 0) + 1;
      }

      console.log('\n📊 Classes by instructor:');
      for (const [instructor, count] of Object.entries(instructorCounts)) {
        console.log(`   ${instructor}: ${count} classes`);
      }

      if (classesByInstructor.length > 0) {
        console.log(`\n📅 Date range: ${classesByInstructor[0].class_date} to ${classesByInstructor[classesByInstructor.length - 1].class_date}`);
      }
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createClassesFromShopify();
