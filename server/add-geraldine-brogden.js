require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function addGeraldine() {
  try {
    console.log('Adding Geraldine Brogden...\n');

    // Step 1: Create customer record
    console.log('Step 1: Creating customer record...');
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .insert({
        email: 'gbr@uwcsea.edu.sg',
        first_name: 'Geraldine',
        last_name: 'Brogden',
        shopify_customer_id: '9041866850462',
        customer_type: 'student',
        classes_allocated: 6,
        course_purchase_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (customerError) {
      // Check if customer already exists
      if (customerError.code === '23505') {
        console.log('Customer already exists, fetching existing record...');
        const { data: existing, error: fetchError } = await supabaseDb.supabase
          .from('customers')
          .select('*')
          .eq('email', 'gbr@uwcsea.edu.sg')
          .single();

        if (fetchError) throw fetchError;
        console.log(`✓ Found existing customer: ${existing.first_name} ${existing.last_name} (ID: ${existing.id})`);

        // Update to 6 classes if needed
        if (existing.classes_allocated !== 6) {
          await supabaseDb.supabase
            .from('customers')
            .update({ classes_allocated: 6, course_purchase_count: 1 })
            .eq('id', existing.id);
          console.log('✓ Updated classes_allocated to 6');
        }

        return existing;
      }
      throw customerError;
    }

    console.log(`✓ Customer created: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})`);
    console.log(`  Email: ${customer.email}`);
    console.log(`  Shopify ID: ${customer.shopify_customer_id}`);
    console.log(`  Classes Allocated: ${customer.classes_allocated}`);

    console.log('\n✅ Geraldine Brogden added successfully!');
    console.log('\nNext steps:');
    console.log('1. She has 6 class credits available');
    console.log('2. She can book classes through the student portal');
    console.log('3. Or you can manually enroll her in specific classes through the admin panel');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

addGeraldine();
