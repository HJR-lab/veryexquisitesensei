const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers', 'read_orders'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
  isCustomStoreApp: true,
  adminApiAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
});

// Course schedules from Shopify product page
const courseSchedules = {
  'Tuesday': {
    dates: ['2025-01-20', '2025-01-27', '2025-02-03', '2025-02-10', '2025-02-24', '2025-03-03'], // Skip Feb 17
    startTime: '7:00pm',
    endTime: '9:30pm',
    day: 'TU'
  },
  'Thursday': {
    dates: ['2025-01-22', '2025-01-29', '2025-02-05', '2025-02-12', '2025-02-19', '2025-02-26'],
    startTime: '7:00pm',
    endTime: '9:30pm',
    day: 'TH'
  },
  'Friday': {
    dates: ['2025-01-23', '2025-01-30', '2025-02-06', '2025-02-13', '2025-02-20', '2025-02-27'],
    startTime: '9:30am',
    endTime: '12:00pm',
    day: 'FR'
  },
  'Saturday Morning': {
    dates: ['2025-01-17', '2025-01-24', '2025-01-31', '2025-02-07', '2025-02-14', '2025-02-21'],
    startTime: '9:30am',
    endTime: '12:00pm',
    day: 'SA'
  },
  'Saturday Afternoon': {
    dates: ['2025-01-17', '2025-01-24', '2025-01-31', '2025-02-07', '2025-02-14', '2025-02-21'],
    startTime: '1:00pm',
    endTime: '3:30pm',
    day: 'SA'
  },
  'Sunday': {
    dates: ['2025-01-18', '2025-01-25', '2025-02-01', '2025-02-08', '2025-02-15', '2025-02-22'],
    startTime: '9:30am',
    endTime: '12:00pm',
    day: 'SU'
  }
};

// Map Shopify variant IDs to course schedules
const variantToSchedule = {
  '46101993619614': 'Tuesday',
  '46101993652382': 'Thursday',
  '46101993685150': 'Friday',
  '46101993717918': 'Saturday Morning',
  '46101993750686': 'Saturday Afternoon',
  '46101993783454': 'Sunday'
};

async function importNewCourses() {
  console.log('\n🎨 IMPORTING NEW JANUARY 2025 COURSES\n');

  try {
    // Step 1: Fetch recent orders for the wheelthrowing course product
    console.log('Step 1: Fetching Shopify orders via GraphQL...');
    const productId = 'gid://shopify/Product/8506313687326'; // Wheelthrowing course product ID

    const client = new shopify.clients.Graphql({
      session: {
        shop: process.env.SHOPIFY_SHOP_DOMAIN,
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
      },
    });

    const query = `{
      orders(first: 250, query: "created_at:>='2024-12-01'") {
        edges {
          node {
            id
            name
            email
            createdAt
            displayFinancialStatus
            customer {
              id
              email
              firstName
              lastName
            }
            lineItems(first: 20) {
              edges {
                node {
                  id
                  title
                  variantTitle
                  variant {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }`;

    const response = await client.query({ data: query });
    const orders = response.body.data.orders.edges.map(edge => edge.node);

    console.log(`✅ Fetched ${orders.length} orders\n`);

    // Step 2: Filter orders for the wheelthrowing course
    // Check if line item title contains "Wheelthrowing" or variant matches known IDs
    const courseOrders = [];
    for (const order of orders) {
      for (const lineItemEdge of order.lineItems.edges) {
        const lineItem = lineItemEdge.node;
        const isWheelthrowingCourse = lineItem.title?.includes('Wheelthrowing');

        if (isWheelthrowingCourse) {
          // Extract numeric IDs from GraphQL IDs
          const variantIdMatch = lineItem.variant?.id?.match(/\/ProductVariant\/(\d+)/);
          const customerIdMatch = order.customer?.id?.match(/\/Customer\/(\d+)/);

          courseOrders.push({
            orderId: order.id,
            orderNumber: order.name,
            customerEmail: order.email,
            customerFirstName: order.customer?.firstName,
            customerLastName: order.customer?.lastName,
            customerId: customerIdMatch ? customerIdMatch[1] : null,
            variantId: variantIdMatch ? variantIdMatch[1] : null,
            variantTitle: lineItem.variantTitle,
            lineItemId: lineItem.id,
            createdAt: order.createdAt,
            financialStatus: order.displayFinancialStatus
          });
        }
      }
    }

    console.log(`Found ${courseOrders.length} wheelthrowing course orders\n`);

    // Step 3: Group orders by schedule
    const ordersBySchedule = {};
    for (const order of courseOrders) {
      const schedule = variantToSchedule[order.variantId];
      if (schedule) {
        if (!ordersBySchedule[schedule]) {
          ordersBySchedule[schedule] = [];
        }
        ordersBySchedule[schedule].push(order);
      } else {
        console.log(`⚠️  Unknown variant ID: ${order.variantId} (${order.variantTitle})`);
      }
    }

    console.log('\n📊 Orders by Schedule:');
    for (const [schedule, orders] of Object.entries(ordersBySchedule)) {
      console.log(`  ${schedule}: ${orders.length} students`);
    }
    console.log('');

    // Step 4: Create class instances for each schedule
    let totalClassesCreated = 0;
    let totalEnrollmentsCreated = 0;

    for (const [scheduleName, orders] of Object.entries(ordersBySchedule)) {
      if (orders.length === 0) continue;

      const schedule = courseSchedules[scheduleName];
      console.log(`\n📅 Creating classes for ${scheduleName} (${orders.length} students)...`);

      // Determine instructor based on time/day
      let instructor = 'Dillon Lin'; // Default instructor

      // Generate course identifier (e.g., WT2001TU_DL1)
      // Format: WT[YYMM][DAY]_[INSTRUCTOR][COURSE_NUMBER]
      const startDate = new Date(schedule.dates[0]);
      const year = startDate.getFullYear().toString().slice(2);
      const month = (startDate.getMonth() + 1).toString().padStart(2, '0');
      const courseIdentifier = `WT${year}${month}${schedule.day}_DL1`;

      console.log(`  Course Identifier: ${courseIdentifier}`);

      // Create 6 class instances
      for (let week = 1; week <= 6; week++) {
        const classDate = schedule.dates[week - 1];
        const classType = week === 6
          ? `${courseIdentifier}.${week} - Week ${week}/6 Glazing`
          : `${courseIdentifier}.${week} - Week ${week}/6`;

        const { data: classInstance, error: classError } = await supabase
          .from('class_instances')
          .insert({
            class_date: `${classDate}T00:00:00`,
            start_time: schedule.startTime,
            end_time: schedule.endTime,
            class_type: classType,
            instructor: instructor,
            room: 'Studio A',
            max_capacity: week === 6 ? 14 : 8, // Week 6 glazing has higher capacity
            courseIdentifier: `${courseIdentifier}.${week}`
          })
          .select()
          .single();

        if (classError) {
          console.error(`  ❌ Error creating class for week ${week}:`, classError);
          continue;
        }

        totalClassesCreated++;
        console.log(`  ✅ Created: ${classType} on ${classDate}`);
      }

      // Step 5: Create course enrollments and bookings for each student
      console.log(`\n  Creating enrollments for ${orders.length} students...`);

      for (const order of orders) {
        // Find or create customer
        let customer = null;

        if (order.customerId) {
          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('*')
            .eq('shopify_customer_id', order.customerId)
            .single();

          customer = existingCustomer;
        }

        if (!customer && order.customerEmail) {
          const { data: existingByEmail } = await supabase
            .from('customers')
            .select('*')
            .eq('email', order.customerEmail)
            .single();

          customer = existingByEmail;
        }

        if (!customer) {
          console.log(`  ⚠️  Customer not found for order ${order.orderNumber} (${order.customerEmail})`);
          continue;
        }

        // Create course enrollment
        const { data: enrollment, error: enrollError } = await supabase
          .from('course_enrollments')
          .insert({
            student_id: customer.id,
            course_title: 'Wheelthrowing 6-Week Course',
            course_type: 'wheelthrowing',
            number_of_weeks: 6,
            course_start_date: schedule.dates[0],
            course_end_date: schedule.dates[5],
            instructor: instructor,
            status: 'active',
            shopify_order_id: order.orderId,
            shopify_line_item_id: order.lineItemId
          })
          .select()
          .single();

        if (enrollError) {
          console.error(`  ❌ Error creating enrollment for ${customer.email}:`, enrollError);
          continue;
        }

        totalEnrollmentsCreated++;

        // Create bookings for all 6 weeks
        const { data: classInstances } = await supabase
          .from('class_instances')
          .select('id, class_date, class_type')
          .ilike('class_type', `${courseIdentifier}.%`)
          .order('class_date', { ascending: true });

        for (const classInstance of classInstances) {
          await supabase
            .from('bookings')
            .insert({
              student_id: customer.id,
              class_instance_id: classInstance.id,
              booking_date: new Date().toISOString(),
              status: 'booked',
              attended: false,
              course_enrollment_id: enrollment.id
            });
        }

        console.log(`  ✅ Enrolled: ${customer.first_name} ${customer.last_name} (${customer.email})`);
      }
    }

    // Step 6: Update course_purchase_count for all affected students
    console.log('\n\nStep 6: Updating course_purchase_count...');
    const { data: customers } = await supabase
      .from('customers')
      .select('id');

    for (const customer of customers) {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('id')
        .eq('student_id', customer.id);

      await supabase
        .from('customers')
        .update({ course_purchase_count: enrollments?.length || 0 })
        .eq('id', customer.id);
    }

    console.log('\n=== IMPORT COMPLETE ===');
    console.log(`✅ ${totalClassesCreated} classes created`);
    console.log(`✅ ${totalEnrollmentsCreated} students enrolled`);

  } catch (error) {
    console.error('❌ Error importing courses:', error);
  }
}

importNewCourses();
