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

async function createBookingsFromShopifyOrders() {
  try {
    console.log('🔍 Fetching Shopify orders...\n');

    // Get all orders from Shopify
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

    console.log(`✅ Found ${allOrders.length} pottery course orders\n`);

    // Get all classes from database
    const { data: allClasses } = await supabase
      .from('class_instances')
      .select('*')
      .order('class_date', { ascending: true });

    let bookingsCreated = 0;

    // Track enrollment counts during this run to avoid over-booking
    // Key format: "class_date_start_time_instructor" -> Set of student IDs
    const courseEnrollments = {};

    // Process each order
    for (const order of allOrders) {
      const customer = order.customer;
      if (!customer || !customer.email) continue;

      console.log(`\n📦 Order ${order.name} - ${customer.email}`);

      // Find customer in database
      const customerIdMatch = customer.id.match(/\d+$/);
      if (!customerIdMatch) continue;

      const shopifyCustomerId = customerIdMatch[0];
      const { data: dbCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('shopify_customer_id', shopifyCustomerId)
        .single();

      if (!dbCustomer) {
        console.log(`   ⚠️  Customer not found in database`);
        continue;
      }

      // Process line items
      for (const lineItemEdge of order.lineItems.edges) {
        const lineItem = lineItemEdge.node;
        const title = lineItem.title;
        const variant = lineItem.variantTitle;

        console.log(`   📝 ${title} - ${variant}`);

        // Skip if not a pottery course
        if (!title.toLowerCase().includes('wheelthrowing') &&
            !title.toLowerCase().includes('handbuilding')) {
          continue;
        }

        // Parse variant to find the course (e.g., "TUESDAYS • 21 Oct – 25 Nov • 7:00pm-9:30pm")
        // Need to match this to our class instances

        // Extract day of week, start time from variant
        const dayMatch = variant.match(/(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)S?/i);
        const timeMatch = variant.match(/(\d+):(\d+)(am|pm)/i);
        const dateMatch = variant.match(/(\d+)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);

        if (!dayMatch || !timeMatch || !dateMatch) {
          console.log(`   ⚠️  Could not parse variant: ${variant}`);
          continue;
        }

        const dayOfWeek = dayMatch[1].toLowerCase();
        const startTime = `${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3].toUpperCase()}`;
        let startDay = parseInt(dateMatch[1]);
        const startMonth = dateMatch[2];

        // Map month name to number
        const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
        const monthNum = monthMap[startMonth.toLowerCase()];

        // SPECIAL CASE: Sept 13 course was pushed to Sept 20 due to low enrollment
        if (monthNum === 9 && startDay === 13 && dayOfWeek === 'saturday' && startTime === '1:00 PM') {
          startDay = 20;
          console.log(`   📝 Mapping Sept 13 -> Sept 20 (course was pushed forward)`);
        }

        console.log(`   🔍 Looking for: ${dayOfWeek} at ${startTime}, starting ${startMonth} ${startDay}`);

        // Create expected start date from variant
        // IMPORTANT: Match the EXACT start date from the Shopify variant
        const currentYear = new Date().getFullYear();
        const expectedStartDate = new Date(`${currentYear}-${String(monthNum).padStart(2, '0')}-${String(startDay).padStart(2, '0')}T00:00:00+08:00`);

        console.log(`   📅 Looking for course starting: ${expectedStartDate.toISOString().split('T')[0]}`);

        const matchingClasses = allClasses.filter(cls => {
          const clsDate = new Date(cls.class_date);

          // Check if start time matches (normalize format - remove all spaces and lowercase)
          const timeMatches = cls.start_time.replace(/\s+/g, '').toLowerCase() === startTime.replace(/\s+/g, '').toLowerCase();

          // Check if day of week matches
          const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
          const expectedDayOfWeek = dayMap[dayOfWeek];
          const actualDayOfWeek = clsDate.getDay();
          const dayOfWeekMatches = expectedDayOfWeek === actualDayOfWeek;

          // Check if class date matches the expected start date exactly
          const dateMatches = clsDate.getDate() === expectedStartDate.getDate() &&
                             clsDate.getMonth() === expectedStartDate.getMonth() &&
                             clsDate.getFullYear() === expectedStartDate.getFullYear();

          // Check if it's a wheelthrowing class (starts with WT) or handbuilding (starts with HB)
          const isPotteryCourse = cls.class_type.toLowerCase().startsWith('wt') ||
                                   cls.class_type.toLowerCase().startsWith('hb');

          return timeMatches && dayOfWeekMatches && dateMatches && isPotteryCourse;
        });

        if (matchingClasses.length === 0) {
          console.log(`   ❌ No matching class found`);
          continue;
        }

        const firstClass = matchingClasses[0];
        console.log(`   ✅ Found course starting ${firstClass.class_date} with ${firstClass.instructor}`);

        // Determine the day of week for the first class
        const firstClassDate = new Date(firstClass.class_date);
        const firstClassDayOfWeek = firstClassDate.getDay();

        // Extract base course identifier (without week number)
        // e.g., "WT1801AM_DL6.1" -> "WT1801AM_DL6"
        const baseIdentifier = firstClass.class_type.substring(0, firstClass.class_type.lastIndexOf('.'));

        // Find all 6 classes in this course (same base identifier)
        const courseClasses = allClasses.filter(cls => {
          const clsDate = new Date(cls.class_date);
          const clsBaseIdentifier = cls.class_type.substring(0, cls.class_type.lastIndexOf('.'));

          return clsBaseIdentifier === baseIdentifier && // Same course!
                 clsDate.getDay() === firstClassDayOfWeek && // Same day of week!
                 clsDate >= firstClassDate; // On or after first class
        }).slice(0, 6);

        // Create a unique key for this course
        const courseKey = `${firstClass.class_date}_${firstClass.start_time}_${firstClass.instructor}`;

        // Initialize enrollment set for this course if not exists
        if (!courseEnrollments[courseKey]) {
          // Get existing enrolled students from database
          const { data: existingBookings } = await supabase
            .from('bookings')
            .select('student_id')
            .eq('class_instance_id', firstClass.id);

          courseEnrollments[courseKey] = new Set(existingBookings.map(b => b.student_id));
        }

        // Check if student is already enrolled
        if (courseEnrollments[courseKey].has(dbCustomer.id)) {
          console.log(`   ℹ️  Student already enrolled in this course`);
          continue;
        }

        // Check if course is full
        const currentEnrollment = courseEnrollments[courseKey].size;
        if (currentEnrollment >= 8) {
          console.log(`   ⚠️  Course is full (${currentEnrollment}/8 students)`);
          continue;
        }

        console.log(`   📚 Booking student into ${courseClasses.length} classes (${currentEnrollment}/8 enrolled)`);

        // Add student to enrollment tracking BEFORE creating bookings
        courseEnrollments[courseKey].add(dbCustomer.id);

        // Create bookings for all 6 classes
        for (const cls of courseClasses) {
          const { error: bookingError } = await supabase
            .from('bookings')
            .insert({
              student_id: dbCustomer.id,
              class_instance_id: cls.id,
              status: new Date(cls.class_date) < new Date() ? 'completed' : 'booked',
              attended: new Date(cls.class_date) < new Date() ? true : null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

          if (bookingError) {
            console.error(`   ❌ Error booking class ${cls.class_date}:`, bookingError.message);
          } else {
            bookingsCreated++;
          }
        }

        console.log(`   ✅ Booked ${customer.firstName} ${customer.lastName} into course`);
      }
    }

    console.log(`\n\n🎉 Created ${bookingsCreated} bookings from Shopify orders`);
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createBookingsFromShopifyOrders();
